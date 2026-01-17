/**
 * File purpose: manage custom tool registration, validation, and MCP server creation for SDK
 * in-process tools.
 *
 * Core exports:
 * - CustomToolManager: registers tools/modules, validates definitions, and builds MCP servers.
 *
 * Core methods:
 * - registerTool(): register a single custom tool.
 * - registerModule(): register a module of tools.
 * - createMcpServer(): build an MCP server for a module.
 * - createMcpServers(): build MCP server configs for all modules.
 * - registerMcpServers(): register MCP servers with SDK executor and log results.
 * - getToolNames(): list registered tool names.
 * - getToolNamesByModule(): list tool names for a module.
 * - validateToolDefinition(): validate a tool definition.
 */

import {
  createSdkMcpServer,
  tool as sdkTool,
  type McpServerConfig,
} from '@anthropic-ai/claude-agent-sdk';
import type { ZodRawShape } from 'zod';

import { CustomToolRegistry } from './CustomToolRegistry';
import type { CustomToolManagerOptions, ToolDefinition, ValidationResult } from './types';
import { Logger } from '../logging/Logger';
import { SDKQueryExecutor } from '../sdk/SDKQueryExecutor';

const DEFAULT_SERVER_NAME_PREFIX = process.env.CUSTOM_TOOL_SERVER_NAME_PREFIX ?? 'custom-tools';
const DEFAULT_SERVER_VERSION = process.env.CUSTOM_TOOL_SERVER_VERSION ?? '1.0.0';
const DEFAULT_MODULE_SEPARATOR = process.env.CUSTOM_TOOL_MODULE_SEPARATOR ?? '-';

const TOOL_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const MODULE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*(\/[a-zA-Z0-9_-]+)*$/;
const EMPTY_SCHEMA: ZodRawShape = {};

export class CustomToolManager {
  private readonly registry: CustomToolRegistry;
  private readonly serverNamePrefix: string;
  private readonly serverVersion: string;
  private readonly moduleSeparator: string;
  private initialized: boolean = false;

  constructor(options: CustomToolManagerOptions = {}, registry?: CustomToolRegistry) {
    this.registry = registry ?? new CustomToolRegistry();
    this.serverNamePrefix = options.serverNamePrefix ?? DEFAULT_SERVER_NAME_PREFIX;
    this.serverVersion = options.serverVersion ?? DEFAULT_SERVER_VERSION;
    this.moduleSeparator = DEFAULT_MODULE_SEPARATOR;
  }

  /**
   * Initialize the custom tool manager.
   *
   * Loads tool modules from configuration and registers built-in tools.
   * This method is idempotent - calling it multiple times has no effect after the first call.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.registerBuiltInTools();
    this.initialized = true;
  }

  /**
   * Register built-in custom tools.
   * Loads tools from multiple folders specified by CUSTOM_TOOL_MODULES environment variable.
   * This maintains backward compatibility with the previous hardcoded approach.
   */
  private async registerBuiltInTools(): Promise<void> {
    try {
      // Parse the CUSTOM_TOOL_MODULES environment variable (comma-separated list)
      // Default to 'math' for backward compatibility
      const modulesEnv = process.env.CUSTOM_TOOL_MODULES ?? 'math';
      const folderNames = modulesEnv
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);

      // Process each folder
      for (const folderName of folderNames) {
        try {
          // Dynamically import the module from the folder
          const modulePath = `./${folderName}/index`;
          const module = await import(modulePath);

          // Extract tools from the module (filter for valid tool definitions)
          const tools = Object.values(module).filter(
            (tool): tool is ToolDefinition =>
              typeof tool === 'object' &&
              tool !== null &&
              'name' in tool &&
              'description' in tool &&
              'module' in tool &&
              'schema' in tool &&
              'handler' in tool
          );

          if (tools.length === 0) {
            console.warn(`No tools found in module: ${folderName}`);
            continue;
          }

          // Register the module with the folder name as moduleName
          const registration = this.registerModule(folderName, tools as ToolDefinition[]);
          if (!registration.valid) {
            console.warn(`Failed to register tools from ${folderName}:`, registration.errors);
          }
        } catch (error) {
          // Log error but don't throw - allows app to continue with other modules
          console.warn(`Failed to load tools from folder ${folderName}:`, error);
        }
      }
    } catch (error) {
      // Log error but don't throw - this allows the app to continue without custom tools
      console.warn('Failed to register built-in custom tools:', error);
    }
  }

  registerTool(tool: ToolDefinition): ValidationResult {
    const validation = this.validateToolDefinition(tool);
    if (!validation.valid) {
      return validation;
    }

    this.registry.register(tool);
    return validation;
  }

  registerModule(moduleName: string, tools: ToolDefinition[]): ValidationResult {
    const errors: ValidationResult['errors'] = [];

    if (!this.isValidModuleName(moduleName)) {
      errors.push({
        field: 'module',
        message: 'Module name must be non-empty and use letters, numbers, "-", "_" or "/"',
      });
    }

    if (!Array.isArray(tools)) {
      errors.push({
        field: 'tools',
        message: 'Module tools must be an array of tool definitions',
      });
      return { valid: false, errors };
    }

    const normalizedTools = tools.map((tool) => this.normalizeToolDefinition(tool, moduleName));
    normalizedTools.forEach((tool, index) => {
      const result = this.validateToolDefinition(tool);
      if (!result.valid) {
        errors.push(
          ...result.errors.map((error) => ({
            field: `tools[${index}].${error.field}`,
            message: error.message,
          }))
        );
      }
    });

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    this.registry.registerModule(moduleName, normalizedTools);
    return { valid: true, errors: [] };
  }

  createMcpServer(moduleName: string): McpServerConfig | null {
    const tools = this.registry.getByModule(moduleName);
    if (tools.length === 0) {
      return null;
    }

    const serverName = this.buildServerName(moduleName);
    const sdkTools = tools.map((tool) =>
      sdkTool(
        tool.name,
        tool.description,
        this.normalizeToolSchema(tool.schema),
        async (args, _extra) => tool.handler(args)
      )
    );

    return createSdkMcpServer({
      name: serverName,
      version: this.serverVersion,
      tools: sdkTools,
    });
  }

  createMcpServers(): Record<string, McpServerConfig> {
    const servers: Record<string, McpServerConfig> = {};

    for (const moduleName of this.getModuleNames()) {
      const serverConfig = this.createMcpServer(moduleName);
      if (!serverConfig) {
        continue;
      }
      servers[this.buildServerName(moduleName)] = serverConfig;
    }

    return servers;
  }

  /**
   * Register MCP servers with the SDK executor and log the results.
   * This encapsulates the registration logic to keep main methods concise.
   *
   * @param sdkExecutor - The SDK executor to register servers with
   * @param logger - The logger for recording registration status
   */
  async registerMcpServers(sdkExecutor: SDKQueryExecutor, logger: Logger): Promise<void> {
    const customMcpServers = this.createMcpServers();

    if (Object.keys(customMcpServers).length > 0) {
      sdkExecutor.setCustomMcpServers(customMcpServers);
      await logger.info('Custom tool MCP servers registered', {
        servers: Object.keys(customMcpServers),
      });
    } else {
      await logger.warn('No custom MCP servers created');
    }
  }

  getToolNames(): string[] {
    return this.registry.getAll().map((tool) => tool.name);
  }

  getToolNamesByModule(moduleName: string): string[] {
    return this.registry.getByModule(moduleName).map((tool) => tool.name);
  }

  validateToolDefinition(tool: ToolDefinition): ValidationResult {
    const errors: ValidationResult['errors'] = [];

    if (!tool || typeof tool !== 'object') {
      errors.push({ field: 'tool', message: 'Tool definition must be an object' });
      return { valid: false, errors };
    }

    if (!tool.name || typeof tool.name !== 'string') {
      errors.push({ field: 'name', message: 'Tool name must be a non-empty string' });
    } else if (!TOOL_NAME_PATTERN.test(tool.name)) {
      errors.push({
        field: 'name',
        message: 'Tool name must start with a letter and use letters, numbers, "-" or "_"',
      });
    }

    if (!tool.description || typeof tool.description !== 'string') {
      errors.push({ field: 'description', message: 'Tool description must be a non-empty string' });
    }

    if (!tool.module || typeof tool.module !== 'string') {
      errors.push({ field: 'module', message: 'Tool module must be a non-empty string' });
    } else if (!this.isValidModuleName(tool.module)) {
      errors.push({
        field: 'module',
        message: 'Tool module must use letters, numbers, "-", "_" or "/"',
      });
    }

    if (!tool.schema || typeof tool.schema !== 'object') {
      errors.push({ field: 'schema', message: 'Tool schema must be an object' });
    }

    if (typeof tool.handler !== 'function') {
      errors.push({ field: 'handler', message: 'Tool handler must be a function' });
    }

    if (tool.dangerous !== undefined && typeof tool.dangerous !== 'boolean') {
      errors.push({ field: 'dangerous', message: 'Tool dangerous flag must be a boolean' });
    }

    if (tool.metadata) {
      if (tool.metadata.author !== undefined && typeof tool.metadata.author !== 'string') {
        errors.push({ field: 'metadata.author', message: 'Tool author must be a string' });
      }
      if (tool.metadata.version !== undefined && typeof tool.metadata.version !== 'string') {
        errors.push({ field: 'metadata.version', message: 'Tool version must be a string' });
      }
      if (
        tool.metadata.tags !== undefined &&
        (!Array.isArray(tool.metadata.tags) ||
          tool.metadata.tags.some((tag) => typeof tag !== 'string'))
      ) {
        errors.push({ field: 'metadata.tags', message: 'Tool tags must be string array' });
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private getModuleNames(): string[] {
    const modules = new Set<string>();
    for (const tool of this.registry.getAll()) {
      modules.add(tool.module);
    }
    return Array.from(modules);
  }

  private buildServerName(moduleName: string): string {
    const normalizedModule = moduleName.replace(/\//g, this.moduleSeparator);
    if (!this.serverNamePrefix) {
      return normalizedModule;
    }
    return `${this.serverNamePrefix}${this.moduleSeparator}${normalizedModule}`;
  }

  private isValidModuleName(moduleName: string): boolean {
    return Boolean(moduleName && MODULE_NAME_PATTERN.test(moduleName));
  }

  private normalizeToolDefinition(tool: ToolDefinition, moduleName: string): ToolDefinition {
    if (tool.module === moduleName) {
      return tool;
    }
    return { ...tool, module: moduleName };
  }

  private normalizeToolSchema(schema: unknown): ZodRawShape {
    if (!schema || typeof schema !== 'object') {
      return EMPTY_SCHEMA;
    }

    if ('shape' in schema) {
      const shape = (schema as { shape?: ZodRawShape }).shape;
      if (shape && typeof shape === 'object') {
        return shape;
      }
    }

    return schema as ZodRawShape;
  }
}
