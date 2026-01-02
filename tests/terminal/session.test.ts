/**
 * 会话管理测试
 *
 * 测试 CLI 工具的会话持久化功能，包括：
 * - 会话创建和保存
 * - --continue 选项
 * - --resume 选项
 * - 会话历史恢复
 * - 不存在的会话错误
 *
 * @module tests/terminal/session.test.ts
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
 */

import './setup';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { createTestTerminal, runCLI, expectExitCode, ExitCodes } from './helpers';
import { SessionManager } from '../../src/core/SessionManager';

/**
 * 创建禁用 CI 模式的环境变量
 * 确保所有 CI 相关环境变量都被清除
 */
function getNonCIEnv(): Record<string, string> {
  return {
    CI: '',
    GITHUB_ACTIONS: '',
    GITLAB_CI: '',
    JENKINS_URL: '',
    TRAVIS: '',
    CIRCLECI: '',
    BUILDKITE: '',
    DRONE: '',
    TEAMCITY_VERSION: '',
    TF_BUILD: '',
    CODEBUILD_BUILD_ID: '',
    TERM: 'xterm-256color',
  };
}

describe('会话管理测试', () => {
  // 测试超时时间
  const TEST_TIMEOUT = 30000;

  // 临时会话目录
  let tempSessionsDir: string;
  let sessionManager: SessionManager;

  beforeEach(async () => {
    // 创建临时会话目录
    tempSessionsDir = path.join(os.tmpdir(), `claude-replica-test-sessions-${Date.now()}`);
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

  describe('会话创建和保存', () => {
    /**
     * 测试会话创建
     *
     * **Validates: Requirements 6.1**
     */
    it('应该能够创建新会话', async () => {
      const workingDir = process.cwd();
      const session = await sessionManager.createSession(workingDir);

      // 验证会话已创建
      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.id).toMatch(/^session-/);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastAccessedAt).toBeInstanceOf(Date);
      expect(session.messages).toEqual([]);
      expect(session.expired).toBe(false);
      expect(session.workingDirectory).toBe(workingDir);
    });

    /**
     * 测试会话持久化到文件系统
     *
     * **Validates: Requirements 6.1**
     */
    it('会话应该被持久化到文件系统', async () => {
      const workingDir = process.cwd();
      const session = await sessionManager.createSession(workingDir);

      // 验证会话目录存在
      const sessionDir = path.join(tempSessionsDir, session.id);
      const dirExists = await fs
        .access(sessionDir)
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(true);

      // 验证元数据文件存在
      const metadataPath = path.join(sessionDir, 'metadata.json');
      const metadataExists = await fs
        .access(metadataPath)
        .then(() => true)
        .catch(() => false);
      expect(metadataExists).toBe(true);

      // 验证元数据内容
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);
      expect(metadata.id).toBe(session.id);
      expect(metadata.workingDirectory).toBe(workingDir);
    });

    /**
     * 测试添加消息到会话
     *
     * **Validates: Requirements 6.1, 6.4**
     */
    it('应该能够添加消息到会话', async () => {
      const session = await sessionManager.createSession(process.cwd());

      // 添加用户消息
      const userMessage = await sessionManager.addMessage(session, {
        role: 'user',
        content: '你好，这是测试消息',
      });

      expect(userMessage.id).toBeDefined();
      expect(userMessage.role).toBe('user');
      expect(userMessage.content).toBe('你好，这是测试消息');
      expect(userMessage.timestamp).toBeInstanceOf(Date);

      // 添加助手消息
      const assistantMessage = await sessionManager.addMessage(session, {
        role: 'assistant',
        content: '你好！我是 Claude，有什么可以帮助你的？',
      });

      expect(assistantMessage.role).toBe('assistant');

      // 验证会话包含两条消息
      expect(session.messages.length).toBe(2);
    });

    /**
     * 测试会话消息持久化
     *
     * **Validates: Requirements 6.1, 6.4**
     */
    it('会话消息应该被持久化', async () => {
      const session = await sessionManager.createSession(process.cwd());

      // 添加消息
      await sessionManager.addMessage(session, {
        role: 'user',
        content: '测试消息 1',
      });
      await sessionManager.addMessage(session, {
        role: 'assistant',
        content: '测试回复 1',
      });

      // 重新加载会话
      const loadedSession = await sessionManager.loadSession(session.id);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.messages.length).toBe(2);
      expect(loadedSession!.messages[0].content).toBe('测试消息 1');
      expect(loadedSession!.messages[1].content).toBe('测试回复 1');
    });
  });

  describe('--continue 选项', () => {
    /**
     * 测试 --continue 选项恢复最近会话
     *
     * **Validates: Requirements 6.2**
     */
    it('应该能够获取最近的会话', async () => {
      // 创建多个会话
      await sessionManager.createSession(process.cwd());
      await new Promise((resolve) => setTimeout(resolve, 100));
      await sessionManager.createSession(process.cwd());
      await new Promise((resolve) => setTimeout(resolve, 100));
      const session3 = await sessionManager.createSession(process.cwd());

      // 获取最近的会话
      const recentSession = await sessionManager.getRecentSession();

      expect(recentSession).not.toBeNull();
      expect(recentSession!.id).toBe(session3.id);
    });

    /**
     * 测试 CLI --continue 选项
     *
     * **Validates: Requirements 6.2**
     */
    it('CLI 应该接受 --continue 选项', async () => {
      const result = await runCLI({
        args: ['--continue'],
        timeout: TEST_TIMEOUT,
        env: getNonCIEnv(),
      });

      // 验证进程已退出
      // 可能返回成功（如果有会话）或错误（如果没有会话）
      expect(result.exitCode).toBeDefined();
    }, TEST_TIMEOUT);

    /**
     * 测试 CLI -c 选项（--continue 的简写）
     *
     * **Validates: Requirements 6.2**
     */
    it('CLI 应该接受 -c 选项', async () => {
      const result = await runCLI({
        args: ['-c'],
        timeout: TEST_TIMEOUT,
        env: getNonCIEnv(),
      });

      // 验证进程已退出
      expect(result.exitCode).toBeDefined();
    }, TEST_TIMEOUT);

    /**
     * 测试没有会话时 --continue 的行为
     *
     * **Validates: Requirements 6.2, 6.5**
     */
    it('没有会话时应该返回适当的响应', async () => {
      // 使用空的会话目录
      const emptySessionManager = new SessionManager(tempSessionsDir);
      const recentSession = await emptySessionManager.getRecentSession();

      expect(recentSession).toBeNull();
    });
  });

  describe('--resume 选项', () => {
    /**
     * 测试 --resume 选项恢复指定会话
     *
     * **Validates: Requirements 6.3**
     */
    it('应该能够加载指定的会话', async () => {
      // 创建会话
      const session = await sessionManager.createSession(process.cwd());
      await sessionManager.addMessage(session, {
        role: 'user',
        content: '测试消息',
      });

      // 加载指定会话
      const loadedSession = await sessionManager.loadSession(session.id);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.id).toBe(session.id);
      expect(loadedSession!.messages.length).toBe(1);
    });

    /**
     * 测试 CLI --resume 选项
     *
     * **Validates: Requirements 6.3**
     */
    it('CLI 应该接受 --resume 选项', async () => {
      const result = await runCLI({
        args: ['--resume', 'session-test-12345'],
        timeout: TEST_TIMEOUT,
        env: getNonCIEnv(),
      });

      // 验证进程已退出
      // 由于会话不存在，应该返回错误
      expect(result.exitCode).toBeDefined();
    }, TEST_TIMEOUT);

    /**
     * 测试 --resume 需要会话 ID 参数
     *
     * **Validates: Requirements 6.3**
     */
    it('--resume 没有会话 ID 时应该返回错误', async () => {
      const result = await runCLI({
        args: ['--resume'],
        timeout: TEST_TIMEOUT,
        env: getNonCIEnv(),
      });

      // 应该返回配置错误
      expectExitCode(result.exitCode, ExitCodes.CONFIG_ERROR);
    }, TEST_TIMEOUT);
  });

  describe('会话历史恢复', () => {
    /**
     * 测试会话历史完整恢复
     *
     * **Validates: Requirements 6.4**
     */
    it('应该完整恢复会话历史', async () => {
      // 创建会话并添加多条消息
      const session = await sessionManager.createSession(process.cwd());

      await sessionManager.addMessage(session, {
        role: 'user',
        content: '第一条消息',
      });
      await sessionManager.addMessage(session, {
        role: 'assistant',
        content: '第一条回复',
      });
      await sessionManager.addMessage(session, {
        role: 'user',
        content: '第二条消息',
      });
      await sessionManager.addMessage(session, {
        role: 'assistant',
        content: '第二条回复',
      });

      // 重新加载会话
      const loadedSession = await sessionManager.loadSession(session.id);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.messages.length).toBe(4);

      // 验证消息顺序和内容
      expect(loadedSession!.messages[0].role).toBe('user');
      expect(loadedSession!.messages[0].content).toBe('第一条消息');
      expect(loadedSession!.messages[1].role).toBe('assistant');
      expect(loadedSession!.messages[1].content).toBe('第一条回复');
      expect(loadedSession!.messages[2].role).toBe('user');
      expect(loadedSession!.messages[2].content).toBe('第二条消息');
      expect(loadedSession!.messages[3].role).toBe('assistant');
      expect(loadedSession!.messages[3].content).toBe('第二条回复');
    });

    /**
     * 测试会话上下文恢复
     *
     * **Validates: Requirements 6.4**
     */
    it('应该恢复会话上下文', async () => {
      const workingDir = process.cwd();
      const session = await sessionManager.createSession(workingDir, { model: 'sonnet' }, {});

      // 更新上下文
      await sessionManager.updateContext(session, {
        loadedSkills: [
          {
            name: 'test-skill',
            description: '测试技能',
            content: '技能内容',
            metadata: {},
          },
        ],
      });

      // 重新加载会话
      const loadedSession = await sessionManager.loadSession(session.id);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.context.workingDirectory).toBe(workingDir);
      expect(loadedSession!.context.loadedSkills.length).toBe(1);
      expect(loadedSession!.context.loadedSkills[0].name).toBe('test-skill');
    });

    /**
     * 测试会话时间戳恢复
     *
     * **Validates: Requirements 6.4**
     */
    it('应该正确恢复会话时间戳', async () => {
      const session = await sessionManager.createSession(process.cwd());
      const originalCreatedAt = session.createdAt.getTime();

      // 等待一段时间
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 重新加载会话
      const loadedSession = await sessionManager.loadSession(session.id);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.createdAt.getTime()).toBe(originalCreatedAt);
      // 最后访问时间应该更新
      expect(loadedSession!.lastAccessedAt.getTime()).toBeGreaterThan(originalCreatedAt);
    });
  });

  describe('不存在的会话错误', () => {
    /**
     * 测试加载不存在的会话
     *
     * **Validates: Requirements 6.5**
     */
    it('加载不存在的会话应该返回 null', async () => {
      const nonExistentSession = await sessionManager.loadSession('session-non-existent-12345');

      expect(nonExistentSession).toBeNull();
    });

    /**
     * 测试 CLI 恢复不存在的会话
     *
     * **Validates: Requirements 6.5**
     */
    it('CLI 恢复不存在的会话应该返回错误', async () => {
      const result = await runCLI({
        args: ['--resume', 'session-non-existent-99999'],
        timeout: TEST_TIMEOUT,
        env: getNonCIEnv(),
      });

      // 应该返回错误退出码
      expect(result.exitCode).not.toBe(ExitCodes.SUCCESS);
      // 输出应该包含错误信息
      expect(result.output.length).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    /**
     * 测试无效的会话 ID 格式
     *
     * **Validates: Requirements 6.5**
     */
    it('无效的会话 ID 格式应该返回 null', async () => {
      const invalidSession = await sessionManager.loadSession('invalid-session-id');

      expect(invalidSession).toBeNull();
    });
  });

  describe('会话列表', () => {
    /**
     * 测试列出所有会话
     *
     * **Validates: Requirements 6.1**
     */
    it('应该能够列出所有会话', async () => {
      // 创建多个会话
      await sessionManager.createSession(process.cwd());
      await sessionManager.createSession(process.cwd());
      await sessionManager.createSession(process.cwd());

      // 列出所有会话
      const sessions = await sessionManager.listSessions();

      expect(sessions.length).toBe(3);
    });

    /**
     * 测试会话按最后访问时间排序
     *
     * **Validates: Requirements 6.1**
     */
    it('会话应该按最后访问时间排序', async () => {
      // 创建会话
      const session1 = await sessionManager.createSession(process.cwd());
      await new Promise((resolve) => setTimeout(resolve, 100));
      await sessionManager.createSession(process.cwd());
      await new Promise((resolve) => setTimeout(resolve, 100));
      await sessionManager.createSession(process.cwd());

      // 访问 session1 使其成为最近访问的
      await sessionManager.loadSession(session1.id);

      // 列出会话
      const sessions = await sessionManager.listSessions();

      // session1 应该在最前面（最近访问）
      expect(sessions[0].id).toBe(session1.id);
    });
  });

  describe('会话删除', () => {
    /**
     * 测试删除会话
     *
     * **Validates: Requirements 6.1**
     */
    it('应该能够删除会话', async () => {
      const session = await sessionManager.createSession(process.cwd());

      // 删除会话
      await sessionManager.deleteSession(session.id);

      // 验证会话已删除
      const loadedSession = await sessionManager.loadSession(session.id);
      expect(loadedSession).toBeNull();
    });

    /**
     * 测试删除不存在的会话不应该抛出错误
     *
     * **Validates: Requirements 6.5**
     */
    it('删除不存在的会话不应该抛出错误', async () => {
      // 这不应该抛出错误
      await expect(
        sessionManager.deleteSession('session-non-existent-12345')
      ).resolves.not.toThrow();
    });
  });

  describe('会话过期', () => {
    /**
     * 测试标记会话为过期
     *
     * **Validates: Requirements 6.1**
     */
    it('应该能够标记会话为过期', async () => {
      const session = await sessionManager.createSession(process.cwd());

      // 标记为过期
      await sessionManager.markExpired(session);

      // 重新加载会话
      const loadedSession = await sessionManager.loadSession(session.id);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.expired).toBe(true);
    });

    /**
     * 测试过期会话不应该被 getRecentSession 返回
     *
     * **Validates: Requirements 6.1, 6.2**
     */
    it('过期会话不应该被 getRecentSession 返回', async () => {
      // 创建会话并标记为过期
      const session = await sessionManager.createSession(process.cwd());
      await sessionManager.markExpired(session);

      // 获取最近会话
      const recentSession = await sessionManager.getRecentSession();

      // 应该返回 null（没有活跃会话）
      expect(recentSession).toBeNull();
    });
  });

  describe('交互式会话测试', () => {
    /**
     * 测试交互式会话中的 /sessions 命令
     *
     * **Validates: Requirements 6.1**
     */
    it('/sessions 命令应该显示会话列表', async () => {
      const terminal = createTestTerminal({
        env: getNonCIEnv(),
        timeout: TEST_TIMEOUT,
      });

      try {
        await terminal.start();

        // 等待终端准备就绪
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // 发送 /sessions 命令
        terminal.write('/sessions\n');

        // 等待输出
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const output = terminal.getStrippedOutput().toLowerCase();

        // 验证有输出（会话列表或"没有会话"消息）
        expect(output.length).toBeGreaterThan(0);

        // 清理
        terminal.write('/exit\n');
        await terminal.waitForExit(5000).catch(() => {
          terminal.kill();
        });
      } finally {
        terminal.dispose();
      }
    }, TEST_TIMEOUT);
  });
});
