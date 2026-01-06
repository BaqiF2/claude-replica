/**
 * 文件功能：SDK 模块统一导出，导出 SDK 查询执行器相关的所有类和接口
 */

export {
  SDKQueryExecutor,
  SDKQueryOptions,
  SDKQueryResult,
  SDKErrorType,
  SDKError,
  ERROR_MESSAGES,
  classifySDKError,
  createSDKError,
  getErrorMessage,
  mapToSDKOptions,
  // 流式输入相关类型
  TextContentBlock,
  ImageContentBlock,
  StreamContentBlock,
  StreamMessage,
  StreamMessageGenerator,
  // 消息回调类型
  SDKMessageCallback,
} from './SDKQueryExecutor';

// 流式查询管理器
export {
  StreamingQueryManager,
  StreamingQueryManagerOptions,
  StreamingSession,
  StreamingSessionState,
  QueuedMessage,
  MessageProcessResult,
  // 工具回调相关类型
  ToolUseInfo,
  ToolResultInfo,
  // 活跃消息生成器
  LiveMessageGenerator,
} from './StreamingQueryManager';

// 重新导出 SDK 类型以便其他模块使用
export type {
  PermissionMode,
  AgentDefinition,
  McpServerConfig,
  SandboxSettings,
  HookEvent,
  HookCallbackMatcher,
  CanUseTool,
  SDKMessage,
  SDKAssistantMessage,
} from '@anthropic-ai/claude-agent-sdk';
