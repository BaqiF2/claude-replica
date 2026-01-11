/**
 * 文件功能：配置构建器，负责将 CLI 选项和配置文件合并成最终配置
 *
 * 核心类：ConfigBuilder
 * 核心方法：
 * - build(): 合并 CLI 选项、用户配置和项目配置
 * - buildPermissionConfig(): 构建权限配置
 */

import { CLIOptions } from '../cli/CLIParser';
import { ProjectConfig } from './ConfigManager';
import { PermissionConfig } from '../permissions/PermissionManager';

/**
 * ConfigBuilder - 配置构建器
 *
 * 职责：
 * - 将 CLI 选项应用到配置上
 * - 合并多个配置源
 * - 构建特定的配置对象（如权限配置）
 */
export class ConfigBuilder {
  /**
   * 合并 CLI 选项到配置
   *
   * CLI 选项优先级高于配置文件
   *
   * @param options - CLI 解析出的选项
   * @param mergedConfig - 已合并的配置（用户 + 项目）
   * @returns 最终合并的配置
   */
  build(options: CLIOptions, mergedConfig: ProjectConfig): ProjectConfig {
    const result = { ...mergedConfig };

    // CLI 选项覆盖配置文件中的值
    if (options.model) result.model = options.model;
    if (options.allowedTools) result.allowedTools = options.allowedTools;
    if (options.disallowedTools) result.disallowedTools = options.disallowedTools;
    if (options.permissionMode) result.permissionMode = options.permissionMode;
    if (options.maxTurns !== undefined) result.maxTurns = options.maxTurns;
    if (options.maxBudgetUsd !== undefined) result.maxBudgetUsd = options.maxBudgetUsd;
    if (options.maxThinkingTokens !== undefined)
      result.maxThinkingTokens = options.maxThinkingTokens;
    if (options.enableFileCheckpointing)
      result.enableFileCheckpointing = options.enableFileCheckpointing;
    if (options.sandbox) result.sandbox = { enabled: true };

    return result;
  }

  /**
   * 构建权限配置
   *
   * @param options - CLI 解析出的选项
   * @param config - 项目配置
   * @returns 权限配置对象
   */
  buildPermissionConfig(options: CLIOptions, config: ProjectConfig): PermissionConfig {
    return {
      mode: options.permissionMode || config.permissionMode || 'acceptEdits',
      allowedTools: options.allowedTools || config.allowedTools,
      disallowedTools: options.disallowedTools || config.disallowedTools,
      allowDangerouslySkipPermissions: options.allowDangerouslySkipPermissions || false,
    };
  }
}
