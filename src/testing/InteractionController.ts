/**
 * 交互控制器
 *
 * 负责执行交互脚本，协调终端模拟器和断言匹配器
 * 支持多种步骤类型：发送输入、发送特殊按键、等待输出、断言验证、延迟等
 *
 * @module InteractionController
 */

import { TerminalEmulator } from './TerminalEmulator';
import { AssertionMatcher } from './AssertionMatcher';
import {
  InteractionScript,
  InteractionStep,
  InteractionResult,
  StepResult,
  SpecialKey,
  TerminalTestError,
  TerminalTestErrorType,
  TerminalEmulatorOptions,
} from './types';

/**
 * 终端状态接口
 */
export interface TerminalState {
  /** 是否正在运行 */
  isRunning: boolean;
  /** 当前输出 */
  output: string;
  /** 去除 ANSI 的输出 */
  strippedOutput: string;
  /** 退出码 */
  exitCode: number | null;
}

/**
 * 交互控制器选项
 */
export interface InteractionControllerOptions {
  /** 终端模拟器选项 */
  terminalOptions: TerminalEmulatorOptions;
  /** 默认步骤超时时间（毫秒） */
  defaultStepTimeout?: number;
  /** 是否在步骤失败时继续执行 */
  continueOnFailure?: boolean;
}

/**
 * 交互控制器类
 *
 * 执行交互脚本，管理终端会话和断言验证
 */
export class InteractionController {
  private terminal: TerminalEmulator | null = null;
  private assertionMatcher: AssertionMatcher;
  private options: InteractionControllerOptions;
  private isExecuting: boolean = false;

  /**
   * 创建交互控制器实例
   *
   * @param options - 交互控制器选项
   */
  constructor(options: InteractionControllerOptions) {
    this.options = {
      defaultStepTimeout: 10000,
      continueOnFailure: false,
      ...options,
    };
    this.assertionMatcher = new AssertionMatcher();
  }

  /**
   * 执行交互脚本
   *
   * @param script - 交互脚本
   * @returns 交互执行结果
   */
  async execute(script: InteractionScript): Promise<InteractionResult> {
    if (this.isExecuting) {
      throw new TerminalTestError(
        TerminalTestErrorType.SCRIPT_EXECUTION_ERROR,
        '已有脚本正在执行中'
      );
    }

    this.isExecuting = true;
    const startTime = Date.now();
    const stepResults: StepResult[] = [];
    let overallSuccess = true;
    let lastError: string | undefined;

    try {
      // 创建并启动终端
      this.terminal = new TerminalEmulator(this.options.terminalOptions);
      await this.terminal.start();

      // 执行每个步骤
      for (const step of script.steps) {
        const stepResult = await this.executeStep(step);
        stepResults.push(stepResult);

        if (!stepResult.success) {
          overallSuccess = false;
          lastError = stepResult.error;

          if (!this.options.continueOnFailure) {
            break;
          }
        }
      }

      // 获取最终退出码
      const exitCode = this.terminal.getExitCode();

      return {
        success: overallSuccess,
        steps: stepResults,
        totalDuration: Date.now() - startTime,
        exitCode: exitCode ?? undefined,
        output: this.terminal.getOutput(),
        error: lastError,
      };
    } catch (error) {
      return {
        success: false,
        steps: stepResults,
        totalDuration: Date.now() - startTime,
        exitCode: this.terminal?.getExitCode() ?? undefined,
        output: this.terminal?.getOutput() ?? '',
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.isExecuting = false;
      this.cleanup();
    }
  }

  /**
   * 执行单个步骤
   *
   * @param step - 交互步骤
   * @returns 步骤执行结果
   */
  async executeStep(step: InteractionStep): Promise<StepResult> {
    const startTime = Date.now();

    if (!this.terminal) {
      return {
        step,
        success: false,
        duration: 0,
        error: '终端未初始化',
      };
    }

    try {
      let output: string | undefined;

      switch (step.type) {
        case 'send':
          output = await this.handleSend(step);
          break;

        case 'sendKey':
          output = await this.handleSendKey(step);
          break;

        case 'wait':
          output = await this.handleWait(step);
          break;

        case 'waitForExit':
          output = await this.handleWaitForExit(step);
          break;

        case 'assert':
          output = await this.handleAssert(step);
          break;

        case 'delay':
          await this.handleDelay(step);
          break;

        default:
          throw new TerminalTestError(
            TerminalTestErrorType.INVALID_CONFIG,
            `未知的步骤类型: ${(step as InteractionStep).type}`
          );
      }

      return {
        step,
        success: true,
        duration: Date.now() - startTime,
        output,
      };
    } catch (error) {
      return {
        step,
        success: false,
        duration: Date.now() - startTime,
        output: this.terminal?.getStrippedOutput(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 处理发送输入步骤
   */
  private async handleSend(step: InteractionStep): Promise<string> {
    if (!this.terminal) {
      throw new TerminalTestError(
        TerminalTestErrorType.PROCESS_START_FAILED,
        '终端未初始化'
      );
    }

    if (typeof step.value !== 'string') {
      throw new TerminalTestError(
        TerminalTestErrorType.INVALID_CONFIG,
        'send 步骤的 value 必须是字符串'
      );
    }

    this.terminal.write(step.value);
    return this.terminal.getStrippedOutput();
  }

  /**
   * 处理发送特殊按键步骤
   */
  private async handleSendKey(step: InteractionStep): Promise<string> {
    if (!this.terminal) {
      throw new TerminalTestError(
        TerminalTestErrorType.PROCESS_START_FAILED,
        '终端未初始化'
      );
    }

    if (!this.isSpecialKey(step.value)) {
      throw new TerminalTestError(
        TerminalTestErrorType.INVALID_CONFIG,
        'sendKey 步骤的 value 必须是 SpecialKey 枚举值'
      );
    }

    this.terminal.sendKey(step.value);
    return this.terminal.getStrippedOutput();
  }

  /**
   * 处理等待输出步骤
   */
  private async handleWait(step: InteractionStep): Promise<string> {
    if (!this.terminal) {
      throw new TerminalTestError(
        TerminalTestErrorType.PROCESS_START_FAILED,
        '终端未初始化'
      );
    }

    if (typeof step.value !== 'string' && !(step.value instanceof RegExp)) {
      throw new TerminalTestError(
        TerminalTestErrorType.INVALID_CONFIG,
        'wait 步骤的 value 必须是字符串或正则表达式'
      );
    }

    const timeout = step.timeout ?? this.options.defaultStepTimeout;
    await this.terminal.waitFor(step.value, timeout);
    return this.terminal.getStrippedOutput();
  }

  /**
   * 处理等待退出步骤
   */
  private async handleWaitForExit(step: InteractionStep): Promise<string> {
    if (!this.terminal) {
      throw new TerminalTestError(
        TerminalTestErrorType.PROCESS_START_FAILED,
        '终端未初始化'
      );
    }

    const timeout = step.timeout ?? this.options.defaultStepTimeout;
    const exitCode = await this.terminal.waitForExit(timeout);
    return `进程退出，退出码: ${exitCode}`;
  }

  /**
   * 处理断言步骤
   */
  private async handleAssert(step: InteractionStep): Promise<string> {
    if (!this.terminal) {
      throw new TerminalTestError(
        TerminalTestErrorType.PROCESS_START_FAILED,
        '终端未初始化'
      );
    }

    if (!step.assertion) {
      throw new TerminalTestError(
        TerminalTestErrorType.INVALID_CONFIG,
        'assert 步骤必须包含 assertion 选项'
      );
    }

    const output = step.assertion.stripAnsi
      ? this.terminal.getStrippedOutput()
      : this.terminal.getOutput();

    const result = this.assertionMatcher.assert(output, step.assertion);

    if (!result.passed) {
      throw new TerminalTestError(
        TerminalTestErrorType.ASSERTION_FAILED,
        result.message || '断言失败'
      );
    }

    return output;
  }

  /**
   * 处理延迟步骤
   */
  private async handleDelay(step: InteractionStep): Promise<void> {
    const delay = typeof step.value === 'number' 
      ? step.value 
      : (step.timeout ?? 1000);

    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * 检查值是否为 SpecialKey 枚举值
   */
  private isSpecialKey(value: unknown): value is SpecialKey {
    return Object.values(SpecialKey).includes(value as SpecialKey);
  }

  /**
   * 获取当前终端状态
   *
   * @returns 终端状态
   */
  getTerminalState(): TerminalState {
    if (!this.terminal) {
      return {
        isRunning: false,
        output: '',
        strippedOutput: '',
        exitCode: null,
      };
    }

    return {
      isRunning: this.terminal.isRunning(),
      output: this.terminal.getOutput(),
      strippedOutput: this.terminal.getStrippedOutput(),
      exitCode: this.terminal.getExitCode(),
    };
  }

  /**
   * 获取终端模拟器实例
   *
   * @returns 终端模拟器实例或 null
   */
  getTerminal(): TerminalEmulator | null {
    return this.terminal;
  }

  /**
   * 检查是否正在执行
   *
   * @returns 是否正在执行
   */
  isCurrentlyExecuting(): boolean {
    return this.isExecuting;
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    if (this.terminal) {
      this.terminal.dispose();
      this.terminal = null;
    }
  }

  /**
   * 强制停止执行
   */
  abort(): void {
    this.isExecuting = false;
    this.cleanup();
  }
}

/**
 * 创建 InteractionController 实例的工厂函数
 *
 * @param options - 交互控制器选项
 * @returns 新的 InteractionController 实例
 */
export function createInteractionController(
  options: InteractionControllerOptions
): InteractionController {
  return new InteractionController(options);
}
