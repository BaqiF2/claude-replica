/**
 * 文件功能：UI 模块统一导出，导出交互式 UI 相关的所有类和接口
 *
 * 向后兼容: 重新导出contracts中的接口
 */

// 从contracts统一导出所有接口
export * from './contracts';

// 从interactive子目录导出类型(向后兼容旧路径)
export {
  InteractiveUIInterface,
  InteractiveUICallbacks,
  InteractiveUIConfig,
  InteractiveUIOptions,
  Snapshot,
  MessageRole,
  MenuItem,
  PermissionMode,
  TodoItem,
  InteractiveUIRunner,
  InteractiveUIMethodLevels,
} from './contracts/interactive/InteractiveUIInterface';

// 从core子目录导出(向后兼容旧路径)
export type { ParserInterface } from './contracts/core/ParserInterface';
export type { OutputInterface, OutputOptions } from './contracts/core/OutputInterface';
export type { OptionsInterface } from './contracts/core/OptionsInterface';
export type { UIFactory } from './contracts/core/UIFactory';

// 导出实现类
export { TerminalInteractiveUI } from './TerminalInteractiveUI';
export { PermissionUIImpl } from './PermissionUIImpl';

// 导出基类和示例
export { BaseInteractiveUI, MinimalInteractiveUI } from './implementations/base';
