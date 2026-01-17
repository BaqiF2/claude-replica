/**
 * 文件功能：UI 模块统一导出，导出交互式 UI 相关的所有类和接口
 */

export {
  InteractiveUIInterface,
  InteractiveUICallbacks,
  InteractiveUIConfig,
  InteractiveUIOptions,
  Snapshot,
  MessageRole,
  MenuItem,
  PermissionMode,
} from './InteractiveUIInterface';

export { TerminalInteractiveUI } from './TerminalInteractiveUI';

export { PermissionUIImpl } from './PermissionUIImpl';
