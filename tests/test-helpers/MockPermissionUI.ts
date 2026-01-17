/**
 * 测试工具：权限 UI Mock
 *
 * 核心类：
 * - MockPermissionUI: 提供固定审批与默认问题答案
 * - MockPermissionUIFactory: 工厂版本的 Mock，提供统一的 UI Mock 实例
 *
 * 核心方法：
 * - promptToolPermission(): 始终返回批准
 * - promptUserQuestions(): 使用首个选项作为默认问题答案
 */

import {
  PermissionUI,
  QuestionInput,
  QuestionAnswers,
} from '../../src/permissions/PermissionUI';
import { PermissionUIResult } from '../../src/permissions/types';
import type { OutputInterface } from '../../src/ui/OutputInterface';
import type { ParserInterface } from '../../src/ui/ParserInterface';
import type {
  InteractiveUICallbacks,
  InteractiveUIConfig,
  InteractiveUIInterface,
} from '../../src/ui/InteractiveUIInterface';
import type { UIFactory } from '../../src/ui/factories/UIFactory';

export class MockPermissionUI implements PermissionUI {
  async promptToolPermission(): Promise<PermissionUIResult> {
    return { approved: true };
  }

  async promptUserQuestions(questions: QuestionInput[]): Promise<QuestionAnswers> {
    const answers: QuestionAnswers = {};
    for (const question of questions) {
      answers[question.question] = question.options[0]?.label || '';
    }
    return answers;
  }
}

/**
 * Mock PermissionUIFactory for testing
 */
export class MockPermissionUIFactory implements UIFactory {
  createParser(): ParserInterface {
    return {
      parse: () => ({ help: false, version: false, debug: false }),
      getHelpText: () => 'mock help',
      getVersionText: () => 'mock version',
    };
  }

  createOutput(): OutputInterface {
    return {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      success: () => undefined,
      section: () => undefined,
      blankLine: () => undefined,
    };
  }

  createPermissionUI(
    _output?: NodeJS.WritableStream,
    _input?: NodeJS.ReadableStream
  ): PermissionUI {
    return new MockPermissionUI();
  }

  createInteractiveUI(
    _callbacks: InteractiveUICallbacks,
    _config?: InteractiveUIConfig
  ): InteractiveUIInterface {
    return {
      start: async () => undefined,
      stop: () => undefined,
      displayMessage: () => undefined,
      displayToolUse: () => undefined,
      displayToolResult: () => undefined,
      displayThinking: () => undefined,
      displayComputing: () => undefined,
      stopComputing: () => undefined,
      clearProgress: () => undefined,
      displayError: () => undefined,
      displayWarning: () => undefined,
      displaySuccess: () => undefined,
      displayInfo: () => undefined,
      promptConfirmation: async () => true,
      showRewindMenu: async () => null,
      showSessionMenu: async () => null,
      showConfirmationMenu: async () => true,
      setInitialPermissionMode: () => undefined,
      setPermissionMode: () => undefined,
      displayPermissionStatus: () => undefined,
      setProcessingState: () => undefined,
      formatRelativeTime: () => '',
      formatAbsoluteTime: () => '',
      formatStatsSummary: () => '',
    };
  }
}
