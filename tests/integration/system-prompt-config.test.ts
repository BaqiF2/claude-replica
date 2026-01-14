/**
 * 系统提示词配置集成测试
 *
 * 验证：
 * - SDK 正确接收 systemPrompt 预设对象格式
 * - SDK 正确接收 settingSources
 * - buildAppendPrompt 返回 undefined（Skills 由 SDK 管理）
 *
 * @module tests/integration/system-prompt-config
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { MessageRouter } from '../../src/core/MessageRouter';
import { SessionManager, Session } from '../../src/core/SessionManager';
import { ConfigManager } from '../../src/config/ConfigManager';
import { ToolRegistry } from '../../src/tools/ToolRegistry';
import { PermissionManager } from '../../src/permissions/PermissionManager';
import { MockPermissionUIFactory } from '../test-helpers/MockPermissionUI';

describe('系统提示词配置集成测试', () => {
  let testDir: string;
  let claudeDir: string;
  let sessionManager: SessionManager;
  let configManager: ConfigManager;
  let toolRegistry: ToolRegistry;
  let permissionManager: PermissionManager;

  beforeAll(async () => {
    // 创建测试目录
    testDir = path.join(os.tmpdir(), `claude-replica-sp-test-${Date.now()}`);
    claudeDir = path.join(testDir, '.claude');

    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(claudeDir, { recursive: true });
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
    // 初始化所有管理器
    const sessionsDir = path.join(testDir, 'sessions');
    await fs.mkdir(sessionsDir, { recursive: true });

    sessionManager = new SessionManager(sessionsDir);
    configManager = new ConfigManager();
    toolRegistry = new ToolRegistry();
    permissionManager = new PermissionManager({ mode: 'default' }, new MockPermissionUIFactory(), toolRegistry);
  });

  afterEach(async () => {
    // 清理 CLAUDE.md
    try {
      await fs.rm(path.join(claudeDir, 'CLAUDE.md'), { force: true });
    } catch {
      // 忽略清理错误
    }
  });

  async function buildSessionWithOptions(claudeMdContent?: string): Promise<{
    session: Session;
    options: Awaited<ReturnType<MessageRouter['buildQueryOptions']>>;
    appendPrompt: string | undefined;
  }> {
    if (claudeMdContent) {
      await fs.writeFile(path.join(claudeDir, 'CLAUDE.md'), claudeMdContent);
    }

    const session = await sessionManager.createSession(testDir);
    const messageRouter = new MessageRouter({
      configManager,
      toolRegistry,
      permissionManager,
    });

    const options = await messageRouter.buildQueryOptions(session);
    const appendPrompt = messageRouter.buildAppendPrompt(session);

    return { session, options, appendPrompt };
  }

  it('有 CLAUDE.md 时应返回预设 systemPrompt 和 settingSources', async () => {
    const claudeMdContent = `# Test Project\n\nThis is a test project.\n`;

    const { options, appendPrompt } = await buildSessionWithOptions(claudeMdContent);

    expect(options.systemPrompt).toEqual({
      type: 'preset',
      preset: 'claude_code',
    });
    expect(options.settingSources).toEqual(['project']);
    expect(appendPrompt).toBeUndefined();
  });

  it('无 CLAUDE.md 时应返回预设 systemPrompt 和 settingSources', async () => {
    const { options, appendPrompt } = await buildSessionWithOptions();

    expect(options.systemPrompt).toEqual({
      type: 'preset',
      preset: 'claude_code',
    });
    expect(options.settingSources).toEqual(['project']);
    expect(appendPrompt).toBeUndefined();
  });
});
