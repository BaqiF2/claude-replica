/**
 * 会话管理器测试
 *
 * 包含单元测试和属性测试
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SessionManager } from '../../src/core/SessionManager';

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
  it('对于任意会话，如果从创建时间起超过 5 小时，则该会话应该被标记为过期', async () => {
    // 会话过期时间为 5 小时
    const SESSION_EXPIRY_MS = 5 * 60 * 60 * 1000;

    await fc.assert(
      fc.asyncProperty(
        // 生成 0 到 10 小时之间的时间偏移（毫秒）
        fc.integer({ min: 0, max: 10 * 60 * 60 * 1000 }),
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

          // 验证过期状态（>= 5 小时为过期）
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

  it('超过 5 小时的会话应该被标记为过期', async () => {
    const session = await sessionManager.createSession('/test/project');

    // 将创建时间设置为 6 小时前
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    session.createdAt = sixHoursAgo;
    await sessionManager.saveSession(session);

    // 重新加载会话
    const loadedSession = await sessionManager.loadSession(session.id);

    expect(loadedSession!.expired).toBe(true);

    await sessionManager.deleteSession(session.id);
  });

  it('正好 5 小时的会话应该过期（边界情况）', async () => {
    const session = await sessionManager.createSession('/test/project');

    // 将创建时间设置为正好 5 小时前
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    session.createdAt = fiveHoursAgo;
    await sessionManager.saveSession(session);

    // 重新加载会话
    const loadedSession = await sessionManager.loadSession(session.id);

    // 正好 5 小时应该过期（>= 5 小时）
    expect(loadedSession!.expired).toBe(true);

    await sessionManager.deleteSession(session.id);
  });
});
