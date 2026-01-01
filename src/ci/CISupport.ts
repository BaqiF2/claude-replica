/**
 * CI/CD 支持模块
 *
 * 提供 CI/CD 环境检测、结构化日志、超时管理等功能
 * 支持在 CI 管道中自动化运行 Claude Replica
 *
 * @module ci/CISupport
 * **验证: 需求 21.1, 21.2, 21.3, 21.4, 21.6**
 */

import { EnvConfig, ENV_KEYS } from '../config';

/**
 * CI 环境类型
 */
export type CIEnvironment =
  | 'github-actions'
  | 'gitlab-ci'
  | 'jenkins'
  | 'circleci'
  | 'travis'
  | 'azure-pipelines'
  | 'bitbucket-pipelines'
  | 'teamcity'
  | 'buildkite'
  | 'codebuild'
  | 'drone'
  | 'unknown-ci'
  | 'local';

/**
 * 结构化日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 结构化日志条目
 */
export interface StructuredLogEntry {
  /** 时间戳 (ISO 8601 格式) */
  timestamp: string;
  /** 日志级别 */
  level: LogLevel;
  /** 日志消息 */
  message: string;
  /** 附加数据 */
  data?: Record<string, unknown>;
  /** CI 环境 */
  ci?: CIEnvironment;
  /** 会话 ID */
  sessionId?: string;
  /** 执行阶段 */
  stage?: string;
}

/**
 * 超时配置
 */
export interface TimeoutConfig {
  /** 总超时时间（毫秒） */
  totalMs: number;
  /** 单次查询超时时间（毫秒） */
  queryMs?: number;
  /** 工具执行超时时间（毫秒） */
  toolMs?: number;
}

/**
 * CI 配置
 */
export interface CIConfig {
  /** 是否在 CI 环境中 */
  isCI: boolean;
  /** CI 环境类型 */
  environment: CIEnvironment;
  /** 超时配置 */
  timeout?: TimeoutConfig;
  /** 是否启用结构化日志 */
  structuredLogs: boolean;
  /** 是否静默模式 */
  silent: boolean;
}

/**
 * 退出码定义
 */
export const ExitCodes = {
  /** 成功 */
  SUCCESS: 0,
  /** 一般错误 */
  ERROR: 1,
  /** 网络错误 */
  NETWORK_ERROR: 2,
  /** API 认证错误 */
  AUTH_ERROR: 3,
  /** 超时错误 */
  TIMEOUT_ERROR: 4,
  /** 配置错误 */
  CONFIG_ERROR: 5,
  /** 权限错误 */
  PERMISSION_ERROR: 6,
  /** 工具执行错误 */
  TOOL_ERROR: 7,
} as const;

export type ExitCode = (typeof ExitCodes)[keyof typeof ExitCodes];

/**
 * CI 环境检测器
 */
export class CIDetector {
  /**
   * 检测当前是否在 CI 环境中运行
   */
  static isCI(): boolean {
    return EnvConfig.isCI();
  }

  /**
   * 检测 CI 环境类型
   */
  static detectEnvironment(): CIEnvironment {
    const env = EnvConfig.detectCIEnvironment();
    if (env) {
      return env as CIEnvironment;
    }
    return 'local';
  }

  /**
   * 获取 CI 环境的详细信息
   */
  static getEnvironmentInfo(): Record<string, string | undefined> {
    const env = this.detectEnvironment();
    const info: Record<string, string | undefined> = {
      environment: env,
    };

    switch (env) {
      case 'github-actions':
        info.repository = EnvConfig.getString(ENV_KEYS.GITHUB_REPOSITORY);
        info.workflow = EnvConfig.getString(ENV_KEYS.GITHUB_WORKFLOW);
        info.runId = EnvConfig.getString(ENV_KEYS.GITHUB_RUN_ID);
        info.runNumber = EnvConfig.getString(ENV_KEYS.GITHUB_RUN_NUMBER);
        info.actor = EnvConfig.getString(ENV_KEYS.GITHUB_ACTOR);
        info.ref = EnvConfig.getString(ENV_KEYS.GITHUB_REF);
        info.sha = EnvConfig.getString(ENV_KEYS.GITHUB_SHA);
        break;
      case 'gitlab-ci':
        info.project = EnvConfig.getString(ENV_KEYS.CI_PROJECT_NAME);
        info.pipeline = EnvConfig.getString(ENV_KEYS.CI_PIPELINE_ID);
        info.job = EnvConfig.getString(ENV_KEYS.CI_JOB_NAME);
        info.ref = EnvConfig.getString(ENV_KEYS.CI_COMMIT_REF_NAME);
        info.sha = EnvConfig.getString(ENV_KEYS.CI_COMMIT_SHA);
        break;
      case 'jenkins':
        info.job = EnvConfig.getString(ENV_KEYS.JOB_NAME);
        info.buildNumber = EnvConfig.getString(ENV_KEYS.BUILD_NUMBER);
        info.buildUrl = EnvConfig.getString(ENV_KEYS.BUILD_URL);
        break;
      case 'circleci':
        info.project = EnvConfig.getString(ENV_KEYS.CIRCLE_PROJECT_REPONAME);
        info.buildNum = EnvConfig.getString(ENV_KEYS.CIRCLE_BUILD_NUM);
        break;
    }

    return info;
  }
}

/**
 * 结构化日志记录器
 */
export class StructuredLogger {
  private readonly ciEnvironment: CIEnvironment;
  private readonly sessionId?: string;
  private readonly silent: boolean;

  constructor(options: { sessionId?: string; silent?: boolean } = {}) {
    this.ciEnvironment = CIDetector.detectEnvironment();
    this.sessionId = options.sessionId;
    this.silent = options.silent ?? false;
  }

  /**
   * 创建日志条目
   */
  private createEntry(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    stage?: string
  ): StructuredLogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      ci: this.ciEnvironment,
      sessionId: this.sessionId,
      stage,
    };
  }

  /**
   * 输出日志
   */
  private output(entry: StructuredLogEntry): void {
    if (this.silent) {
      return;
    }

    const jsonOutput = JSON.stringify(entry);

    switch (entry.level) {
      case 'error':
        console.error(jsonOutput);
        break;
      case 'warn':
        console.warn(jsonOutput);
        break;
      default:
        console.log(jsonOutput);
    }
  }

  /**
   * 记录调试日志
   */
  debug(message: string, data?: Record<string, unknown>, stage?: string): void {
    this.output(this.createEntry('debug', message, data, stage));
  }

  /**
   * 记录信息日志
   */
  info(message: string, data?: Record<string, unknown>, stage?: string): void {
    this.output(this.createEntry('info', message, data, stage));
  }

  /**
   * 记录警告日志
   */
  warn(message: string, data?: Record<string, unknown>, stage?: string): void {
    this.output(this.createEntry('warn', message, data, stage));
  }

  /**
   * 记录错误日志
   */
  error(message: string, data?: Record<string, unknown>, stage?: string): void {
    this.output(this.createEntry('error', message, data, stage));
  }

  /**
   * 记录执行开始
   */
  logStart(prompt: string, options?: Record<string, unknown>): void {
    this.info('执行开始', { prompt: prompt.substring(0, 100), ...options }, 'start');
  }

  /**
   * 记录执行完成
   */
  logComplete(result: { success: boolean; duration?: number; cost?: number }): void {
    this.info('执行完成', result, 'complete');
  }

  /**
   * 记录工具调用
   */
  logToolUse(tool: string, args?: Record<string, unknown>): void {
    this.debug('工具调用', { tool, args }, 'tool');
  }

  /**
   * 记录错误
   */
  logError(error: Error | string, context?: Record<string, unknown>): void {
    const errorData =
      error instanceof Error ? { message: error.message, stack: error.stack } : { message: error };
    this.error('执行错误', { ...errorData, ...context }, 'error');
  }
}

/**
 * 超时管理器
 */
export class TimeoutManager {
  private readonly config: TimeoutConfig;
  private startTime: number = 0;
  private timeoutId: NodeJS.Timeout | null = null;
  private isTimedOut: boolean = false;
  private onTimeoutCallback?: () => void;

  constructor(config: TimeoutConfig) {
    this.config = config;
  }

  /**
   * 开始计时
   */
  start(onTimeout?: () => void): void {
    this.startTime = Date.now();
    this.isTimedOut = false;
    this.onTimeoutCallback = onTimeout;

    if (this.config.totalMs > 0) {
      this.timeoutId = setTimeout(() => {
        this.isTimedOut = true;
        if (this.onTimeoutCallback) {
          this.onTimeoutCallback();
        }
      }, this.config.totalMs);
    }
  }

  /**
   * 停止计时
   */
  stop(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * 检查是否已超时
   */
  hasTimedOut(): boolean {
    return this.isTimedOut;
  }

  /**
   * 获取已用时间（毫秒）
   */
  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }

  /**
   * 获取剩余时间（毫秒）
   */
  getRemainingMs(): number {
    const remaining = this.config.totalMs - this.getElapsedMs();
    return Math.max(0, remaining);
  }

  /**
   * 检查是否有足够的时间执行操作
   */
  hasTimeFor(estimatedMs: number): boolean {
    return this.getRemainingMs() >= estimatedMs;
  }

  /**
   * 创建带超时的 Promise
   */
  withTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
    const timeout = timeoutMs ?? this.config.queryMs ?? this.config.totalMs;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new TimeoutError(`操作超时 (${timeout}ms)`));
      }, timeout);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}

/**
 * 超时错误
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}



/**
 * CI 支持管理器
 */
export class CISupport {
  private readonly config: CIConfig;
  private readonly logger: StructuredLogger;
  private readonly timeoutManager?: TimeoutManager;

  constructor(options: Partial<CIConfig> = {}) {
    const isCI = options.isCI ?? CIDetector.isCI();
    const environment = options.environment ?? CIDetector.detectEnvironment();

    this.config = {
      isCI,
      environment,
      timeout: options.timeout,
      structuredLogs: options.structuredLogs ?? isCI,
      silent: options.silent ?? false,
    };

    this.logger = new StructuredLogger({
      silent: !this.config.structuredLogs,
    });

    if (this.config.timeout) {
      this.timeoutManager = new TimeoutManager(this.config.timeout);
    }
  }

  /**
   * 获取配置
   */
  getConfig(): CIConfig {
    return { ...this.config };
  }

  /**
   * 检查是否在 CI 环境中
   */
  isCI(): boolean {
    return this.config.isCI;
  }

  /**
   * 获取 CI 环境类型
   */
  getEnvironment(): CIEnvironment {
    return this.config.environment;
  }

  /**
   * 获取日志记录器
   */
  getLogger(): StructuredLogger {
    return this.logger;
  }

  /**
   * 获取超时管理器
   */
  getTimeoutManager(): TimeoutManager | undefined {
    return this.timeoutManager;
  }

  /**
   * 开始执行（启动超时计时）
   */
  startExecution(onTimeout?: () => void): void {
    if (this.timeoutManager) {
      this.timeoutManager.start(onTimeout);
    }
  }

  /**
   * 结束执行（停止超时计时）
   */
  endExecution(): void {
    if (this.timeoutManager) {
      this.timeoutManager.stop();
    }
  }

  /**
   * 检查是否已超时
   */
  hasTimedOut(): boolean {
    return this.timeoutManager?.hasTimedOut() ?? false;
  }

  /**
   * 根据错误类型获取退出码
   */
  static getExitCode(error: Error | string): ExitCode {
    const message = error instanceof Error ? error.message : error;
    const lowerMessage = message.toLowerCase();

    if (error instanceof TimeoutError || lowerMessage.includes('timeout')) {
      return ExitCodes.TIMEOUT_ERROR;
    }
    if (
      lowerMessage.includes('network') ||
      lowerMessage.includes('enotfound') ||
      lowerMessage.includes('econnrefused')
    ) {
      return ExitCodes.NETWORK_ERROR;
    }
    if (
      lowerMessage.includes('401') ||
      lowerMessage.includes('403') ||
      lowerMessage.includes('api key') ||
      lowerMessage.includes('auth')
    ) {
      return ExitCodes.AUTH_ERROR;
    }
    if (lowerMessage.includes('config')) {
      return ExitCodes.CONFIG_ERROR;
    }
    if (lowerMessage.includes('permission')) {
      return ExitCodes.PERMISSION_ERROR;
    }
    if (lowerMessage.includes('tool')) {
      return ExitCodes.TOOL_ERROR;
    }

    return ExitCodes.ERROR;
  }

  /**
   * 验证 CI 环境配置
   */
  validate(): { valid: boolean; errors: string[] } {
    // CI 环境验证现在不再检查 API 密钥
    // SDK 会自动从 Claude Code 配置中获取认证信息
    return {
      valid: true,
      errors: [],
    };
  }

  /**
   * 获取 CI 环境摘要
   */
  getSummary(): Record<string, unknown> {
    return {
      isCI: this.config.isCI,
      environment: this.config.environment,
      timeout: this.config.timeout,
      structuredLogs: this.config.structuredLogs,
      environmentInfo: CIDetector.getEnvironmentInfo(),
    };
  }
}

export default CISupport;
