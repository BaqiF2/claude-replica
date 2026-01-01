/**
 * 终端测试类型定义
 * 定义终端测试框架使用的核心类型
 */

/**
 * 特殊按键枚举
 */
export enum SpecialKey {
  ENTER = 'enter',
  CTRL_C = 'ctrl+c',
  CTRL_D = 'ctrl+d',
  ESCAPE = 'escape',
  TAB = 'tab',
  BACKSPACE = 'backspace',
  UP = 'up',
  DOWN = 'down',
  LEFT = 'left',
  RIGHT = 'right',
}

/**
 * 终端模拟器选项
 */
export interface TerminalEmulatorOptions {
  /** 要执行的命令 */
  command: string;
  /** 命令参数 */
  args?: string[];
  /** 工作目录 */
  cwd?: string;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 终端列数 */
  cols?: number;
  /** 终端行数 */
  rows?: number;
  /** 默认超时时间（毫秒） */
  timeout?: number;
}

/**
 * 断言选项
 */
export interface AssertionOptions {
  /** 匹配类型 */
  type: 'exact' | 'contains' | 'regex' | 'json' | 'jsonSchema';
  /** 预期值 */
  expected: string | RegExp | object;
  /** 是否去除 ANSI */
  stripAnsi?: boolean;
  /** 是否忽略大小写 */
  ignoreCase?: boolean;
  /** 是否忽略空白 */
  ignoreWhitespace?: boolean;
}

/**
 * 交互步骤
 */
export interface InteractionStep {
  /** 步骤类型 */
  type: 'send' | 'sendKey' | 'wait' | 'waitForExit' | 'assert' | 'delay';
  /** 发送的内容或等待的模式 */
  value?: string | RegExp | SpecialKey;
  /** 超时时间 */
  timeout?: number;
  /** 断言选项 */
  assertion?: AssertionOptions;
}

/**
 * 交互脚本
 */
export interface InteractionScript {
  /** 脚本名称 */
  name: string;
  /** 脚本描述 */
  description?: string;
  /** 交互步骤 */
  steps: InteractionStep[];
}

/**
 * 步骤执行结果
 */
export interface StepResult {
  step: InteractionStep;
  success: boolean;
  duration: number;
  output?: string;
  error?: string;
}

/**
 * 交互执行结果
 */
export interface InteractionResult {
  success: boolean;
  steps: StepResult[];
  totalDuration: number;
  exitCode?: number;
  output: string;
  error?: string;
}

/**
 * 断言结果
 */
export interface AssertionResult {
  passed: boolean;
  actual: string;
  expected: string | object;
  diff?: string;
  message?: string;
}

/**
 * 测试分类
 */
export enum TestCategory {
  INTERACTIVE = 'interactive',
  NON_INTERACTIVE = 'non-interactive',
  SESSION = 'session',
  EXTENSION = 'extension',
  ERROR = 'error',
  CI = 'ci',
}

/**
 * 终端测试错误类型
 */
export enum TerminalTestErrorType {
  /** PTY 创建失败 */
  PTY_CREATE_FAILED = 'PTY_CREATE_FAILED',
  /** 进程启动失败 */
  PROCESS_START_FAILED = 'PROCESS_START_FAILED',
  /** 超时错误 */
  TIMEOUT = 'TIMEOUT',
  /** 断言失败 */
  ASSERTION_FAILED = 'ASSERTION_FAILED',
  /** 夹具设置失败 */
  FIXTURE_SETUP_FAILED = 'FIXTURE_SETUP_FAILED',
  /** 夹具清理失败 */
  FIXTURE_TEARDOWN_FAILED = 'FIXTURE_TEARDOWN_FAILED',
  /** 脚本执行错误 */
  SCRIPT_EXECUTION_ERROR = 'SCRIPT_EXECUTION_ERROR',
  /** 无效配置 */
  INVALID_CONFIG = 'INVALID_CONFIG',
}

/**
 * 终端测试错误
 */
export class TerminalTestError extends Error {
  constructor(
    public type: TerminalTestErrorType,
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'TerminalTestError';
  }
}
