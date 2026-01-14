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
import { PermissionUIFactory } from '../../src/ui/factories/PermissionUIFactory';

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
export class MockPermissionUIFactory implements PermissionUIFactory {
  createPermissionUI(
    _output?: NodeJS.WritableStream,
    _input?: NodeJS.ReadableStream
  ): PermissionUI {
    return new MockPermissionUI();
  }
}
