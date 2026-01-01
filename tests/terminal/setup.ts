/**
 * 终端测试设置文件
 * 配置终端测试所需的超时时间和全局设置
 */

// 终端测试需要更长的超时时间（30秒）
jest.setTimeout(30000);

// 存储所有活跃的终端进程，用于清理
const activeProcesses: Set<{ kill: () => void }> = new Set();

/**
 * 注册一个终端进程以便在测试结束后清理
 */
export function registerProcess(process: { kill: () => void }): void {
  activeProcesses.add(process);
}

/**
 * 注销一个终端进程
 */
export function unregisterProcess(process: { kill: () => void }): void {
  activeProcesses.delete(process);
}

/**
 * 清理所有活跃的终端进程
 */
export function cleanupAllProcesses(): void {
  for (const process of activeProcesses) {
    try {
      process.kill();
    } catch {
      // 忽略清理错误
    }
  }
  activeProcesses.clear();
}

// 全局清理函数，确保测试结束后清理所有 PTY 进程
afterAll(() => {
  cleanupAllProcesses();
});

// 每个测试后清理，防止进程泄漏
afterEach(() => {
  cleanupAllProcesses();
});
