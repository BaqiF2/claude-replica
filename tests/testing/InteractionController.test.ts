/**
 * 交互控制器单元测试
 *
 * 测试 InteractionController 类的核心功能
 *
 * _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
 */

import {
  InteractionController,
  createInteractionController,
} from '../../src/testing/InteractionController';
import {
  InteractionScript,
  SpecialKey,
  TerminalTestError,
} from '../../src/testing/types';

// 检测 node-pty 是否可用
let nodePtyAvailable = false;
try {
  const pty = require('node-pty');
  const testPty = pty.spawn('/bin/echo', ['test'], {
    name: 'xterm',
    cols: 80,
    rows: 24,
  });
  testPty.kill();
  nodePtyAvailable = true;
} catch {
  nodePtyAvailable = false;
}

const describeWithPty = nodePtyAvailable ? describe : describe.skip;

describe('InteractionController', () => {
  describe('创建和配置', () => {
    it('应该能够创建 InteractionController 实例', () => {
      const controller = createInteractionController({
        terminalOptions: {
          command: 'echo',
          args: ['test'],
        },
      });

      expect(controller).toBeInstanceOf(InteractionController);
    });

    it('应该使用默认配置', () => {
      const controller = createInteractionController({
        terminalOptions: {
          command: 'echo',
        },
      });

      expect(controller.isCurrentlyExecuting()).toBe(false);
      expect(controller.getTerminal()).toBeNull();
    });

    it('应该接受自定义配置', () => {
      const controller = createInteractionController({
        terminalOptions: {
          command: 'echo',
          args: ['hello'],
          timeout: 5000,
        },
        defaultStepTimeout: 3000,
        continueOnFailure: true,
      });

      expect(controller).toBeInstanceOf(InteractionController);
    });
  });

  describe('终端状态', () => {
    it('未执行时 getTerminalState() 应该返回默认状态', () => {
      const controller = createInteractionController({
        terminalOptions: {
          command: 'echo',
          args: ['test'],
        },
      });

      const state = controller.getTerminalState();
      expect(state.isRunning).toBe(false);
      expect(state.output).toBe('');
      expect(state.strippedOutput).toBe('');
      expect(state.exitCode).toBeNull();
    });
  });

  describe('abort()', () => {
    it('abort() 应该清理资源', () => {
      const controller = createInteractionController({
        terminalOptions: {
          command: 'echo',
          args: ['test'],
        },
      });

      // abort 不应该抛出错误
      expect(() => controller.abort()).not.toThrow();
      expect(controller.isCurrentlyExecuting()).toBe(false);
      expect(controller.getTerminal()).toBeNull();
    });
  });

  // 以下测试需要 node-pty 可用
  describeWithPty('脚本执行 (需要 node-pty)', () => {
    it('应该能够执行简单的脚本', async () => {
      const script: InteractionScript = {
        name: 'simple-test',
        description: '简单测试',
        steps: [
          { type: 'waitForExit', timeout: 5000 },
        ],
      };

      const controller = createInteractionController({
        terminalOptions: {
          command: '/bin/echo',
          args: ['hello world'],
          timeout: 5000,
        },
      });

      const result = await controller.execute(script);

      expect(result.success).toBe(true);
      expect(result.output).toContain('hello world');
      expect(result.exitCode).toBe(0);
      expect(result.steps.length).toBe(1);
    }, 10000);

    it('应该能够执行多步骤脚本', async () => {
      const script: InteractionScript = {
        name: 'multi-step-test',
        steps: [
          { type: 'send', value: 'line1' },
          { type: 'sendKey', value: SpecialKey.ENTER },
          { type: 'send', value: 'line2' },
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
      expect(result.output).toContain('line1');
      expect(result.output).toContain('line2');
      expect(result.steps.length).toBe(6);
    }, 15000);

    it('应该记录每个步骤的执行时间', async () => {
      const script: InteractionScript = {
        name: 'timing-test',
        steps: [
          { type: 'delay', timeout: 100 },
          { type: 'waitForExit', timeout: 5000 },
        ],
      };

      const controller = createInteractionController({
        terminalOptions: {
          command: '/bin/echo',
          args: ['test'],
          timeout: 5000,
        },
      });

      const result = await controller.execute(script);

      expect(result.success).toBe(true);
      expect(result.steps.length).toBe(2);
      
      // 每个步骤都应该有执行时间
      for (const step of result.steps) {
        expect(step.duration).toBeGreaterThanOrEqual(0);
      }

      // 总时间应该大于等于延迟时间
      expect(result.totalDuration).toBeGreaterThanOrEqual(100);
    }, 10000);
  });

  describeWithPty('步骤类型处理 (需要 node-pty)', () => {
    it('send 步骤应该发送输入', async () => {
      const script: InteractionScript = {
        name: 'send-test',
        steps: [
          { type: 'send', value: 'test input' },
          { type: 'sendKey', value: SpecialKey.ENTER },
          { type: 'sendKey', value: SpecialKey.CTRL_D },
          { type: 'waitForExit', timeout: 5000 },
        ],
      };

      const controller = createInteractionController({
        terminalOptions: {
          command: '/bin/cat',
          args: [],
          timeout: 5000,
        },
      });

      const result = await controller.execute(script);

      expect(result.success).toBe(true);
      expect(result.output).toContain('test input');
    }, 10000);

    it('sendKey 步骤应该发送特殊按键', async () => {
      const script: InteractionScript = {
        name: 'sendkey-test',
        steps: [
          { type: 'delay', timeout: 100 }, // 等待进程启动
          { type: 'sendKey', value: SpecialKey.CTRL_C },
          { type: 'waitForExit', timeout: 10000 },
        ],
      };

      const controller = createInteractionController({
        terminalOptions: {
          command: '/bin/sleep',
          args: ['60'],
          timeout: 15000,
        },
      });

      const result = await controller.execute(script);

      expect(result.success).toBe(true);
      // 进程应该被 CTRL+C 中断
      expect(result.exitCode).toBeDefined();
    }, 20000);

    it('wait 步骤应该等待输出匹配', async () => {
      const script: InteractionScript = {
        name: 'wait-test',
        steps: [
          { type: 'wait', value: 'expected output', timeout: 5000 },
          { type: 'waitForExit', timeout: 5000 },
        ],
      };

      const controller = createInteractionController({
        terminalOptions: {
          command: '/bin/echo',
          args: ['expected output'],
          timeout: 5000,
        },
      });

      const result = await controller.execute(script);

      expect(result.success).toBe(true);
    }, 10000);

    it('wait 步骤应该支持正则表达式', async () => {
      const script: InteractionScript = {
        name: 'wait-regex-test',
        steps: [
          { type: 'wait', value: /version \d+\.\d+/, timeout: 5000 },
          { type: 'waitForExit', timeout: 5000 },
        ],
      };

      const controller = createInteractionController({
        terminalOptions: {
          command: '/bin/echo',
          args: ['version 1.2'],
          timeout: 5000,
        },
      });

      const result = await controller.execute(script);

      expect(result.success).toBe(true);
    }, 10000);

    it('delay 步骤应该延迟执行', async () => {
      const script: InteractionScript = {
        name: 'delay-test',
        steps: [
          { type: 'delay', timeout: 200 },
          { type: 'waitForExit', timeout: 5000 },
        ],
      };

      const controller = createInteractionController({
        terminalOptions: {
          command: '/bin/echo',
          args: ['test'],
          timeout: 5000,
        },
      });

      const startTime = Date.now();
      const result = await controller.execute(script);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeGreaterThanOrEqual(200);
    }, 10000);

    it('assert 步骤应该验证输出', async () => {
      const script: InteractionScript = {
        name: 'assert-test',
        steps: [
          { type: 'wait', value: 'hello', timeout: 5000 },
          {
            type: 'assert',
            assertion: {
              type: 'contains',
              expected: 'hello',
              stripAnsi: true,
            },
          },
          { type: 'waitForExit', timeout: 5000 },
        ],
      };

      const controller = createInteractionController({
        terminalOptions: {
          command: '/bin/echo',
          args: ['hello world'],
          timeout: 5000,
        },
      });

      const result = await controller.execute(script);

      expect(result.success).toBe(true);
    }, 10000);
  });

  describeWithPty('错误处理 (需要 node-pty)', () => {
    it('wait 超时应该返回失败结果', async () => {
      const script: InteractionScript = {
        name: 'timeout-test',
        steps: [
          { type: 'wait', value: 'never appear', timeout: 100 },
        ],
      };

      const controller = createInteractionController({
        terminalOptions: {
          command: '/bin/sleep',
          args: ['10'],
          timeout: 5000,
        },
      });

      const result = await controller.execute(script);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('超时');
    }, 10000);

    it('assert 失败应该返回失败结果', async () => {
      const script: InteractionScript = {
        name: 'assert-fail-test',
        steps: [
          { type: 'wait', value: 'hello', timeout: 5000 },
          {
            type: 'assert',
            assertion: {
              type: 'exact',
              expected: 'wrong content',
              stripAnsi: true,
            },
          },
        ],
      };

      const controller = createInteractionController({
        terminalOptions: {
          command: '/bin/echo',
          args: ['hello world'],
          timeout: 5000,
        },
      });

      const result = await controller.execute(script);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    }, 10000);

    it('continueOnFailure 为 true 时应该继续执行', async () => {
      const script: InteractionScript = {
        name: 'continue-test',
        steps: [
          { type: 'wait', value: 'never appear', timeout: 100 },
          { type: 'waitForExit', timeout: 5000 },
        ],
      };

      const controller = createInteractionController({
        terminalOptions: {
          command: '/bin/echo',
          args: ['test'],
          timeout: 5000,
        },
        continueOnFailure: true,
      });

      const result = await controller.execute(script);

      // 整体失败，但应该执行了两个步骤
      expect(result.success).toBe(false);
      expect(result.steps.length).toBe(2);
    }, 10000);

    it('continueOnFailure 为 false 时应该停止执行', async () => {
      const script: InteractionScript = {
        name: 'stop-test',
        steps: [
          { type: 'wait', value: 'never appear', timeout: 100 },
          { type: 'waitForExit', timeout: 5000 },
        ],
      };

      const controller = createInteractionController({
        terminalOptions: {
          command: '/bin/sleep',
          args: ['10'],
          timeout: 5000,
        },
        continueOnFailure: false,
      });

      const result = await controller.execute(script);

      // 应该在第一个步骤失败后停止
      expect(result.success).toBe(false);
      expect(result.steps.length).toBe(1);
    }, 10000);

    it('无效的步骤类型应该返回错误', async () => {
      const script: InteractionScript = {
        name: 'invalid-step-test',
        steps: [
          { type: 'invalid' as any, value: 'test' },
        ],
      };

      const controller = createInteractionController({
        terminalOptions: {
          command: '/bin/echo',
          args: ['test'],
          timeout: 5000,
        },
      });

      const result = await controller.execute(script);

      expect(result.success).toBe(false);
      expect(result.error).toContain('未知的步骤类型');
    }, 10000);

    it('send 步骤的 value 必须是字符串', async () => {
      const script: InteractionScript = {
        name: 'invalid-send-test',
        steps: [
          { type: 'send', value: 123 as any },
        ],
      };

      const controller = createInteractionController({
        terminalOptions: {
          command: '/bin/echo',
          args: ['test'],
          timeout: 5000,
        },
      });

      const result = await controller.execute(script);

      expect(result.success).toBe(false);
      expect(result.error).toContain('必须是字符串');
    }, 10000);

    it('assert 步骤必须包含 assertion 选项', async () => {
      const script: InteractionScript = {
        name: 'invalid-assert-test',
        steps: [
          { type: 'assert' },
        ],
      };

      const controller = createInteractionController({
        terminalOptions: {
          command: '/bin/echo',
          args: ['test'],
          timeout: 5000,
        },
      });

      const result = await controller.execute(script);

      expect(result.success).toBe(false);
      expect(result.error).toContain('assertion');
    }, 10000);
  });

  describeWithPty('并发执行限制 (需要 node-pty)', () => {
    it('不应该允许同时执行多个脚本', async () => {
      const script: InteractionScript = {
        name: 'concurrent-test',
        steps: [
          { type: 'delay', timeout: 500 },
          { type: 'waitForExit', timeout: 5000 },
        ],
      };

      const controller = createInteractionController({
        terminalOptions: {
          command: '/bin/echo',
          args: ['test'],
          timeout: 5000,
        },
      });

      // 启动第一个执行
      const firstExecution = controller.execute(script);

      // 尝试启动第二个执行应该失败
      await expect(controller.execute(script)).rejects.toThrow(TerminalTestError);
      await expect(controller.execute(script)).rejects.toThrow('已有脚本正在执行中');

      // 等待第一个执行完成
      await firstExecution;
    }, 10000);
  });
});
