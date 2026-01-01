/**
 * Claude Replica - 完整复刻 Claude Code 的智能代码助手
 *
 * 主入口文件，导出核心 API
 */

// 主程序入口
export { main, Application } from './main';

// CLI 组件
export { CLIParser, CLIOptions, CLIParseError, PermissionMode as CLIPermissionMode, OutputFormat as CLIOutputFormat, SettingSource } from './cli/CLIParser';

// 核心组件
export { SessionManager, Session, SessionContext, Message, ContentBlock, Skill as SessionSkill, Agent as SessionAgent } from './core/SessionManager';
export { MessageRouter, QueryOptions, QueryResult, MessageRouterOptions } from './core/MessageRouter';
export { StreamingMessageProcessor } from './core/StreamingMessageProcessor';

// 工具组件
export { ToolRegistry } from './tools/ToolRegistry';

// 权限组件
export { PermissionManager, PermissionConfig, PermissionRecord, CanUseTool, PromptUserCallback, ToolUseParams, ToolUseContext, PermissionMode } from './permissions/PermissionManager';

// 配置组件
export { ConfigManager, SDKConfigLoader, SDKOptions, UserConfig, ProjectConfig, HookEvent as ConfigHookEvent, HookConfig as ConfigHookConfig, McpServerConfig as ConfigMcpServerConfig, AgentDefinition, SandboxSettings } from './config';

// 技能组件
export { SkillManager, Skill, SkillManagerConfig } from './skills';

// 命令组件
export { CommandManager, Command, CommandManagerConfig, CommandExecutionResult } from './commands';

// 代理组件
export { AgentRegistry, Agent, AgentRegistryConfig } from './agents';

// 钩子组件
export { HookManager, Hook, HookContext, HookEvent, HookConfig, HookMatcher, SDKHookCallbackMatcher, SDKHookConfig, HookExecutionResult, PromptHookHandler, HookManagerOptions, ALL_HOOK_EVENTS } from './hooks';

// MCP 组件
export { MCPManager, McpStdioServerConfig, McpSSEServerConfig, McpHttpServerConfig, McpServerConfig, MCPServerConfigMap, ConfigValidationResult, ServerInfo, MCPManagerOptions } from './mcp';

// 回退组件
export { RewindManager, Snapshot, FileSnapshot, SnapshotMetadata, RewindManagerOptions, RestoreResult } from './rewind';

// 插件组件
export { PluginManager, Plugin, PluginMetadata, PluginContent, PluginInstallResult, PluginManagerConfig, PluginSourceType } from './plugins';

// UI 组件
export { InteractiveUI, InteractiveUIOptions, Snapshot as UISnapshot, MessageRole, ProgressStatus, MenuItem } from './ui';

// 输出组件
export { OutputFormatter, OutputFormat, VALID_OUTPUT_FORMATS, QueryResult as OutputQueryResult, ToolCall, JsonOutput, StreamJsonOutput } from './output';

// 图像组件
export { ImageHandler, ImageData, ImageContentBlock, ImageProcessOptions, ImageError, ImageErrorCode, ImageFormat, SUPPORTED_IMAGE_FORMATS, IMAGE_MIME_TYPES, MAX_IMAGE_SIZE_BYTES, MAX_IMAGE_DIMENSION } from './image';

// 上下文管理组件
export { ContextManager, TokenCount, MessageImportance, ScoredMessage, FileFragment, ConversationSummary, ContextWindowState, CompressionStrategy, CompressionOptions, CompressionResult, ContextManagerConfig } from './context';

// 沙箱组件
export { SandboxManager, SandboxSettings as SandboxManagerSettings, NetworkSandboxSettings, SandboxIgnoreViolations, ViolationType, SandboxViolation, CommandCheckResult, NetworkCheckResult, SandboxManagerConfig } from './sandbox';
