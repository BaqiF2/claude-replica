/**
 * SDK Agent Skills 集成测试
 *
 * 验证：
 * - settingSources 仅包含 project
 * - allowedTools 包含 Skill
 * - buildAppendPrompt 返回 undefined
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { MessageRouter } from '../../src/core/MessageRouter';
import { SessionManager } from '../../src/core/SessionManager';
import { ConfigManager } from '../../src/config/ConfigManager';
import { ToolRegistry } from '../../src/tools/ToolRegistry';
import { PermissionManager } from '../../src/permissions/PermissionManager';

describe('SDK Agent Skills 集成测试', () => {
  let tempDir: string;
  let sessionManager: SessionManager;
  let configManager: ConfigManager;
  let toolRegistry: ToolRegistry;
  let permissionManager: PermissionManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sdk-skills-test-'));
    sessionManager = new SessionManager(path.join(tempDir, 'sessions'));
    configManager = new ConfigManager();
    toolRegistry = new ToolRegistry();
    permissionManager = new PermissionManager({ mode: 'default' }, toolRegistry);

    const skillDir = path.join(tempDir, '.claude', 'skills', 'test-skill');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      `---\nname: test-skill\ndescription: Test skill\n---\n\nThis is a test skill.`
    );
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  it('应返回正确的 SDK Skills 配置', async () => {
    const session = await sessionManager.createSession(tempDir);
    const messageRouter = new MessageRouter({
      configManager,
      toolRegistry,
      permissionManager,
    });

    const options = await messageRouter.buildQueryOptions(session);

    expect(messageRouter.buildAppendPrompt(session)).toBeUndefined();
    expect(options.settingSources).toEqual(['project']);
    expect(options.settingSources).toContain('project');
    expect(options.allowedTools).toContain('Skill');
  });
});
