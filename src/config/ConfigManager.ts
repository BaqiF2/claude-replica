/**
 * 文件功能：配置管理模块，负责加载和管理项目配置
 *
 * 作用说明：合并 CLI/配置文件选项，提供权限配置与 SDK 配置加载的统一入口。
 *
 * 核心导出：
 * - ConfigManager
 * - SDKConfigLoader
 * - SDKOptions
 * - ProjectConfig
 * - PermissionMode
 * - HookEvent
 * - HookConfig
 * - McpServerConfig
 * - AgentDefinition
 * - SandboxSettings
 *
 * 核心类：
 * - ConfigManager: 配置管理器核心类
 *
 * 核心方法：
 * - loadProjectConfig(): 加载项目级配置
 * - loadClaudeMd(): 加载项目 CLAUDE.md 文件
 * - ensureUserConfigDir(): 确保用户配置目录存在
 * - build(): 合并 CLI 选项和项目配置
 * - buildPermissionConfigOnly(): 构建权限配置
 * - loadPermissionConfig(): 直接加载权限配置
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { ConfigOverrides } from './ConfigOverrides';
import type { Logger } from '../logging/Logger';
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
import type { PermissionConfig } from '../permissions/PermissionManager';

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

  constructor(logger: Logger) {
    this.loader = new SDKConfigLoader(logger);
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
   * 直接加载权限配置
   *
   * @param options - 外部传入的配置覆写选项
   * @param workingDir - 工作目录
   * @returns 权限配置对象
   */
  async loadPermissionConfig(
    options: ConfigOverrides,
    workingDir: string
  ): Promise<PermissionConfig> {
    const projectConfig = await this.loadProjectConfig(workingDir);
    return this.buildPermissionConfigOnly(options, projectConfig);
  }

  /**
   * 合并 CLI 选项到配置
   *
   * CLI 选项优先级高于配置文件
   *
   * @param options - 外部传入的配置覆写选项
   * @param projectConfig - 已合并的配置（用户 + 项目）
   * @returns 最终合并的配置
   */
  build(options: ConfigOverrides, projectConfig: ProjectConfig): ProjectConfig {
    const result = { ...projectConfig };

    // CLI 选项覆盖配置文件中的值
    if (options.model) result.model = options.model;
    if (options.allowedTools) result.allowedTools = options.allowedTools;
    if (options.disallowedTools) result.disallowedTools = options.disallowedTools;
    if (options.permissionMode) result.permissionMode = options.permissionMode;
    if (options.maxTurns !== undefined) result.maxTurns = options.maxTurns;
    if (options.maxBudgetUsd !== undefined) result.maxBudgetUsd = options.maxBudgetUsd;
    if (options.maxThinkingTokens !== undefined)
      result.maxThinkingTokens = options.maxThinkingTokens;
    if (options.sandbox) result.sandbox = { enabled: true };

    return result;
  }

  /**
   * 构建权限配置
   *
   * @param options - 外部传入的配置覆写选项
   * @param config - 项目配置
   * @returns 权限配置对象
   */
  buildPermissionConfig(options: ConfigOverrides, config: ProjectConfig): PermissionConfig {
    return {
      mode: options.permissionMode || config.permissionMode || 'acceptEdits',
      allowedTools: options.allowedTools || config.allowedTools,
      disallowedTools: options.disallowedTools || config.disallowedTools,
      allowDangerouslySkipPermissions: options.allowDangerouslySkipPermissions || false,
    };
  }

  /**
   * 从 CLI 选项和项目配置直接构建权限配置（便捷方法）
   *
   * 该方法是 buildPermissionConfig 的简化版本，直接从原始 projectConfig 构建权限配置，
   * 内部处理 CLI 选项的合并逻辑，无需额外的中间步骤。
   *
   * @param options - 外部传入的配置覆写选项
   * @param projectConfig - 原始项目配置（未合并 CLI 选项）
   * @returns 权限配置对象
   */
  buildPermissionConfigOnly(
    options: ConfigOverrides,
    projectConfig: ProjectConfig
  ): PermissionConfig {
    // 先应用 CLI 选项
    const mergedConfig = this.build(options, projectConfig);

    // 返回权限配置
    return {
      mode: mergedConfig.permissionMode || 'acceptEdits',
      allowedTools: mergedConfig.allowedTools,
      disallowedTools: mergedConfig.disallowedTools,
      allowDangerouslySkipPermissions: options.allowDangerouslySkipPermissions || false,
      allowedCommands: [],
      disallowedCommands: [],
    };
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
