/**
 * 文件功能：协作管理模块，负责团队协作功能，包括配置共享、导出导入和验证
 *
 * 核心类：
 * - CollaborationManager: 协作管理器核心类
 *
 * 核心方法：
 * - shareConfig(): 共享配置到团队
 * - importConfig(): 导入外部配置
 * - validateConfig(): 验证配置一致性
 * - exportConfig(): 导出配置模板
 * - syncWithTeam(): 与团队同步配置
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ProjectConfig, McpServerConfig } from '../config';

/**
 * 配置模板接口
 */
export interface ConfigTemplate {
  /** 模板名称 */
  name: string;
  /** 模板版本 */
  version: string;
  /** 模板描述 */
  description?: string;
  /** 创建时间 */
  createdAt: string;
  /** 配置内容 */
  config: ProjectConfig;
  /** 包含的技能 */
  skills?: string[];
  /** 包含的命令 */
  commands?: string[];
  /** 包含的钩子 */
  hooks?: string[];
}

/**
 * 配置验证结果
 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误列表 */
  errors: ValidationError[];
  /** 警告列表 */
  warnings: ValidationWarning[];
}

/**
 * 验证错误
 */
export interface ValidationError {
  /** 错误类型 */
  type: 'missing' | 'invalid' | 'conflict' | 'security';
  /** 错误路径 */
  path: string;
  /** 错误消息 */
  message: string;
}

/**
 * 验证警告
 */
export interface ValidationWarning {
  /** 警告类型 */
  type: 'deprecated' | 'recommendation' | 'compatibility';
  /** 警告路径 */
  path: string;
  /** 警告消息 */
  message: string;
}

/**
 * 敏感文件模式
 */
const SENSITIVE_FILE_PATTERNS = [
  'settings.local.json',
  '.env',
  '.env.local',
  '*.key',
  '*.pem',
  'credentials.json',
  'auth.json',
];

/**
 * 默认 .gitignore 条目
 */
const DEFAULT_GITIGNORE_ENTRIES = [
  '# Claude Replica 本地配置',
  '.claude-replica/settings.local.json',
  '.claude-replica/auth.json',
  '.claude-replica/sessions/',
  '.claude-replica/logs/',
  '.claude-replica/cache/',
  '',
  '# 敏感文件',
  '.env.local',
  '*.key',
  '*.pem',
];

/**
 * 协作管理器
 *
 * 提供团队协作所需的配置共享、本地覆盖、认证管理等功能
 */
export class CollaborationManager {
  /** 项目目录 */
  private readonly projectDir: string;

  /** 用户配置目录 */
  private readonly userConfigDir: string;

  /** 项目配置目录 */
  private readonly projectConfigDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
    this.userConfigDir = path.join(homeDir, '.claude-replica');
    this.projectConfigDir = path.join(projectDir, '.claude-replica');
  }

  // ==================== 配置共享功能 ====================

  /**
   * 获取可共享的项目配置
   *
   * 返回可以安全提交到版本控制的配置
   * 排除敏感信息和本地配置
   *
   * @returns 可共享的配置
   */
  async getShareableConfig(): Promise<ProjectConfig> {
    const configPath = path.join(this.projectConfigDir, 'settings.json');

    if (!(await this.fileExists(configPath))) {
      return {};
    }

    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as ProjectConfig;

    // 移除敏感字段
    return this.sanitizeConfig(config);
  }

  /**
   * 保存共享配置
   *
   * 将配置保存到项目目录，供团队成员共享
   *
   * @param config - 要共享的配置
   */
  async saveShareableConfig(config: ProjectConfig): Promise<void> {
    await fs.mkdir(this.projectConfigDir, { recursive: true });

    const configPath = path.join(this.projectConfigDir, 'settings.json');
    const sanitized = this.sanitizeConfig(config);

    await fs.writeFile(configPath, JSON.stringify(sanitized, null, 2), 'utf-8');
  }

  /**
   * 清理配置中的敏感信息
   *
   * @param config - 原始配置
   * @returns 清理后的配置
   */
  private sanitizeConfig(config: ProjectConfig): ProjectConfig {
    const sanitized = { ...config };

    // 移除可能包含敏感信息的字段
    if (sanitized.mcpServers) {
      sanitized.mcpServers = this.sanitizeMcpServers(sanitized.mcpServers) as Record<
        string,
        McpServerConfig
      >;
    }

    return sanitized;
  }

  /**
   * 清理 MCP 服务器配置中的敏感信息
   */
  private sanitizeMcpServers(servers: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [name, config] of Object.entries(servers)) {
      const serverConfig = config as Record<string, unknown>;
      sanitized[name] = { ...serverConfig };

      // 清理环境变量中的敏感值
      if (serverConfig.env) {
        const env = serverConfig.env as Record<string, string>;
        const sanitizedEnv: Record<string, string> = {};

        for (const [key, value] of Object.entries(env)) {
          // 保留环境变量引用，但移除实际值
          if (value.startsWith('${') && value.endsWith('}')) {
            sanitizedEnv[key] = value;
          } else {
            sanitizedEnv[key] = `\${${key}}`;
          }
        }

        (sanitized[name] as Record<string, unknown>).env = sanitizedEnv;
      }
    }

    return sanitized;
  }

  // ==================== 本地配置覆盖 ====================

  /**
   * 加载本地配置
   *
   * 本地配置用于覆盖共享配置，不会提交到版本控制
   *
   * @returns 本地配置
   */
  async loadLocalConfig(): Promise<ProjectConfig> {
    const localConfigPath = path.join(this.projectConfigDir, 'settings.local.json');

    if (!(await this.fileExists(localConfigPath))) {
      return {};
    }

    const content = await fs.readFile(localConfigPath, 'utf-8');
    return JSON.parse(content) as ProjectConfig;
  }

  /**
   * 保存本地配置
   *
   * @param config - 本地配置
   */
  async saveLocalConfig(config: ProjectConfig): Promise<void> {
    await fs.mkdir(this.projectConfigDir, { recursive: true });

    const localConfigPath = path.join(this.projectConfigDir, 'settings.local.json');
    await fs.writeFile(localConfigPath, JSON.stringify(config, null, 2), 'utf-8');

    // 确保本地配置被 .gitignore 忽略
    await this.ensureGitignore();
  }

  /**
   * 合并共享配置和本地配置
   *
   * 本地配置优先级高于共享配置
   *
   * @returns 合并后的配置
   */
  async getMergedConfig(): Promise<ProjectConfig> {
    const sharedConfig = await this.getShareableConfig();
    const localConfig = await this.loadLocalConfig();

    return this.mergeConfigs(sharedConfig, localConfig);
  }

  /**
   * 合并两个配置对象
   *
   * @param base - 基础配置
   * @param override - 覆盖配置
   * @returns 合并后的配置
   */
  private mergeConfigs(base: ProjectConfig, override: ProjectConfig): ProjectConfig {
    return {
      ...base,
      ...override,
      // 深度合并对象类型字段
      mcpServers: { ...base.mcpServers, ...override.mcpServers },
      agents: { ...base.agents, ...override.agents },
      hooks: this.mergeHooks(base.hooks, override.hooks),
      sandbox: { ...base.sandbox, ...override.sandbox },
    };
  }

  /**
   * 合并钩子配置
   */
  private mergeHooks(
    base?: Record<string, unknown>,
    override?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (!base && !override) return undefined;
    if (!base) return override;
    if (!override) return base;

    const result: Record<string, unknown> = { ...base };

    for (const [event, hooks] of Object.entries(override)) {
      if (result[event]) {
        // 合并同一事件的钩子
        result[event] = [...(result[event] as unknown[]), ...(hooks as unknown[])];
      } else {
        result[event] = hooks;
      }
    }

    return result;
  }

  // ==================== 个人认证配置 ====================

  /**
   * 加载个人认证配置
   *
   * 从用户目录加载 API 密钥等认证信息
   *
   * @returns 认证配置
   */
  async loadAuthConfig(): Promise<AuthConfig> {
    const authPath = path.join(this.userConfigDir, 'auth.json');

    if (!(await this.fileExists(authPath))) {
      return {};
    }

    const content = await fs.readFile(authPath, 'utf-8');
    return JSON.parse(content) as AuthConfig;
  }

  /**
   * 保存个人认证配置
   *
   * @param config - 认证配置
   */
  async saveAuthConfig(config: AuthConfig): Promise<void> {
    await fs.mkdir(this.userConfigDir, { recursive: true });

    const authPath = path.join(this.userConfigDir, 'auth.json');
    await fs.writeFile(authPath, JSON.stringify(config, null, 2), 'utf-8');

    // 设置文件权限为仅用户可读写
    await fs.chmod(authPath, 0o600);
  }

  // ==================== .gitignore 管理 ====================

  /**
   * 确保 .gitignore 包含必要的条目
   *
   * 自动添加敏感文件和本地配置到 .gitignore
   */
  async ensureGitignore(): Promise<void> {
    const gitignorePath = path.join(this.projectDir, '.gitignore');
    let content = '';

    if (await this.fileExists(gitignorePath)) {
      content = await fs.readFile(gitignorePath, 'utf-8');
    }

    const linesToAdd: string[] = [];

    for (const entry of DEFAULT_GITIGNORE_ENTRIES) {
      if (entry && !content.includes(entry)) {
        linesToAdd.push(entry);
      }
    }

    if (linesToAdd.length > 0) {
      const newContent = content.trim()
        ? content.trim() + '\n\n' + linesToAdd.join('\n') + '\n'
        : linesToAdd.join('\n') + '\n';

      await fs.writeFile(gitignorePath, newContent, 'utf-8');
    }
  }

  /**
   * 检查文件是否应该被忽略
   *
   * @param filePath - 文件路径
   * @returns 是否应该被忽略
   */
  shouldIgnoreFile(filePath: string): boolean {
    const fileName = path.basename(filePath);

    for (const pattern of SENSITIVE_FILE_PATTERNS) {
      if (pattern.startsWith('*')) {
        // 通配符匹配
        const ext = pattern.slice(1);
        if (fileName.endsWith(ext)) {
          return true;
        }
      } else if (fileName === pattern) {
        return true;
      }
    }

    return false;
  }

  // ==================== 配置导出和导入 ====================

  /**
   * 导出配置模板
   *
   * 将当前项目配置导出为可分享的模板
   *
   * @param name - 模板名称
   * @param description - 模板描述
   * @returns 配置模板
   */
  async exportConfigTemplate(name: string, description?: string): Promise<ConfigTemplate> {
    const config = await this.getShareableConfig();
    const skills = await this.listSkills();
    const commands = await this.listCommands();

    return {
      name,
      version: '1.0.0',
      description,
      createdAt: new Date().toISOString(),
      config,
      skills,
      commands,
    };
  }

  /**
   * 导出配置模板到文件
   *
   * @param outputPath - 输出文件路径
   * @param name - 模板名称
   * @param description - 模板描述
   */
  async exportConfigTemplateToFile(
    outputPath: string,
    name: string,
    description?: string
  ): Promise<void> {
    const template = await this.exportConfigTemplate(name, description);
    await fs.writeFile(outputPath, JSON.stringify(template, null, 2), 'utf-8');
  }

  /**
   * 导入配置模板
   *
   * @param template - 配置模板
   * @param options - 导入选项
   */
  async importConfigTemplate(template: ConfigTemplate, options: ImportOptions = {}): Promise<void> {
    const { overwrite = false, skipSkills = false, skipCommands = false } = options;

    // 导入配置
    if (overwrite) {
      await this.saveShareableConfig(template.config);
    } else {
      const existingConfig = await this.getShareableConfig();
      const mergedConfig = this.mergeConfigs(existingConfig, template.config);
      await this.saveShareableConfig(mergedConfig);
    }

    // 导入技能
    if (!skipSkills && template.skills) {
      // 技能文件需要单独处理，这里只记录名称
      console.log(`Template contains ${template.skills.length} skills`);
    }

    // 导入命令
    if (!skipCommands && template.commands) {
      // 命令文件需要单独处理，这里只记录名称
      console.log(`Template contains ${template.commands.length} commands`);
    }
  }

  /**
   * 从文件导入配置模板
   *
   * @param inputPath - 输入文件路径
   * @param options - 导入选项
   */
  async importConfigTemplateFromFile(
    inputPath: string,
    options: ImportOptions = {}
  ): Promise<void> {
    const content = await fs.readFile(inputPath, 'utf-8');
    const template = JSON.parse(content) as ConfigTemplate;

    // 验证模板格式
    if (!template.name || !template.config) {
      throw new Error('Invalid configuration template format');
    }

    await this.importConfigTemplate(template, options);
  }

  /**
   * 列出项目中的技能
   */
  private async listSkills(): Promise<string[]> {
    const skillsDir = path.join(this.projectConfigDir, 'skills');

    if (!(await this.fileExists(skillsDir))) {
      return [];
    }

    const entries = await fs.readdir(skillsDir);
    return entries.filter((e) => e.endsWith('.md'));
  }

  /**
   * 列出项目中的命令
   */
  private async listCommands(): Promise<string[]> {
    const commandsDir = path.join(this.projectConfigDir, 'commands');

    if (!(await this.fileExists(commandsDir))) {
      return [];
    }

    const entries = await fs.readdir(commandsDir);
    return entries.filter((e) => e.endsWith('.md'));
  }

  // ==================== 配置验证 ====================

  /**
   * 验证项目配置
   *
   * 检查配置的完整性、有效性和安全性
   *
   * @returns 验证结果
   */
  async validateProjectConfig(): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const config = await this.getShareableConfig();

    // 验证模型配置
    if (config.model) {
      const validModels = [
        'claude-sonnet-4-5-20250929',
        'claude-3-opus-latest',
        'claude-3-haiku-latest',
      ];
      if (!validModels.some((m) => config.model?.includes(m.split('-')[2]))) {
        warnings.push({
          type: 'recommendation',
          path: 'model',
          message: `Recommended to use official model names: ${validModels.join(', ')}`,
        });
      }
    }

    // 验证权限模式
    if (config.permissionMode) {
      const validModes = ['default', 'acceptEdits', 'bypassPermissions', 'plan'];
      if (!validModes.includes(config.permissionMode)) {
        errors.push({
          type: 'invalid',
          path: 'permissionMode',
          message: `Invalid permission mode: ${config.permissionMode}`,
        });
      }

      if (config.permissionMode === 'bypassPermissions') {
        warnings.push({
          type: 'recommendation',
          path: 'permissionMode',
          message: 'bypassPermissions mode is not recommended in shared config',
        });
      }
    }

    // 验证工具配置
    if (config.allowedTools && config.disallowedTools) {
      const overlap = config.allowedTools.filter((t) => config.disallowedTools?.includes(t));
      if (overlap.length > 0) {
        errors.push({
          type: 'conflict',
          path: 'tools',
          message: `Tool appears in both allowedTools and disallowedTools: ${overlap.join(', ')}`,
        });
      }
    }

    // 验证 MCP 服务器配置
    if (config.mcpServers) {
      for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
        const validation = this.validateMcpServerConfig(name, serverConfig);
        errors.push(...validation.errors);
        warnings.push(...validation.warnings);
      }
    }

    // 检查敏感信息
    const sensitiveCheck = this.checkSensitiveInfo(config);
    warnings.push(...sensitiveCheck);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 验证 MCP 服务器配置
   */
  private validateMcpServerConfig(
    name: string,
    config: unknown
  ): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const serverConfig = config as Record<string, unknown>;

    // 检查 stdio 配置
    if ('command' in serverConfig) {
      if (typeof serverConfig.command !== 'string') {
        errors.push({
          type: 'invalid',
          path: `mcpServers.${name}.command`,
          message: 'command must be a string',
        });
      }
      if (!Array.isArray(serverConfig.args)) {
        errors.push({
          type: 'invalid',
          path: `mcpServers.${name}.args`,
          message: 'args must be an array',
        });
      }
    }

    // 检查 SSE/HTTP 配置
    if ('type' in serverConfig) {
      const type = serverConfig.type as string;
      if (!['sse', 'http'].includes(type)) {
        errors.push({
          type: 'invalid',
          path: `mcpServers.${name}.type`,
          message: `Invalid type value: ${type}`,
        });
      }
      if (typeof serverConfig.url !== 'string') {
        errors.push({
          type: 'invalid',
          path: `mcpServers.${name}.url`,
          message: 'url must be a string',
        });
      }
    }

    // 检查环境变量中的硬编码值
    if (serverConfig.env) {
      const env = serverConfig.env as Record<string, string>;
      for (const [key, value] of Object.entries(env)) {
        if (!value.startsWith('${') && this.looksLikeSensitive(key, value)) {
          warnings.push({
            type: 'recommendation',
            path: `mcpServers.${name}.env.${key}`,
            message: `Recommend using environment variable reference instead of hardcoded value: \${${key}}`,
          });
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * 检查配置中的敏感信息
   */
  private checkSensitiveInfo(config: ProjectConfig): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];
    const configStr = JSON.stringify(config);

    // 检查常见的敏感模式
    const sensitivePatterns = [
      { pattern: /sk-[a-zA-Z0-9]{20,}/, name: 'API Key' },
      { pattern: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub Token' },
      { pattern: /password\s*[:=]\s*["'][^"']+["']/i, name: 'Password' },
      { pattern: /secret\s*[:=]\s*["'][^"']+["']/i, name: 'Secret' },
    ];

    for (const { pattern, name } of sensitivePatterns) {
      if (pattern.test(configStr)) {
        warnings.push({
          type: 'recommendation',
          path: 'config',
          message: `Config may contain ${name}, recommend using environment variables`,
        });
      }
    }

    return warnings;
  }

  /**
   * 判断值是否看起来像敏感信息
   */
  private looksLikeSensitive(key: string, value: string): boolean {
    const sensitiveKeys = ['key', 'token', 'secret', 'password', 'credential', 'auth'];
    const keyLower = key.toLowerCase();

    return (
      sensitiveKeys.some((k) => keyLower.includes(k)) &&
      value.length > 10 &&
      !value.startsWith('${')
    );
  }

  /**
   * 验证团队配置一致性
   *
   * 比较本地配置和共享配置，检查是否存在冲突
   *
   * @returns 一致性检查结果
   */
  async validateTeamConsistency(): Promise<ConsistencyResult> {
    const sharedConfig = await this.getShareableConfig();
    const localConfig = await this.loadLocalConfig();
    const differences: ConfigDifference[] = [];

    // 比较关键配置项
    const keysToCompare = ['model', 'permissionMode', 'maxTurns', 'maxBudgetUsd'];

    for (const key of keysToCompare) {
      const sharedValue = (sharedConfig as Record<string, unknown>)[key];
      const localValue = (localConfig as Record<string, unknown>)[key];

      if (localValue !== undefined && sharedValue !== undefined && localValue !== sharedValue) {
        differences.push({
          key,
          sharedValue,
          localValue,
          recommendation: `本地配置 ${key} 与共享配置不同，请确认是否有意为之`,
        });
      }
    }

    return {
      consistent: differences.length === 0,
      differences,
    };
  }

  // ==================== 辅助方法 ====================

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * 认证配置接口
 *
 * 注意：API 密钥由 Claude Agent SDK 自动从 Claude Code 配置中获取，
 * 不再需要在此处手动配置
 */
export interface AuthConfig {
  /** 其他认证信息 */
  [key: string]: string | undefined;
}

/**
 * 导入选项
 */
export interface ImportOptions {
  /** 是否覆盖现有配置 */
  overwrite?: boolean;
  /** 是否跳过技能导入 */
  skipSkills?: boolean;
  /** 是否跳过命令导入 */
  skipCommands?: boolean;
}

/**
 * 配置差异
 */
export interface ConfigDifference {
  /** 配置键 */
  key: string;
  /** 共享配置值 */
  sharedValue: unknown;
  /** 本地配置值 */
  localValue: unknown;
  /** 建议 */
  recommendation: string;
}

/**
 * 一致性检查结果
 */
export interface ConsistencyResult {
  /** 是否一致 */
  consistent: boolean;
  /** 差异列表 */
  differences: ConfigDifference[];
}
