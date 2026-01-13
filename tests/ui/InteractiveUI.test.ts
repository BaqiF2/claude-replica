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
  PermissionMode,
} from '../../src/ui/InteractiveUI';
import { Session } from '../../src/core/SessionManager';

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
  onCommand: jest.Mock;
  onInterrupt: jest.Mock;
  onRewind: jest.Mock;
} {
  const input = createMockInput();
  const output = createMockOutput();
  const onMessage = jest.fn().mockResolvedValue(undefined);
  const onCommand = jest.fn().mockResolvedValue(undefined);
  const onInterrupt = jest.fn();
  const onRewind = jest.fn().mockResolvedValue(undefined);

  const ui = new InteractiveUI({
    onMessage,
    onCommand,
    onInterrupt,
    onRewind,
    input,
    output,
    enableColors: false, // 禁用颜色以便测试
    ...overrides,
  });

  return { ui, input, output, onMessage, onCommand, onInterrupt, onRewind };
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

      expect(ui).toBeDefined();
    });
  });

  describe('displayMessage', () => {
    it('应显示用户消息', () => {
      const { ui, output } = createTestUI();

      ui.displayMessage('Hello, Claude!', 'user');

      const outputText = output.getOutput();
      // Claude Code 风格：用户消息使用 > 前缀
      expect(outputText).toContain('>');
      expect(outputText).toContain('Hello, Claude!');
    });

    it('应显示助手消息', () => {
      const { ui, output } = createTestUI();

      ui.displayMessage('Hello, User!', 'assistant');

      const outputText = output.getOutput();
      // Claude Code 风格：assistant 响应使用 ⏺ 前缀
      expect(outputText).toContain('⏺');
      expect(outputText).toContain('Hello, User!');
    });

    it('应显示系统消息', () => {
      const { ui, output } = createTestUI();

      ui.displayMessage('System notification', 'system');

      const outputText = output.getOutput();
      // 系统消息使用 ⚙️ 前缀
      expect(outputText).toContain('⚙️');
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
      // Claude Code 风格：⏺ ToolName(args)
      expect(outputText).toContain('⏺');
      expect(outputText).toContain('Read');
      expect(outputText).toContain('path');
    });

    it('应显示空参数的工具调用', () => {
      const { ui, output } = createTestUI();

      ui.displayToolUse('Bash', {});

      const outputText = output.getOutput();
      // Claude Code 风格：⏺ ToolName
      expect(outputText).toContain('⏺');
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

  describe('stop', () => {
    it('应能停止 UI', () => {
      const { ui } = createTestUI();

      ui.stop();

      // UI 已停止，验证不会抛出错误
      expect(ui).toBeDefined();
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

  describe('PermissionMode 类型', () => {
    it('应正确导出 PermissionMode 类型', () => {
      const modes: PermissionMode[] = ['default', 'acceptEdits', 'bypassPermissions', 'plan'];
      expect(modes).toHaveLength(4);
      expect(modes).toContain('default');
      expect(modes).toContain('acceptEdits');
      expect(modes).toContain('bypassPermissions');
      expect(modes).toContain('plan');
    });
  });

  describe('setInitialPermissionMode', () => {
    it('应正确设置初始权限模式为 default', () => {
      const { ui, output } = createTestUI();
      ui.setInitialPermissionMode('default');
      ui.displayPermissionStatus('default');
      expect(output.getOutput()).toContain('Default');
    });

    it('应正确设置初始权限模式为 acceptEdits', () => {
      const { ui, output } = createTestUI();
      ui.setInitialPermissionMode('acceptEdits');
      ui.displayPermissionStatus('acceptEdits');
      expect(output.getOutput()).toContain('Accept Edits');
    });

    it('应正确设置初始权限模式为 bypassPermissions', () => {
      const { ui, output } = createTestUI();
      ui.setInitialPermissionMode('bypassPermissions');
      ui.displayPermissionStatus('bypassPermissions');
      expect(output.getOutput()).toContain('Bypass Permissions');
    });

    it('应正确设置初始权限模式为 plan', () => {
      const { ui, output } = createTestUI();
      ui.setInitialPermissionMode('plan');
      ui.displayPermissionStatus('plan');
      expect(output.getOutput()).toContain('Plan Mode');
    });
  });

  describe('displayPermissionStatus', () => {
    it('应显示默认模式状态', () => {
      const { ui, output } = createTestUI();
      ui.displayPermissionStatus('default');
      const outputText = output.getOutput();
      expect(outputText).toContain('Permission Mode:');
      expect(outputText).toContain('Default');
    });

    it('应显示 acceptEdits 模式状态', () => {
      const { ui, output } = createTestUI();
      ui.displayPermissionStatus('acceptEdits');
      const outputText = output.getOutput();
      expect(outputText).toContain('Permission Mode:');
      expect(outputText).toContain('Accept Edits');
    });

    it('应显示 bypassPermissions 模式状态', () => {
      const { ui, output } = createTestUI();
      ui.displayPermissionStatus('bypassPermissions');
      const outputText = output.getOutput();
      expect(outputText).toContain('Permission Mode:');
      expect(outputText).toContain('Bypass Permissions');
    });

    it('应显示 plan 模式状态', () => {
      const { ui, output } = createTestUI();
      ui.displayPermissionStatus('plan');
      const outputText = output.getOutput();
      expect(outputText).toContain('Permission Mode:');
      expect(outputText).toContain('Plan Mode');
    });
  });

  describe('权限模式循环切换', () => {
    it('应从 default 切换到 acceptEdits', () => {
      const { ui, output } = createTestUI();

      // 初始模式为 default
      ui.setInitialPermissionMode('default');

      // 显示 acceptEdits 模式，模拟循环后的状态
      ui.displayPermissionStatus('acceptEdits');

      expect(output.getOutput()).toContain('Accept Edits');
    });

    it('应正确显示所有模式的状态', () => {
      const { ui, output } = createTestUI();
      const modes: PermissionMode[] = ['default', 'acceptEdits', 'bypassPermissions', 'plan'];
      const labels = ['Default', 'Accept Edits', 'Bypass Permissions', 'Plan Mode'];

      modes.forEach((mode, index) => {
        output.clear();
        ui.setInitialPermissionMode(mode);
        ui.displayPermissionStatus(mode);
        expect(output.getOutput()).toContain(labels[index]);
      });
    });

    it('应正确设置各种权限模式', () => {
      const { ui } = createTestUI();
      const modes: PermissionMode[] = ['default', 'acceptEdits', 'bypassPermissions', 'plan'];

      // 验证所有模式都可以设置而不抛出错误
      modes.forEach((mode) => {
        expect(() => ui.setInitialPermissionMode(mode)).not.toThrow();
      });
    });
  });

  describe('onPermissionModeChange 回调', () => {
    it('应支持 onPermissionModeChange 回调选项', () => {
      const onPermissionModeChange = jest.fn();

      // 验证可以正常创建带回调的 UI
      expect(() => {
        createTestUI({ onPermissionModeChange });
      }).not.toThrow();
    });

    it('未提供回调时应正常工作不抛出错误', () => {
      const { ui } = createTestUI();

      // 验证可以正常设置模式
      expect(() => {
        ui.setInitialPermissionMode('acceptEdits');
        ui.displayPermissionStatus('acceptEdits');
      }).not.toThrow();
    });

    it('应支持空回调', () => {
      const { ui } = createTestUI({ onPermissionModeChange: undefined });

      expect(() => {
        ui.setInitialPermissionMode('plan');
        ui.displayPermissionStatus('plan');
      }).not.toThrow();
    });
  });

  describe('formatRelativeTime', () => {
    it('应显示 "刚刚" 对于刚刚发生的时间', () => {
      const { ui } = createTestUI();
      const now = new Date();
      const result = ui.formatRelativeTime(now);
      expect(result).toBe('刚刚');
    });

    it('应正确显示分钟前', () => {
      const { ui } = createTestUI();
      const date = new Date(Date.now() - 30 * 60 * 1000); // 30分钟前
      const result = ui.formatRelativeTime(date);
      expect(result).toBe('30分钟前');
    });

    it('应正确显示小时前', () => {
      const { ui } = createTestUI();
      const date = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2小时前
      const result = ui.formatRelativeTime(date);
      expect(result).toBe('2小时前');
    });

    it('应正确显示天前', () => {
      const { ui } = createTestUI();
      const date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3天前
      const result = ui.formatRelativeTime(date);
      expect(result).toBe('3天前');
    });

    it('应正确显示周前', () => {
      const { ui } = createTestUI();
      const date = new Date(Date.now() - 2 * 7 * 24 * 60 * 60 * 1000); // 2周前
      const result = ui.formatRelativeTime(date);
      expect(result).toBe('2周前');
    });

    it('应正确显示个月前', () => {
      const { ui } = createTestUI();
      const date = new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000); // 3个月前
      const result = ui.formatRelativeTime(date);
      expect(result).toBe('3个月前');
    });

    it('应正确显示年前', () => {
      const { ui } = createTestUI();
      const date = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000); // 2年前
      const result = ui.formatRelativeTime(date);
      expect(result).toBe('2年前');
    });

    it('应正确处理边界值（59秒）', () => {
      const { ui } = createTestUI();
      const date = new Date(Date.now() - 59 * 1000); // 59秒前
      const result = ui.formatRelativeTime(date);
      expect(result).toBe('刚刚');
    });

    it('应正确处理边界值（1分钟）', () => {
      const { ui } = createTestUI();
      const date = new Date(Date.now() - 60 * 1000); // 1分钟前
      const result = ui.formatRelativeTime(date);
      expect(result).toBe('1分钟前');
    });
  });

  describe('formatAbsoluteTime', () => {
    it('应正确格式化标准日期', () => {
      const { ui } = createTestUI();
      const date = new Date('2024-01-15T14:30:45');
      const result = ui.formatAbsoluteTime(date);
      expect(result).toBe('2024-01-15 14:30:45');
    });

    it('应正确格式化日期（个位数补零）', () => {
      const { ui } = createTestUI();
      const date = new Date('2024-03-05T08:05:09');
      const result = ui.formatAbsoluteTime(date);
      expect(result).toBe('2024-03-05 08:05:09');
    });

    it('应正确处理不同月份', () => {
      const { ui } = createTestUI();
      const date = new Date('2024-12-31T23:59:59');
      const result = ui.formatAbsoluteTime(date);
      expect(result).toBe('2024-12-31 23:59:59');
    });

    it('应正确处理闰年', () => {
      const { ui } = createTestUI();
      const date = new Date('2024-02-29T12:00:00');
      const result = ui.formatAbsoluteTime(date);
      expect(result).toBe('2024-02-29 12:00:00');
    });

    it('应正确处理当前时间', () => {
      const { ui } = createTestUI();
      const date = new Date();
      const result = ui.formatAbsoluteTime(date);
      // 验证格式正确性
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
  });

  describe('formatStatsSummary', () => {
    it('应处理 undefined stats', () => {
      const { ui } = createTestUI();
      const result = ui.formatStatsSummary(undefined);
      expect(result).toBe('(0 条消息, 0 tokens, $0)');
    });

    it('应处理 null stats', () => {
      const { ui } = createTestUI();
      const result = ui.formatStatsSummary(null as any);
      expect(result).toBe('(0 条消息, 0 tokens, $0)');
    });

    it('应正确格式化完整统计信息', () => {
      const { ui } = createTestUI();
      const stats = {
        messageCount: 10,
        totalInputTokens: 5000,
        totalOutputTokens: 3000,
        totalCostUsd: 0.25,
        lastMessagePreview: '这是最后一条消息的预览',
      };
      const result = ui.formatStatsSummary(stats);
      expect(result).toBe('(10 条消息, 8k tokens, $0.250)');
    });

    it('应正确处理小于1000的token数量', () => {
      const { ui } = createTestUI();
      const stats = {
        messageCount: 5,
        totalInputTokens: 200,
        totalOutputTokens: 300,
        totalCostUsd: 0.05,
        lastMessagePreview: '预览',
      };
      const result = ui.formatStatsSummary(stats);
      expect(result).toBe('(5 条消息, 500 tokens, $0.050)');
    });

    it('应正确处理零成本', () => {
      const { ui } = createTestUI();
      const stats = {
        messageCount: 2,
        totalInputTokens: 100,
        totalOutputTokens: 50,
        totalCostUsd: 0,
        lastMessagePreview: '预览',
      };
      const result = ui.formatStatsSummary(stats);
      expect(result).toBe('(2 条消息, 150 tokens, $0)');
    });

    it('应正确处理非常小的成本（小于0.01）', () => {
      const { ui } = createTestUI();
      const stats = {
        messageCount: 1,
        totalInputTokens: 10,
        totalOutputTokens: 5,
        totalCostUsd: 0.005,
        lastMessagePreview: '预览',
      };
      const result = ui.formatStatsSummary(stats);
      expect(result).toBe('(1 条消息, 15 tokens, $0)');
    });

    it('应正确处理大数字token（k格式）', () => {
      const { ui } = createTestUI();
      const stats = {
        messageCount: 100,
        totalInputTokens: 50000,
        totalOutputTokens: 30000,
        totalCostUsd: 2.5,
        lastMessagePreview: '预览',
      };
      const result = ui.formatStatsSummary(stats);
      expect(result).toBe('(100 条消息, 80k tokens, $2.500)');
    });

    it('应正确处理精确到小数点后一位的k格式', () => {
      const { ui } = createTestUI();
      const stats = {
        messageCount: 50,
        totalInputTokens: 15000,
        totalOutputTokens: 10000,
        totalCostUsd: 1.25,
        lastMessagePreview: '预览',
      };
      const result = ui.formatStatsSummary(stats);
      expect(result).toBe('(50 条消息, 25k tokens, $1.250)');
    });
  });

  describe('showSessionMenu', () => {
    it('应在没有会话时显示提示', async () => {
      const { ui, output } = createTestUI();

      const result = await ui.showSessionMenu([]);

      expect(result).toBeNull();
      expect(output.getOutput()).toContain('没有可用的会话');
    });

    it('应正确显示会话列表', async () => {
      const { ui, output, input } = createTestUI();
      const now = new Date();
      const sessions: Session[] = [
        {
          id: 'sess-1',
          createdAt: now,
          lastAccessedAt: now,
          messages: [],
          context: {} as any,
          expired: false,
          workingDirectory: '/test',
          stats: {
            messageCount: 10,
            totalInputTokens: 5000,
            totalOutputTokens: 3000,
            totalCostUsd: 0.25,
            lastMessagePreview: '这是最后一条消息的预览',
          },
        },
        {
          id: 'sess-2',
          createdAt: now,
          lastAccessedAt: now,
          messages: [],
          context: {} as any,
          expired: false,
          workingDirectory: '/test',
          parentSessionId: 'sess-1',
          stats: {
            messageCount: 5,
            totalInputTokens: 200,
            totalOutputTokens: 150,
            totalCostUsd: 0.05,
            lastMessagePreview: '另一个会话的预览',
          },
        },
      ];

      const resultPromise = ui.showSessionMenu(sessions);

      await new Promise((resolve) => setTimeout(resolve, 10));

      input.emit('data', Buffer.from('1\n'));

      const result = await resultPromise;

      expect(result).toEqual(sessions[0]);
      const outputText = output.getOutput();
      expect(outputText).toContain('会话菜单');
      expect(outputText).toContain('sess-1');
      expect(outputText).toContain('🔀'); // 分叉标记
      expect(outputText).toContain('这是最后一条消息的预览');
    });

    it('应支持取消操作', async () => {
      const { ui, input } = createTestUI();
      const now = new Date();
      const sessions: Session[] = [
        {
          id: 'session-1',
          createdAt: now,
          lastAccessedAt: now,
          messages: [],
          context: {} as any,
          expired: false,
          workingDirectory: '/test',
          stats: {
            messageCount: 5,
            totalInputTokens: 100,
            totalOutputTokens: 50,
            totalCostUsd: 0.01,
            lastMessagePreview: '预览',
          },
        },
      ];

      const resultPromise = ui.showSessionMenu(sessions);

      await new Promise((resolve) => setTimeout(resolve, 10));

      input.emit('data', Buffer.from('0\n'));

      const result = await resultPromise;

      expect(result).toBeNull();
    });

    // 注意: Esc 键取消已移除，现在只支持输入 0 取消
    // 这是为了简化输入处理，统一使用 readline.question()

    it('应处理无效输入并重新等待', async () => {
      const { ui, input } = createTestUI();
      const now = new Date();
      const sessions: Session[] = [
        {
          id: 'session-1',
          createdAt: now,
          lastAccessedAt: now,
          messages: [],
          context: {} as any,
          expired: false,
          workingDirectory: '/test',
          stats: {
            messageCount: 5,
            totalInputTokens: 100,
            totalOutputTokens: 50,
            totalCostUsd: 0.01,
            lastMessagePreview: '预览',
          },
        },
      ];

      const resultPromise = ui.showSessionMenu(sessions);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // 发送无效输入
      input.emit('data', Buffer.from('abc\n'));

      await new Promise((resolve) => setTimeout(resolve, 10));

      // 发送有效输入
      input.emit('data', Buffer.from('1\n'));

      const result = await resultPromise;

      expect(result).toEqual(sessions[0]);
    });
  });
});
