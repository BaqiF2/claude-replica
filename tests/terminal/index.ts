/**
 * 终端测试模块入口
 * 导出所有终端测试相关的类型和工具
 */

// 导出类型定义
export * from './types';

// 导出设置工具
export {
  registerProcess,
  unregisterProcess,
  cleanupAllProcesses,
} from './setup';
