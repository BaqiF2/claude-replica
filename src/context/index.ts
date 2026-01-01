/**
 * 上下文管理模块
 *
 * 提供智能上下文管理功能，包括：
 * - Token 计数和限制管理
 * - 历史消息压缩
 * - 智能文件片段提取
 * - 对话摘要生成
 * - 上下文窗口管理
 *
 * @module context
 */

export {
  ContextManager,
  TokenCount,
  MessageImportance,
  ScoredMessage,
  FileFragment,
  ConversationSummary,
  ContextWindowState,
  CompressionStrategy,
  CompressionOptions,
  CompressionResult,
  ContextManagerConfig,
} from './ContextManager';
