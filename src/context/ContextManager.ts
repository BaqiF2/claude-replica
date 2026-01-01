/**
 * 上下文管理器
 *
 * 负责智能管理对话上下文，包括：
 * - Token 计数和限制管理
 * - 历史消息压缩
 * - 智能文件片段提取
 * - 对话摘要生成
 * - 上下文窗口管理
 *
 * @module ContextManager
 */

import { Message, ContentBlock } from '../core/SessionManager';

/**
 * Token 计数结果
 */
export interface TokenCount {
  /** 总 token 数 */
  total: number;
  /** 系统提示词 token 数 */
  systemPrompt: number;
  /** 消息 token 数 */
  messages: number;
  /** 工具输出预留 token 数 */
  toolOutputReserve: number;
  /** 剩余可用 token 数 */
  available: number;
}

/**
 * 消息重要性级别
 */
export type MessageImportance = 'critical' | 'high' | 'medium' | 'low';

/**
 * 带重要性标记的消息
 */
export interface ScoredMessage extends Message {
  /** 重要性分数 (0-100) */
  score: number;
  /** 重要性级别 */
  importance: MessageImportance;
  /** 估算的 token 数 */
  estimatedTokens: number;
}

/**
 * 文件片段
 */
export interface FileFragment {
  /** 文件路径 */
  path: string;
  /** 片段内容 */
  content: string;
  /** 起始行号 */
  startLine: number;
  /** 结束行号 */
  endLine: number;
  /** 相关性分数 (0-100) */
  relevanceScore: number;
}

/**
 * 对话摘要
 */
export interface ConversationSummary {
  /** 摘要内容 */
  content: string;
  /** 涵盖的消息数量 */
  messageCount: number;
  /** 原始消息的 token 数 */
  originalTokens: number;
  /** 摘要的 token 数 */
  summaryTokens: number;
  /** 创建时间 */
  createdAt: Date;
}

/**
 * 上下文窗口状态
 */
export interface ContextWindowState {
  /** 最大 token 限制 */
  maxTokens: number;
  /** 当前使用的 token 数 */
  usedTokens: number;
  /** 使用百分比 */
  usagePercent: number;
  /** 是否接近限制 (>80%) */
  nearLimit: boolean;
  /** 是否需要压缩 */
  needsCompression: boolean;
  /** 工具输出预留空间 */
  toolOutputReserve: number;
}

/**
 * 压缩策略
 */
export type CompressionStrategy = 'remove_old' | 'summarize' | 'truncate' | 'smart';

/**
 * 压缩选项
 */
export interface CompressionOptions {
  /** 压缩策略 */
  strategy: CompressionStrategy;
  /** 目标 token 数 */
  targetTokens: number;
  /** 保留最近的消息数量 */
  keepRecentMessages: number;
  /** 是否保留系统消息 */
  keepSystemMessages: boolean;
  /** 是否生成摘要 */
  generateSummary: boolean;
}

/**
 * 压缩结果
 */
export interface CompressionResult {
  /** 压缩后的消息列表 */
  messages: Message[];
  /** 生成的摘要（如果有） */
  summary?: ConversationSummary;
  /** 移除的消息数量 */
  removedCount: number;
  /** 节省的 token 数 */
  savedTokens: number;
  /** 压缩前的 token 数 */
  originalTokens: number;
  /** 压缩后的 token 数 */
  compressedTokens: number;
}

/**
 * 上下文管理器配置
 */
export interface ContextManagerConfig {
  /** 最大 token 限制 */
  maxTokens: number;
  /** 工具输出预留比例 (0-1) */
  toolOutputReserveRatio: number;
  /** 触发压缩的阈值比例 (0-1) */
  compressionThreshold: number;
  /** 默认压缩策略 */
  defaultCompressionStrategy: CompressionStrategy;
  /** 保留最近消息数量 */
  keepRecentMessages: number;
  /** 每个字符的平均 token 数（用于估算） */
  tokensPerChar: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ContextManagerConfig = {
  maxTokens: 200000,           // Claude 3.5 Sonnet 的上下文窗口
  toolOutputReserveRatio: 0.2, // 预留 20% 给工具输出
  compressionThreshold: 0.8,   // 80% 时触发压缩
  defaultCompressionStrategy: 'smart',
  keepRecentMessages: 10,
  tokensPerChar: 0.25,         // 平均每 4 个字符约 1 个 token
};

/**
 * 上下文管理器类
 *
 * 提供智能上下文管理功能，确保在 token 限制内保持相关信息
 */
export class ContextManager {
  private readonly config: ContextManagerConfig;
  private summaries: ConversationSummary[] = [];

  constructor(config: Partial<ContextManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 估算文本的 token 数
   *
   * 使用简单的字符计数方法进行估算
   * 实际应用中可以使用更精确的 tokenizer
   *
   * @param text - 要估算的文本
   * @returns 估算的 token 数
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    // 简单估算：平均每 4 个字符约 1 个 token
    // 中文字符通常每个字符约 1-2 个 token
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars * 1.5 + otherChars * this.config.tokensPerChar);
  }

  /**
   * 估算消息的 token 数
   *
   * @param message - 消息对象
   * @returns 估算的 token 数
   */
  estimateMessageTokens(message: Message): number {
    let text = '';

    if (typeof message.content === 'string') {
      text = message.content;
    } else if (Array.isArray(message.content)) {
      text = message.content
        .map((block: ContentBlock) => {
          if (block.type === 'text' && typeof block.text === 'string') {
            return block.text;
          }
          if (block.type === 'tool_use' || block.type === 'tool_result') {
            return JSON.stringify(block);
          }
          return '';
        })
        .join('\n');
    }

    // 添加角色标记的开销（约 4 个 token）
    return this.estimateTokens(text) + 4;
  }

  /**
   * 计算消息列表的总 token 数
   *
   * @param messages - 消息列表
   * @param systemPrompt - 系统提示词（可选）
   * @returns Token 计数结果
   */
  countTokens(messages: Message[], systemPrompt?: string): TokenCount {
    const systemPromptTokens = systemPrompt ? this.estimateTokens(systemPrompt) : 0;
    const messagesTokens = messages.reduce(
      (sum, msg) => sum + this.estimateMessageTokens(msg),
      0
    );
    const toolOutputReserve = Math.floor(
      this.config.maxTokens * this.config.toolOutputReserveRatio
    );
    const total = systemPromptTokens + messagesTokens;
    const available = this.config.maxTokens - total - toolOutputReserve;

    return {
      total,
      systemPrompt: systemPromptTokens,
      messages: messagesTokens,
      toolOutputReserve,
      available: Math.max(0, available),
    };
  }

  /**
   * 获取上下文窗口状态
   *
   * @param messages - 消息列表
   * @param systemPrompt - 系统提示词（可选）
   * @returns 上下文窗口状态
   */
  getContextWindowState(messages: Message[], systemPrompt?: string): ContextWindowState {
    const tokenCount = this.countTokens(messages, systemPrompt);
    const effectiveMax = this.config.maxTokens - tokenCount.toolOutputReserve;
    const usagePercent = tokenCount.total / effectiveMax;

    return {
      maxTokens: this.config.maxTokens,
      usedTokens: tokenCount.total,
      usagePercent,
      nearLimit: usagePercent >= this.config.compressionThreshold,
      needsCompression: usagePercent >= this.config.compressionThreshold,
      toolOutputReserve: tokenCount.toolOutputReserve,
    };
  }


  /**
   * 评估消息的重要性
   *
   * 根据以下因素评估消息重要性：
   * - 消息角色（系统消息最重要）
   * - 消息位置（最近的消息更重要）
   * - 内容类型（工具调用结果重要）
   * - 内容长度（较长的消息可能包含更多信息）
   *
   * @param message - 消息对象
   * @param index - 消息在列表中的索引
   * @param totalMessages - 消息总数
   * @returns 带重要性标记的消息
   */
  scoreMessage(message: Message, index: number, totalMessages: number): ScoredMessage {
    let score = 50; // 基础分数

    // 1. 角色权重
    switch (message.role) {
      case 'system':
        score += 40; // 系统消息最重要
        break;
      case 'user':
        score += 20; // 用户消息较重要
        break;
      case 'assistant':
        score += 10; // 助手消息基础重要
        break;
    }

    // 2. 位置权重（最近的消息更重要）
    const recencyFactor = index / totalMessages;
    score += Math.floor(recencyFactor * 20);

    // 3. 内容类型权重
    if (Array.isArray(message.content)) {
      const hasToolUse = message.content.some(
        (block: ContentBlock) => block.type === 'tool_use'
      );
      const hasToolResult = message.content.some(
        (block: ContentBlock) => block.type === 'tool_result'
      );
      if (hasToolUse || hasToolResult) {
        score += 15; // 工具相关消息较重要
      }
    }

    // 4. 确保分数在 0-100 范围内
    score = Math.max(0, Math.min(100, score));

    // 5. 确定重要性级别
    let importance: MessageImportance;
    if (score >= 80) {
      importance = 'critical';
    } else if (score >= 60) {
      importance = 'high';
    } else if (score >= 40) {
      importance = 'medium';
    } else {
      importance = 'low';
    }

    return {
      ...message,
      score,
      importance,
      estimatedTokens: this.estimateMessageTokens(message),
    };
  }

  /**
   * 对消息列表进行重要性评分
   *
   * @param messages - 消息列表
   * @returns 带重要性标记的消息列表
   */
  scoreMessages(messages: Message[]): ScoredMessage[] {
    return messages.map((msg, index) => this.scoreMessage(msg, index, messages.length));
  }

  /**
   * 压缩历史消息
   *
   * 根据指定策略压缩消息列表以减少 token 使用
   *
   * @param messages - 消息列表
   * @param options - 压缩选项
   * @returns 压缩结果
   */
  compressMessages(
    messages: Message[],
    options: Partial<CompressionOptions> = {}
  ): CompressionResult {
    const opts: CompressionOptions = {
      strategy: options.strategy || this.config.defaultCompressionStrategy,
      targetTokens: options.targetTokens || Math.floor(this.config.maxTokens * 0.6),
      keepRecentMessages: options.keepRecentMessages || this.config.keepRecentMessages,
      keepSystemMessages: options.keepSystemMessages ?? true,
      generateSummary: options.generateSummary ?? true,
    };

    const originalTokens = messages.reduce(
      (sum, msg) => sum + this.estimateMessageTokens(msg),
      0
    );

    let result: CompressionResult;

    switch (opts.strategy) {
      case 'remove_old':
        result = this.compressRemoveOld(messages, opts, originalTokens);
        break;
      case 'summarize':
        result = this.compressSummarize(messages, opts, originalTokens);
        break;
      case 'truncate':
        result = this.compressTruncate(messages, opts, originalTokens);
        break;
      case 'smart':
      default:
        result = this.compressSmart(messages, opts, originalTokens);
        break;
    }

    return result;
  }

  /**
   * 移除旧消息策略
   */
  private compressRemoveOld(
    messages: Message[],
    options: CompressionOptions,
    originalTokens: number
  ): CompressionResult {
    const scoredMessages = this.scoreMessages(messages);
    const result: Message[] = [];
    let currentTokens = 0;

    // 首先保留系统消息
    if (options.keepSystemMessages) {
      for (const msg of scoredMessages) {
        if (msg.role === 'system') {
          result.push(msg);
          currentTokens += msg.estimatedTokens;
        }
      }
    }

    // 然后从最新的消息开始保留
    const nonSystemMessages = scoredMessages.filter((msg) => msg.role !== 'system');
    const recentMessages = nonSystemMessages.slice(-options.keepRecentMessages);

    for (const msg of recentMessages) {
      if (currentTokens + msg.estimatedTokens <= options.targetTokens) {
        result.push(msg);
        currentTokens += msg.estimatedTokens;
      }
    }

    // 按原始顺序排序
    result.sort((a, b) => {
      const indexA = messages.findIndex((m) => m.id === a.id);
      const indexB = messages.findIndex((m) => m.id === b.id);
      return indexA - indexB;
    });

    return {
      messages: result,
      removedCount: messages.length - result.length,
      savedTokens: originalTokens - currentTokens,
      originalTokens,
      compressedTokens: currentTokens,
    };
  }

  /**
   * 摘要策略
   */
  private compressSummarize(
    messages: Message[],
    options: CompressionOptions,
    originalTokens: number
  ): CompressionResult {
    const scoredMessages = this.scoreMessages(messages);
    const result: Message[] = [];
    let currentTokens = 0;

    // 保留系统消息
    if (options.keepSystemMessages) {
      for (const msg of scoredMessages) {
        if (msg.role === 'system') {
          result.push(msg);
          currentTokens += msg.estimatedTokens;
        }
      }
    }

    // 保留最近的消息
    const nonSystemMessages = scoredMessages.filter((msg) => msg.role !== 'system');
    const recentMessages = nonSystemMessages.slice(-options.keepRecentMessages);
    const oldMessages = nonSystemMessages.slice(0, -options.keepRecentMessages);

    // 为旧消息生成摘要
    let summary: ConversationSummary | undefined;
    if (oldMessages.length > 0 && options.generateSummary) {
      summary = this.generateSummary(oldMessages);
      this.summaries.push(summary);

      // 添加摘要作为系统消息
      const summaryMessage: Message = {
        id: `summary-${Date.now()}`,
        role: 'system',
        content: `[对话摘要]\n${summary.content}`,
        timestamp: new Date(),
      };
      result.push(summaryMessage);
      currentTokens += summary.summaryTokens;
    }

    // 添加最近的消息
    for (const msg of recentMessages) {
      result.push(msg);
      currentTokens += msg.estimatedTokens;
    }

    return {
      messages: result,
      summary,
      removedCount: oldMessages.length,
      savedTokens: originalTokens - currentTokens,
      originalTokens,
      compressedTokens: currentTokens,
    };
  }

  /**
   * 截断策略
   */
  private compressTruncate(
    messages: Message[],
    options: CompressionOptions,
    originalTokens: number
  ): CompressionResult {
    const result: Message[] = [];
    let currentTokens = 0;

    // 从最新的消息开始，直到达到目标 token 数
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgTokens = this.estimateMessageTokens(msg);

      if (currentTokens + msgTokens <= options.targetTokens) {
        result.unshift(msg);
        currentTokens += msgTokens;
      } else if (options.keepSystemMessages && msg.role === 'system') {
        // 始终保留系统消息
        result.unshift(msg);
        currentTokens += msgTokens;
      }
    }

    return {
      messages: result,
      removedCount: messages.length - result.length,
      savedTokens: originalTokens - currentTokens,
      originalTokens,
      compressedTokens: currentTokens,
    };
  }

  /**
   * 智能压缩策略
   *
   * 结合重要性评分和多种策略进行智能压缩
   */
  private compressSmart(
    messages: Message[],
    options: CompressionOptions,
    originalTokens: number
  ): CompressionResult {
    const scoredMessages = this.scoreMessages(messages);
    const result: Message[] = [];
    let currentTokens = 0;

    // 1. 首先保留所有系统消息
    const systemMessages = scoredMessages.filter((msg) => msg.role === 'system');
    for (const msg of systemMessages) {
      result.push(msg);
      currentTokens += msg.estimatedTokens;
    }

    // 2. 保留最近的消息（保证对话连贯性）
    const nonSystemMessages = scoredMessages.filter((msg) => msg.role !== 'system');
    const recentMessages = nonSystemMessages.slice(-options.keepRecentMessages);
    const oldMessages = nonSystemMessages.slice(0, -options.keepRecentMessages);

    // 3. 从旧消息中选择高重要性的消息
    const importantOldMessages = oldMessages
      .filter((msg) => msg.importance === 'critical' || msg.importance === 'high')
      .sort((a, b) => b.score - a.score);

    // 4. 计算可用于旧消息的 token 预算
    const recentTokens = recentMessages.reduce((sum, msg) => sum + msg.estimatedTokens, 0);
    const availableForOld = options.targetTokens - currentTokens - recentTokens;

    // 5. 添加重要的旧消息
    let oldTokens = 0;
    const selectedOldMessages: ScoredMessage[] = [];
    for (const msg of importantOldMessages) {
      if (oldTokens + msg.estimatedTokens <= availableForOld) {
        selectedOldMessages.push(msg);
        oldTokens += msg.estimatedTokens;
      }
    }

    // 6. 为未选中的旧消息生成摘要
    const unselectedOldMessages = oldMessages.filter(
      (msg) => !selectedOldMessages.includes(msg)
    );

    let summary: ConversationSummary | undefined;
    if (unselectedOldMessages.length > 0 && options.generateSummary) {
      summary = this.generateSummary(unselectedOldMessages);
      this.summaries.push(summary);

      // 添加摘要
      const summaryMessage: Message = {
        id: `summary-${Date.now()}`,
        role: 'system',
        content: `[对话摘要]\n${summary.content}`,
        timestamp: new Date(),
      };
      result.push(summaryMessage);
      currentTokens += summary.summaryTokens;
    }

    // 7. 添加选中的旧消息
    for (const msg of selectedOldMessages) {
      result.push(msg);
      currentTokens += msg.estimatedTokens;
    }

    // 8. 添加最近的消息
    for (const msg of recentMessages) {
      result.push(msg);
      currentTokens += msg.estimatedTokens;
    }

    // 9. 按原始顺序排序
    result.sort((a, b) => {
      const indexA = messages.findIndex((m) => m.id === a.id);
      const indexB = messages.findIndex((m) => m.id === b.id);
      // 摘要消息放在最前面（系统消息之后）
      if (indexA === -1) return -1;
      if (indexB === -1) return 1;
      return indexA - indexB;
    });

    return {
      messages: result,
      summary,
      removedCount: messages.length - result.length + (summary ? 1 : 0),
      savedTokens: originalTokens - currentTokens,
      originalTokens,
      compressedTokens: currentTokens,
    };
  }


  /**
   * 生成对话摘要
   *
   * 从消息列表中提取关键信息生成摘要
   *
   * @param messages - 要摘要的消息列表
   * @returns 对话摘要
   */
  generateSummary(messages: Message[] | ScoredMessage[]): ConversationSummary {
    const originalTokens = messages.reduce(
      (sum, msg) => sum + this.estimateMessageTokens(msg),
      0
    );

    // 提取关键信息
    const keyPoints: string[] = [];

    for (const msg of messages) {
      const content = this.extractTextContent(msg);
      if (!content) continue;

      // 提取用户请求
      if (msg.role === 'user') {
        const truncated = this.truncateText(content, 100);
        keyPoints.push(`用户: ${truncated}`);
      }

      // 提取助手的关键回复
      if (msg.role === 'assistant') {
        // 检查是否有工具调用
        if (Array.isArray(msg.content)) {
          const toolUses = msg.content.filter(
            (block: ContentBlock) => block.type === 'tool_use'
          );
          for (const toolUse of toolUses) {
            const toolName = (toolUse as { name?: string }).name || '未知工具';
            keyPoints.push(`执行工具: ${toolName}`);
          }
        }

        // 提取文本回复的摘要
        if (content.length > 50) {
          const truncated = this.truncateText(content, 80);
          keyPoints.push(`助手: ${truncated}`);
        }
      }
    }

    // 限制摘要长度
    const maxPoints = 10;
    const selectedPoints = keyPoints.slice(-maxPoints);
    const summaryContent = selectedPoints.join('\n');

    const summaryTokens = this.estimateTokens(summaryContent);

    return {
      content: summaryContent,
      messageCount: messages.length,
      originalTokens,
      summaryTokens,
      createdAt: new Date(),
    };
  }

  /**
   * 从消息中提取文本内容
   *
   * @param message - 消息对象
   * @returns 文本内容
   */
  private extractTextContent(message: Message): string {
    if (typeof message.content === 'string') {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      return message.content
        .filter((block: ContentBlock) => block.type === 'text')
        .map((block: ContentBlock) => (block as { text?: string }).text || '')
        .join('\n');
    }

    return '';
  }

  /**
   * 截断文本
   *
   * @param text - 原始文本
   * @param maxLength - 最大长度
   * @returns 截断后的文本
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * 提取文件的相关片段
   *
   * 根据查询上下文智能提取文件中最相关的代码片段
   *
   * @param fileContent - 文件完整内容
   * @param filePath - 文件路径
   * @param query - 查询上下文（用于确定相关性）
   * @param maxFragments - 最大片段数量
   * @param maxLinesPerFragment - 每个片段的最大行数
   * @returns 文件片段列表
   */
  extractFileFragments(
    fileContent: string,
    filePath: string,
    query: string,
    maxFragments: number = 3,
    maxLinesPerFragment: number = 50
  ): FileFragment[] {
    const lines = fileContent.split('\n');
    const fragments: FileFragment[] = [];

    // 提取查询中的关键词
    const keywords = this.extractKeywords(query);

    // 查找包含关键词的行
    const matchingLines: Array<{ lineNum: number; score: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      let score = 0;

      for (const keyword of keywords) {
        if (line.includes(keyword.toLowerCase())) {
          score += 10;
        }
      }

      // 检查是否是函数/类定义
      if (this.isDefinitionLine(lines[i])) {
        score += 5;
      }

      if (score > 0) {
        matchingLines.push({ lineNum: i, score });
      }
    }

    // 按分数排序
    matchingLines.sort((a, b) => b.score - a.score);

    // 提取片段
    const usedLines = new Set<number>();

    for (const match of matchingLines) {
      if (fragments.length >= maxFragments) break;
      if (usedLines.has(match.lineNum)) continue;

      // 确定片段范围
      const contextLines = Math.floor(maxLinesPerFragment / 2);
      let startLine = Math.max(0, match.lineNum - contextLines);
      let endLine = Math.min(lines.length - 1, match.lineNum + contextLines);

      // 调整到函数/类边界
      const adjusted = this.adjustToBoundaries(lines, startLine, endLine);
      startLine = adjusted.start;
      endLine = adjusted.end;

      // 检查是否与已有片段重叠
      let overlaps = false;
      for (let i = startLine; i <= endLine; i++) {
        if (usedLines.has(i)) {
          overlaps = true;
          break;
        }
      }

      if (overlaps) continue;

      // 标记已使用的行
      for (let i = startLine; i <= endLine; i++) {
        usedLines.add(i);
      }

      // 创建片段
      const fragmentContent = lines.slice(startLine, endLine + 1).join('\n');
      fragments.push({
        path: filePath,
        content: fragmentContent,
        startLine: startLine + 1, // 转换为 1-based
        endLine: endLine + 1,
        relevanceScore: match.score,
      });
    }

    // 如果没有找到匹配，返回文件开头
    if (fragments.length === 0 && lines.length > 0) {
      const endLine = Math.min(maxLinesPerFragment, lines.length) - 1;
      fragments.push({
        path: filePath,
        content: lines.slice(0, endLine + 1).join('\n'),
        startLine: 1,
        endLine: endLine + 1,
        relevanceScore: 0,
      });
    }

    return fragments;
  }

  /**
   * 从查询中提取关键词
   *
   * @param query - 查询文本
   * @returns 关键词列表
   */
  private extractKeywords(query: string): string[] {
    // 移除常见停用词
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'shall',
      'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in',
      'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
      'through', 'during', 'before', 'after', 'above', 'below',
      'between', 'under', 'again', 'further', 'then', 'once',
      '的', '是', '在', '有', '和', '与', '或', '但', '如果',
      '这', '那', '什么', '怎么', '如何', '为什么', '哪里',
    ]);

    // 分词并过滤
    const words = query
      .toLowerCase()
      .split(/[\s,.\-_:;!?()[\]{}'"]+/)
      .filter((word) => word.length > 2 && !stopWords.has(word));

    // 去重
    return [...new Set(words)];
  }

  /**
   * 检查是否是定义行（函数、类、接口等）
   *
   * @param line - 代码行
   * @returns 是否是定义行
   */
  private isDefinitionLine(line: string): boolean {
    const patterns = [
      /^\s*(export\s+)?(async\s+)?function\s+\w+/,
      /^\s*(export\s+)?(abstract\s+)?class\s+\w+/,
      /^\s*(export\s+)?interface\s+\w+/,
      /^\s*(export\s+)?type\s+\w+/,
      /^\s*(export\s+)?const\s+\w+\s*=/,
      /^\s*(public|private|protected)\s+(async\s+)?\w+\s*\(/,
      /^\s*def\s+\w+/,  // Python
      /^\s*class\s+\w+/,
    ];

    return patterns.some((pattern) => pattern.test(line));
  }

  /**
   * 调整片段边界到函数/类边界
   *
   * @param lines - 所有代码行
   * @param start - 起始行
   * @param end - 结束行
   * @returns 调整后的边界
   */
  private adjustToBoundaries(
    lines: string[],
    start: number,
    end: number
  ): { start: number; end: number } {
    // 向上查找函数/类定义
    let adjustedStart = start;
    for (let i = start; i >= Math.max(0, start - 10); i--) {
      if (this.isDefinitionLine(lines[i])) {
        adjustedStart = i;
        break;
      }
    }

    // 向下查找闭合括号
    let braceCount = 0;
    let adjustedEnd = end;
    for (let i = adjustedStart; i <= Math.min(lines.length - 1, end + 20); i++) {
      const line = lines[i];
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;

      if (i >= end && braceCount <= 0) {
        adjustedEnd = i;
        break;
      }
    }

    return { start: adjustedStart, end: adjustedEnd };
  }

  /**
   * 检查是否需要压缩上下文
   *
   * @param messages - 消息列表
   * @param systemPrompt - 系统提示词
   * @returns 是否需要压缩
   */
  needsCompression(messages: Message[], systemPrompt?: string): boolean {
    const state = this.getContextWindowState(messages, systemPrompt);
    return state.needsCompression;
  }

  /**
   * 自动管理上下文
   *
   * 如果上下文接近限制，自动进行压缩
   *
   * @param messages - 消息列表
   * @param systemPrompt - 系统提示词
   * @returns 压缩结果（如果进行了压缩）或原始消息
   */
  autoManageContext(
    messages: Message[],
    systemPrompt?: string
  ): { messages: Message[]; compressed: boolean; result?: CompressionResult } {
    if (!this.needsCompression(messages, systemPrompt)) {
      return { messages, compressed: false };
    }

    const result = this.compressMessages(messages);
    return {
      messages: result.messages,
      compressed: true,
      result,
    };
  }

  /**
   * 获取已生成的摘要列表
   *
   * @returns 摘要列表
   */
  getSummaries(): ConversationSummary[] {
    return [...this.summaries];
  }

  /**
   * 清除摘要历史
   */
  clearSummaries(): void {
    this.summaries = [];
  }

  /**
   * 获取配置
   *
   * @returns 当前配置
   */
  getConfig(): ContextManagerConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   *
   * @param config - 新配置（部分）
   */
  updateConfig(config: Partial<ContextManagerConfig>): void {
    Object.assign(this.config, config);
  }
}
