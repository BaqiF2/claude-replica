/**
 * 文件功能：SDK 查询执行模块，封装 Claude Agent SDK 的 query() 函数调用逻辑
 *
 * 核心类：
 * - SDKQueryExecutor: SDK 查询执行器核心类
 *
 * 核心方法：
 * - execute(): 执行 SDK 查询并处理响应
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
   * 执行 SDK 查询
   *
   * @param options - 查询选项
   * @returns 查询结果
   *
   * **验证: 需求 1.1, 1.3, 4.1, 4.2, 4.3**
   */
  async execute(options: SDKQueryOptions): Promise<SDKQueryResult> {
    // 标记开始执行
    this.isExecuting = true;

    // 创建或使用提供的 AbortController
    this.abortController = options.abortController || new AbortController();

    // 映射选项到 SDK 格式
    const sdkOptions = this.mapToSDKOptions(options);

    // 累积响应文本
    let accumulatedResponse = '';
    let sessionId: string | undefined;
    let totalCostUsd: number | undefined;
    let durationMs: number | undefined;
    let usage: { inputTokens: number; outputTokens: number } | undefined;

    try {
      // 在开始前检查是否已被中断 (Requirement 4.2)
      if (this.abortController.signal.aborted) {
        return {
          response: '',
          isError: true,
          errorMessage: ERROR_MESSAGES[SDKErrorType.INTERRUPTED],
        };
      }

      // 调用 SDK query() 函数
      const queryGenerator = query({
        prompt: options.prompt,
        options: sdkOptions,
      });

      // 迭代处理消息流
      for await (const message of queryGenerator) {
        // 检查是否被中断 (Requirement 4.2)
        if (this.abortController.signal.aborted) {
          return {
            response: accumulatedResponse,
            isError: true,
            errorMessage: ERROR_MESSAGES[SDKErrorType.INTERRUPTED],
            sessionId,
          };
        }

        // 处理消息
        const processResult = this.processMessage(message, accumulatedResponse);
        accumulatedResponse = processResult.accumulatedResponse;

        // 更新会话 ID
        if ('session_id' in message && message.session_id) {
          sessionId = message.session_id;
        }

        // 处理结果消息
        if (message.type === 'result') {
          const resultMessage = message as SDKResultMessage;

          if (resultMessage.subtype === 'success') {
            totalCostUsd = resultMessage.total_cost_usd;
            durationMs = resultMessage.duration_ms;
            usage = {
              inputTokens: resultMessage.usage.input_tokens,
              outputTokens: resultMessage.usage.output_tokens,
            };

            return {
              response: accumulatedResponse || resultMessage.result,
              totalCostUsd,
              durationMs,
              usage,
              isError: false,
              sessionId,
            };
          } else {
            // 错误结果
            const errorMessages = 'errors' in resultMessage ? resultMessage.errors : [];
            return {
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

      // 如果没有收到结果消息，返回累积的响应
      return {
        response: accumulatedResponse,
        isError: false,
        sessionId,
      };
    } catch (error) {
      // 处理 AbortError (Requirement 4.3)
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
    if (options.mcpServers) {
      sdkOptions.mcpServers = options.mcpServers;
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

/**
 * 独立的选项映射函数
 *
 * 将 SDKQueryOptions 转换为 SDK 的 Options 格式
 * 这是一个纯函数，不依赖于 SDKQueryExecutor 实例
 *
 * @param options - 查询选项
 * @param abortController - 可选的中断控制器
 * @returns SDK 选项
 *
 * **验证: 需求 1.2, 6.1, 6.2, 6.3, 6.4, 6.5**
 */
export function mapToSDKOptions(
  options: SDKQueryOptions,
  abortController?: AbortController
): SDKOptions {
  const sdkOptions: SDKOptions = {};

  // 基本选项
  if (options.model) {
    sdkOptions.model = options.model;
  }

  if (options.systemPrompt) {
    sdkOptions.systemPrompt = options.systemPrompt;
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
  if (options.mcpServers) {
    sdkOptions.mcpServers = options.mcpServers;
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
  if (abortController) {
    sdkOptions.abortController = abortController;
  }

  return sdkOptions;
}
