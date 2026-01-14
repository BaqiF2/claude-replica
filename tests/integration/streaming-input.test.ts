/**
 * 流式输入集成测试
 *
 * 验证端到端的流式输入流程：
 * - SDKQueryExecutor 流式执行
 * - StreamingQueryManager 会话管理
 * - MessageRouter 消息构建
 * - 图像处理集成
 *
 * @module streaming-input.test
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// 模拟 SDK 模块
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: jest.fn(),
}));

import { query } from '@anthropic-ai/claude-agent-sdk';
import { SDKQueryExecutor } from '../../src/sdk/SDKQueryExecutor';
import { StreamingQueryManager } from '../../src/sdk/StreamingQueryManager';
import { MessageRouter } from '../../src/core/MessageRouter';
import { Session, SessionManager } from '../../src/core/SessionManager';
import { ConfigManager } from '../../src/config/ConfigManager';
import { PermissionManager } from '../../src/permissions/PermissionManager';
import { ToolRegistry } from '../../src/tools/ToolRegistry';
import { MockPermissionUI } from '../test-helpers/MockPermissionUI';

// 使用 any 类型绕过 SDK 类型限制
const mockedQuery = query as jest.MockedFunction<any>;

// 创建模拟的 SDK 响应生成器
async function* createMockSDKResponse(
  textContent: string,
  sessionId: string = 'test-sdk-session'
): AsyncGenerator<any, void, unknown> {
  // 助手消息
  yield {
    type: 'assistant',
    uuid: 'msg-uuid-1',
    session_id: sessionId,
    message: {
      content: [{ type: 'text', text: textContent }],
    },
    parent_tool_use_id: null,
  };

  // 成功结果
  yield {
    type: 'result',
    subtype: 'success',
    uuid: 'result-uuid',
    session_id: sessionId,
    duration_ms: 1000,
    duration_api_ms: 800,
    is_error: false,
    num_turns: 1,
    result: textContent,
    total_cost_usd: 0.01,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
    },
  };
}

// 创建模拟的 Session 对象
function createMockSession(workingDirectory: string): Session {
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

describe('流式输入集成测试', () => {
  let tempDir: string;
  let sdkExecutor: SDKQueryExecutor;
  let streamingQueryManager: StreamingQueryManager;
  let messageRouter: MessageRouter;
  let sessionManager: SessionManager;

  beforeEach(async () => {
    // 创建临时目录
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'streaming-e2e-'));

    // 初始化组件
    sdkExecutor = new SDKQueryExecutor();
    sessionManager = new SessionManager(path.join(tempDir, 'sessions'));

    const configManager = new ConfigManager();
    const toolRegistry = new ToolRegistry();
    const permissionManager = new PermissionManager(
      { mode: 'default' },
      new MockPermissionUI(),
      toolRegistry
    );

    messageRouter = new MessageRouter({
      configManager,
      toolRegistry,
      permissionManager,
    });
    messageRouter.setWorkingDirectory(tempDir);

    // 模拟 buildQueryOptions
    jest.spyOn(messageRouter, 'buildQueryOptions').mockResolvedValue({
      model: 'claude-sonnet-4-5-20250929',
      systemPrompt: 'Test system prompt',
      allowedTools: ['Read', 'Write'],
      cwd: tempDir,
      permissionMode: 'default',
    });

    streamingQueryManager = new StreamingQueryManager({
      messageRouter,
      sdkExecutor,
      sessionManager,
    });

    jest.clearAllMocks();
  });

  afterEach(async () => {
    // 清理临时目录
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('端到端流式查询', () => {
    it('应该成功执行纯文本流式查询', async () => {
      // 设置模拟 SDK 响应
      mockedQuery.mockReturnValue(createMockSDKResponse('Hello! I am Claude.'));

      // 启动会话
      const session = createMockSession(tempDir);
      streamingQueryManager.startSession(session);

      // 发送消息
      const result = await streamingQueryManager.sendMessage('Hello, Claude!');

      // 验证结果 - sendMessage 立即返回
      expect(result.success).toBe(true);

      // 需要等待执行完成才能获取 SDK 结果
      const sdkResult = await streamingQueryManager.waitForResult();
      expect(sdkResult).toBeDefined();
      expect(sdkResult?.response).toBe('Hello! I am Claude.');
      expect(sdkResult?.isError).toBe(false);
      expect(sdkResult?.sessionId).toBe('test-sdk-session');
    });

    it('应该正确处理包含图像的流式查询', async () => {
      // 创建测试图像
      const imageBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
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

      // 设置模拟 SDK 响应
      mockedQuery.mockReturnValue(
        createMockSDKResponse('I can see a 1x1 pixel PNG image.')
      );

      // 启动会话
      const session = createMockSession(tempDir);
      streamingQueryManager.startSession(session);

      // 发送包含图像引用的消息
      const result = await streamingQueryManager.sendMessage(
        `What's in this image? @${imagePath}`
      );

      // 验证结果 - sendMessage 立即返回
      expect(result.success).toBe(true);

      // 需要等待执行完成才能获取 SDK 结果
      const sdkResult = await streamingQueryManager.waitForResult();
      expect(sdkResult?.response).toContain('PNG image');
    });

    it('应该正确处理会话中断', async () => {
      // 创建一个永不完成的生成器来模拟长时间运行的查询
      async function* neverEnding(): AsyncGenerator<any, void, unknown> {
        yield {
          type: 'assistant',
          uuid: 'msg-uuid',
          session_id: 'test-session',
          message: { content: [{ type: 'text', text: 'Starting...' }] },
          parent_tool_use_id: null,
        };
        // 等待很长时间（会被中断）
        await new Promise((resolve) => setTimeout(resolve, 100000));
      }

      mockedQuery.mockReturnValue(neverEnding());

      // 启动会话
      const session = createMockSession(tempDir);
      streamingQueryManager.startSession(session);

      // 开始发送消息（不等待完成）
      streamingQueryManager.sendMessage('Long query');

      // 等待一小段时间让查询开始
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 中断会话
      const interrupted = streamingQueryManager.interruptSession();
      expect(interrupted.success).toBe(true);
      expect(interrupted.clearedMessages).toBe(1);

      // 验证中断状态
      const activeSession = streamingQueryManager.getActiveSession();
      expect(activeSession?.state).toBe('interrupted');
    });
  });

  describe('消息队列处理', () => {
    it('应该按 FIFO 顺序处理队列中的消息', async () => {
      const processedOrder: string[] = [];

      // 模拟 SDK 响应，记录处理顺序
      mockedQuery.mockImplementation((args: any) => {
        // 从生成器中提取消息内容
        const prompt = args.prompt;

        return (async function* () {
          // 持续从生成器中获取消息
          while (true) {
            const { value, done } = await prompt.next();

            if (done || !value) {
              break;
            }

            if (value?.message?.content) {
              const content = value.message.content;
              if (Array.isArray(content)) {
                const textBlock = content.find((b: any) => b.type === 'text');
                if (textBlock) {
                  processedOrder.push(textBlock.text);
                }
              } else if (typeof content === 'string') {
                processedOrder.push(content);
              }
            }

            // 等待一小段时间模拟处理
            await new Promise(resolve => setTimeout(resolve, 10));

            // 生成结果消息
            yield {
              type: 'result',
              subtype: 'success',
              uuid: `result-uuid-${processedOrder.length}`,
              session_id: 'test-session',
              duration_ms: 100,
              duration_api_ms: 80,
              is_error: false,
              num_turns: 1,
              result: 'Done',
              total_cost_usd: 0.001,
              usage: { input_tokens: 10, output_tokens: 5 },
            };

            // 短暂暂停，让后续消息可以进入队列
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        })();
      });

      // 启动会话
      const session = createMockSession(tempDir);
      streamingQueryManager.startSession(session);

      // 发送多条消息
      await streamingQueryManager.sendMessage('Message 1');
      await new Promise(resolve => setTimeout(resolve, 20));
      await streamingQueryManager.sendMessage('Message 2');
      await new Promise(resolve => setTimeout(resolve, 20));
      await streamingQueryManager.sendMessage('Message 3');

      // 等待所有消息处理完成
      await new Promise(resolve => setTimeout(resolve, 100));

      // 验证处理顺序
      expect(processedOrder).toEqual(['Message 1', 'Message 2', 'Message 3']);
    });
  });

  describe('兼容接口', () => {
    it('SDKQueryExecutor.execute() 应该内部使用流式执行', async () => {
      // 设置模拟 SDK 响应
      mockedQuery.mockReturnValue(
        createMockSDKResponse('Response from execute()')
      );

      // 使用 execute() 方法（兼容接口）
      const result = await sdkExecutor.execute({
        prompt: 'Test prompt',
        model: 'claude-sonnet-4-5-20250929',
        cwd: tempDir,
      });

      // 验证结果
      expect(result.isError).toBe(false);
      expect(result.response).toBe('Response from execute()');
      expect(result.sessionId).toBe('test-sdk-session');

      // 验证 SDK query() 被调用
      expect(mockedQuery).toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    it('应该正确处理 SDK 错误响应', async () => {
      // 模拟错误响应
      async function* errorResponse(): AsyncGenerator<any, void, unknown> {
        yield {
          type: 'result',
          subtype: 'error_during_execution',
          uuid: 'error-uuid',
          session_id: 'test-session',
          duration_ms: 100,
          duration_api_ms: 80,
          is_error: true,
          num_turns: 0,
          total_cost_usd: 0.001,
          usage: { input_tokens: 10, output_tokens: 0 },
          errors: ['Something went wrong'],
        };
      }

      mockedQuery.mockReturnValue(errorResponse());

      // 启动会话
      const session = createMockSession(tempDir);
      streamingQueryManager.startSession(session);

      // 发送消息
      const result = await streamingQueryManager.sendMessage('Error query');

      // 验证错误被正确传递 - sendMessage 立即返回
      expect(result.success).toBe(true); // 消息发送成功

      // 需要等待执行完成才能获取错误结果
      const sdkResult = await streamingQueryManager.waitForResult();
      expect(sdkResult?.isError).toBe(true);
      expect(sdkResult?.errorMessage).toContain('Something went wrong');
    });

    it('应该正确处理无效的图像引用', async () => {
      // 启动会话
      const session = createMockSession(tempDir);
      streamingQueryManager.startSession(session);

      // 发送包含无效图像引用的消息
      const result = await streamingQueryManager.sendMessage(
        'Check @./does-not-exist.png'
      );

      // 验证行为：消息仍然成功发送（文本部分），但图像错误被记录
      // 这是符合预期的宽容模式 - 图像错误作为警告而不是致命错误
      expect(result.success).toBe(true); // 消息本身成功发送
      expect(result.imageErrors).toBeDefined(); // 图像错误被正确记录
      expect(result.imageErrors!.length).toBeGreaterThan(0);
      expect(result.imageErrors![0].reference).toContain('does-not-exist.png');
    });
  });
});
