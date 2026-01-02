/**
 * 终端交互测试框架
 *
 * 提供完整的终端交互测试能力，包括：
 * - 终端模拟器：创建和管理 PTY 会话
 * - ANSI 解析器：处理终端转义序列
 * - 断言匹配器：验证输出是否符合预期
 * - 测试夹具：管理测试环境
 * - 交互控制器：执行交互脚本
 * - 报告生成器：生成测试报告
 * - 测试框架集成：检测和执行测试
 *
 * @module testing
 *
 * @example
 * ```typescript
 * import {
 *   createTerminalEmulator,
 *   createAssertionMatcher,
 *   createTestFixture,
 *   SpecialKey,
 * } from 'claude-replica/testing';
 *
 * // 创建终端模拟器
 * const terminal = createTerminalEmulator({
 *   command: 'node',
 *   args: ['cli.js'],
 * });
 *
 * await terminal.start();
 * terminal.write('hello\n');
 * await terminal.waitFor('response');
 * terminal.dispose();
 * ```
 */

// ==================== 测试框架集成 ====================
export {
  TestFrameworkIntegration,
  createTestFrameworkIntegration,
  type TestFramework,
  type TestStatus,
  type TestCase,
  type TestSuite,
  type TestResult as FrameworkTestResult,
  type CoverageReport,
  type FailureAnalysis,
  type TestSuggestion,
  type TestFrameworkConfig,
} from './TestFrameworkIntegration';

// ==================== ANSI 解析器 ====================
export {
  ANSIParser,
  createANSIParser,
  type ANSIStyle,
  type ANSIToken,
  type ANSITokenType,
} from './ANSIParser';

// ==================== 终端模拟器 ====================
export { TerminalEmulator, createTerminalEmulator } from './TerminalEmulator';

// ==================== 核心类型定义 ====================
export {
  SpecialKey,
  TerminalTestErrorType,
  TerminalTestError,
  TestCategory,
  type TerminalEmulatorOptions,
  type AssertionOptions,
  type InteractionStep,
  type InteractionScript,
  type StepResult,
  type InteractionResult,
  type AssertionResult,
} from './types';

// ==================== 断言匹配器 ====================
export { AssertionMatcher, createAssertionMatcher } from './AssertionMatcher';

// ==================== 测试夹具 ====================
export {
  TestFixture,
  createTestFixture,
  type SkillDefinition,
  type CommandDefinition,
  type AgentDefinitionFixture,
  type ConfigFixture,
  type ExtensionFixture,
  type MockResponse,
  type MockFixture,
  type FixtureOptions,
  type FixtureContext,
} from './TestFixture';

// ==================== 交互控制器 ====================
export {
  InteractionController,
  createInteractionController,
  type TerminalState,
  type InteractionControllerOptions,
} from './InteractionController';

// ==================== 报告生成器 ====================
export {
  ReportGenerator,
  createReportGenerator,
  type TestResult as ReportTestResult,
  type TestSuiteResult,
  type ReportOptions,
} from './ReportGenerator';

// ==================== 便捷 API ====================

/**
 * 终端测试配置
 */
export interface TerminalTestConfig {
  /** 全局超时时间（毫秒） */
  globalTimeout: number;
  /** 默认终端大小 */
  defaultTerminalSize: {
    cols: number;
    rows: number;
  };
  /** CLI 命令路径 */
  cliCommand: string;
  /** 默认环境变量 */
  defaultEnv: Record<string, string>;
  /** 报告配置 */
  reporting: {
    formats: ('junit' | 'html' | 'json' | 'console')[];
    outputDir: string;
  };
  /** 并行配置 */
  parallel: {
    enabled: boolean;
    maxWorkers: number;
  };
}

/**
 * 默认终端测试配置
 */
export const defaultTerminalTestConfig: TerminalTestConfig = {
  globalTimeout: 30000,
  defaultTerminalSize: {
    cols: 80,
    rows: 24,
  },
  cliCommand: 'node',
  defaultEnv: {
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    CI: 'true',
  },
  reporting: {
    formats: ['console', 'junit'],
    outputDir: './test-reports',
  },
  parallel: {
    enabled: true,
    maxWorkers: 4,
  },
};

/**
 * 退出码常量
 *
 * 定义 CLI 工具的标准退出码
 *
 * @example
 * ```typescript
 * import { ExitCodes } from 'claude-replica/testing';
 *
 * expect(result.exitCode).toBe(ExitCodes.SUCCESS);
 * ```
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

/**
 * 快速创建终端测试环境
 *
 * 创建一个包含所有必要组件的测试环境
 *
 * @param config - 可选的配置覆盖
 * @returns 测试环境对象
 *
 * @example
 * ```typescript
 * import { createTestEnvironment } from 'claude-replica/testing';
 *
 * const env = createTestEnvironment();
 * const terminal = env.createTerminal({ args: ['--help'] });
 * await terminal.start();
 * ```
 */
export function createTestEnvironment(config: Partial<TerminalTestConfig> = {}) {
  const mergedConfig = { ...defaultTerminalTestConfig, ...config };

  return {
    config: mergedConfig,

    /**
     * 创建终端模拟器
     */
    createTerminal(options: Partial<import('./types').TerminalEmulatorOptions> = {}) {
      const { createTerminalEmulator } = require('./TerminalEmulator');
      return createTerminalEmulator({
        command: mergedConfig.cliCommand,
        cols: mergedConfig.defaultTerminalSize.cols,
        rows: mergedConfig.defaultTerminalSize.rows,
        timeout: mergedConfig.globalTimeout,
        env: { ...mergedConfig.defaultEnv, ...options.env },
        ...options,
      });
    },

    /**
     * 创建断言匹配器
     */
    createMatcher() {
      const { createAssertionMatcher } = require('./AssertionMatcher');
      return createAssertionMatcher();
    },

    /**
     * 创建测试夹具
     */
    createFixture(options: Partial<import('./TestFixture').FixtureOptions> = {}) {
      const { createTestFixture } = require('./TestFixture');
      return createTestFixture(options);
    },

    /**
     * 创建交互控制器
     */
    createController(
      terminal: import('./TerminalEmulator').TerminalEmulator,
      options: Partial<import('./InteractionController').InteractionControllerOptions> = {}
    ) {
      const { createInteractionController } = require('./InteractionController');
      return createInteractionController(terminal, options);
    },

    /**
     * 创建报告生成器
     */
    createReporter() {
      const { createReportGenerator } = require('./ReportGenerator');
      return createReportGenerator();
    },

    /**
     * 创建 ANSI 解析器
     */
    createParser() {
      const { createANSIParser } = require('./ANSIParser');
      return createANSIParser();
    },
  };
}

/**
 * 运行交互脚本的便捷函数
 *
 * @param script - 交互脚本
 * @param options - 终端选项
 * @returns 交互结果
 *
 * @example
 * ```typescript
 * import { runScript, SpecialKey } from 'claude-replica/testing';
 *
 * const result = await runScript({
 *   name: 'test-help',
 *   steps: [
 *     { type: 'wait', value: 'Welcome' },
 *     { type: 'send', value: '/help' },
 *     { type: 'sendKey', value: SpecialKey.ENTER },
 *     { type: 'wait', value: 'Available commands' },
 *   ],
 * });
 * ```
 */
export async function runScript(
  script: import('./types').InteractionScript,
  options: Partial<import('./types').TerminalEmulatorOptions> = {}
): Promise<import('./types').InteractionResult> {
  const { createInteractionController } = await import('./InteractionController');

  const terminalOptions: import('./types').TerminalEmulatorOptions = {
    command: options.command || 'node',
    args: options.args || [],
    timeout: options.timeout || 30000,
    ...options,
  };

  const controller = createInteractionController({
    terminalOptions,
  });

  return await controller.execute(script);
}
