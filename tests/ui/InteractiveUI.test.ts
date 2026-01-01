/**
 * InteractiveUI 单元测试
 *
 * 测试交互式 UI 组件的核心功能
 * **验证: 需求 1.4, 1.5, 1.6, 15.2, 27.1, 27.2, 27.3, 27.4, 27.5**
 */

import { EventEmitter, Readable, Writable } from 'stream';
import {
  InteractiveUI,
  InteractiveUIOptions,
  Snapshot,
  MessageRole,
} from '../../src/ui/InteractiveUI';

/**
 * 创建模拟输入流
 */
function createMockInput(): Readable & { push: (data: string | null) => boolean } {
  const input = new Readable({
    read() {},
  });
  return input as Readable & { push: (data: string | null) => boolean };
}

/**
 * 创建模拟输出流
 */
function createMockOutput(): Writable & { getOutput: () => string; clear: () => void } {
  let buffer = '';
  const output = new Writable({
    write(chunk, _encoding, callback) {
      buffer += chunk.toString();
      callback();
    },
  }) as Writable & { getOutput: () => string; clear: () => void };

  output.getOutput = () => buffer;
  output.clear = () => {
    buffer = '';
  };

  return output;
}

/**
 * 创建测试用的 InteractiveUI 实例
 */
function createTestUI(
  overrides: Partial<InteractiveUIOptions> = {}
): {
  ui: InteractiveUI;
  input: ReturnType<typeof createMockInput>;
  output: ReturnType<typeof createMockOutput>;
  onMessage: jest.Mock;
  onInterrupt: jest.Mock;
  onRewind: jest.Mock;
} {
  const input = createMockInput();
  const output = createMockOutput();
  const onMessage = jest.fn().mockResolvedValue(undefined);
  const onInterrupt = jest.fn();
  const onRewind = jest.fn().mockResolvedValue(undefined);

  const ui = new InteractiveUI({
    onMessage,
    onInterrupt,
    onRewind,
    input,
    output,
    enableColors: false, // 禁用颜色以便测试
    ...overrides,
  });

  return { ui, input, output, onMessage, onInterrupt, onRewind };
}

describe('InteractiveUI', () => {
  describe('构造函数', () => {
    it('应正确初始化', () => {
      const { ui } = createTestUI();

      expect(ui).toBeInstanceOf(InteractiveUI);
      expect(ui).toBeInstanceOf(EventEmitter);
    });

    it('应使用默认选项', () => {
      const { ui } = createTestUI();

      expect(ui.isActive()).toBe(false);
    });
  });

  describe('displayMessage', () => {
    it('应显示用户消息', () => {
      const { ui, output } = createTestUI();

      ui.displayMessage('Hello, Claude!', 'user');

      const outputText = output.getOutput();
      expect(outputText).toContain('你:');
      expect(outputText).toContain('Hello, Claude!');
    });

    it('应显示助手消息', () => {
      const { ui, output } = createTestUI();

      ui.displayMessage('Hello, User!', 'assistant');

      const outputText = output.getOutput();
      expect(outputText).toContain('Claude:');
      expect(outputText).toContain('Hello, User!');
    });

    it('应显示系统消息', () => {
      const { ui, output } = createTestUI();

      ui.displayMessage('System notification', 'system');

      const outputText = output.getOutput();
      expect(outputText).toContain('系统:');
      expect(outputText).toContain('System notification');
    });

    it('应正确处理不同角色的消息', () => {
      const { ui, output } = createTestUI();
      const roles: MessageRole[] = ['user', 'assistant', 'system'];

      roles.forEach((role) => {
        output.clear();
        ui.displayMessage(`Message from ${role}`, role);
        expect(output.getOutput()).toContain(`Message from ${role}`);
      });
    });
  });

  describe('displayToolUse', () => {
    it('应显示工具调用信息', () => {
      const { ui, output } = createTestUI();

      ui.displayToolUse('Read', { path: '/test/file.txt' });

      const outputText = output.getOutput();
      expect(outputText).toContain('工具调用:');
      expect(outputText).toContain('Read');
      expect(outputText).toContain('/test/file.txt');
    });

    it('应显示空参数的工具调用', () => {
      const { ui, output } = createTestUI();

      ui.displayToolUse('Bash', {});

      const outputText = output.getOutput();
      expect(outputText).toContain('工具调用:');
      expect(outputText).toContain('Bash');
    });

    it('应正确格式化复杂参数', () => {
      const { ui, output } = createTestUI();

      ui.displayToolUse('Write', {
        path: '/test/file.txt',
        content: 'Hello World',
        options: { overwrite: true },
      });

      const outputText = output.getOutput();
      expect(outputText).toContain('Write');
      expect(outputText).toContain('path');
      expect(outputText).toContain('content');
    });
  });

  describe('displayProgress', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('应显示成功状态', () => {
      const { ui, output } = createTestUI();

      ui.displayProgress('操作完成', 'success');

      const outputText = output.getOutput();
      expect(outputText).toContain('操作完成');
      expect(outputText).toContain('✅');
    });

    it('应显示错误状态', () => {
      const { ui, output } = createTestUI();

      ui.displayProgress('操作失败', 'error');

      const outputText = output.getOutput();
      expect(outputText).toContain('操作失败');
      expect(outputText).toContain('❌');
    });

    it('应显示警告状态', () => {
      const { ui, output } = createTestUI();

      ui.displayProgress('请注意', 'warning');

      const outputText = output.getOutput();
      expect(outputText).toContain('请注意');
      expect(outputText).toContain('⚠️');
    });

    it('应能清除进度指示器', () => {
      const { ui } = createTestUI();

      ui.displayProgress('加载中...', 'running');
      ui.clearProgress();

      // 验证没有抛出错误
      expect(true).toBe(true);
    });
  });


  describe('displayError/displayWarning/displaySuccess/displayInfo', () => {
    it('应显示错误信息', () => {
      const { ui, output } = createTestUI();

      ui.displayError('发生错误');

      const outputText = output.getOutput();
      expect(outputText).toContain('错误:');
      expect(outputText).toContain('发生错误');
    });

    it('应显示警告信息', () => {
      const { ui, output } = createTestUI();

      ui.displayWarning('请注意');

      const outputText = output.getOutput();
      expect(outputText).toContain('警告:');
      expect(outputText).toContain('请注意');
    });

    it('应显示成功信息', () => {
      const { ui, output } = createTestUI();

      ui.displaySuccess('操作成功');

      const outputText = output.getOutput();
      expect(outputText).toContain('成功:');
      expect(outputText).toContain('操作成功');
    });

    it('应显示信息', () => {
      const { ui, output } = createTestUI();

      ui.displayInfo('提示信息');

      const outputText = output.getOutput();
      expect(outputText).toContain('信息:');
      expect(outputText).toContain('提示信息');
    });
  });

  describe('displayDiff', () => {
    it('应正确显示添加的行', () => {
      const { ui, output } = createTestUI();

      ui.displayDiff('+added line');

      expect(output.getOutput()).toContain('+added line');
    });

    it('应正确显示删除的行', () => {
      const { ui, output } = createTestUI();

      ui.displayDiff('-removed line');

      expect(output.getOutput()).toContain('-removed line');
    });

    it('应正确显示位置标记', () => {
      const { ui, output } = createTestUI();

      ui.displayDiff('@@ -1,3 +1,4 @@');

      expect(output.getOutput()).toContain('@@ -1,3 +1,4 @@');
    });

    it('应正确显示完整的 diff', () => {
      const { ui, output } = createTestUI();
      const diff = `--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
 unchanged line
-removed line
+added line
 another unchanged`;

      ui.displayDiff(diff);

      const outputText = output.getOutput();
      expect(outputText).toContain('unchanged line');
      expect(outputText).toContain('-removed line');
      expect(outputText).toContain('+added line');
    });
  });

  describe('showRewindMenu', () => {
    it('应在没有快照时显示提示', async () => {
      const { ui, output } = createTestUI();

      const result = await ui.showRewindMenu([]);

      expect(result).toBeNull();
      expect(output.getOutput()).toContain('没有可用的回退点');
    });

    it('应显示快照列表', async () => {
      const { ui, output, input } = createTestUI();
      const snapshots: Snapshot[] = [
        {
          id: 'snap-1',
          timestamp: new Date('2024-01-01T10:00:00'),
          description: '修改了 file.txt',
          files: ['file.txt'],
        },
        {
          id: 'snap-2',
          timestamp: new Date('2024-01-01T11:00:00'),
          description: '添加了 new.txt',
          files: ['new.txt', 'other.txt'],
        },
      ];

      // 异步选择第一个快照
      const resultPromise = ui.showRewindMenu(snapshots);

      // 等待菜单显示
      await new Promise((resolve) => setTimeout(resolve, 10));

      // 模拟用户输入 "1"
      input.emit('data', Buffer.from('1'));

      const result = await resultPromise;

      expect(result).toEqual(snapshots[0]);
      const outputText = output.getOutput();
      expect(outputText).toContain('回退菜单');
      expect(outputText).toContain('修改了 file.txt');
      expect(outputText).toContain('添加了 new.txt');
    });

    it('应支持取消操作', async () => {
      const { ui, input } = createTestUI();
      const snapshots: Snapshot[] = [
        {
          id: 'snap-1',
          timestamp: new Date(),
          description: '测试快照',
          files: [],
        },
      ];

      const resultPromise = ui.showRewindMenu(snapshots);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // 模拟用户输入 "0" 取消
      input.emit('data', Buffer.from('0'));

      const result = await resultPromise;

      expect(result).toBeNull();
    });
  });

  describe('showSelectMenu', () => {
    it('应显示选择菜单', async () => {
      const { ui, output, input } = createTestUI();
      const items = [
        { label: '选项 A', value: 'a', description: '第一个选项' },
        { label: '选项 B', value: 'b', description: '第二个选项' },
      ];

      const resultPromise = ui.showSelectMenu('请选择:', items);

      await new Promise((resolve) => setTimeout(resolve, 10));

      input.emit('data', Buffer.from('1'));

      const result = await resultPromise;

      expect(result).toBe('a');
      const outputText = output.getOutput();
      expect(outputText).toContain('请选择:');
      expect(outputText).toContain('选项 A');
      expect(outputText).toContain('选项 B');
    });

    it('应支持取消选择', async () => {
      const { ui, input } = createTestUI();
      const items = [{ label: '选项', value: 'test' }];

      const resultPromise = ui.showSelectMenu('标题', items);

      await new Promise((resolve) => setTimeout(resolve, 10));

      input.emit('data', Buffer.from('0'));

      const result = await resultPromise;

      expect(result).toBeNull();
    });
  });

  describe('isActive', () => {
    it('初始状态应为 false', () => {
      const { ui } = createTestUI();

      expect(ui.isActive()).toBe(false);
    });
  });

  describe('stop', () => {
    it('应能停止 UI', () => {
      const { ui } = createTestUI();

      ui.stop();

      expect(ui.isActive()).toBe(false);
    });

    it('应触发 stop 事件', () => {
      const { ui } = createTestUI();
      const stopHandler = jest.fn();

      ui.on('stop', stopHandler);
      ui.stop();

      expect(stopHandler).toHaveBeenCalled();
    });
  });

  describe('事件发射', () => {
    it('应继承 EventEmitter', () => {
      const { ui } = createTestUI();

      expect(ui).toBeInstanceOf(EventEmitter);
      expect(typeof ui.on).toBe('function');
      expect(typeof ui.emit).toBe('function');
    });

    it('应能监听自定义事件', () => {
      const { ui } = createTestUI();
      const handler = jest.fn();

      ui.on('custom', handler);
      ui.emit('custom', 'data');

      expect(handler).toHaveBeenCalledWith('data');
    });
  });

  describe('颜色输出', () => {
    it('禁用颜色时应输出纯文本', () => {
      const { ui, output } = createTestUI({ enableColors: false });

      ui.displayMessage('Test message', 'user');

      const outputText = output.getOutput();
      // 不应包含 ANSI 转义序列
      expect(outputText).not.toMatch(/\x1b\[\d+m/);
    });

    it('启用颜色时应包含 ANSI 转义序列', () => {
      const { ui, output } = createTestUI({ enableColors: true });

      ui.displayMessage('Test message', 'user');

      const outputText = output.getOutput();
      // 应包含 ANSI 转义序列
      expect(outputText).toMatch(/\x1b\[\d+m/);
    });
  });
});
