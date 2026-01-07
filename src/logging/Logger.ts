/**
 * 文件功能：日志记录模块，提供分级日志记录和文件持久化功能
 *
 * 核心类：Logger
 * 核心类型：LogLevel
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SecurityManager } from '../security/SecurityManager';
import { EnvConfig } from '../config';

export const LOG_DIR = path.join(os.homedir(), '.claude-replica', 'logs');

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Logger - 应用程序日志记录器
 *
 * 职责：
 * - 分级日志记录（debug, info, warn, error）
 * - 日志文件持久化
 * - 安全数据脱敏
 * - 控制台彩色输出
 */
export class Logger {
  private readonly logFile: string;
  private readonly verbose: boolean;
  private readonly debugMode: boolean;
  private readonly securityManager: SecurityManager;

  constructor(verbose = false, securityManager?: SecurityManager) {
    this.verbose = verbose;
    this.debugMode = EnvConfig.isDebugMode();
    this.logFile = path.join(
      LOG_DIR,
      `claude-replica-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
    );
    this.securityManager = securityManager || new SecurityManager();
  }

  async init(): Promise<void> {
    await fs.mkdir(LOG_DIR, { recursive: true });
  }

  async log(level: LogLevel, message: string, data?: unknown): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data: data ? this.securityManager.sanitizeLogData(data) : undefined,
    };

    try {
      await fs.appendFile(this.logFile, JSON.stringify(logEntry) + '\n', 'utf-8');
    } catch {
      // Ignore log write errors
    }

    if (this.verbose || this.debugMode || level === 'error') {
      const prefix = this.getLogPrefix(level);
      level === 'error'
        ? console.error(`${prefix} ${message}`)
        : (this.verbose || this.debugMode) && console.log(`${prefix} ${message}`);
    }
  }

  debug = (message: string, data?: unknown) => this.log('debug', message, data);
  info = (message: string, data?: unknown) => this.log('info', message, data);
  warn = (message: string, data?: unknown) => this.log('warn', message, data);
  error = (message: string, data?: unknown) => this.log('error', message, data);

  private getLogPrefix(level: LogLevel): string {
    const colors: Record<LogLevel, string> = {
      debug: '\x1b[90m',
      info: '\x1b[36m',
      warn: '\x1b[33m',
      error: '\x1b[31m',
    };
    const reset = '\x1b[0m';
    return `${colors[level]}[${level.toUpperCase()}]${reset}`;
  }
}
