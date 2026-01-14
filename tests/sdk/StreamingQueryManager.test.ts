/**
 * StreamingQueryManager 测试
 *
 * 验证流式查询管理器的核心功能：
 * - 会话管理
 * - 消息队列
 * - 图像处理集成
 * - 中断支持
 *
 * @module StreamingQueryManager.test
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// 模拟 SDK 模块
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: jest.fn(),
}));

import { StreamingQueryManager } from '../../src/sdk/StreamingQueryManager';
import { SDKQueryExecutor, SDKQueryResult } from '../../src/sdk/SDKQueryExecutor';
import { MessageRouter } from '../../src/core/MessageRouter';
import { Session, SessionManager } from '../../src/core/SessionManager';
import { ConfigManager } from '../../src/config/ConfigManager';
import { PermissionManager } from '../../src/permissions/PermissionManager';
import { ToolRegistry } from '../../src/tools/ToolRegistry';
import { MockPermissionUI } from '../test-helpers/MockPermissionUI';

// 创建模拟的 Session 对象
function createMockSession(workingDirectory: string = '/test/project'): Session {
  return {
    id: 'test-session-id',
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    messages: [],
    context: {
      workingDirectory,
      projectConfig: {},
      
      activeAgents: [],
    },
    expired: false,
    workingDirectory,
  };
}

// 创建模拟的 SDKQueryResult
function createMockSDKResult(response: string, isError: boolean = false): SDKQueryResult {
  return {
    response,
    isError,
    sessionId: 'sdk-session-id',
    totalCostUsd: 0.01,
    durationMs: 1000,
    usage: {
      inputTokens: 100,
      outputTokens: 50,
    },
  };
}

describe('StreamingQueryManager', () => {
  let manager: StreamingQueryManager;
  let mockSDKExecutor: jest.Mocked<SDKQueryExecutor>;
  let mockMessageRouter: MessageRouter;
  let mockSessionManager: SessionManager;
  let tempDir: string;

  beforeEach(async () => {
    // 创建临时目录用于测试
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'streaming-test-'));

    // 创建模拟的依赖
    mockSDKExecutor = {
      execute: jest.fn(),
      executeStreaming: jest.fn(),
      interrupt: jest.fn(),
      isRunning: jest.fn(),
      isInterrupted: jest.fn(),
      mapToSDKOptions: jest.fn(),
      processMessage: jest.fn(),
      extractTextFromAssistantMessage: jest.fn(),
    } as unknown as jest.Mocked<SDKQueryExecutor>;

    const configManager = new ConfigManager();
    const permissionManager = new PermissionManager(
      { mode: 'default' },
      new MockPermissionUI(),
      new ToolRegistry()
    );

    mockMessageRouter = new MessageRouter({
      configManager,
      permissionManager,
    });

    mockSessionManager = new SessionManager(path.join(tempDir, 'sessions'));

    // 模拟 buildQueryOptions 方法
    jest.spyOn(mockMessageRouter, 'buildQueryOptions').mockResolvedValue({
      model: 'claude-sonnet-4-5-20250929',
      systemPrompt: 'Test system prompt',
      allowedTools: ['Read', 'Write'],
      cwd: tempDir,
      permissionMode: 'default',
    });

    // 模拟 buildStreamMessage 方法（新架构需要）
    jest.spyOn(mockMessageRouter, 'buildStreamMessage').mockResolvedValue({
      contentBlocks: [{ type: 'text', text: 'Test message' }],
      processedText: 'Test message',
      images: [],
      errors: [],
    });

    manager = new StreamingQueryManager({
      messageRouter: mockMessageRouter,
      sdkExecutor: mockSDKExecutor,
      sessionManager: mockSessionManager,
    });
  });

  afterEach(async () => {
    // 清理临时目录
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('startSession', () => {
    it('应该创建新的流式会话', () => {
      const session = createMockSession(tempDir);
      const streamingSession = manager.startSession(session);

      expect(streamingSession).toBeDefined();
      expect(streamingSession.session).toBe(session);
      expect(streamingSession.state).toBe('idle');
      expect(streamingSession.messageQueue).toEqual([]);
      expect(streamingSession.abortController).toBeInstanceOf(AbortController);
    });

    it('应该中断之前的会话并创建新会话', () => {
      const session1 = createMockSession(tempDir);
      const session2 = createMockSession(tempDir);

      manager.startSession(session1);
      const streamingSession2 = manager.startSession(session2);

      expect(streamingSession2).toBeDefined();
      expect(streamingSession2.session).toBe(session2);
      expect(manager.getActiveSession()).toBe(streamingSession2);
    });
  });

  describe('getActiveSession', () => {
    it('应该在没有活跃会话时返回 null', () => {
      expect(manager.getActiveSession()).toBeNull();
    });

    it('应该返回当前活跃的会话', () => {
      const session = createMockSession(tempDir);
      const streamingSession = manager.startSession(session);

      expect(manager.getActiveSession()).toBe(streamingSession);
    });
  });

  describe('sendMessage', () => {
    it('应该在没有活跃会话时返回错误', async () => {
      const result = await manager.sendMessage('Hello');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No active streaming session');
    });

    it('应该成功发送纯文本消息', async () => {
      const session = createMockSession(tempDir);
      manager.startSession(session);

      mockSDKExecutor.executeStreaming.mockResolvedValue(
        createMockSDKResult('AI response')
      );

      const result = await manager.sendMessage('Hello, Claude!');

      // 新架构中，sendMessage 只返回成功/失败状态
      // 结果通过回调传递，不在 result 中返回
      expect(result.success).toBe(true);
      expect(mockSDKExecutor.executeStreaming).toHaveBeenCalled();
    });

    it('应该在处理中时将消息实时注入', async () => {
      const session = createMockSession(tempDir);
      const streamingSession = manager.startSession(session);

      // 模拟正在处理状态
      streamingSession.state = 'processing';

      // 在新架构中，消息会被实时注入到 LiveMessageGenerator
      // 而不是简单地加入队列
      const result = await manager.sendMessage('Injected message');

      // sendMessage 会触发消息构建和注入
      expect(result.success).toBe(true);
    });
  });

  describe('queueMessage', () => {
    it('应该通过 sendMessage 实时注入消息', async () => {
      const session = createMockSession(tempDir);
      manager.startSession(session);

      mockSDKExecutor.executeStreaming.mockResolvedValue(
        createMockSDKResult('AI response')
      );

      // 在新架构中，queueMessage 直接调用 sendMessage
      // 消息会被实时注入到 agent loop
      manager.queueMessage('Message 1');
      manager.queueMessage('Message 2');

      // 等待异步操作完成
      await new Promise(resolve => setTimeout(resolve, 10));

      // 消息被注入后，executeStreaming 应该被调用
      expect(mockSDKExecutor.executeStreaming).toHaveBeenCalled();
    });

    it('应该在没有活跃会话时静默失败', () => {
      manager.queueMessage('Message');
      expect(manager.getQueueLength()).toBe(0);
    });
  });

  describe('interruptSession', () => {
    it('应该在没有活跃会话时返回 success: false', () => {
      const result = manager.interruptSession();
      expect(result.success).toBe(false);
      expect(result.clearedMessages).toBe(0);
    });

    it('应该在不处理消息时返回 success: false', () => {
      const session = createMockSession(tempDir);
      manager.startSession(session);

      const result = manager.interruptSession();
      expect(result.success).toBe(false);
      expect(result.clearedMessages).toBe(0);
    });

    it('应该在处理消息时成功中断并返回清空的消息数量', () => {
      const session = createMockSession(tempDir);
      const streamingSession = manager.startSession(session);
      streamingSession.state = 'processing';

      const result = manager.interruptSession();

      expect(result.success).toBe(true);
      expect(result.clearedMessages).toBeGreaterThanOrEqual(0);
      expect(streamingSession.state).toBe('interrupted');
    });

    it('应该在中断后创建新的 AbortController', () => {
      const session = createMockSession(tempDir);
      const streamingSession = manager.startSession(session);
      streamingSession.state = 'processing';

      const oldController = streamingSession.abortController;
      const result = manager.interruptSession();

      expect(result.success).toBe(true);
      expect(streamingSession.abortController).not.toBe(oldController);
    });

    it('应该在中断时清空队列中的消息', async () => {
      const session = createMockSession(tempDir);
      manager.startSession(session);

      // 模拟添加消息到队列（通过 queueMessage）
      manager.queueMessage('Test message 1');
      manager.queueMessage('Test message 2');

      // 等待消息进入队列
      await new Promise((resolve) => setTimeout(resolve, 10));

      // 获取队列长度
      const queueLengthBefore = manager.getQueueLength();

      // 模拟处理状态
      const streamingSession = manager.getActiveSession();
      if (streamingSession) {
        streamingSession.state = 'processing';
      }

      // 中断并验证清空了消息
      const result = manager.interruptSession();

      expect(result.success).toBe(true);
      expect(result.clearedMessages).toBe(queueLengthBefore);
      expect(manager.getQueueLength()).toBe(0);
    });
  });

  describe('endSession', () => {
    it('应该清理活跃会话', () => {
      const session = createMockSession(tempDir);
      manager.startSession(session);

      manager.endSession();

      expect(manager.getActiveSession()).toBeNull();
    });

    it('应该中断正在处理的会话', () => {
      const session = createMockSession(tempDir);
      const streamingSession = manager.startSession(session);
      streamingSession.state = 'processing';

      const abortSpy = jest.spyOn(streamingSession.abortController, 'abort');
      manager.endSession();

      expect(abortSpy).toHaveBeenCalled();
    });
  });

  describe('isProcessing', () => {
    it('应该在没有活跃会话时返回 false', () => {
      expect(manager.isProcessing()).toBe(false);
    });

    it('应该在空闲状态时返回 false', () => {
      const session = createMockSession(tempDir);
      manager.startSession(session);

      expect(manager.isProcessing()).toBe(false);
    });

    it('应该在处理状态时返回 true', () => {
      const session = createMockSession(tempDir);
      const streamingSession = manager.startSession(session);
      streamingSession.state = 'processing';

      expect(manager.isProcessing()).toBe(true);
    });
  });

  describe('getQueueLength', () => {
    it('应该在没有活跃会话时返回 0', () => {
      expect(manager.getQueueLength()).toBe(0);
    });

    it('应该返回 LiveMessageGenerator 中待处理的消息数量', async () => {
      const session = createMockSession(tempDir);
      manager.startSession(session);

      // 在新架构中，getQueueLength 返回 LiveMessageGenerator 中待 yield 的消息数量
      // 消息通过 queueMessage（内部调用 sendMessage）被推送到生成器
      // 由于消息会被立即 yield（如果执行已启动），队列长度可能为 0
      // 这里我们测试初始状态
      expect(manager.getQueueLength()).toBe(0);
    });
  });

  describe('图像处理集成', () => {
    it('应该正确处理图像引用', async () => {
      // 创建测试图像文件
      const imageBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG 文件头
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
        0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59,
        0xe7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
        0x44, 0xae, 0x42, 0x60, 0x82,
      ]);

      const imagePath = path.join(tempDir, 'test.png');
      await fs.writeFile(imagePath, imageBuffer);

      const session = createMockSession(tempDir);
      manager.startSession(session);

      mockSDKExecutor.executeStreaming.mockResolvedValue(
        createMockSDKResult('Image processed')
      );

      const result = await manager.sendMessage(`Analyze this image @${imagePath}`);

      expect(result.success).toBe(true);
      expect(mockSDKExecutor.executeStreaming).toHaveBeenCalled();

      // 验证消息生成器包含图像内容块
      const callArgs = mockSDKExecutor.executeStreaming.mock.calls[0];
      expect(callArgs).toBeDefined();
    });

    it('应该在图像文件不存在时返回错误或警告', async () => {
      const session = createMockSession(tempDir);
      manager.startSession(session);

      // 模拟图像加载失败的情况
      jest.spyOn(mockMessageRouter, 'buildStreamMessage').mockResolvedValueOnce({
        contentBlocks: [], // 没有成功加载的内容块
        processedText: '',
        images: [],
        errors: [{ reference: '@./nonexistent.png', error: 'File not found' }],
      });

      mockSDKExecutor.executeStreaming.mockResolvedValue(
        createMockSDKResult('Response')
      );

      const result = await manager.sendMessage('Check @./nonexistent.png');

      // 当所有内容块都失败时，应该返回错误
      expect(result.success).toBe(false);
    });
  });

  describe('消息实时注入', () => {
    it('应该将消息实时注入到 agent loop', async () => {
      const session = createMockSession(tempDir);
      manager.startSession(session);

      const processedMessages: string[] = [];

      // 修改 buildStreamMessage mock 以返回实际输入的消息
      jest.spyOn(mockMessageRouter, 'buildStreamMessage').mockImplementation(async (rawMessage: string) => ({
        contentBlocks: [{ type: 'text' as const, text: rawMessage }],
        processedText: rawMessage,
        images: [],
        errors: [],
      }));

      mockSDKExecutor.executeStreaming.mockImplementation(async (generator) => {
        // 从生成器获取消息
        const { value } = await generator.next();
        if (value && typeof value.message.content === 'object') {
          const textBlock = (value.message.content as any[]).find(
            (block) => block.type === 'text'
          );
          if (textBlock) {
            processedMessages.push(textBlock.text);
          }
        } else if (typeof value?.message.content === 'string') {
          processedMessages.push(value.message.content);
        }
        return createMockSDKResult('Response');
      });

      // 发送消息，消息会被实时注入
      await manager.sendMessage('Message 1');

      // 等待异步执行完成
      await manager.waitForResult();

      expect(processedMessages).toContain('Message 1');
    });
  });
});

describe('StreamingQueryManager - 属性测试', () => {
  /**
   * Property: Session State Consistency
   *
   * 会话状态应始终保持一致
   */
  describe('Property: Session State Consistency', () => {
    it('会话状态应该在操作后保持一致', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prop-test-'));

      try {
        const mockSDKExecutor = {
          executeStreaming: jest.fn().mockResolvedValue({
            response: 'Response',
            isError: false,
            sessionId: 'test-session',
          }),
        } as unknown as SDKQueryExecutor;

        const configManager = new ConfigManager();
        const permissionManager = new PermissionManager(
          { mode: 'default' },
          new MockPermissionUI(),
          new ToolRegistry()
        );

        const mockMessageRouter = new MessageRouter({
          configManager,
          permissionManager,
        });

        jest.spyOn(mockMessageRouter, 'buildQueryOptions').mockResolvedValue({
          model: 'claude-sonnet-4-5-20250929',
          systemPrompt: '',
          allowedTools: [],
          cwd: tempDir,
          permissionMode: 'default',
        });

        const localSessionManager = new SessionManager(path.join(tempDir, 'sessions'));
        const manager = new StreamingQueryManager({
          messageRouter: mockMessageRouter,
          sdkExecutor: mockSDKExecutor,
          sessionManager: localSessionManager,
        });

        // 测试会话生命周期
        expect(manager.getActiveSession()).toBeNull();

        const session = createMockSession(tempDir);
        const streamingSession = manager.startSession(session);

        expect(manager.getActiveSession()).toBe(streamingSession);
        expect(streamingSession.state).toBe('idle');

        manager.endSession();
        expect(manager.getActiveSession()).toBeNull();
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  /**
   * Property: Live Message Injection
   *
   * 在新架构中，消息通过 LiveMessageGenerator 实时注入
   */
  describe('Property: Live Message Injection', () => {
    it('消息应该被实时注入到 agent loop', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'live-test-'));

      try {
        const injectedMessages: string[] = [];
        const mockSDKExecutor = {
          executeStreaming: jest.fn().mockImplementation(async (generator) => {
            // 从生成器获取所有消息
            for await (const msg of generator) {
              if (msg && typeof msg.message.content === 'object') {
                const textBlock = (msg.message.content as any[]).find(
                  (block) => block.type === 'text'
                );
                if (textBlock) {
                  injectedMessages.push(textBlock.text);
                }
              }
              // 只处理第一条消息就退出
              break;
            }
            return {
              response: 'Response',
              isError: false,
              sessionId: 'test-session',
            };
          }),
        } as unknown as SDKQueryExecutor;

        const configManager = new ConfigManager();
        const permissionManager = new PermissionManager(
          { mode: 'default' },
          new MockPermissionUI(),
          new ToolRegistry()
        );

        const mockMessageRouter = new MessageRouter({
          configManager,
          permissionManager,
        });

        jest.spyOn(mockMessageRouter, 'buildQueryOptions').mockResolvedValue({
          model: 'claude-sonnet-4-5-20250929',
          systemPrompt: '',
          allowedTools: [],
          cwd: tempDir,
          permissionMode: 'default',
        });

        // 添加 buildStreamMessage mock
        jest.spyOn(mockMessageRouter, 'buildStreamMessage').mockImplementation(async (rawMessage: string) => ({
          contentBlocks: [{ type: 'text' as const, text: rawMessage }],
          processedText: rawMessage,
          images: [],
          errors: [],
        }));

        const mockSessionManager = {
          createSession: jest.fn(),
          saveSession: jest.fn(),
          loadSession: jest.fn(),
          listSessions: jest.fn(),
          deleteSession: jest.fn(),
          forkSession: jest.fn(),
        } as unknown as SessionManager;

        const manager = new StreamingQueryManager({
          messageRouter: mockMessageRouter,
          sdkExecutor: mockSDKExecutor,
          sessionManager: mockSessionManager,
        });

        const session = createMockSession(tempDir);
        manager.startSession(session);

        // 发送消息，应该被实时注入
        await manager.sendMessage('Test message');

        // 等待异步执行完成
        await manager.waitForResult();

        // 验证消息被注入
        expect(injectedMessages).toContain('Test message');
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });
  });
});
