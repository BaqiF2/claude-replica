/**
 * File: Permission UI implementation adapter
 *
 * Core Class:
 * - PermissionUIImpl: Adapter implementing PermissionUI interface
 *
 * Responsibilities:
 * - Adapts permission UI components to PermissionUI interface
 * - Delegates tool permission prompts to PermissionPanel
 * - Delegates user questions to QuestionMenu
 * - Separates UI layer from permission logic layer
 */

import {
  PermissionUI,
  PermissionPanel,
  QuestionMenu,
  QuestionInput,
  QuestionAnswers,
} from '../permissions/PermissionUI';
import { ToolPermissionRequest, PermissionUIResult } from '../permissions/types';

export class PermissionUIImpl implements PermissionUI {
  private readonly permissionPanel: PermissionPanel;
  private readonly output: NodeJS.WritableStream;
  private readonly input: NodeJS.ReadableStream;

  constructor(
    output: NodeJS.WritableStream = process.stdout,
    input: NodeJS.ReadableStream = process.stdin
  ) {
    this.output = output;
    this.input = input;
    this.permissionPanel = new PermissionPanel(output, input);
  }

  /**
   * Display tool permission request panel
   *
   * @param request Permission request information
   * @returns User's approval decision and optional reason
   */
  async promptToolPermission(request: ToolPermissionRequest): Promise<PermissionUIResult> {
    return this.permissionPanel.show(request);
  }

  /**
   * Display AskUserQuestion interactive menu
   *
   * Iterates through questions list, creating a new QuestionMenu for each
   * to ensure clean state between questions.
   *
   * @param questions List of questions to ask
   * @returns User answers mapping (question -> answer)
   */
  async promptUserQuestions(questions: QuestionInput[]): Promise<QuestionAnswers> {
    const answers: QuestionAnswers = {};

    // Iterate through all questions and collect answers
    for (const question of questions) {
      // Create a new QuestionMenu instance for each question to ensure clean state
      const questionMenu = new QuestionMenu(this.output, this.input);

      try {
        const selectedAnswer = await questionMenu.show(question);
        // Store answer with question text as key
        answers[question.question] = selectedAnswer;
      } catch (error) {
        // Handle user cancellation (Esc key)
        if (error instanceof Error && error.message === 'User canceled selection') {
          // For canceled questions, use first option as default
          answers[question.question] = question.options[0]?.label || '';
        } else {
          throw error;
        }
      }
    }

    return answers;
  }
}
