/**
 * SDK 模块导出
 *
 * 导出 SDK 查询执行器和相关类型
 *
 * @module sdk
 * **验证: 需求 1.1**
 */

// 导出 SDKQueryExecutor 类和相关类型
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
} from './SDKQueryExecutor';

// 重新导出 SDK 类型以便其他模块使用
export type {
  PermissionMode,
  AgentDefinition,
  McpServerConfig,
  SandboxSettings,
  HookEvent,
  HookCallbackMatcher,
  CanUseTool,
} from '@anthropic-ai/claude-agent-sdk';
