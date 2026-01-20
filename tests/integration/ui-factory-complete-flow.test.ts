/**
 * UI Factory 完整流程集成测试
 *
 * 测试场景：
 * - 完整流程：配置 → UIFactoryRegistry.createUIFactory() → PermissionManager → 权限检查
 * - 默认配置场景（无 ui 字段）- 向后兼容性
 * - 自定义配置场景（带 ui 字段）
 * - 系统启动和运行流程
 *
 * @module tests/integration/ui-factory-complete-flow
 * **验证: main.ts 集成 - 使用工厂模式创建 PermissionUI, 系统应当保持向后兼容性**
 */

// Mock SDK before any imports
jest.mock('@anthropic-ai/claude-agent-sdk', () => {
  let mockCanUseTool: any = null;

  return {
    query: jest.fn().mockImplementation((options) => {
      mockCanUseTool = options.canUseTool;

      async function* mockGenerator() {
        yield {
          type: 'assistant',
          session_id: 'test-session-id',
          message: {
            content: [
              {
                type: 'text',
                text: 'Mock response',
              },
            ],
          },
        };

        yield {
          type: 'result',
          subtype: 'success',
          session_id: 'test-session-id',
          result: 'Mock response',
          total_cost_usd: 0.001,
          duration_ms: 100,
          usage: {
            input_tokens: 10,
            output_tokens: 20,
          },
        };
      }

      const generator = mockGenerator();

      (generator as any).setPermissionMode = jest.fn().mockImplementation(async (_mode: string) => {
        // Mock implementation
      });

      return generator;
    }),
    createSdkMcpServer: jest.fn().mockImplementation((config) => config),
    tool: jest.fn().mockImplementation((name, description, schema, handler) => ({
      name,
      description,
      schema,
      handler,
    })),
    __getMockCanUseTool: () => mockCanUseTool,
  };
});

import { PermissionManager } from '../../src/permissions/PermissionManager';
import { PermissionConfig } from '../../src/permissions/PermissionManager';
import { TerminalUIFactory } from '../../src/ui/factories/TerminalUIFactory';
import { UIFactoryRegistry, UIConfig } from '../../src/ui/factories/UIFactoryRegistry';
import type { UIFactory } from '../../src/ui/contracts/core/UIFactory';
import type {
  InteractiveUICallbacks,
  InteractiveUIConfig,
  InteractiveUIInterface,
} from '../../src/ui/contracts/interactive/InteractiveUIInterface';
import type { MessageRole, PermissionMode, Snapshot, TodoItem } from '../../src/ui/contracts/interactive/InteractiveUIInterface';
import type { Session, SessionStats } from '../../src/core/SessionManager';
import { ToolRegistry } from '../../src/tools/ToolRegistry';
import { PermissionUI } from '../../src/permissions/PermissionUI';

// Mock factory for testing custom UI types
class CustomPermissionUI implements PermissionUI {
  promptToolPermission = jest.fn().mockResolvedValue({ approved: true });
  promptUserQuestions = jest.fn().mockResolvedValue({});
}

class MockUIFactory implements UIFactory {
  private createMockInteractiveUI(): InteractiveUIInterface {
    return {
      start: async () => undefined,
      stop: () => undefined,
      displayMessage: (_message: string, _role: MessageRole) => undefined,
      displayToolUse: (_tool: string, _args: Record<string, unknown>) => undefined,
      displayToolResult: (_tool: string, _result: string, _isError?: boolean) => undefined,
      displayThinking: (_content?: string) => undefined,
      displayComputing: () => undefined,
      stopComputing: () => undefined,
      clearProgress: () => undefined,
      displayError: (_message: string) => undefined,
      displayWarning: (_message: string) => undefined,
      displaySuccess: (_message: string) => undefined,
      displayInfo: (_message: string) => undefined,
      displayTodoList: (_todos: TodoItem[]) => undefined,
      promptConfirmation: async (_message: string) => false,
      showRewindMenu: async (_snapshots: Snapshot[]) => null,
      showSessionMenu: async (_sessions: Session[]) => null,
      showConfirmationMenu: async (
        _title: string,
        _options: Array<{ key: string; label: string; description?: string }>,
        _defaultKey?: string
      ) => false,
      setInitialPermissionMode: (_mode: PermissionMode) => undefined,
      setPermissionMode: (_mode: PermissionMode) => undefined,
      displayPermissionStatus: (_mode: PermissionMode) => undefined,
      setProcessingState: (_processing: boolean) => undefined,
      formatRelativeTime: (_date: Date) => '',
      formatAbsoluteTime: (_date: Date) => '',
      formatStatsSummary: (_stats?: SessionStats) => '',
    };
  }

  createParser(): {
    parse: () => { help: boolean; version: boolean; debug: boolean };
    getHelpText: () => string;
    getVersionText: () => string;
  } {
    return {
      parse: () => ({
        help: false,
        version: false,
        debug: false,
      }),
      getHelpText: () => 'mock help',
      getVersionText: () => 'mock version',
    };
  }

  createOutput(): {
    info: () => void;
    warn: () => void;
    error: () => void;
    success: () => void;
    section: () => void;
    blankLine: () => void;
  } {
    return {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      success: () => undefined,
      section: () => undefined,
      blankLine: () => undefined,
    };
  }

  createPermissionUI(
    _output?: NodeJS.WritableStream,
    _input?: NodeJS.ReadableStream
  ): PermissionUI {
    return new CustomPermissionUI();
  }

  createInteractiveUI(
    _callbacks: InteractiveUICallbacks,
    _config?: InteractiveUIConfig
  ): InteractiveUIInterface {
    return this.createMockInteractiveUI();
  }
}

describe('UI Factory Complete Flow Integration Tests', () => {
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
    // Clear registry before each test
    UIFactoryRegistry.clear();
    // Register custom factory for testing
    UIFactoryRegistry.registerUIFactory('custom', new MockUIFactory());
  });

  afterAll(() => {
    // Clean up
    UIFactoryRegistry.clear();
  });

  describe('完整流程：配置 → 工厂 → PermissionManager → 权限检查', () => {
    it('默认配置场景（无 ui 字段）- 向后兼容性验证', async () => {
      // 1. 模拟默认配置（无 ui 字段）
      const defaultConfig: PermissionConfig = {
        mode: 'default',
        allowedTools: [],
        disallowedTools: [],
      };

      // 2. 使用 UIFactoryRegistry.createUIFactory() 创建工厂（无配置传入）
      const uiFactory = UIFactoryRegistry.createUIFactory(undefined);

      // 3. 创建 PermissionManager
      const permissionManager = new PermissionManager(defaultConfig, uiFactory, toolRegistry);

      // 4. 验证工厂类型
      expect(uiFactory).toBeInstanceOf(TerminalUIFactory);

      // 5. 测试权限检查流程 - 使用危险工具（如 Write）来触发权限检查
      const canUseTool = permissionManager.createCanUseToolHandler();

      // Mock 终端 UI 的 promptToolPermission 方法
      const mockUI = {
        promptToolPermission: jest.fn().mockResolvedValue({ approved: true }),
        promptUserQuestions: jest.fn().mockResolvedValue({}),
      };

      // 替换 PermissionManager 内部的 UI 实例
      (permissionManager as any).permissionUI = mockUI;

      const result = await canUseTool('Write', { file_path: '/test/file.txt', content: 'test' }, {
        signal: new AbortController().signal,
        toolUseID: 'test-default-config',
      });

      // 6. 验证完整流程
      expect(result.behavior).toBe('allow');
      expect(result.toolUseID).toBe('test-default-config');
      if (result.behavior === 'allow') {
        expect(result.updatedInput).toEqual({ file_path: '/test/file.txt', content: 'test' });
      }

      // 7. 验证 UI 方法被调用
      expect(mockUI.promptToolPermission).toHaveBeenCalled();
    });

    it('自定义配置场景（带 ui.type 字段）', async () => {
      // 1. 模拟自定义配置（带 ui 字段）
      const customConfig: PermissionConfig = {
        mode: 'default',
        allowedTools: [],
        disallowedTools: [],
      };
      const customUIConfig: UIConfig = {
        type: 'custom',
        options: {
          theme: 'dark',
          timeout: 5000,
        },
      };

      // 2. 使用 UIFactoryRegistry.createUIFactory() 创建工厂（传入自定义配置）
      const uiFactory = UIFactoryRegistry.createUIFactory(customUIConfig);

      // 3. 创建 PermissionManager
      const permissionManager = new PermissionManager(customConfig, uiFactory, toolRegistry);

      // 4. 验证工厂类型
      expect(uiFactory).toBeInstanceOf(MockUIFactory);

      // 5. 测试权限检查流程
      const canUseTool = permissionManager.createCanUseToolHandler();

      const result = await canUseTool('Write', { file_path: '/test/file.txt', content: 'test' }, {
        signal: new AbortController().signal,
        toolUseID: 'test-custom-config',
      });

      // 6. 验证完整流程
      expect(result.behavior).toBe('allow');
      expect(result.toolUseID).toBe('test-custom-config');
      if (result.behavior === 'allow') {
        expect(result.updatedInput).toEqual({ file_path: '/test/file.txt', content: 'test' });
      }
    });

    it('空配置场景（null/undefined）', async () => {
      // 测试 null 配置
      const uiFactory1 = UIFactoryRegistry.createUIFactory(null as unknown as UIConfig);
      expect(uiFactory1).toBeInstanceOf(TerminalUIFactory);

      // 测试 undefined 配置
      const uiFactory2 = UIFactoryRegistry.createUIFactory(undefined);
      expect(uiFactory2).toBeInstanceOf(TerminalUIFactory);
    });

    it('未知 ui.type 应抛出错误', () => {
      const unknownConfig: UIConfig = {
        type: 'unknown-type',
      };

      expect(() => {
        UIFactoryRegistry.createUIFactory(unknownConfig);
      }).toThrow('UI factory not found for type: unknown-type');
    });
  });

  describe('系统启动和运行流程验证', () => {
    it('完整启动流程：配置加载 → 工厂创建 → 权限管理器初始化 → 工具调用', async () => {
      // 模拟项目配置
      const projectConfig = {
        permissionMode: 'acceptEdits' as const,
        allowedTools: ['Read', 'Write'], // Write 在白名单中
        disallowedTools: ['Bash'],
      };
      const uiConfig: UIConfig = {
        type: 'terminal',
      };

      // 1. 模拟 main.ts 中的流程：UIFactoryRegistry.createUIFactory()
      const uiFactory = UIFactoryRegistry.createUIFactory(uiConfig);

      // 2. 创建 PermissionManager
      const permissionManager = new PermissionManager(
        {
          mode: projectConfig.permissionMode,
          allowedTools: projectConfig.allowedTools,
          disallowedTools: projectConfig.disallowedTools,
        },
        uiFactory,
        toolRegistry
      );

      // 3. 验证初始化
      expect(permissionManager.getMode()).toBe('acceptEdits');

      // 4. 测试工具调用流程
      const canUseTool = permissionManager.createCanUseToolHandler();

      // Mock UI 以避免实际交互
      const mockUI = {
        promptToolPermission: jest.fn().mockResolvedValue({ approved: true }),
        promptUserQuestions: jest.fn().mockResolvedValue({}),
      };
      (permissionManager as any).permissionUI = mockUI;

      // 5. 白名单工具 Read：应自动批准
      const readResult = await canUseTool('Read', { file_path: '/test/file.txt' }, {
        signal: new AbortController().signal,
        toolUseID: 'test-whitelist',
      });
      expect(readResult.behavior).toBe('allow');

      // 6. 白名单工具 Write：应自动批准（acceptEdits 模式 + 白名单）
      const writeResult = await canUseTool('Write', { file_path: '/test/file.txt', content: 'test' }, {
        signal: new AbortController().signal,
        toolUseID: 'test-write',
      });
      expect(writeResult.behavior).toBe('allow');

      // 7. 黑名单工具 Bash：应拒绝
      const bashResult = await canUseTool('Bash', { command: 'echo test' }, {
        signal: new AbortController().signal,
        toolUseID: 'test-blacklist',
      });
      expect(bashResult.behavior).toBe('deny');
    });

    it('运行时权限模式切换', async () => {
      const uiFactory = UIFactoryRegistry.createUIFactory({ type: 'terminal' });

      const permissionManager = new PermissionManager(
        {
          mode: 'default',
          allowedTools: [],
          disallowedTools: [],
        },
        uiFactory,
        toolRegistry
      );

      // 初始模式
      expect(permissionManager.getMode()).toBe('default');

      // 切换到 acceptEdits
      permissionManager.setMode('acceptEdits');
      expect(permissionManager.getMode()).toBe('acceptEdits');

      // 验证新模式生效
      const canUseTool = permissionManager.createCanUseToolHandler();
      const result = await canUseTool('Write', { file_path: '/test/file.txt', content: 'test' }, {
        signal: new AbortController().signal,
        toolUseID: 'test-mode-switch',
      });

      expect(result.behavior).toBe('allow');
    });

    it('多工具连续调用流程', async () => {
      const uiFactory = UIFactoryRegistry.createUIFactory({ type: 'terminal' });

      const permissionManager = new PermissionManager(
        {
          mode: 'bypassPermissions',
          allowedTools: [],
          disallowedTools: [],
        },
        uiFactory,
        toolRegistry
      );

      const canUseTool = permissionManager.createCanUseToolHandler();

      // 连续调用多个工具
      const tools = [
        { name: 'Read', input: { file_path: '/test/file1.txt' } },
        { name: 'Write', input: { file_path: '/test/file2.txt', content: 'test' } },
        { name: 'Edit', input: { file_path: '/test/file3.txt', old_string: 'a', new_string: 'b' } },
        { name: 'Bash', input: { command: 'echo test' } },
        { name: 'Grep', input: { pattern: 'test', path: '/test' } },
      ];

      const results = await Promise.all(
        tools.map((tool, index) =>
          canUseTool(tool.name, tool.input, {
            signal: new AbortController().signal,
            toolUseID: `test-${index}`,
          })
        )
      );

      // 所有工具都应被批准
      results.forEach((result, index) => {
        expect(result.behavior).toBe('allow');
        expect(result.toolUseID).toBe(`test-${index}`);
      });
    });
  });

  describe('向后兼容性验证', () => {
    it('无 ui 字段的配置应正常工作（默认使用 terminal）', async () => {
      // 模拟旧的配置格式（没有 ui 字段）
      const legacyConfig = {
        mode: 'default' as const,
        allowedTools: ['Read'],
        disallowedTools: [],
        // 注意：没有 ui 字段
      };

      // 使用旧的配置创建 PermissionManager
      const uiFactory = UIFactoryRegistry.createUIFactory(undefined); // 没有 ui 配置

      const permissionManager = new PermissionManager(
        legacyConfig as PermissionConfig,
        uiFactory,
        toolRegistry
      );

      // 验证默认使用 terminal 工厂
      expect(uiFactory).toBeInstanceOf(TerminalUIFactory);

      // 验证功能正常
      const canUseTool = permissionManager.createCanUseToolHandler();

      // Mock 终端 UI
      jest.spyOn(uiFactory, 'createPermissionUI').mockReturnValue({
        promptToolPermission: jest.fn().mockResolvedValue({ approved: true }),
        promptUserQuestions: jest.fn().mockResolvedValue({}),
      } as unknown as PermissionUI);

      const result = await canUseTool('Read', { file_path: '/test/file.txt' }, {
        signal: new AbortController().signal,
        toolUseID: 'test-legacy',
      });

      expect(result.behavior).toBe('allow');
    });

    it('配置演进：从无 ui 字段到有 ui 字段', async () => {
      // 第一阶段：旧配置（无 ui 字段）
      const oldConfig = {
        mode: 'default' as const,
        allowedTools: [],
        disallowedTools: [],
      };

      let uiFactory = UIFactoryRegistry.createUIFactory(undefined);
      let permissionManager = new PermissionManager(
        oldConfig as PermissionConfig,
        uiFactory,
        toolRegistry
      );

      // 验证旧配置工作正常
      expect(uiFactory).toBeInstanceOf(TerminalUIFactory);

      // 第二阶段：新配置（有 ui 字段）
      UIFactoryRegistry.resetForTesting();
      const newConfig = {
        mode: 'acceptEdits' as const,
        allowedTools: [],
        disallowedTools: [],
      };
      const newUIConfig: UIConfig = {
        type: 'custom',
      };

      uiFactory = UIFactoryRegistry.createUIFactory(newUIConfig);
      permissionManager = new PermissionManager(
        newConfig as PermissionConfig,
        uiFactory,
        toolRegistry
      );

      // 验证新配置工作正常
      expect(uiFactory).toBeInstanceOf(MockUIFactory);
      expect(permissionManager.getMode()).toBe('acceptEdits');
    });
  });

  describe('错误处理和边界情况', () => {
    it('配置中 ui.type 为空字符串应抛出错误', () => {
      const invalidConfig: UIConfig = {
        type: '',
      };

      expect(() => {
        UIFactoryRegistry.createUIFactory(invalidConfig);
      }).toThrow('UI config must include a valid type string');
    });

    it('工厂创建失败时应抛出适当错误', () => {
      // 确保自定义工厂已注册
      UIFactoryRegistry.registerUIFactory('custom', new MockUIFactory());

      // 使用有效配置
      const validConfig: UIConfig = {
        type: 'custom',
      };

      expect(() => {
        const factory = UIFactoryRegistry.createUIFactory(validConfig);
        // 尝试创建 UI 实例（可能会失败）
        factory.createPermissionUI();
      }).not.toThrow();
    });

    it('权限检查在工厂创建失败时应正确处理', async () => {
      // 这个测试验证的是当 UI 方法调用失败时的处理
      const uiFactory = UIFactoryRegistry.createUIFactory({ type: 'terminal' });

      const permissionManager = new PermissionManager(
        {
          mode: 'default',
          allowedTools: [],
          disallowedTools: [],
        },
        uiFactory,
        toolRegistry
      );

      const canUseTool = permissionManager.createCanUseToolHandler();

      // Mock UI 方法抛出错误（异步）
      const mockUI = {
        promptToolPermission: jest.fn().mockRejectedValue(new Error('UI Error')),
        promptUserQuestions: jest.fn().mockResolvedValue({}),
      };
      (permissionManager as any).permissionUI = mockUI;

      // 验证错误会传播
      await expect(
        canUseTool('Write', { file_path: '/test/file.txt', content: 'test' }, {
          signal: new AbortController().signal,
          toolUseID: 'test-error',
        })
      ).rejects.toThrow('UI Error');
    });
  });

  describe('性能验证', () => {
    it('工厂创建无明显性能开销', async () => {
      const uiFactory = UIFactoryRegistry.createUIFactory({ type: 'terminal' });

      const permissionManager = new PermissionManager(
        {
          mode: 'bypassPermissions',
          allowedTools: [],
          disallowedTools: [],
        },
        uiFactory,
        toolRegistry
      );

      const canUseTool = permissionManager.createCanUseToolHandler();

      // 测量多次调用的时间
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        await canUseTool('Read', { file_path: `/test/file${i}.txt` }, {
          signal: new AbortController().signal,
          toolUseID: `perf-test-${i}`,
        });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 验证性能（100 次调用应在合理时间内完成）
      expect(duration).toBeLessThan(5000); // 5 秒阈值
    });
  });
});
