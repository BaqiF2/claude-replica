/**
 * 流式消息处理器
 *
 * 负责处理 Claude Agent SDK 返回的流式消息
 * 实现不同 SDKMessage 类型的处理、文本提取和终端输出
 *
 * @module StreamingMessageProcessor
 */

/**
 * SDK 消息类型枚举
 */
export type SDKMessageType =
  | 'assistant'
  | 'user'
  | 'tool_use'
  | 'tool_result'
  | 'result'
  | 'error'
  | 'system';

/**
 * 内容块类型
 */
export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | unknown[];
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

/**
 * 助手消息接口
 */
export interface AssistantMessage {
  role: 'assistant';
  content: ContentBlock[];
}

/**
 * SDK 消息接口
 */
export interface SDKMessage {
  type: SDKMessageType;
  message?: AssistantMessage;
  subtype?: 'success' | 'error' | 'interrupted' | 'max_turns';
  total_cost_usd?: number;
  duration_ms?: number;
  error?: {
    message: string;
    code?: string;
  };
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
}

/**
 * 处理后的消息接口
 */
export interface ProcessedMessage {
  /** 消息类型 */
  type: SDKMessageType;
  /** 提取的文本内容 */
  text?: string;
  /** 工具调用信息 */
  toolUse?: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
  /** 工具结果信息 */
  toolResult?: {
    toolUseId: string;
    content: string;
    isError: boolean;
  };
  /** 结果信息 */
  result?: {
    subtype: string;
    totalCostUsd?: number;
    durationMs?: number;
  };
  /** 错误信息 */
  error?: {
    message: string;
    code?: string;
  };
}

/**
 * 输出处理器接口
 */
export interface OutputHandler {
  /** 写入文本 */
  write(text: string): void;
  /** 写入一行 */
  writeLine(text: string): void;
  /** 写入错误 */
  writeError(text: string): void;
}

/**
 * 默认终端输出处理器
 */
export class TerminalOutputHandler implements OutputHandler {
  write(text: string): void {
    process.stdout.write(text);
  }

  writeLine(text: string): void {
    console.log(text);
  }

  writeError(text: string): void {
    console.error(text);
  }
}

/**
 * 流式消息处理器选项
 */
export interface StreamingMessageProcessorOptions {
  /** 输出处理器 */
  outputHandler?: OutputHandler;
  /** 是否显示工具调用详情 */
  showToolDetails?: boolean;
  /** 是否显示成本信息 */
  showCostInfo?: boolean;
  /** 是否启用流式输出 */
  enableStreaming?: boolean;
}

/**
 * 流式消息处理器类
 *
 * 负责：
 * - 处理不同类型的 SDKMessage
 * - 提取助手消息中的文本内容
 * - 显示工具调用信息
 * - 处理结果消息
 * - 流式输出到终端
 */
export class StreamingMessageProcessor {
  private readonly outputHandler: OutputHandler;
  private readonly showToolDetails: boolean;
  private readonly showCostInfo: boolean;
  private readonly enableStreaming: boolean;

  constructor(options: StreamingMessageProcessorOptions = {}) {
    this.outputHandler = options.outputHandler || new TerminalOutputHandler();
    this.showToolDetails = options.showToolDetails ?? true;
    this.showCostInfo = options.showCostInfo ?? true;
    this.enableStreaming = options.enableStreaming ?? true;
  }

  /**
   * 处理单个 SDK 消息
   *
   * @param message - SDK 消息
   * @returns 处理后的消息
   */
  processMessage(message: SDKMessage): ProcessedMessage {
    const processed: ProcessedMessage = {
      type: message.type,
    };

    switch (message.type) {
      case 'assistant':
        processed.text = this.extractTextFromAssistantMessage(message);
        processed.toolUse = this.extractToolUseFromAssistantMessage(message);
        break;

      case 'tool_use':
        if (message.tool && message.args) {
          processed.toolUse = {
            id: '',
            name: message.tool,
            input: message.args,
          };
        }
        break;

      case 'tool_result':
        if (message.result !== undefined) {
          processed.toolResult = {
            toolUseId: '',
            content: this.formatToolResult(message.result),
            isError: false,
          };
        }
        break;

      case 'result':
        processed.result = {
          subtype: message.subtype || 'success',
          totalCostUsd: message.total_cost_usd,
          durationMs: message.duration_ms,
        };
        break;

      case 'error':
        processed.error = message.error;
        break;
    }

    return processed;
  }

  /**
   * 从助手消息中提取文本内容
   *
   * @param message - SDK 消息
   * @returns 提取的文本内容
   */
  extractTextFromAssistantMessage(message: SDKMessage): string | undefined {
    if (message.type !== 'assistant' || !message.message) {
      return undefined;
    }

    const content = message.message.content;
    if (!Array.isArray(content)) {
      return undefined;
    }

    const textBlocks = content.filter(
      (block): block is TextBlock => block.type === 'text'
    );

    if (textBlocks.length === 0) {
      return undefined;
    }

    return textBlocks.map((block) => block.text).join('');
  }

  /**
   * 从助手消息中提取工具调用信息
   *
   * @param message - SDK 消息
   * @returns 工具调用信息
   */
  extractToolUseFromAssistantMessage(
    message: SDKMessage
  ): ProcessedMessage['toolUse'] | undefined {
    if (message.type !== 'assistant' || !message.message) {
      return undefined;
    }

    const content = message.message.content;
    if (!Array.isArray(content)) {
      return undefined;
    }

    const toolUseBlock = content.find(
      (block): block is ToolUseBlock => block.type === 'tool_use'
    );

    if (!toolUseBlock) {
      return undefined;
    }

    return {
      id: toolUseBlock.id,
      name: toolUseBlock.name,
      input: toolUseBlock.input,
    };
  }

  /**
   * 显示助手消息
   *
   * @param message - SDK 消息
   */
  displayAssistantMessage(message: SDKMessage): void {
    const text = this.extractTextFromAssistantMessage(message);
    if (text) {
      if (this.enableStreaming) {
        this.outputHandler.write(text);
      } else {
        this.outputHandler.writeLine(text);
      }
    }
  }

  /**
   * 显示工具调用信息
   *
   * @param toolUse - 工具调用信息
   */
  displayToolUse(toolUse: ProcessedMessage['toolUse']): void {
    if (!toolUse || !this.showToolDetails) {
      return;
    }

    this.outputHandler.writeLine('');
    this.outputHandler.writeLine(`🔧 工具调用: ${toolUse.name}`);

    if (Object.keys(toolUse.input).length > 0) {
      this.outputHandler.writeLine(`   参数: ${JSON.stringify(toolUse.input, null, 2)}`);
    }
  }

  /**
   * 显示工具结果
   *
   * @param toolResult - 工具结果信息
   */
  displayToolResult(toolResult: ProcessedMessage['toolResult']): void {
    if (!toolResult || !this.showToolDetails) {
      return;
    }

    const prefix = toolResult.isError ? '❌' : '✅';
    this.outputHandler.writeLine(`${prefix} 工具结果:`);

    // 截断过长的结果
    const content = toolResult.content;
    const maxLength = 500;
    if (content.length > maxLength) {
      this.outputHandler.writeLine(`   ${content.substring(0, maxLength)}...`);
    } else {
      this.outputHandler.writeLine(`   ${content}`);
    }
  }

  /**
   * 显示结果信息
   *
   * @param result - 结果信息
   */
  displayResult(result: ProcessedMessage['result']): void {
    if (!result) {
      return;
    }

    this.outputHandler.writeLine('');

    switch (result.subtype) {
      case 'success':
        this.outputHandler.writeLine('✅ 查询完成');
        break;
      case 'error':
        this.outputHandler.writeLine('❌ 查询失败');
        break;
      case 'interrupted':
        this.outputHandler.writeLine('⚠️ 查询被中断');
        break;
      case 'max_turns':
        this.outputHandler.writeLine('⚠️ 达到最大对话轮数');
        break;
      default:
        this.outputHandler.writeLine(`📋 查询结束: ${result.subtype}`);
    }

    if (this.showCostInfo && result.totalCostUsd !== undefined) {
      this.outputHandler.writeLine(`💰 费用: $${result.totalCostUsd.toFixed(4)}`);
    }

    if (result.durationMs !== undefined) {
      this.outputHandler.writeLine(`⏱️ 耗时: ${(result.durationMs / 1000).toFixed(2)}s`);
    }
  }

  /**
   * 显示错误信息
   *
   * @param error - 错误信息
   */
  displayError(error: ProcessedMessage['error']): void {
    if (!error) {
      return;
    }

    this.outputHandler.writeError('');
    this.outputHandler.writeError(`❌ 错误: ${error.message}`);
    if (error.code) {
      this.outputHandler.writeError(`   错误码: ${error.code}`);
    }
  }

  /**
   * 处理并显示 SDK 消息
   *
   * @param message - SDK 消息
   * @returns 处理后的消息
   */
  processAndDisplay(message: SDKMessage): ProcessedMessage {
    const processed = this.processMessage(message);

    switch (message.type) {
      case 'assistant':
        this.displayAssistantMessage(message);
        if (processed.toolUse) {
          this.displayToolUse(processed.toolUse);
        }
        break;

      case 'tool_use':
        this.displayToolUse(processed.toolUse);
        break;

      case 'tool_result':
        this.displayToolResult(processed.toolResult);
        break;

      case 'result':
        this.displayResult(processed.result);
        break;

      case 'error':
        this.displayError(processed.error);
        break;
    }

    return processed;
  }

  /**
   * 处理流式消息生成器
   *
   * @param messages - SDK 消息异步生成器
   * @yields 处理后的消息
   */
  async *processStream(
    messages: AsyncIterable<SDKMessage>
  ): AsyncGenerator<ProcessedMessage> {
    for await (const message of messages) {
      yield this.processAndDisplay(message);
    }
  }

  /**
   * 格式化工具结果
   *
   * @param result - 工具结果
   * @returns 格式化后的字符串
   */
  private formatToolResult(result: unknown): string {
    if (typeof result === 'string') {
      return result;
    }
    if (result === null || result === undefined) {
      return '';
    }
    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  }
}
