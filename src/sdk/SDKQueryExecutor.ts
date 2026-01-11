/**
 * 文件功能：SDK 查询执行模块，封装 Claude Agent SDK 的 query() 函数调用逻辑
 *
 * 核心类：
 * - SDKQueryExecutor: SDK 查询执行器核心类
 *
 * 核心方法：
 * - execute(): 执行 SDK 查询并处理响应（兼容接口，内部使用流式实现）
 * - executeStreaming(): 执行流式 SDK 查询，接受 AsyncGenerator 输入
 * - setCustomMcpServers(): 设置自定义 MCP 服务器配置并用于合并
 * - interrupt(): 中断正在进行的查询
 * - isRunning(): 检查是否有查询正在进行
 * - classifyError(): 分类 SDK 错误类型
 */

import {
  query,
  type SDKMessage,
  type SDKAssistantMessage,
  type SDKResultMessage,
  type Options as SDKOptions,
  type PermissionMode,
  type AgentDefinition,
  type McpServerConfig,
  type SandboxSettings,
  type HookEvent,
  type HookCallbackMatcher,
  type CanUseTool,
} from '@anthropic-ai/claude-agent-sdk';

/**
 * 文本内容块
 *
 * 用于构建消息中的纯文本内容
 */
export interface TextContentBlock {
  type: 'text';
  text: string;
}

/**
 * 图像内容块
 *
 * 用于构建消息中的图像内容，支持 Base64 编码
 */
export interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

/**
 * 内容块联合类型
 *
 * 支持文本和图像两种类型的内容块
 */
export type StreamContentBlock = TextContentBlock | ImageContentBlock;

/**
 * 流式消息接口（应用内部使用）
 *
 * 定义应用内部使用的简化消息结构
 */
export interface StreamMessage {
  type: 'user';
  message: {
    role: 'user';
    content: string | StreamContentBlock[];
  };
}

/**
 * SDK 用户消息接口（符合 SDK 要求）
 *
 * 定义发送给 SDK 的完整消息结构，包含所有必需字段
 */
export interface SDKStreamMessage {
  type: 'user';
  session_id: string;
  message: {
    role: 'user';
    content: string | StreamContentBlock[];
  };
  parent_tool_use_id: string | null;
}

/**
 * 流式输入消息生成器类型
 *
 * 用于流式输入模式，按序列 yield 消息到 SDK
 */
export type StreamMessageGenerator = AsyncGenerator<StreamMessage, void, unknown>;

/**
 * SDK 消息回调类型
 *
 * 用于在消息处理过程中接收每个 SDK 消息的回调函数
 */
export type SDKMessageCallback = (message: SDKMessage) => void;

/**
 * SDK 查询选项接口
 *
 * 定义调用 SDK query() 函数所需的所有配置选项
 */
export interface SDKQueryOptions {
  /** 用户提示词 */
  prompt: string;
  /** 模型名称 */
  model?: string;
  /** 系统提示词 */
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string };
  /** 配置源列表（用于 SDK 自动加载 CLAUDE.md） */
  settingSources?: ('user' | 'project' | 'local')[];
  /** 允许的工具列表 */
  allowedTools?: string[];
  /** 禁止的工具列表 */
  disallowedTools?: string[];
  /** 工作目录 */
  cwd?: string;
  /** 权限模式 */
  permissionMode?: PermissionMode;
  /** 自定义权限处理函数 */
  canUseTool?: CanUseTool;
  /** 最大对话轮数 */
  maxTurns?: number;
  /** 最大预算（美元） */
  maxBudgetUsd?: number;
  /** 最大思考 token 数 */
  maxThinkingTokens?: number;
  /** MCP 服务器配置 */
  mcpServers?: Record<string, McpServerConfig>;
  /** 子代理定义 */
  agents?: Record<string, AgentDefinition>;
  /** 钩子配置 */
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
  /** 沙箱配置 */
  sandbox?: SandboxSettings;
  /** 启用文件检查点 */
  enableFileCheckpointing?: boolean;
  /** 中断控制器 */
  abortController?: AbortController;
  /** 要恢复的会话 ID（用于会话恢复） */
  resume?: string;
  /** 恢复会话时的消息 UUID（可选，用于从特定消息恢复） */
  resumeSessionAt?: string;
  /** 恢复会话时是否 fork 到新会话 */
  forkSession?: boolean;
  /** 消息回调 - 用于实时接收 SDK 消息（工具调用、结果等） */
  onMessage?: SDKMessageCallback;
  /** Query 实例创建回调 - 用于获取 query generator 实例以支持动态权限切换 */
  onQueryCreated?: (queryInstance: any) => void;
}

/**
 * SDK 查询结果接口
 *
 * 定义 SDK 查询执行后返回的结果结构
 */
export interface SDKQueryResult {
  /** 累积的响应文本 */
  response: string;
  /** 总花费（美元） */
  totalCostUsd?: number;
  /** 执行时长（毫秒） */
  durationMs?: number;
  /** Token 使用统计 */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  /** 是否为错误结果 */
  isError: boolean;
  /** 错误消息（当 isError 为 true 时） */
  errorMessage?: string;
  /** 会话 ID */
  sessionId?: string;
}

/**
 * SDK 错误类型枚举
 *
 * 定义所有可能的 SDK 错误类型，用于错误分类和用户友好的错误消息显示
 *
 * **验证: 需求 5.1, 5.2, 5.3**
 */
export enum SDKErrorType {
  /** 网络错误 - 无法连接到服务器 */
  NETWORK = 'network',
  /** 认证错误 - API 密钥无效或缺失 */
  AUTHENTICATION = 'authentication',
  /** 速率限制错误 - 请求过于频繁 */
  RATE_LIMIT = 'rate_limit',
  /** 超时错误 - 请求超时 */
  TIMEOUT = 'timeout',
  /** 中断错误 - 用户取消操作 */
  INTERRUPTED = 'interrupted',
  /** 未知错误 - 无法分类的错误 */
  UNKNOWN = 'unknown',
}

/**
 * SDK 错误接口
 *
 * 扩展标准 Error 接口，添加错误类型和原始错误信息
 *
 * **验证: 需求 5.1, 5.2, 5.3**
 */
export interface SDKError extends Error {
  /** 错误类型 */
  type: SDKErrorType;
  /** 原始错误对象 */
  originalError?: Error;
}

/**
 * SDK 错误消息映射
 *
 * 为每种错误类型提供用户友好的中文错误消息
 *
 * **验证: 需求 5.1, 5.2, 5.3**
 */
export const ERROR_MESSAGES: Record<SDKErrorType, string> = {
  [SDKErrorType.NETWORK]: '网络错误: 无法连接到服务器，请检查网络连接',
  [SDKErrorType.AUTHENTICATION]: 'API 错误: 认证失败，请检查 ANTHROPIC_API_KEY 环境变量',
  [SDKErrorType.RATE_LIMIT]: '速率限制: 请求过于频繁，请稍后重试',
  [SDKErrorType.TIMEOUT]: '超时错误: 请求超时，请重试',
  [SDKErrorType.INTERRUPTED]: '操作已中断',
  [SDKErrorType.UNKNOWN]: '未知错误',
};

/**
 * 分类 SDK 错误
 *
 * 根据错误消息内容将错误分类为预定义的错误类型
 * 支持识别网络错误、认证错误、速率限制、超时和中断等情况
 *
 * @param error - 错误对象
 * @returns 错误类型
 *
 * **验证: 需求 5.1, 5.2, 5.3**
 */
export function classifySDKError(error: Error): SDKErrorType {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // 网络错误检测 (Requirement 5.1)
  if (
    message.includes('enotfound') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('network') ||
    message.includes('dns') ||
    message.includes('socket') ||
    message.includes('connection refused') ||
    message.includes('unable to connect')
  ) {
    return SDKErrorType.NETWORK;
  }

  // 认证错误检测 (Requirement 5.2)
  if (
    message.includes('401') ||
    message.includes('403') ||
    message.includes('api key') ||
    message.includes('api_key') ||
    message.includes('authentication') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('invalid key') ||
    message.includes('invalid_api_key')
  ) {
    return SDKErrorType.AUTHENTICATION;
  }

  // 速率限制错误检测 (Requirement 5.3)
  if (
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('rate_limit') ||
    message.includes('too many requests') ||
    message.includes('quota exceeded') ||
    message.includes('throttl')
  ) {
    return SDKErrorType.RATE_LIMIT;
  }

  // 超时错误检测
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('etimedout') ||
    name.includes('timeout')
  ) {
    return SDKErrorType.TIMEOUT;
  }

  // 中断错误检测
  if (
    error.name === 'AbortError' ||
    name === 'aborterror' ||
    message.includes('aborted') ||
    message.includes('cancelled') ||
    message.includes('canceled')
  ) {
    return SDKErrorType.INTERRUPTED;
  }

  return SDKErrorType.UNKNOWN;
}

/**
 * 创建 SDK 错误对象
 *
 * 根据原始错误创建一个包含类型信息的 SDKError 对象
 *
 * @param error - 原始错误对象
 * @returns SDKError 对象
 *
 * **验证: 需求 5.1, 5.2, 5.3**
 */
export function createSDKError(error: Error): SDKError {
  const type = classifySDKError(error);
  const sdkError = new Error(ERROR_MESSAGES[type]) as SDKError;
  sdkError.type = type;
  sdkError.originalError = error;
  sdkError.name = 'SDKError';
  return sdkError;
}

/**
 * 获取用户友好的错误消息
 *
 * 根据错误类型返回适当的用户友好消息，可选择附加原始错误详情
 *
 * @param error - 错误对象
 * @param includeDetails - 是否包含原始错误详情
 * @returns 用户友好的错误消息
 *
 * **验证: 需求 5.1, 5.2, 5.3**
 */
export function getErrorMessage(error: Error, includeDetails: boolean = false): string {
  const type = classifySDKError(error);
  const baseMessage = ERROR_MESSAGES[type];

  if (includeDetails && error.message) {
    return `${baseMessage}: ${error.message}`;
  }

  return baseMessage;
}

/**
 * SDK 查询执行器类
 *
 * 封装 SDK query() 函数的调用逻辑，提供：
 * - 选项映射
 * - 消息流处理
 * - 响应累积
 * - 错误处理
 * - 中断支持
 *
 * **验证: 需求 1.1, 4.1, 4.2, 4.3**
 */
export class SDKQueryExecutor {
  /** 当前的中断控制器 */
  private abortController: AbortController | null = null;

  /** 是否正在执行查询 */
  private isExecuting: boolean = false;

  /** 自定义 MCP 服务器配置 */
  private customMcpServers: Record<string, McpServerConfig> = {};

  /**
   * 检查是否正在执行查询
   *
   * @returns 是否正在执行
   */
  isRunning(): boolean {
    return this.isExecuting;
  }

  /**
   * 检查当前查询是否已被中断
   *
   * @returns 是否已中断
   *
   * **验证: 需求 4.2**
   */
  isInterrupted(): boolean {
    return this.abortController?.signal.aborted ?? false;
  }

  /**
   * 设置自定义 MCP 服务器配置
   *
   * @param servers - 自定义 MCP 服务器配置映射
   */
  setCustomMcpServers(servers: Record<string, McpServerConfig>): void {
    this.customMcpServers = { ...servers };
  }

  /**
   * 将内部 StreamMessage 生成器适配为 SDK 期望的格式
   *
   * SDK 要求流式消息包含 session_id 和 parent_tool_use_id 字段，
   * 此方法将应用内部的简化消息格式转换为完整的 SDK 格式
   *
   * @param messageGenerator - 内部消息生成器
   * @param getSessionId - 获取当前会话 ID 的函数（支持动态更新）
   * @returns 适配后的 SDK 消息生成器
   */
  private async *adaptMessageGenerator(
    messageGenerator: StreamMessageGenerator,
    getSessionId: () => string | undefined
  ): AsyncGenerator<SDKStreamMessage, void, unknown> {
    for await (const message of messageGenerator) {
      yield {
        type: 'user',
        session_id: getSessionId() || '',
        message: message.message,
        parent_tool_use_id: null,
      };
    }
  }

  /**
   * 执行 SDK 查询（兼容接口）
   *
   * 此方法保留单消息输入的兼容接口，内部转换为单条消息的流式执行
   *
   * @param options - 查询选项
   * @returns 查询结果
   *
   * **验证: 需求 1.1, 1.3, 4.1, 4.2, 4.3**
   */
  async execute(options: SDKQueryOptions): Promise<SDKQueryResult> {
    // 创建单消息生成器，将字符串 prompt 转换为流式消息
    const messageGenerator = this.createSingleMessageGenerator(options.prompt);

    // 使用流式执行方法处理
    return this.executeStreaming(messageGenerator, options);
  }

  /**
   * 执行流式 SDK 查询
   *
   * 接受 AsyncGenerator 作为输入，支持持久会话、图像上传、消息队列等高级功能
   *
   * @param messageGenerator - 消息生成器，按顺序 yield StreamMessage 到 SDK
   * @param options - 查询选项（不包含 prompt，因为消息由生成器提供）
   * @returns 查询结果
   *
   * **验证: 流式输入需求**
   */
  async executeStreaming(
    messageGenerator: StreamMessageGenerator,
    options: Omit<SDKQueryOptions, 'prompt'> & { prompt?: string }
  ): Promise<SDKQueryResult> {
    // 标记开始执行
    this.isExecuting = true;

    // 创建或使用提供的 AbortController
    this.abortController = options.abortController || new AbortController();

    // 映射选项到 SDK 格式（使用空字符串作为 prompt 占位）
    const sdkOptions = this.mapToSDKOptions({ ...options, prompt: options.prompt || '' });

    // 累积响应文本
    let accumulatedResponse = '';
    let sessionId: string | undefined;
    let totalCostUsd: number | undefined;
    let durationMs: number | undefined;
    let usage: { inputTokens: number; outputTokens: number } | undefined;
    // 保存最后一个成功的结果（用于流式输入模式的多轮对话）
    let lastSuccessResult: SDKQueryResult | null = null;
    // 保存最后一个错误结果
    let lastErrorResult: SDKQueryResult | null = null;

    try {
      // 在开始前检查是否已被中断
      if (this.abortController.signal.aborted) {
        return {
          response: '',
          isError: true,
          errorMessage: ERROR_MESSAGES[SDKErrorType.INTERRUPTED],
        };
      }

      // 创建适配器生成器，将内部 StreamMessage 转换为 SDK 期望的格式
      // 使用函数闭包，让生成器能够访问动态更新的 sessionId
      const sdkMessageGenerator = this.adaptMessageGenerator(messageGenerator, () => sessionId);

      // 调用 SDK query() 函数，使用流式输入模式
      const queryGenerator = query({
        prompt: sdkMessageGenerator,
        options: sdkOptions,
      });

      // 如果提供了 onQueryCreated 回调，传递 query 实例
      if (options.onQueryCreated) {
        options.onQueryCreated(queryGenerator);
      }

      // 迭代处理消息流
      // 关键修复：在流式输入模式下，不在收到 result 后立即 return
      // 而是保存结果并继续循环，让 SDK 有机会处理更多消息
      for await (const message of queryGenerator) {
        // 检查是否被中断
        if (this.abortController.signal.aborted) {
          return {
            response: accumulatedResponse,
            isError: true,
            errorMessage: ERROR_MESSAGES[SDKErrorType.INTERRUPTED],
            sessionId,
          };
        }

        // 调用消息回调（如果提供），用于实时显示工具调用等信息
        if (options.onMessage) {
          options.onMessage(message);
        }

        // 处理消息
        const processResult = this.processMessage(message, accumulatedResponse);
        accumulatedResponse = processResult.accumulatedResponse;

        // 更新会话 ID
        if ('session_id' in message && message.session_id) {
          sessionId = message.session_id;
        }

        // 处理结果消息
        // 关键修复：不在 result 后立即 return，而是保存结果并继续循环
        // 这样 SDK 可以继续从 messageGenerator 获取更多消息并处理
        if (message.type === 'result') {
          const resultMessage = message as SDKResultMessage;

          if (resultMessage.subtype === 'success') {
            totalCostUsd = resultMessage.total_cost_usd;
            durationMs = resultMessage.duration_ms;
            usage = {
              inputTokens: resultMessage.usage.input_tokens,
              outputTokens: resultMessage.usage.output_tokens,
            };

            // 保存成功结果，但不 return
            // 如果 messageGenerator 还有更多消息，SDK 会继续处理
            lastSuccessResult = {
              response: accumulatedResponse || resultMessage.result,
              totalCostUsd,
              durationMs,
              usage,
              isError: false,
              sessionId,
            };
            // 为下一个 turn 重置累积响应
            accumulatedResponse = '';
          } else {
            // 错误结果：保存但不 return
            const errorMessages = 'errors' in resultMessage ? resultMessage.errors : [];
            lastErrorResult = {
              response: accumulatedResponse,
              totalCostUsd: resultMessage.total_cost_usd,
              durationMs: resultMessage.duration_ms,
              usage: {
                inputTokens: resultMessage.usage.input_tokens,
                outputTokens: resultMessage.usage.output_tokens,
              },
              isError: true,
              errorMessage: errorMessages.join('; ') || `Error: ${resultMessage.subtype}`,
              sessionId,
            };
          }
        }
      }

      // for-await 循环结束（generator 停止或没有更多消息）
      // 返回最后保存的结果
      if (lastErrorResult) {
        return lastErrorResult;
      }
      if (lastSuccessResult) {
        return lastSuccessResult;
      }
      // 如果没有收到任何结果消息，返回累积的响应
      return {
        response: accumulatedResponse,
        isError: false,
        sessionId,
      };
    } catch (error) {
      // 处理 AbortError
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || this.abortController?.signal.aborted)
      ) {
        return {
          response: accumulatedResponse,
          isError: true,
          errorMessage: ERROR_MESSAGES[SDKErrorType.INTERRUPTED],
          sessionId,
        };
      }

      // 处理其他错误
      const errorType = classifySDKError(error as Error);
      const errorMessage =
        ERROR_MESSAGES[errorType] + (error instanceof Error ? `: ${error.message}` : '');

      return {
        response: accumulatedResponse,
        isError: true,
        errorMessage,
        sessionId,
      };
    } finally {
      this.isExecuting = false;
      this.abortController = null;
    }
  }

  /**
   * 创建单消息生成器
   *
   * 将字符串 prompt 转换为单条消息的 AsyncGenerator，用于兼容接口
   *
   * @param prompt - 用户提示词（字符串或内容块数组）
   * @returns 单消息生成器
   */
  private async *createSingleMessageGenerator(
    prompt: string | StreamContentBlock[]
  ): StreamMessageGenerator {
    yield {
      type: 'user',
      message: {
        role: 'user',
        content: prompt,
      },
    };
  }

  /**
   * 中断当前查询
   *
   * 调用 AbortController.abort() 方法来中断正在进行的 SDK 查询
   * 如果没有正在执行的查询，此方法不会产生任何效果
   *
   * @returns 是否成功发送中断信号
   *
   * **验证: 需求 4.1, 4.2**
   */
  interrupt(): boolean {
    if (this.abortController && !this.abortController.signal.aborted) {
      this.abortController.abort();
      return true;
    }
    return false;
  }

  /**
   * 映射选项到 SDK 格式
   *
   * 将 SDKQueryOptions 转换为 SDK 的 Options 格式
   * 确保所有指定的字段都被正确映射
   *
   * @param options - 查询选项
   * @returns SDK 选项
   *
   * **验证: 需求 1.2, 6.1, 6.2, 6.3, 6.4, 6.5**
   */
  mapToSDKOptions(options: SDKQueryOptions): SDKOptions {
    const sdkOptions: SDKOptions = {};

    // 基本选项
    if (options.model) {
      sdkOptions.model = options.model;
    }

    if (options.systemPrompt) {
      sdkOptions.systemPrompt = options.systemPrompt;
    }

    // 配置源（用于 SDK 自动加载 CLAUDE.md）
    if (options.settingSources) {
      sdkOptions.settingSources = options.settingSources;
    }

    if (options.allowedTools) {
      sdkOptions.allowedTools = options.allowedTools;
    }

    if (options.disallowedTools) {
      sdkOptions.disallowedTools = options.disallowedTools;
    }

    if (options.cwd) {
      sdkOptions.cwd = options.cwd;
    }

    if (options.permissionMode) {
      sdkOptions.permissionMode = options.permissionMode;
    }

    // 自定义权限处理函数
    if (options.canUseTool) {
      sdkOptions.canUseTool = options.canUseTool;
    }

    // 限制选项 (Requirements 6.1, 6.2, 6.3)
    if (options.maxTurns !== undefined) {
      sdkOptions.maxTurns = options.maxTurns;
    }

    if (options.maxBudgetUsd !== undefined) {
      sdkOptions.maxBudgetUsd = options.maxBudgetUsd;
    }

    if (options.maxThinkingTokens !== undefined) {
      sdkOptions.maxThinkingTokens = options.maxThinkingTokens;
    }

    // MCP 服务器配置 (Requirement 6.5)
    const mergedMcpServers = this.mergeMcpServers(options.mcpServers);
    if (mergedMcpServers) {
      sdkOptions.mcpServers = mergedMcpServers;
    }

    // 子代理定义
    if (options.agents) {
      sdkOptions.agents = options.agents;
    }

    // 钩子配置
    if (options.hooks) {
      sdkOptions.hooks = options.hooks;
    }

    // 沙箱配置 (Requirement 6.4)
    if (options.sandbox) {
      sdkOptions.sandbox = options.sandbox;
    }

    // 文件检查点
    if (options.enableFileCheckpointing !== undefined) {
      sdkOptions.enableFileCheckpointing = options.enableFileCheckpointing;
    }

    // 会话恢复选项 (Requirement 3.2)
    if (options.resume) {
      sdkOptions.resume = options.resume;
    }

    if (options.resumeSessionAt) {
      sdkOptions.resumeSessionAt = options.resumeSessionAt;
    }

    if (options.forkSession !== undefined) {
      sdkOptions.forkSession = options.forkSession;
    }

    // 中断控制器
    if (this.abortController) {
      sdkOptions.abortController = this.abortController;
    }

    return sdkOptions;
  }

  private mergeMcpServers(
    servers?: Record<string, McpServerConfig>
  ): Record<string, McpServerConfig> | undefined {
    const hasCustomServers = Object.keys(this.customMcpServers).length;
    const hasExternalServers = servers ? Object.keys(servers).length : false;

    if (!hasCustomServers && !hasExternalServers) {
      return undefined;
    }

    return {
      ...(servers ?? {}),
      ...this.customMcpServers,
    };
  }

  /**
   * 处理单个消息
   *
   * @param message - SDK 消息
   * @param currentResponse - 当前累积的响应
   * @returns 处理结果
   */
  processMessage(message: SDKMessage, currentResponse: string): { accumulatedResponse: string } {
    let accumulatedResponse = currentResponse;

    // 处理助手消息
    if (message.type === 'assistant') {
      const assistantMessage = message as SDKAssistantMessage;
      const textContent = this.extractTextFromAssistantMessage(assistantMessage);
      if (textContent) {
        accumulatedResponse += textContent;
      }
    }

    return { accumulatedResponse };
  }

  /**
   * 从助手消息中提取文本内容
   *
   * @param message - 助手消息
   * @returns 提取的文本内容
   */
  extractTextFromAssistantMessage(message: SDKAssistantMessage): string {
    const content = message.message?.content;
    if (!content || !Array.isArray(content)) {
      return '';
    }

    const textParts: string[] = [];

    for (const block of content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        textParts.push(block.text);
      }
    }

    return textParts.join('');
  }
}
