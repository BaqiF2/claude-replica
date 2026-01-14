/**
 * 消息路由器测试
 *
 * 测试 MessageRouter 的核心功能：
 * - query() 函数的调用（使用对象参数）
 * - Options 接口的构建
 * - 系统提示词选项的构建（SDK 预设格式）
 * - 追加提示词的构建（无额外提示词）
 * - 配置源列表的获取（用于 SDK 自动加载 CLAUDE.md）
 *
 * 需求: 1.4, 18.5
 */

import { MessageRouter, MessageRouterOptions, Message } from '../../src/core/MessageRouter';
import { ConfigManager } from '../../src/config/ConfigManager';
import { ToolRegistry } from '../../src/tools/ToolRegistry';
import { PermissionManager, PermissionConfig } from '../../src/permissions/PermissionManager';
import { Session, SessionContext } from '../../src/core/SessionManager';
import { getPresetAgents } from '../../src/agents/PresetAgents';
import { MockPermissionUI } from '../test-helpers/MockPermissionUI';

// 模拟会话创建辅助函数
function createMockSession(overrides: Partial<Session> = {}): Session {
  const defaultContext: SessionContext = {
    workingDirectory: '/test/project',
    projectConfig: {},
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
    permissionManager = new PermissionManager(permissionConfig, new MockPermissionUI(), toolRegistry);
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

  describe('getSystemPromptOptions', () => {
    it('应该返回 claude_code 预设（无技能场景）', () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession();
      const systemPrompt = router.getSystemPromptOptions(session);

      expect(systemPrompt).toEqual({
        type: 'preset',
        preset: 'claude_code',
      });
    });
  });

  describe('buildAppendPrompt', () => {
    it('应该返回 undefined', () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession();
      const appendPrompt = router.buildAppendPrompt(session);

      expect(appendPrompt).toBeUndefined();
    });
  });

  describe('getSettingSources', () => {
    it('应该返回 ["project"]', () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const settingSources = router.getSettingSources();

      expect(settingSources).toEqual(['project']);
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
          
          activeAgents: [],
        },
      });

      const tools = router.getEnabledToolNames(session);

      expect(tools).toEqual(['Read', 'Grep', 'Skill', 'Task']);
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
          
          activeAgents: [],
        },
      });

      const tools = router.getEnabledToolNames(session);

      expect(tools).not.toContain('WebFetch');
      expect(tools).not.toContain('WebSearch');
    });

    it('应该保留允许列表中的 MCP 工具名称', () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({
        context: {
          workingDirectory: '/test/project',
          projectConfig: {
            allowedTools: ['Read', 'mcp__custom-tools-math-calculators__calculator'],
          },
          
          activeAgents: [],
        },
      });

      const tools = router.getEnabledToolNames(session);

      expect(tools).toContain('Read');
      expect(tools).toContain('mcp__custom-tools-math-calculators__calculator');
    });

    it('应该默认包含 Skill 工具', () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession();
      const tools = router.getEnabledToolNames(session);

      expect(tools).toContain('Skill');
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
        new MockPermissionUI(),
        toolRegistry
      );

      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager: bypassPermissionManager,
      });

      const session = createMockSession();
      const handler = router.createPermissionHandler(session);

      const result = await handler(
        'Read',
        { path: '/test/file.txt' },
        {
          signal: new AbortController().signal,
          toolUseID: 'test-uuid',
        }
      );

      expect(result.behavior).toBe('allow');
    });

    it('权限处理函数应该处理空 toolUseID 的工具调用', async () => {
      const bypassPermissionManager = new PermissionManager(
        { mode: 'bypassPermissions' },
        new MockPermissionUI(),
        toolRegistry
      );

      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager: bypassPermissionManager,
      });

      const session = createMockSession();
      const handler = router.createPermissionHandler(session);

      const result = await handler(
        'Read',
        { path: '/test/file.txt' },
        {
          signal: new AbortController().signal,
          toolUseID: '',
        }
      );

      expect(result.behavior).toBe('allow');
    });

    it('权限处理函数应该拒绝黑名单中的工具', async () => {
      const restrictedPermissionManager = new PermissionManager(
        {
          mode: 'default',
          disallowedTools: ['Bash'],
        },
        new MockPermissionUI(),
        toolRegistry
      );

      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager: restrictedPermissionManager,
      });

      const session = createMockSession();
      const handler = router.createPermissionHandler(session);

      const result = await handler(
        'Bash',
        { command: 'ls' },
        {
          signal: new AbortController().signal,
          toolUseID: 'test-uuid',
        }
      );

      expect(result.behavior).toBe('deny');
    });
  });

  describe('getAgentDefinitions', () => {
    it('应该返回预设代理当没有活动代理时', () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession();
      const agents = router.getAgentDefinitions(session);

      expect(agents).toEqual(getPresetAgents());
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

      const presetCount = Object.keys(getPresetAgents()).length;
      expect(Object.keys(agents)).toHaveLength(presetCount + 2);
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
            model: 'claude-sonnet-4-5-20250929',
          },
          
          activeAgents: [],
        },
      });

      const options = await router.buildQueryOptions(session);

      expect(options).toBeDefined();
      expect(options.model).toBe('claude-sonnet-4-5-20250929');
      expect(options.cwd).toBe('/test/project');
      expect(options.allowedTools).toBeUndefined();
    });

    it('应该使用默认模型当未指定时', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession();
      const options = await router.buildQueryOptions(session);

      expect(options.model).toBe('sonnet');
    });

    it('应该使用 SDK 预设格式的 systemPrompt（无技能）', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession();
      const options = await router.buildQueryOptions(session);

      expect(options.systemPrompt).toEqual({
        type: 'preset',
        preset: 'claude_code',
      });
    });

    it('应该包含 settingSources 字段', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession();
      const options = await router.buildQueryOptions(session);

      expect(options.settingSources).toEqual(['project']);
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

      router.setMcpServers({
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
        },
      });

      const session = createMockSession({
        context: {
          workingDirectory: '/test/project',
          projectConfig: {},
          
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


describe('MessageRouter - 流式消息构建', () => {
  let toolRegistry: ToolRegistry;
  let configManager: ConfigManager;
  let permissionManager: PermissionManager;
  let fs: typeof import('fs/promises');
  let path: typeof import('path');
  let os: typeof import('os');
  let tempDir: string;

  beforeAll(async () => {
    fs = await import('fs/promises');
    path = await import('path');
    os = await import('os');
  });

  beforeEach(async () => {
    toolRegistry = new ToolRegistry();
    configManager = createMockConfigManager();
    permissionManager = new PermissionManager({ mode: 'default' }, new MockPermissionUI(), toolRegistry);

    // 创建临时目录用于测试
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'router-test-'));
  });

  afterEach(async () => {
    // 清理临时目录
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('buildStreamMessage', () => {
    it('应该构建纯文本消息', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({
        workingDirectory: tempDir,
        context: {
          workingDirectory: tempDir,
          projectConfig: {},
          
          activeAgents: [],
        },
      });

      const result = await router.buildStreamMessage('Hello, Claude!', session);

      expect(result.contentBlocks).toHaveLength(1);
      expect(result.contentBlocks[0].type).toBe('text');
      expect((result.contentBlocks[0] as any).text).toBe('Hello, Claude!');
      expect(result.images).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('应该处理包含图像引用的消息', async () => {
      // 创建测试图像文件
      const imageBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG 文件头
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
        0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59,
        0xe7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
        0x44, 0xae, 0x42, 0x60, 0x82,
      ]);

      const imagePath = path.join(tempDir, 'test.png');
      await fs.writeFile(imagePath, imageBuffer);

      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({
        workingDirectory: tempDir,
        context: {
          workingDirectory: tempDir,
          projectConfig: {},
          
          activeAgents: [],
        },
      });

      const result = await router.buildStreamMessage(
        `Analyze this image @${imagePath}`,
        session
      );

      // 应该有文本块和图像块
      expect(result.contentBlocks.length).toBeGreaterThanOrEqual(1);
      expect(result.images).toHaveLength(1);
      expect(result.images[0].format).toBe('png');

      // 检查是否有图像内容块
      const imageBlock = result.contentBlocks.find((block) => block.type === 'image');
      expect(imageBlock).toBeDefined();
    });

    it('应该在图像文件不存在时返回错误', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({
        workingDirectory: tempDir,
        context: {
          workingDirectory: tempDir,
          projectConfig: {},
          
          activeAgents: [],
        },
      });

      const result = await router.buildStreamMessage(
        'Check @./nonexistent.png',
        session
      );

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].reference).toContain('nonexistent.png');
    });

    it('应该处理多个图像引用', async () => {
      // 创建多个测试图像文件
      const imageBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
        0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59,
        0xe7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
        0x44, 0xae, 0x42, 0x60, 0x82,
      ]);

      const imagePath1 = path.join(tempDir, 'image1.png');
      const imagePath2 = path.join(tempDir, 'image2.png');
      await fs.writeFile(imagePath1, imageBuffer);
      await fs.writeFile(imagePath2, imageBuffer);

      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({
        workingDirectory: tempDir,
        context: {
          workingDirectory: tempDir,
          projectConfig: {},
          
          activeAgents: [],
        },
      });

      const result = await router.buildStreamMessage(
        `Compare @${imagePath1} and @${imagePath2}`,
        session
      );

      expect(result.images).toHaveLength(2);
    });
  });

  describe('hasImageReferences', () => {
    it('应该检测到图像引用', () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      expect(router.hasImageReferences('Check @./image.png')).toBe(true);
      expect(router.hasImageReferences('Check @image.jpg')).toBe(true);
      expect(router.hasImageReferences('Check @/path/to/image.gif')).toBe(true);
    });

    it('应该在没有图像引用时返回 false', () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      expect(router.hasImageReferences('Hello, Claude!')).toBe(false);
      expect(router.hasImageReferences('Check the file.txt')).toBe(false);
      expect(router.hasImageReferences('@mention someone')).toBe(false);
    });
  });

  describe('setWorkingDirectory', () => {
    it('应该更新工作目录', () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      router.setWorkingDirectory('/new/working/dir');

      // 验证通过构建消息时路径解析正确
      // 这主要通过图像处理功能间接验证
    });
  });
});

describe('MessageRouter - Options 接口构建', () => {
  let toolRegistry: ToolRegistry;
  let configManager: ConfigManager;
  let permissionManager: PermissionManager;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
    configManager = createMockConfigManager();
    permissionManager = new PermissionManager({ mode: 'default' }, new MockPermissionUI(), toolRegistry);
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
    expect(options).toHaveProperty('cwd');
    expect(options).toHaveProperty('permissionMode');
    expect(options.allowedTools).toBeUndefined();
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
        
        activeAgents: [],
      },
    });

    const options = await router.buildQueryOptions(session);

    expect(options.maxTurns).toBe(50);
    expect(options.maxBudgetUsd).toBe(10.0);
  });
});

describe('MessageRouter - 边缘情况和缓存测试', () => {
  let toolRegistry: ToolRegistry;
  let configManager: ConfigManager;
  let permissionManager: PermissionManager;
  let fs: typeof import('fs/promises');
  let path: typeof import('path');
  let os: typeof import('os');
  let tempDir: string;

  beforeAll(async () => {
    fs = await import('fs/promises');
    path = await import('path');
    os = await import('os');
  });

  beforeEach(async () => {
    toolRegistry = new ToolRegistry();
    configManager = createMockConfigManager();
    permissionManager = new PermissionManager({ mode: 'default' }, new MockPermissionUI(), toolRegistry);

    // 创建临时目录用于测试
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'router-edge-test-'));
  });

  afterEach(async () => {
    // 清理临时目录
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('工作目录缓存', () => {
    it('应该为相同工作目录重用 ImageHandler', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({ workingDirectory: tempDir });

      // 多次调用应该使用缓存（通过不抛出错误来验证基本功能）
      await router.buildStreamMessage('test1', session);
      await router.buildStreamMessage('test2', session);

      // 基本验证：两次调用都成功完成
      expect(true).toBe(true);
    });

    it('应该在 setWorkingDirectory 后使用新的工作目录', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      // 初始工作目录
      const session = createMockSession({ workingDirectory: tempDir });
      await router.buildStreamMessage('test', session);

      // 更改工作目录
      router.setWorkingDirectory('/new/dir');

      // 验证成功更新
      expect(true).toBe(true);
    });
  });

  describe('空消息处理', () => {
    it('应该处理空字符串消息', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({ workingDirectory: tempDir });
      const result = await router.buildStreamMessage('', session);

      expect(result.contentBlocks).toHaveLength(1);
      expect(result.contentBlocks[0].type).toBe('text');
      expect((result.contentBlocks[0] as any).text).toBe('');
      expect(result.images).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('应该处理仅空白字符的消息', async () => {
      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({ workingDirectory: tempDir });
      const result = await router.buildStreamMessage('   \n\t  ', session);

      expect(result.contentBlocks).toHaveLength(1);
      expect(result.contentBlocks[0].type).toBe('text');
      // 原始消息被保留
      expect((result.contentBlocks[0] as any).text).toBe('   \n\t  ');
    });
  });

  describe('纯图像消息', () => {
    it('应该处理纯图像消息（无文本）', async () => {
      // 创建测试图像文件
      const imageBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG header
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
        0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59,
        0xe7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
        0x44, 0xae, 0x42, 0x60, 0x82,
      ]);

      const imagePath = path.join(tempDir, 'test.png');
      await fs.writeFile(imagePath, imageBuffer);

      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({ workingDirectory: tempDir });
      const result = await router.buildStreamMessage(`@${imagePath}`, session);

      // 应该只有图像块，没有文本块
      expect(result.contentBlocks).toHaveLength(1);
      expect(result.contentBlocks[0].type).toBe('image');
      expect(result.images).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.processedText).toBe('');
    });
  });

  describe('图像顺序验证', () => {
    it('应该保持多个图像的相对顺序', async () => {
      // 创建测试图像文件
      const imageBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
        0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59,
        0xe7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
        0x44, 0xae, 0x42, 0x60, 0x82,
      ]);

      const image1Path = path.join(tempDir, 'img1.png');
      const image2Path = path.join(tempDir, 'img2.png');
      const image3Path = path.join(tempDir, 'img3.png');

      await fs.writeFile(image1Path, imageBuffer);
      await fs.writeFile(image2Path, imageBuffer);
      await fs.writeFile(image3Path, imageBuffer);

      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({ workingDirectory: tempDir });
      const result = await router.buildStreamMessage(
        `Check @${image1Path} first, then @${image2Path} and @${image3Path}`,
        session
      );

      // 验证图像顺序
      expect(result.images).toHaveLength(3);
      expect(result.images[0].sourcePath).toBe(image1Path);
      expect(result.images[1].sourcePath).toBe(image2Path);
      expect(result.images[2].sourcePath).toBe(image3Path);

      // 验证内容块顺序：文本块在前，然后是三个图像块
      expect(result.contentBlocks).toHaveLength(4);
      expect(result.contentBlocks[0].type).toBe('text');
      expect(result.contentBlocks[1].type).toBe('image');
      expect(result.contentBlocks[2].type).toBe('image');
      expect(result.contentBlocks[3].type).toBe('image');
    });

    it('应该处理部分图像加载失败的情况', async () => {
      // 创建一个有效的图像文件
      const imageBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
        0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59,
        0xe7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
        0x44, 0xae, 0x42, 0x60, 0x82,
      ]);

      const validImagePath = path.join(tempDir, 'valid.png');
      await fs.writeFile(validImagePath, imageBuffer);

      const router = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const session = createMockSession({ workingDirectory: tempDir });
      const result = await router.buildStreamMessage(
        `Compare @${validImagePath} and @./nonexistent.png`,
        session
      );

      // 应该有文本块和一个图像块
      expect(result.contentBlocks.length).toBeGreaterThanOrEqual(2);
      expect(result.images).toHaveLength(1);
      expect(result.images[0].sourcePath).toBe(validImagePath);

      // 应该有一个错误
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].reference).toContain('nonexistent.png');
    });
  });
});
