/**
 * 文件功能：MCP 业务逻辑层，负责 MCP 配置的查询、编辑与验证
 *
 * 核心类：
 * - MCPService: MCP 配置服务
 *
 * 核心方法：
 * - listServerConfig(): 获取项目 .mcp.json 的服务器配置列表
 * - editConfig(): 打开编辑器修改 .mcp.json 配置
 * - validateConfig(): 校验 .mcp.json 配置结构与服务器定义
 */

import * as fs from 'fs/promises';
import { spawn, SpawnOptions } from 'child_process';

import { MCPManager, McpServerConfig, ServerInfo } from './MCPManager';

const MCP_FIELD_NAME_WHITELIST = new Set([
  'command',
  'args',
  'env',
  'type',
  'url',
  'headers',
  'transport',
]);
const FIELD_PATH_REGEX = /^([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)*(?:\[\d+\])?)/;
const DEFAULT_MCP_CONFIG_CONTENT = '{\n  "mcpServers": {}\n}\n';
const DEFAULT_EDITORS = ['code', 'vim', 'nano', 'vi'];

export interface MCPServiceOptions {
  mcpManager?: MCPManager;
  spawnProcess?: typeof spawn;
}

export interface MCPConfigListResult {
  configPath: string;
  servers: ServerInfo[];
}

export interface MCPConfigEditResult {
  configPath: string;
  editor: string;
}

export interface MCPConfigValidationError {
  message: string;
  path?: string;
  field?: string;
  line?: number;
  column?: number;
}

export interface MCPConfigValidationResult {
  valid: boolean;
  errors: MCPConfigValidationError[];
  configPath: string;
  serverCount: number;
  transportCounts: Record<ServerInfo['type'], number>;
}

export class MCPService {
  private readonly mcpManager: MCPManager;
  private readonly spawnProcess: typeof spawn;

  constructor(options: MCPServiceOptions = {}) {
    this.mcpManager = options.mcpManager ?? new MCPManager();
    this.spawnProcess = options.spawnProcess ?? spawn;
  }

  async listServerConfig(workingDir: string): Promise<MCPConfigListResult> {
    const configPath = await this.mcpManager.getConfigPath(workingDir);
    const exists = await this.fileExists(configPath);
    if (!exists) {
      return { configPath, servers: [] };
    }
    await this.mcpManager.loadServersFromConfig(configPath);
    return { configPath, servers: this.mcpManager.getServersInfo() };
  }

  async editConfig(workingDir: string): Promise<MCPConfigEditResult> {
    const configPath = await this.mcpManager.getConfigPath(workingDir);
    const exists = await this.fileExists(configPath);
    if (!exists) {
      await fs.writeFile(configPath, DEFAULT_MCP_CONFIG_CONTENT, 'utf-8');
    }

    const editors = this.getEditorCandidates();
    const errors: Error[] = [];

    for (const editor of editors) {
      try {
        await this.openEditor(editor, configPath);
        return { configPath, editor };
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (this.isCommandNotFound(err)) {
          errors.push(err);
          continue;
        }
        throw error;
      }
    }

    const detail = errors.length > 0 ? `: ${errors.map((error) => error.message).join('; ')}` : '';
    throw new Error(`No available editor found${detail}`);
  }

  async validateConfig(workingDir: string): Promise<MCPConfigValidationResult> {
    const configPath = await this.mcpManager.getConfigPath(workingDir);
    let content = '';

    try {
      content = await fs.readFile(configPath, 'utf-8');
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return this.buildValidationResult(configPath, [
          { message: `MCP configuration file does not exist: ${configPath}` },
        ]);
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      const syntaxError = error as SyntaxError;
      const detail = this.getSyntaxErrorDetail(content, syntaxError);
      return this.buildValidationResult(configPath, [
        { message: `Invalid JSON syntax: ${syntaxError.message}`, ...detail },
      ]);
    }

    const errors: MCPConfigValidationError[] = [];
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      errors.push({ message: 'MCP configuration must be an object', path: 'root' });
      return this.buildValidationResult(configPath, errors);
    }

    const mcpServers = (parsed as { mcpServers?: unknown }).mcpServers;
    if (mcpServers === undefined) {
      errors.push({
        message: 'MCP configuration must include "mcpServers" object',
        path: 'mcpServers',
      });
      return this.buildValidationResult(configPath, errors);
    }

    if (typeof mcpServers !== 'object' || mcpServers === null || Array.isArray(mcpServers)) {
      errors.push({
        message: 'MCP configuration "mcpServers" must be an object',
        path: 'mcpServers',
      });
      return this.buildValidationResult(configPath, errors);
    }

    const serverEntries = Object.entries(mcpServers as Record<string, unknown>);
    const transportCounts = this.createTransportCounts();

    for (const [name, rawConfig] of serverEntries) {
      if (typeof rawConfig !== 'object' || rawConfig === null || Array.isArray(rawConfig)) {
        errors.push({
          message: 'Server configuration must be an object',
          path: `mcpServers.${name}`,
        });
        continue;
      }

      const normalized = this.normalizeServerConfig(rawConfig as Record<string, unknown>);
      const validation = this.mcpManager.validateConfig(normalized);
      if (!validation.valid) {
        for (const message of validation.errors) {
          const field = this.extractFieldFromMessage(message);
          const path = field ? `mcpServers.${name}.${field}` : `mcpServers.${name}`;
          errors.push({ message, path, field });
        }
        continue;
      }

      const transportType = this.mcpManager.getTransportType(normalized);
      transportCounts[transportType] += 1;
    }

    return this.buildValidationResult(configPath, errors, serverEntries.length, transportCounts);
  }

  private buildValidationResult(
    configPath: string,
    errors: MCPConfigValidationError[],
    serverCount = 0,
    transportCounts: Record<ServerInfo['type'], number> = this.createTransportCounts()
  ): MCPConfigValidationResult {
    return {
      valid: errors.length === 0,
      errors,
      configPath,
      serverCount,
      transportCounts,
    };
  }

  private createTransportCounts(): Record<ServerInfo['type'], number> {
    return {
      stdio: 0,
      sse: 0,
      http: 0,
    };
  }

  private extractFieldFromMessage(message: string): string | undefined {
    const match = FIELD_PATH_REGEX.exec(message);
    if (!match) {
      return undefined;
    }
    const candidate = match[1];
    const baseField = candidate.split(/[.\[]/)[0];
    if (!MCP_FIELD_NAME_WHITELIST.has(baseField)) {
      return undefined;
    }
    return candidate;
  }

  private normalizeServerConfig(config: Record<string, unknown>): McpServerConfig {
    if ('command' in config) {
      return config as unknown as McpServerConfig;
    }

    const hasType = 'type' in config;
    const hasTransport = 'transport' in config;

    if (hasType && hasTransport) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { transport: _transport, ...rest } = config;
      return rest as unknown as McpServerConfig;
    }

    if (!hasType && hasTransport) {
      const { transport, ...rest } = config;
      return { type: transport, ...rest } as unknown as McpServerConfig;
    }

    return config as unknown as McpServerConfig;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private getEditorCandidates(): string[] {
    const candidates: string[] = [];
    const envEditor = process.env.EDITOR?.trim();
    if (envEditor) {
      candidates.push(envEditor);
    }

    for (const editor of DEFAULT_EDITORS) {
      if (!candidates.includes(editor)) {
        candidates.push(editor);
      }
    }

    return candidates;
  }

  private async openEditor(editor: string, configPath: string): Promise<void> {
    const { command, args } = this.splitEditorCommand(editor, configPath);
    if (!command) {
      throw new Error('Editor command is empty');
    }

    await new Promise<void>((resolve, reject) => {
      const child = this.spawnProcess(command, args, { stdio: 'inherit' } as SpawnOptions);
      child.on('error', (error) => reject(error));
      child.on('exit', (code) => {
        if (code === 0 || code === null) {
          resolve();
          return;
        }
        reject(new Error(`Editor exited with code ${code}`));
      });
    });
  }

  private splitEditorCommand(
    editor: string,
    configPath: string
  ): { command: string; args: string[] } {
    const parts = editor.trim().split(/\s+/).filter(Boolean);
    const command = parts.shift() ?? '';
    return { command, args: [...parts, configPath] };
  }

  private isCommandNotFound(error: NodeJS.ErrnoException): boolean {
    return error.code === 'ENOENT';
  }

  private getSyntaxErrorDetail(
    content: string,
    error: SyntaxError
  ): { line?: number; column?: number } {
    const match = /position (\d+)/i.exec(error.message);
    if (!match) {
      return {};
    }

    const position = parseInt(match[1], 10);
    if (Number.isNaN(position)) {
      return {};
    }

    const before = content.slice(0, position);
    const line = before.split('\n').length;
    const lastBreak = before.lastIndexOf('\n');
    const column = position - lastBreak;
    return { line, column };
  }
}
