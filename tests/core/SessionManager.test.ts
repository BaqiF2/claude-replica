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

      const session = await sessionManager.createSession(
        workingDir,
        projectConfig
      );

      expect(session.context.projectConfig).toEqual(projectConfig);
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

      // 保存会话
      await sessionManager.saveSession(session);

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
      // 创建并保存多个会话
      const s1 = await sessionManager.createSession('/project1');
      await sessionManager.saveSession(s1);
      const s2 = await sessionManager.createSession('/project2');
      await sessionManager.saveSession(s2);
      const s3 = await sessionManager.createSession('/project3');
      await sessionManager.saveSession(s3);

      const sessions = await sessionManager.listSessions();

      expect(sessions.length).toBe(3);
    });

    it('应该按最后访问时间排序', async () => {
      const session1 = await sessionManager.createSession('/project1');
      await sessionManager.saveSession(session1);

      // 等待一小段时间确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 10));

      const session2 = await sessionManager.createSession('/project2');
      await sessionManager.saveSession(session2);

      // 等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 10));

      // 访问 session1 使其成为最近访问的，然后保存
      const loaded = await sessionManager.loadSession(session1.id);
      await sessionManager.saveSession(loaded!);

      const sessions = await sessionManager.listSessions();

      expect(sessions[0].id).toBe(session1.id);
      expect(sessions[1].id).toBe(session2.id);
    });
  });


  describe('listRecentSessions', () => {
    it('应该按创建时间倒序排列返回会话', async () => {
      // 创建并保存 3 个会话，每个之间间隔一小段时间
      const session1 = await sessionManager.createSession('/project1');
      await sessionManager.saveSession(session1);
      await new Promise(resolve => setTimeout(resolve, 10));

      const session2 = await sessionManager.createSession('/project2');
      await sessionManager.saveSession(session2);
      await new Promise(resolve => setTimeout(resolve, 10));

      const session3 = await sessionManager.createSession('/project3');
      await sessionManager.saveSession(session3);

      const recentSessions = await sessionManager.listRecentSessions();

      // 验证按创建时间倒序排列（最新的在前）
      expect(recentSessions.length).toBe(3);
      expect(recentSessions[0].id).toBe(session3.id);
      expect(recentSessions[1].id).toBe(session2.id);
      expect(recentSessions[2].id).toBe(session1.id);
    });

    it('会话数量超过限制时应该只返回指定数量', async () => {
      // 创建并保存 5 个会话
      const sessions = [];
      for (let i = 0; i < 5; i++) {
        const session = await sessionManager.createSession(`/project${i + 1}`);
        await sessionManager.saveSession(session);
        sessions.push(session);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // 限制为 3 个
      const recentSessions = await sessionManager.listRecentSessions(3);

      expect(recentSessions.length).toBe(3);
      // 应该返回最后创建的 3 个会话
      expect(recentSessions[0].id).toBe(sessions[4].id);
      expect(recentSessions[1].id).toBe(sessions[3].id);
      expect(recentSessions[2].id).toBe(sessions[2].id);
    });

    it('会话数量少于限制时应该返回所有会话', async () => {
      // 创建并保存 2 个会话
      const session1 = await sessionManager.createSession('/project1');
      await sessionManager.saveSession(session1);
      await new Promise(resolve => setTimeout(resolve, 10));
      const session2 = await sessionManager.createSession('/project2');
      await sessionManager.saveSession(session2);

      // 限制为 10 个
      const recentSessions = await sessionManager.listRecentSessions(10);

      expect(recentSessions.length).toBe(2);
      expect(recentSessions[0].id).toBe(session2.id);
      expect(recentSessions[1].id).toBe(session1.id);
    });

    it('空会话列表时应该返回空数组', async () => {
      const recentSessions = await sessionManager.listRecentSessions();

      expect(recentSessions).toEqual([]);
      expect(recentSessions.length).toBe(0);
    });

    it('默认限制应该为 10', async () => {
      // 创建并保存 12 个会话
      for (let i = 0; i < 12; i++) {
        const s = await sessionManager.createSession(`/project${i + 1}`);
        await sessionManager.saveSession(s);
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      // 使用默认限制
      const recentSessions = await sessionManager.listRecentSessions();

      expect(recentSessions.length).toBe(10);
    });

    it('limit 为 0 时应该返回空数组', async () => {
      const s1 = await sessionManager.createSession('/project1');
      await sessionManager.saveSession(s1);
      const s2 = await sessionManager.createSession('/project2');
      await sessionManager.saveSession(s2);

      const recentSessions = await sessionManager.listRecentSessions(0);

      expect(recentSessions).toEqual([]);
    });
  });

  describe('cleanOldSessions', () => {
    it('应该保留最近创建的 N 个会话，删除其余会话', async () => {
      // 创建并保存 5 个会话，每个之间间隔一小段时间
      const sessions = [];
      for (let i = 0; i < 5; i++) {
        const session = await sessionManager.createSession(`/project${i + 1}`);
        await sessionManager.saveSession(session);
        sessions.push(session);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // 保留最近 3 个会话
      await sessionManager.cleanOldSessions(3);

      // 验证只剩下 3 个会话
      const remainingSessions = await sessionManager.listSessions();
      expect(remainingSessions.length).toBe(3);

      // 验证保留的是最近创建的 3 个会话（按创建时间倒序）
      expect(remainingSessions[0].id).toBe(sessions[4].id);
      expect(remainingSessions[1].id).toBe(sessions[3].id);
      expect(remainingSessions[2].id).toBe(sessions[2].id);

      // 验证最早的两个会话被删除
      const deletedSession1 = await sessionManager.loadSession(sessions[0].id);
      const deletedSession2 = await sessionManager.loadSession(sessions[1].id);
      expect(deletedSession1).toBeNull();
      expect(deletedSession2).toBeNull();
    });

    it('会话数量少于保留数量时不应该删除任何会话', async () => {
      // 创建并保存 2 个会话
      const session1 = await sessionManager.createSession('/project1');
      await sessionManager.saveSession(session1);
      await new Promise(resolve => setTimeout(resolve, 10));
      const session2 = await sessionManager.createSession('/project2');
      await sessionManager.saveSession(session2);

      // 尝试保留 5 个会话（大于实际数量）
      await sessionManager.cleanOldSessions(5);

      // 验证所有会话都被保留
      const remainingSessions = await sessionManager.listSessions();
      expect(remainingSessions.length).toBe(2);
      expect(remainingSessions[0].id).toBe(session2.id);
      expect(remainingSessions[1].id).toBe(session1.id);
    });

    it('应该正确处理空会话列表场景', async () => {
      // 不创建任何会话，直接调用清理方法
      await sessionManager.cleanOldSessions(10);

      // 验证没有会话
      const sessions = await sessionManager.listSessions();
      expect(sessions.length).toBe(0);
    });

    it('keepCount 为 0 时应该删除所有会话', async () => {
      // 创建并保存 3 个会话
      const s1 = await sessionManager.createSession('/project1');
      await sessionManager.saveSession(s1);
      const s2 = await sessionManager.createSession('/project2');
      await sessionManager.saveSession(s2);
      const s3 = await sessionManager.createSession('/project3');
      await sessionManager.saveSession(s3);

      // 保留 0 个会话（删除所有）
      await sessionManager.cleanOldSessions(0);

      // 验证没有会话
      const sessions = await sessionManager.listSessions();
      expect(sessions.length).toBe(0);
    });

    it('默认保留数量应该为 10', async () => {
      // 创建并保存 15 个会话
      const sessions = [];
      for (let i = 0; i < 15; i++) {
        const session = await sessionManager.createSession(`/project${i + 1}`);
        await sessionManager.saveSession(session);
        sessions.push(session);
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      // 使用默认保留数量（不传参数）
      await sessionManager.cleanOldSessions();

      // 验证剩下 10 个会话
      const remainingSessions = await sessionManager.listSessions();
      expect(remainingSessions.length).toBe(10);

      // 验证保留的是最近创建的 10 个会话
      expect(remainingSessions[0].id).toBe(sessions[14].id);
      expect(remainingSessions[9].id).toBe(sessions[5].id);
    });

    it('应该验证会话按创建时间排序而不是按最后访问时间', async () => {
      // 创建并保存 3 个会话
      const session1 = await sessionManager.createSession('/project1');
      await sessionManager.saveSession(session1);
      await new Promise(resolve => setTimeout(resolve, 10));

      const session2 = await sessionManager.createSession('/project2');
      await sessionManager.saveSession(session2);
      await new Promise(resolve => setTimeout(resolve, 10));

      const session3 = await sessionManager.createSession('/project3');
      await sessionManager.saveSession(session3);

      // 访问 session1 使其成为最近访问的
      const loaded = await sessionManager.loadSession(session1.id);
      await sessionManager.saveSession(loaded!);

      // 保留 2 个会话
      await sessionManager.cleanOldSessions(2);

      // 验证保留的是最近创建的会话（session3 和 session2），而不是最近访问的（session1）
      const remainingSessions = await sessionManager.listSessions();
      expect(remainingSessions.length).toBe(2);
      expect(remainingSessions[0].id).toBe(session3.id);
      expect(remainingSessions[1].id).toBe(session2.id);

      // 验证最早创建的会话被删除（即使它最近被访问过）
      const deletedSession = await sessionManager.loadSession(session1.id);
      expect(deletedSession).toBeNull();
    });

    it('应该处理保留数量等于现有会话数量的场景', async () => {
      // 创建并保存 4 个会话
      const sessions = [];
      for (let i = 0; i < 4; i++) {
        const session = await sessionManager.createSession(`/project${i + 1}`);
        await sessionManager.saveSession(session);
        sessions.push(session);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // 保留 4 个会话（等于现有数量）
      await sessionManager.cleanOldSessions(4);

      // 验证所有会话都被保留
      const remainingSessions = await sessionManager.listSessions();
      expect(remainingSessions.length).toBe(4);
      expect(remainingSessions[0].id).toBe(sessions[3].id);
      expect(remainingSessions[3].id).toBe(sessions[0].id);
    });

    it('应该正确处理保留 1 个会话的场景', async () => {
      // 创建并保存 5 个会话
      const sessions = [];
      for (let i = 0; i < 5; i++) {
        const session = await sessionManager.createSession(`/project${i + 1}`);
        await sessionManager.saveSession(session);
        sessions.push(session);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // 只保留 1 个会话
      await sessionManager.cleanOldSessions(1);

      // 验证只剩下 1 个会话
      const remainingSessions = await sessionManager.listSessions();
      expect(remainingSessions.length).toBe(1);
      expect(remainingSessions[0].id).toBe(sessions[4].id); // 最新创建的会话
    });
  });

  describe('forkSession', () => {
    it('应该成功分叉现有会话并返回新会话', async () => {
      // 创建源会话
      const sourceSession = await sessionManager.createSession('/test/project');

      // 添加一些消息
      await sessionManager.addMessage(sourceSession, {
        role: 'user',
        content: '原始用户消息',
      });

      await sessionManager.addMessage(sourceSession, {
        role: 'assistant',
        content: '原始助手响应',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalCostUsd: 0.01,
        },
      });

      // 设置源会话的上下文和代理
      sourceSession.context.projectConfig = { model: 'claude-3-opus' };
      sourceSession.context.activeAgents = [{ name: 'test-agent', description: 'Test agent', prompt: 'Test prompt' }];

      // 保存源会话
      await sessionManager.saveSession(sourceSession);

      // 执行分叉
      const forkedSession = await sessionManager.forkSession(sourceSession.id);

      // 验证新会话的基本属性
      expect(forkedSession).toBeDefined();
      expect(forkedSession.id).not.toBe(sourceSession.id);
      expect(forkedSession.createdAt).toBeInstanceOf(Date);
      expect(forkedSession.workingDirectory).toBe(sourceSession.workingDirectory);

      // 验证父会话 ID 正确设置
      expect(forkedSession.parentSessionId).toBe(sourceSession.id);

      // 验证消息被正确复制
      expect(forkedSession.messages.length).toBe(2);
      expect(forkedSession.messages[0].content).toBe('原始用户消息');
      expect(forkedSession.messages[1].content).toBe('原始助手响应');
      expect(forkedSession.messages[1].usage?.inputTokens).toBe(100);
      expect(forkedSession.messages[1].usage?.outputTokens).toBe(50);
      expect(forkedSession.messages[1].usage?.totalCostUsd).toBe(0.01);

      // 验证上下文被正确复制
      expect(forkedSession.context.workingDirectory).toBe(sourceSession.context.workingDirectory);
      expect(forkedSession.context.projectConfig.model).toBe('claude-3-opus');
      expect(forkedSession.context.activeAgents.length).toBe(1);
      expect(forkedSession.context.activeAgents[0].name).toBe('test-agent');

      // 验证 sdkSessionId 未被复制
      expect(forkedSession.sdkSessionId).toBeUndefined();

      // 保存分叉会话以计算统计信息
      await sessionManager.saveSession(forkedSession);

      // 验证统计信息自动计算
      expect(forkedSession.stats).toBeDefined();
      expect(forkedSession.stats!.messageCount).toBe(2);
      expect(forkedSession.stats!.totalInputTokens).toBe(100);
      expect(forkedSession.stats!.totalOutputTokens).toBe(50);

      // 清理
      await sessionManager.deleteSession(sourceSession.id);
      await sessionManager.deleteSession(forkedSession.id);
    });

    it('应该对消息、上下文和统计信息进行深拷贝', async () => {
      const sourceSession = await sessionManager.createSession('/test/project');

      await sessionManager.addMessage(sourceSession, {
        role: 'assistant',
        content: '测试消息',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalCostUsd: 0.01,
        },
      });

      sourceSession.context.projectConfig = { model: 'claude-3-sonnet' };
      sourceSession.context.activeAgents = [{ name: 'agent1', description: 'Desc', prompt: 'Prompt', tools: ['tool1'] }];

      // 保存源会话
      await sessionManager.saveSession(sourceSession);

      const forkedSession = await sessionManager.forkSession(sourceSession.id);

      // 验证消息是深拷贝的（修改分叉会话不影响源会话）
      forkedSession.messages[0].content = '修改后的消息';
      forkedSession.context.projectConfig.model = 'claude-3-haiku';
      forkedSession.context.activeAgents[0].name = 'modified-agent';

      // 重新加载源会话验证未被修改
      const reloadedSource = await sessionManager.loadSession(sourceSession.id);

      expect(reloadedSource!.messages[0].content).toBe('测试消息');
      expect(reloadedSource!.context.projectConfig.model).toBe('claude-3-sonnet');
      expect(reloadedSource!.context.activeAgents[0].name).toBe('agent1');

      // 验证分叉会话被正确修改
      expect(forkedSession.messages[0].content).toBe('修改后的消息');
      expect(forkedSession.context.projectConfig.model).toBe('claude-3-haiku');
      expect(forkedSession.context.activeAgents[0].name).toBe('modified-agent');

      // 清理
      await sessionManager.deleteSession(sourceSession.id);
      await sessionManager.deleteSession(forkedSession.id);
    });

    it('应该验证父会话 ID 正确设置', async () => {
      const parentSession = await sessionManager.createSession('/test/parent');
      await sessionManager.saveSession(parentSession);
      const childSession = await sessionManager.forkSession(parentSession.id);
      await sessionManager.saveSession(childSession);

      // 验证 childSession 的 parentSessionId 指向父会话
      expect(childSession.parentSessionId).toBe(parentSession.id);

      // 再分叉一次创建孙子会话
      const grandchildSession = await sessionManager.forkSession(childSession.id);

      // 验证孙子会话的 parentSessionId 指向子会话
      expect(grandchildSession.parentSessionId).toBe(childSession.id);

      // 清理
      await sessionManager.deleteSession(parentSession.id);
      await sessionManager.deleteSession(childSession.id);
      await sessionManager.deleteSession(grandchildSession.id);
    });

    it('应该验证 sdkSessionId 未被复制', async () => {
      const sourceSession = await sessionManager.createSession('/test/project');

      // 手动设置 sdkSessionId
      sourceSession.sdkSessionId = 'sdk-session-12345';
      await sessionManager.saveSession(sourceSession);

      // 执行分叉
      const forkedSession = await sessionManager.forkSession(sourceSession.id);

      // 验证分叉会话没有 sdkSessionId
      expect(forkedSession.sdkSessionId).toBeUndefined();

      // 验证源会话的 sdkSessionId 保持不变
      const reloadedSource = await sessionManager.loadSession(sourceSession.id);
      expect(reloadedSource!.sdkSessionId).toBe('sdk-session-12345');

      // 清理
      await sessionManager.deleteSession(sourceSession.id);
      await sessionManager.deleteSession(forkedSession.id);
    });

    it('分叉不存在的会话应该抛出错误', async () => {
      await expect(
        sessionManager.forkSession('non-existent-session-id')
      ).rejects.toThrow('Source session not found: non-existent-session-id');
    });

    it('应该验证快照目录未被复制', async () => {
      const sourceSession = await sessionManager.createSession('/test/project');
      await sessionManager.saveSession(sourceSession);

      // 手动在源会话目录中创建快照文件
      const sourceSessionDir = path.join(sessionManager.getSessionsDir(), sourceSession.id);
      const snapshotsDir = path.join(sourceSessionDir, 'snapshots');
      await fs.mkdir(snapshotsDir, { recursive: true });
      await fs.writeFile(path.join(snapshotsDir, 'snapshot1.json'), '{"test": "data"}', 'utf-8');

      // 执行分叉
      const forkedSession = await sessionManager.forkSession(sourceSession.id);
      await sessionManager.saveSession(forkedSession);

      // 验证分叉会话的快照目录存在但为空
      const forkedSessionDir = path.join(sessionManager.getSessionsDir(), forkedSession.id);
      const forkedSnapshotsDir = path.join(forkedSessionDir, 'snapshots');

      // 快照目录应该存在（saveSession 会创建）
      expect(await fs.access(forkedSnapshotsDir).then(() => true).catch(() => false)).toBe(true);

      // 但应该是空的（没有从源会话复制快照文件）
      const forkedSnapshots = await fs.readdir(forkedSnapshotsDir);
      expect(forkedSnapshots.length).toBe(0);

      // 验证源会话的快照文件仍然存在
      const sourceSnapshots = await fs.readdir(snapshotsDir);
      expect(sourceSnapshots.length).toBe(1);
      expect(sourceSnapshots[0]).toBe('snapshot1.json');

      // 清理
      await sessionManager.deleteSession(sourceSession.id);
      await sessionManager.deleteSession(forkedSession.id);
    });

    it('应该处理包含复杂内容块的消息分叉', async () => {
      const sourceSession = await sessionManager.createSession('/test/project');

      await sessionManager.addMessage(sourceSession, {
        role: 'assistant',
        content: [
          { type: 'text', text: 'First text block' },
          { type: 'text', text: 'Second text block' },
          { type: 'tool_use', id: 'tool1', name: 'read_file', input: { path: '/test.txt' } },
          { type: 'tool_result', id: 'tool1', content: 'File content' },
        ],
      });

      // 保存源会话
      await sessionManager.saveSession(sourceSession);

      const forkedSession = await sessionManager.forkSession(sourceSession.id);

      // 验证内容块被正确复制
      expect(forkedSession.messages.length).toBe(1);
      expect(Array.isArray(forkedSession.messages[0].content)).toBe(true);

      const contentBlocks = forkedSession.messages[0].content as any[];
      expect(contentBlocks.length).toBe(4);
      expect(contentBlocks[0].type).toBe('text');
      expect(contentBlocks[0].text).toBe('First text block');
      expect(contentBlocks[2].type).toBe('tool_use');
      expect(contentBlocks[2].name).toBe('read_file');

      // 保存分叉会话以计算统计信息
      await sessionManager.saveSession(forkedSession);

      // 验证统计信息正确处理内容块
      expect(forkedSession.stats).toBeDefined();
      expect(forkedSession.stats!.lastMessagePreview).toBe('First text block');

      // 清理
      await sessionManager.deleteSession(sourceSession.id);
      await sessionManager.deleteSession(forkedSession.id);
    });

    it('分叉空会话（无消息）应该成功', async () => {
      const sourceSession = await sessionManager.createSession('/test/empty');
      await sessionManager.saveSession(sourceSession);

      const forkedSession = await sessionManager.forkSession(sourceSession.id);

      // 保存分叉会话以计算统计信息
      await sessionManager.saveSession(forkedSession);

      // 验证基本属性
      expect(forkedSession.parentSessionId).toBe(sourceSession.id);
      expect(forkedSession.messages.length).toBe(0);
      expect(forkedSession.stats?.messageCount).toBe(0);
      expect(forkedSession.stats?.totalInputTokens).toBe(0);
      expect(forkedSession.stats?.totalOutputTokens).toBe(0);
      expect(forkedSession.stats?.totalCostUsd).toBe(0);
      expect(forkedSession.stats?.lastMessagePreview).toBe('');

      // 清理
      await sessionManager.deleteSession(sourceSession.id);
      await sessionManager.deleteSession(forkedSession.id);
    });

    it('分叉会话后两个会话应该独立存在', async () => {
      const sourceSession = await sessionManager.createSession('/test/project');

      await sessionManager.addMessage(sourceSession, {
        role: 'user',
        content: '原始消息',
      });
      await sessionManager.saveSession(sourceSession);

      const forkedSession = await sessionManager.forkSession(sourceSession.id);

      // 在源会话中添加新消息
      await sessionManager.addMessage(sourceSession, {
        role: 'user',
        content: '源会话新消息',
      });
      await sessionManager.saveSession(sourceSession);

      // 在分叉会话中添加不同消息
      await sessionManager.addMessage(forkedSession, {
        role: 'user',
        content: '分叉会话新消息',
      });
      await sessionManager.saveSession(forkedSession);

      // 重新加载两个会话验证独立性
      const reloadedSource = await sessionManager.loadSession(sourceSession.id);
      const reloadedForked = await sessionManager.loadSession(forkedSession.id);

      // 源会话应该有 2 条消息
      expect(reloadedSource!.messages.length).toBe(2);
      expect(reloadedSource!.messages[1].content).toBe('源会话新消息');

      // 分叉会话应该有 2 条消息（原始消息 + 新消息）
      expect(reloadedForked!.messages.length).toBe(2);
      expect(reloadedForked!.messages[0].content).toBe('原始消息');
      expect(reloadedForked!.messages[1].content).toBe('分叉会话新消息');

      // 清理
      await sessionManager.deleteSession(sourceSession.id);
      await sessionManager.deleteSession(forkedSession.id);
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
            context.projectConfig
          );

          // 更新上下文
          session.context.activeAgents = context.activeAgents;

          // 添加消息
          for (const msg of messages) {
            await sessionManager.addMessage(session, msg);
          }

          // 保存会话
          await sessionManager.saveSession(session);

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

    // 保存会话
    await sessionManager.saveSession(session);

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

          // 保存会话
          await sessionManager.saveSession(session);

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

          // 保存会话
          await sessionManager.saveSession(session);

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

          // 保存会话
          await sessionManager.saveSession(session);

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

/**
 * 接口扩展测试
 *
 * 验证任务 3: 扩展 Session 接口和数据结构
 */
describe('接口扩展: Session 和 SessionMetadata', () => {
  describe('SessionStats 接口', () => {
    it('Session 接口应该支持 stats 字段', async () => {
      const session = await sessionManager.createSession('/test/project');

      // 添加 10 条消息以生成真实的 stats
      for (let i = 0; i < 10; i++) {
        await sessionManager.addMessage(session, {
          role: 'assistant',
          content: `Message ${i + 1}`,
          usage: {
            inputTokens: 100,
            outputTokens: 200,
            totalCostUsd: 0.005,
          },
        });
      }

      await sessionManager.saveSession(session);

      // 重新加载会话
      const loadedSession = await sessionManager.loadSession(session.id);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.stats).toBeDefined();
      expect(loadedSession!.stats!.messageCount).toBe(10);
      expect(loadedSession!.stats!.totalInputTokens).toBe(1000);
      expect(loadedSession!.stats!.totalOutputTokens).toBe(2000);
      expect(loadedSession!.stats!.totalCostUsd).toBeCloseTo(0.05, 5);
      expect(loadedSession!.stats!.lastMessagePreview).toBe('Message 10');

      await sessionManager.deleteSession(session.id);
    });

    it('Session 接口应该支持 parentSessionId 字段', async () => {
      const parentSession = await sessionManager.createSession('/test/parent');
      const childSession = await sessionManager.createSession('/test/child');

      // 设置 parentSessionId
      childSession.parentSessionId = parentSession.id;
      await sessionManager.saveSession(childSession);

      // 重新加载会话
      const loadedSession = await sessionManager.loadSession(childSession.id);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.parentSessionId).toBe(parentSession.id);

      await sessionManager.deleteSession(parentSession.id);
      await sessionManager.deleteSession(childSession.id);
    });

    it('SessionMetadata 应该正确序列化和反序列化 stats 和 parentSessionId', async () => {
      const session = await sessionManager.createSession('/test/project');

      // 添加 5 条消息以生成真实的 stats
      for (let i = 0; i < 5; i++) {
        await sessionManager.addMessage(session, {
          role: 'assistant',
          content: `Message ${i + 1}`,
          usage: {
            inputTokens: 100,
            outputTokens: 160,
            totalCostUsd: 0.004,
          },
        });
      }

      // 设置 parentSessionId
      session.parentSessionId = 'parent-session-123';

      await sessionManager.saveSession(session);

      // 直接读取 metadata.json 文件验证序列化
      const sessionDir = path.join(sessionManager.getSessionsDir(), session.id);
      const metadataContent = await fs.readFile(path.join(sessionDir, 'metadata.json'), 'utf-8');
      const metadata = JSON.parse(metadataContent);

      expect(metadata.stats).toBeDefined();
      expect(metadata.stats.messageCount).toBe(5);
      expect(metadata.stats.totalInputTokens).toBe(500);
      expect(metadata.stats.totalOutputTokens).toBe(800);
      expect(metadata.stats.totalCostUsd).toBeCloseTo(0.02, 5);
      expect(metadata.stats.lastMessagePreview).toBe('Message 5');
      expect(metadata.parentSessionId).toBe('parent-session-123');

      // 验证反序列化
      const loadedSession = await sessionManager.loadSession(session.id);
      expect(loadedSession!.stats).toBeDefined();
      expect(loadedSession!.stats!.messageCount).toBe(5);
      expect(loadedSession!.parentSessionId).toBe('parent-session-123');

      await sessionManager.deleteSession(session.id);
    });

    it('向后兼容性: 缺少 stats 和 parentSessionId 的旧会话应该能正常加载', async () => {
      const session = await sessionManager.createSession('/test/project');

      // 先保存会话（会自动生成 stats）
      await sessionManager.saveSession(session);

      // 手动修改 metadata.json 移除 stats 和 parentSessionId（模拟旧版本会话）
      const sessionDir = path.join(sessionManager.getSessionsDir(), session.id);
      const metadataPath = path.join(sessionDir, 'metadata.json');
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);

      delete metadata.stats;
      delete metadata.parentSessionId;

      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

      // 加载会话验证向后兼容性（缺少 stats 和 parentSessionId 的旧会话应该能正常加载）
      const loadedSession = await sessionManager.loadSession(session.id);

      expect(loadedSession).not.toBeNull();
      // 旧会话没有 stats 和 parentSessionId，加载后应该是 undefined
      expect(loadedSession!.stats).toBeUndefined();
      expect(loadedSession!.parentSessionId).toBeUndefined();

      await sessionManager.deleteSession(session.id);
    });
  });

  describe('属性测试: SessionStats 类型正确性', () => {
    const arbUsageStatsLocal: fc.Arbitrary<UsageStats> = fc.record({
      inputTokens: fc.integer({ min: 0, max: 10000 }),
      outputTokens: fc.integer({ min: 0, max: 10000 }),
      totalCostUsd: fc.option(fc.float({ min: Math.fround(0), max: Math.fround(10), noNaN: true }), { nil: undefined }),
      durationMs: fc.option(fc.integer({ min: 0, max: 60000 }), { nil: undefined }),
    });

    it('对于任意 SessionStats 对象，应该能正确保存和加载', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 200 }), // 消息内容
          fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }), // parentId
          fc.option(arbUsageStatsLocal, { nil: undefined }), // usage
          async (messageContent, parentId, usage) => {
            const session = await sessionManager.createSession('/test/project');

            // 添加真实消息以生成 stats
            if (messageContent) {
              await sessionManager.addMessage(session, {
                role: 'assistant',
                content: messageContent,
                usage: usage || undefined,
              });
            }

            if (parentId) {
              session.parentSessionId = parentId;
            }

            await sessionManager.saveSession(session);

            const loadedSession = await sessionManager.loadSession(session.id);

            expect(loadedSession).not.toBeNull();
            expect(loadedSession!.stats).toBeDefined();

            // 验证消息数量
            const expectedMessageCount = messageContent ? 1 : 0;
            expect(loadedSession!.stats!.messageCount).toBe(expectedMessageCount);

            // 验证 token 统计
            const expectedInputTokens = usage ? (usage.inputTokens || 0) : 0;
            const expectedOutputTokens = usage ? (usage.outputTokens || 0) : 0;
            const expectedCost = usage ? (usage.totalCostUsd || 0) : 0;

            expect(loadedSession!.stats!.totalInputTokens).toBe(expectedInputTokens);
            expect(loadedSession!.stats!.totalOutputTokens).toBe(expectedOutputTokens);
            expect(loadedSession!.stats!.totalCostUsd).toBeCloseTo(expectedCost, 5);

            // 验证预览
            const expectedPreview = messageContent ? messageContent.substring(0, 80) : '';
            expect(loadedSession!.stats!.lastMessagePreview).toBe(expectedPreview);

            if (parentId) {
              expect(loadedSession!.parentSessionId).toBe(parentId);
            }

            await sessionManager.deleteSession(session.id);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

/**
 * 统计计算测试
 *
 * 验证任务 5: 实现 calculateStats() 私有方法
 * 验证任务 6: 验证 calculateStats() 方法
 */
describe('统计计算: calculateStats() 方法', () => {
  describe('基本功能', () => {
    it('应该正确计算包含 usage 数据的会话统计信息', async () => {
      const session = await sessionManager.createSession('/test/project');

      // 添加用户消息（无 usage）
      await sessionManager.addMessage(session, {
        role: 'user',
        content: 'Hello',
      });

      // 添加助手消息（有 usage）
      await sessionManager.addMessage(session, {
        role: 'assistant',
        content: 'Hello! How can I help you?',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalCostUsd: 0.01,
        },
      });

      // 添加第二轮对话
      await sessionManager.addMessage(session, {
        role: 'user',
        content: 'What is the weather?',
      });

      await sessionManager.addMessage(session, {
        role: 'assistant',
        content: 'I am sorry, I cannot check the weather.',
        usage: {
          inputTokens: 200,
          outputTokens: 100,
          totalCostUsd: 0.02,
        },
      });

      // 保存会话后，stats 应该自动计算（通过 saveSession 内部调用 calculateStats）
      await sessionManager.saveSession(session);

      // 重新加载会话验证 stats 被正确保存
      const loadedSession = await sessionManager.loadSession(session.id);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.stats).toBeDefined();
      expect(loadedSession!.stats!.messageCount).toBe(4);
      expect(loadedSession!.stats!.totalInputTokens).toBe(300); // 100 + 200
      expect(loadedSession!.stats!.totalOutputTokens).toBe(150); // 50 + 100
      expect(loadedSession!.stats!.totalCostUsd).toBeCloseTo(0.03, 5); // 0.01 + 0.02
      expect(loadedSession!.stats!.lastMessagePreview).toBe('I am sorry, I cannot check the weather.');

      await sessionManager.deleteSession(session.id);
    });

    it('应该正确处理空消息列表的会话', async () => {
      const session = await sessionManager.createSession('/test/project');

      // 不添加任何消息，直接保存
      await sessionManager.saveSession(session);

      // 重新加载会话
      const loadedSession = await sessionManager.loadSession(session.id);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.stats).toBeDefined();
      expect(loadedSession!.stats!.messageCount).toBe(0);
      expect(loadedSession!.stats!.totalInputTokens).toBe(0);
      expect(loadedSession!.stats!.totalOutputTokens).toBe(0);
      expect(loadedSession!.stats!.totalCostUsd).toBe(0);
      expect(loadedSession!.stats!.lastMessagePreview).toBe('');

      await sessionManager.deleteSession(session.id);
    });

    it('应该正确处理缺少 usage 数据的消息', async () => {
      const session = await sessionManager.createSession('/test/project');

      // 添加没有 usage 的消息
      await sessionManager.addMessage(session, {
        role: 'user',
        content: 'User message without usage',
      });

      await sessionManager.addMessage(session, {
        role: 'assistant',
        content: 'Assistant message without usage',
      });

      await sessionManager.saveSession(session);

      // 重新加载会话
      const loadedSession = await sessionManager.loadSession(session.id);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.stats).toBeDefined();
      expect(loadedSession!.stats!.messageCount).toBe(2);
      expect(loadedSession!.stats!.totalInputTokens).toBe(0);
      expect(loadedSession!.stats!.totalOutputTokens).toBe(0);
      expect(loadedSession!.stats!.totalCostUsd).toBe(0);
      expect(loadedSession!.stats!.lastMessagePreview).toBe('Assistant message without usage');

      await sessionManager.deleteSession(session.id);
    });

    it('应该正确处理部分消息有 usage 数据的场景', async () => {
      const session = await sessionManager.createSession('/test/project');

      // 第一条消息有 usage
      await sessionManager.addMessage(session, {
        role: 'assistant',
        content: 'First message',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalCostUsd: 0.01,
        },
      });

      // 第二条消息没有 usage
      await sessionManager.addMessage(session, {
        role: 'user',
        content: 'Second message',
      });

      // 第三条消息有 usage
      await sessionManager.addMessage(session, {
        role: 'assistant',
        content: 'Third message',
        usage: {
          inputTokens: 200,
          outputTokens: 100,
          totalCostUsd: 0.02,
        },
      });

      await sessionManager.saveSession(session);

      // 重新加载会话
      const loadedSession = await sessionManager.loadSession(session.id);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.stats).toBeDefined();
      expect(loadedSession!.stats!.messageCount).toBe(3);
      expect(loadedSession!.stats!.totalInputTokens).toBe(300); // 100 + 200
      expect(loadedSession!.stats!.totalOutputTokens).toBe(150); // 50 + 100
      expect(loadedSession!.stats!.totalCostUsd).toBeCloseTo(0.03, 5);
      expect(loadedSession!.stats!.lastMessagePreview).toBe('Third message');

      await sessionManager.deleteSession(session.id);
    });
  });

  describe('消息预览功能', () => {
    it('应该截取最后一条消息的前 80 字符作为预览', async () => {
      const session = await sessionManager.createSession('/test/project');

      const longMessage = 'A'.repeat(150); // 创建一个超过 80 字符的消息
      await sessionManager.addMessage(session, {
        role: 'assistant',
        content: longMessage,
      });

      await sessionManager.saveSession(session);

      const loadedSession = await sessionManager.loadSession(session.id);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.stats).toBeDefined();
      expect(loadedSession!.stats!.lastMessagePreview).toBe('A'.repeat(80));
      expect(loadedSession!.stats!.lastMessagePreview.length).toBe(80);

      await sessionManager.deleteSession(session.id);
    });

    it('应该正确处理最后一条消息少于 80 字符的情况', async () => {
      const session = await sessionManager.createSession('/test/project');

      const shortMessage = 'Short message';
      await sessionManager.addMessage(session, {
        role: 'assistant',
        content: shortMessage,
      });

      await sessionManager.saveSession(session);

      const loadedSession = await sessionManager.loadSession(session.id);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.stats).toBeDefined();
      expect(loadedSession!.stats!.lastMessagePreview).toBe(shortMessage);

      await sessionManager.deleteSession(session.id);
    });

    it('应该正确处理包含 ContentBlock 数组的消息', async () => {
      const session = await sessionManager.createSession('/test/project');

      await sessionManager.addMessage(session, {
        role: 'assistant',
        content: [
          { type: 'text', text: 'This is a text block in content array' },
          { type: 'tool_use', id: 'tool1', name: 'some_tool' },
        ],
      });

      await sessionManager.saveSession(session);

      const loadedSession = await sessionManager.loadSession(session.id);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.stats).toBeDefined();
      expect(loadedSession!.stats!.lastMessagePreview).toBe('This is a text block in content array');

      await sessionManager.deleteSession(session.id);
    });

    it('应该处理没有文本内容的 ContentBlock 数组', async () => {
      const session = await sessionManager.createSession('/test/project');

      await sessionManager.addMessage(session, {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tool1', name: 'some_tool' },
          { type: 'image', source: 'image_data' },
        ],
      });

      await sessionManager.saveSession(session);

      const loadedSession = await sessionManager.loadSession(session.id);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.stats).toBeDefined();
      expect(loadedSession!.stats!.lastMessagePreview).toBe('');

      await sessionManager.deleteSession(session.id);
    });
  });

  describe('Usage 统计计算', () => {
    it('应该正确累加所有 usage 字段', async () => {
      const session = await sessionManager.createSession('/test/project');

      await sessionManager.addMessage(session, {
        role: 'assistant',
        content: 'Message 1',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalCostUsd: 0.01,
          durationMs: 1000,
        },
      });

      await sessionManager.addMessage(session, {
        role: 'assistant',
        content: 'Message 2',
        usage: {
          inputTokens: 200,
          outputTokens: 100,
          totalCostUsd: 0.02,
          durationMs: 2000,
        },
      });

      await sessionManager.addMessage(session, {
        role: 'assistant',
        content: 'Message 3',
        usage: {
          inputTokens: 300,
          outputTokens: 150,
          totalCostUsd: 0.03,
          durationMs: 3000,
        },
      });

      await sessionManager.saveSession(session);

      const loadedSession = await sessionManager.loadSession(session.id);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.stats).toBeDefined();
      expect(loadedSession!.stats!.totalInputTokens).toBe(600); // 100 + 200 + 300
      expect(loadedSession!.stats!.totalOutputTokens).toBe(300); // 50 + 100 + 150
      expect(loadedSession!.stats!.totalCostUsd).toBeCloseTo(0.06, 5); // 0.01 + 0.02 + 0.03

      await sessionManager.deleteSession(session.id);
    });

    it('应该正确处理 usage 中的 undefined 字段', async () => {
      const session = await sessionManager.createSession('/test/project');

      await sessionManager.addMessage(session, {
        role: 'assistant',
        content: 'Message with partial usage',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          // totalCostUsd 和 durationMs 未定义
        },
      });

      await sessionManager.saveSession(session);

      const loadedSession = await sessionManager.loadSession(session.id);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.stats).toBeDefined();
      expect(loadedSession!.stats!.totalInputTokens).toBe(100);
      expect(loadedSession!.stats!.totalOutputTokens).toBe(50);
      expect(loadedSession!.stats!.totalCostUsd).toBe(0); // undefined 视为 0

      await sessionManager.deleteSession(session.id);
    });
  });

  describe('属性测试: calculateStats 正确性', () => {
    const arbUsageStats: fc.Arbitrary<UsageStats> = fc.record({
      inputTokens: fc.integer({ min: 0, max: 10000 }),
      outputTokens: fc.integer({ min: 0, max: 10000 }),
      totalCostUsd: fc.option(fc.float({ min: Math.fround(0), max: Math.fround(10), noNaN: true }), { nil: undefined }),
      durationMs: fc.option(fc.integer({ min: 0, max: 60000 }), { nil: undefined }),
    });

    it('对于任意消息序列，统计信息应该正确累加', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(
              fc.string({ minLength: 1, maxLength: 200 }),
              fc.option(arbUsageStats, { nil: undefined })
            ),
            { minLength: 1, maxLength: 20 }
          ),
          async (messages) => {
            const session = await sessionManager.createSession('/test/project');

            let expectedInputTokens = 0;
            let expectedOutputTokens = 0;
            let expectedCost = 0;

            for (const [content, usage] of messages) {
              await sessionManager.addMessage(session, {
                role: 'assistant',
                content,
                usage,
              });

              if (usage) {
                expectedInputTokens += usage.inputTokens || 0;
                expectedOutputTokens += usage.outputTokens || 0;
                expectedCost += usage.totalCostUsd || 0;
              }
            }

            await sessionManager.saveSession(session);

            const loadedSession = await sessionManager.loadSession(session.id);

            expect(loadedSession).not.toBeNull();
            expect(loadedSession!.stats).toBeDefined();
            expect(loadedSession!.stats!.messageCount).toBe(messages.length);
            expect(loadedSession!.stats!.totalInputTokens).toBe(expectedInputTokens);
            expect(loadedSession!.stats!.totalOutputTokens).toBe(expectedOutputTokens);
            expect(loadedSession!.stats!.totalCostUsd).toBeCloseTo(expectedCost, 5);

            // 验证最后一条消息预览
            const lastContent = messages[messages.length - 1][0];
            const expectedPreview = lastContent.substring(0, 80);
            expect(loadedSession!.stats!.lastMessagePreview).toBe(expectedPreview);

            await sessionManager.deleteSession(session.id);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
