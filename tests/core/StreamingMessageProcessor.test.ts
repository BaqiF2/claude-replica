/**
 * 流式消息处理器测试
 *
 * 测试 StreamingMessageProcessor 的核心功能：
 * - 不同 SDKMessage 类型的处理
 * - 流式输出逻辑
 *
 * 需求: 1.4
 */

import {
  StreamingMessageProcessor,
  StreamingMessageProcessorOptions,
  SDKMessage,
  ProcessedMessage,
  OutputHandler,
  TextBlock,
  ToolUseBlock,
} from '../../src/core/StreamingMessageProcessor';

/**
 * 模拟输出处理器
 * 用于捕获输出内容以便测试验证
 */
class MockOutputHandler implements OutputHandler {
  public output: string[] = [];
  public errors: string[] = [];

  write(text: string): void {
    this.output.push(text);
  }

  writeLine(text: string): void {
    this.output.push(text + '\n');
  }

  writeError(text: string): void {
    this.errors.push(text);
  }

  clear(): void {
    this.output = [];
    this.errors = [];
  }

  getOutput(): string {
    return this.output.join('');
  }
}

/**
 * 创建模拟的助手消息
 */
function createAssistantMessage(
  textContent: string,
  toolUse?: { id: string; name: string; input: Record<string, unknown> }
): SDKMessage {
  const content: (TextBlock | ToolUseBlock)[] = [
    { type: 'text', text: textContent },
  ];

  if (toolUse) {
    content.push({
      type: 'tool_use',
      id: toolUse.id,
      name: toolUse.name,
      input: toolUse.input,
    });
  }

  return {
    type: 'assistant',
    message: {
      role: 'assistant',
      content,
    },
  };
}

/**
 * 创建模拟的结果消息
 */
function createResultMessage(
  subtype: 'success' | 'error' | 'interrupted' | 'max_turns',
  totalCostUsd?: number,
  durationMs?: number
): SDKMessage {
  return {
    type: 'result',
    subtype,
    total_cost_usd: totalCostUsd,
    duration_ms: durationMs,
  };
}

/**
 * 创建模拟的错误消息
 */
function createErrorMessage(message: string, code?: string): SDKMessage {
  return {
    type: 'error',
    error: {
      message,
      code,
    },
  };
}

/**
 * 创建模拟的工具调用消息
 */
function createToolUseMessage(
  tool: string,
  args: Record<string, unknown>
): SDKMessage {
  return {
    type: 'tool_use',
    tool,
    args,
  };
}

/**
 * 创建模拟的工具结果消息
 */
function createToolResultMessage(result: unknown): SDKMessage {
  return {
    type: 'tool_result',
    result,
  };
}

describe('StreamingMessageProcessor', () => {
  let mockOutputHandler: MockOutputHandler;
  let processor: StreamingMessageProcessor;

  beforeEach(() => {
    mockOutputHandler = new MockOutputHandler();
    processor = new StreamingMessageProcessor({
      outputHandler: mockOutputHandler,
    });
  });

  describe('构造函数', () => {
    it('应该使用默认选项创建实例', () => {
      const defaultProcessor = new StreamingMessageProcessor();
      expect(defaultProcessor).toBeDefined();
    });

    it('应该使用自定义选项创建实例', () => {
      const options: StreamingMessageProcessorOptions = {
        outputHandler: mockOutputHandler,
        showToolDetails: false,
        showCostInfo: false,
        enableStreaming: false,
      };

      const customProcessor = new StreamingMessageProcessor(options);
      expect(customProcessor).toBeDefined();
    });
  });

  describe('processMessage - 助手消息处理', () => {
    it('应该正确处理包含文本的助手消息', () => {
      const message = createAssistantMessage('你好，我是 Claude！');
      const processed = processor.processMessage(message);

      expect(processed.type).toBe('assistant');
      expect(processed.text).toBe('你好，我是 Claude！');
    });

    it('应该正确处理包含工具调用的助手消息', () => {
      const message = createAssistantMessage('让我读取文件...', {
        id: 'tool-1',
        name: 'Read',
        input: { path: '/test/file.txt' },
      });

      const processed = processor.processMessage(message);

      expect(processed.type).toBe('assistant');
      expect(processed.text).toBe('让我读取文件...');
      expect(processed.toolUse).toBeDefined();
      expect(processed.toolUse?.name).toBe('Read');
      expect(processed.toolUse?.input).toEqual({ path: '/test/file.txt' });
    });

    it('应该处理空内容的助手消息', () => {
      const message: SDKMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [],
        },
      };

      const processed = processor.processMessage(message);

      expect(processed.type).toBe('assistant');
      expect(processed.text).toBeUndefined();
    });

    it('应该处理没有 message 字段的助手消息', () => {
      const message: SDKMessage = {
        type: 'assistant',
      };

      const processed = processor.processMessage(message);

      expect(processed.type).toBe('assistant');
      expect(processed.text).toBeUndefined();
    });
  });

  describe('processMessage - 工具调用消息处理', () => {
    it('应该正确处理工具调用消息', () => {
      const message = createToolUseMessage('Bash', { command: 'ls -la' });
      const processed = processor.processMessage(message);

      expect(processed.type).toBe('tool_use');
      expect(processed.toolUse).toBeDefined();
      expect(processed.toolUse?.name).toBe('Bash');
      expect(processed.toolUse?.input).toEqual({ command: 'ls -la' });
    });

    it('应该处理没有参数的工具调用消息', () => {
      const message: SDKMessage = {
        type: 'tool_use',
        tool: 'Read',
      };

      const processed = processor.processMessage(message);

      expect(processed.type).toBe('tool_use');
      expect(processed.toolUse).toBeUndefined();
    });
  });

  describe('processMessage - 工具结果消息处理', () => {
    it('应该正确处理字符串工具结果', () => {
      const message = createToolResultMessage('文件内容：Hello World');
      const processed = processor.processMessage(message);

      expect(processed.type).toBe('tool_result');
      expect(processed.toolResult).toBeDefined();
      expect(processed.toolResult?.content).toBe('文件内容：Hello World');
      expect(processed.toolResult?.isError).toBe(false);
    });

    it('应该正确处理对象工具结果', () => {
      const message = createToolResultMessage({ files: ['a.txt', 'b.txt'] });
      const processed = processor.processMessage(message);

      expect(processed.type).toBe('tool_result');
      expect(processed.toolResult).toBeDefined();
      expect(processed.toolResult?.content).toContain('files');
    });

    it('应该处理 null 工具结果', () => {
      const message = createToolResultMessage(null);
      const processed = processor.processMessage(message);

      expect(processed.type).toBe('tool_result');
      expect(processed.toolResult?.content).toBe('');
    });
  });

  describe('processMessage - 结果消息处理', () => {
    it('应该正确处理成功结果消息', () => {
      const message = createResultMessage('success', 0.0123, 5000);
      const processed = processor.processMessage(message);

      expect(processed.type).toBe('result');
      expect(processed.result).toBeDefined();
      expect(processed.result?.subtype).toBe('success');
      expect(processed.result?.totalCostUsd).toBe(0.0123);
      expect(processed.result?.durationMs).toBe(5000);
    });

    it('应该正确处理错误结果消息', () => {
      const message = createResultMessage('error');
      const processed = processor.processMessage(message);

      expect(processed.type).toBe('result');
      expect(processed.result?.subtype).toBe('error');
    });

    it('应该正确处理中断结果消息', () => {
      const message = createResultMessage('interrupted');
      const processed = processor.processMessage(message);

      expect(processed.type).toBe('result');
      expect(processed.result?.subtype).toBe('interrupted');
    });

    it('应该正确处理达到最大轮数的结果消息', () => {
      const message = createResultMessage('max_turns');
      const processed = processor.processMessage(message);

      expect(processed.type).toBe('result');
      expect(processed.result?.subtype).toBe('max_turns');
    });
  });

  describe('processMessage - 错误消息处理', () => {
    it('应该正确处理错误消息', () => {
      const message = createErrorMessage('API 调用失败', 'API_ERROR');
      const processed = processor.processMessage(message);

      expect(processed.type).toBe('error');
      expect(processed.error).toBeDefined();
      expect(processed.error?.message).toBe('API 调用失败');
      expect(processed.error?.code).toBe('API_ERROR');
    });

    it('应该处理没有错误码的错误消息', () => {
      const message = createErrorMessage('未知错误');
      const processed = processor.processMessage(message);

      expect(processed.type).toBe('error');
      expect(processed.error?.message).toBe('未知错误');
      expect(processed.error?.code).toBeUndefined();
    });
  });

  describe('extractTextFromAssistantMessage', () => {
    it('应该从助手消息中提取文本', () => {
      const message = createAssistantMessage('这是提取的文本');
      const text = processor.extractTextFromAssistantMessage(message);

      expect(text).toBe('这是提取的文本');
    });

    it('应该合并多个文本块', () => {
      const message: SDKMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: '第一段' },
            { type: 'text', text: '第二段' },
          ],
        },
      };

      const text = processor.extractTextFromAssistantMessage(message);

      expect(text).toBe('第一段第二段');
    });

    it('应该对非助手消息返回 undefined', () => {
      const message: SDKMessage = { type: 'result', subtype: 'success' };
      const text = processor.extractTextFromAssistantMessage(message);

      expect(text).toBeUndefined();
    });
  });

  describe('extractToolUseFromAssistantMessage', () => {
    it('应该从助手消息中提取工具调用', () => {
      const message = createAssistantMessage('执行命令', {
        id: 'tool-123',
        name: 'Bash',
        input: { command: 'npm test' },
      });

      const toolUse = processor.extractToolUseFromAssistantMessage(message);

      expect(toolUse).toBeDefined();
      expect(toolUse?.id).toBe('tool-123');
      expect(toolUse?.name).toBe('Bash');
      expect(toolUse?.input).toEqual({ command: 'npm test' });
    });

    it('应该对没有工具调用的消息返回 undefined', () => {
      const message = createAssistantMessage('只有文本');
      const toolUse = processor.extractToolUseFromAssistantMessage(message);

      expect(toolUse).toBeUndefined();
    });
  });

  describe('displayAssistantMessage', () => {
    it('应该流式输出助手消息文本', () => {
      const message = createAssistantMessage('流式输出测试');
      processor.displayAssistantMessage(message);

      expect(mockOutputHandler.getOutput()).toContain('流式输出测试');
    });

    it('应该处理空消息', () => {
      const message: SDKMessage = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [],
        },
      };

      processor.displayAssistantMessage(message);

      expect(mockOutputHandler.output).toHaveLength(0);
    });

    it('非流式模式应该使用 writeLine', () => {
      const nonStreamingProcessor = new StreamingMessageProcessor({
        outputHandler: mockOutputHandler,
        enableStreaming: false,
      });

      const message = createAssistantMessage('非流式输出');
      nonStreamingProcessor.displayAssistantMessage(message);

      expect(mockOutputHandler.getOutput()).toContain('非流式输出\n');
    });
  });

  describe('displayToolUse', () => {
    it('应该显示工具调用信息', () => {
      const toolUse = {
        id: 'tool-1',
        name: 'Read',
        input: { path: '/test/file.txt' },
      };

      processor.displayToolUse(toolUse);

      const output = mockOutputHandler.getOutput();
      expect(output).toContain('工具调用');
      expect(output).toContain('Read');
      expect(output).toContain('/test/file.txt');
    });

    it('应该在禁用工具详情时不显示', () => {
      const noDetailsProcessor = new StreamingMessageProcessor({
        outputHandler: mockOutputHandler,
        showToolDetails: false,
      });

      const toolUse = {
        id: 'tool-1',
        name: 'Read',
        input: { path: '/test/file.txt' },
      };

      noDetailsProcessor.displayToolUse(toolUse);

      expect(mockOutputHandler.output).toHaveLength(0);
    });

    it('应该处理空输入的工具调用', () => {
      const toolUse = {
        id: 'tool-1',
        name: 'Glob',
        input: {},
      };

      processor.displayToolUse(toolUse);

      const output = mockOutputHandler.getOutput();
      expect(output).toContain('Glob');
    });
  });

  describe('displayToolResult', () => {
    it('应该显示成功的工具结果', () => {
      const toolResult = {
        toolUseId: 'tool-1',
        content: '文件内容',
        isError: false,
      };

      processor.displayToolResult(toolResult);

      const output = mockOutputHandler.getOutput();
      expect(output).toContain('✅');
      expect(output).toContain('文件内容');
    });

    it('应该显示错误的工具结果', () => {
      const toolResult = {
        toolUseId: 'tool-1',
        content: '文件不存在',
        isError: true,
      };

      processor.displayToolResult(toolResult);

      const output = mockOutputHandler.getOutput();
      expect(output).toContain('❌');
      expect(output).toContain('文件不存在');
    });

    it('应该截断过长的结果', () => {
      const longContent = 'x'.repeat(600);
      const toolResult = {
        toolUseId: 'tool-1',
        content: longContent,
        isError: false,
      };

      processor.displayToolResult(toolResult);

      const output = mockOutputHandler.getOutput();
      expect(output).toContain('...');
      expect(output.length).toBeLessThan(longContent.length);
    });
  });

  describe('displayResult', () => {
    it('应该显示成功结果', () => {
      const result = {
        subtype: 'success',
        totalCostUsd: 0.0123,
        durationMs: 5000,
      };

      processor.displayResult(result);

      const output = mockOutputHandler.getOutput();
      expect(output).toContain('✅');
      expect(output).toContain('查询完成');
      expect(output).toContain('0.0123');
      expect(output).toContain('5.00s');
    });

    it('应该显示错误结果', () => {
      const result = { subtype: 'error' };
      processor.displayResult(result);

      const output = mockOutputHandler.getOutput();
      expect(output).toContain('❌');
      expect(output).toContain('查询失败');
    });

    it('应该显示中断结果', () => {
      const result = { subtype: 'interrupted' };
      processor.displayResult(result);

      const output = mockOutputHandler.getOutput();
      expect(output).toContain('⚠️');
      expect(output).toContain('中断');
    });

    it('应该显示达到最大轮数结果', () => {
      const result = { subtype: 'max_turns' };
      processor.displayResult(result);

      const output = mockOutputHandler.getOutput();
      expect(output).toContain('⚠️');
      expect(output).toContain('最大对话轮数');
    });

    it('应该在禁用成本信息时不显示费用', () => {
      const noCostProcessor = new StreamingMessageProcessor({
        outputHandler: mockOutputHandler,
        showCostInfo: false,
      });

      const result = {
        subtype: 'success',
        totalCostUsd: 0.0123,
      };

      noCostProcessor.displayResult(result);

      const output = mockOutputHandler.getOutput();
      expect(output).not.toContain('费用');
    });
  });

  describe('displayError', () => {
    it('应该显示错误信息', () => {
      const error = {
        message: 'API 调用失败',
        code: 'API_ERROR',
      };

      processor.displayError(error);

      expect(mockOutputHandler.errors.length).toBeGreaterThan(0);
      const errorOutput = mockOutputHandler.errors.join('');
      expect(errorOutput).toContain('API 调用失败');
      expect(errorOutput).toContain('API_ERROR');
    });

    it('应该处理没有错误码的错误', () => {
      const error = { message: '未知错误' };
      processor.displayError(error);

      const errorOutput = mockOutputHandler.errors.join('');
      expect(errorOutput).toContain('未知错误');
    });
  });

  describe('processAndDisplay', () => {
    it('应该处理并显示助手消息', () => {
      const message = createAssistantMessage('测试消息');
      const processed = processor.processAndDisplay(message);

      expect(processed.type).toBe('assistant');
      expect(processed.text).toBe('测试消息');
      expect(mockOutputHandler.getOutput()).toContain('测试消息');
    });

    it('应该处理并显示工具调用消息', () => {
      const message = createToolUseMessage('Read', { path: '/test.txt' });
      const processed = processor.processAndDisplay(message);

      expect(processed.type).toBe('tool_use');
      expect(mockOutputHandler.getOutput()).toContain('Read');
    });

    it('应该处理并显示结果消息', () => {
      const message = createResultMessage('success', 0.01, 1000);
      const processed = processor.processAndDisplay(message);

      expect(processed.type).toBe('result');
      expect(mockOutputHandler.getOutput()).toContain('查询完成');
    });

    it('应该处理并显示错误消息', () => {
      const message = createErrorMessage('测试错误');
      const processed = processor.processAndDisplay(message);

      expect(processed.type).toBe('error');
      expect(mockOutputHandler.errors.join('')).toContain('测试错误');
    });
  });

  describe('processStream', () => {
    it('应该处理消息流', async () => {
      async function* createMessageStream(): AsyncGenerator<SDKMessage> {
        yield createAssistantMessage('第一条消息');
        yield createAssistantMessage('第二条消息');
        yield createResultMessage('success', 0.01, 1000);
      }

      const processedMessages: ProcessedMessage[] = [];
      for await (const processed of processor.processStream(createMessageStream())) {
        processedMessages.push(processed);
      }

      expect(processedMessages).toHaveLength(3);
      expect(processedMessages[0].type).toBe('assistant');
      expect(processedMessages[1].type).toBe('assistant');
      expect(processedMessages[2].type).toBe('result');
    });

    it('应该处理空消息流', async () => {
      async function* createEmptyStream(): AsyncGenerator<SDKMessage> {
        // 空流
      }

      const processedMessages: ProcessedMessage[] = [];
      for await (const processed of processor.processStream(createEmptyStream())) {
        processedMessages.push(processed);
      }

      expect(processedMessages).toHaveLength(0);
    });

    it('应该处理包含工具调用的消息流', async () => {
      async function* createToolStream(): AsyncGenerator<SDKMessage> {
        yield createAssistantMessage('让我读取文件', {
          id: 'tool-1',
          name: 'Read',
          input: { path: '/test.txt' },
        });
        yield createToolResultMessage('文件内容');
        yield createResultMessage('success');
      }

      const processedMessages: ProcessedMessage[] = [];
      for await (const processed of processor.processStream(createToolStream())) {
        processedMessages.push(processed);
      }

      expect(processedMessages).toHaveLength(3);
      expect(processedMessages[0].toolUse).toBeDefined();
      expect(processedMessages[1].toolResult).toBeDefined();
    });
  });
});

describe('StreamingMessageProcessor - 边界情况', () => {
  let mockOutputHandler: MockOutputHandler;
  let processor: StreamingMessageProcessor;

  beforeEach(() => {
    mockOutputHandler = new MockOutputHandler();
    processor = new StreamingMessageProcessor({
      outputHandler: mockOutputHandler,
    });
  });

  it('应该处理未知消息类型', () => {
    const message: SDKMessage = {
      type: 'system' as any,
    };

    const processed = processor.processMessage(message);

    expect(processed.type).toBe('system');
  });

  it('应该处理 undefined 结果', () => {
    const message: SDKMessage = {
      type: 'tool_result',
      result: undefined,
    };

    const processed = processor.processMessage(message);

    expect(processed.type).toBe('tool_result');
    expect(processed.toolResult).toBeUndefined();
  });

  it('应该处理复杂的工具输入', () => {
    const complexInput = {
      nested: {
        array: [1, 2, 3],
        object: { key: 'value' },
      },
      special: '特殊字符: <>&"\'',
    };

    const message = createToolUseMessage('CustomTool', complexInput);
    const processed = processor.processMessage(message);

    expect(processed.toolUse?.input).toEqual(complexInput);
  });

  it('应该处理 null 值', () => {
    processor.displayToolUse(undefined);
    processor.displayToolResult(undefined);
    processor.displayResult(undefined);
    processor.displayError(undefined);

    // 不应该抛出错误
    expect(mockOutputHandler.output).toHaveLength(0);
    expect(mockOutputHandler.errors).toHaveLength(0);
  });
});

describe('StreamingMessageProcessor - 流式事件处理', () => {
  let mockOutputHandler: MockOutputHandler;

  beforeEach(() => {
    mockOutputHandler = new MockOutputHandler();
  });

  /**
   * 创建模拟的流式事件消息（SDKPartialAssistantMessage）
   */
  function createStreamEventMessage(
    eventType: string,
    deltaText?: string
  ): SDKMessage {
    return {
      type: 'stream_event',
      event: {
        type: eventType,
        delta: deltaText ? {
          type: 'text_delta',
          text: deltaText,
        } : undefined,
      },
    };
  }

  /**
   * 创建带有 content_block_start 的流式事件消息
   */
  function createContentBlockStartMessage(text: string): SDKMessage {
    return {
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        content_block: {
          type: 'text',
          text: text,
        },
      },
    };
  }

  describe('extractTextFromStreamEvent', () => {
    it('应该从 content_block_delta 事件中提取文本', () => {
      const processor = new StreamingMessageProcessor({
        outputHandler: mockOutputHandler,
        includePartialMessages: true,
      });

      const message = createStreamEventMessage('content_block_delta', '你好');
      const text = processor.extractTextFromStreamEvent(message);

      expect(text).toBe('你好');
    });

    it('应该从 content_block_start 事件中提取初始文本', () => {
      const processor = new StreamingMessageProcessor({
        outputHandler: mockOutputHandler,
        includePartialMessages: true,
      });

      const message = createContentBlockStartMessage('开始');
      const text = processor.extractTextFromStreamEvent(message);

      expect(text).toBe('开始');
    });

    it('应该对非 stream_event 类型返回 undefined', () => {
      const processor = new StreamingMessageProcessor({
        outputHandler: mockOutputHandler,
        includePartialMessages: true,
      });

      const message: SDKMessage = { type: 'assistant' };
      const text = processor.extractTextFromStreamEvent(message);

      expect(text).toBeUndefined();
    });

    it('应该对没有 event 字段的消息返回 undefined', () => {
      const processor = new StreamingMessageProcessor({
        outputHandler: mockOutputHandler,
        includePartialMessages: true,
      });

      const message: SDKMessage = { type: 'stream_event' };
      const text = processor.extractTextFromStreamEvent(message);

      expect(text).toBeUndefined();
    });

    it('应该对没有 delta 的事件返回 undefined', () => {
      const processor = new StreamingMessageProcessor({
        outputHandler: mockOutputHandler,
        includePartialMessages: true,
      });

      const message: SDKMessage = {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
        },
      };
      const text = processor.extractTextFromStreamEvent(message);

      expect(text).toBeUndefined();
    });
  });

  describe('displayStreamEvent', () => {
    it('应该在启用 includePartialMessages 时输出流式文本', () => {
      const processor = new StreamingMessageProcessor({
        outputHandler: mockOutputHandler,
        includePartialMessages: true,
        updateIntervalMs: 0, // 禁用节流以便测试
      });

      const message = createStreamEventMessage('content_block_delta', '流式文本');
      processor.displayStreamEvent(message, true);

      expect(mockOutputHandler.getOutput()).toContain('流式文本');
    });

    it('应该在禁用 includePartialMessages 时不输出', () => {
      const processor = new StreamingMessageProcessor({
        outputHandler: mockOutputHandler,
        includePartialMessages: false,
      });

      const message = createStreamEventMessage('content_block_delta', '不应该输出');
      processor.displayStreamEvent(message, true);

      expect(mockOutputHandler.output).toHaveLength(0);
    });

    it('应该在禁用流式输出时不输出', () => {
      const processor = new StreamingMessageProcessor({
        outputHandler: mockOutputHandler,
        includePartialMessages: true,
        enableStreaming: false,
      });

      const message = createStreamEventMessage('content_block_delta', '不应该输出');
      processor.displayStreamEvent(message, true);

      expect(mockOutputHandler.output).toHaveLength(0);
    });

    it('应该使用节流机制优化更新频率', async () => {
      const processor = new StreamingMessageProcessor({
        outputHandler: mockOutputHandler,
        includePartialMessages: true,
        updateIntervalMs: 100, // 100ms 更新间隔
      });

      // 快速发送多个消息
      processor.displayStreamEvent(createStreamEventMessage('content_block_delta', 'A'));
      processor.displayStreamEvent(createStreamEventMessage('content_block_delta', 'B'));
      processor.displayStreamEvent(createStreamEventMessage('content_block_delta', 'C'));

      // 由于节流，可能不会立即输出所有内容
      // 强制刷新以获取所有内容
      processor.flushPendingText();

      expect(mockOutputHandler.getOutput()).toContain('ABC');
    });
  });

  describe('flushPendingText', () => {
    it('应该刷新待输出的缓冲文本', () => {
      const processor = new StreamingMessageProcessor({
        outputHandler: mockOutputHandler,
        includePartialMessages: true,
        updateIntervalMs: 1000, // 长间隔以确保文本被缓冲
      });

      processor.displayStreamEvent(createStreamEventMessage('content_block_delta', '缓冲'));
      
      // 此时文本应该在缓冲区中
      expect(mockOutputHandler.output).toHaveLength(0);

      // 刷新缓冲区
      processor.flushPendingText();

      expect(mockOutputHandler.getOutput()).toContain('缓冲');
    });

    it('应该在缓冲区为空时不输出', () => {
      const processor = new StreamingMessageProcessor({
        outputHandler: mockOutputHandler,
        includePartialMessages: true,
      });

      processor.flushPendingText();

      expect(mockOutputHandler.output).toHaveLength(0);
    });
  });

  describe('resetStreamState', () => {
    it('应该重置流式处理状态', () => {
      const processor = new StreamingMessageProcessor({
        outputHandler: mockOutputHandler,
        includePartialMessages: true,
        updateIntervalMs: 1000,
      });

      // 添加一些待输出的文本
      processor.displayStreamEvent(createStreamEventMessage('content_block_delta', '待清除'));

      // 重置状态
      processor.resetStreamState();

      // 刷新后应该没有输出
      processor.flushPendingText();

      expect(mockOutputHandler.output).toHaveLength(0);
    });
  });

  describe('processMessage - stream_event', () => {
    it('应该正确处理 stream_event 类型消息', () => {
      const processor = new StreamingMessageProcessor({
        outputHandler: mockOutputHandler,
        includePartialMessages: true,
      });

      const message = createStreamEventMessage('content_block_delta', '处理测试');
      const processed = processor.processMessage(message);

      expect(processed.type).toBe('stream_event');
      expect(processed.text).toBe('处理测试');
    });
  });

  describe('processAndDisplay - stream_event', () => {
    it('应该处理并显示 stream_event 消息', () => {
      const processor = new StreamingMessageProcessor({
        outputHandler: mockOutputHandler,
        includePartialMessages: true,
        updateIntervalMs: 0,
      });

      const message = createStreamEventMessage('content_block_delta', '显示测试');
      const processed = processor.processAndDisplay(message);
      processor.flushPendingText();

      expect(processed.type).toBe('stream_event');
      expect(mockOutputHandler.getOutput()).toContain('显示测试');
    });

    it('应该在结果消息前刷新缓冲区', () => {
      const processor = new StreamingMessageProcessor({
        outputHandler: mockOutputHandler,
        includePartialMessages: true,
        updateIntervalMs: 1000,
      });

      // 先发送流式事件
      processor.displayStreamEvent(createStreamEventMessage('content_block_delta', '流式'));

      // 然后发送结果消息
      const resultMessage = createResultMessage('success', 0.01, 1000);
      processor.processAndDisplay(resultMessage);

      // 流式文本应该在结果消息前被刷新
      const output = mockOutputHandler.getOutput();
      expect(output).toContain('流式');
      expect(output).toContain('查询完成');
    });
  });

  describe('processStream - 流式事件', () => {
    it('应该在流结束时刷新所有待输出的文本', async () => {
      const processor = new StreamingMessageProcessor({
        outputHandler: mockOutputHandler,
        includePartialMessages: true,
        updateIntervalMs: 1000, // 长间隔
      });

      async function* createStreamWithEvents(): AsyncGenerator<SDKMessage> {
        yield createStreamEventMessage('content_block_delta', '第一');
        yield createStreamEventMessage('content_block_delta', '第二');
        yield createResultMessage('success');
      }

      const processedMessages: ProcessedMessage[] = [];
      for await (const processed of processor.processStream(createStreamWithEvents())) {
        processedMessages.push(processed);
      }

      // 流结束后所有文本应该被输出
      const output = mockOutputHandler.getOutput();
      expect(output).toContain('第一');
      expect(output).toContain('第二');
    });

    it('应该在每次流开始时重置状态', async () => {
      const processor = new StreamingMessageProcessor({
        outputHandler: mockOutputHandler,
        includePartialMessages: true,
        updateIntervalMs: 0,
      });

      // 第一次流
      async function* firstStream(): AsyncGenerator<SDKMessage> {
        yield createStreamEventMessage('content_block_delta', '第一次');
      }

      for await (const _ of processor.processStream(firstStream())) {
        // 处理消息
      }

      mockOutputHandler.clear();

      // 第二次流
      async function* secondStream(): AsyncGenerator<SDKMessage> {
        yield createStreamEventMessage('content_block_delta', '第二次');
      }

      for await (const _ of processor.processStream(secondStream())) {
        // 处理消息
      }

      // 第二次流应该只包含第二次的内容
      const output = mockOutputHandler.getOutput();
      expect(output).not.toContain('第一次');
      expect(output).toContain('第二次');
    });
  });
});
