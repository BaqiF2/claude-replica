/**
 * 交互控制器属性测试
 *
 * 使用 fast-check 进行属性测试，验证 InteractionController 的正确性
 *
 * **Property 6: Multi-Turn Conversation State**
 * **Validates: Requirements 2.2, 2.6**
 */

import * as fc from 'fast-check';
import { createInteractionController } from '../../src/testing/InteractionController';
import {
  InteractionScript,
  InteractionStep,
  SpecialKey,
} from '../../src/testing/types';

describe('InteractionController Property Tests', () => {
  // 测试超时时间
  const TEST_TIMEOUT = 30000;

  /**
   * Property 6: Multi-Turn Conversation State
   *
   * *For any* sequence of user inputs in an interactive session, the session
   * should maintain context across turns, and later inputs can reference
   * earlier conversation content.
   *
   * **Validates: Requirements 2.2, 2.6**
   */
  describe('Property 6: Multi-Turn Conversation State', () => {
    // 生成安全的输入字符串（避免控制字符）
    const safeInputArb = fc
      .stringOf(fc.char().filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127))
      .filter((s) => s.length > 0 && s.length < 30);

    it(
      '多轮输入应该按顺序被处理，输出应该包含所有输入内容',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            // 生成 2-5 个输入字符串
            fc.array(safeInputArb, { minLength: 2, maxLength: 5 }),
            async (inputs) => {
              // 构建交互脚本：发送每个输入，然后发送 ENTER
              const steps: InteractionStep[] = [];
              for (const input of inputs) {
                steps.push({ type: 'send', value: input });
                steps.push({ type: 'sendKey', value: SpecialKey.ENTER });
              }
              // 发送 CTRL+D 结束 cat
              steps.push({ type: 'sendKey', value: SpecialKey.CTRL_D });
              // 等待进程退出
              steps.push({ type: 'waitForExit', timeout: 5000 });

              const script: InteractionScript = {
                name: 'multi-turn-test',
                description: '测试多轮输入',
                steps,
              };

              const controller = createInteractionController({
                terminalOptions: {
                  command: '/bin/cat',
                  args: [],
                  timeout: 10000,
                },
                defaultStepTimeout: 5000,
              });

              const result = await controller.execute(script);

              // 验证执行成功
              expect(result.success).toBe(true);

              // 验证输出包含所有输入内容
              for (const input of inputs) {
                expect(result.output).toContain(input);
              }
            }
          ),
          { numRuns: 5, timeout: TEST_TIMEOUT }
        );
      },
      TEST_TIMEOUT
    );

    it(
      '多轮输入的顺序应该被保持',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            // 生成 3 个不同的输入字符串
            fc.tuple(
              fc.string({ minLength: 3, maxLength: 10 }).filter((s) => /^[a-zA-Z0-9]+$/.test(s)),
              fc.string({ minLength: 3, maxLength: 10 }).filter((s) => /^[a-zA-Z0-9]+$/.test(s)),
              fc.string({ minLength: 3, maxLength: 10 }).filter((s) => /^[a-zA-Z0-9]+$/.test(s))
            ).filter(([a, b, c]) => a !== b && b !== c && a !== c),
            async ([input1, input2, input3]) => {
              const script: InteractionScript = {
                name: 'order-test',
                description: '测试输入顺序',
                steps: [
                  { type: 'send', value: input1 },
                  { type: 'sendKey', value: SpecialKey.ENTER },
                  { type: 'send', value: input2 },
                  { type: 'sendKey', value: SpecialKey.ENTER },
                  { type: 'send', value: input3 },
                  { type: 'sendKey', value: SpecialKey.ENTER },
                  { type: 'sendKey', value: SpecialKey.CTRL_D },
                  { type: 'waitForExit', timeout: 5000 },
                ],
              };

              const controller = createInteractionController({
                terminalOptions: {
                  command: '/bin/cat',
                  args: [],
                  timeout: 10000,
                },
                defaultStepTimeout: 5000,
              });

              const result = await controller.execute(script);

              expect(result.success).toBe(true);

              // 验证输入顺序：input1 应该在 input2 之前，input2 应该在 input3 之前
              const output = result.output;
              const pos1 = output.indexOf(input1);
              const pos2 = output.indexOf(input2);
              const pos3 = output.indexOf(input3);

              expect(pos1).toBeGreaterThanOrEqual(0);
              expect(pos2).toBeGreaterThanOrEqual(0);
              expect(pos3).toBeGreaterThanOrEqual(0);
              expect(pos1).toBeLessThan(pos2);
              expect(pos2).toBeLessThan(pos3);
            }
          ),
          { numRuns: 5, timeout: TEST_TIMEOUT }
        );
      },
      TEST_TIMEOUT
    );

    it(
      '步骤结果数量应该等于脚本步骤数量',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            // 生成 1-5 个步骤
            fc.integer({ min: 1, max: 5 }),
            async (stepCount) => {
              const steps: InteractionStep[] = [];
              for (let i = 0; i < stepCount; i++) {
                steps.push({ type: 'send', value: `input${i}` });
                steps.push({ type: 'sendKey', value: SpecialKey.ENTER });
              }
              steps.push({ type: 'sendKey', value: SpecialKey.CTRL_D });
              steps.push({ type: 'waitForExit', timeout: 5000 });

              const script: InteractionScript = {
                name: 'step-count-test',
                steps,
              };

              const controller = createInteractionController({
                terminalOptions: {
                  command: '/bin/cat',
                  args: [],
                  timeout: 10000,
                },
                defaultStepTimeout: 5000,
              });

              const result = await controller.execute(script);

              // 步骤结果数量应该等于脚本步骤数量
              expect(result.steps.length).toBe(script.steps.length);
            }
          ),
          { numRuns: 5, timeout: TEST_TIMEOUT }
        );
      },
      TEST_TIMEOUT
    );

    it(
      '成功执行的脚本应该返回 success: true',
      async () => {
        await fc.assert(
          fc.asyncProperty(safeInputArb, async (input) => {
            const script: InteractionScript = {
              name: 'success-test',
              steps: [
                { type: 'send', value: input },
                { type: 'sendKey', value: SpecialKey.ENTER },
                { type: 'sendKey', value: SpecialKey.CTRL_D },
                { type: 'waitForExit', timeout: 5000 },
              ],
            };

            const controller = createInteractionController({
              terminalOptions: {
                command: '/bin/cat',
                args: [],
                timeout: 10000,
              },
              defaultStepTimeout: 5000,
            });

            const result = await controller.execute(script);

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
          }),
          { numRuns: 5, timeout: TEST_TIMEOUT }
        );
      },
      TEST_TIMEOUT
    );

    it(
      '执行时间应该大于等于所有步骤时间之和',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 1, max: 3 }),
            async (inputCount) => {
              const steps: InteractionStep[] = [];
              for (let i = 0; i < inputCount; i++) {
                steps.push({ type: 'send', value: `test${i}` });
                steps.push({ type: 'sendKey', value: SpecialKey.ENTER });
              }
              steps.push({ type: 'sendKey', value: SpecialKey.CTRL_D });
              steps.push({ type: 'waitForExit', timeout: 5000 });

              const script: InteractionScript = {
                name: 'timing-test',
                steps,
              };

              const controller = createInteractionController({
                terminalOptions: {
                  command: '/bin/cat',
                  args: [],
                  timeout: 10000,
                },
                defaultStepTimeout: 5000,
              });

              const result = await controller.execute(script);

              // 总时间应该大于等于所有步骤时间之和
              const stepsDuration = result.steps.reduce((sum, s) => sum + s.duration, 0);
              expect(result.totalDuration).toBeGreaterThanOrEqual(stepsDuration);
            }
          ),
          { numRuns: 5, timeout: TEST_TIMEOUT }
        );
      },
      TEST_TIMEOUT
    );
  });
});
