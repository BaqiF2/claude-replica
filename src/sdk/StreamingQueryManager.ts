/**
 * 文件功能：流式查询管理器，负责管理流式输入会话的生命周期
 *
 * 核心类：
 * - StreamingQueryManager: 流式查询管理器核心类
 *
 * 核心方法：
 * - startSession(): 开始新的流式会话
 * - sendMessage(): 发送消息到当前会话
 * - queueMessage(): 将消息添加到队列
 * - interruptSession(): 中断当前会话
 * - isProcessing(): 检查是否正在处理消息
 */

import { Session } from '../core/SessionManager';
import { MessageRouter } from '../core/MessageRouter';
import {
  SDKQueryExecutor,
  SDKQueryResult,
  StreamMessage,
  StreamContentBlock,
} from './SDKQueryExecutor';
import type { SDKMessage, SDKAssistantMessage } from '@anthropic-ai/claude-agent-sdk';
import type { PermissionMode } from '../config/SDKConfigLoader';

/**
 * 流式会话状态
 */
export type StreamingSessionState = 'idle' | 'processing' | 'interrupted';

/**
 * 流式会话接口
 *
 * 表示一个活跃的流式输入会话
 */
export interface StreamingSession {
  /** 关联的会话对象 */
  session: Session;
  /** 当前状态 */
  state: StreamingSessionState;
  /** 消息队列 */
  messageQueue: QueuedMessage[];
  /** 中断控制器 */
  abortController: AbortController;
}

/**
 * 排队的消息接口
 */
export interface QueuedMessage {
  /** 原始文本（可能包含图像引用） */
  rawText: string;
  /** 解析后的内容块（如果已解析） */
  contentBlocks?: StreamContentBlock[];
  /** 解析错误（如果有） */
  errors?: Array<{ reference: string; error: string }>;
  /** 加入队列的时间 */
  queuedAt: Date;
}

/**
 * 消息处理结果
 */
export interface MessageProcessResult {
  /** 是否成功 */
  success: boolean;
  /** SDK 查询结果（如果成功） */
  result?: SDKQueryResult;
  /** 错误消息（如果失败） */
  error?: string;
  /** 图像处理错误列表 */
  imageErrors?: Array<{ reference: string; error: string }>;
}

/**
 * 工具调用信息接口
 */
export interface ToolUseInfo {
  /** 工具 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具参数 */
  input: Record<string, unknown>;
}

/**
 * 工具结果信息接口
 */
export interface ToolResultInfo {
  /** 工具 ID */
  toolUseId: string;
  /** 工具名称（可选，用于显示） */
  name?: string;
  /** 执行结果 */
  content: string;
  /** 是否为错误 */
  isError: boolean;
}

/**
 * 活跃消息生成器类
 *
 * 支持在运行时动态注入新消息的 AsyncGenerator 实现
 * 用于实现真正的流式输入模式 - 在 agent loop 运行过程中可以随时添加新消息
 *
 * 关键设计：消息始终先进入队列，然后通知等待者从队列获取。
 * 这确保了即使 generator 被中止，消息仍在队列中等待下次处理，不会丢失。
 */
export class LiveMessageGenerator {
  /** 待处理的消息队列 */
  private pendingMessages: StreamMessage[] = [];
  /** 等待新消息到达的 resolver（只用于通知，不直接传递消息） */
  private notifyResolver: (() => void) | null = null;
  /** 是否已停止 */
  private stopped = false;

  /**
   * 推送新消息到生成器
   *
   * 消息始终先进入队列，然后通知等待者。
   * 这种设计确保消息不会因为 generator 被中止而丢失。
   *
   * @param message - 要推送的消息
   */
  push(message: StreamMessage): void {
    if (this.stopped) {
      return;
    }

    // 始终将消息放入队列
    this.pendingMessages.push(message);

    // 如果有等待者，通知它有新消息了
    if (this.notifyResolver) {
      this.notifyResolver();
      this.notifyResolver = null;
    }
  }

  /**
   * 停止生成器
   *
   * 停止后不再接受新消息，等待中的 generator 会退出循环
   */
  stop(): void {
    this.stopped = true;
    // 通知等待者退出
    if (this.notifyResolver) {
      this.notifyResolver();
      this.notifyResolver = null;
    }
  }

  /**
   * 重置生成器状态
   *
   * 清理等待状态，允许创建新的 generator 实例
   * 用于在 SDK 执行完成后准备下一次执行
   *
   * 注意：不清空 pendingMessages，保留未处理的消息
   */
  reset(): void {
    // 清理等待者（不需要通知，因为旧的 generator 已经退出）
    this.notifyResolver = null;
    // 重置停止标志，允许新的 generator 运行
    this.stopped = false;
  }

  /**
   * 清空待处理的消息队列
   *
   * 用于会话结束时清理未处理的消息，避免消息在会话间泄漏
   *
   * @returns 被清空的消息数量
   */
  clearQueue(): number {
    const count = this.pendingMessages.length;
    this.pendingMessages = [];
    return count;
  }

  /**
   * 获取队列中待处理的消息数量
   */
  getPendingCount(): number {
    return this.pendingMessages.length;
  }

  /**
   * 创建 AsyncGenerator
   *
   * 持续 yield 消息，当没有消息时等待新消息到达
   * 消息始终从队列获取，确保不会丢失
   *
   * @returns AsyncGenerator<StreamMessage>
   */
  async *generate(): AsyncGenerator<StreamMessage, void, unknown> {
    while (!this.stopped) {
      if (this.pendingMessages.length > 0) {
        // 队列中有消息，从队列获取并 yield
        yield this.pendingMessages.shift()!;
      } else {
        // 等待新消息到达的通知
        await new Promise<void>((resolve) => {
          this.notifyResolver = resolve;
        });
        // 被通知后，检查是否应该停止
        // 如果是停止信号，循环条件会终止；如果是新消息，下次循环会处理
      }
    }
  }
}

/**
 * StreamingQueryManager 选项接口
 */
export interface StreamingQueryManagerOptions {
  /** 消息路由器 */
  messageRouter: MessageRouter;
  /** SDK 查询执行器 */
  sdkExecutor: SDKQueryExecutor;
  /** 工具调用回调 - 当检测到工具调用时触发 */
  onToolUse?: (info: ToolUseInfo) => void;
  /** 工具结果回调 - 当检测到工具结果时触发 */
  onToolResult?: (info: ToolResultInfo) => void;
  /** 文本响应回调 - 当检测到 assistant 的文本响应时触发 */
  onAssistantText?: (text: string) => void;
  /** Thinking 回调 - 当检测到 thinking 内容块时触发 */
  onThinking?: (content?: string) => void;
}

/**
 * 流式查询管理器类
 *
 * 封装流式输入会话的完整生命周期管理：
 * - 会话创建和销毁
 * - 消息解析和构建（包含图像处理）
 * - 实时消息注入（通过 LiveMessageGenerator）
 * - 中断支持
 *
 * 使用 LiveMessageGenerator 实现真正的流式输入模式：
 * 在 agent loop 运行过程中可以随时注入新消息
 */
export class StreamingQueryManager {
  /** 消息路由器 */
  private readonly messageRouter: MessageRouter;
  /** SDK 查询执行器 */
  private readonly sdkExecutor: SDKQueryExecutor;
  /** 工具调用回调 */
  private readonly onToolUse?: (info: ToolUseInfo) => void;
  /** 工具结果回调 */
  private readonly onToolResult?: (info: ToolResultInfo) => void;
  /** 文本响应回调 */
  private readonly onAssistantText?: (text: string) => void;
  /** Thinking 回调 */
  private readonly onThinking?: (content?: string) => void;

  /** 当前活跃的流式会话 */
  private activeSession: StreamingSession | null = null;
  /** 工具调用映射（用于关联 tool_use 和 tool_result） */
  private toolUseMap: Map<string, ToolUseInfo> = new Map();
  /** 活跃消息生成器 - 支持运行时消息注入 */
  private liveGenerator: LiveMessageGenerator | null = null;
  /** SDK 执行 Promise - 用于跟踪执行状态 */
  private executionPromise: Promise<SDKQueryResult> | null = null;
  /** 最新的 SDK 查询结果 */
  private lastResult: SDKQueryResult | null = null;
  /** Query 实例引用（用于动态权限切换） */
  private queryInstance: any | null = null;

  constructor(options: StreamingQueryManagerOptions) {
    this.messageRouter = options.messageRouter;
    this.sdkExecutor = options.sdkExecutor;
    this.onToolUse = options.onToolUse;
    this.onToolResult = options.onToolResult;
    this.onAssistantText = options.onAssistantText;
    this.onThinking = options.onThinking;
  }

  /**
   * 开始新的流式会话
   *
   * 创建一个新的流式会话，关联到指定的 Session 对象
   * 同时创建一个新的 LiveMessageGenerator 用于实时消息注入
   *
   * @param session - 会话对象
   * @returns 流式会话
   */
  startSession(session: Session): StreamingSession {
    // 如果已有活跃会话，先结束
    if (this.activeSession) {
      this.endSession();
    }

    const streamingSession: StreamingSession = {
      session,
      state: 'idle',
      messageQueue: [],
      abortController: new AbortController(),
    };

    this.activeSession = streamingSession;
    // 创建新的活跃消息生成器
    this.liveGenerator = new LiveMessageGenerator();
    this.executionPromise = null;
    this.lastResult = null;

    return streamingSession;
  }

  /**
   * 获取当前活跃会话
   *
   * @returns 当前活跃的流式会话，如果没有则返回 null
   */
  getActiveSession(): StreamingSession | null {
    return this.activeSession;
  }

  /**
   * 发送消息到当前会话
   *
   * 消息会被立即注入到活跃的 agent loop 中：
   * - 如果 SDK 执行尚未启动，会启动执行并发送第一条消息
   * - 如果 SDK 执行已在运行，消息会被推送到生成器，在当前 turn 完成后处理
   *
   * @param rawMessage - 原始消息文本（可能包含 @./image.png 引用）
   * @returns 消息处理结果
   */
  async sendMessage(rawMessage: string): Promise<MessageProcessResult> {
    if (!this.activeSession || !this.liveGenerator) {
      return {
        success: false,
        error: 'No active streaming session',
      };
    }

    try {
      // 使用 MessageRouter 构建流式消息（处理图像引用）
      const buildResult = await this.messageRouter.buildStreamMessage(
        rawMessage,
        this.activeSession.session
      );

      // 如果有严重的图像错误（所有图像都无法加载），返回错误
      if (
        buildResult.errors &&
        buildResult.errors.length > 0 &&
        buildResult.contentBlocks.length === 0
      ) {
        return {
          success: false,
          error: buildResult.errors.map((e) => `${e.reference}: ${e.error}`).join('; '),
          imageErrors: buildResult.errors,
        };
      }

      // 构建流式消息
      const streamMessage: StreamMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: buildResult.contentBlocks,
        },
      };

      // 推送消息到生成器
      this.liveGenerator.push(streamMessage);

      // 如果尚未启动执行，启动 SDK 执行循环
      if (!this.executionPromise) {
        this.executionPromise = this.startExecution();
      }

      // 标记为处理中
      this.activeSession.state = 'processing';

      return {
        success: true,
        imageErrors:
          buildResult.errors && buildResult.errors.length > 0 ? buildResult.errors : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 将消息添加到队列（兼容接口）
   *
   * 在新架构中，此方法直接调用 sendMessage，消息会被实时注入
   *
   * @param rawMessage - 原始消息文本
   */
  queueMessage(rawMessage: string): void {
    // 使用 sendMessage 实现实时注入，忽略返回值
    this.sendMessage(rawMessage).catch(() => {
      // 静默处理错误
    });
  }

  /**
   * 等待当前执行完成并获取结果
   *
   * @returns 最新的 SDK 查询结果，如果没有则返回 null
   */
  async waitForResult(): Promise<SDKQueryResult | null> {
    if (this.executionPromise) {
      try {
        this.lastResult = await this.executionPromise;
      } catch {
        // 执行被中断或出错
      }
    }
    return this.lastResult;
  }

  /**
   * 中断当前会话
   *
   * 调用 AbortController.abort() 停止当前正在进行的消息处理
   * 队列中待处理的消息会被清空，避免消息在会话间泄漏
   *
   * @returns 中断结果 { success: boolean, clearedMessages: number }
   */
  interruptSession(): { success: boolean; clearedMessages: number } {
    if (!this.activeSession) {
      return { success: false, clearedMessages: 0 };
    }

    if (this.activeSession.state === 'processing') {
      this.activeSession.abortController.abort();
      this.activeSession.state = 'interrupted';

      // 清空消息队列
      let clearedMessages = 0;
      if (this.liveGenerator) {
        clearedMessages = this.liveGenerator.clearQueue();
      }

      // 创建新的 AbortController 供后续消息使用
      this.activeSession.abortController = new AbortController();
      // 重置执行状态，允许重新启动
      this.executionPromise = null;

      return { success: true, clearedMessages };
    }

    return { success: false, clearedMessages: 0 };
  }

  /**
   * 结束当前会话
   *
   * 清理会话资源，停止消息生成器，中断任何进行中的处理
   */
  endSession(): void {
    if (this.liveGenerator) {
      // 清空队列并记录警告（如果有未处理消息）
      const clearedCount = this.liveGenerator.clearQueue();
      if (clearedCount > 0) {
        console.warn(`Session ended with ${clearedCount} unprocessed message(s) in queue`);
      }
      this.liveGenerator.stop();
      this.liveGenerator = null;
    }
    if (this.activeSession) {
      if (this.activeSession.state === 'processing') {
        this.activeSession.abortController.abort();
      }
      this.activeSession = null;
    }
    this.executionPromise = null;
    this.lastResult = null;
    this.toolUseMap.clear();
  }

  /**
   * 检查是否正在处理消息
   *
   * @returns 是否正在处理
   */
  isProcessing(): boolean {
    return this.activeSession?.state === 'processing';
  }

  /**
   * 设置权限模式
   *
   * 实现动态权限切换：
   * 1. 本地同步更新 - 调用 messageRouter.setPermissionMode(mode)
   * 2. SDK 异步切换 - 如果 queryInstance 存在，调用其 setPermissionMode(mode)
   *
   * @param mode - 新的权限模式
   */
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    // 1. 本地同步更新
    await this.messageRouter.setPermissionMode(mode);

    // 2. SDK 异步切换（如果 query 实例存在）
    if (this.queryInstance) {
      await this.queryInstance.setPermissionMode(mode);
    }
  }

  /**
   * 获取待处理的消息数量
   *
   * 包括生成器中待 yield 的消息
   *
   * @returns 待处理消息数量
   */
  getQueueLength(): number {
    return this.liveGenerator?.getPendingCount() ?? 0;
  }

  /**
   * 启动 SDK 执行循环
   *
   * 使用 LiveMessageGenerator 创建持久的消息流，
   * SDK 会持续处理生成器 yield 的消息直到生成器停止
   *
   * 关键改动：
   * - 保存 query generator 实例到 this.queryInstance
   * - 通过 messageRouter.setQueryInstance() 传递给 MessageRouter
   *
   * @returns SDK 查询结果 Promise
   */
  private async startExecution(): Promise<SDKQueryResult> {
    if (!this.activeSession || !this.liveGenerator) {
      throw new Error('No active streaming session');
    }

    try {
      // 构建查询选项
      const queryOptions = await this.messageRouter.buildQueryOptions(this.activeSession.session);

      // 使用 LiveMessageGenerator 创建持久消息流
      const messageGenerator = this.liveGenerator.generate();

      // 执行流式查询并保存 query 实例
      const sdkResult = await this.sdkExecutor.executeStreaming(messageGenerator, {
        model: queryOptions.model,
        systemPrompt: queryOptions.systemPrompt,
        settingSources: queryOptions.settingSources,
        allowedTools: queryOptions.allowedTools,
        disallowedTools: queryOptions.disallowedTools,
        cwd: queryOptions.cwd,
        permissionMode: queryOptions.permissionMode,
        canUseTool: queryOptions.canUseTool,
        mcpServers: queryOptions.mcpServers as Parameters<
          typeof this.sdkExecutor.executeStreaming
        >[1]['mcpServers'],
        agents: queryOptions.agents,
        maxTurns: queryOptions.maxTurns,
        maxBudgetUsd: queryOptions.maxBudgetUsd,
        maxThinkingTokens: queryOptions.maxThinkingTokens,
        enableFileCheckpointing: queryOptions.enableFileCheckpointing,
        sandbox: queryOptions.sandbox,
        abortController: this.activeSession.abortController,
        resume: this.activeSession.session.sdkSessionId,
        // 传递消息回调，用于实时输出工具调用信息
        onMessage: (message) => this.handleSDKMessage(message),
        // 保存 query 实例的回调
        onQueryCreated: (queryInstance) => {
          this.queryInstance = queryInstance;
          this.messageRouter.setQueryInstance(queryInstance);
        },
      });

      // 保存结果
      this.lastResult = sdkResult;

      // 恢复空闲状态
      if (this.activeSession) {
        this.activeSession.state = 'idle';
      }

      return sdkResult;
    } catch (error) {
      // 恢复空闲状态
      if (this.activeSession) {
        this.activeSession.state = 'idle';
      }

      throw error;
    } finally {
      // 重置执行 Promise，允许下次消息触发新的执行循环
      this.executionPromise = null;

      // 重置生成器状态
      // 在新的架构下（SDK 会持续等待 generator），这个 reset() 只在以下情况执行：
      // 1. SDK 执行被中断（abort）
      // 2. SDK 执行出错
      // 3. generator 主动停止（stop()）
      if (this.liveGenerator) {
        this.liveGenerator.reset();

        // 验证队列是否已清空（防御性编程）
        const remainingCount = this.liveGenerator.getPendingCount();
        if (remainingCount > 0) {
          console.warn(
            `Execution finished but ${remainingCount} message(s) remain in queue. ` +
              `This may indicate an unexpected termination.`
          );
          // 清空剩余消息，避免泄漏到下一次执行
          this.liveGenerator.clearQueue();
        }
      }
    }
  }

  /**
   * 处理 SDK 消息，检测工具调用、文本响应并触发相应的回调
   *
   * @param message - SDK 消息
   */
  private handleSDKMessage(message: SDKMessage): void {
    // 处理助手消息中的内容（工具调用和文本响应）
    if (message.type === 'assistant') {
      const assistantMessage = message as SDKAssistantMessage;
      const content = assistantMessage.message?.content;

      if (content && Array.isArray(content)) {
        // 收集文本内容
        const textParts: string[] = [];

        for (const block of content) {
          // 检测 thinking 内容块
          if (block.type === 'thinking' && this.onThinking) {
            const thinkingBlock = block as { type: 'thinking'; thinking?: string };
            this.onThinking(thinkingBlock.thinking);
          }

          // 检测 text 内容块
          if (block.type === 'text' && typeof (block as { text?: string }).text === 'string') {
            textParts.push((block as { text: string }).text);
          }

          // 检测 tool_use 内容块
          if (block.type === 'tool_use' && this.onToolUse) {
            const toolUseBlock = block as {
              type: 'tool_use';
              id: string;
              name: string;
              input: Record<string, unknown>;
            };

            const toolInfo: ToolUseInfo = {
              id: toolUseBlock.id,
              name: toolUseBlock.name,
              input: toolUseBlock.input,
            };

            // 存储工具调用信息，用于后续关联结果
            this.toolUseMap.set(toolUseBlock.id, toolInfo);

            // 触发工具调用回调
            this.onToolUse(toolInfo);
          }
        }

        // 如果有文本内容，触发文本响应回调
        if (textParts.length > 0 && this.onAssistantText) {
          this.onAssistantText(textParts.join(''));
        }
      }
    }

    // 处理用户消息中的工具结果（SDK 会将工具结果作为 user 消息返回）
    if (message.type === 'user' && 'message' in message) {
      const userMessage = message as {
        type: 'user';
        message: {
          role: 'user';
          content: Array<{
            type: string;
            tool_use_id?: string;
            content?: string;
            is_error?: boolean;
          }>;
        };
      };

      const content = userMessage.message?.content;
      if (content && Array.isArray(content)) {
        for (const block of content) {
          // 检测 tool_result 内容块
          if (block.type === 'tool_result' && block.tool_use_id && this.onToolResult) {
            const toolUseInfo = this.toolUseMap.get(block.tool_use_id);

            const resultInfo: ToolResultInfo = {
              toolUseId: block.tool_use_id,
              name: toolUseInfo?.name,
              content:
                typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
              isError: block.is_error || false,
            };

            // 触发工具结果回调
            this.onToolResult(resultInfo);
          }
        }
      }
    }
  }
}
