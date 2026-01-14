/**
 * 文件功能：会话管理模块，负责创建、保存、加载和清理用户会话
 *
 * 核心类：
 * - SessionManager: 会话生命周期管理器
 *
 * 核心方法：
 * - createSession(): 创建新会话实例
 * - loadSession(): 从磁盘加载指定会话数据
 * - saveSession(): 持久化会话到本地存储
 * - addMessage(): 向会话添加新消息
 * - listSessions(): 列出所有保存的会话
 * - listRecentSessions(): 获取最近创建的会话列表（按创建时间倒序）
 * - forkSession(): 分叉现有会话创建新会话
 * - cleanOldSessions(): 清理旧会话，保留最近 N 个会话
 * - deleteSession(): 删除指定会话
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { ProjectConfig } from '../config/SDKConfigLoader';

/**
 * 消息内容块类型
 */
export interface ContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  [key: string]: unknown;
}

/**
 * Token 使用统计接口
 *
 * 记录 SDK 查询的 token 使用情况和成本信息
 *
 * **验证: 需求 3.3**
 */
export interface UsageStats {
  /** 输入 token 数量 */
  inputTokens: number;
  /** 输出 token 数量 */
  outputTokens: number;
  /** 总花费（美元） */
  totalCostUsd?: number;
  /** 执行时长（毫秒） */
  durationMs?: number;
}

/**
 * 会话统计信息接口
 *
 * 聚合整个会话的使用统计数据
 */
export interface SessionStats {
  /** 总消息数量 */
  messageCount: number;
  /** 累计输入 token 数量 */
  totalInputTokens: number;
  /** 累计输出 token 数量 */
  totalOutputTokens: number;
  /** 累计总花费（美元） */
  totalCostUsd: number;
  /** 最后一条消息预览（前 80 字符） */
  lastMessagePreview: string;
}

/**
 * 消息接口
 */
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
  timestamp: Date;
  /** Token 使用统计（仅助手消息） */
  usage?: UsageStats;
}

/**
 * 代理接口
 */
export interface Agent {
  name: string;
  description: string;
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  prompt: string;
  tools?: string[];
}

/**
 * 会话上下文
 */
export interface SessionContext {
  workingDirectory: string;
  projectConfig: ProjectConfig;
  activeAgents: Agent[];
}

/**
 * 会话接口
 */
export interface Session {
  id: string;
  createdAt: Date;
  lastAccessedAt: Date;
  messages: Message[];
  context: SessionContext;
  expired: boolean;
  workingDirectory: string;
  /** SDK 会话 ID（用于恢复会话时传递给 SDK） */
  sdkSessionId?: string;
  /** 父会话 ID（分叉会话时记录源会话） */
  parentSessionId?: string;
  /** 会话统计信息 */
  stats?: SessionStats;
}

/**
 * 会话元数据（用于持久化）
 */
export interface SessionMetadata {
  id: string;
  createdAt: string;
  lastAccessedAt: string;
  workingDirectory: string;
  expired: boolean;
  /** SDK 会话 ID */
  sdkSessionId?: string;
  /** 父会话 ID（分叉会话时记录源会话） */
  parentSessionId?: string;
  /** 会话统计信息 */
  stats?: SessionStats;
}

/**
 * 会话过期时间（默认 5 小时，单位毫秒）
 * 可通过环境变量 SESSION_EXPIRY_HOURS 配置（单位：小时）
 */
const SESSION_EXPIRY_MS = parseInt(process.env.SESSION_EXPIRY_HOURS || '5', 10) * 60 * 60 * 1000;

const SESSION_BASE_DIR =
  process.env.CLAUDE_REPLICA_SESSIONS_DIR || path.join(os.homedir(), '.claude-replica', 'sessions');

/**
 * 会话管理器
 *
 * 提供会话的创建、保存、加载、列表和清理功能
 */
export class SessionManager {
  /** 会话存储目录 */
  private readonly sessionsDir: string;

  constructor(baseDir?: string) {
    this.sessionsDir = baseDir || SESSION_BASE_DIR;
  }

  /**
   * 生成唯一的会话 ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = crypto.randomBytes(8).toString('hex');
    return `session-${timestamp}-${randomPart}`;
  }

  /**
   * 获取会话目录路径
   */
  private getSessionDir(sessionId: string): string {
    return path.join(this.sessionsDir, sessionId);
  }

  /**
   * 确保会话存储目录存在
   */
  private async ensureSessionsDir(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
  }

  /**
   * 检查会话是否过期
   *
   * @param createdAt - 会话创建时间
   * @returns 是否过期（>= 配置的过期时间为过期）
   */
  private isSessionExpired(createdAt: Date): boolean {
    const now = Date.now();
    const created = createdAt.getTime();
    return now - created >= SESSION_EXPIRY_MS;
  }

  /**
   * 计算会话统计信息
   *
   * 遍历会话中的所有消息，累加 token 使用量和成本，提取最后一条消息预览
   *
   * @param session - 会话对象
   * @returns 会话统计信息
   */
  private calculateStats(session: Session): SessionStats {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostUsd = 0;
    let lastMessagePreview = '';

    // 遍历所有消息累加统计信息
    for (const message of session.messages) {
      if (message.usage) {
        totalInputTokens += message.usage.inputTokens || 0;
        totalOutputTokens += message.usage.outputTokens || 0;
        totalCostUsd += message.usage.totalCostUsd || 0;
      }
    }

    // 提取最后一条消息的前 80 字符作为预览
    if (session.messages.length > 0) {
      const lastMessage = session.messages[session.messages.length - 1];
      let contentText = '';

      if (typeof lastMessage.content === 'string') {
        contentText = lastMessage.content;
      } else if (Array.isArray(lastMessage.content)) {
        // 从内容块中提取文本
        const textBlocks = lastMessage.content.filter((block) => block.type === 'text');
        if (textBlocks.length > 0) {
          contentText = String(textBlocks[0].text || '');
        }
      }

      // 截取前 80 字符
      lastMessagePreview = contentText.substring(0, 80);
    }

    return {
      messageCount: session.messages.length,
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd,
      lastMessagePreview,
    };
  }

  /**
   * 创建新会话
   *
   * @param workingDir - 工作目录
   * @param projectConfig - 项目配置（可选）
   * @returns 新创建的会话
   */
  async createSession(workingDir: string, projectConfig: ProjectConfig = {}): Promise<Session> {
    await this.ensureSessionsDir();

    const now = new Date();
    const session: Session = {
      id: this.generateSessionId(),
      createdAt: now,
      lastAccessedAt: now,
      messages: [],
      context: {
        workingDirectory: workingDir,
        projectConfig,
        activeAgents: [],
      },
      expired: false,
      workingDirectory: workingDir,
    };

    return session;
  }

  /**
   * 保存会话
   *
   * @param session - 要保存的会话
   */
  async saveSession(session: Session): Promise<void> {
    // 保存前自动计算统计信息
    session.stats = this.calculateStats(session);

    const sessionDir = this.getSessionDir(session.id);
    await fs.mkdir(sessionDir, { recursive: true });

    // 保存元数据（包含 SDK 会话 ID、父会话 ID 和统计信息）
    const metadata: SessionMetadata = {
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      lastAccessedAt: session.lastAccessedAt.toISOString(),
      workingDirectory: session.workingDirectory,
      expired: session.expired,
      sdkSessionId: session.sdkSessionId,
      parentSessionId: session.parentSessionId,
      stats: session.stats,
    };
    await fs.writeFile(
      path.join(sessionDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );

    // 保存消息
    const messagesData = session.messages.map((msg) => ({
      ...msg,
      timestamp: msg.timestamp.toISOString(),
    }));
    await fs.writeFile(
      path.join(sessionDir, 'messages.json'),
      JSON.stringify(messagesData, null, 2),
      'utf-8'
    );

    // 保存上下文
    await fs.writeFile(
      path.join(sessionDir, 'context.json'),
      JSON.stringify(session.context, null, 2),
      'utf-8'
    );

    // 创建快照目录
    await fs.mkdir(path.join(sessionDir, 'snapshots'), { recursive: true });
  }

  /**
   * 加载会话（内部方法，不更新访问时间）
   *
   * @param sessionId - 会话 ID
   * @returns 加载的会话，如果不存在则返回 null
   */
  private async loadSessionInternal(sessionId: string): Promise<Session | null> {
    const sessionDir = this.getSessionDir(sessionId);

    try {
      // 检查会话目录是否存在
      await fs.access(sessionDir);
    } catch {
      return null;
    }

    try {
      // 加载元数据
      const metadataContent = await fs.readFile(path.join(sessionDir, 'metadata.json'), 'utf-8');
      const metadata: SessionMetadata = JSON.parse(metadataContent);

      // 加载消息
      let messages: Message[] = [];
      try {
        const messagesContent = await fs.readFile(path.join(sessionDir, 'messages.json'), 'utf-8');
        const messagesData = JSON.parse(messagesContent);
        messages = messagesData.map(
          (msg: {
            id: string;
            role: 'user' | 'assistant' | 'system';
            content: string | ContentBlock[];
            timestamp: string;
            usage?: UsageStats;
          }) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
            // 保留 usage 统计信息（如果存在）
            usage: msg.usage,
          })
        );
      } catch {
        // 消息文件可能不存在
      }

      // 加载上下文
      let context: SessionContext = {
        workingDirectory: metadata.workingDirectory,
        projectConfig: {},
        activeAgents: [],
      };
      try {
        const contextContent = await fs.readFile(path.join(sessionDir, 'context.json'), 'utf-8');
        context = JSON.parse(contextContent);
      } catch {
        // 上下文文件可能不存在
      }

      const createdAt = new Date(metadata.createdAt);
      // 如果已经被标记为过期，保持过期状态；否则根据时间计算
      const expired = metadata.expired || this.isSessionExpired(createdAt);

      return {
        id: metadata.id,
        createdAt,
        lastAccessedAt: new Date(metadata.lastAccessedAt),
        messages,
        context,
        expired,
        workingDirectory: metadata.workingDirectory,
        // 加载 SDK 会话 ID（用于会话恢复）
        sdkSessionId: metadata.sdkSessionId,
        // 加载父会话 ID（分叉会话时的源会话）
        parentSessionId: metadata.parentSessionId,
        // 加载会话统计信息
        stats: metadata.stats,
      };
    } catch (error) {
      console.warn(`Warning: Unable to load session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * 加载会话
   *
   * @param sessionId - 会话 ID
   * @returns 加载的会话，如果不存在则返回 null
   */
  async loadSession(sessionId: string): Promise<Session | null> {
    const session = await this.loadSessionInternal(sessionId);

    if (session) {
      // 更新最后访问时间
      session.lastAccessedAt = new Date();
    }

    return session;
  }

  /**
   * 列出所有会话
   *
   * @returns 会话列表
   */
  async listSessions(): Promise<Session[]> {
    try {
      await this.ensureSessionsDir();
      const entries = await fs.readdir(this.sessionsDir, { withFileTypes: true });
      const sessions: Session[] = [];

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('session-')) {
          // 使用内部方法加载，不更新访问时间
          const session = await this.loadSessionInternal(entry.name);
          if (session) {
            sessions.push(session);
          }
        }
      }

      // 按最后访问时间排序（最近的在前）
      sessions.sort((a, b) => b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime());

      return sessions;
    } catch {
      return [];
    }
  }

  /**
   * 获取最近创建的会话列表
   *
   * 返回按创建时间倒序排列的会话列表，用于交互式恢复菜单
   *
   * @param limit - 返回的最大会话数量，默认 10
   * @returns 按创建时间倒序排列的会话列表
   */
  async listRecentSessions(limit: number = 10): Promise<Session[]> {
    const sessions = await this.listSessions();

    // 按 createdAt 倒序排序（最新的在前）
    sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // 返回前 limit 个会话
    return sessions.slice(0, limit);
  }

  /**
   * 分叉会话
   *
   * 基于现有会话创建一个新会话，复制消息、上下文和统计信息，但不复制 SDK 会话 ID
   * 新会话的 parentSessionId 会设置为源会话的 ID
   *
   * @param sourceSessionId - 源会话 ID
   * @returns 新创建的分叉会话
   * @throws 如果源会话不存在则抛出错误
   */
  async forkSession(sourceSessionId: string): Promise<Session> {
    // 使用内部方法加载源会话（不更新访问时间）
    const sourceSession = await this.loadSessionInternal(sourceSessionId);

    // 验证源会话存在
    if (!sourceSession) {
      throw new Error(`Source session not found: ${sourceSessionId}`);
    }

    // 创建新会话 ID
    const newSessionId = this.generateSessionId();
    const now = new Date();

    // 深拷贝消息、上下文和统计信息
    const forkedSession: Session = {
      id: newSessionId,
      createdAt: now,
      lastAccessedAt: now,
      // 深拷贝消息数组
      messages: sourceSession.messages.map((msg) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      })),
      // 深拷贝上下文
      context: {
        ...sourceSession.context,
        workingDirectory: sourceSession.context.workingDirectory,
        projectConfig: { ...sourceSession.context.projectConfig },
        activeAgents: sourceSession.context.activeAgents.map((agent) => ({ ...agent })),
      },
      expired: false,
      workingDirectory: sourceSession.workingDirectory,
      // 设置父会话 ID
      parentSessionId: sourceSessionId,
      // 不复制 sdkSessionId，分叉会话是独立的
      // 不复制 stats，保存时会自动计算
    };

    return forkedSession;
  }

  /**
   * 清理旧会话
   *
   * 保留最近创建的 N 个会话，删除其余的旧会话
   *
   * @param keepCount - 要保留的会话数量，默认 10
   */
  async cleanOldSessions(keepCount: number = 10): Promise<void> {
    const sessions = await this.listSessions();

    // 按 createdAt 倒序排序（最新的在前）
    sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // 删除索引 >= keepCount 的会话
    for (let i = keepCount; i < sessions.length; i++) {
      await this.deleteSession(sessions[i].id);
    }
  }

  /**
   * 删除会话
   *
   * @param sessionId - 要删除的会话 ID
   */
  async deleteSession(sessionId: string): Promise<void> {
    const sessionDir = this.getSessionDir(sessionId);

    try {
      await fs.rm(sessionDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Warning: Unable to delete session ${sessionId}:`, error);
    }
  }

  /**
   * 添加消息到会话
   *
   * @param session - 会话
   * @param message - 要添加的消息
   */
  async addMessage(session: Session, message: Omit<Message, 'id' | 'timestamp'>): Promise<Message> {
    const newMessage: Message = {
      ...message,
      id: crypto.randomBytes(16).toString('hex'),
      timestamp: new Date(),
    };

    session.messages.push(newMessage);
    session.lastAccessedAt = new Date();

    return newMessage;
  }

  /**
   * 获取会话存储目录
   */
  getSessionsDir(): string {
    return this.sessionsDir;
  }
}
