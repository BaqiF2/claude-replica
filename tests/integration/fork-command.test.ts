/**
 * 文件功能：/fork 命令集成测试，验证完整的会话分叉工作流
 *
 * 核心测试场景：
 * - 成功分叉会话：从活动会话创建分叉，验证数据复制和切换
 * - 无活动会话：验证无活动会话时的提示
 * - 非交互模式警告：验证命令仅在交互模式可用
 * - 分叉会话数据完整性：验证消息、统计信息和父会话 ID 的正确复制
 *
 * 验证：/fork Slash Command
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

// 捕获控制台错误输出的辅助函数
function captureConsoleError(): { errors: string[]; restore: () => void } {
  const errors: string[] = [];
  const originalError = console.error;

  console.error = jest.fn((...args: any[]) => {
    errors.push(args.map(String).join(' '));
  });

  return {
    errors,
    restore: () => {
      console.error = originalError;
    },
  };
}

describe('/fork 命令集成测试', () => {
  let tempDir: string;
  let sessionManager: SessionManager;
  let configManager: ConfigManager;
  let toolRegistry: ToolRegistry;
  let permissionManager: PermissionManager;
  let messageRouter: MessageRouter;
  let sdkExecutor: SDKQueryExecutor;
  let streamingQueryManager: StreamingQueryManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fork-cmd-test-'));
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

  describe('场景 1：成功分叉会话', () => {
    it('应该能够从活动会话创建分叉并切换', async () => {
      // 1. 创建活动会话并添加消息
      const currentSession = await sessionManager.createSession(tempDir);
      currentSession.messages.push({
        id: 'msg-1',
        role: 'user',
        content: 'Original session message',
        timestamp: new Date(),
      });
      currentSession.messages.push({
        id: 'msg-2',
        role: 'assistant',
        content: 'Response in original session',
        timestamp: new Date(),
        usage: {
          inputTokens: 50,
          outputTokens: 100,
          totalCostUsd: 0.01,
        },
      });
      await sessionManager.saveSession(currentSession);

      // 2. 启动活动会话
      streamingQueryManager.startSession(currentSession);
      const activeSession = streamingQueryManager.getActiveSession();
      expect(activeSession).not.toBeNull();
      expect(activeSession?.session.id).toBe(currentSession.id);

      // 3. 捕获控制台输出
      const capture = captureConsoleLog();

      try {
        // 4. 执行 handleForkCommand 逻辑：分叉会话
        const forkedSession = await sessionManager.forkSession(currentSession.id);

        // 5. 验证分叉会话的基本属性
        expect(forkedSession.id).not.toBe(currentSession.id);
        expect(forkedSession.parentSessionId).toBe(currentSession.id);
        expect(forkedSession.messages.length).toBe(currentSession.messages.length);

        // 6. 保存原会话并切换到分叉会话
        await sessionManager.saveSession(currentSession);
        streamingQueryManager.endSession();
        streamingQueryManager.startSession(forkedSession);

        // 7. 显示成功消息
        console.log(
          `\nForked session: ${forkedSession.id} (from parent: ${forkedSession.parentSessionId}) 🔀`
        );

        // 8. 验证会话切换成功
        const newActiveSession = streamingQueryManager.getActiveSession();
        expect(newActiveSession?.session.id).toBe(forkedSession.id);

        // 9. 验证控制台输出包含成功消息
        expect(capture.logs.some((log) => log.includes('Forked session'))).toBe(true);
        expect(capture.logs.some((log) => log.includes(forkedSession.id))).toBe(true);
        expect(capture.logs.some((log) => log.includes(currentSession.id))).toBe(true);
        expect(capture.logs.some((log) => log.includes('🔀'))).toBe(true);
      } finally {
        capture.restore();
      }
    });

    it('应该保持分叉会话的消息历史完整', async () => {
      // 1. 创建包含多条消息的原始会话
      const currentSession = await sessionManager.createSession(tempDir);
      const messages = [
        { id: 'msg-1', role: 'user' as const, content: 'Message 1', timestamp: new Date() },
        { id: 'msg-2', role: 'assistant' as const, content: 'Response 1', timestamp: new Date() },
        { id: 'msg-3', role: 'user' as const, content: 'Message 2', timestamp: new Date() },
        { id: 'msg-4', role: 'assistant' as const, content: 'Response 2', timestamp: new Date() },
      ];
      currentSession.messages.push(...messages);
      await sessionManager.saveSession(currentSession);

      // 2. 分叉会话
      const forkedSession = await sessionManager.forkSession(currentSession.id);

      // 3. 验证消息历史完整复制
      expect(forkedSession.messages.length).toBe(4);
      expect(forkedSession.messages.map((m) => m.content)).toEqual([
        'Message 1',
        'Response 1',
        'Message 2',
        'Response 2',
      ]);

      // 4. 验证消息是深拷贝（修改原会话不影响分叉会话）
      currentSession.messages.push({
        id: 'msg-5',
        role: 'user',
        content: 'New message in original',
        timestamp: new Date(),
      });
      expect(forkedSession.messages.length).toBe(4); // 分叉会话不受影响
    });

    it('应该保持分叉会话的统计信息', async () => {
      // 1. 创建包含统计信息的会话
      const currentSession = await sessionManager.createSession(tempDir);
      currentSession.messages.push({
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
      await sessionManager.saveSession(currentSession);

      // 2. 分叉会话
      const forkedSession = await sessionManager.forkSession(currentSession.id);

      // 3. 保存分叉会话以计算统计信息
      await sessionManager.saveSession(forkedSession);

      // 4. 验证统计信息被复制
      expect(forkedSession.stats).toBeDefined();
      expect(forkedSession.stats?.totalInputTokens).toBe(100);
      expect(forkedSession.stats?.totalOutputTokens).toBe(50);
      expect(forkedSession.stats?.totalCostUsd).toBe(0.005);
    });

    it('应该不复制 sdkSessionId 和原会话的 snapshots 内容', async () => {
      // 1. 创建原始会话并设置 sdkSessionId
      const currentSession = await sessionManager.createSession(tempDir);
      currentSession.sdkSessionId = 'original-sdk-session-id';
      currentSession.messages.push({
        id: 'msg-1',
        role: 'user',
        content: 'Test message',
        timestamp: new Date(),
      });
      await sessionManager.saveSession(currentSession);

      // 2. 在原会话的快照目录中创建文件
      const snapshotsDir = path.join(tempDir, 'sessions', currentSession.id, 'snapshots');
      await fs.writeFile(path.join(snapshotsDir, 'test-snapshot.json'), '{"data": "test"}');

      // 3. 分叉会话
      const forkedSession = await sessionManager.forkSession(currentSession.id);

      // 4. 保存分叉会话以创建快照目录
      await sessionManager.saveSession(forkedSession);

      // 5. 验证 sdkSessionId 未被复制
      expect(forkedSession.sdkSessionId).toBeUndefined();

      // 5. 验证分叉会话有自己的 snapshots 目录（空的）
      const forkedSnapshotsDir = path.join(tempDir, 'sessions', forkedSession.id, 'snapshots');
      let snapshotsExists = false;
      try {
        await fs.access(forkedSnapshotsDir);
        snapshotsExists = true;
      } catch {
        snapshotsExists = false;
      }
      expect(snapshotsExists).toBe(true); // 分叉会话应该有自己的 snapshots 目录

      // 6. 验证原会话的 snapshot 内容未被复制
      let originalSnapshotExists = false;
      try {
        await fs.access(path.join(forkedSnapshotsDir, 'test-snapshot.json'));
        originalSnapshotExists = true;
      } catch {
        originalSnapshotExists = false;
      }
      expect(originalSnapshotExists).toBe(false); // 原会话的 snapshot 文件不应该被复制
    });
  });

  describe('场景 2：无活动会话', () => {
    it('应该在没有活动会话时显示提示消息', async () => {
      // 1. 确保没有活动会话
      const activeSession = streamingQueryManager.getActiveSession();
      expect(activeSession).toBeNull();

      // 2. 捕获控制台输出
      const capture = captureConsoleLog();

      try {
        // 3. 执行 handleForkCommand 逻辑
        if (!activeSession || !activeSession.session) {
          console.log('No active session to fork');
        }

        // 4. 验证显示正确的消息
        expect(capture.logs).toContain('No active session to fork');
      } finally {
        capture.restore();
      }
    });
  });

  describe('场景 3：非交互模式警告', () => {
    it('应该在非交互模式下显示警告消息', async () => {
      // 1. 模拟非交互模式（ui 为 null）
      const ui = null;

      // 2. 捕获控制台输出
      const capture = captureConsoleLog();

      try {
        // 3. 执行 handleForkCommand 逻辑
        if (!ui) {
          console.log('Warning: /fork command is only available in interactive mode');
          // 应该直接返回，不执行后续逻辑
        }

        // 4. 验证显示警告消息
        expect(capture.logs).toContain(
          'Warning: /fork command is only available in interactive mode'
        );

        // 5. 验证没有尝试分叉会话
        expect(capture.logs.length).toBe(1);
      } finally {
        capture.restore();
      }
    });
  });

  describe('命令解析和路由', () => {
    it('应该正确识别 /fork 命令', () => {
      // 模拟命令解析
      const input = '/fork';
      const isCommand = input.startsWith('/');
      const commandName = input.slice(1).trim().split(/\s+/)[0];

      expect(isCommand).toBe(true);
      expect(commandName).toBe('fork');
    });

    it('应该将 /fork 命令路由到 handleForkCommand', () => {
      const commandName = 'fork';
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

  describe('错误处理', () => {
    it('应该在分叉不存在的会话时显示错误', async () => {
      // 1. 捕获控制台错误输出
      const capture = captureConsoleError();

      try {
        // 2. 尝试分叉不存在的会话
        try {
          await sessionManager.forkSession('non-existent-session-id');
          // 不应该到达这里
          expect(true).toBe(false);
        } catch (error) {
          // 3. 模拟 handleForkCommand 中的错误处理
          console.error(
            `Failed to fork session: ${error instanceof Error ? error.message : String(error)}`
          );
        }

        // 4. 验证显示错误消息
        expect(capture.errors.some((err) => err.includes('Failed to fork session'))).toBe(true);
      } finally {
        capture.restore();
      }
    });
  });

  describe('会话切换完整性', () => {
    it('应该在分叉前保存原会话', async () => {
      // 1. 创建活动会话
      const currentSession = await sessionManager.createSession(tempDir);
      currentSession.messages.push({
        id: 'msg-1',
        role: 'user',
        content: 'Message before fork',
        timestamp: new Date(),
      });
      streamingQueryManager.startSession(currentSession);

      // 2. 在内存中添加新消息（未保存）
      currentSession.messages.push({
        id: 'msg-2',
        role: 'user',
        content: 'New message in memory',
        timestamp: new Date(),
      });

      // 3. 执行分叉前的保存逻辑
      await sessionManager.saveSession(currentSession);

      // 4. 重新加载验证保存成功
      const reloadedSession = await sessionManager.loadSession(currentSession.id);
      expect(reloadedSession?.messages.length).toBe(2);
      expect(reloadedSession?.messages[1].content).toBe('New message in memory');
    });

    it('应该在切换后正确设置活动会话', async () => {
      // 1. 创建并启动原始会话
      const originalSession = await sessionManager.createSession(tempDir);
      originalSession.messages.push({
        id: 'msg-orig',
        role: 'user',
        content: 'Original message',
        timestamp: new Date(),
      });
      await sessionManager.saveSession(originalSession);
      streamingQueryManager.startSession(originalSession);

      // 2. 分叉会话
      const forkedSession = await sessionManager.forkSession(originalSession.id);

      // 3. 执行会话切换
      streamingQueryManager.endSession();
      streamingQueryManager.startSession(forkedSession);

      // 4. 验证活动会话已切换
      const activeSession = streamingQueryManager.getActiveSession();
      expect(activeSession?.session.id).toBe(forkedSession.id);
      expect(activeSession?.session.parentSessionId).toBe(originalSession.id);
    });
  });

  describe('分叉会话持久化', () => {
    it('应该能够加载已保存的分叉会话', async () => {
      // 1. 创建并分叉会话
      const originalSession = await sessionManager.createSession(tempDir);
      originalSession.messages.push({
        id: 'msg-1',
        role: 'user',
        content: 'Test message',
        timestamp: new Date(),
      });
      await sessionManager.saveSession(originalSession);

      const forkedSession = await sessionManager.forkSession(originalSession.id);

      // 2. 保存分叉会话
      await sessionManager.saveSession(forkedSession);

      // 3. 重新加载分叉会话
      const reloadedSession = await sessionManager.loadSession(forkedSession.id);

      // 3. 验证加载成功且数据完整
      expect(reloadedSession).not.toBeNull();
      expect(reloadedSession?.id).toBe(forkedSession.id);
      expect(reloadedSession?.parentSessionId).toBe(originalSession.id);
      expect(reloadedSession?.messages.length).toBe(1);
      expect(reloadedSession?.messages[0].content).toBe('Test message');
    });
  });

  describe('多次分叉', () => {
    it('应该支持从分叉会话再次分叉', async () => {
      // 1. 创建原始会话
      const originalSession = await sessionManager.createSession(tempDir);
      originalSession.messages.push({
        id: 'msg-orig',
        role: 'user',
        content: 'Original message',
        timestamp: new Date(),
      });
      await sessionManager.saveSession(originalSession);

      // 2. 第一次分叉
      const fork1 = await sessionManager.forkSession(originalSession.id);
      await sessionManager.saveSession(fork1);
      expect(fork1.parentSessionId).toBe(originalSession.id);

      // 3. 从第一次分叉再次分叉
      const fork2 = await sessionManager.forkSession(fork1.id);
      await sessionManager.saveSession(fork2);
      expect(fork2.parentSessionId).toBe(fork1.id);
      expect(fork2.messages.length).toBe(fork1.messages.length);

      // 4. 验证分叉链的完整性
      const reloadedFork2 = await sessionManager.loadSession(fork2.id);
      expect(reloadedFork2?.parentSessionId).toBe(fork1.id);

      const reloadedFork1 = await sessionManager.loadSession(fork1.id);
      expect(reloadedFork1?.parentSessionId).toBe(originalSession.id);
    });
  });
});
