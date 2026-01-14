/**
 * 文件功能：MCP 配置加载与验证核心，按官方单一配置源要求从项目根目录的 .mcp.json 读取服务器定义、展开环境变量并确保结构合法。
 *
 * 核心类：
 * - MCPManager: 维护 MCP 服务器缓存并提供验证/展开等公共能力
 *
 * 核心方法（保留）：
 * - loadServersFromConfig(): 从指定的 .mcp.json 解析并缓存服务器配置
 * - getServersConfig(): 提供原始缓存配置供上层业务使用
 * - getServersInfo(): 生成含传输类型的服务器信息列表以便展示
 * - validateConfig(): 逐个校验服务器配置结构并反馈错误
 * - expandEnvironmentVariables(): 展开配置中的 `${ENV}` 占位符
 * - getExpandedServersConfig(): 获取展开后的所有配置用于 SDK 调用
 * - getTransportType(): 根据字段判断传输类型以辅助路由和展示
 *
 * 新增方法（单一配置资源）：
 * - loadFromProjectRoot(): 向上查找 .git，锁定项目根并加载其 .mcp.json
 * - getConfigPath(): 返回当前工作目录所属项目根下的 .mcp.json 路径
 *
 * 移除的旧方法（由于采用官方推荐的单一配置源及编辑器流程而弃用）：
 * - tryLoadFromPaths(): 统一只读项目根 .mcp.json，取消多路径搜索
 * - addServer()/removeServer(): 运行时直接修改配置改为由 /mcp edit 编辑器命令处理
 * - merge(): 依赖配置文件本身及 MCPService 进行合并，移除运行时合并逻辑
 * - saveToFile(): 保存责任交给编辑器流程，不再内部写文件
 * - filterByTransport(): 该辅助方法未使用且被展示层替代
 * - clear(): 不再支持运行时清空配置，避免误删
 * - fromJSON()/toJSON(): 序列化需求由配置文件天然提供，删掉冗余实现
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const MCP_CONFIG_FILENAME = '.mcp.json';
const GIT_DIRECTORY_NAME = '.git';

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
   * 从项目根目录加载 MCP 配置
   *
   * @param workingDir 当前工作目录
   */
  async loadFromProjectRoot(workingDir: string): Promise<void> {
    const configPath = await this.getConfigPath(workingDir);
    if (!(await this.pathExists(configPath))) {
      this.config = {};
      return;
    }
    await this.loadServersFromConfig(configPath);
  }

  /**
   * 获取项目根目录下的 MCP 配置路径
   *
   * @param workingDir 当前工作目录
   * @returns MCP 配置文件路径
   */
  async getConfigPath(workingDir: string): Promise<string> {
    const projectRoot = await this.findProjectRoot(workingDir);
    return path.join(projectRoot, MCP_CONFIG_FILENAME);
  }

  /**
   * 从配置文件加载 MCP 服务器
   *
   * @param configPath 配置文件路径（.mcp.json）
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

      if (!('mcpServers' in parsed)) {
        throw new Error('MCP configuration must include "mcpServers" object');
      }

      if (typeof parsed.mcpServers !== 'object' || parsed.mcpServers === null) {
        throw new Error('MCP configuration "mcpServers" must be an object');
      }

      if (Array.isArray(parsed.mcpServers)) {
        throw new Error('MCP configuration "mcpServers" must be an object');
      }

      const serverConfigs = parsed.mcpServers as Record<string, unknown>;

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
    const expandValue = (value: string | undefined): string => {
      if (typeof value !== 'string') {
        return '';
      }
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
   * 静态方法：验证配置对象
   *
   * @param config 配置对象
   * @returns 验证结果
   */
  static validateServerConfig(config: unknown): ConfigValidationResult {
    const manager = new MCPManager();
    return manager.validateConfig(config as McpServerConfig);
  }

  private async findProjectRoot(workingDir: string): Promise<string> {
    const resolvedWorkingDir = path.resolve(workingDir);
    let currentDir = resolvedWorkingDir;

    while (true) {
      const gitPath = path.join(currentDir, GIT_DIRECTORY_NAME);
      try {
        await fs.stat(gitPath);
        return currentDir;
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code && err.code !== 'ENOENT') {
          throw error;
        }
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        return resolvedWorkingDir;
      }
      currentDir = parentDir;
    }
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }
}
