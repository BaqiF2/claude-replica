/**
 * File purpose: manage custom tool registration and module mappings for in-process MCP tools.
 *
 * Core exports:
 * - CustomToolRegistry: registers, queries, and removes custom tools grouped by module.
 *
 * Core methods:
 * - register(): store a tool definition and update module mappings.
 * - registerModule(): register multiple tools under a shared module name.
 * - get(): fetch a tool definition by name.
 * - getAll(): list all registered tools.
 * - getByModule(): list tools for a module.
 * - has(): check whether a tool name is registered.
 * - remove(): delete a tool and update module mappings.
 * - clear(): remove all tools and modules.
 */

import type { ToolDefinition } from './types';

const shouldRemoveModule = (toolsInModule: Set<string>): boolean =>
  toolsInModule.values().next().done === true;

/**
 * Custom tool registry.
 *
 * Stores tool definitions and provides module-based lookup.
 */
export class CustomToolRegistry {
  private readonly tools: Map<string, ToolDefinition>;
  private readonly moduleMap: Map<string, Set<string>>;

  constructor() {
    this.tools = new Map();
    this.moduleMap = new Map();
  }

  /**
   * Register a tool definition.
   */
  register(tool: ToolDefinition): void {
    const existing = this.tools.get(tool.name);
    if (existing) {
      this.removeToolFromModule(existing.module, tool.name);
    }

    this.tools.set(tool.name, tool);
    this.addToolToModule(tool.module, tool.name);
  }

  /**
   * Register a group of tools under a module name.
   */
  registerModule(moduleName: string, tools: ToolDefinition[]): void {
    for (const tool of tools) {
      const normalizedTool = tool.module === moduleName ? tool : { ...tool, module: moduleName };
      this.register(normalizedTool);
    }
  }

  /**
   * Get a tool definition by name.
   */
  get(toolName: string): ToolDefinition | undefined {
    return this.tools.get(toolName);
  }

  /**
   * Get all registered tools.
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all tools registered under a module.
   */
  getByModule(moduleName: string): ToolDefinition[] {
    const toolNames = this.moduleMap.get(moduleName);
    if (!toolNames) {
      return [];
    }

    const tools: ToolDefinition[] = [];
    for (const toolName of toolNames) {
      const tool = this.tools.get(toolName);
      if (tool) {
        tools.push(tool);
      }
    }
    return tools;
  }

  /**
   * Check whether a tool exists in the registry.
   */
  has(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  /**
   * Remove a tool by name.
   */
  remove(toolName: string): boolean {
    const existing = this.tools.get(toolName);
    if (!existing) {
      return false;
    }

    this.tools.delete(toolName);
    this.removeToolFromModule(existing.module, toolName);
    return true;
  }

  /**
   * Clear all tools and module mappings.
   */
  clear(): void {
    this.tools.clear();
    this.moduleMap.clear();
  }

  private addToolToModule(moduleName: string, toolName: string): void {
    const moduleTools = this.moduleMap.get(moduleName);
    if (moduleTools) {
      moduleTools.add(toolName);
      return;
    }

    this.moduleMap.set(moduleName, new Set([toolName]));
  }

  private removeToolFromModule(moduleName: string, toolName: string): void {
    const moduleTools = this.moduleMap.get(moduleName);
    if (!moduleTools) {
      return;
    }

    moduleTools.delete(toolName);
    if (shouldRemoveModule(moduleTools)) {
      this.moduleMap.delete(moduleName);
    }
  }
}
