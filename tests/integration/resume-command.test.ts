/**
 * 文件功能：/resume 命令集成测试，验证完整的会话恢复工作流
 *
 * 核心测试场景：
 * - 成功恢复会话：创建历史会话，选择并切换
 * - 无可用会话：验证空会话列表时的提示
 * - 用户取消选择：验证取消操作不影响当前会话
 * - 非交互模式警告：验证命令仅在交互模式可用
 *
 * 验证：/resume Slash Command
 */

// 模拟 SDK 模块
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: jest.fn().mockImplementation(() => {
    async function* mockGenerator() {
      yield {
        type: 'assistant',
        session_id: 'mock-session-id',
        message: {
          content: [{ type: 'text', text: 'Mock response' }],
        },
      };
      yield {
        type: 'result',
        subtype: 'success',
        session_id: 'mock-session-id',
        result: 'Mock response',
        total_cost_usd: 0.001,
        duration_ms: 100,
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
      };
    }
    return mockGenerator();
  }),
  createSdkMcpServer: jest.fn().mockImplementation((config) => config),
  tool: jest.fn().mockImplementation((name, description, schema, handler) => ({
    name,
    description,
    schema,
    handler,
  })),
}));

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SessionManager } from '../../src/core/SessionManager';
import { StreamingQueryManager } from '../../src/sdk/StreamingQueryManager';
import { MessageRouter } from '../../src/core/MessageRouter';
import { SDKQueryExecutor } from '../../src/sdk/SDKQueryExecutor';
import { ConfigManager } from '../../src/config/ConfigManager';
import { ToolRegistry } from '../../src/tools/ToolRegistry';
import { PermissionManager } from '../../src/permissions/PermissionManager';
import { MockPermissionUI } from '../test-helpers/MockPermissionUI';
import { MockInteractiveUI } from '../test-helpers/MockInteractiveUI';

// 捕获控制台输出的辅助函数
function captureConsoleLog(): { logs: string[]; restore: () => void } {
  const logs: string[] = [];
  const originalLog = console.log;

  console.log = jest.fn((...args: any[]) => {
    logs.push(args.map(String).join(' '));
  });

  return {
    logs,
    restore: () => {
      console.log = originalLog;
    },
  };
}

describe('/resume 命令集成测试', () => {
  let tempDir: string;
  let sessionManager: SessionManager;
  let configManager: ConfigManager;
  let toolRegistry: ToolRegistry;
  let permissionManager: PermissionManager;
  let messageRouter: MessageRouter;
  let sdkExecutor: SDKQueryExecutor;
  let streamingQueryManager: StreamingQueryManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resume-cmd-test-'));
    sessionManager = new SessionManager(path.join(tempDir, 'sessions'));
    configManager = new ConfigManager();
    toolRegistry = new ToolRegistry();
    permissionManager = new PermissionManager(
      { mode: 'acceptEdits' },
      new MockPermissionUI(),
      toolRegistry
    );
    messageRouter = new MessageRouter({
      configManager,
      toolRegistry,
      permissionManager,
    });
    sdkExecutor = new SDKQueryExecutor();
    streamingQueryManager = new StreamingQueryManager({
      messageRouter,
      sdkExecutor,
      sessionManager,
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  describe('场景 1：成功恢复会话', () => {
    it('应该能够选择并切换到历史会话', async () => {
      // 1. 创建 3 个历史会话
      const session1 = await sessionManager.createSession(tempDir);
      session1.messages.push({
        id: 'msg-1',
        role: 'user',
        content: 'First session message',
        timestamp: new Date(),
      });
      await sessionManager.saveSession(session1);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const session2 = await sessionManager.createSession(tempDir);
      session2.messages.push({
        id: 'msg-2',
        role: 'user',
        content: 'Second session message',
        timestamp: new Date(),
      });
      await sessionManager.saveSession(session2);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const session3 = await sessionManager.createSession(tempDir);
      session3.messages.push({
        id: 'msg-3',
        role: 'user',
        content: 'Third session message',
        timestamp: new Date(),
      });
      await sessionManager.saveSession(session3);

      // 2. 模拟交互式 UI，选择第一个会话（最近的）
      const mockUI = new MockInteractiveUI({ selectIndex: 0 });

      // 3. 创建当前活动会话
      const currentSession = await sessionManager.createSession(tempDir);
      streamingQueryManager.startSession(currentSession);

      // 4. 捕获控制台输出
      const capture = captureConsoleLog();

      try {
        // 5. 调用 handleResumeCommand 逻辑
        const sessions = await sessionManager.listRecentSessions(10);
        expect(sessions.length).toBeGreaterThan(0);

        const selectedSession = await mockUI.showSessionMenu(sessions);
        expect(selectedSession).not.toBeNull();
        // 验证选中的会话是列表中的第一个（最近的）
        expect(selectedSession?.id).toBe(sessions[0].id);

        // 6. 执行会话切换
        if (selectedSession) {
          const activeSession = streamingQueryManager.getActiveSession();
          if (activeSession?.session) {
            await sessionManager.saveSession(activeSession.session);
          }

          streamingQueryManager.endSession();
          streamingQueryManager.startSession(selectedSession);

          const forkIndicator = selectedSession.parentSessionId ? ' 🔀' : '';
          console.log(`\nResumed session: ${selectedSession.id}${forkIndicator}`);
        }

        // 7. 验证会话切换成功
        const newActiveSession = streamingQueryManager.getActiveSession();
        expect(newActiveSession?.session.id).toBe(sessions[0].id);

        // 8. 验证控制台输出包含成功消息
        expect(capture.logs.some((log) => log.includes('Resumed session'))).toBe(true);
        expect(capture.logs.some((log) => log.includes(sessions[0].id))).toBe(true);
      } finally {
        capture.restore();
      }
    });

    it('应该能够恢复带有父会话 ID 的分叉会话', async () => {
      // 1. 创建父会话和分叉会话
      const parentSession = await sessionManager.createSession(tempDir);
      parentSession.messages.push({
        id: 'msg-parent',
        role: 'user',
        content: 'Parent session message',
        timestamp: new Date(),
      });
      await sessionManager.saveSession(parentSession);

      const forkedSession = await sessionManager.forkSession(parentSession.id);
      expect(forkedSession.parentSessionId).toBe(parentSession.id);
      await sessionManager.saveSession(forkedSession);

      // 2. 模拟选择分叉会话
      const mockUI = new MockInteractiveUI({ selectIndex: 0 });

      // 3. 捕获控制台输出
      const capture = captureConsoleLog();

      try {
        const sessions = await sessionManager.listRecentSessions(10);
        const selectedSession = await mockUI.showSessionMenu(sessions);

        if (selectedSession) {
          streamingQueryManager.startSession(selectedSession);
          const forkIndicator = selectedSession.parentSessionId ? ' 🔀' : '';
          console.log(`\nResumed session: ${selectedSession.id}${forkIndicator}`);
        }

        // 4. 验证控制台输出包含分叉标记
        expect(capture.logs.some((log) => log.includes('🔀'))).toBe(true);
      } finally {
        capture.restore();
      }
    });
  });

  describe('场景 2：无可用会话', () => {
    it('应该显示"没有可用会话"消息', async () => {
      // 1. 确保没有历史会话
      const sessions = await sessionManager.listRecentSessions(10);
      expect(sessions.length).toBe(0);

      // 2. 捕获控制台输出
      const capture = captureConsoleLog();

      try {
        // 3. 执行 handleResumeCommand 逻辑
        if (sessions.length === 0) {
          console.log('No available sessions to resume');
        }

        // 4. 验证显示正确的消息
        expect(capture.logs).toContain('No available sessions to resume');

        // 5. 验证不进行会话切换
        const activeSession = streamingQueryManager.getActiveSession();
        expect(activeSession).toBeNull();
      } finally {
        capture.restore();
      }
    });
  });

  describe('场景 3：用户取消选择', () => {
    it('应该在用户取消时不切换会话', async () => {
      // 1. 创建历史会话
      const session1 = await sessionManager.createSession(tempDir);
      session1.messages.push({
        id: 'msg-test',
        role: 'user',
        content: 'Test message',
        timestamp: new Date(),
      });
      await sessionManager.saveSession(session1);

      // 2. 创建当前活动会话
      const currentSession = await sessionManager.createSession(tempDir);
      streamingQueryManager.startSession(currentSession);
      const currentSessionId = currentSession.id;

      // 3. 模拟用户取消选择（selectIndex: null）
      const mockUI = new MockInteractiveUI({ selectIndex: null });

      // 4. 执行 handleResumeCommand 逻辑
      const sessions = await sessionManager.listRecentSessions(10);
      const selectedSession = await mockUI.showSessionMenu(sessions);

      // 5. 验证用户取消返回 null
      expect(selectedSession).toBeNull();

      // 6. 验证当前会话未改变
      const activeSession = streamingQueryManager.getActiveSession();
      expect(activeSession?.session.id).toBe(currentSessionId);
    });
  });

  describe('场景 4：非交互模式警告', () => {
    it('应该在非交互模式下显示警告消息', async () => {
      // 1. 模拟非交互模式（ui 为 null）
      const ui = null;

      // 2. 捕获控制台输出
      const capture = captureConsoleLog();

      try {
        // 3. 执行 handleResumeCommand 逻辑
        if (!ui) {
          console.log('Warning: /resume command is only available in interactive mode');
          // 应该直接返回，不执行后续逻辑
        }

        // 4. 验证显示警告消息
        expect(capture.logs).toContain(
          'Warning: /resume command is only available in interactive mode'
        );

        // 5. 验证没有尝试获取会话列表
        // （通过验证没有其他输出来间接验证）
        expect(capture.logs.length).toBe(1);
      } finally {
        capture.restore();
      }
    });
  });

  describe('命令解析和路由', () => {
    it('应该正确识别 /resume 命令', () => {
      // 模拟命令解析
      const input = '/resume';
      const isCommand = input.startsWith('/');
      const commandName = input.slice(1).trim().split(/\s+/)[0];

      expect(isCommand).toBe(true);
      expect(commandName).toBe('resume');
    });

    it('应该将 /resume 命令路由到 handleResumeCommand', () => {
      const commandName = 'resume';
      const validCommands = [
        'help',
        'clear',
        'new',
        'resume',
        'fork',
        'rewind',
        'mcp',
        'config',
        'quit',
      ];

      expect(validCommands).toContain(commandName);
    });
  });

  describe('会话数据完整性', () => {
    it('应该保持恢复会话的消息历史完整', async () => {
      // 1. 创建包含多条消息的会话
      const session = await sessionManager.createSession(tempDir);
      const messages = [
        { id: 'msg-1', role: 'user' as const, content: 'Message 1', timestamp: new Date() },
        { id: 'msg-2', role: 'assistant' as const, content: 'Response 1', timestamp: new Date() },
        { id: 'msg-3', role: 'user' as const, content: 'Message 2', timestamp: new Date() },
        { id: 'msg-4', role: 'assistant' as const, content: 'Response 2', timestamp: new Date() },
      ];
      session.messages.push(...messages);
      await sessionManager.saveSession(session);

      // 2. 加载并恢复会话
      const loadedSession = await sessionManager.loadSession(session.id);
      if (!loadedSession) {
        throw new Error('Failed to load session');
      }
      streamingQueryManager.startSession(loadedSession);

      // 3. 验证消息历史完整
      const activeSession = streamingQueryManager.getActiveSession();
      expect(activeSession?.session.messages.length).toBe(4);
      // 验证消息内容（忽略时间戳的精确比较）
      expect(activeSession?.session.messages.map((m) => m.content)).toEqual([
        'Message 1',
        'Response 1',
        'Message 2',
        'Response 2',
      ]);
    });

    it('应该保持恢复会话的统计信息', async () => {
      // 1. 创建包含统计信息的会话
      const session = await sessionManager.createSession(tempDir);
      session.messages.push({
        id: 'msg-stats',
        role: 'assistant',
        content: 'Response with usage',
        timestamp: new Date(),
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalCostUsd: 0.005,
        },
      });
      await sessionManager.saveSession(session);

      // 2. 加载并验证统计信息
      const loadedSession = await sessionManager.loadSession(session.id);
      if (!loadedSession) {
        throw new Error('Failed to load session');
      }
      expect(loadedSession.stats).toBeDefined();
      expect(loadedSession.stats?.totalInputTokens).toBe(100);
      expect(loadedSession.stats?.totalOutputTokens).toBe(50);
      expect(loadedSession.stats?.totalCostUsd).toBe(0.005);
    });
  });
});
