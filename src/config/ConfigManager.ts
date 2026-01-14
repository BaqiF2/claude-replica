/**
 * 文件功能：配置管理模块，负责加载和管理项目配置
 *
 * 核心类：
 * - ConfigManager: 配置管理器核心类
 *
 * 核心方法：
 * - loadProjectConfig(): 加载项目级配置
 * - loadClaudeMd(): 加载项目 CLAUDE.md 文件
 * - ensureUserConfigDir(): 确保用户配置目录存在
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  SDKConfigLoader,
  SDKOptions,
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

  /** 缓存的项目配置（按目录） */
  private cachedProjectConfigs: Map<string, ProjectConfig> = new Map();

  constructor() {
    this.loader = new SDKConfigLoader();
    // 用户配置目录
    this.userConfigDir = path.join(os.homedir(), '.claude');
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
