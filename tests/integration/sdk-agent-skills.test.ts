/**
 * SDK SubAgents 集成测试
 *
 * 验证：
 * - 预设 agents 自动加载并保持一致
 * - 默认注入预设 agents 并自动启用 Task 工具
 * - disallowedTools 配置覆盖自动添加
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { MessageRouter } from '../../src/core/MessageRouter';
import { SessionManager, Session } from '../../src/core/SessionManager';
import { ConfigManager } from '../../src/config/ConfigManager';
import { ToolRegistry } from '../../src/tools/ToolRegistry';
import { PermissionManager } from '../../src/permissions/PermissionManager';
import { AgentRegistry } from '../../src/agents/AgentRegistry';
import { getPresetAgentNames } from '../../src/agents/PresetAgents';
import type { ProjectConfig } from '../../src/config';
import { MockPermissionUI } from '../test-helpers/MockPermissionUI';

describe('SDK SubAgents 集成测试', () => {
  let tempDir: string;
  let sessionManager: SessionManager;
  let configManager: ConfigManager;
  let toolRegistry: ToolRegistry;
  let permissionManager: PermissionManager;
  let agentRegistry: AgentRegistry;
  let presetAgents: ReturnType<AgentRegistry['getAll']>;
  let presetAgentNames: string[];

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sdk-subagents-test-'));
    sessionManager = new SessionManager(path.join(tempDir, 'sessions'));
    configManager = new ConfigManager();
    toolRegistry = new ToolRegistry();
    permissionManager = new PermissionManager({ mode: 'default' }, new MockPermissionUI(), toolRegistry);
    agentRegistry = new AgentRegistry();
    presetAgents = agentRegistry.getAll();
    presetAgentNames = getPresetAgentNames();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  const createSession = (projectConfig: ProjectConfig = {}): Promise<Session> =>
    sessionManager.createSession(tempDir, projectConfig);

  const createMessageRouter = (): MessageRouter =>
    new MessageRouter({
      configManager,
      toolRegistry,
      permissionManager,
    });

  it('应自动加载预设 agents 并保持一致', async () => {
    const session = await createSession();
    const messageRouter = createMessageRouter();

    const firstOptions = await messageRouter.buildQueryOptions(session);
    const secondOptions = await messageRouter.buildQueryOptions(session);

    expect(firstOptions.agents).toBeDefined();
    expect(Object.keys(firstOptions.agents ?? {}).sort()).toEqual(
      [...presetAgentNames].sort()
    );
    expect(firstOptions.agents).toEqual(secondOptions.agents);
  });

  it('默认应自动启用 Task 工具', async () => {
    const session = await createSession();
    const messageRouter = createMessageRouter();

    const tools = messageRouter.getEnabledToolNames(session);

    expect(tools).toContain('Task');
  });

  it('disallowedTools 应覆盖 Task 自动添加', async () => {
    const session = await createSession({
      agents: presetAgents,
      disallowedTools: ['Task'],
    });
    const messageRouter = createMessageRouter();

    const tools = messageRouter.getEnabledToolNames(session);

    expect(tools).not.toContain('Task');
  });
});
