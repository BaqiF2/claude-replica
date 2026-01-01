/**
 * 终端模拟器单元测试
 *
 * 测试 TerminalEmulator 类的核心功能
 *
 * _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_
 */

import { TerminalEmulator, createTerminalEmulator } from '../../src/testing/TerminalEmulator';
import { SpecialKey, TerminalTestError, TerminalTestErrorType } from '../../src/testing/types';

// 检测 node-pty 是否可用
let nodePtyAvailable = false;
try {
  const pty = require('node-pty');
  // 尝试创建一个简单的 PTY 来验证可用性
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

// 如果 node-pty 不可用，跳过需要 PTY 的测试
const describeWithPty = nodePtyAvailable ? describe : describe.skip;

describe('TerminalEmulator', () => {
  describe('创建和配置', () => {
    it('应该能够创建 TerminalEmulator 实例', () => {
      const emulator = createTerminalEmulator({
        command: 'echo',
        args: ['test'],
      });

      expect(emulator).toBeInstanceOf(TerminalEmulator);
    });

    it('应该使用默认配置', () => {
      const emulator = createTerminalEmulator({
        command: 'echo',
      });

      // 初始状态检查
      expect(emulator.isRunning()).toBe(false);
      expect(emulator.getOutput()).toBe('');
      expect(emulator.getStrippedOutput()).toBe('');
      expect(emulator.getExitCode()).toBeNull();
      expect(emulator.getPid()).toBeUndefined();
    });

    it('应该接受自定义配置', () => {
      const emulator = createTerminalEmulator({
        command: 'echo',
        args: ['hello', 'world'],
        cwd: '/tmp',
        env: { CUSTOM_VAR: 'value' },
        cols: 120,
        rows: 40,
        timeout: 5000,
      });

      expect(emulator).toBeInstanceOf(TerminalEmulator);
    });
  });

  describe('销毁和清理', () => {
    it('dispose() 应该是幂等的', () => {
      const emulator = createTerminalEmulator({
        command: 'echo',
        args: ['test'],
      });

      // 多次调用 dispose 不应该抛出错误
      expect(() => {
        emulator.dispose();
        emulator.dispose();
        emulator.dispose();
      }).not.toThrow();
    });

    it('销毁后 isRunning() 应该返回 false', () => {
      const emulator = createTerminalEmulator({
        command: 'echo',
        args: ['test'],
      });

      emulator.dispose();
      expect(emulator.isRunning()).toBe(false);
    });

    it('销毁后 start() 应该抛出错误', async () => {
      const emulator = createTerminalEmulator({
        command: 'echo',
        args: ['test'],
      });

      emulator.dispose();

      await expect(emulator.start()).rejects.toThrow(TerminalTestError);
      await expect(emulator.start()).rejects.toMatchObject({
        type: TerminalTestErrorType.PTY_CREATE_FAILED,
      });
    });
  });

  describe('未启动时的操作', () => {
    it('write() 应该抛出错误', () => {
      const emulator = createTerminalEmulator({
        command: 'echo',
        args: ['test'],
      });

      expect(() => emulator.write('test')).toThrow(TerminalTestError);
      expect(() => emulator.write('test')).toThrow('终端会话未启动');
    });

    it('sendKey() 应该抛出错误', () => {
      const emulator = createTerminalEmulator({
        command: 'echo',
        args: ['test'],
      });

      expect(() => emulator.sendKey(SpecialKey.ENTER)).toThrow(TerminalTestError);
    });

    it('waitForExit() 应该抛出错误', async () => {
      const emulator = createTerminalEmulator({
        command: 'echo',
        args: ['test'],
      });

      await expect(emulator.waitForExit()).rejects.toThrow(TerminalTestError);
      await expect(emulator.waitForExit()).rejects.toThrow('终端会话未启动');
    });
  });

  describe('输出缓冲区', () => {
    it('clearOutput() 应该清空输出', () => {
      const emulator = createTerminalEmulator({
        command: 'echo',
        args: ['test'],
      });

      // 手动设置一些输出（通过内部状态模拟）
      emulator.clearOutput();
      expect(emulator.getOutput()).toBe('');
      expect(emulator.getStrippedOutput()).toBe('');
    });
  });

  describe('特殊按键映射', () => {
    it('应该支持所有定义的特殊按键', () => {
      const allKeys = Object.values(SpecialKey);
      expect(allKeys.length).toBeGreaterThan(0);

      // 验证所有按键都有定义
      expect(allKeys).toContain(SpecialKey.ENTER);
      expect(allKeys).toContain(SpecialKey.CTRL_C);
      expect(allKeys).toContain(SpecialKey.CTRL_D);
      expect(allKeys).toContain(SpecialKey.ESCAPE);
      expect(allKeys).toContain(SpecialKey.TAB);
      expect(allKeys).toContain(SpecialKey.BACKSPACE);
      expect(allKeys).toContain(SpecialKey.UP);
      expect(allKeys).toContain(SpecialKey.DOWN);
      expect(allKeys).toContain(SpecialKey.LEFT);
      expect(allKeys).toContain(SpecialKey.RIGHT);
    });
  });

  // 以下测试需要 node-pty 可用
  describeWithPty('PTY 会话管理 (需要 node-pty)', () => {
    it('start() 应该启动 PTY 会话', async () => {
      const emulator = createTerminalEmulator({
        command: '/bin/echo',
        args: ['hello'],
        timeout: 5000,
      });

      try {
        await emulator.start();
        expect(emulator.getPid()).toBeDefined();
        expect(typeof emulator.getPid()).toBe('number');
      } finally {
        emulator.dispose();
      }
    }, 10000);

    it('重复 start() 应该抛出错误', async () => {
      const emulator = createTerminalEmulator({
        command: '/bin/echo',
        args: ['hello'],
        timeout: 5000,
      });

      try {
        await emulator.start();
        await expect(emulator.start()).rejects.toThrow(TerminalTestError);
        await expect(emulator.start()).rejects.toThrow('终端会话已经启动');
      } finally {
        emulator.dispose();
      }
    }, 10000);

    it('waitForExit() 应该返回退出码', async () => {
      const emulator = createTerminalEmulator({
        command: '/bin/echo',
        args: ['hello'],
        timeout: 5000,
      });

      try {
        await emulator.start();
        const exitCode = await emulator.waitForExit(5000);
        expect(exitCode).toBe(0);
        expect(emulator.getExitCode()).toBe(0);
      } finally {
        emulator.dispose();
      }
    }, 10000);

    it('getOutput() 应该捕获输出', async () => {
      const emulator = createTerminalEmulator({
        command: '/bin/echo',
        args: ['hello world'],
        timeout: 5000,
      });

      try {
        await emulator.start();
        await emulator.waitForExit(5000);

        const output = emulator.getOutput();
        const strippedOutput = emulator.getStrippedOutput();

        expect(strippedOutput).toContain('hello world');
        expect(output.length).toBeGreaterThanOrEqual(strippedOutput.length);
      } finally {
        emulator.dispose();
      }
    }, 10000);

    it('waitFor() 应该等待匹配的输出', async () => {
      const emulator = createTerminalEmulator({
        command: '/bin/echo',
        args: ['expected output'],
        timeout: 5000,
      });

      try {
        await emulator.start();
        await emulator.waitFor('expected output', 5000);

        expect(emulator.getStrippedOutput()).toContain('expected output');
      } finally {
        emulator.dispose();
      }
    }, 10000);

    it('waitFor() 超时应该抛出 TIMEOUT 错误', async () => {
      const emulator = createTerminalEmulator({
        command: '/bin/sleep',
        args: ['10'],
        timeout: 5000,
      });

      try {
        await emulator.start();

        await expect(emulator.waitFor('never appear', 100)).rejects.toThrow(TerminalTestError);
        await expect(emulator.waitFor('never appear', 100)).rejects.toMatchObject({
          type: TerminalTestErrorType.TIMEOUT,
        });
      } finally {
        emulator.kill();
        emulator.dispose();
      }
    }, 10000);

    it('kill() 应该终止进程', async () => {
      const emulator = createTerminalEmulator({
        command: '/bin/sleep',
        args: ['60'],
        timeout: 10000,
      });

      try {
        await emulator.start();
        expect(emulator.isRunning()).toBe(true);

        emulator.kill();

        // 等待进程退出
        const exitCode = await emulator.waitForExit(5000);
        expect(typeof exitCode).toBe('number');
        expect(emulator.isRunning()).toBe(false);
      } finally {
        emulator.dispose();
      }
    }, 15000);

    it('sendKey(CTRL_C) 应该中断进程', async () => {
      const emulator = createTerminalEmulator({
        command: '/bin/sleep',
        args: ['60'],
        timeout: 10000,
      });

      try {
        await emulator.start();

        // 等待进程启动
        await new Promise((resolve) => setTimeout(resolve, 100));

        emulator.sendKey(SpecialKey.CTRL_C);

        const exitCode = await emulator.waitForExit(5000);
        expect(typeof exitCode).toBe('number');
      } finally {
        emulator.dispose();
      }
    }, 15000);

    it('write() 应该发送输入到进程', async () => {
      const emulator = createTerminalEmulator({
        command: '/bin/cat',
        args: [],
        timeout: 5000,
      });

      try {
        await emulator.start();

        // 发送输入并添加换行符
        emulator.write('test input\n');
        
        // 等待输出出现
        await emulator.waitFor('test input', 2000);
        
        // 发送 CTRL+D 结束输入
        emulator.sendKey(SpecialKey.CTRL_D);

        await emulator.waitForExit(5000);

        expect(emulator.getStrippedOutput()).toContain('test input');
      } finally {
        emulator.dispose();
      }
    }, 10000);

    it('resize() 应该调整终端大小', async () => {
      const emulator = createTerminalEmulator({
        command: '/bin/echo',
        args: ['test'],
        cols: 80,
        rows: 24,
        timeout: 5000,
      });

      try {
        await emulator.start();

        // resize 不应该抛出错误
        expect(() => emulator.resize(120, 40)).not.toThrow();

        await emulator.waitForExit(5000);
      } finally {
        emulator.dispose();
      }
    }, 10000);

    it('waitFor() 支持正则表达式匹配', async () => {
      const emulator = createTerminalEmulator({
        command: '/bin/echo',
        args: ['version 1.2.3'],
        timeout: 5000,
      });

      try {
        await emulator.start();
        await emulator.waitFor(/version \d+\.\d+\.\d+/, 5000);

        expect(emulator.getStrippedOutput()).toMatch(/version \d+\.\d+\.\d+/);
      } finally {
        emulator.dispose();
      }
    }, 10000);
  });
});
