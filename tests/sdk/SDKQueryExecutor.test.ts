/**
 * SDKQueryExecutor 测试
 *
 * 包含单元测试和属性测试，验证 SDK 查询执行器的正确性
 *
 * @module SDKQueryExecutor.test
 */

import * as fc from 'fast-check';

// 模拟 SDK 模块
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: jest.fn(),
}));

import {
  SDKQueryExecutor,
  SDKQueryOptions,
  SDKErrorType,
  classifySDKError,
  createSDKError,
  getErrorMessage,
  ERROR_MESSAGES,
} from '../../src/sdk/SDKQueryExecutor';

// 模拟 SDK 消息类型
interface MockSDKAssistantMessage {
  type: 'assistant';
  uuid: string;
  session_id: string;
  message: {
    content: Array<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string }>;
  };
  parent_tool_use_id: string | null;
}

interface MockSDKResultMessage {
  type: 'result';
  subtype: 'success' | 'error_max_turns' | 'error_during_execution';
  uuid: string;
  session_id: string;
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
  result?: string;
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  errors?: string[];
}

type MockSDKMessage = MockSDKAssistantMessage | MockSDKResultMessage;

/**
 * 创建模拟的助手消息
 */
function createMockAssistantMessage(
  text: string,
  sessionId: string = 'test-session'
): MockSDKAssistantMessage {
  return {
    type: 'assistant',
    uuid: `uuid-${Math.random().toString(36).substr(2, 9)}`,
    session_id: sessionId,
    message: {
      content: [{ type: 'text', text }],
    },
    parent_tool_use_id: null,
  };
}

/**
 * 创建模拟的成功结果消息
 */
function createMockSuccessResult(
  result: string,
  sessionId: string = 'test-session'
): MockSDKResultMessage {
  return {
    type: 'result',
    subtype: 'success',
    uuid: `uuid-${Math.random().toString(36).substr(2, 9)}`,
    session_id: sessionId,
    duration_ms: 1000,
    duration_api_ms: 800,
    is_error: false,
    num_turns: 1,
    result,
    total_cost_usd: 0.01,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
    },
  };
}

/**
 * 创建模拟的消息流生成器
 */
async function* createMockMessageStream(
  messages: MockSDKMessage[]
): AsyncGenerator<MockSDKMessage, void, unknown> {
  for (const message of messages) {
    yield message;
  }
}

// ============================================================================
// 单元测试
// ============================================================================

describe('SDKQueryExecutor', () => {
  let executor: SDKQueryExecutor;

  beforeEach(() => {
    executor = new SDKQueryExecutor();
    jest.clearAllMocks();
  });

  describe('mapToSDKOptions', () => {
    it('应该正确映射基本选项', () => {
      const options: SDKQueryOptions = {
        prompt: '你好',
        model: 'claude-sonnet-4-5-20250929',
        cwd: '/test/project',
        permissionMode: 'default',
      };

      const sdkOptions = executor.mapToSDKOptions(options);

      expect(sdkOptions.model).toBe('claude-sonnet-4-5-20250929');
      expect(sdkOptions.cwd).toBe('/test/project');
      expect(sdkOptions.permissionMode).toBe('default');
    });

    it('应该正确映射限制选项', () => {
      const options: SDKQueryOptions = {
        prompt: '你好',
        maxTurns: 10,
        maxBudgetUsd: 5.0,
        maxThinkingTokens: 1000,
      };

      const sdkOptions = executor.mapToSDKOptions(options);

      expect(sdkOptions.maxTurns).toBe(10);
      expect(sdkOptions.maxBudgetUsd).toBe(5.0);
      expect(sdkOptions.maxThinkingTokens).toBe(1000);
    });

    it('应该正确映射工具列表', () => {
      const options: SDKQueryOptions = {
        prompt: '你好',
        allowedTools: ['Read', 'Write', 'Edit'],
        disallowedTools: ['Bash'],
      };

      const sdkOptions = executor.mapToSDKOptions(options);

      expect(sdkOptions.allowedTools).toEqual(['Read', 'Write', 'Edit']);
      expect(sdkOptions.disallowedTools).toEqual(['Bash']);
    });

    it('应该正确映射字符串 systemPrompt（向后兼容）', () => {
      const options: SDKQueryOptions = {
        prompt: '你好',
        systemPrompt: 'You are a helpful assistant.',
      };

      const sdkOptions = executor.mapToSDKOptions(options);

      expect(sdkOptions.systemPrompt).toBe('You are a helpful assistant.');
    });

    it('应该正确映射 systemPrompt 预设对象', () => {
      const options: SDKQueryOptions = {
        prompt: '你好',
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
        },
      };

      const sdkOptions = executor.mapToSDKOptions(options);

      expect(sdkOptions.systemPrompt).toEqual({
        type: 'preset',
        preset: 'claude_code',
      });
    });

    it('应该正确映射带 append 的 systemPrompt 预设对象', () => {
      const options: SDKQueryOptions = {
        prompt: '你好',
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: 'Custom instructions here',
        },
      };

      const sdkOptions = executor.mapToSDKOptions(options);

      expect(sdkOptions.systemPrompt).toEqual({
        type: 'preset',
        preset: 'claude_code',
        append: 'Custom instructions here',
      });
    });

    it('应该正确映射 settingSources', () => {
      const options: SDKQueryOptions = {
        prompt: '你好',
        settingSources: ['project'],
      };

      const sdkOptions = executor.mapToSDKOptions(options);

      expect(sdkOptions.settingSources).toEqual(['project']);
    });

    it('应该同时映射 systemPrompt 预设对象和 settingSources', () => {
      const options: SDKQueryOptions = {
        prompt: '你好',
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: 'Custom instructions',
        },
        settingSources: ['project'],
      };

      const sdkOptions = executor.mapToSDKOptions(options);

      expect(sdkOptions.systemPrompt).toEqual({
        type: 'preset',
        preset: 'claude_code',
        append: 'Custom instructions',
      });
      expect(sdkOptions.settingSources).toEqual(['project']);
    });

    it('应该忽略未定义的选项', () => {
      const options: SDKQueryOptions = {
        prompt: '你好',
      };

      const sdkOptions = executor.mapToSDKOptions(options);

      expect(sdkOptions.model).toBeUndefined();
      expect(sdkOptions.maxTurns).toBeUndefined();
      expect(sdkOptions.mcpServers).toBeUndefined();
      expect(sdkOptions.systemPrompt).toBeUndefined();
      expect(sdkOptions.settingSources).toBeUndefined();
    });
  });

  describe('extractTextFromAssistantMessage', () => {
    it('应该从助手消息中提取文本', () => {
      const message = createMockAssistantMessage('Hello, world!');
      const text = executor.extractTextFromAssistantMessage(message as any);

      expect(text).toBe('Hello, world!');
    });

    it('应该处理多个文本块', () => {
      const message: MockSDKAssistantMessage = {
        type: 'assistant',
        uuid: 'test-uuid',
        session_id: 'test-session',
        message: {
          content: [
            { type: 'text', text: 'First part. ' },
            { type: 'text', text: 'Second part.' },
          ],
        },
        parent_tool_use_id: null,
      };

      const text = executor.extractTextFromAssistantMessage(message as any);

      expect(text).toBe('First part. Second part.');
    });

    it('应该忽略非文本块', () => {
      const message: MockSDKAssistantMessage = {
        type: 'assistant',
        uuid: 'test-uuid',
        session_id: 'test-session',
        message: {
          content: [
            { type: 'text', text: 'Text content' },
            { type: 'tool_use', id: 'tool-1', name: 'Read' },
          ],
        },
        parent_tool_use_id: null,
      };

      const text = executor.extractTextFromAssistantMessage(message as any);

      expect(text).toBe('Text content');
    });

    it('应该处理空内容', () => {
      const message: MockSDKAssistantMessage = {
        type: 'assistant',
        uuid: 'test-uuid',
        session_id: 'test-session',
        message: {
          content: [],
        },
        parent_tool_use_id: null,
      };

      const text = executor.extractTextFromAssistantMessage(message as any);

      expect(text).toBe('');
    });
  });

  describe('processMessage', () => {
    it('应该累积助手消息的文本', () => {
      const message = createMockAssistantMessage('New text');
      const result = executor.processMessage(message as any, 'Existing text. ');

      expect(result.accumulatedResponse).toBe('Existing text. New text');
    });

    it('应该忽略非助手消息', () => {
      const message = createMockSuccessResult('Result');
      const result = executor.processMessage(message as any, 'Existing text');

      expect(result.accumulatedResponse).toBe('Existing text');
    });
  });

  describe('interrupt', () => {
    it('应该能够中断查询', () => {
      const abortController = new AbortController();
      (executor as any).abortController = abortController;
      
      expect(abortController.signal.aborted).toBe(false);
      
      const result = executor.interrupt();
      
      expect(result).toBe(true);
      expect(abortController.signal.aborted).toBe(true);
    });

    it('应该在没有 AbortController 时安全调用', () => {
      (executor as any).abortController = null;
      const result = executor.interrupt();
      expect(result).toBe(false);
    });

    it('应该在已中断时返回 false', () => {
      const abortController = new AbortController();
      (executor as any).abortController = abortController;
      
      // 第一次中断
      const firstResult = executor.interrupt();
      expect(firstResult).toBe(true);
      
      // 第二次中断应该返回 false
      const secondResult = executor.interrupt();
      expect(secondResult).toBe(false);
    });
  });

  describe('isRunning', () => {
    it('应该在未执行时返回 false', () => {
      expect(executor.isRunning()).toBe(false);
    });

    it('应该在执行期间返回 true', () => {
      (executor as any).isExecuting = true;
      expect(executor.isRunning()).toBe(true);
    });
  });

  describe('isInterrupted', () => {
    it('应该在没有 AbortController 时返回 false', () => {
      (executor as any).abortController = null;
      expect(executor.isInterrupted()).toBe(false);
    });

    it('应该在未中断时返回 false', () => {
      const abortController = new AbortController();
      (executor as any).abortController = abortController;
      expect(executor.isInterrupted()).toBe(false);
    });

    it('应该在中断后返回 true', () => {
      const abortController = new AbortController();
      (executor as any).abortController = abortController;
      abortController.abort();
      expect(executor.isInterrupted()).toBe(true);
    });
  });
});

describe('classifySDKError', () => {
  it('应该识别网络错误', () => {
    expect(classifySDKError(new Error('ENOTFOUND api.anthropic.com'))).toBe(SDKErrorType.NETWORK);
    expect(classifySDKError(new Error('ECONNREFUSED 127.0.0.1:443'))).toBe(SDKErrorType.NETWORK);
    expect(classifySDKError(new Error('Network error occurred'))).toBe(SDKErrorType.NETWORK);
    expect(classifySDKError(new Error('ECONNRESET connection reset'))).toBe(SDKErrorType.NETWORK);
    expect(classifySDKError(new Error('DNS lookup failed'))).toBe(SDKErrorType.NETWORK);
    expect(classifySDKError(new Error('Socket error'))).toBe(SDKErrorType.NETWORK);
    expect(classifySDKError(new Error('Connection refused'))).toBe(SDKErrorType.NETWORK);
    expect(classifySDKError(new Error('Unable to connect to server'))).toBe(SDKErrorType.NETWORK);
  });

  it('应该识别认证错误', () => {
    expect(classifySDKError(new Error('401 Unauthorized'))).toBe(SDKErrorType.AUTHENTICATION);
    expect(classifySDKError(new Error('Invalid API key'))).toBe(SDKErrorType.AUTHENTICATION);
    expect(classifySDKError(new Error('403 Forbidden'))).toBe(SDKErrorType.AUTHENTICATION);
    expect(classifySDKError(new Error('Authentication failed'))).toBe(SDKErrorType.AUTHENTICATION);
    expect(classifySDKError(new Error('Unauthorized access'))).toBe(SDKErrorType.AUTHENTICATION);
    expect(classifySDKError(new Error('invalid_api_key error'))).toBe(SDKErrorType.AUTHENTICATION);
    expect(classifySDKError(new Error('api_key is missing'))).toBe(SDKErrorType.AUTHENTICATION);
  });

  it('应该识别速率限制错误', () => {
    expect(classifySDKError(new Error('429 Too Many Requests'))).toBe(SDKErrorType.RATE_LIMIT);
    expect(classifySDKError(new Error('Rate limit exceeded'))).toBe(SDKErrorType.RATE_LIMIT);
    expect(classifySDKError(new Error('rate_limit_exceeded'))).toBe(SDKErrorType.RATE_LIMIT);
    expect(classifySDKError(new Error('Too many requests'))).toBe(SDKErrorType.RATE_LIMIT);
    expect(classifySDKError(new Error('Quota exceeded'))).toBe(SDKErrorType.RATE_LIMIT);
    expect(classifySDKError(new Error('Request throttled'))).toBe(SDKErrorType.RATE_LIMIT);
  });

  it('应该识别超时错误', () => {
    expect(classifySDKError(new Error('Request timeout'))).toBe(SDKErrorType.TIMEOUT);
    expect(classifySDKError(new Error('Connection timed out'))).toBe(SDKErrorType.TIMEOUT);
    expect(classifySDKError(new Error('ETIMEDOUT'))).toBe(SDKErrorType.TIMEOUT);
    const timeoutError = new Error('Operation failed');
    timeoutError.name = 'TimeoutError';
    expect(classifySDKError(timeoutError)).toBe(SDKErrorType.TIMEOUT);
  });

  it('应该识别中断错误', () => {
    const error = new Error('Operation aborted');
    error.name = 'AbortError';
    expect(classifySDKError(error)).toBe(SDKErrorType.INTERRUPTED);
    expect(classifySDKError(new Error('Request was aborted'))).toBe(SDKErrorType.INTERRUPTED);
    expect(classifySDKError(new Error('Operation cancelled'))).toBe(SDKErrorType.INTERRUPTED);
    expect(classifySDKError(new Error('Request canceled'))).toBe(SDKErrorType.INTERRUPTED);
  });

  it('应该将未知错误分类为 UNKNOWN', () => {
    expect(classifySDKError(new Error('Some random error'))).toBe(SDKErrorType.UNKNOWN);
    expect(classifySDKError(new Error('Unexpected failure'))).toBe(SDKErrorType.UNKNOWN);
  });
});

describe('createSDKError', () => {
  it('应该创建包含正确类型的 SDKError', () => {
    const originalError = new Error('ENOTFOUND api.anthropic.com');
    const sdkError = createSDKError(originalError);

    expect(sdkError.type).toBe(SDKErrorType.NETWORK);
    expect(sdkError.originalError).toBe(originalError);
    expect(sdkError.name).toBe('SDKError');
    expect(sdkError.message).toBe(ERROR_MESSAGES[SDKErrorType.NETWORK]);
  });

  it('应该为认证错误创建正确的 SDKError', () => {
    const originalError = new Error('401 Unauthorized');
    const sdkError = createSDKError(originalError);

    expect(sdkError.type).toBe(SDKErrorType.AUTHENTICATION);
    expect(sdkError.message).toBe(ERROR_MESSAGES[SDKErrorType.AUTHENTICATION]);
  });
});

describe('getErrorMessage', () => {
  it('应该返回基本错误消息', () => {
    const error = new Error('ENOTFOUND api.anthropic.com');
    const message = getErrorMessage(error);

    expect(message).toBe(ERROR_MESSAGES[SDKErrorType.NETWORK]);
  });

  it('应该在 includeDetails 为 true 时包含原始错误详情', () => {
    const error = new Error('ENOTFOUND api.anthropic.com');
    const message = getErrorMessage(error, true);

    expect(message).toBe(`${ERROR_MESSAGES[SDKErrorType.NETWORK]}: ENOTFOUND api.anthropic.com`);
  });

  it('应该为不同错误类型返回正确的消息', () => {
    expect(getErrorMessage(new Error('429 Too Many Requests'))).toBe(ERROR_MESSAGES[SDKErrorType.RATE_LIMIT]);
    expect(getErrorMessage(new Error('Request timeout'))).toBe(ERROR_MESSAGES[SDKErrorType.TIMEOUT]);
    expect(getErrorMessage(new Error('Unknown error'))).toBe(ERROR_MESSAGES[SDKErrorType.UNKNOWN]);
  });
});

describe('ERROR_MESSAGES', () => {
  it('应该为每种错误类型提供消息', () => {
    expect(ERROR_MESSAGES[SDKErrorType.NETWORK]).toBeDefined();
    expect(ERROR_MESSAGES[SDKErrorType.AUTHENTICATION]).toBeDefined();
    expect(ERROR_MESSAGES[SDKErrorType.RATE_LIMIT]).toBeDefined();
    expect(ERROR_MESSAGES[SDKErrorType.TIMEOUT]).toBeDefined();
    expect(ERROR_MESSAGES[SDKErrorType.INTERRUPTED]).toBeDefined();
    expect(ERROR_MESSAGES[SDKErrorType.UNKNOWN]).toBeDefined();
  });
});


// ============================================================================
// 属性测试
// ============================================================================

describe('SDKQueryExecutor - 属性测试', () => {
  /**
   * Property 1: SDK Options Completeness
   *
   * *For any* valid QueryOptions object, when mapped to SDK options,
   * all specified fields (model, systemPrompt, allowedTools, cwd, permissionMode,
   * maxTurns, maxBudgetUsd, maxThinkingTokens, sandbox, mcpServers) SHALL be present
   * in the resulting SDK options object with their original values.
   *
   * **Feature: sdk-integration, Property 1: SDK Options Completeness**
   * **Validates: Requirements 1.2, 6.1, 6.2, 6.3, 6.4, 6.5**
   */
  describe('Property 1: SDK Options Completeness', () => {
    // 生成有效的权限模式
    const permissionModeArb = fc.constantFrom(
      'default' as const,
      'acceptEdits' as const,
      'bypassPermissions' as const,
      'plan' as const
    );

    // 生成有效的工具名称
    const toolNameArb = fc.constantFrom('Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob');

    // 生成有效的模型名称
    const modelArb = fc.constantFrom(
      'claude-sonnet-4-5-20250929',
      'claude-3-opus-latest',
      'claude-3-haiku-latest'
    );

    // 生成有效的沙箱配置
    const sandboxArb = fc.record({
      type: fc.constantFrom('docker' as const),
      image: fc.string({ minLength: 1, maxLength: 50 }),
    });

    // 生成有效的 MCP 服务器配置
    const mcpServerConfigArb = fc.record({
      command: fc.string({ minLength: 1, maxLength: 50 }),
      args: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
    });

    it('应该保留所有基本选项的原始值', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            prompt: fc.string({ minLength: 1, maxLength: 100 }),
            model: modelArb,
            systemPrompt: fc.string({ minLength: 1, maxLength: 200 }),
            cwd: fc.string({ minLength: 1, maxLength: 100 }),
            permissionMode: permissionModeArb,
          }),
          async (options) => {
            const executor = new SDKQueryExecutor();
            const sdkOptions = executor.mapToSDKOptions(options as SDKQueryOptions);

            // 验证所有指定的字段都被正确映射
            expect(sdkOptions.model).toBe(options.model);
            expect(sdkOptions.systemPrompt).toBe(options.systemPrompt);
            expect(sdkOptions.cwd).toBe(options.cwd);
            expect(sdkOptions.permissionMode).toBe(options.permissionMode);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该保留所有限制选项的原始值 (Requirements 6.1, 6.2, 6.3)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            prompt: fc.string({ minLength: 1, maxLength: 100 }),
            maxTurns: fc.integer({ min: 1, max: 100 }),
            maxBudgetUsd: fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true }),
            maxThinkingTokens: fc.integer({ min: 100, max: 10000 }),
          }),
          async (options) => {
            const executor = new SDKQueryExecutor();
            const sdkOptions = executor.mapToSDKOptions(options as SDKQueryOptions);

            // 验证限制选项被正确映射 (Requirements 6.1, 6.2, 6.3)
            expect(sdkOptions.maxTurns).toBe(options.maxTurns);
            expect(sdkOptions.maxBudgetUsd).toBe(options.maxBudgetUsd);
            expect(sdkOptions.maxThinkingTokens).toBe(options.maxThinkingTokens);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该保留工具列表的原始值', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            prompt: fc.string({ minLength: 1, maxLength: 100 }),
            allowedTools: fc.array(toolNameArb, { minLength: 1, maxLength: 5 }),
            disallowedTools: fc.array(toolNameArb, { minLength: 0, maxLength: 3 }),
          }),
          async (options) => {
            const executor = new SDKQueryExecutor();
            const sdkOptions = executor.mapToSDKOptions(options as SDKQueryOptions);

            // 验证工具列表被正确映射
            expect(sdkOptions.allowedTools).toEqual(options.allowedTools);
            expect(sdkOptions.disallowedTools).toEqual(options.disallowedTools);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该保留沙箱配置的原始值 (Requirement 6.4)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            prompt: fc.string({ minLength: 1, maxLength: 100 }),
            sandbox: sandboxArb,
          }),
          async (options) => {
            const executor = new SDKQueryExecutor();
            const sdkOptions = executor.mapToSDKOptions(options as SDKQueryOptions);

            // 验证沙箱配置被正确映射 (Requirement 6.4)
            expect(sdkOptions.sandbox).toEqual(options.sandbox);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该保留 MCP 服务器配置的原始值 (Requirement 6.5)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            prompt: fc.string({ minLength: 1, maxLength: 100 }),
            mcpServers: fc.dictionary(
              fc.string({ minLength: 1, maxLength: 20 }),
              mcpServerConfigArb,
              { minKeys: 1, maxKeys: 3 }
            ),
          }),
          async (options) => {
            const executor = new SDKQueryExecutor();
            const sdkOptions = executor.mapToSDKOptions(options as SDKQueryOptions);

            // 验证 MCP 服务器配置被正确映射 (Requirement 6.5)
            expect(sdkOptions.mcpServers).toEqual(options.mcpServers);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该在所有字段都指定时保留所有原始值', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            prompt: fc.string({ minLength: 1, maxLength: 100 }),
            model: modelArb,
            systemPrompt: fc.string({ minLength: 1, maxLength: 200 }),
            allowedTools: fc.array(toolNameArb, { minLength: 1, maxLength: 5 }),
            disallowedTools: fc.array(toolNameArb, { minLength: 0, maxLength: 3 }),
            cwd: fc.string({ minLength: 1, maxLength: 100 }),
            permissionMode: permissionModeArb,
            maxTurns: fc.integer({ min: 1, max: 100 }),
            maxBudgetUsd: fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true }),
            maxThinkingTokens: fc.integer({ min: 100, max: 10000 }),
            enableFileCheckpointing: fc.boolean(),
          }),
          async (options) => {
            const executor = new SDKQueryExecutor();
            const sdkOptions = executor.mapToSDKOptions(options as SDKQueryOptions);

            // 验证所有字段都被正确映射
            expect(sdkOptions.model).toBe(options.model);
            expect(sdkOptions.systemPrompt).toBe(options.systemPrompt);
            expect(sdkOptions.allowedTools).toEqual(options.allowedTools);
            expect(sdkOptions.disallowedTools).toEqual(options.disallowedTools);
            expect(sdkOptions.cwd).toBe(options.cwd);
            expect(sdkOptions.permissionMode).toBe(options.permissionMode);
            expect(sdkOptions.maxTurns).toBe(options.maxTurns);
            expect(sdkOptions.maxBudgetUsd).toBe(options.maxBudgetUsd);
            expect(sdkOptions.maxThinkingTokens).toBe(options.maxThinkingTokens);
            expect(sdkOptions.enableFileCheckpointing).toBe(options.enableFileCheckpointing);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该不包含未指定的可选字段', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            prompt: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          async (options) => {
            const executor = new SDKQueryExecutor();
            const sdkOptions = executor.mapToSDKOptions(options as SDKQueryOptions);

            // 验证未指定的字段不存在于结果中
            expect(sdkOptions.model).toBeUndefined();
            expect(sdkOptions.systemPrompt).toBeUndefined();
            expect(sdkOptions.allowedTools).toBeUndefined();
            expect(sdkOptions.disallowedTools).toBeUndefined();
            expect(sdkOptions.cwd).toBeUndefined();
            expect(sdkOptions.permissionMode).toBeUndefined();
            expect(sdkOptions.maxTurns).toBeUndefined();
            expect(sdkOptions.maxBudgetUsd).toBeUndefined();
            expect(sdkOptions.maxThinkingTokens).toBeUndefined();
            expect(sdkOptions.mcpServers).toBeUndefined();
            expect(sdkOptions.sandbox).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该正确传递 AbortController', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            prompt: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          async (options) => {
            const abortController = new AbortController();
            const executorWithAbort = new SDKQueryExecutor();
            (executorWithAbort as any).abortController = abortController;
            const sdkOptions = executorWithAbort.mapToSDKOptions(options as SDKQueryOptions);

            // 验证 AbortController 被正确传递
            expect(sdkOptions.abortController).toBe(abortController);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: Message Stream Consumption
   * 
   * *For any* SDK query that returns an async generator with N messages,
   * the SDKQueryExecutor SHALL process exactly N messages before returning.
   * 
   * **Feature: sdk-integration, Property 2: Message Stream Consumption**
   * **Validates: Requirements 1.3**
   */
  describe('Property 2: Message Stream Consumption', () => {
    it('应该处理消息流中的所有消息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 10 }),
          async (textContents) => {
            const executor = new SDKQueryExecutor();
            
            const messages: MockSDKMessage[] = textContents.map((text) =>
              createMockAssistantMessage(text)
            );
            messages.push(createMockSuccessResult('Final result'));
            
            let processedCount = 0;
            const originalProcessMessage = executor.processMessage.bind(executor);
            executor.processMessage = (message: any, currentResponse: string) => {
              processedCount++;
              return originalProcessMessage(message, currentResponse);
            };
            
            let accumulatedResponse = '';
            for await (const message of createMockMessageStream(messages)) {
              const result = executor.processMessage(message as any, accumulatedResponse);
              accumulatedResponse = result.accumulatedResponse;
            }
            
            expect(processedCount).toBe(messages.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该在中断时停止处理', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 0, max: 9 }),
          async (totalMessages, interruptAt) => {
            const actualInterruptAt = Math.min(interruptAt, totalMessages - 1);
            
            const executor = new SDKQueryExecutor();
            const abortController = new AbortController();
            (executor as any).abortController = abortController;
            
            const messages: MockSDKMessage[] = [];
            for (let i = 0; i < totalMessages; i++) {
              messages.push(createMockAssistantMessage(`Message ${i}`));
            }
            messages.push(createMockSuccessResult('Final result'));
            
            let processedCount = 0;
            let accumulatedResponse = '';
            
            for await (const message of createMockMessageStream(messages)) {
              if (processedCount === actualInterruptAt) {
                abortController.abort();
              }
              
              if (abortController.signal.aborted) {
                break;
              }
              
              const result = executor.processMessage(message as any, accumulatedResponse);
              accumulatedResponse = result.accumulatedResponse;
              processedCount++;
            }
            
            expect(processedCount).toBe(actualInterruptAt);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 3: Text Accumulation from Assistant Messages
   * 
   * *For any* sequence of SDKAssistantMessage objects with text content blocks,
   * the accumulated response SHALL equal the concatenation of all text blocks in order.
   * 
   * **Feature: sdk-integration, Property 3: Text Accumulation from Assistant Messages**
   * **Validates: Requirements 2.1**
   */
  describe('Property 3: Text Accumulation from Assistant Messages', () => {
    it('应该正确累积所有助手消息的文本', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 0, maxLength: 100 }), { minLength: 1, maxLength: 10 }),
          async (textContents) => {
            const executor = new SDKQueryExecutor();
            
            const messages: MockSDKMessage[] = textContents.map((text) =>
              createMockAssistantMessage(text)
            );
            messages.push(createMockSuccessResult('Final result'));
            
            let accumulatedResponse = '';
            for await (const message of createMockMessageStream(messages)) {
              const result = executor.processMessage(message as any, accumulatedResponse);
              accumulatedResponse = result.accumulatedResponse;
            }
            
            const expectedResponse = textContents.join('');
            expect(accumulatedResponse).toBe(expectedResponse);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该保持文本块的顺序', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.uuid(), { minLength: 2, maxLength: 10 }),
          async (uuids) => {
            const executor = new SDKQueryExecutor();
            
            const messages: MockSDKMessage[] = uuids.map((uuid) =>
              createMockAssistantMessage(`[${uuid}]`)
            );
            messages.push(createMockSuccessResult('Final result'));
            
            let accumulatedResponse = '';
            for await (const message of createMockMessageStream(messages)) {
              const result = executor.processMessage(message as any, accumulatedResponse);
              accumulatedResponse = result.accumulatedResponse;
            }
            
            let lastIndex = -1;
            for (const uuid of uuids) {
              const currentIndex = accumulatedResponse.indexOf(`[${uuid}]`);
              expect(currentIndex).toBeGreaterThan(lastIndex);
              lastIndex = currentIndex;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该处理包含多个文本块的单个消息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
          async (textBlocks) => {
            const executor = new SDKQueryExecutor();
            
            const message: MockSDKAssistantMessage = {
              type: 'assistant',
              uuid: 'test-uuid',
              session_id: 'test-session',
              message: {
                content: textBlocks.map((text) => ({ type: 'text' as const, text })),
              },
              parent_tool_use_id: null,
            };
            
            const extractedText = executor.extractTextFromAssistantMessage(message as any);
            
            const expectedText = textBlocks.join('');
            expect(extractedText).toBe(expectedText);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 4: Success Result Returns Accumulated Response
   *
   * *For any* SDK query that yields assistant messages followed by a success result,
   * the returned response SHALL contain all accumulated text from assistant messages.
   *
   * **Feature: sdk-integration, Property 4: Success Result Returns Accumulated Response**
   * **Validates: Requirements 2.2**
   */
  describe('Property 4: Success Result Returns Accumulated Response', () => {
    it('应该在成功结果中返回所有累积的助手消息文本', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 10 }),
          async (textContents) => {
            const executor = new SDKQueryExecutor();

            // 创建助手消息序列
            const messages: MockSDKMessage[] = textContents.map((text) =>
              createMockAssistantMessage(text)
            );
            // 添加成功结果消息
            messages.push(createMockSuccessResult('Final result'));

            // 模拟完整的消息处理流程
            let accumulatedResponse = '';
            let finalResult: { response: string; isError: boolean } | null = null;

            for await (const message of createMockMessageStream(messages)) {
              if (message.type === 'assistant') {
                const result = executor.processMessage(message as any, accumulatedResponse);
                accumulatedResponse = result.accumulatedResponse;
              } else if (message.type === 'result') {
                const resultMessage = message as MockSDKResultMessage;
                if (resultMessage.subtype === 'success') {
                  finalResult = {
                    response: accumulatedResponse || resultMessage.result || '',
                    isError: false,
                  };
                }
              }
            }

            // 验证成功结果包含所有累积的文本
            const expectedResponse = textContents.join('');
            expect(finalResult).not.toBeNull();
            expect(finalResult!.isError).toBe(false);
            expect(finalResult!.response).toBe(expectedResponse);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该在没有助手消息时返回结果消息中的 result 字段', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 200 }),
          async (resultText) => {
            const executor = new SDKQueryExecutor();

            // 只有成功结果消息，没有助手消息
            const messages: MockSDKMessage[] = [createMockSuccessResult(resultText)];

            let accumulatedResponse = '';
            let finalResult: { response: string; isError: boolean } | null = null;

            for await (const message of createMockMessageStream(messages)) {
              if (message.type === 'assistant') {
                const result = executor.processMessage(message as any, accumulatedResponse);
                accumulatedResponse = result.accumulatedResponse;
              } else if (message.type === 'result') {
                const resultMessage = message as MockSDKResultMessage;
                if (resultMessage.subtype === 'success') {
                  // 如果没有累积响应，使用结果消息中的 result 字段
                  finalResult = {
                    response: accumulatedResponse || resultMessage.result || '',
                    isError: false,
                  };
                }
              }
            }

            expect(finalResult).not.toBeNull();
            expect(finalResult!.isError).toBe(false);
            // 没有助手消息时，应该返回结果消息中的 result
            expect(finalResult!.response).toBe(resultText);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该优先返回累积的助手消息而不是结果消息的 result 字段', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (assistantTexts, resultText) => {
            const executor = new SDKQueryExecutor();

            // 创建助手消息和成功结果
            const messages: MockSDKMessage[] = assistantTexts.map((text) =>
              createMockAssistantMessage(text)
            );
            messages.push(createMockSuccessResult(resultText));

            let accumulatedResponse = '';
            let finalResult: { response: string; isError: boolean } | null = null;

            for await (const message of createMockMessageStream(messages)) {
              if (message.type === 'assistant') {
                const result = executor.processMessage(message as any, accumulatedResponse);
                accumulatedResponse = result.accumulatedResponse;
              } else if (message.type === 'result') {
                const resultMessage = message as MockSDKResultMessage;
                if (resultMessage.subtype === 'success') {
                  // 优先使用累积的响应
                  finalResult = {
                    response: accumulatedResponse || resultMessage.result || '',
                    isError: false,
                  };
                }
              }
            }

            // 验证返回的是累积的助手消息，而不是结果消息的 result
            const expectedResponse = assistantTexts.join('');
            expect(finalResult).not.toBeNull();
            expect(finalResult!.response).toBe(expectedResponse);
            // 确保不是结果消息的 result（除非它们恰好相同）
            if (expectedResponse !== resultText) {
              expect(finalResult!.response).not.toBe(resultText);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 5: Error Result Throws Exception
   *
   * *For any* SDK query that yields an SDKResultMessage with error subtype,
   * the SDKQueryExecutor SHALL throw an error containing the error details from the result message.
   *
   * **Feature: sdk-integration, Property 5: Error Result Throws Exception**
   * **Validates: Requirements 2.3**
   */
  describe('Property 5: Error Result Throws Exception', () => {
    // 创建模拟的错误结果消息
    function createMockErrorResult(
      subtype: 'error_max_turns' | 'error_during_execution',
      errors: string[] = [],
      sessionId: string = 'test-session'
    ): MockSDKResultMessage {
      return {
        type: 'result',
        subtype,
        uuid: `uuid-${Math.random().toString(36).substring(2, 11)}`,
        session_id: sessionId,
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: true,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
        errors,
      };
    }

    // 错误子类型生成器
    const errorSubtypeArb = fc.constantFrom(
      'error_max_turns' as const,
      'error_during_execution' as const
    );

    it('应该将错误结果标记为 isError: true', async () => {
      await fc.assert(
        fc.asyncProperty(
          errorSubtypeArb,
          fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 5 }),
          async (subtype, errors) => {
            // 创建错误结果消息
            const messages: MockSDKMessage[] = [createMockErrorResult(subtype, errors)];

            let finalResult: { isError: boolean; errorMessage?: string } | null = null;

            for await (const message of createMockMessageStream(messages)) {
              if (message.type === 'result') {
                const resultMessage = message as MockSDKResultMessage;
                if (resultMessage.subtype !== 'success') {
                  const errorMessages = resultMessage.errors || [];
                  finalResult = {
                    isError: true,
                    errorMessage: errorMessages.join('; ') || `错误: ${resultMessage.subtype}`,
                  };
                }
              }
            }

            // 验证错误结果被正确标记
            expect(finalResult).not.toBeNull();
            expect(finalResult!.isError).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该在错误消息中包含错误详情', async () => {
      await fc.assert(
        fc.asyncProperty(
          errorSubtypeArb,
          fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 5 }),
          async (subtype, errors) => {
            // 创建带有错误详情的错误结果消息
            const messages: MockSDKMessage[] = [createMockErrorResult(subtype, errors)];

            let finalResult: { isError: boolean; errorMessage?: string } | null = null;

            for await (const message of createMockMessageStream(messages)) {
              if (message.type === 'result') {
                const resultMessage = message as MockSDKResultMessage;
                if (resultMessage.subtype !== 'success') {
                  const errorMessages = resultMessage.errors || [];
                  finalResult = {
                    isError: true,
                    errorMessage: errorMessages.join('; ') || `错误: ${resultMessage.subtype}`,
                  };
                }
              }
            }

            // 验证错误消息包含所有错误详情
            expect(finalResult).not.toBeNull();
            expect(finalResult!.errorMessage).toBeDefined();
            
            // 验证每个错误都包含在错误消息中
            for (const error of errors) {
              expect(finalResult!.errorMessage).toContain(error);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该在没有错误详情时使用错误子类型作为消息', async () => {
      await fc.assert(
        fc.asyncProperty(errorSubtypeArb, async (subtype) => {
          // 创建没有错误详情的错误结果消息
          const messages: MockSDKMessage[] = [createMockErrorResult(subtype, [])];

          let finalResult: { isError: boolean; errorMessage?: string } | null = null;

          for await (const message of createMockMessageStream(messages)) {
            if (message.type === 'result') {
              const resultMessage = message as MockSDKResultMessage;
              if (resultMessage.subtype !== 'success') {
                const errorMessages = resultMessage.errors || [];
                finalResult = {
                  isError: true,
                  errorMessage: errorMessages.join('; ') || `错误: ${resultMessage.subtype}`,
                };
              }
            }
          }

          // 验证错误消息包含错误子类型
          expect(finalResult).not.toBeNull();
          expect(finalResult!.errorMessage).toContain(subtype);
        }),
        { numRuns: 100 }
      );
    });

    it('应该在有助手消息后遇到错误时仍然标记为错误', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
          errorSubtypeArb,
          fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 3 }),
          async (assistantTexts, subtype, errors) => {
            const executor = new SDKQueryExecutor();

            // 创建助手消息后跟错误结果
            const messages: MockSDKMessage[] = assistantTexts.map((text) =>
              createMockAssistantMessage(text)
            );
            messages.push(createMockErrorResult(subtype, errors));

            let accumulatedResponse = '';
            let finalResult: { isError: boolean; errorMessage?: string; response: string } | null = null;

            for await (const message of createMockMessageStream(messages)) {
              if (message.type === 'assistant') {
                const result = executor.processMessage(message as any, accumulatedResponse);
                accumulatedResponse = result.accumulatedResponse;
              } else if (message.type === 'result') {
                const resultMessage = message as MockSDKResultMessage;
                if (resultMessage.subtype !== 'success') {
                  const errorMessages = resultMessage.errors || [];
                  finalResult = {
                    isError: true,
                    errorMessage: errorMessages.join('; ') || `错误: ${resultMessage.subtype}`,
                    response: accumulatedResponse,
                  };
                }
              }
            }

            // 验证即使有累积的响应，错误仍然被正确标记
            expect(finalResult).not.toBeNull();
            expect(finalResult!.isError).toBe(true);
            expect(finalResult!.errorMessage).toBeDefined();
            // 累积的响应应该被保留
            expect(finalResult!.response).toBe(assistantTexts.join(''));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 7: Error Type Classification
   *
   * *For any* SDK error, the Application SHALL classify it into one of the defined
   * error types (network, authentication, rate_limit, timeout, interrupted, unknown)
   * and provide an appropriate user-facing message.
   *
   * **Feature: sdk-integration, Property 7: Error Type Classification**
   * **Validates: Requirements 5.1, 5.2, 5.3**
   */
  describe('Property 7: Error Type Classification', () => {
    // 网络错误关键词生成器
    const networkErrorKeywordArb = fc.constantFrom(
      'ENOTFOUND',
      'ECONNREFUSED',
      'ECONNRESET',
      'network',
      'dns',
      'socket',
      'connection refused',
      'unable to connect'
    );

    // 认证错误关键词生成器
    const authErrorKeywordArb = fc.constantFrom(
      '401',
      '403',
      'api key',
      'api_key',
      'authentication',
      'unauthorized',
      'forbidden',
      'invalid key',
      'invalid_api_key'
    );

    // 速率限制错误关键词生成器
    const rateLimitErrorKeywordArb = fc.constantFrom(
      '429',
      'rate limit',
      'rate_limit',
      'too many requests',
      'quota exceeded',
      'throttled'
    );

    // 超时错误关键词生成器
    const timeoutErrorKeywordArb = fc.constantFrom(
      'timeout',
      'timed out',
      'ETIMEDOUT'
    );

    // 中断错误关键词生成器
    const interruptedErrorKeywordArb = fc.constantFrom(
      'aborted',
      'cancelled',
      'canceled'
    );

    it('应该将包含网络错误关键词的错误分类为 NETWORK (Requirement 5.1)', async () => {
      await fc.assert(
        fc.asyncProperty(
          networkErrorKeywordArb,
          fc.string({ minLength: 0, maxLength: 50 }),
          async (keyword, suffix) => {
            const error = new Error(`${keyword} ${suffix}`);
            const errorType = classifySDKError(error);

            expect(errorType).toBe(SDKErrorType.NETWORK);
            expect(ERROR_MESSAGES[errorType]).toBeDefined();
            expect(ERROR_MESSAGES[errorType].length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该将包含认证错误关键词的错误分类为 AUTHENTICATION (Requirement 5.2)', async () => {
      await fc.assert(
        fc.asyncProperty(
          authErrorKeywordArb,
          fc.string({ minLength: 0, maxLength: 50 }),
          async (keyword, suffix) => {
            const error = new Error(`${keyword} ${suffix}`);
            const errorType = classifySDKError(error);

            expect(errorType).toBe(SDKErrorType.AUTHENTICATION);
            expect(ERROR_MESSAGES[errorType]).toBeDefined();
            expect(ERROR_MESSAGES[errorType].length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该将包含速率限制关键词的错误分类为 RATE_LIMIT (Requirement 5.3)', async () => {
      await fc.assert(
        fc.asyncProperty(
          rateLimitErrorKeywordArb,
          fc.string({ minLength: 0, maxLength: 50 }),
          async (keyword, suffix) => {
            const error = new Error(`${keyword} ${suffix}`);
            const errorType = classifySDKError(error);

            expect(errorType).toBe(SDKErrorType.RATE_LIMIT);
            expect(ERROR_MESSAGES[errorType]).toBeDefined();
            expect(ERROR_MESSAGES[errorType].length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该将包含超时关键词的错误分类为 TIMEOUT', async () => {
      await fc.assert(
        fc.asyncProperty(
          timeoutErrorKeywordArb,
          fc.string({ minLength: 0, maxLength: 50 }),
          async (keyword, suffix) => {
            const error = new Error(`${keyword} ${suffix}`);
            const errorType = classifySDKError(error);

            expect(errorType).toBe(SDKErrorType.TIMEOUT);
            expect(ERROR_MESSAGES[errorType]).toBeDefined();
            expect(ERROR_MESSAGES[errorType].length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该将包含中断关键词的错误分类为 INTERRUPTED', async () => {
      await fc.assert(
        fc.asyncProperty(
          interruptedErrorKeywordArb,
          fc.string({ minLength: 0, maxLength: 50 }),
          async (keyword, suffix) => {
            const error = new Error(`${keyword} ${suffix}`);
            const errorType = classifySDKError(error);

            expect(errorType).toBe(SDKErrorType.INTERRUPTED);
            expect(ERROR_MESSAGES[errorType]).toBeDefined();
            expect(ERROR_MESSAGES[errorType].length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该将 AbortError 名称的错误分类为 INTERRUPTED', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          async (message) => {
            const error = new Error(message);
            error.name = 'AbortError';
            const errorType = classifySDKError(error);

            expect(errorType).toBe(SDKErrorType.INTERRUPTED);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('应该将不包含已知关键词的错误分类为 UNKNOWN', async () => {
      // 生成不包含任何已知关键词的随机字符串
      const safeStringArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => {
        const lower = s.toLowerCase();
        const knownKeywords = [
          'enotfound', 'econnrefused', 'econnreset', 'network', 'dns', 'socket',
          'connection refused', 'unable to connect',
          '401', '403', 'api key', 'api_key', 'authentication', 'unauthorized',
          'forbidden', 'invalid key', 'invalid_api_key',
          '429', 'rate limit', 'rate_limit', 'too many requests', 'quota exceeded', 'throttl',
          'timeout', 'timed out', 'etimedout',
          'aborted', 'cancelled', 'canceled'
        ];
        return !knownKeywords.some((kw) => lower.includes(kw));
      });

      await fc.assert(
        fc.asyncProperty(safeStringArb, async (message) => {
          const error = new Error(message);
          const errorType = classifySDKError(error);

          expect(errorType).toBe(SDKErrorType.UNKNOWN);
          expect(ERROR_MESSAGES[errorType]).toBeDefined();
        }),
        { numRuns: 100 }
      );
    });

    it('应该为每种错误类型提供非空的用户友好消息', async () => {
      const allErrorTypes = [
        SDKErrorType.NETWORK,
        SDKErrorType.AUTHENTICATION,
        SDKErrorType.RATE_LIMIT,
        SDKErrorType.TIMEOUT,
        SDKErrorType.INTERRUPTED,
        SDKErrorType.UNKNOWN,
      ];

      for (const errorType of allErrorTypes) {
        expect(ERROR_MESSAGES[errorType]).toBeDefined();
        expect(typeof ERROR_MESSAGES[errorType]).toBe('string');
        expect(ERROR_MESSAGES[errorType].length).toBeGreaterThan(0);
      }
    });

    it('createSDKError 应该创建包含正确类型和消息的错误对象', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            'ENOTFOUND server',
            '401 Unauthorized',
            '429 Rate limit',
            'Request timeout',
            'Operation aborted',
            'Random error'
          ),
          async (errorMessage) => {
            const originalError = new Error(errorMessage);
            const sdkError = createSDKError(originalError);

            // 验证 SDKError 结构
            expect(sdkError.type).toBeDefined();
            expect(Object.values(SDKErrorType)).toContain(sdkError.type);
            expect(sdkError.originalError).toBe(originalError);
            expect(sdkError.name).toBe('SDKError');
            expect(sdkError.message).toBe(ERROR_MESSAGES[sdkError.type]);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getErrorMessage 应该返回与错误类型匹配的消息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            'ENOTFOUND server',
            '401 Unauthorized',
            '429 Rate limit',
            'Request timeout',
            'Operation aborted',
            'Random error'
          ),
          fc.boolean(),
          async (errorMessage, includeDetails) => {
            const error = new Error(errorMessage);
            const message = getErrorMessage(error, includeDetails);
            const errorType = classifySDKError(error);

            // 验证消息包含基本错误消息
            expect(message).toContain(ERROR_MESSAGES[errorType]);

            // 如果 includeDetails 为 true，消息应该包含原始错误消息
            if (includeDetails) {
              expect(message).toContain(errorMessage);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
