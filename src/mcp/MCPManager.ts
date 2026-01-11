/**
 * 文件功能：MCP（Model Context Protocol）服务器管理模块，负责配置、加载和验证 MCP 服务器
 *
 * 核心类：
 * - MCPManager: MCP 服务器管理器核心类
 *
 * 核心方法：
 * - loadServersFromConfig(): 从配置文件加载 MCP 服务器
 * - listServers(): 列出所有已配置的服务器
 * - validateConfig(): 验证 MCP 服务器配置
 * - startServer(): 启动指定服务器
 * - stopServer(): 停止指定服务器
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
  type: 'sse';
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
  type: 'http';
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
  type: 'stdio' | 'sse' | 'http';
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
        throw new Error('MCP configuration must be an object');
      }

      // 支持 MCP 规范格式：{ "mcpServers": { ... } }
      // 同时向后兼容直接映射格式：{ "serverName": { ... } }
      let serverConfigs: Record<string, unknown>;

      if ('mcpServers' in parsed && typeof parsed.mcpServers === 'object') {
        // 使用 mcpServers 嵌套结构（MCP 规范格式）
        serverConfigs = parsed.mcpServers as Record<string, unknown>;
      } else {
        // 使用根级别（向后兼容）
        serverConfigs = parsed;
      }

      // 规范化所有配置（转换 transport -> type）
      const normalized: MCPServerConfigMap = {};
      for (const [name, config] of Object.entries(serverConfigs)) {
        normalized[name] = this.normalizeConfig(config as McpServerConfig);
      }

      // 如果启用严格模式，验证所有配置
      if (this.strictMode) {
        const validation = this.validateAllConfigs(normalized);
        if (!validation.valid) {
          throw new Error(`MCP configuration validation failed:\n${validation.errors.join('\n')}`);
        }
      }

      this.config = normalized;

      if (this.debug) {
        console.log(`Loaded ${Object.keys(this.config).length} MCP server configurations`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`MCP configuration file does not exist: ${configPath}`);
      }
      if (error instanceof SyntaxError) {
        throw new Error(`MCP configuration file format invalid: ${error.message}`);
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
          console.log(`Loaded MCP configuration from ${configPath}`);
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
      throw new Error('Server name must be a non-empty string');
    }

    // 规范化配置（转换 transport -> type）
    const normalizedConfig = this.normalizeConfig(config);

    if (this.strictMode) {
      const validation = this.validateConfig(normalizedConfig);
      if (!validation.valid) {
        throw new Error(`Server "${name}" configuration invalid:\n${validation.errors.join('\n')}`);
      }
    }

    this.config[name] = normalizedConfig;

    if (this.debug) {
      console.log(`MCP server added: ${name}`);
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
        console.log(`MCP server removed: ${name}`);
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
      type: this.getTransportType(config),
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
    if ('type' in config) {
      return config.type;
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
      return { valid: false, errors: ['Config must be an object'] };
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

    // 检查是否有 type 字段但值不正确
    if ('type' in config) {
      const type = (config as { type: string }).type;
      errors.push(`Unknown type value: ${type}`);
      return { valid: false, errors };
    }

    errors.push('Config must contain command (stdio) or type (sse/http) field');
    return { valid: false, errors };
  }

  /**
   * 规范化配置：将旧的 transport 字段转换为新的 type 字段
   *
   * @param config 原始配置
   * @returns 规范化后的配置
   */
  private normalizeConfig(config: McpServerConfig): McpServerConfig {
    // 如果是 stdio 配置，不需要转换
    if ('command' in config) {
      return config;
    }

    // 检查是否需要转换
    const configAny = config as unknown as Record<string, unknown>;

    // 情况1：同时存在 type 和 transport，优先使用 type
    if ('type' in configAny && 'transport' in configAny) {
      console.warn(
        'DEPRECATED: Configuration contains both "type" and "transport" fields. ' +
          'Using "type" field. Please remove the deprecated "transport" field. ' +
          'The "transport" field will be removed in v2.0.'
      );
      // 移除 transport 字段
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { transport: _transport, ...rest } = configAny;
      return rest as unknown as McpServerConfig;
    }

    // 情况2：只有 transport 字段，需要转换为 type
    if ('transport' in configAny && !('type' in configAny)) {
      const transportValue = configAny.transport;
      console.warn(
        `DEPRECATED: Configuration field "transport" is deprecated. ` +
          `Please use "type" instead. Example: { "type": "${transportValue}", ... }. ` +
          `The "transport" field will be removed in v2.0.`
      );
      const { transport, ...rest } = configAny;
      return { type: transport, ...rest } as McpServerConfig;
    }

    // 情况3：只有 type 字段或都没有，直接返回
    return config;
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
    return 'type' in config && (config as McpSSEServerConfig).type === 'sse';
  }

  /**
   * 类型守卫：检查是否是 HTTP 配置
   */
  private isHttpConfig(config: McpServerConfig): config is McpHttpServerConfig {
    return 'type' in config && (config as McpHttpServerConfig).type === 'http';
  }

  /**
   * 验证 stdio 配置
   */
  private validateStdioConfig(config: McpStdioServerConfig): ConfigValidationResult {
    const errors: string[] = [];

    if (typeof config.command !== 'string' || config.command.trim() === '') {
      errors.push('command must be a non-empty string');
    }

    if (!Array.isArray(config.args)) {
      errors.push('args must be an array');
    } else {
      for (let i = 0; i < config.args.length; i++) {
        if (typeof config.args[i] !== 'string') {
          errors.push(`args[${i}] must be a string`);
        }
      }
    }

    if (config.env !== undefined) {
      if (typeof config.env !== 'object' || config.env === null || Array.isArray(config.env)) {
        errors.push('env must be an object');
      } else {
        for (const [key, value] of Object.entries(config.env)) {
          if (typeof value !== 'string') {
            errors.push(`env.${key} must be a string`);
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

    if (config.type !== 'sse') {
      errors.push('type must be "sse"');
    }

    if (typeof config.url !== 'string' || config.url.trim() === '') {
      errors.push('url must be a non-empty string');
    } else if (!this.isValidUrl(config.url)) {
      errors.push('url must be a valid URL');
    }

    if (config.headers !== undefined) {
      if (
        typeof config.headers !== 'object' ||
        config.headers === null ||
        Array.isArray(config.headers)
      ) {
        errors.push('headers must be an object');
      } else {
        for (const [key, value] of Object.entries(config.headers)) {
          if (typeof value !== 'string') {
            errors.push(`headers.${key} must be a string`);
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

    if (config.type !== 'http') {
      errors.push('type must be "http"');
    }

    if (typeof config.url !== 'string' || config.url.trim() === '') {
      errors.push('url must be a non-empty string');
    } else if (!this.isValidUrl(config.url)) {
      errors.push('url must be a valid URL');
    }

    if (config.headers !== undefined) {
      if (
        typeof config.headers !== 'object' ||
        config.headers === null ||
        Array.isArray(config.headers)
      ) {
        errors.push('headers must be an object');
      } else {
        for (const [key, value] of Object.entries(config.headers)) {
          if (typeof value !== 'string') {
            errors.push(`headers.${key} must be a string`);
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
        errors.push(`Server "${name}":`);
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

    if ('type' in config) {
      if (config.type === 'sse') {
        const sseConfig = config as McpSSEServerConfig;
        const expanded: McpSSEServerConfig = {
          type: 'sse',
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

      if (config.type === 'http') {
        const httpConfig = config as McpHttpServerConfig;
        const expanded: McpHttpServerConfig = {
          type: 'http',
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
      console.log('All MCP server configurations cleared');
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
      console.log(`MCP configuration saved to ${configPath}`);
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
