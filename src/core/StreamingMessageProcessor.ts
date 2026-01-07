/**
 * 文件功能：流式消息处理模块，负责处理 Claude Agent SDK 返回的流式消息并输出到终端
 *
 * 核心类：
 * - StreamingMessageProcessor: 流式消息处理器
 * - TerminalOutputHandler: 默认终端输出处理器
 *
 * 核心方法：
 * - processMessage(): 处理单个 SDK 消息
 * - processAndDisplay(): 处理并显示 SDK 消息
 * - processStream(): 处理流式消息生成器
 * - displayAssistantMessage(): 显示助手消息
 * - displayStreamEvent(): 显示流式事件消息
 * - extractTextFromAssistantMessage(): 从助手消息提取文本
 */

export type SDKMessageType =
  | 'assistant'
  | 'user'
  | 'tool_use'
  | 'tool_result'
  | 'result'
  | 'error'
  | 'system'
  | 'stream_event';

/**
 * 内容块类型 - 文本块
 */
export interface TextBlock {
  type: 'text';
  text: string;
}

/**
 * 内容块类型 - 工具调用块
 */
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * 内容块类型 - 工具结果块
 */
export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | unknown[];
  is_error?: boolean;
}

/**
 * 内容块类型 - 思考块（用于扩展思考功能）
 */
export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

/**
 * 内容块联合类型
 * 对齐 SDK 的 ContentBlock 类型
 */
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ThinkingBlock;

/**
 * 助手消息接口
 * 对齐 SDK 的 APIAssistantMessage 类型
 */
export interface AssistantMessage {
  role: 'assistant';
  content: ContentBlock[];
}

/**
 * 用户消息接口
 * 对齐 SDK 的 APIUserMessage 类型
 */
export interface UserMessage {
  role: 'user';
  content: string | ContentBlock[];
}

/**
 * 流式事件类型
 * 对齐 SDK 的 RawMessageStreamEvent 类型
 * **验证: 需求 2.4**
 */
export interface StreamEvent {
  type: string;
  index?: number;
  delta?: {
    type: string;
    text?: string;
    partial_json?: string;
  };
  content_block?: ContentBlock;
}

/**
 * SDK 消息接口
 * 对齐 SDK 的 SDKMessage 联合类型
 * **验证: 需求 2.1**
 */
export interface SDKMessage {
  /** 消息类型 */
  type: SDKMessageType;
  /** 消息 UUID */
  uuid?: string;
  /** 会话 ID */
  session_id?: string;
  /** 助手消息内容 */
  message?: AssistantMessage;
  /** 结果子类型 */
  subtype?:
    | 'success'
    | 'error'
    | 'interrupted'
    | 'max_turns'
    | 'error_max_turns'
    | 'error_during_execution'
    | 'error_max_budget_usd'
    | 'error_max_structured_output_retries'
    | 'init'
    | 'compact_boundary';
  /** 总花费（美元） */
  total_cost_usd?: number;
  /** 执行时长（毫秒） */
  duration_ms?: number;
  /** API 调用时长（毫秒） */
  duration_api_ms?: number;
  /** 错误信息 */
  error?: {
    message: string;
    code?: string;
  };
  /** 错误列表（用于错误结果消息） */
  errors?: string[];
  /** 工具名称 */
  tool?: string;
  /** 工具参数 */
  args?: Record<string, unknown>;
  /** 工具结果 */
  result?: unknown;
  /** Token 使用统计 */
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  /** 父工具调用 ID */
  parent_tool_use_id?: string | null;
  /** 流式事件（用于 SDKPartialAssistantMessage） */
  event?: StreamEvent;
  /** 是否为错误 */
  is_error?: boolean;
  /** 对话轮数 */
  num_turns?: number;
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
 * **验证: 需求 2.4**
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
  /** 是否处理部分消息（SDKPartialAssistantMessage） */
  includePartialMessages?: boolean;
  /** UI 更新最小间隔（毫秒），用于优化更新频率 */
  updateIntervalMs?: number;
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
 * - 处理 SDKPartialAssistantMessage 流式事件
 *
 * **验证: 需求 2.1, 2.4**
 */
export class StreamingMessageProcessor {
  private readonly outputHandler: OutputHandler;
  private readonly showToolDetails: boolean;
  private readonly showCostInfo: boolean;
  private readonly enableStreaming: boolean;
  private readonly includePartialMessages: boolean;
  private readonly updateIntervalMs: number;

  /** 上次 UI 更新时间戳 */
  private lastUpdateTime: number = 0;
  /** 待输出的缓冲文本 */
  private pendingText: string = '';

  constructor(options: StreamingMessageProcessorOptions = {}) {
    this.outputHandler = options.outputHandler || new TerminalOutputHandler();
    this.showToolDetails = options.showToolDetails ?? true;
    this.showCostInfo = options.showCostInfo ?? true;
    this.enableStreaming = options.enableStreaming ?? true;
    this.includePartialMessages = options.includePartialMessages ?? false;
    this.updateIntervalMs = options.updateIntervalMs ?? 50; // 默认 50ms 更新间隔
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

      case 'stream_event':
        // 处理 SDKPartialAssistantMessage
        processed.text = this.extractTextFromStreamEvent(message);
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
   * 从流式事件中提取文本内容
   * 处理 SDKPartialAssistantMessage 的 delta 事件
   *
   * @param message - SDK 消息（stream_event 类型）
   * @returns 提取的文本增量
   *
   * **验证: 需求 2.4**
   */
  extractTextFromStreamEvent(message: SDKMessage): string | undefined {
    if (message.type !== 'stream_event' || !message.event) {
      return undefined;
    }

    const event = message.event;

    // 处理 content_block_delta 事件
    if (event.type === 'content_block_delta' && event.delta) {
      if (event.delta.type === 'text_delta' && event.delta.text) {
        return event.delta.text;
      }
    }

    // 处理 content_block_start 事件中的初始文本
    if (event.type === 'content_block_start' && event.content_block) {
      if (event.content_block.type === 'text' && 'text' in event.content_block) {
        return (event.content_block as TextBlock).text;
      }
    }

    return undefined;
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

    const textBlocks = content.filter((block): block is TextBlock => block.type === 'text');

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
  extractToolUseFromAssistantMessage(message: SDKMessage): ProcessedMessage['toolUse'] | undefined {
    if (message.type !== 'assistant' || !message.message) {
      return undefined;
    }

    const content = message.message.content;
    if (!Array.isArray(content)) {
      return undefined;
    }

    const toolUseBlock = content.find((block): block is ToolUseBlock => block.type === 'tool_use');

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
   * 显示流式事件消息（SDKPartialAssistantMessage）
   * 使用节流机制优化 UI 更新频率
   *
   * @param message - SDK 消息（stream_event 类型）
   * @param forceFlush - 是否强制刷新缓冲区
   *
   * **验证: 需求 2.4**
   */
  displayStreamEvent(message: SDKMessage, forceFlush: boolean = false): void {
    if (!this.includePartialMessages || !this.enableStreaming) {
      return;
    }

    const text = this.extractTextFromStreamEvent(message);
    if (text) {
      this.pendingText += text;
    }

    const now = Date.now();

    // 初始化 lastUpdateTime（如果是第一次调用）
    if (this.lastUpdateTime === 0) {
      this.lastUpdateTime = now;
    }

    const timeSinceLastUpdate = now - this.lastUpdateTime;

    // 使用节流机制：只有当超过更新间隔或强制刷新时才输出
    if (forceFlush || timeSinceLastUpdate >= this.updateIntervalMs) {
      this.flushPendingText();
    }
  }

  /**
   * 刷新待输出的缓冲文本
   *
   * **验证: 需求 2.4**
   */
  flushPendingText(): void {
    if (this.pendingText.length > 0) {
      this.outputHandler.write(this.pendingText);
      this.pendingText = '';
      this.lastUpdateTime = Date.now();
    }
  }

  /**
   * 重置流式处理状态
   * 在开始新地流式处理前调用
   */
  resetStreamState(): void {
    this.pendingText = '';
    this.lastUpdateTime = 0;
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
    this.outputHandler.writeError(`❌ Error: ${error.message}`);
    if (error.code) {
      this.outputHandler.writeError(`   Error code: ${error.code}`);
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

      case 'stream_event':
        // 处理 SDKPartialAssistantMessage
        this.displayStreamEvent(message);
        break;

      case 'tool_use':
        this.displayToolUse(processed.toolUse);
        break;

      case 'tool_result':
        this.displayToolResult(processed.toolResult);
        break;

      case 'result':
        // 在结果消息前刷新所有待输出的文本
        this.flushPendingText();
        this.displayResult(processed.result);
        break;

      case 'error':
        // 在错误消息前刷新所有待输出的文本
        this.flushPendingText();
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
   *
   * **验证: 需求 2.4**
   */
  async *processStream(messages: AsyncIterable<SDKMessage>): AsyncGenerator<ProcessedMessage> {
    // 重置流式处理状态
    this.resetStreamState();

    for await (const message of messages) {
      yield this.processAndDisplay(message);
    }

    // 流结束时刷新所有待输出的文本
    this.flushPendingText();
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
