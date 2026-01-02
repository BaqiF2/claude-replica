/**
 * 终端测试辅助函数
 *
 * 提供便捷的测试工具函数，简化终端测试的编写
 * 包括快速创建测试终端、运行 CLI、输出断言等功能
 *
 * @module tests/terminal/helpers
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 */

import * as path from 'path';
import { TerminalEmulator, createTerminalEmulator } from '../../src/testing/TerminalEmulator';
import { createAssertionMatcher } from '../../src/testing/AssertionMatcher';
import { ANSIParser } from '../../src/testing/ANSIParser';
import {
  TerminalEmulatorOptions,
  AssertionOptions,
  AssertionResult,
  TerminalTestError,
  TerminalTestErrorType,
} from '../../src/testing/types';
import { registerProcess, unregisterProcess } from './setup';

/**
 * CLI 运行选项
 */
export interface CLIRunOptions {
  /** 命令行参数 */
  args?: string[];
  /** 工作目录 */
  cwd?: string;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 输入数据（将发送到 stdin） */
  input?: string;
  /** 是否等待进程退出 */
  waitForExit?: boolean;
}

/**
 * CLI 运行结果
 */
export interface CLIRunResult {
  /** 原始输出（包含 ANSI） */
  output: string;
  /** 去除 ANSI 的输出 */
  strippedOutput: string;
  /** 退出码 */
  exitCode: number;
  /** 执行时间（毫秒） */
  duration: number;
}

/**
 * 测试终端选项
 */
export interface TestTerminalOptions {
  /** 命令行参数 */
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
 * 输出断言选项
 */
export interface OutputExpectOptions {
  /** 是否去除 ANSI 转义序列 */
  stripAnsi?: boolean;
  /** 是否忽略大小写 */
  ignoreCase?: boolean;
  /** 是否忽略空白差异 */
  ignoreWhitespace?: boolean;
  /** 超时时间（毫秒） */
  timeout?: number;
}

// 默认 CLI 命令路径
const DEFAULT_CLI_COMMAND = 'node';
const DEFAULT_CLI_SCRIPT = path.resolve(__dirname, '../../dist/cli.js');

// 默认超时时间
const DEFAULT_TIMEOUT = 30000;

// 共享的断言匹配器和 ANSI 解析器
const assertionMatcher = createAssertionMatcher();
const ansiParser = new ANSIParser();

/**
 * 创建测试终端
 *
 * 快速创建一个配置好的终端模拟器实例，用于测试 CLI 工具
 *
 * @param options - 测试终端选项
 * @returns 终端模拟器实例
 *
 * **Validates: Requirements 3.1**
 *
 * @example
 * ```typescript
 * const terminal = createTestTerminal({ args: ['--help'] });
 * await terminal.start();
 * await terminal.waitFor('Usage:');
 * terminal.dispose();
 * ```
 */
export function createTestTerminal(options: TestTerminalOptions = {}): TerminalEmulator {
  const terminalOptions: TerminalEmulatorOptions = {
    command: DEFAULT_CLI_COMMAND,
    args: [DEFAULT_CLI_SCRIPT, ...(options.args || [])],
    cwd: options.cwd || process.cwd(),
    env: {
      ...process.env,
      // 禁用颜色输出以便于测试
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      // 设置为非交互模式
      CI: 'true',
      ...options.env,
    },
    cols: options.cols || 80,
    rows: options.rows || 24,
    timeout: options.timeout || DEFAULT_TIMEOUT,
  };

  const terminal = createTerminalEmulator(terminalOptions);

  // 注册进程以便清理
  registerProcess(terminal);

  return terminal;
}

/**
 * 运行 CLI 命令并返回结果
 *
 * 执行 CLI 命令，等待其完成，并返回输出和退出码
 *
 * @param options - CLI 运行选项
 * @returns CLI 运行结果
 *
 * **Validates: Requirements 3.1, 3.5, 3.6**
 *
 * @example
 * ```typescript
 * const result = await runCLI({ args: ['-p', 'Hello'] });
 * expect(result.exitCode).toBe(0);
 * expect(result.strippedOutput).toContain('Hello');
 * ```
 */
export async function runCLI(options: CLIRunOptions = {}): Promise<CLIRunResult> {
  const startTime = Date.now();
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const waitForExit = options.waitForExit !== false;

  const terminal = createTestTerminal({
    args: options.args,
    cwd: options.cwd,
    env: options.env,
    timeout,
  });

  try {
    await terminal.start();

    // 如果有输入数据，发送到终端
    if (options.input) {
      terminal.write(options.input);
    }

    let exitCode: number;

    if (waitForExit) {
      // 等待进程退出
      exitCode = await terminal.waitForExit(timeout);
    } else {
      // 不等待退出，返回当前状态
      exitCode = terminal.getExitCode() ?? -1;
    }

    const output = terminal.getOutput();
    const strippedOutput = terminal.getStrippedOutput();
    const duration = Date.now() - startTime;

    return {
      output,
      strippedOutput,
      exitCode,
      duration,
    };
  } finally {
    // 清理资源
    unregisterProcess(terminal);
    terminal.dispose();
  }
}

/**
 * 断言输出包含指定内容
 *
 * 验证 CLI 输出是否包含预期的字符串或匹配正则表达式
 *
 * @param actual - 实际输出
 * @param expected - 预期内容（字符串或正则表达式）
 * @param options - 断言选项
 * @returns 断言结果
 *
 * **Validates: Requirements 3.2, 3.3**
 *
 * @example
 * ```typescript
 * const result = await runCLI({ args: ['--version'] });
 * expectOutput(result.strippedOutput, /v\d+\.\d+\.\d+/);
 * ```
 */
export function expectOutput(
  actual: string,
  expected: string | RegExp,
  options: OutputExpectOptions = {}
): AssertionResult {
  let processedActual = actual;

  // 处理 ANSI
  if (options.stripAnsi !== false) {
    processedActual = ansiParser.strip(processedActual);
  }

  const assertionOptions: AssertionOptions = {
    type: expected instanceof RegExp ? 'regex' : 'contains',
    expected,
    stripAnsi: false, // 已经处理过了
    ignoreCase: options.ignoreCase,
    ignoreWhitespace: options.ignoreWhitespace,
  };

  const result = assertionMatcher.assert(processedActual, assertionOptions);

  // 如果断言失败，抛出错误以便 Jest 捕获
  if (!result.passed) {
    throw new TerminalTestError(
      TerminalTestErrorType.ASSERTION_FAILED,
      result.message || `输出断言失败: 未找到预期内容 "${expected}"`
    );
  }

  return result;
}

/**
 * 断言输出精确匹配
 *
 * 验证 CLI 输出是否与预期完全一致
 *
 * @param actual - 实际输出
 * @param expected - 预期输出
 * @param options - 断言选项
 * @returns 断言结果
 *
 * @example
 * ```typescript
 * const result = await runCLI({ args: ['--version'] });
 * expectOutputExact(result.strippedOutput.trim(), 'claude-replica v0.1.0');
 * ```
 */
export function expectOutputExact(
  actual: string,
  expected: string,
  options: OutputExpectOptions = {}
): AssertionResult {
  let processedActual = actual;

  // 处理 ANSI
  if (options.stripAnsi !== false) {
    processedActual = ansiParser.strip(processedActual);
  }

  const assertionOptions: AssertionOptions = {
    type: 'exact',
    expected,
    stripAnsi: false,
    ignoreCase: options.ignoreCase,
    ignoreWhitespace: options.ignoreWhitespace,
  };

  const result = assertionMatcher.assert(processedActual, assertionOptions);

  if (!result.passed) {
    throw new TerminalTestError(
      TerminalTestErrorType.ASSERTION_FAILED,
      result.message || '精确匹配失败'
    );
  }

  return result;
}

/**
 * 断言退出码
 *
 * 验证 CLI 退出码是否符合预期
 *
 * @param actual - 实际退出码
 * @param expected - 预期退出码
 * @returns 是否匹配
 *
 * **Validates: Requirements 3.5, 3.6**
 *
 * @example
 * ```typescript
 * const result = await runCLI({ args: ['--invalid-option'] });
 * expectExitCode(result.exitCode, 2); // 参数错误
 * ```
 */
export function expectExitCode(actual: number, expected: number): boolean {
  if (actual !== expected) {
    throw new TerminalTestError(
      TerminalTestErrorType.ASSERTION_FAILED,
      `退出码断言失败: 预期 ${expected}，实际 ${actual}`
    );
  }
  return true;
}

/**
 * 断言 JSON 输出有效性
 *
 * 验证 CLI 输出是否为有效的 JSON 格式
 *
 * @param output - CLI 输出
 * @returns 解析后的 JSON 对象
 * @throws {TerminalTestError} 当输出不是有效 JSON 时抛出
 *
 * **Validates: Requirements 3.2**
 *
 * @example
 * ```typescript
 * const result = await runCLI({ args: ['-p', 'test', '--output-format', 'json'] });
 * const json = expectValidJSON(result.strippedOutput);
 * expect(json).toHaveProperty('content');
 * ```
 */
export function expectValidJSON<T = unknown>(output: string): T {
  // 去除 ANSI 转义序列
  const strippedOutput = ansiParser.strip(output).trim();

  try {
    return JSON.parse(strippedOutput) as T;
  } catch (error) {
    throw new TerminalTestError(
      TerminalTestErrorType.ASSERTION_FAILED,
      `JSON 解析失败: ${error instanceof Error ? error.message : String(error)}\n输出内容: ${strippedOutput.slice(0, 200)}...`
    );
  }
}

/**
 * 断言 Stream-JSON 输出有效性
 *
 * 验证 CLI 输出是否为有效的换行分隔 JSON 格式（NDJSON）
 * 每一行都应该是有效的 JSON
 *
 * @param output - CLI 输出
 * @returns 解析后的 JSON 对象数组
 * @throws {TerminalTestError} 当任何一行不是有效 JSON 时抛出
 *
 * **Validates: Requirements 3.3**
 *
 * @example
 * ```typescript
 * const result = await runCLI({ args: ['-p', 'test', '--output-format', 'stream-json'] });
 * const lines = expectValidStreamJSON(result.strippedOutput);
 * expect(lines.length).toBeGreaterThan(0);
 * ```
 */
export function expectValidStreamJSON<T = unknown>(output: string): T[] {
  // 去除 ANSI 转义序列
  const strippedOutput = ansiParser.strip(output);

  // 按行分割，过滤空行
  const lines = strippedOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new TerminalTestError(
      TerminalTestErrorType.ASSERTION_FAILED,
      'Stream-JSON 输出为空'
    );
  }

  const results: T[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    try {
      results.push(JSON.parse(line) as T);
    } catch (error) {
      throw new TerminalTestError(
        TerminalTestErrorType.ASSERTION_FAILED,
        `Stream-JSON 第 ${i + 1} 行解析失败: ${error instanceof Error ? error.message : String(error)}\n行内容: ${line.slice(0, 100)}...`
      );
    }
  }

  return results;
}

/**
 * 断言 JSON Schema 匹配
 *
 * 验证 JSON 输出是否符合指定的 JSON Schema
 *
 * @param output - CLI 输出（JSON 字符串）
 * @param schema - JSON Schema
 * @returns 断言结果
 *
 * @example
 * ```typescript
 * const result = await runCLI({ args: ['-p', 'test', '--output-format', 'json'] });
 * expectJSONSchema(result.strippedOutput, {
 *   type: 'object',
 *   required: ['content'],
 *   properties: { content: { type: 'string' } }
 * });
 * ```
 */
export function expectJSONSchema(output: string, schema: object): AssertionResult {
  const strippedOutput = ansiParser.strip(output).trim();

  const result = assertionMatcher.jsonSchemaMatch(strippedOutput, schema);

  if (!result.passed) {
    throw new TerminalTestError(
      TerminalTestErrorType.ASSERTION_FAILED,
      result.message || 'JSON Schema 验证失败'
    );
  }

  return result;
}

/**
 * 等待输出包含指定内容
 *
 * 在终端模拟器上等待输出包含指定内容
 *
 * @param terminal - 终端模拟器实例
 * @param expected - 预期内容（字符串或正则表达式）
 * @param options - 等待选项
 * @returns 匹配时的输出
 *
 * @example
 * ```typescript
 * const terminal = createTestTerminal();
 * await terminal.start();
 * await waitForOutput(terminal, 'Welcome');
 * ```
 */
export async function waitForOutput(
  terminal: TerminalEmulator,
  expected: string | RegExp,
  options: OutputExpectOptions = {}
): Promise<string> {
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  return terminal.waitFor(expected, timeout);
}

/**
 * 创建带有自动清理的测试终端
 *
 * 返回一个终端实例和清理函数，用于 Jest 的 beforeEach/afterEach
 *
 * @param options - 测试终端选项
 * @returns 终端实例和清理函数
 *
 * @example
 * ```typescript
 * let terminal: TerminalEmulator;
 * let cleanup: () => void;
 *
 * beforeEach(() => {
 *   const result = createTestTerminalWithCleanup({ args: ['--help'] });
 *   terminal = result.terminal;
 *   cleanup = result.cleanup;
 * });
 *
 * afterEach(() => {
 *   cleanup();
 * });
 * ```
 */
export function createTestTerminalWithCleanup(options: TestTerminalOptions = {}): {
  terminal: TerminalEmulator;
  cleanup: () => void;
} {
  const terminal = createTestTerminal(options);

  const cleanup = () => {
    unregisterProcess(terminal);
    terminal.dispose();
  };

  return { terminal, cleanup };
}

/**
 * 退出码常量
 *
 * 定义 CLI 工具的标准退出码
 * 根据 Requirements 8.1-8.5:
 * - 无效参数错误：退出码 2
 * - 认证错误：退出码 3
 * - 网络错误：退出码 4
 * - 超时错误：退出码 5
 * - 未知错误：退出码 1
 *
 * **Validates: Requirements 3.5, 3.6, 8.1, 8.2, 8.3, 8.4, 8.5**
 */
export const ExitCodes = {
  /** 成功 */
  SUCCESS: 0,
  /** 一般错误/未知错误 */
  ERROR: 1,
  /** 配置错误（无效参数） */
  CONFIG_ERROR: 2,
  /** 认证错误 */
  AUTH_ERROR: 3,
  /** 网络错误 */
  NETWORK_ERROR: 4,
  /** 超时错误 */
  TIMEOUT_ERROR: 5,
  /** 权限错误 */
  PERMISSION_ERROR: 6,
  /** 工具执行错误 */
  TOOL_ERROR: 7,
} as const;

/**
 * 输出格式常量
 */
export const OutputFormats = {
  TEXT: 'text',
  JSON: 'json',
  STREAM_JSON: 'stream-json',
  MARKDOWN: 'markdown',
} as const;
