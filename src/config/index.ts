/**
 * 配置模块
 *
 * 导出配置管理相关的类和类型
 *
 * @module config
 */

export {
  SDKConfigLoader,
  SDKOptions,
  UserConfig,
  ProjectConfig,
  PermissionMode,
  HookEvent,
  HookConfig,
  HookDefinition,
  HookCallbackMatcher,
  HookContext,
  McpServerConfig,
  McpStdioServerConfig,
  McpSSEServerConfig,
  McpHttpServerConfig,
  AgentDefinition,
  SandboxSettings,
  NetworkSandboxSettings,
  SandboxIgnoreViolations,
  SettingSource,
} from './SDKConfigLoader';

export { ConfigManager } from './ConfigManager';

export { EnvConfig, EnvConfiguration, CIEnvironmentInfo, ENV_KEYS } from './EnvConfig';
