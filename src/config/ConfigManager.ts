/**
 * 配置管理器
 *
 * 负责加载、合并和管理用户配置和项目配置
 * 提供统一的配置访问接口
 *
 * @module ConfigManager
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  SDKConfigLoader,
  SDKOptions,
  UserConfig,
  ProjectConfig,
  PermissionMode,
  HookEvent,
  HookConfig,
  McpServerConfig,
  AgentDefinition,
  SandboxSettings,
} from './SDKConfigLoader';

// 重新导出类型
export {
  SDKConfigLoader,
  SDKOptions,
  UserConfig,
  ProjectConfig,
  PermissionMode,
  HookEvent,
  HookConfig,
  McpServerConfig,
  AgentDefinition,
  SandboxSettings,
};

/**
 * 配置管理器
 *
 * 封装 SDKConfigLoader，提供更高级的配置管理功能
 */
export class ConfigManager {
  /** SDK 配置加载器 */
  private readonly loader: SDKConfigLoader;

  /** 用户配置目录 */
  private readonly userConfigDir: string;

  /** 缓存的用户配置 */
  private cachedUserConfig: UserConfig | null = null;

  /** 缓存的项目配置（按目录） */
  private cachedProjectConfigs: Map<string, ProjectConfig> = new Map();

  constructor() {
    this.loader = new SDKConfigLoader();
    this.userConfigDir = path.join(os.homedir(), '.claude-replica');
  }

  /**
   * 获取 SDK 配置加载器实例
   */
  getLoader(): SDKConfigLoader {
    return this.loader;
  }

  /**
   * 加载用户配置
   *
   * @returns 用户配置对象
   */
  async loadUserConfig(): Promise<UserConfig> {
    if (this.cachedUserConfig) {
      return this.cachedUserConfig;
    }

    const config = await this.loader.loadUserConfig();
    this.cachedUserConfig = config;
    return config;
  }

  /**
   * 加载项目配置
   *
   * @param directory - 项目目录
   * @returns 项目配置对象
   */
  async loadProjectConfig(directory: string): Promise<ProjectConfig> {
    const cached = this.cachedProjectConfigs.get(directory);
    if (cached) {
      return cached;
    }

    const config = await this.loader.loadProjectConfig(directory);
    this.cachedProjectConfigs.set(directory, config);
    return config;
  }

  /**
   * 合并配置
   *
   * @param user - 用户配置
   * @param project - 项目配置
   * @param local - 本地配置（可选）
   * @returns 合并后的配置
   */
  mergeConfigs(
    user: UserConfig,
    project: ProjectConfig,
    local?: ProjectConfig
  ): ProjectConfig {
    // 先合并用户和项目配置
    let merged = this.loader.mergeConfigs(user, project) as ProjectConfig;

    // 如果有本地配置，再合并本地配置（最高优先级）
    if (local) {
      merged = this.loader.mergeConfigs(merged, local) as ProjectConfig;
    }

    return merged;
  }

  /**
   * 保存配置到文件
   *
   * @param config - 配置对象
   * @param configPath - 配置文件路径
   */
  async saveConfig(config: UserConfig | ProjectConfig, configPath: string): Promise<void> {
    const dir = path.dirname(configPath);

    // 确保目录存在
    await fs.mkdir(dir, { recursive: true });

    // 写入配置文件
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // 清除缓存
    this.clearCache();
  }

  /**
   * 加载 CLAUDE.md 文件内容
   *
   * @param directory - 项目目录
   * @returns CLAUDE.md 内容
   */
  async loadClaudeMd(directory: string): Promise<string | null> {
    return this.loader.loadClaudeMd(directory);
  }

  /**
   * 加载完整的配置
   *
   * @param workingDir - 工作目录
   * @returns 合并后的配置
   */
  async loadFullConfig(workingDir: string): Promise<UserConfig> {
    return this.loader.loadFullConfig(workingDir);
  }

  /**
   * 确保用户配置目录存在
   */
  async ensureUserConfigDir(): Promise<void> {
    await fs.mkdir(this.userConfigDir, { recursive: true });
  }

  /**
   * 获取用户配置目录路径
   */
  getUserConfigDir(): string {
    return this.userConfigDir;
  }

  /**
   * 清除配置缓存
   */
  clearCache(): void {
    this.cachedUserConfig = null;
    this.cachedProjectConfigs.clear();
  }

  /**
   * 验证配置文件格式
   *
   * @param configPath - 配置文件路径
   * @returns 验证结果
   */
  async validateConfig(configPath: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);

      // 验证 model 字段
      if (config.model && typeof config.model !== 'string') {
        errors.push('model 必须是字符串类型');
      }

      // 验证 maxTurns 字段
      if (config.maxTurns !== undefined) {
        if (typeof config.maxTurns !== 'number' || config.maxTurns < 1) {
          errors.push('maxTurns 必须是正整数');
        }
      }

      // 验证 maxBudgetUsd 字段
      if (config.maxBudgetUsd !== undefined) {
        if (typeof config.maxBudgetUsd !== 'number' || config.maxBudgetUsd < 0) {
          errors.push('maxBudgetUsd 必须是非负数');
        }
      }

      // 验证 permissionMode 字段
      if (config.permissionMode) {
        const validModes = ['default', 'acceptEdits', 'bypassPermissions', 'plan'];
        if (!validModes.includes(config.permissionMode)) {
          errors.push(`permissionMode 必须是以下值之一: ${validModes.join(', ')}`);
        }
      }

      // 验证 allowedTools 字段
      if (config.allowedTools && !Array.isArray(config.allowedTools)) {
        errors.push('allowedTools 必须是数组类型');
      }

      // 验证 disallowedTools 字段
      if (config.disallowedTools && !Array.isArray(config.disallowedTools)) {
        errors.push('disallowedTools 必须是数组类型');
      }

      return { valid: errors.length === 0, errors };
    } catch (error) {
      if (error instanceof SyntaxError) {
        errors.push(`JSON 解析错误: ${error.message}`);
      } else {
        errors.push(`读取配置文件失败: ${(error as Error).message}`);
      }
      return { valid: false, errors };
    }
  }
}
