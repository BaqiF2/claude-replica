/**
 * 会话管理属性测试
 *
 * 使用 fast-check 进行属性测试，验证会话管理的正确性
 *
 * **Property 15: Session Persistence Round-Trip**
 * **Property 16: Non-Existent Session Error**
 * **Validates: Requirements 6.1, 6.3, 6.4, 6.5**
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SessionManager, Session } from '../../src/core/SessionManager';

describe('Session Property Tests', () => {
  // 临时会话目录
  let tempSessionsDir: string;
  let sessionManager: SessionManager;

  beforeEach(async () => {
    // 创建临时会话目录
    tempSessionsDir = path.join(os.tmpdir(), `claude-replica-prop-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempSessionsDir, { recursive: true });
    sessionManager = new SessionManager(tempSessionsDir);
  });

  afterEach(async () => {
    // 清理临时目录
    try {
      await fs.rm(tempSessionsDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  /**
   * Property 15: Session Persistence Round-Trip
   *
   * *For any* session created during a test, the session file should exist on disk,
   * and loading that session should restore the same conversation history.
   *
   * **Validates: Requirements 6.1, 6.3, 6.4**
   */
  describe('Property 15: Session Persistence Round-Trip', () => {
    // 生成有效的消息角色
    const roleArb = fc.constantFrom<'user' | 'assistant'>('user', 'assistant');

    // 生成消息内容（避免特殊字符导致 JSON 解析问题）
    const contentArb = fc.string({ minLength: 1, maxLength: 500 })
      .filter(s => s.trim().length > 0)
      .map(s => s.replace(/[\x00-\x1f]/g, '')); // 移除控制字符

    // 生成消息
    const messageArb = fc.record({
      role: roleArb,
      content: contentArb,
    });

    // 生成消息列表
    const messagesArb = fc.array(messageArb, { minLength: 0, maxLength: 10 });

    it('创建的会话应该能够被持久化并正确加载', async () => {
      await fc.assert(
        fc.asyncProperty(messagesArb, async (messages) => {
          // 创建会话
          const session = await sessionManager.createSession(process.cwd());

          // 添加消息
          for (const msg of messages) {
            await sessionManager.addMessage(session, msg);
          }

          // 重新加载会话
          const loadedSession = await sessionManager.loadSession(session.id);

          // 验证会话存在
          expect(loadedSession).not.toBeNull();

          // 验证会话 ID 相同
          expect(loadedSession!.id).toBe(session.id);

          // 验证消息数量相同
          expect(loadedSession!.messages.length).toBe(messages.length);

          // 验证每条消息的内容和角色
          for (let i = 0; i < messages.length; i++) {
            expect(loadedSession!.messages[i].role).toBe(messages[i].role);
            expect(loadedSession!.messages[i].content).toBe(messages[i].content);
          }
        }),
        { numRuns: 20 }
      );
    });

    it('会话元数据应该在持久化后保持一致', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          const workingDir = process.cwd();

          // 创建会话
          const session = await sessionManager.createSession(workingDir);
          const originalCreatedAt = session.createdAt.getTime();
          const originalId = session.id;

          // 重新加载会话
          const loadedSession = await sessionManager.loadSession(session.id);

          // 验证元数据
          expect(loadedSession).not.toBeNull();
          expect(loadedSession!.id).toBe(originalId);
          expect(loadedSession!.createdAt.getTime()).toBe(originalCreatedAt);
          expect(loadedSession!.workingDirectory).toBe(workingDir);
          expect(loadedSession!.expired).toBe(false);
        }),
        { numRuns: 10 }
      );
    });

    it('会话文件应该在磁盘上存在', async () => {
      await fc.assert(
        fc.asyncProperty(messagesArb, async (messages) => {
          // 创建会话
          const session = await sessionManager.createSession(process.cwd());

          // 添加消息
          for (const msg of messages) {
            await sessionManager.addMessage(session, msg);
          }

          // 验证会话目录存在
          const sessionDir = path.join(tempSessionsDir, session.id);
          const dirExists = await fs.access(sessionDir).then(() => true).catch(() => false);
          expect(dirExists).toBe(true);

          // 验证元数据文件存在
          const metadataPath = path.join(sessionDir, 'metadata.json');
          const metadataExists = await fs.access(metadataPath).then(() => true).catch(() => false);
          expect(metadataExists).toBe(true);

          // 验证消息文件存在
          const messagesPath = path.join(sessionDir, 'messages.json');
          const messagesExists = await fs.access(messagesPath).then(() => true).catch(() => false);
          expect(messagesExists).toBe(true);
        }),
        { numRuns: 15 }
      );
    });

    it('多个会话应该独立持久化', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(messagesArb, { minLength: 2, maxLength: 5 }),
          async (sessionMessages) => {
            const sessions: Session[] = [];

            // 创建多个会话
            for (const messages of sessionMessages) {
              const session = await sessionManager.createSession(process.cwd());
              for (const msg of messages) {
                await sessionManager.addMessage(session, msg);
              }
              sessions.push(session);
            }

            // 验证每个会话都能独立加载
            for (let i = 0; i < sessions.length; i++) {
              const loadedSession = await sessionManager.loadSession(sessions[i].id);
              expect(loadedSession).not.toBeNull();
              expect(loadedSession!.messages.length).toBe(sessionMessages[i].length);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it('会话消息顺序应该在持久化后保持一致', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(messageArb, { minLength: 2, maxLength: 20 }),
          async (messages) => {
            // 创建会话
            const session = await sessionManager.createSession(process.cwd());

            // 按顺序添加消息
            for (const msg of messages) {
              await sessionManager.addMessage(session, msg);
            }

            // 重新加载会话
            const loadedSession = await sessionManager.loadSession(session.id);

            // 验证消息顺序
            expect(loadedSession).not.toBeNull();
            for (let i = 0; i < messages.length; i++) {
              expect(loadedSession!.messages[i].role).toBe(messages[i].role);
              expect(loadedSession!.messages[i].content).toBe(messages[i].content);
            }
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  /**
   * Property 16: Non-Existent Session Error
   *
   * *For any* session ID that does not exist, attempting to resume it
   * should result in an appropriate error (return null).
   *
   * **Validates: Requirements 6.5**
   */
  describe('Property 16: Non-Existent Session Error', () => {
    // 生成随机的会话 ID（不存在的）
    const nonExistentSessionIdArb = fc.string({ minLength: 10, maxLength: 50 })
      .filter(s => /^[a-zA-Z0-9-_]+$/.test(s))
      .map(s => `session-nonexistent-${s}`);

    it('加载不存在的会话应该返回 null', async () => {
      await fc.assert(
        fc.asyncProperty(nonExistentSessionIdArb, async (sessionId) => {
          const loadedSession = await sessionManager.loadSession(sessionId);
          expect(loadedSession).toBeNull();
        }),
        { numRuns: 50 }
      );
    });

    it('删除不存在的会话不应该抛出错误', async () => {
      await fc.assert(
        fc.asyncProperty(nonExistentSessionIdArb, async (sessionId) => {
          // 这不应该抛出错误
          await expect(sessionManager.deleteSession(sessionId)).resolves.not.toThrow();
        }),
        { numRuns: 30 }
      );
    });

    it('空字符串会话 ID 应该返回 null', async () => {
      const loadedSession = await sessionManager.loadSession('');
      expect(loadedSession).toBeNull();
    });

    it('特殊字符会话 ID 应该返回 null', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /[^a-zA-Z0-9-_]/.test(s)), // 包含特殊字符
          async (sessionId) => {
            const loadedSession = await sessionManager.loadSession(sessionId);
            expect(loadedSession).toBeNull();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('已删除的会话应该返回 null', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          // 创建会话
          const session = await sessionManager.createSession(process.cwd());
          const sessionId = session.id;

          // 验证会话存在
          const existingSession = await sessionManager.loadSession(sessionId);
          expect(existingSession).not.toBeNull();

          // 删除会话
          await sessionManager.deleteSession(sessionId);

          // 验证会话不再存在
          const deletedSession = await sessionManager.loadSession(sessionId);
          expect(deletedSession).toBeNull();
        }),
        { numRuns: 10 }
      );
    });
  });

  /**
   * 会话列表属性测试
   *
   * **Validates: Requirements 6.1**
   */
  describe('Session List Properties', () => {
    it('listSessions 应该返回所有创建的会话', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          async (count) => {
            const createdIds: string[] = [];

            // 创建多个会话
            for (let i = 0; i < count; i++) {
              const session = await sessionManager.createSession(process.cwd());
              createdIds.push(session.id);
            }

            // 列出所有会话
            const sessions = await sessionManager.listSessions();

            // 验证所有创建的会话都在列表中
            for (const id of createdIds) {
              expect(sessions.some(s => s.id === id)).toBe(true);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it('会话列表应该按最后访问时间排序', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          async (count) => {
            const sessions: Session[] = [];

            // 创建多个会话
            for (let i = 0; i < count; i++) {
              const session = await sessionManager.createSession(process.cwd());
              sessions.push(session);
              // 添加小延迟以确保时间戳不同
              await new Promise(resolve => setTimeout(resolve, 50));
            }

            // 列出所有会话
            const listedSessions = await sessionManager.listSessions();

            // 验证按最后访问时间降序排序
            for (let i = 1; i < listedSessions.length; i++) {
              expect(listedSessions[i - 1].lastAccessedAt.getTime())
                .toBeGreaterThanOrEqual(listedSessions[i].lastAccessedAt.getTime());
            }
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  /**
   * 会话过期属性测试
   *
   * **Validates: Requirements 6.1, 6.2**
   */
  describe('Session Expiration Properties', () => {
    it('标记为过期的会话不应该被 getRecentSession 返回', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (count) => {
            // 创建多个会话并全部标记为过期
            for (let i = 0; i < count; i++) {
              const session = await sessionManager.createSession(process.cwd());
              await sessionManager.markExpired(session);
            }

            // 获取最近会话
            const recentSession = await sessionManager.getRecentSession();

            // 应该返回 null（没有活跃会话）
            expect(recentSession).toBeNull();
          }
        ),
        { numRuns: 10 }
      );
    });

    it('过期状态应该在持久化后保持', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          // 创建会话
          const session = await sessionManager.createSession(process.cwd());

          // 标记为过期
          await sessionManager.markExpired(session);

          // 重新加载会话
          const loadedSession = await sessionManager.loadSession(session.id);

          // 验证过期状态
          expect(loadedSession).not.toBeNull();
          expect(loadedSession!.expired).toBe(true);
        }),
        { numRuns: 10 }
      );
    });
  });
});
