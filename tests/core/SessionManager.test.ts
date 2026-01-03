/**
 * 会话管理器测试
 *
 * 包含单元测试和属性测试
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SessionManager, UsageStats } from '../../src/core/SessionManager';

// 会话过期时间（从环境变量读取，与 SessionManager 保持一致）
const SESSION_EXPIRY_MS = (parseInt(process.env.SESSION_EXPIRY_HOURS || '5', 10) * 60 * 60 * 1000);

// 测试用的临时目录
let testDir: string;
let sessionManager: SessionManager;

/**
 * 生成随机消息的 Arbitrary
 */
const arbMessage = fc.record({
  role: fc.constantFrom('user', 'assistant', 'system') as fc.Arbitrary<'user' | 'assistant' | 'system'>,
  content: fc.string({ minLength: 1, maxLength: 500 }),
});

/**
 * 生成随机技能的 Arbitrary
 */
const arbSkill = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  description: fc.string({ minLength: 1, maxLength: 200 }),
  triggers: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }), { nil: undefined }),
  tools: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }), { nil: undefined }),
  content: fc.string({ minLength: 1, maxLength: 1000 }),
  metadata: fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.string({ minLength: 1, maxLength: 100 })),
});

/**
 * 生成随机代理的 Arbitrary
 */
const arbAgent = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  description: fc.string({ minLength: 1, maxLength: 200 }),
  model: fc.option(fc.constantFrom('sonnet', 'opus', 'haiku', 'inherit') as fc.Arbitrary<'sonnet' | 'opus' | 'haiku' | 'inherit'>, { nil: undefined }),
  prompt: fc.string({ minLength: 1, maxLength: 500 }),
  tools: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }), { nil: undefined }),
});

/**
 * 生成随机会话上下文的 Arbitrary
 */
const arbSessionContext = fc.record({
  workingDirectory: fc.string({ minLength: 1, maxLength: 100 }),
  projectConfig: fc.record({
    model: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    maxTurns: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
  }),
  userConfig: fc.record({
    model: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  }),
  loadedSkills: fc.array(arbSkill, { maxLength: 3 }),
  activeAgents: fc.array(arbAgent, { maxLength: 3 }),
});

beforeAll(async () => {
  // 创建测试用的临时目录
  testDir = path.join(os.tmpdir(), `claude-replica-test-${Date.now()}`);
  await fs.mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  // 清理测试目录
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
});

beforeEach(async () => {
  // 每个测试前创建新的 SessionManager
  const sessionsDir = path.join(testDir, `sessions-${Date.now()}`);
  sessionManager = new SessionManager(sessionsDir);
});

describe('SessionManager', () => {
  describe('createSession', () => {
    it('应该创建新会话并返回有效的会话对象', async () => {
      const workingDir = '/test/project';
      const session = await sessionManager.createSession(workingDir);

      expect(session).toBeDefined();
      expect(session.id).toMatch(/^session-/);
      expect(session.workingDirectory).toBe(workingDir);
      expect(session.messages).toEqual([]);
      expect(session.expired).toBe(false);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastAccessedAt).toBeInstanceOf(Date);
    });

    it('应该使用提供的配置创建会话', async () => {
      const workingDir = '/test/project';
      const projectConfig = { model: 'claude-3-5-sonnet' };
      const userConfig = { maxTurns: 10 };

      const session = await sessionManager.createSession(
        workingDir,
        projectConfig,
        userConfig
      );

      expect(session.context.projectConfig).toEqual(projectConfig);
      expect(session.context.userConfig).toEqual(userConfig);
    });
  });

  describe('saveSession 和 loadSession', () => {
    it('应该正确保存和加载会话', async () => {
      const session = await sessionManager.createSession('/test/project');

      // 添加一些消息
      await sessionManager.addMessage(session, {
        role: 'user',
        content: '你好',
      });
      await sessionManager.addMessage(session, {
        role: 'assistant',
        content: '你好！有什么可以帮助你的？',
      });

      // 重新加载会话
      const loadedSession = await sessionManager.loadSession(session.id);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.id).toBe(session.id);
      expect(loadedSession!.messages.length).toBe(2);
      expect(loadedSession!.messages[0].content).toBe('你好');
      expect(loadedSession!.messages[1].content).toBe('你好！有什么可以帮助你的？');
    });

    it('加载不存在的会话应该返回 null', async () => {
      const session = await sessionManager.loadSession('non-existent-session');
      expect(session).toBeNull();
    });
  });

  describe('listSessions', () => {
    it('应该列出所有会话', async () => {
      // 创建多个会话
      await sessionManager.createSession('/project1');
      await sessionManager.createSession('/project2');
      await sessionManager.createSession('/project3');

      const sessions = await sessionManager.listSessions();

      expect(sessions.length).toBe(3);
    });

    it('应该按最后访问时间排序', async () => {
      const session1 = await sessionManager.createSession('/project1');
      
      // 等待一小段时间确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const session2 = await sessionManager.createSession('/project2');

      // 等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 10));

      // 访问 session1 使其成为最近访问的
      await sessionManager.loadSession(session1.id);

      const sessions = await sessionManager.listSessions();

      expect(sessions[0].id).toBe(session1.id);
      expect(sessions[1].id).toBe(session2.id);
    });
  });

  describe('getRecentSession', () => {
    it('应该返回最近的非过期会话', async () => {
      const session1 = await sessionManager.createSession('/project1');
      
      // 等待一小段时间确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await sessionManager.createSession('/project2');

      // 等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 10));

      // 访问 session1
      await sessionManager.loadSession(session1.id);

      const recentSession = await sessionManager.getRecentSession();

      expect(recentSession).not.toBeNull();
      expect(recentSession!.id).toBe(session1.id);
    });

    it('没有会话时应该返回 null', async () => {
      const recentSession = await sessionManager.getRecentSession();
      expect(recentSession).toBeNull();
    });
  });

  describe('cleanSessions', () => {
    it('应该清理早于指定日期的会话', async () => {
      await sessionManager.createSession('/project1');
      await sessionManager.createSession('/project2');

      // 清理所有会话（使用未来的日期）
      const futureDate = new Date(Date.now() + 1000 * 60 * 60);
      await sessionManager.cleanSessions(futureDate);

      const sessions = await sessionManager.listSessions();
      expect(sessions.length).toBe(0);
    });
  });

  describe('deleteSession', () => {
    it('应该删除指定的会话', async () => {
      const session = await sessionManager.createSession('/project');

      await sessionManager.deleteSession(session.id);

      const loadedSession = await sessionManager.loadSession(session.id);
      expect(loadedSession).toBeNull();
    });
  });

  describe('addMessage', () => {
    it('应该向会话添加消息', async () => {
      const session = await sessionManager.createSession('/project');

      const message = await sessionManager.addMessage(session, {
        role: 'user',
        content: '测试消息',
      });

      expect(message.id).toBeDefined();
      expect(message.role).toBe('user');
      expect(message.content).toBe('测试消息');
      expect(message.timestamp).toBeInstanceOf(Date);
      expect(session.messages.length).toBe(1);
    });
  });

  describe('updateContext', () => {
    it('应该更新会话上下文', async () => {
      const session = await sessionManager.createSession('/project');

      await sessionManager.updateContext(session, {
        projectConfig: { model: 'claude-3-opus' },
      });

      expect(session.context.projectConfig.model).toBe('claude-3-opus');
    });
  });

  describe('markExpired', () => {
    it('应该标记会话为过期', async () => {
      const session = await sessionManager.createSession('/project');

      await sessionManager.markExpired(session);

      expect(session.expired).toBe(true);

      // 重新加载验证
      const loadedSession = await sessionManager.loadSession(session.id);
      expect(loadedSession!.expired).toBe(true);
    });
  });
});

/**
 * 属性测试
 *
 * Feature: claude-code-replica, Property 2: 会话恢复的完整性
 * 验证: 需求 6.3, 6.4
 */
describe('属性测试: 会话恢复的完整性', () => {
  it('对于任意保存的会话，恢复后的会话应该包含相同的消息历史、上下文和状态', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbMessage, { minLength: 0, maxLength: 10 }),
        arbSessionContext,
        async (messages, context) => {
          // 创建会话
          const session = await sessionManager.createSession(
            context.workingDirectory,
            context.projectConfig,
            context.userConfig
          );

          // 更新上下文
          await sessionManager.updateContext(session, {
            loadedSkills: context.loadedSkills,
            activeAgents: context.activeAgents,
          });

          // 添加消息
          for (const msg of messages) {
            await sessionManager.addMessage(session, msg);
          }

          // 重新加载会话
          const loadedSession = await sessionManager.loadSession(session.id);

          // 验证会话恢复的完整性
          expect(loadedSession).not.toBeNull();
          expect(loadedSession!.id).toBe(session.id);
          expect(loadedSession!.workingDirectory).toBe(session.workingDirectory);

          // 验证消息数量一致
          expect(loadedSession!.messages.length).toBe(messages.length);

          // 验证每条消息的内容一致
          for (let i = 0; i < messages.length; i++) {
            expect(loadedSession!.messages[i].role).toBe(messages[i].role);
            expect(loadedSession!.messages[i].content).toBe(messages[i].content);
          }

          // 验证上下文一致
          expect(loadedSession!.context.workingDirectory).toBe(context.workingDirectory);
          expect(loadedSession!.context.loadedSkills.length).toBe(context.loadedSkills.length);
          expect(loadedSession!.context.activeAgents.length).toBe(context.activeAgents.length);

          // 清理
          await sessionManager.deleteSession(session.id);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * 属性测试
 *
 * Feature: claude-code-replica, Property 11: 会话过期的时效性
 * 验证: 需求 6.5
 */
describe('属性测试: 会话过期的时效性', () => {
  it('对于任意会话，如果从创建时间起超过配置的过期时间，则该会话应该被标记为过期', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成 0 到 (过期时间 * 2) 之间的时间偏移（毫秒）
        fc.integer({ min: 0, max: SESSION_EXPIRY_MS * 2 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (timeOffsetMs, workingDir) => {
          // 创建会话
          const session = await sessionManager.createSession(`/test/${workingDir}`);

          // 模拟时间流逝：修改会话的创建时间
          const pastCreatedAt = new Date(Date.now() - timeOffsetMs);
          session.createdAt = pastCreatedAt;
          await sessionManager.saveSession(session);

          // 重新加载会话
          const loadedSession = await sessionManager.loadSession(session.id);

          expect(loadedSession).not.toBeNull();

          // 验证过期状态（>= 配置的过期时间为过期）
          const shouldBeExpired = timeOffsetMs >= SESSION_EXPIRY_MS;
          expect(loadedSession!.expired).toBe(shouldBeExpired);

          // 清理
          await sessionManager.deleteSession(session.id);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('刚创建的会话不应该过期', async () => {
    const session = await sessionManager.createSession('/test/project');

    expect(session.expired).toBe(false);

    const loadedSession = await sessionManager.loadSession(session.id);
    expect(loadedSession!.expired).toBe(false);

    await sessionManager.deleteSession(session.id);
  });

  it('超过配置的过期时间的会话应该被标记为过期', async () => {
    const session = await sessionManager.createSession('/test/project');

    // 将创建时间设置为过期时间 + 1 小时前
    const pastExpiry = new Date(Date.now() - SESSION_EXPIRY_MS - 60 * 60 * 1000);
    session.createdAt = pastExpiry;
    await sessionManager.saveSession(session);

    // 重新加载会话
    const loadedSession = await sessionManager.loadSession(session.id);

    expect(loadedSession!.expired).toBe(true);

    await sessionManager.deleteSession(session.id);
  });

  it('正好达到过期时间的会话应该过期（边界情况）', async () => {
    const session = await sessionManager.createSession('/test/project');

    // 将创建时间设置为正好等于过期时间
    const exactlyExpired = new Date(Date.now() - SESSION_EXPIRY_MS);
    session.createdAt = exactlyExpired;
    await sessionManager.saveSession(session);

    // 重新加载会话
    const loadedSession = await sessionManager.loadSession(session.id);

    // 正好达到过期时间应该过期（>= 过期时间）
    expect(loadedSession!.expired).toBe(true);

    await sessionManager.deleteSession(session.id);
  });
});


/**
 * 属性测试
 *
 * Feature: sdk-integration, Property 6: Session Message Persistence
 *
 * *For any* successful query execution, the SessionManager SHALL contain
 * both the original user message and the assistant response in the correct order.
 *
 * **Validates: Requirements 3.1**
 */
describe('属性测试: 会话消息持久化 (Property 6)', () => {
  /**
   * 生成随机的 usage 统计信息
   */
  const arbUsageStats: fc.Arbitrary<UsageStats> = fc.record({
    inputTokens: fc.integer({ min: 1, max: 10000 }),
    outputTokens: fc.integer({ min: 1, max: 10000 }),
    totalCostUsd: fc.option(fc.float({ min: Math.fround(0.001), max: Math.fround(10), noNaN: true }), { nil: undefined }),
    durationMs: fc.option(fc.integer({ min: 100, max: 60000 }), { nil: undefined }),
  });

  it('对于任意成功的查询执行，会话应该包含用户消息和助手响应，且顺序正确', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 500 }), // 用户消息
        fc.string({ minLength: 1, maxLength: 1000 }), // 助手响应
        fc.option(arbUsageStats, { nil: undefined }), // 可选的 usage 统计
        async (userMessage, assistantResponse, usage) => {
          // 创建会话
          const session = await sessionManager.createSession('/test/project');

          // 模拟查询执行：先添加用户消息
          await sessionManager.addMessage(session, {
            role: 'user',
            content: userMessage,
          });

          // 然后添加助手响应（包含 usage 统计）
          await sessionManager.addMessage(session, {
            role: 'assistant',
            content: assistantResponse,
            usage: usage,
          });

          // 重新加载会话
          const loadedSession = await sessionManager.loadSession(session.id);

          // 验证会话包含两条消息
          expect(loadedSession).not.toBeNull();
          expect(loadedSession!.messages.length).toBe(2);

          // 验证消息顺序正确：用户消息在前，助手响应在后
          expect(loadedSession!.messages[0].role).toBe('user');
          expect(loadedSession!.messages[0].content).toBe(userMessage);

          expect(loadedSession!.messages[1].role).toBe('assistant');
          expect(loadedSession!.messages[1].content).toBe(assistantResponse);

          // 验证 usage 统计信息被正确保存
          if (usage) {
            expect(loadedSession!.messages[1].usage).toBeDefined();
            expect(loadedSession!.messages[1].usage!.inputTokens).toBe(usage.inputTokens);
            expect(loadedSession!.messages[1].usage!.outputTokens).toBe(usage.outputTokens);
            if (usage.totalCostUsd !== undefined) {
              expect(loadedSession!.messages[1].usage!.totalCostUsd).toBe(usage.totalCostUsd);
            }
            if (usage.durationMs !== undefined) {
              expect(loadedSession!.messages[1].usage!.durationMs).toBe(usage.durationMs);
            }
          } else {
            expect(loadedSession!.messages[1].usage).toBeUndefined();
          }

          // 清理
          await sessionManager.deleteSession(session.id);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('对于多轮对话，所有消息应该按正确顺序持久化', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 200 }), // 用户消息
            fc.string({ minLength: 1, maxLength: 500 }), // 助手响应
            fc.option(arbUsageStats, { nil: undefined }) // 可选的 usage 统计
          ),
          { minLength: 1, maxLength: 5 }
        ),
        async (conversations) => {
          // 创建会话
          const session = await sessionManager.createSession('/test/project');

          // 模拟多轮对话
          for (const [userMsg, assistantMsg, usage] of conversations) {
            await sessionManager.addMessage(session, {
              role: 'user',
              content: userMsg,
            });
            await sessionManager.addMessage(session, {
              role: 'assistant',
              content: assistantMsg,
              usage: usage,
            });
          }

          // 重新加载会话
          const loadedSession = await sessionManager.loadSession(session.id);

          // 验证消息数量正确（每轮对话 2 条消息）
          expect(loadedSession).not.toBeNull();
          expect(loadedSession!.messages.length).toBe(conversations.length * 2);

          // 验证每轮对话的消息顺序和内容
          for (let i = 0; i < conversations.length; i++) {
            const [userMsg, assistantMsg, usage] = conversations[i];
            const userIndex = i * 2;
            const assistantIndex = i * 2 + 1;

            // 验证用户消息
            expect(loadedSession!.messages[userIndex].role).toBe('user');
            expect(loadedSession!.messages[userIndex].content).toBe(userMsg);

            // 验证助手响应
            expect(loadedSession!.messages[assistantIndex].role).toBe('assistant');
            expect(loadedSession!.messages[assistantIndex].content).toBe(assistantMsg);

            // 验证 usage 统计
            if (usage) {
              expect(loadedSession!.messages[assistantIndex].usage).toBeDefined();
              expect(loadedSession!.messages[assistantIndex].usage!.inputTokens).toBe(usage.inputTokens);
              expect(loadedSession!.messages[assistantIndex].usage!.outputTokens).toBe(usage.outputTokens);
            }
          }

          // 清理
          await sessionManager.deleteSession(session.id);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('消息时间戳应该按添加顺序递增', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            role: fc.constantFrom('user', 'assistant') as fc.Arbitrary<'user' | 'assistant'>,
            content: fc.string({ minLength: 1, maxLength: 200 }),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        async (messages) => {
          // 创建会话
          const session = await sessionManager.createSession('/test/project');

          // 添加消息（每条消息之间稍微延迟以确保时间戳不同）
          for (const msg of messages) {
            await sessionManager.addMessage(session, msg);
            // 小延迟确保时间戳递增
            await new Promise(resolve => setTimeout(resolve, 1));
          }

          // 重新加载会话
          const loadedSession = await sessionManager.loadSession(session.id);

          expect(loadedSession).not.toBeNull();
          expect(loadedSession!.messages.length).toBe(messages.length);

          // 验证时间戳递增
          for (let i = 1; i < loadedSession!.messages.length; i++) {
            const prevTimestamp = loadedSession!.messages[i - 1].timestamp.getTime();
            const currTimestamp = loadedSession!.messages[i].timestamp.getTime();
            expect(currTimestamp).toBeGreaterThanOrEqual(prevTimestamp);
          }

          // 清理
          await sessionManager.deleteSession(session.id);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
