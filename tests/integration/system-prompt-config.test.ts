/**
 * 系统提示词配置集成测试
 *
 * 测试四种场景组合：
 * 1. 有 CLAUDE.md + 有技能
 * 2. 有 CLAUDE.md + 无技能
 * 3. 无 CLAUDE.md + 有技能
 * 4. 无 CLAUDE.md + 无技能
 *
 * 验证：
 * - SDK 正确接收 systemPrompt 预设对象格式
 * - SDK 正确接收 settingSources
 * - SDK 自动加载 CLAUDE.md 行为
 * - append 仅包含技能内容，不包含 CLAUDE.md
 *
 * @module tests/integration/system-prompt-config
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { MessageRouter } from '../../src/core/MessageRouter';
import { SessionManager, Session } from '../../src/core/SessionManager';
import { ConfigManager } from '../../src/config/ConfigManager';
import { SkillManager } from '../../src/skills/SkillManager';
import { ToolRegistry } from '../../src/tools/ToolRegistry';
import { PermissionManager } from '../../src/permissions/PermissionManager';

describe('系统提示词配置集成测试', () => {
  let testDir: string;
  let claudeDir: string;
  let skillsDir: string;
  let sessionManager: SessionManager;
  let configManager: ConfigManager;
  let skillManager: SkillManager;
  let toolRegistry: ToolRegistry;
  let permissionManager: PermissionManager;

  beforeAll(async () => {
    // 创建测试目录
    testDir = path.join(os.tmpdir(), `claude-replica-sp-test-${Date.now()}`);
    claudeDir = path.join(testDir, '.claude');
    skillsDir = path.join(testDir, '.claude-replica', 'skills');

    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(claudeDir, { recursive: true });
    await fs.mkdir(skillsDir, { recursive: true });
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
    skillManager = new SkillManager();
    toolRegistry = new ToolRegistry();
    permissionManager = new PermissionManager({ mode: 'default' }, toolRegistry);
  });

  afterEach(async () => {
    // 清理 CLAUDE.md 和技能文件
    try {
      await fs.rm(path.join(claudeDir, 'CLAUDE.md'), { force: true });
      await fs.rm(skillsDir, { recursive: true, force: true });
      await fs.mkdir(skillsDir, { recursive: true });
    } catch {
      // 忽略清理错误
    }
  });

  describe('场景 1: 有 CLAUDE.md + 有技能', () => {
    let session: Session;

    beforeEach(async () => {
      // 创建 CLAUDE.md 文件
      const claudeMdContent = `# Test Project

This is a test project for system prompt configuration.

## Instructions

Follow these instructions when working with this project.
`;
      await fs.writeFile(path.join(claudeDir, 'CLAUDE.md'), claudeMdContent);

      // 创建技能文件
      const skillContent = `---
name: test-skill
description: 测试技能
triggers:
  - test
tools:
  - Read
  - Write
---

这是测试技能的内容，应该出现在 append 中。
`;
      await fs.writeFile(path.join(skillsDir, 'test-skill.skill.md'), skillContent);

      // 加载技能
      await skillManager.loadSkills([skillsDir]);

      // 创建会话
      session = await sessionManager.createSession(testDir);

      // 将加载的技能添加到会话上下文
      session.context.loadedSkills = skillManager.getAllSkills();
    });

    it('应该返回预设对象格式的 systemPrompt', async () => {
      const messageRouter = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const options = await messageRouter.buildQueryOptions(session);

      // 验证 systemPrompt 是预设对象格式
      expect(options.systemPrompt).toMatchObject({
        type: 'preset',
        preset: 'claude_code',
      });

      // 应该有 append 字段
      expect(options.systemPrompt).toHaveProperty('append');
    });

    it('应该在 append 中包含技能内容', async () => {
      const messageRouter = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const options = await messageRouter.buildQueryOptions(session);
      const systemPrompt = options.systemPrompt as {
        type: string;
        preset: string;
        append?: string;
      };

      // append 应该包含技能内容
      expect(systemPrompt.append).toContain('测试技能的内容');
      expect(systemPrompt.append).toContain('test-skill');
    });

    it('应该在 append 中不包含 CLAUDE.md 内容', async () => {
      const messageRouter = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const options = await messageRouter.buildQueryOptions(session);
      const systemPrompt = options.systemPrompt as {
        type: string;
        preset: string;
        append?: string;
      };

      // append 不应该包含 CLAUDE.md 内容
      expect(systemPrompt.append).not.toContain('Test Project');
      expect(systemPrompt.append).not.toContain('Follow these instructions');
    });

    it('应该设置 settingSources 为 ["project"]', async () => {
      const messageRouter = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const options = await messageRouter.buildQueryOptions(session);

      // 验证 settingSources
      expect(options.settingSources).toEqual(['project']);
    });
  });

  describe('场景 2: 有 CLAUDE.md + 无技能', () => {
    let session: Session;

    beforeEach(async () => {
      // 创建 CLAUDE.md 文件
      const claudeMdContent = `# Test Project

This is a test project without skills.
`;
      await fs.writeFile(path.join(claudeDir, 'CLAUDE.md'), claudeMdContent);

      // 不加载技能

      // 创建会话
      session = await sessionManager.createSession(testDir);
    });

    it('应该返回预设对象格式的 systemPrompt（无 append）', async () => {
      const messageRouter = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const options = await messageRouter.buildQueryOptions(session);

      // 验证 systemPrompt 是预设对象格式
      expect(options.systemPrompt).toMatchObject({
        type: 'preset',
        preset: 'claude_code',
      });

      // 没有技能，不应该有 append 字段（或者 append 为 undefined）
      const systemPrompt = options.systemPrompt as {
        type: string;
        preset: string;
        append?: string;
      };
      expect(systemPrompt.append).toBeUndefined();
    });

    it('应该设置 settingSources 为 ["project"]', async () => {
      const messageRouter = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const options = await messageRouter.buildQueryOptions(session);

      // 验证 settingSources
      expect(options.settingSources).toEqual(['project']);
    });
  });

  describe('场景 3: 无 CLAUDE.md + 有技能', () => {
    let session: Session;

    beforeEach(async () => {
      // 不创建 CLAUDE.md 文件

      // 创建技能文件
      const skillContent = `---
name: another-skill
description: 另一个测试技能
triggers:
  - another
tools:
  - Grep
---

这是另一个测试技能的内容。
`;
      await fs.writeFile(path.join(skillsDir, 'another-skill.skill.md'), skillContent);

      // 加载技能
      await skillManager.loadSkills([skillsDir]);

      // 创建会话
      session = await sessionManager.createSession(testDir);

      // 将加载的技能添加到会话上下文
      session.context.loadedSkills = skillManager.getAllSkills();
    });

    it('应该返回预设对象格式的 systemPrompt', async () => {
      const messageRouter = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const options = await messageRouter.buildQueryOptions(session);

      // 验证 systemPrompt 是预设对象格式
      expect(options.systemPrompt).toMatchObject({
        type: 'preset',
        preset: 'claude_code',
      });

      // 应该有 append 字段
      expect(options.systemPrompt).toHaveProperty('append');
    });

    it('应该在 append 中包含技能内容', async () => {
      const messageRouter = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const options = await messageRouter.buildQueryOptions(session);
      const systemPrompt = options.systemPrompt as {
        type: string;
        preset: string;
        append?: string;
      };

      // append 应该包含技能内容
      expect(systemPrompt.append).toContain('另一个测试技能的内容');
      expect(systemPrompt.append).toContain('another-skill');
    });

    it('应该设置 settingSources 为 ["project"]', async () => {
      const messageRouter = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const options = await messageRouter.buildQueryOptions(session);

      // 验证 settingSources
      expect(options.settingSources).toEqual(['project']);
    });
  });

  describe('场景 4: 无 CLAUDE.md + 无技能', () => {
    let session: Session;

    beforeEach(async () => {
      // 不创建 CLAUDE.md 文件
      // 不加载技能

      // 创建会话
      session = await sessionManager.createSession(testDir);
    });

    it('应该返回预设对象格式的 systemPrompt（无 append）', async () => {
      const messageRouter = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const options = await messageRouter.buildQueryOptions(session);

      // 验证 systemPrompt 是预设对象格式
      expect(options.systemPrompt).toMatchObject({
        type: 'preset',
        preset: 'claude_code',
      });

      // 没有技能和 CLAUDE.md，不应该有 append 字段
      const systemPrompt = options.systemPrompt as {
        type: string;
        preset: string;
        append?: string;
      };
      expect(systemPrompt.append).toBeUndefined();
    });

    it('应该设置 settingSources 为 ["project"]', async () => {
      const messageRouter = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const options = await messageRouter.buildQueryOptions(session);

      // 验证 settingSources
      expect(options.settingSources).toEqual(['project']);
    });
  });

});

