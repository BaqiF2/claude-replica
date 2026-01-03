/**
 * 文件功能：消息路由模块，负责将用户消息路由到 Claude Agent SDK 并构建查询参数
 *
 * 核心类：
 * - MessageRouter: 消息路由器核心类
 *
 * 核心方法：
 * - routeMessage(): 将消息路由到 SDK 并构建查询选项
 * - buildSystemPrompt(): 构建系统提示词（包含 CLAUDE.md 和技能）
 * - buildQueryOptions(): 构建完整的 SDK 查询选项
 * - getEnabledToolNames(): 获取启用的工具列表
 * - createPermissionHandler(): 创建权限处理函数
 * - getAgentDefinitions(): 获取子代理定义
 */

import { ConfigManager } from '../config/ConfigManager';
import {
  PermissionMode,
  AgentDefinition,
  McpServerConfig,
  SandboxSettings,
  HookEvent,
  HookCallbackMatcher,
} from '../config/SDKConfigLoader';
import { ToolRegistry } from '../tools/ToolRegistry';
import { PermissionManager, CanUseTool, ToolUseParams } from '../permissions/PermissionManager';
import { Session, Skill, ContentBlock } from './SessionManager';

/**
 * 消息接口
 */
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
  timestamp: Date;
}

/**
 * 查询选项接口（SDK Options 的子集）
 */
export interface QueryOptions {
  /** 模型名称 */
  model: string;
  /** 系统提示词 */
  systemPrompt: string;
  /** 允许的工具列表 */
  allowedTools: string[];
  /** 禁止的工具列表 */
  disallowedTools?: string[];
  /** 工作目录 */
  cwd: string;
  /** 权限模式 */
  permissionMode: PermissionMode;
  /** 自定义权限处理函数 */
  canUseTool?: CanUseTool;
  /** MCP 服务器配置 */
  mcpServers?: Record<string, McpServerConfig>;
  /** 子代理定义 */
  agents?: Record<string, AgentDefinition>;
  /** 钩子配置 */
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
  /** 最大对话轮数 */
  maxTurns?: number;
  /** 最大预算（美元） */
  maxBudgetUsd?: number;
  /** 最大思考 token 数 */
  maxThinkingTokens?: number;
  /** 启用文件检查点 */
  enableFileCheckpointing?: boolean;
  /** 沙箱配置 */
  sandbox?: SandboxSettings;
}

/**
 * 查询结果接口
 */
export interface QueryResult {
  /** 用户提示词 */
  prompt: string;
  /** 查询选项 */
  options: QueryOptions;
}

/**
 * MessageRouter 选项接口
 */
export interface MessageRouterOptions {
  /** 配置管理器 */
  configManager: ConfigManager;
  /** 工具注册表（可选） */
  toolRegistry?: ToolRegistry;
  /** 权限管理器 */
  permissionManager: PermissionManager;
}

/**
 * 默认模型名称
 *
 * 可以通过环境变量 CLAUDE_REPLICA_DEFAULT_MODEL 进行配置
 */
const DEFAULT_MODEL = process.env.CLAUDE_REPLICA_DEFAULT_MODEL || 'claude-sonnet-4-5-20250929';

/**
 * 消息路由器类
 *
 * 负责：
 * - 构建系统提示词（包含 CLAUDE.md 和技能）
 * - 获取启用的工具列表
 * - 创建权限处理函数
 * - 获取子代理定义
 * - 构建 SDK 查询选项
 */
export class MessageRouter {
  /** 配置管理器 */
  private readonly configManager: ConfigManager;
  /** 工具注册表 */
  private readonly toolRegistry: ToolRegistry;
  /** 权限管理器 */
  private readonly permissionManager: PermissionManager;

  constructor(options: MessageRouterOptions) {
    this.configManager = options.configManager;
    this.toolRegistry = options.toolRegistry || new ToolRegistry();
    this.permissionManager = options.permissionManager;
  }

  /**
   * 路由消息到 SDK
   *
   * 构建查询选项并返回可用于 query() 函数的参数
   *
   * @param message - 用户消息
   * @param session - 当前会话
   * @returns 查询结果，包含提示词和选项
   */
  async routeMessage(message: Message, session: Session): Promise<QueryResult> {
    // 提取消息内容
    const prompt = this.extractPromptFromMessage(message);

    // 构建查询选项
    const options = await this.buildQueryOptions(session);

    return {
      prompt,
      options,
    };
  }

  /**
   * 构建系统提示词
   *
   * 按以下顺序组合系统提示词：
   * 1. CLAUDE.md 内容（如果存在）
   * 2. 加载的技能内容
   * 3. 追加的自定义提示词（如果提供）
   *
   * @param session - 当前会话
   * @param appendPrompt - 追加的提示词（可选）
   * @param replacePrompt - 完全替换的提示词（可选）
   * @returns 构建的系统提示词
   */
  async buildSystemPrompt(
    session: Session,
    appendPrompt?: string,
    replacePrompt?: string
  ): Promise<string> {
    // 如果提供了替换提示词，直接返回
    if (replacePrompt) {
      return replacePrompt;
    }

    const parts: string[] = [];

    // 1. 加载 CLAUDE.md 内容
    const claudeMd = await this.configManager.loadClaudeMd(session.workingDirectory);
    if (claudeMd) {
      parts.push(claudeMd);
    }

    // 2. 添加加载的技能内容
    const skillsPrompt = this.buildSkillsPrompt(session.context.loadedSkills);
    if (skillsPrompt) {
      parts.push(skillsPrompt);
    }

    // 3. 添加默认系统指令
    const defaultInstructions = this.getDefaultSystemInstructions();
    if (defaultInstructions) {
      parts.push(defaultInstructions);
    }

    // 4. 追加自定义提示词
    if (appendPrompt) {
      parts.push(appendPrompt);
    }

    return parts.join('\n\n');
  }

  /**
   * 获取启用的工具名称列表
   *
   * 处理逻辑：
   * 1. 从配置获取基础工具列表
   * 2. 添加技能所需的工具
   * 3. 移除禁用的工具
   *
   * @param session - 当前会话
   * @returns 启用的工具名称数组
   */
  getEnabledToolNames(session: Session): string[] {
    const { projectConfig, userConfig, loadedSkills } = session.context;

    // 合并用户和项目配置
    const mergedConfig = this.configManager.mergeConfigs(userConfig, projectConfig);

    // 获取基础工具列表
    let tools = this.toolRegistry.getEnabledTools({
      allowedTools: mergedConfig.allowedTools,
      disallowedTools: mergedConfig.disallowedTools,
    });

    // 添加技能所需的工具
    const skillTools = this.getSkillTools(loadedSkills);
    for (const tool of skillTools) {
      if (!tools.includes(tool) && this.toolRegistry.isValidTool(tool)) {
        tools.push(tool);
      }
    }

    // 确保不包含禁用的工具
    if (mergedConfig.disallowedTools && mergedConfig.disallowedTools.length > 0) {
      const disallowedSet = new Set(mergedConfig.disallowedTools);
      tools = tools.filter((tool) => !disallowedSet.has(tool));
    }

    return tools;
  }

  /**
   * 创建权限处理函数
   *
   * 返回一个 SDK 兼容的 CanUseTool 函数
   *
   * @param session - 当前会话
   * @returns 权限处理函数
   */
  createPermissionHandler(session: Session): CanUseTool {
    // 使用权限管理器创建处理函数
    const baseHandler = this.permissionManager.createCanUseToolHandler();

    // 包装处理函数以添加会话上下文
    return async (params: ToolUseParams): Promise<boolean> => {
      // 确保上下文包含会话 ID
      const enrichedParams: ToolUseParams = {
        ...params,
        context: {
          ...params.context,
          sessionId: params.context.sessionId || session.id,
        },
      };

      return baseHandler(enrichedParams);
    };
  }

  /**
   * 获取子代理定义
   *
   * 将会话中的活动代理转换为 SDK 格式
   *
   * @param session - 当前会话
   * @returns 子代理定义映射
   */
  getAgentDefinitions(session: Session): Record<string, AgentDefinition> {
    const { activeAgents, projectConfig } = session.context;
    const result: Record<string, AgentDefinition> = {};

    // 从活动代理列表转换
    for (const agent of activeAgents) {
      result[agent.name] = {
        description: agent.description,
        prompt: agent.prompt,
        tools: agent.tools,
        model: agent.model,
      };
    }

    // 合并配置中的代理定义
    if (projectConfig.agents) {
      for (const [name, definition] of Object.entries(projectConfig.agents)) {
        if (!result[name]) {
          result[name] = definition;
        }
      }
    }

    return result;
  }

  /**
   * 构建查询选项
   *
   * 组合所有配置构建完整的 SDK Options
   *
   * @param session - 当前会话
   * @returns 查询选项
   */
  async buildQueryOptions(session: Session): Promise<QueryOptions> {
    const { projectConfig, userConfig } = session.context;

    // 合并配置
    const mergedConfig = this.configManager.mergeConfigs(userConfig, projectConfig);

    // 构建系统提示词
    const systemPrompt = await this.buildSystemPrompt(session);

    // 获取启用的工具
    const allowedTools = this.getEnabledToolNames(session);

    // 获取子代理定义
    const agents = this.getAgentDefinitions(session);

    // 创建权限处理函数
    const canUseTool = this.createPermissionHandler(session);

    // 构建选项
    const options: QueryOptions = {
      model: mergedConfig.model || DEFAULT_MODEL,
      systemPrompt,
      allowedTools,
      disallowedTools: mergedConfig.disallowedTools,
      cwd: session.workingDirectory,
      permissionMode: mergedConfig.permissionMode || 'default',
      canUseTool,
      agents: Object.keys(agents).length > 0 ? agents : undefined,
      maxTurns: mergedConfig.maxTurns,
      maxBudgetUsd: mergedConfig.maxBudgetUsd,
      maxThinkingTokens: mergedConfig.maxThinkingTokens,
      enableFileCheckpointing: mergedConfig.enableFileCheckpointing,
      sandbox: mergedConfig.sandbox,
    };

    // 添加 MCP 服务器配置
    if (mergedConfig.mcpServers && Object.keys(mergedConfig.mcpServers).length > 0) {
      options.mcpServers = mergedConfig.mcpServers;
    }

    return options;
  }

  /**
   * 从消息中提取提示词
   *
   * @param message - 消息对象
   * @returns 提示词字符串
   */
  private extractPromptFromMessage(message: Message): string {
    if (typeof message.content === 'string') {
      return message.content;
    }

    // 处理 ContentBlock 数组
    const textBlocks = message.content.filter(
      (block): block is ContentBlock & { type: 'text'; text: string } =>
        block.type === 'text' && typeof block.text === 'string'
    );

    return textBlocks.map((block) => block.text).join('\n');
  }

  /**
   * 构建技能提示词
   *
   * @param skills - 技能列表
   * @returns 技能提示词
   */
  private buildSkillsPrompt(skills: Skill[]): string {
    if (skills.length === 0) {
      return '';
    }

    const parts: string[] = [];

    for (const skill of skills) {
      parts.push(`## Skill: ${skill.name}\n\n${skill.content}`);
    }

    return parts.join('\n\n');
  }

  /**
   * 获取技能所需的工具列表
   *
   * @param skills - 技能列表
   * @returns 工具名称数组
   */
  private getSkillTools(skills: Skill[]): string[] {
    const tools = new Set<string>();

    for (const skill of skills) {
      if (skill.tools) {
        for (const tool of skill.tools) {
          tools.add(tool);
        }
      }
    }

    return Array.from(tools);
  }

  /**
   * 获取默认系统指令
   *
   * @returns 默认系统指令
   */
  private getDefaultSystemInstructions(): string {
    return `You are an intelligent code assistant that helps users with various programming tasks.

You can:
- Read and edit files
- Execute shell commands
- Search the codebase
- Analyze and understand code
- Provide programming advice and best practices

Always:
- Confirm user intent before modifying files
- Provide clear explanations
- Follow the project's coding standards
- Pay attention to code security`;
  }
}
