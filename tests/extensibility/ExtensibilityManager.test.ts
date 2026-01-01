/**
 * ExtensibilityManager 测试
 *
 * 测试扩展性架构管理器的核心功能：
 * - 自定义工具注册
 * - 工具参数验证
 * - 工具错误处理
 * - 工具钩子点
 * - 工具异步执行和流式输出
 *
 * **验证: 需求 30.1, 30.2, 30.3, 30.4, 30.5, 30.6**
 */

import {
  ExtensibilityManager,
  CustomToolDefinition,
  ToolExecutionContext,
  StreamChunk,
} from '../../src/extensibility/ExtensibilityManager';

describe('ExtensibilityManager', () => {
  let manager: ExtensibilityManager;

  const createTestContext = (): ToolExecutionContext => ({
    sessionId: 'test-session',
    messageUuid: 'test-message',
    workingDir: '/test/dir',
  });

  const createSimpleTool = (name: string = 'testTool'): CustomToolDefinition => ({
    name,
    description: '测试工具',
    parameters: [
      {
        name: 'input',
        type: 'string',
        description: '输入参数',
        required: true,
      },
    ],
    executor: async (args) => ({
      success: true,
      output: `处理: ${args.input}`,
    }),
  });

  beforeEach(() => {
    manager = new ExtensibilityManager({ debug: false });
  });

  afterEach(() => {
    manager.reset();
  });

  // ==================== 工具注册测试 ====================

  describe('工具注册', () => {
    it('应该成功注册有效的工具', () => {
      const tool = createSimpleTool();
      manager.registerTool(tool);

      expect(manager.hasTool('testTool')).toBe(true);
      expect(manager.getToolCount()).toBe(1);
    });

    it('应该拒绝注册重复的工具名称', () => {
      const tool = createSimpleTool();
      manager.registerTool(tool);

      expect(() => manager.registerTool(tool)).toThrow('已注册');
    });

    it('应该拒绝无效的工具名称', () => {
      const tool = createSimpleTool('123invalid');

      expect(() => manager.registerTool(tool)).toThrow('工具名称必须以字母开头');
    });

    it('应该拒绝空的工具名称', () => {
      const tool = createSimpleTool('');

      expect(() => manager.registerTool(tool)).toThrow('工具名称必须是非空字符串');
    });

    it('应该成功注销已注册的工具', () => {
      const tool = createSimpleTool();
      manager.registerTool(tool);

      const result = manager.unregisterTool('testTool');

      expect(result).toBe(true);
      expect(manager.hasTool('testTool')).toBe(false);
    });

    it('注销不存在的工具应返回 false', () => {
      const result = manager.unregisterTool('nonexistent');
      expect(result).toBe(false);
    });

    it('应该返回所有已注册的工具', () => {
      manager.registerTool(createSimpleTool('tool1'));
      manager.registerTool(createSimpleTool('tool2'));
      manager.registerTool(createSimpleTool('tool3'));

      const tools = manager.getAllTools();

      expect(tools).toHaveLength(3);
      expect(tools.map(t => t.name).sort()).toEqual(['tool1', 'tool2', 'tool3']);
    });

    it('应该获取指定的工具', () => {
      const tool = createSimpleTool();
      manager.registerTool(tool);

      const retrieved = manager.getTool('testTool');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('testTool');
    });

    it('获取不存在的工具应返回 undefined', () => {
      const retrieved = manager.getTool('nonexistent');
      expect(retrieved).toBeUndefined();
    });
  });

  // ==================== 参数验证测试 ====================

  describe('参数验证', () => {
    it('应该验证必需参数', async () => {
      const tool = createSimpleTool();
      manager.registerTool(tool);

      const result = await manager.executeTool('testTool', {}, createTestContext());

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PARAMETER_VALIDATION_ERROR');
      expect(result.error).toContain('缺少必需参数');
    });

    it('应该验证参数类型', async () => {
      const tool: CustomToolDefinition = {
        name: 'typedTool',
        description: '类型验证工具',
        parameters: [
          {
            name: 'count',
            type: 'number',
            description: '数量',
            required: true,
          },
        ],
        executor: async () => ({ success: true }),
      };
      manager.registerTool(tool);

      const result = await manager.executeTool(
        'typedTool',
        { count: 'not a number' },
        createTestContext()
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PARAMETER_VALIDATION_ERROR');
      expect(result.error).toContain('类型错误');
    });

    it('应该验证字符串枚举值', async () => {
      const tool: CustomToolDefinition = {
        name: 'enumTool',
        description: '枚举验证工具',
        parameters: [
          {
            name: 'status',
            type: 'string',
            description: '状态',
            required: true,
            enum: ['active', 'inactive', 'pending'],
          },
        ],
        executor: async () => ({ success: true }),
      };
      manager.registerTool(tool);

      const result = await manager.executeTool(
        'enumTool',
        { status: 'invalid' },
        createTestContext()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('必须是以下值之一');
    });

    it('应该验证数字范围', async () => {
      const tool: CustomToolDefinition = {
        name: 'rangeTool',
        description: '范围验证工具',
        parameters: [
          {
            name: 'value',
            type: 'number',
            description: '值',
            required: true,
            minimum: 0,
            maximum: 100,
          },
        ],
        executor: async () => ({ success: true }),
      };
      manager.registerTool(tool);

      const result = await manager.executeTool(
        'rangeTool',
        { value: 150 },
        createTestContext()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('不能大于');
    });

    it('应该验证字符串长度', async () => {
      const tool: CustomToolDefinition = {
        name: 'lengthTool',
        description: '长度验证工具',
        parameters: [
          {
            name: 'text',
            type: 'string',
            description: '文本',
            required: true,
            minLength: 5,
            maxLength: 10,
          },
        ],
        executor: async () => ({ success: true }),
      };
      manager.registerTool(tool);

      const result = await manager.executeTool(
        'lengthTool',
        { text: 'ab' },
        createTestContext()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('长度不能小于');
    });

    it('应该验证正则表达式模式', async () => {
      const tool: CustomToolDefinition = {
        name: 'patternTool',
        description: '模式验证工具',
        parameters: [
          {
            name: 'email',
            type: 'string',
            description: '邮箱',
            required: true,
            pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
          },
        ],
        executor: async () => ({ success: true }),
      };
      manager.registerTool(tool);

      const result = await manager.executeTool(
        'patternTool',
        { email: 'invalid-email' },
        createTestContext()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('不匹配模式');
    });

    it('应该验证数组长度', async () => {
      const tool: CustomToolDefinition = {
        name: 'arrayTool',
        description: '数组验证工具',
        parameters: [
          {
            name: 'items',
            type: 'array',
            description: '项目列表',
            required: true,
            minLength: 1,
            maxLength: 5,
          },
        ],
        executor: async () => ({ success: true }),
      };
      manager.registerTool(tool);

      const result = await manager.executeTool(
        'arrayTool',
        { items: [] },
        createTestContext()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('数组长度不能小于');
    });

    it('应该验证数组元素类型', async () => {
      const tool: CustomToolDefinition = {
        name: 'typedArrayTool',
        description: '类型数组验证工具',
        parameters: [
          {
            name: 'numbers',
            type: 'array',
            description: '数字列表',
            required: true,
            items: { type: 'number' },
          },
        ],
        executor: async () => ({ success: true }),
      };
      manager.registerTool(tool);

      const result = await manager.executeTool(
        'typedArrayTool',
        { numbers: [1, 2, 'three'] },
        createTestContext()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('类型错误');
    });

    it('应该使用默认值', async () => {
      let receivedArgs: Record<string, unknown> = {};
      const tool: CustomToolDefinition = {
        name: 'defaultTool',
        description: '默认值工具',
        parameters: [
          {
            name: 'value',
            type: 'string',
            description: '值',
            required: false,
            default: 'default-value',
          },
        ],
        executor: async (args) => {
          receivedArgs = args;
          return { success: true };
        },
      };
      manager.registerTool(tool);

      await manager.executeTool('defaultTool', {}, createTestContext());

      expect(receivedArgs.value).toBe('default-value');
    });
  });

  // ==================== 工具执行测试 ====================

  describe('工具执行', () => {
    it('应该成功执行工具', async () => {
      const tool = createSimpleTool();
      manager.registerTool(tool);

      const result = await manager.executeTool(
        'testTool',
        { input: 'hello' },
        createTestContext()
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('处理: hello');
      expect(result.executionTime).toBeDefined();
    });

    it('执行不存在的工具应返回错误', async () => {
      const result = await manager.executeTool(
        'nonexistent',
        {},
        createTestContext()
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TOOL_NOT_FOUND');
    });

    it('应该处理工具执行错误', async () => {
      const tool: CustomToolDefinition = {
        name: 'errorTool',
        description: '错误工具',
        parameters: [],
        executor: async () => {
          throw new Error('执行失败');
        },
      };
      manager.registerTool(tool);

      const result = await manager.executeTool('errorTool', {}, createTestContext());

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('EXECUTION_ERROR');
      expect(result.error).toContain('执行失败');
    });

    it('应该处理工具超时', async () => {
      const tool: CustomToolDefinition = {
        name: 'slowTool',
        description: '慢工具',
        parameters: [],
        timeout: 100, // 100ms 超时
        executor: async () => {
          await new Promise(resolve => setTimeout(resolve, 500));
          return { success: true };
        },
      };
      manager.registerTool(tool);

      const result = await manager.executeTool('slowTool', {}, createTestContext());

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TIMEOUT');
    });

    it('应该限制并发执行数', async () => {
      const limitedManager = new ExtensibilityManager({
        maxConcurrentExecutions: 1,
      });

      const tool: CustomToolDefinition = {
        name: 'concurrentTool',
        description: '并发工具',
        parameters: [],
        executor: async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return { success: true };
        },
      };
      limitedManager.registerTool(tool);

      // 启动第一个执行
      const promise1 = limitedManager.executeTool('concurrentTool', {}, createTestContext());

      // 立即尝试第二个执行
      const result2 = await limitedManager.executeTool('concurrentTool', {}, createTestContext());

      expect(result2.success).toBe(false);
      expect(result2.errorCode).toBe('MAX_CONCURRENT_EXCEEDED');

      // 等待第一个完成
      const result1 = await promise1;
      expect(result1.success).toBe(true);
    });
  });

  // ==================== 工具钩子测试 ====================

  describe('工具钩子', () => {
    it('应该触发 beforeExecute 钩子', async () => {
      const tool = createSimpleTool();
      manager.registerTool(tool);

      let hookCalled = false;
      manager.addToolHook('beforeExecute', (context) => {
        hookCalled = true;
        expect(context.toolName).toBe('testTool');
        expect(context.args).toEqual({ input: 'test' });
      });

      await manager.executeTool('testTool', { input: 'test' }, createTestContext());

      expect(hookCalled).toBe(true);
    });

    it('应该触发 afterExecute 钩子', async () => {
      const tool = createSimpleTool();
      manager.registerTool(tool);

      let hookCalled = false;
      manager.addToolHook('afterExecute', (context) => {
        hookCalled = true;
        expect(context.result).toBeDefined();
        expect(context.result?.success).toBe(true);
      });

      await manager.executeTool('testTool', { input: 'test' }, createTestContext());

      expect(hookCalled).toBe(true);
    });

    it('应该触发 onError 钩子', async () => {
      const tool: CustomToolDefinition = {
        name: 'errorTool',
        description: '错误工具',
        parameters: [],
        executor: async () => {
          throw new Error('测试错误');
        },
      };
      manager.registerTool(tool);

      let hookCalled = false;
      manager.addToolHook('onError', (context) => {
        hookCalled = true;
        expect(context.error).toBeDefined();
        expect(context.error?.message).toBe('测试错误');
      });

      await manager.executeTool('errorTool', {}, createTestContext());

      expect(hookCalled).toBe(true);
    });

    it('应该成功移除钩子', () => {
      const handler = () => {};
      manager.addToolHook('beforeExecute', handler);

      const result = manager.removeToolHook('beforeExecute', handler);

      expect(result).toBe(true);
    });

    it('移除不存在的钩子应返回 false', () => {
      const result = manager.removeToolHook('beforeExecute', () => {});
      expect(result).toBe(false);
    });

    it('应该清除指定事件的所有钩子', async () => {
      let callCount = 0;
      manager.addToolHook('beforeExecute', () => { callCount++; });
      manager.addToolHook('beforeExecute', () => { callCount++; });

      manager.clearToolHooks('beforeExecute');

      const tool = createSimpleTool();
      manager.registerTool(tool);
      await manager.executeTool('testTool', { input: 'test' }, createTestContext());

      expect(callCount).toBe(0);
    });
  });

  // ==================== 流式执行测试 ====================

  describe('流式执行', () => {
    it('应该支持流式输出', async () => {
      const tool: CustomToolDefinition = {
        name: 'streamingTool',
        description: '流式工具',
        parameters: [],
        supportsStreaming: true,
        executor: async () => ({ success: true }),
        streamingExecutor: async function* () {
          yield { type: 'text', content: 'chunk1' };
          yield { type: 'text', content: 'chunk2' };
          yield { type: 'progress', content: '50%', progress: 50 };
          yield { type: 'text', content: 'chunk3' };
          return { success: true, output: 'done' };
        },
      };
      manager.registerTool(tool);

      const chunks: StreamChunk[] = [];
      const generator = manager.executeToolStreaming('streamingTool', {}, createTestContext());

      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(4);
      expect(chunks[0].content).toBe('chunk1');
      expect(chunks[2].type).toBe('progress');
      expect(chunks[2].progress).toBe(50);
    });

    it('流式执行应触发 onStream 钩子', async () => {
      const tool: CustomToolDefinition = {
        name: 'streamingTool',
        description: '流式工具',
        parameters: [],
        executor: async () => ({ success: true }),
        streamingExecutor: async function* () {
          yield { type: 'text', content: 'test' };
          return { success: true };
        },
      };
      manager.registerTool(tool);

      let hookCalled = false;
      manager.addToolHook('onStream', (context) => {
        hookCalled = true;
        expect(context.chunk).toBeDefined();
      });

      const generator = manager.executeToolStreaming('streamingTool', {}, createTestContext());
      for await (const _ of generator) {
        // 消费生成器
      }

      expect(hookCalled).toBe(true);
    });

    it('流式执行应触发 onProgress 钩子', async () => {
      const tool: CustomToolDefinition = {
        name: 'progressTool',
        description: '进度工具',
        parameters: [],
        executor: async () => ({ success: true }),
        streamingExecutor: async function* () {
          yield { type: 'progress', content: '50%', progress: 50 };
          return { success: true };
        },
      };
      manager.registerTool(tool);

      let progressValue: number | undefined;
      manager.addToolHook('onProgress', (context) => {
        progressValue = context.progress;
      });

      const generator = manager.executeToolStreaming('progressTool', {}, createTestContext());
      for await (const _ of generator) {
        // 消费生成器
      }

      expect(progressValue).toBe(50);
    });

    it('没有流式执行器时应回退到普通执行', async () => {
      const tool = createSimpleTool();
      manager.registerTool(tool);

      const chunks: StreamChunk[] = [];
      const generator = manager.executeToolStreaming(
        'testTool',
        { input: 'test' },
        createTestContext()
      );

      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe('处理: test');
    });
  });

  // ==================== 工具 Schema 测试 ====================

  describe('工具 Schema', () => {
    it('应该生成正确的 JSON Schema', () => {
      const tool: CustomToolDefinition = {
        name: 'schemaTool',
        description: 'Schema 工具',
        parameters: [
          {
            name: 'name',
            type: 'string',
            description: '名称',
            required: true,
            minLength: 1,
            maxLength: 100,
          },
          {
            name: 'count',
            type: 'number',
            description: '数量',
            required: false,
            minimum: 0,
            maximum: 1000,
            default: 10,
          },
          {
            name: 'tags',
            type: 'array',
            description: '标签',
            required: false,
            items: { type: 'string' },
          },
        ],
        executor: async () => ({ success: true }),
      };
      manager.registerTool(tool);

      const schema = manager.getToolSchema('schemaTool');

      expect(schema).toBeDefined();
      expect(schema?.type).toBe('object');
      expect(schema?.required).toEqual(['name']);

      const properties = schema?.properties as Record<string, unknown>;
      expect(properties.name).toEqual({
        type: 'string',
        description: '名称',
        minLength: 1,
        maxLength: 100,
      });
      expect(properties.count).toEqual({
        type: 'number',
        description: '数量',
        minimum: 0,
        maximum: 1000,
        default: 10,
      });
    });

    it('获取不存在工具的 Schema 应返回 undefined', () => {
      const schema = manager.getToolSchema('nonexistent');
      expect(schema).toBeUndefined();
    });
  });

  // ==================== 工具摘要测试 ====================

  describe('工具摘要', () => {
    it('应该返回所有工具的摘要信息', () => {
      manager.registerTool({
        name: 'tool1',
        description: '工具1',
        parameters: [],
        dangerous: true,
        category: 'file',
        executor: async () => ({ success: true }),
      });

      manager.registerTool({
        name: 'tool2',
        description: '工具2',
        parameters: [],
        dangerous: false,
        category: 'network',
        supportsStreaming: true,
        executor: async () => ({ success: true }),
        streamingExecutor: async function* () {
          return { success: true };
        },
      });

      const summary = manager.getToolsSummary();

      expect(summary).toHaveLength(2);

      const tool1Summary = summary.find(t => t.name === 'tool1');
      expect(tool1Summary?.dangerous).toBe(true);
      expect(tool1Summary?.category).toBe('file');
      expect(tool1Summary?.supportsStreaming).toBe(false);

      const tool2Summary = summary.find(t => t.name === 'tool2');
      expect(tool2Summary?.dangerous).toBe(false);
      expect(tool2Summary?.category).toBe('network');
      expect(tool2Summary?.supportsStreaming).toBe(true);
    });
  });

  // ==================== 清理测试 ====================

  describe('清理', () => {
    it('应该清除所有工具', () => {
      manager.registerTool(createSimpleTool('tool1'));
      manager.registerTool(createSimpleTool('tool2'));

      manager.clearAllTools();

      expect(manager.getToolCount()).toBe(0);
    });

    it('应该重置管理器状态', () => {
      manager.registerTool(createSimpleTool());
      manager.addToolHook('beforeExecute', () => {});

      manager.reset();

      expect(manager.getToolCount()).toBe(0);
    });
  });
});
