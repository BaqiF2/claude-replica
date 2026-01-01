/**
 * 终端模拟器
 *
 * 使用 node-pty 创建伪终端会话，模拟真实用户与 CLI 工具的交互
 * 支持输入输出捕获、特殊按键发送、超时处理等功能
 *
 * @module TerminalEmulator
 */

import * as pty from 'node-pty';
import { ANSIParser } from './ANSIParser';
import {
  SpecialKey,
  TerminalEmulatorOptions,
  TerminalTestError,
  TerminalTestErrorType,
} from './types';

/**
 * 特殊按键到字节序列的映射
 */
const SPECIAL_KEY_SEQUENCES: Record<SpecialKey, string> = {
  [SpecialKey.ENTER]: '\r',
  [SpecialKey.CTRL_C]: '\x03',
  [SpecialKey.CTRL_D]: '\x04',
  [SpecialKey.ESCAPE]: '\x1b',
  [SpecialKey.TAB]: '\t',
  [SpecialKey.BACKSPACE]: '\x7f',
  [SpecialKey.UP]: '\x1b[A',
  [SpecialKey.DOWN]: '\x1b[B',
  [SpecialKey.LEFT]: '\x1b[D',
  [SpecialKey.RIGHT]: '\x1b[C',
};

/**
 * 终端模拟器类
 *
 * 提供 PTY 会话管理和输入输出处理功能
 */
export class TerminalEmulator {
  private ptyProcess: pty.IPty | null = null;
  private output: string = '';
  private exitCode: number | null = null;
  private exitPromise: Promise<number> | null = null;
  private exitResolve: ((code: number) => void) | null = null;
  private ansiParser: ANSIParser;
  private isDisposed: boolean = false;
  private dataListeners: Array<(data: string) => void> = [];

  /**
   * 创建终端模拟器实例
   *
   * @param options - 终端模拟器选项
   */
  constructor(private options: TerminalEmulatorOptions) {
    this.ansiParser = new ANSIParser();
  }

  /**
   * 启动终端会话
   *
   * 创建 PTY 进程并开始捕获输出
   *
   * @throws {TerminalTestError} 当 PTY 创建失败时抛出
   */
  async start(): Promise<void> {
    if (this.isDisposed) {
      throw new TerminalTestError(
        TerminalTestErrorType.PTY_CREATE_FAILED,
        '终端模拟器已被销毁，无法重新启动'
      );
    }

    if (this.ptyProcess) {
      throw new TerminalTestError(
        TerminalTestErrorType.PTY_CREATE_FAILED,
        '终端会话已经启动'
      );
    }

    try {
      // 合并环境变量
      const env = {
        ...process.env,
        ...this.options.env,
        // 确保终端类型设置正确
        TERM: 'xterm-256color',
      };

      // 创建 PTY 进程
      this.ptyProcess = pty.spawn(this.options.command, this.options.args || [], {
        name: 'xterm-256color',
        cols: this.options.cols || 80,
        rows: this.options.rows || 24,
        cwd: this.options.cwd || process.cwd(),
        env: env as Record<string, string>,
      });

      // 设置退出 Promise
      this.exitPromise = new Promise<number>((resolve) => {
        this.exitResolve = resolve;
      });

      // 监听输出
      this.ptyProcess.onData((data: string) => {
        this.output += data;
        // 通知所有数据监听器
        this.dataListeners.forEach((listener) => listener(data));
      });

      // 监听退出
      this.ptyProcess.onExit(({ exitCode }) => {
        this.exitCode = exitCode;
        if (this.exitResolve) {
          this.exitResolve(exitCode);
        }
      });
    } catch (error) {
      throw new TerminalTestError(
        TerminalTestErrorType.PTY_CREATE_FAILED,
        `PTY 创建失败: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 发送输入到终端
   *
   * @param data - 要发送的字符串数据
   */
  write(data: string): void {
    if (!this.ptyProcess) {
      throw new TerminalTestError(
        TerminalTestErrorType.PROCESS_START_FAILED,
        '终端会话未启动'
      );
    }

    if (this.isDisposed) {
      throw new TerminalTestError(
        TerminalTestErrorType.PROCESS_START_FAILED,
        '终端模拟器已被销毁'
      );
    }

    this.ptyProcess.write(data);
  }

  /**
   * 发送特殊按键
   *
   * @param key - 特殊按键枚举值
   */
  sendKey(key: SpecialKey): void {
    const sequence = SPECIAL_KEY_SEQUENCES[key];
    if (!sequence) {
      throw new TerminalTestError(
        TerminalTestErrorType.INVALID_CONFIG,
        `未知的特殊按键: ${key}`
      );
    }
    this.write(sequence);
  }

  /**
   * 等待输出匹配指定模式
   *
   * @param pattern - 要匹配的字符串或正则表达式
   * @param timeout - 超时时间（毫秒），默认使用选项中的超时时间
   * @returns 匹配时的完整输出
   * @throws {TerminalTestError} 当超时时抛出
   */
  async waitFor(pattern: string | RegExp, timeout?: number): Promise<string> {
    const timeoutMs = timeout ?? this.options.timeout ?? 10000;

    return new Promise<string>((resolve, reject) => {
      // 检查当前输出是否已匹配
      const checkMatch = (): boolean => {
        const strippedOutput = this.getStrippedOutput();
        if (typeof pattern === 'string') {
          return strippedOutput.includes(pattern);
        } else {
          return pattern.test(strippedOutput);
        }
      };

      // 如果已经匹配，立即返回
      if (checkMatch()) {
        resolve(this.output);
        return;
      }

      // 设置超时
      const timeoutId = setTimeout(() => {
        // 移除监听器
        const index = this.dataListeners.indexOf(dataListener);
        if (index > -1) {
          this.dataListeners.splice(index, 1);
        }
        reject(
          new TerminalTestError(
            TerminalTestErrorType.TIMEOUT,
            `等待模式 "${pattern}" 超时 (${timeoutMs}ms)。当前输出: ${this.getStrippedOutput().slice(-500)}`
          )
        );
      }, timeoutMs);

      // 监听新数据
      const dataListener = () => {
        if (checkMatch()) {
          clearTimeout(timeoutId);
          // 移除监听器
          const index = this.dataListeners.indexOf(dataListener);
          if (index > -1) {
            this.dataListeners.splice(index, 1);
          }
          resolve(this.output);
        }
      };

      this.dataListeners.push(dataListener);
    });
  }

  /**
   * 等待进程退出
   *
   * @param timeout - 超时时间（毫秒），默认使用选项中的超时时间
   * @returns 进程退出码
   * @throws {TerminalTestError} 当超时时抛出
   */
  async waitForExit(timeout?: number): Promise<number> {
    if (this.exitCode !== null) {
      return this.exitCode;
    }

    if (!this.exitPromise) {
      throw new TerminalTestError(
        TerminalTestErrorType.PROCESS_START_FAILED,
        '终端会话未启动'
      );
    }

    const timeoutMs = timeout ?? this.options.timeout ?? 30000;

    return Promise.race([
      this.exitPromise,
      new Promise<number>((_, reject) => {
        setTimeout(() => {
          reject(
            new TerminalTestError(
              TerminalTestErrorType.TIMEOUT,
              `等待进程退出超时 (${timeoutMs}ms)`
            )
          );
        }, timeoutMs);
      }),
    ]);
  }

  /**
   * 获取所有输出（包含 ANSI 转义序列）
   *
   * @returns 原始输出字符串
   */
  getOutput(): string {
    return this.output;
  }

  /**
   * 获取去除 ANSI 转义序列的输出
   *
   * @returns 纯文本输出
   */
  getStrippedOutput(): string {
    return this.ansiParser.strip(this.output);
  }

  /**
   * 清空输出缓冲区
   */
  clearOutput(): void {
    this.output = '';
  }

  /**
   * 获取当前退出码
   *
   * @returns 退出码，如果进程未退出则返回 null
   */
  getExitCode(): number | null {
    return this.exitCode;
  }

  /**
   * 检查进程是否正在运行
   *
   * @returns 如果进程正在运行则返回 true
   */
  isRunning(): boolean {
    return this.ptyProcess !== null && this.exitCode === null && !this.isDisposed;
  }

  /**
   * 终止进程
   *
   * @param signal - 信号名称，默认为 SIGTERM
   */
  kill(signal: string = 'SIGTERM'): void {
    if (this.ptyProcess && this.exitCode === null) {
      try {
        this.ptyProcess.kill(signal);
      } catch {
        // 忽略已退出进程的错误
      }
    }
  }

  /**
   * 清理资源
   *
   * 终止进程并释放所有资源
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    // 终止进程
    this.kill();

    // 清空监听器
    this.dataListeners = [];

    // 清空引用
    this.ptyProcess = null;
  }

  /**
   * 调整终端大小
   *
   * @param cols - 列数
   * @param rows - 行数
   */
  resize(cols: number, rows: number): void {
    if (this.ptyProcess && !this.isDisposed) {
      this.ptyProcess.resize(cols, rows);
    }
  }

  /**
   * 获取进程 PID
   *
   * @returns 进程 PID，如果进程未启动则返回 undefined
   */
  getPid(): number | undefined {
    return this.ptyProcess?.pid;
  }
}

/**
 * 创建 TerminalEmulator 实例的工厂函数
 *
 * @param options - 终端模拟器选项
 * @returns 新的 TerminalEmulator 实例
 */
export function createTerminalEmulator(options: TerminalEmulatorOptions): TerminalEmulator {
  return new TerminalEmulator(options);
}
