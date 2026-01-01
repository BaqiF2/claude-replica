/**
 * 消息路由器测试
 *
 * 测试 MessageRouter 的核心功能：
 * - query() 函数的调用（使用对象参数）
 * - Options 接口的构建
 * - 系统提示词的构建
 *
 * 需求: 1.4, 18.5
 */

import { MessageRouter, MessageRouterOptions, Message } from '../../src/core/MessageRouter';
import { ConfigManager } from '../../src/config/ConfigManager';
import { ToolRegistry } from '../../src/tools/ToolRegistry';
import { PermissionManager, PermissionConfig } from '../../src/permissions/PermissionManager';
import { Session, SessionContext } from '../../src/core/SessionManager';

// 模拟会话创建辅助函数
function createMockSession(overrides: Partial<Session> = {}): Session {
  const defaultContext: SessionContext = {
    workingDirectory: '/test/project',
    projectConfig: {},
    userConfig: {},
    loadedSkills: [],
    activeAgents: [],
  };

  return {
    id: 'test-session-123',
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    messages: [],
    context: { ...defaultContext, ...overrides.context },
    expired: false,
    workingDirectory: '/test/project',
    ...overrides,
  };
}

// 模拟配置管理器
function createMockConfigManager(claudeMd: string | null = null): ConfigManager {
  const configManager = new ConfigManager();
  
  // 模拟 loadClaudeMd 方法
  jest.spyOn(configManager, 'loadClaudeMd').mockResolvedValue(claudeMd);
  
  return configManager;
}

describe('MessageRouter', () => {
  let toolRegistry: ToolRegistry;
  let configManager: ConfigManager;
  let permissionManager: PermissionManager;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
    configManager = createMockConfigManager();
    
    const permissionConfig: PermissionConfig = {
      mode: 'default',
    };
    permissionManager = new PermissionManager(permissionConfig, toolRegistry);
  });

  describe('构造函数', () => {
    it('应该使用提供的选项创建 MessageRouter 实例', () => {
      const options: MessageRouterOptions = {
        configManager,
        toolRegistry,
        permissionManager,
      };

      const router = new MessageRouter(options);

      expect(router).toBeDefined();
      expect(router).toBeInstanceOf(MessageRouter);
    });

    it('应该使用默认的 ToolRegistry 如果未提供', () => {
      const options: MessageRouterOptions = {
        configManager,
        permissionManager,
      };

      const router = new MessageRouter(options);

      expect(router).toBeDefined();
    });
  });

  describe('buildSystemPrompt', () => {
    it('应该构建基本的系统提示词', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession();
      const systemPrompt = await router.buildSystemPrompt(session);

      expect(systemPrompt).toBeDefined();
      expect(typeof systemPrompt).toBe('string');
    });

    it('应该包含 CLAUDE.md 内容（如果存在）', async () => {
      const claudeMdContent = '# 项目说明\n\n这是一个测试项目。';
      const mockConfigManager = createMockConfigManager(claudeMdContent);

      const router = new MessageRouter({
        configManager: mockConfigManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession();
      const systemPrompt = await router.buildSystemPrompt(session);

      expect(systemPrompt).toContain(claudeMdContent);
    });

    it('应该包含加载的技能内容', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({
        context: {
          workingDirectory: '/test/project',
          projectConfig: {},
          userConfig: {},
          loadedSkills: [
            {
              name: 'typescript-expert',
              description: 'TypeScript 专家技能',
              content: '你是 TypeScript 专家，擅长类型系统和最佳实践。',
              metadata: {},
            },
          ],
          activeAgents: [],
        },
      });

      const systemPrompt = await router.buildSystemPrompt(session);

      expect(systemPrompt).toContain('typescript-expert');
      expect(systemPrompt).toContain('TypeScript 专家');
    });

    it('应该处理自定义系统提示词追加', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession();
      const appendPrompt = '请特别注意代码安全性。';
      const systemPrompt = await router.buildSystemPrompt(session, appendPrompt);

      expect(systemPrompt).toContain(appendPrompt);
    });

    it('应该处理完全替换系统提示词', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession();
      const customPrompt = '你是一个专门的代码审查助手。';
      const systemPrompt = await router.buildSystemPrompt(session, undefined, customPrompt);

      expect(systemPrompt).toBe(customPrompt);
    });
  });

  describe('getEnabledToolNames', () => {
    it('应该返回默认工具列表', () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession();
      const tools = router.getEnabledToolNames(session);

      expect(tools).toContain('Read');
      expect(tools).toContain('Write');
      expect(tools).toContain('Edit');
      expect(tools).toContain('Bash');
      expect(tools).toContain('Grep');
      expect(tools).toContain('Glob');
    });

    it('应该根据配置的 allowedTools 返回工具列表', () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({
        context: {
          workingDirectory: '/test/project',
          projectConfig: {
            allowedTools: ['Read', 'Grep'],
          },
          userConfig: {},
          loadedSkills: [],
          activeAgents: [],
        },
      });

      const tools = router.getEnabledToolNames(session);

      expect(tools).toEqual(['Read', 'Grep']);
    });

    it('应该根据配置的 disallowedTools 过滤工具', () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({
        context: {
          workingDirectory: '/test/project',
          projectConfig: {
            disallowedTools: ['WebFetch', 'WebSearch'],
          },
          userConfig: {},
          loadedSkills: [],
          activeAgents: [],
        },
      });

      const tools = router.getEnabledToolNames(session);

      expect(tools).not.toContain('WebFetch');
      expect(tools).not.toContain('WebSearch');
    });

    it('应该包含技能所需的工具', () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({
        context: {
          workingDirectory: '/test/project',
          projectConfig: {},
          userConfig: {},
          loadedSkills: [
            {
              name: 'web-skill',
              description: '网络技能',
              tools: ['WebFetch', 'WebSearch'],
              content: '你可以访问网络。',
              metadata: {},
            },
          ],
          activeAgents: [],
        },
      });

      const tools = router.getEnabledToolNames(session);

      expect(tools).toContain('WebFetch');
      expect(tools).toContain('WebSearch');
    });
  });

  describe('createPermissionHandler', () => {
    it('应该创建有效的权限处理函数', () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession();
      const handler = router.createPermissionHandler(session);

      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });

    it('权限处理函数应该正确处理工具调用', async () => {
      // 使用 bypassPermissions 模式以便测试
      const bypassPermissionManager = new PermissionManager(
        { mode: 'bypassPermissions' },
        toolRegistry
      );

      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager: bypassPermissionManager,
      });

      const session = createMockSession();
      const handler = router.createPermissionHandler(session);

      const result = await handler({
        tool: 'Read',
        args: { path: '/test/file.txt' },
        context: {
          sessionId: session.id,
          messageUuid: 'test-uuid',
        },
      });

      expect(result).toBe(true);
    });

    it('权限处理函数应该拒绝黑名单中的工具', async () => {
      const restrictedPermissionManager = new PermissionManager(
        {
          mode: 'default',
          disallowedTools: ['Bash'],
        },
        toolRegistry
      );

      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager: restrictedPermissionManager,
      });

      const session = createMockSession();
      const handler = router.createPermissionHandler(session);

      const result = await handler({
        tool: 'Bash',
        args: { command: 'ls' },
        context: {
          sessionId: session.id,
          messageUuid: 'test-uuid',
        },
      });

      expect(result).toBe(false);
    });
  });

  describe('getAgentDefinitions', () => {
    it('应该返回空对象当没有活动代理时', () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession();
      const agents = router.getAgentDefinitions(session);

      expect(agents).toEqual({});
    });

    it('应该返回活动代理的定义', () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({
        context: {
          workingDirectory: '/test/project',
          projectConfig: {},
          userConfig: {},
          loadedSkills: [],
          activeAgents: [
            {
              name: 'reviewer',
              description: '代码审查专家',
              model: 'sonnet',
              prompt: '你是代码审查专家。',
              tools: ['Read', 'Grep'],
            },
          ],
        },
      });

      const agents = router.getAgentDefinitions(session);

      expect(agents).toHaveProperty('reviewer');
      expect(agents['reviewer'].description).toBe('代码审查专家');
      expect(agents['reviewer'].model).toBe('sonnet');
      expect(agents['reviewer'].prompt).toBe('你是代码审查专家。');
      expect(agents['reviewer'].tools).toEqual(['Read', 'Grep']);
    });

    it('应该正确转换多个代理', () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({
        context: {
          workingDirectory: '/test/project',
          projectConfig: {},
          userConfig: {},
          loadedSkills: [],
          activeAgents: [
            {
              name: 'reviewer',
              description: '代码审查专家',
              prompt: '你是代码审查专家。',
            },
            {
              name: 'tester',
              description: '测试专家',
              model: 'haiku',
              prompt: '你是测试专家。',
              tools: ['Bash'],
            },
          ],
        },
      });

      const agents = router.getAgentDefinitions(session);

      expect(Object.keys(agents)).toHaveLength(2);
      expect(agents).toHaveProperty('reviewer');
      expect(agents).toHaveProperty('tester');
    });
  });

  describe('buildQueryOptions', () => {
    it('应该构建有效的 QueryOptions', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({
        context: {
          workingDirectory: '/test/project',
          projectConfig: {
            model: 'claude-3-5-sonnet-latest',
          },
          userConfig: {},
          loadedSkills: [],
          activeAgents: [],
        },
      });

      const options = await router.buildQueryOptions(session);

      expect(options).toBeDefined();
      expect(options.model).toBe('claude-3-5-sonnet-latest');
      expect(options.cwd).toBe('/test/project');
      expect(options.allowedTools).toBeDefined();
      expect(Array.isArray(options.allowedTools)).toBe(true);
    });

    it('应该使用默认模型当未指定时', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession();
      const options = await router.buildQueryOptions(session);

      expect(options.model).toBe('claude-3-5-sonnet-latest');
    });

    it('应该包含权限模式', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({
        context: {
          workingDirectory: '/test/project',
          projectConfig: {
            permissionMode: 'acceptEdits',
          },
          userConfig: {},
          loadedSkills: [],
          activeAgents: [],
        },
      });

      const options = await router.buildQueryOptions(session);

      expect(options.permissionMode).toBe('acceptEdits');
    });

    it('应该包含 MCP 服务器配置', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({
        context: {
          workingDirectory: '/test/project',
          projectConfig: {
            mcpServers: {
              github: {
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-github'],
              },
            },
          },
          userConfig: {},
          loadedSkills: [],
          activeAgents: [],
        },
      });

      const options = await router.buildQueryOptions(session);

      expect(options.mcpServers).toBeDefined();
      expect(options.mcpServers).toHaveProperty('github');
    });

    it('应该包含子代理定义', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({
        context: {
          workingDirectory: '/test/project',
          projectConfig: {},
          userConfig: {},
          loadedSkills: [],
          activeAgents: [
            {
              name: 'reviewer',
              description: '代码审查专家',
              prompt: '你是代码审查专家。',
            },
          ],
        },
      });

      const options = await router.buildQueryOptions(session);

      expect(options.agents).toBeDefined();
      expect(options.agents).toHaveProperty('reviewer');
    });
  });

  describe('routeMessage', () => {
    it('应该返回 QueryResult 对象', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession();
      const message: Message = {
        id: 'msg-1',
        role: 'user',
        content: '你好',
        timestamp: new Date(),
      };

      const result = await router.routeMessage(message, session);

      expect(result).toBeDefined();
      expect(result.options).toBeDefined();
      expect(result.prompt).toBe('你好');
    });

    it('应该处理带有 ContentBlock 的消息', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession();
      const message: Message = {
        id: 'msg-1',
        role: 'user',
        content: [
          { type: 'text', text: '请分析这段代码' },
        ],
        timestamp: new Date(),
      };

      const result = await router.routeMessage(message, session);

      expect(result).toBeDefined();
      expect(result.prompt).toBeDefined();
    });

    it('应该正确设置工作目录', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({
        workingDirectory: '/custom/project/path',
        context: {
          workingDirectory: '/custom/project/path',
          projectConfig: {},
          userConfig: {},
          loadedSkills: [],
          activeAgents: [],
        },
      });

      const message: Message = {
        id: 'msg-1',
        role: 'user',
        content: '列出文件',
        timestamp: new Date(),
      };

      const result = await router.routeMessage(message, session);

      expect(result.options.cwd).toBe('/custom/project/path');
    });
  });
});

describe('MessageRouter - 系统提示词构建', () => {
  let toolRegistry: ToolRegistry;
  let configManager: ConfigManager;
  let permissionManager: PermissionManager;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
    configManager = createMockConfigManager();
    permissionManager = new PermissionManager({ mode: 'default' }, toolRegistry);
  });

  it('应该按正确顺序组合系统提示词', async () => {
    const claudeMdContent = '# CLAUDE.md 内容';
    const mockConfigManager = createMockConfigManager(claudeMdContent);

    const router = new MessageRouter({
      configManager: mockConfigManager,
      toolRegistry,
      permissionManager,
    });

    const session = createMockSession({
      context: {
        workingDirectory: '/test/project',
        projectConfig: {},
        userConfig: {},
        loadedSkills: [
          {
            name: 'skill-1',
            description: '技能 1',
            content: '技能 1 的内容',
            metadata: {},
          },
        ],
        activeAgents: [],
      },
    });

    const systemPrompt = await router.buildSystemPrompt(session);

    // CLAUDE.md 应该在前面
    const claudeMdIndex = systemPrompt.indexOf('CLAUDE.md 内容');
    const skillIndex = systemPrompt.indexOf('技能 1');

    expect(claudeMdIndex).toBeGreaterThanOrEqual(0);
    expect(skillIndex).toBeGreaterThanOrEqual(0);
    expect(claudeMdIndex).toBeLessThan(skillIndex);
  });

  it('应该处理空的 CLAUDE.md', async () => {
    const mockConfigManager = createMockConfigManager(null);

    const router = new MessageRouter({
      configManager: mockConfigManager,
      toolRegistry,
      permissionManager,
    });

    const session = createMockSession();
    const systemPrompt = await router.buildSystemPrompt(session);

    expect(systemPrompt).toBeDefined();
    expect(typeof systemPrompt).toBe('string');
  });

  it('应该处理多个技能', async () => {
    const router = new MessageRouter({
      configManager,
      toolRegistry,
      permissionManager,
    });

    const session = createMockSession({
      context: {
        workingDirectory: '/test/project',
        projectConfig: {},
        userConfig: {},
        loadedSkills: [
          {
            name: 'skill-1',
            description: '技能 1',
            content: '技能 1 的内容',
            metadata: {},
          },
          {
            name: 'skill-2',
            description: '技能 2',
            content: '技能 2 的内容',
            metadata: {},
          },
        ],
        activeAgents: [],
      },
    });

    const systemPrompt = await router.buildSystemPrompt(session);

    expect(systemPrompt).toContain('skill-1');
    expect(systemPrompt).toContain('skill-2');
    expect(systemPrompt).toContain('技能 1 的内容');
    expect(systemPrompt).toContain('技能 2 的内容');
  });
});

describe('MessageRouter - Options 接口构建', () => {
  let toolRegistry: ToolRegistry;
  let configManager: ConfigManager;
  let permissionManager: PermissionManager;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
    configManager = createMockConfigManager();
    permissionManager = new PermissionManager({ mode: 'default' }, toolRegistry);
  });

  it('应该包含所有必需的 Options 字段', async () => {
    const router = new MessageRouter({
      configManager,
      toolRegistry,
      permissionManager,
    });

    const session = createMockSession();
    const options = await router.buildQueryOptions(session);

    // 验证必需字段
    expect(options).toHaveProperty('model');
    expect(options).toHaveProperty('systemPrompt');
    expect(options).toHaveProperty('allowedTools');
    expect(options).toHaveProperty('cwd');
    expect(options).toHaveProperty('permissionMode');
  });

  it('应该正确处理沙箱配置', async () => {
    const router = new MessageRouter({
      configManager,
      toolRegistry,
      permissionManager,
    });

    const session = createMockSession({
      context: {
        workingDirectory: '/test/project',
        projectConfig: {
          sandbox: {
            enabled: true,
            autoAllowBashIfSandboxed: true,
            excludedCommands: ['rm -rf /'],
          },
        },
        userConfig: {},
        loadedSkills: [],
        activeAgents: [],
      },
    });

    const options = await router.buildQueryOptions(session);

    expect(options.sandbox).toBeDefined();
    expect(options.sandbox?.enabled).toBe(true);
    expect(options.sandbox?.autoAllowBashIfSandboxed).toBe(true);
  });

  it('应该正确处理 maxTurns 和 maxBudgetUsd', async () => {
    const router = new MessageRouter({
      configManager,
      toolRegistry,
      permissionManager,
    });

    const session = createMockSession({
      context: {
        workingDirectory: '/test/project',
        projectConfig: {
          maxTurns: 50,
          maxBudgetUsd: 10.0,
        },
        userConfig: {},
        loadedSkills: [],
        activeAgents: [],
      },
    });

    const options = await router.buildQueryOptions(session);

    expect(options.maxTurns).toBe(50);
    expect(options.maxBudgetUsd).toBe(10.0);
  });
});
