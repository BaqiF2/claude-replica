/**
 * MCPManager - MCP 服务器管理器
 *
 * 管理 MCP (Model Context Protocol) 服务器的配置、加载和验证。
 * 支持 stdio、SSE、HTTP 三种传输类型。
 *
 * **需求: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6**
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * stdio 传输配置
 */
export interface McpStdioServerConfig {
  /** 要执行的命令 */
  command: string;
  /** 命令参数 */
  args: string[];
  /** 环境变量 */
  env?: Record<string, string>;
}

/**
 * SSE 传输配置
 */
export interface McpSSEServerConfig {
  /** 传输类型 */
  transport: 'sse';
  /** 服务器 URL */
  url: string;
  /** HTTP 头 */
  headers?: Record<string, string>;
}

/**
 * HTTP 传输配置
 */
export interface McpHttpServerConfig {
  /** 传输类型 */
  transport: 'http';
  /** 服务器 URL */
  url: string;
  /** HTTP 头 */
  headers?: Record<string, string>;
}

/**
 * 单个 MCP 服务器配置类型
 */
export type McpServerConfig = McpStdioServerConfig | McpSSEServerConfig | McpHttpServerConfig;

/**
 * MCP 服务器配置集合
 */
export type MCPServerConfigMap = Record<string, McpServerConfig>;

/**
 * 配置验证结果
 */
export interface ConfigValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误信息列表 */
  errors: string[];
}

/**
 * 服务器信息
 */
export interface ServerInfo {
  /** 服务器名称 */
  name: string;
  /** 传输类型 */
  transport: 'stdio' | 'sse' | 'http';
  /** 配置详情 */
  config: McpServerConfig;
}

/**
 * MCPManager 配置选项
 */
export interface MCPManagerOptions {
  /** 是否启用调试日志 */
  debug?: boolean;
  /** 是否启用严格模式（验证所有配置） */
  strictMode?: boolean;
}

/**
 * MCP 服务器管理器
 *
 * 负责加载、管理和验证 MCP 服务器配置。
 */
export class MCPManager {
  private config: MCPServerConfigMap = {};
  private debug: boolean;
  private strictMode: boolean;

  constructor(options: MCPManagerOptions = {}) {
    this.debug = options.debug || false;
    this.strictMode = options.strictMode || false;
  }

  /**
   * 从配置文件加载 MCP 服务器
   *
   * @param configPath 配置文件路径（.mcp.json 或 mcp.json）
   * @throws 如果文件不存在或格式无效
   */
  async loadServersFromConfig(configPath: string): Promise<void> {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(content);

      // 验证配置格式
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('MCP 配置必须是一个对象');
      }

      // 如果启用严格模式，验证所有配置
      if (this.strictMode) {
        const validation = this.validateAllConfigs(parsed);
        if (!validation.valid) {
          throw new Error(`MCP 配置验证失败:\n${validation.errors.join('\n')}`);
        }
      }

      this.config = parsed as MCPServerConfigMap;

      if (this.debug) {
        console.log(`已加载 ${Object.keys(this.config).length} 个 MCP 服务器配置`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`MCP 配置文件不存在: ${configPath}`);
      }
      if (error instanceof SyntaxError) {
        throw new Error(`MCP 配置文件格式无效: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 尝试从多个可能的路径加载配置
   *
   * @param basePath 基础路径
   * @returns 是否成功加载
   */
  async tryLoadFromPaths(basePath: string): Promise<boolean> {
    const possiblePaths = [
      path.join(basePath, '.mcp.json'),
      path.join(basePath, 'mcp.json'),
      path.join(basePath, '.claude', 'mcp.json'),
    ];

    for (const configPath of possiblePaths) {
      try {
        await this.loadServersFromConfig(configPath);
        if (this.debug) {
          console.log(`从 ${configPath} 加载 MCP 配置`);
        }
        return true;
      } catch {
        // 继续尝试下一个路径
      }
    }

    return false;
  }

  /**
   * 添加 MCP 服务器
   *
   * @param name 服务器名称
   * @param config 服务器配置
   * @throws 如果启用严格模式且配置无效
   */
  addServer(name: string, config: McpServerConfig): void {
    if (!name || typeof name !== 'string') {
      throw new Error('服务器名称必须是非空字符串');
    }

    if (this.strictMode) {
      const validation = this.validateConfig(config);
      if (!validation.valid) {
        throw new Error(`服务器 "${name}" 配置无效:\n${validation.errors.join('\n')}`);
      }
    }

    this.config[name] = config;

    if (this.debug) {
      console.log(`已添加 MCP 服务器: ${name}`);
    }
  }

  /**
   * 移除 MCP 服务器
   *
   * @param name 服务器名称
   * @returns 是否成功移除
   */
  removeServer(name: string): boolean {
    if (Object.prototype.hasOwnProperty.call(this.config, name)) {
      delete this.config[name];
      if (this.debug) {
        console.log(`已移除 MCP 服务器: ${name}`);
      }
      return true;
    }
    return false;
  }

  /**
   * 获取所有服务器配置
   *
   * @returns 服务器配置映射
   */
  getServersConfig(): MCPServerConfigMap {
    return { ...this.config };
  }

  /**
   * 获取指定服务器的配置
   *
   * @param name 服务器名称
   * @returns 服务器配置，如果不存在则返回 undefined
   */
  getServerConfig(name: string): McpServerConfig | undefined {
    return this.config[name];
  }

  /**
   * 列出所有服务器名称
   *
   * @returns 服务器名称数组
   */
  listServers(): string[] {
    return Object.keys(this.config);
  }

  /**
   * 获取服务器数量
   *
   * @returns 服务器数量
   */
  getServerCount(): number {
    return Object.keys(this.config).length;
  }

  /**
   * 检查服务器是否存在
   *
   * @param name 服务器名称
   * @returns 是否存在
   */
  hasServer(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.config, name);
  }

  /**
   * 获取服务器详细信息列表
   *
   * @returns 服务器信息数组
   */
  getServersInfo(): ServerInfo[] {
    return Object.entries(this.config).map(([name, config]) => ({
      name,
      transport: this.getTransportType(config),
      config,
    }));
  }

  /**
   * 获取配置的传输类型
   *
   * @param config 服务器配置
   * @returns 传输类型
   */
  getTransportType(config: McpServerConfig): 'stdio' | 'sse' | 'http' {
    if ('transport' in config) {
      return config.transport;
    }
    // 如果有 command 字段，则是 stdio 类型
    if ('command' in config) {
      return 'stdio';
    }
    // 默认返回 stdio（不应该到达这里）
    return 'stdio';
  }

  /**
   * 验证单个服务器配置
   *
   * @param config 服务器配置
   * @returns 验证结果
   */
  validateConfig(config: McpServerConfig): ConfigValidationResult {
    const errors: string[] = [];

    if (!config || typeof config !== 'object') {
      return { valid: false, errors: ['配置必须是一个对象'] };
    }

    // 检查是否是 stdio 配置（有 command 字段）
    if (this.isStdioConfig(config)) {
      return this.validateStdioConfig(config);
    }

    // 检查是否是 SSE 配置
    if (this.isSSEConfig(config)) {
      return this.validateSSEConfig(config);
    }

    // 检查是否是 HTTP 配置
    if (this.isHttpConfig(config)) {
      return this.validateHttpConfig(config);
    }

    // 检查是否有 transport 字段但值不正确
    if ('transport' in config) {
      const transport = (config as { transport: string }).transport;
      errors.push(`未知的传输类型: ${transport}`);
      return { valid: false, errors };
    }

    errors.push('配置必须包含 command（stdio）或 transport（sse/http）字段');
    return { valid: false, errors };
  }

  /**
   * 类型守卫：检查是否是 stdio 配置
   */
  private isStdioConfig(config: McpServerConfig): config is McpStdioServerConfig {
    return 'command' in config;
  }

  /**
   * 类型守卫：检查是否是 SSE 配置
   */
  private isSSEConfig(config: McpServerConfig): config is McpSSEServerConfig {
    return 'transport' in config && (config as McpSSEServerConfig).transport === 'sse';
  }

  /**
   * 类型守卫：检查是否是 HTTP 配置
   */
  private isHttpConfig(config: McpServerConfig): config is McpHttpServerConfig {
    return 'transport' in config && (config as McpHttpServerConfig).transport === 'http';
  }

  /**
   * 验证 stdio 配置
   */
  private validateStdioConfig(config: McpStdioServerConfig): ConfigValidationResult {
    const errors: string[] = [];

    if (typeof config.command !== 'string' || config.command.trim() === '') {
      errors.push('command 必须是非空字符串');
    }

    if (!Array.isArray(config.args)) {
      errors.push('args 必须是数组');
    } else {
      for (let i = 0; i < config.args.length; i++) {
        if (typeof config.args[i] !== 'string') {
          errors.push(`args[${i}] 必须是字符串`);
        }
      }
    }

    if (config.env !== undefined) {
      if (typeof config.env !== 'object' || config.env === null || Array.isArray(config.env)) {
        errors.push('env 必须是对象');
      } else {
        for (const [key, value] of Object.entries(config.env)) {
          if (typeof value !== 'string') {
            errors.push(`env.${key} 必须是字符串`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 验证 SSE 配置
   */
  private validateSSEConfig(config: McpSSEServerConfig): ConfigValidationResult {
    const errors: string[] = [];

    if (config.transport !== 'sse') {
      errors.push('transport 必须是 "sse"');
    }

    if (typeof config.url !== 'string' || config.url.trim() === '') {
      errors.push('url 必须是非空字符串');
    } else if (!this.isValidUrl(config.url)) {
      errors.push('url 必须是有效的 URL');
    }

    if (config.headers !== undefined) {
      if (
        typeof config.headers !== 'object' ||
        config.headers === null ||
        Array.isArray(config.headers)
      ) {
        errors.push('headers 必须是对象');
      } else {
        for (const [key, value] of Object.entries(config.headers)) {
          if (typeof value !== 'string') {
            errors.push(`headers.${key} 必须是字符串`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 验证 HTTP 配置
   */
  private validateHttpConfig(config: McpHttpServerConfig): ConfigValidationResult {
    const errors: string[] = [];

    if (config.transport !== 'http') {
      errors.push('transport 必须是 "http"');
    }

    if (typeof config.url !== 'string' || config.url.trim() === '') {
      errors.push('url 必须是非空字符串');
    } else if (!this.isValidUrl(config.url)) {
      errors.push('url 必须是有效的 URL');
    }

    if (config.headers !== undefined) {
      if (
        typeof config.headers !== 'object' ||
        config.headers === null ||
        Array.isArray(config.headers)
      ) {
        errors.push('headers 必须是对象');
      } else {
        for (const [key, value] of Object.entries(config.headers)) {
          if (typeof value !== 'string') {
            errors.push(`headers.${key} 必须是字符串`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 验证所有配置
   */
  private validateAllConfigs(configs: Record<string, unknown>): ConfigValidationResult {
    const errors: string[] = [];

    for (const [name, config] of Object.entries(configs)) {
      const result = this.validateConfig(config as McpServerConfig);
      if (!result.valid) {
        errors.push(`服务器 "${name}":`);
        errors.push(...result.errors.map((e) => `  - ${e}`));
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 验证 URL 格式
   */
  private isValidUrl(url: string): boolean {
    // 支持环境变量占位符
    if (url.includes('${')) {
      return true;
    }

    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 展开配置中的环境变量
   *
   * @param config 服务器配置
   * @returns 展开后的配置
   */
  expandEnvironmentVariables(config: McpServerConfig): McpServerConfig {
    const expandValue = (value: string): string => {
      return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
        return process.env[varName] || '';
      });
    };

    if ('command' in config) {
      const stdioConfig = config as McpStdioServerConfig;
      const expanded: McpStdioServerConfig = {
        command: expandValue(stdioConfig.command),
        args: stdioConfig.args.map(expandValue),
      };
      if (stdioConfig.env) {
        expanded.env = {};
        for (const [key, value] of Object.entries(stdioConfig.env)) {
          expanded.env[key] = expandValue(value);
        }
      }
      return expanded;
    }

    if ('transport' in config) {
      if (config.transport === 'sse') {
        const sseConfig = config as McpSSEServerConfig;
        const expanded: McpSSEServerConfig = {
          transport: 'sse',
          url: expandValue(sseConfig.url),
        };
        if (sseConfig.headers) {
          expanded.headers = {};
          for (const [key, value] of Object.entries(sseConfig.headers)) {
            expanded.headers[key] = expandValue(value);
          }
        }
        return expanded;
      }

      if (config.transport === 'http') {
        const httpConfig = config as McpHttpServerConfig;
        const expanded: McpHttpServerConfig = {
          transport: 'http',
          url: expandValue(httpConfig.url),
        };
        if (httpConfig.headers) {
          expanded.headers = {};
          for (const [key, value] of Object.entries(httpConfig.headers)) {
            expanded.headers[key] = expandValue(value);
          }
        }
        return expanded;
      }
    }

    return config;
  }

  /**
   * 获取展开环境变量后的所有配置
   *
   * @returns 展开后的服务器配置映射
   */
  getExpandedServersConfig(): MCPServerConfigMap {
    const expanded: MCPServerConfigMap = {};
    for (const [name, config] of Object.entries(this.config)) {
      expanded[name] = this.expandEnvironmentVariables(config);
    }
    return expanded;
  }

  /**
   * 清除所有服务器配置
   */
  clear(): void {
    this.config = {};
    if (this.debug) {
      console.log('已清除所有 MCP 服务器配置');
    }
  }

  /**
   * 合并另一个配置
   *
   * @param other 要合并的配置
   * @param overwrite 是否覆盖已存在的配置
   */
  merge(other: MCPServerConfigMap, overwrite: boolean = true): void {
    for (const [name, config] of Object.entries(other)) {
      if (overwrite || !(name in this.config)) {
        this.config[name] = config;
      }
    }
  }

  /**
   * 保存配置到文件
   *
   * @param configPath 配置文件路径
   */
  async saveToFile(configPath: string): Promise<void> {
    const content = JSON.stringify(this.config, null, 2);
    await fs.writeFile(configPath, content, 'utf-8');
    if (this.debug) {
      console.log(`已保存 MCP 配置到 ${configPath}`);
    }
  }

  /**
   * 按传输类型筛选服务器
   *
   * @param transport 传输类型
   * @returns 匹配的服务器配置映射
   */
  filterByTransport(transport: 'stdio' | 'sse' | 'http'): MCPServerConfigMap {
    const filtered: MCPServerConfigMap = {};
    for (const [name, config] of Object.entries(this.config)) {
      if (this.getTransportType(config) === transport) {
        filtered[name] = config;
      }
    }
    return filtered;
  }

  /**
   * 静态方法：验证配置对象
   *
   * @param config 配置对象
   * @returns 验证结果
   */
  static validateServerConfig(config: unknown): ConfigValidationResult {
    const manager = new MCPManager();
    return manager.validateConfig(config as McpServerConfig);
  }

  /**
   * 静态方法：从 JSON 字符串解析配置
   *
   * @param json JSON 字符串
   * @returns MCPManager 实例
   */
  static fromJSON(json: string): MCPManager {
    const manager = new MCPManager();
    const parsed = JSON.parse(json);
    manager.config = parsed as MCPServerConfigMap;
    return manager;
  }

  /**
   * 转换为 JSON 字符串
   *
   * @returns JSON 字符串
   */
  toJSON(): string {
    return JSON.stringify(this.config, null, 2);
  }
}
