/**
 * 扩展性架构模块导出
 *
 * 提供完整的插件 API 和工具扩展能力。
 *
 * @module extensibility
 */

export {
  // 管理器
  ExtensibilityManager,
  ExtensibilityManagerConfig,

  // 工具定义
  CustomToolDefinition,
  ToolParameter,
  ParameterType,

  // 执行相关
  ToolExecutor,
  StreamingToolExecutor,
  ToolExecutionContext,
  ToolExecutionResult,
  StreamChunk,

  // 钩子相关
  ToolHookEvent,
  ToolHookContext,
  ToolHookHandler,

  // 错误类型
  ParameterValidationError,
  ToolExecutionError,
  ToolTimeoutError,
} from './ExtensibilityManager';
