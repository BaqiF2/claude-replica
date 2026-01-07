/**
 * 文件功能：错误处理模块，负责分类和处理应用程序错误
 *
 * 核心类：ErrorHandler
 * 核心方法：
 * - handle(): 处理错误并返回退出码
 */

import { CLIParseError } from '../cli/CLIParser';
import { EnvConfig } from '../config';

// 退出码定义
const ExitCodes = {
  SUCCESS: 0,
  ERROR: 1,
  CONFIG_ERROR: 2,
  AUTH_ERROR: 3,
  NETWORK_ERROR: 4,
  TIMEOUT_ERROR: 5,
  PERMISSION_ERROR: 6,
  TOOL_ERROR: 7,
} as const;

/**
 * ErrorHandler - 应用程序错误处理器
 *
 * 职责：
 * - 分类错误（CLI 解析、超时、网络、认证等）
 * - 输出友好的错误信息
 * - 返回合适的退出码
 */
export class ErrorHandler {
  /**
   * 处理错误并返回退出码
   *
   * @param error - 捕获的错误
   * @returns 应用程序退出码
   */
  handle(error: unknown): number {
    // CLI 参数解析错误
    if (error instanceof CLIParseError) {
      console.error(`Argument error: ${error.message}`);
      console.error('Use --help for help information');
      return ExitCodes.CONFIG_ERROR;
    }

    // 超时错误
    if (error instanceof Error && error.name === 'TimeoutError') {
      console.error(`Timeout error: ${error.message}`);
      return ExitCodes.TIMEOUT_ERROR;
    }

    // 标准错误对象
    if (error instanceof Error) {
      // 网络连接错误
      if (this.isNetworkError(error)) {
        console.error(
          'Network error: Unable to connect to server, please check your network connection'
        );
        console.error('Hint: Will retry automatically...');
        return ExitCodes.NETWORK_ERROR;
      }

      // API 认证错误
      if (this.isAuthError(error)) {
        console.error(
          'API error: Authentication failed, please check ANTHROPIC_API_KEY environment variable'
        );
        return ExitCodes.AUTH_ERROR;
      }

      // 通用错误
      console.error(`Error: ${error.message}`);

      if (EnvConfig.isDebugMode()) {
        console.error(error.stack);
      }

      return ExitCodes.ERROR;
    }

    // 未知错误类型
    console.error('Unknown error:', error);
    return ExitCodes.ERROR;
  }

  /**
   * 检查是否为网络错误
   */
  private isNetworkError(error: Error): boolean {
    return error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED');
  }

  /**
   * 检查是否为认证错误
   */
  private isAuthError(error: Error): boolean {
    return (
      error.message.includes('API') ||
      error.message.includes('401') ||
      error.message.includes('403')
    );
  }
}
