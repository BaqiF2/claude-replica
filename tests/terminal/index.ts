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

// 导出测试辅助函数
export {
  createTestTerminal,
  createTestTerminalWithCleanup,
  runCLI,
  expectOutput,
  expectOutputExact,
  expectExitCode,
  expectValidJSON,
  expectValidStreamJSON,
  expectJSONSchema,
  waitForOutput,
  ExitCodes,
  OutputFormats,
  type CLIRunOptions,
  type CLIRunResult,
  type TestTerminalOptions,
  type OutputExpectOptions,
} from './helpers';
