/**
 * 文件功能：配置管理模块，负责加载、合并和管理用户配置和项目配置
 *
 * 核心类：
 * - ConfigManager: 配置管理器核心类
 *
 * 核心方法：
 * - loadUserConfig(): 加载用户级配置
 * - loadProjectConfig(): 加载项目级配置
 * - mergeConfigs(): 合并多个配置源
 * - loadClaudeMd(): 加载项目 CLAUDE.md 文件
 * - ensureUserConfigDir(): 确保用户配置目录存在
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
 * 配置管理器核心类
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
    // 用户配置目录
    this.userConfigDir = path.join(os.homedir(), '.claude');
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
  mergeConfigs(user: UserConfig, project: ProjectConfig, local?: ProjectConfig): ProjectConfig {
    // 先合并用户和项目配置
    let merged = this.loader.mergeConfigs(user, project) as ProjectConfig;

    // 如果有本地配置，再合并本地配置（最高优先级）
    if (local) {
      merged = this.loader.mergeConfigs(merged, local) as ProjectConfig;
    }

    return merged;
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
   * 确保用户配置目录存在
   */
  async ensureUserConfigDir(): Promise<void> {
    await fs.mkdir(this.userConfigDir, { recursive: true });
  }

}
