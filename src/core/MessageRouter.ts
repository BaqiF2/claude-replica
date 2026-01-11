/**
 * 文件功能：消息路由模块，负责将用户消息路由到 Claude Agent SDK 并构建查询参数
 *
 * 核心类：
 * - MessageRouter: 消息路由器核心类
 *
 * 核心方法：
 * - routeMessage(): 将消息路由到 SDK 并构建查询选项
 * - buildStreamMessage(): 构建流式消息（支持图像引用）
 * - getSystemPromptOptions(): 获取系统提示词选项（SDK 预设格式）
 * - buildAppendPrompt(): 构建追加提示词（当前无追加内容）
 * - getSettingSources(): 获取配置源列表（用于 SDK 自动加载 CLAUDE.md）
 * - buildQueryOptions(): 构建完整的 SDK 查询选项
 * - getEnabledToolNames(): 获取启用的工具列表
 * - createPermissionHandler(): 创建权限处理函数
 * - getAgentDefinitions(): 获取子代理定义
 * - setQueryInstance(): 设置 Query 实例引用（用于动态权限切换）
 * - setPermissionMode(): 设置权限模式并同步到 SDK
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
import { PermissionManager } from '../permissions/PermissionManager';
import { Session, ContentBlock } from './SessionManager';
import { ImageHandler, ImageData } from '../image/ImageHandler';
import { getPresetAgents } from '../agents/PresetAgents';
import { StreamContentBlock, TextContentBlock, ImageContentBlock } from '../sdk/SDKQueryExecutor';
import type { CanUseTool as SDKCanUseTool } from '@anthropic-ai/claude-agent-sdk';
import type { Query } from '@anthropic-ai/claude-agent-sdk';

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
  /** 系统提示词（支持字符串或预设对象格式） */
  systemPrompt: string | { type: 'preset'; preset: 'claude_code'; append?: string };
  /** 配置源列表（用于 SDK 自动加载 CLAUDE.md） */
  settingSources?: ('user' | 'project' | 'local')[];
  /** 允许的工具列表 */
  allowedTools?: string[];
  /** 禁止的工具列表 */
  disallowedTools?: string[];
  /** 工作目录 */
  cwd: string;
  /** 权限模式 */
  permissionMode: PermissionMode;
  /** 自定义权限处理函数 */
  canUseTool?: SDKCanUseTool;
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
  /** 图像处理器（可选，如果不提供则在需要时创建） */
  imageHandler?: ImageHandler;
}

/**
 * 流式消息构建结果
 *
 * 包含构建的内容块、处理后的文本、加载的图像和错误信息。
 *
 * 字段说明：
 * - contentBlocks: SDK 可用的内容块数组（文本块 + 图像块）
 *   - 可能为空（极端情况：空输入且无图像）
 *   - 顺序：文本块在前，图像块在后（按原始顺序）
 *
 * - processedText: 移除所有图像引用后的纯文本
 *   - 如果原始消息仅包含图像引用，此字段为空字符串
 *   - 多余空白会被清理（连续空格变为单个空格）
 *
 * - images: 成功加载的图像数据列表
 *   - 按原始文本中的出现顺序排列
 *   - 长度可能小于引用数量（部分图像加载失败）
 *   - 如果没有图像或全部失败，此数组为空
 *
 * - errors: 图像加载错误列表
 *   - 每个错误包含引用字符串和错误消息
 *   - 长度 > 0 表示至少有一个图像加载失败
 *   - 如果没有错误，此数组为空
 *
 * 示例：
 * - 成功场景：contentBlocks.length > 0, images.length > 0, errors.length = 0
 * - 部分失败：contentBlocks.length > 0, images.length < 引用数, errors.length > 0
 * - 全部失败：contentBlocks 仅含文本, images.length = 0, errors.length > 0
 */
export interface StreamMessageBuildResult {
  /** 构建的内容块数组 */
  contentBlocks: StreamContentBlock[];
  /** 处理后的纯文本（移除图像引用后） */
  processedText: string;
  /** 加载的图像数据列表 */
  images: ImageData[];
  /** 图像处理错误列表 */
  errors: Array<{ reference: string; error: string }>;
}

/**
 * 默认模型名称
 *
 * 可以通过环境变量 CLAUDE_REPLICA_DEFAULT_MODEL 进行配置
 */
const DEFAULT_MODEL = process.env.CLAUDE_REPLICA_DEFAULT_MODEL || 'sonnet';

/**
 * 消息路由器类
 *
 * 负责：
 * - 构建系统提示词选项（使用 SDK 预设和 append）
 * - 构建流式消息（包含图像处理）
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
  /** 图像处理器缓存（按工作目录索引） */
  private readonly imageHandlerCache: Map<string, ImageHandler> = new Map();
  /** 默认工作目录 */
  private defaultWorkingDirectory: string = process.cwd();
  /** Query 实例引用（用于动态权限切换） */
  private queryInstance: Query | null = null;
  /** 当前加载的 MCP 服务器配置 */
  private mcpServers?: Record<string, McpServerConfig>;

  constructor(options: MessageRouterOptions) {
    this.configManager = options.configManager;
    this.toolRegistry = options.toolRegistry || new ToolRegistry();
    this.permissionManager = options.permissionManager;

    // 如果提供了 imageHandler，将其存储为默认工作目录的缓存
    if (options.imageHandler) {
      this.imageHandlerCache.set(this.defaultWorkingDirectory, options.imageHandler);
    }
  }

  /**
   * 设置默认工作目录
   *
   * 用于图像路径解析。更新默认工作目录后，后续调用 getImageHandler()
   * 不传参数时将使用新的工作目录。
   *
   * @param workingDirectory - 工作目录路径
   */
  setWorkingDirectory(workingDirectory: string): void {
    this.defaultWorkingDirectory = workingDirectory;
    // 无需预创建实例，getImageHandler() 会按需创建并缓存
  }

  /**
   * 设置 MCP 服务器配置
   *
   * @param servers - MCP 服务器配置映射
   */
  setMcpServers(servers?: Record<string, McpServerConfig>): void {
    this.mcpServers = servers;
  }

  /**
   * 获取或创建图像处理器
   *
   * 采用缓存策略：每个工作目录对应一个 ImageHandler 实例。
   * 这样可以避免频繁创建实例，同时支持多个工作目录。
   *
   * @param workingDirectory - 可选的工作目录，未提供时使用默认工作目录
   * @returns 图像处理器实例
   */
  private getImageHandler(workingDirectory?: string): ImageHandler {
    const dir = workingDirectory || this.defaultWorkingDirectory;

    // 尝试从缓存获取
    let handler = this.imageHandlerCache.get(dir);

    // 如果缓存中不存在，创建新实例并缓存
    if (!handler) {
      handler = new ImageHandler(dir);
      this.imageHandlerCache.set(dir, handler);
    }

    return handler;
  }

  /**
   * 构建流式消息
   *
   * 解析消息中的图像引用（@./image.png 语法），构建包含文本和图像内容块的消息。
   *
   * 支持的图像引用语法：
   * - @./image.png - 相对路径（相对于工作目录）
   * - @/abs/path/image.png - 绝对路径
   * - @image.png - 当前目录
   *
   * 内容块顺序规则：
   * - 所有图像引用会被从文本中移除
   * - 处理后的纯文本（如果非空）作为第一个文本块
   * - 图像块按照它们在原始文本中的出现顺序依次添加
   * - 注意：图像与文本片段的交错位置不会被保留
   *   例如："Check @img1.png then @img2.png"
   *        会变成 [text: "Check then"], [image: img1], [image: img2]
   *
   * 边缘情况处理：
   *
   * 1. 纯文本消息（无图像引用）
   *    输入：  "Hello, Claude!"
   *    输出：  contentBlocks: [{ type: 'text', text: 'Hello, Claude!' }]
   *           images: []
   *           errors: []
   *
   * 2. 纯图像消息（仅包含图像引用）
   *    输入：  "@./image.png"
   *    输出：  contentBlocks: [{ type: 'image', source: {...} }]
   *           images: [ImageData]
   *           errors: []
   *           注意：不会有文本块，因为 processResult.text 为空
   *
   * 3. 文本+图像混合
   *    输入：  "Check @./image.png please"
   *    输出：  contentBlocks: [
   *             { type: 'text', text: 'Check please' },
   *             { type: 'image', source: {...} }
   *           ]
   *           images: [ImageData]
   *           errors: []
   *
   * 4. 空消息或仅空白字符
   *    输入：  "" 或 "   "
   *    输出：  contentBlocks: [{ type: 'text', text: '' }] 或 [{ type: 'text', text: '   ' }]
   *           images: []
   *           errors: []
   *           注意：保留原始消息，即使为空
   *
   * 5. 图像引用无效（文件不存在）
   *    输入：  "Check @./nonexistent.png"
   *    输出：  contentBlocks: [{ type: 'text', text: 'Check' }]
   *           images: []
   *           errors: [{ reference: '@./nonexistent.png', error: 'Image file does not exist: ...' }]
   *           注意：失败的图像不会添加到 contentBlocks，但文本仍会处理
   *
   * 6. 多个图像引用（部分失败）
   *    输入：  "Compare @./img1.png and @./nonexistent.png"
   *    输出：  contentBlocks: [
   *             { type: 'text', text: 'Compare and' },
   *             { type: 'image', source: {...} }  // 仅 img1
   *           ]
   *           images: [ImageData]  // 仅 img1
   *           errors: [{ reference: '@./nonexistent.png', error: '...' }]
   *
   * 7. 多个图像引用（全部成功）
   *    输入：  "See @./img1.png and @./img2.png"
   *    输出：  contentBlocks: [
   *             { type: 'text', text: 'See and' },
   *             { type: 'image', source: {...} },  // img1
   *             { type: 'image', source: {...} }   // img2
   *           ]
   *           images: [ImageData, ImageData]  // 按原始顺序
   *           errors: []
   *
   * @param rawMessage - 原始消息文本（可能包含图像引用）
   * @param session - 会话对象（用于获取工作目录）
   * @returns 流式消息构建结果
   */
  async buildStreamMessage(
    rawMessage: string,
    session: Session
  ): Promise<StreamMessageBuildResult> {
    const imageHandler = this.getImageHandler(session.workingDirectory);

    // 在 plan 模式下，为消息添加前缀提示
    let messageToProcess = rawMessage;
    if (this.permissionManager.getMode() === 'plan') {
      const planModePrefix = `[SYSTEM: You are in Plan Mode. Use Read/Grep/Glob to explore, then use ExitPlanMode when ready to implement. Write/Edit/Bash are disabled.]\n\n`;
      messageToProcess = planModePrefix + rawMessage;
    }

    // 处理图像引用
    const processResult = await imageHandler.processTextWithImages(messageToProcess);

    // 构建内容块
    const contentBlocks: StreamContentBlock[] = [];

    // 添加文本块（如果有处理后的文本）
    if (processResult.text.trim()) {
      const textBlock: TextContentBlock = {
        type: 'text',
        text: processResult.text,
      };
      contentBlocks.push(textBlock);
    } else if (processResult.images.length === 0) {
      // 如果没有图像也没有文本，使用原始消息
      const textBlock: TextContentBlock = {
        type: 'text',
        text: rawMessage,
      };
      contentBlocks.push(textBlock);
    }

    // 添加图像块
    for (const imageData of processResult.images) {
      const imageBlock: ImageContentBlock = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageData.mimeType,
          data: imageData.data,
        },
      };
      contentBlocks.push(imageBlock);
    }

    return {
      contentBlocks,
      processedText: processResult.text,
      images: processResult.images,
      errors: processResult.errors,
    };
  }

  /**
   * 检查消息是否包含图像引用
   *
   * @param message - 消息文本
   * @returns 是否包含图像引用
   */
  hasImageReferences(message: string): boolean {
    const imageHandler = this.getImageHandler();
    const references = imageHandler.extractImageReferences(message);
    return references.length > 0;
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
   * 获取启用的工具名称列表
   *
   * 处理逻辑：
   * 1. 从配置获取基础工具列表
   * 2. 确保默认包含 Skill 工具
   * 3. 如存在子代理则自动启用 Task 工具
   * 4. 移除禁用的工具
   *
   * @param session - 当前会话
   * @returns 启用的工具名称数组
   */
  getEnabledToolNames(session: Session): string[] {
    const { projectConfig, userConfig } = session.context;

    // 合并用户和项目配置
    const mergedConfig = this.configManager.mergeConfigs(userConfig, projectConfig);
    const disallowedSet = new Set(mergedConfig.disallowedTools ?? []);

    // 获取基础工具列表
    let tools: string[] = [];
    const configuredAllowedTools = mergedConfig.allowedTools ?? [];

    if (configuredAllowedTools.length > 0) {
      const seen = new Set<string>();
      for (const tool of configuredAllowedTools) {
        if (!this.toolRegistry.isValidTool(tool) && !this.isMcpToolName(tool)) {
          continue;
        }
        if (!seen.has(tool)) {
          seen.add(tool);
          tools.push(tool);
        }
      }
    } else {
      tools = this.toolRegistry.getEnabledTools({
        disallowedTools: mergedConfig.disallowedTools,
      });
    }

    // 默认启用 Skill 工具
    if (!tools.includes('Skill') && this.toolRegistry.isValidTool('Skill')) {
      tools.push('Skill');
    }

    const agents = this.getAgentDefinitions(session);
    const hasAgents = Object.keys(agents).length > 0;
    if (
      hasAgents &&
      !tools.includes('Task') &&
      this.toolRegistry.isValidTool('Task') &&
      !disallowedSet.has('Task')
    ) {
      tools.push('Task');
      console.info('Info: Task tool automatically enabled because subAgents are defined...');
    }

    // 移除禁用的工具
    if (disallowedSet.size > 0) {
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
  createPermissionHandler(_session: Session): SDKCanUseTool {
    // 使用权限管理器创建处理函数
    const baseHandler = this.permissionManager.createCanUseToolHandler();

    // 直接返回 baseHandler，它已经是符合 SDK 规范的 SDKCanUseTool
    return baseHandler;
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
    const result: Record<string, AgentDefinition> = getPresetAgents();

    // 合并配置中的代理定义
    if (projectConfig.agents) {
      for (const [name, definition] of Object.entries(projectConfig.agents)) {
        result[name] = definition;
      }
    }

    // 从活动代理列表转换
    for (const agent of activeAgents) {
      result[agent.name] = {
        description: agent.description,
        prompt: agent.prompt,
        tools: agent.tools,
        model: agent.model,
      };
    }

    return result;
  }

  /**
   * 设置 Query 实例引用
   *
   * 用于存储 SDK query 实例，以便后续调用其控制方法（如 setPermissionMode）
   *
   * @param instance - Query 实例
   */
  setQueryInstance(instance: Query | null): void {
    this.queryInstance = instance;
  }

  /**
   * 设置权限模式
   *
   * 本地同步更新权限模式，并异步调用 SDK query 实例的 setPermissionMode 方法
   *
   * @param mode - 新的权限模式
   */
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    // 1. 本地同步更新
    this.permissionManager.setMode(mode);

    // 2. 如果 queryInstance 存在，异步调用 SDK 的 setPermissionMode
    if (this.queryInstance) {
      await this.queryInstance.setPermissionMode(mode);
    }
  }

  /**
   * 获取系统提示词选项（SDK 预设格式）
   *
   * 返回 SDK 预设格式的系统提示词配置，使用 claude_code 预设。
   * 如果会话有技能加载，则构建 append 字符串追加到预设后面。
   *
   * @param session - 当前会话
   * @returns 系统提示词预设对象
   */
  getSystemPromptOptions(session: Session): {
    type: 'preset';
    preset: 'claude_code';
    append?: string;
  } {
    const appendPrompt = this.buildAppendPrompt(session);

    return {
      type: 'preset',
      preset: 'claude_code',
      ...(appendPrompt ? { append: appendPrompt } : {}),
    };
  }

  /**
   * 构建追加提示词
   *
   * Skills 现在由 SDK Agent Skills API 自动管理，无需在系统提示词中注入。
   * CLAUDE.md 由 SDK 通过 settingSources 自动加载。
   * 根据当前权限模式，可能添加特定模式的指导。
   *
   * @param _session - 当前会话
   * @returns 追加的提示词
   */
  buildAppendPrompt(_session: Session): string | undefined {
    // Skills 由 SDK Agent Skills API 自动管理

    // 根据权限模式添加提示词
    const currentMode = this.permissionManager.getMode();

    if (currentMode === 'plan') {
      return `
# Plan Mode Active

You are currently in **Plan Mode**. In this mode:

## Allowed Tools
- **Read**: Read files to understand the codebase
- **Grep**: Search for patterns in files
- **Glob**: Find files by pattern
- **ExitPlanMode**: Exit plan mode to begin implementation

## Workflow
1. **Explore**: Use Read, Grep, and Glob to explore the codebase and understand the task
2. **Plan**: Create a detailed implementation plan
3. **Exit**: Use ExitPlanMode to exit plan mode and begin implementation

## Restrictions
- You CANNOT use Write, Edit, Bash, or any other modification tools in plan mode
- All implementation tools will return "Plan mode: tool execution disabled"
- Focus on understanding and planning, not implementing

When you're ready to implement your plan, use the ExitPlanMode tool.
`.trim();
    }

    return undefined;
  }

  /**
   * 获取配置源列表
   *
   * 返回用于 SDK 自动加载 CLAUDE.md 的配置源。
   * 目前仅支持项目级 CLAUDE.md（.claude/CLAUDE.md）
   * Skills 仅支持项目级自动发现。
   *
   * @returns 配置源数组
   */
  getSettingSources(): ('user' | 'project' | 'local')[] {
    return ['project'];
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

    // 合并用户和项目配置
    const mergedConfig = this.configManager.mergeConfigs(userConfig, projectConfig);

    // 获取系统提示词选项（SDK 预设格式）
    const systemPrompt = this.getSystemPromptOptions(session);

    // 获取配置源（用于 SDK 自动加载 CLAUDE.md）
    const settingSources = this.getSettingSources();

    // 获取启用的工具
    const allowedTools =
      mergedConfig.allowedTools && mergedConfig.allowedTools.length > 0
        ? this.getEnabledToolNames(session)
        : undefined;

    // 获取子代理定义
    const agents = this.getAgentDefinitions(session);

    // 创建权限处理函数
    const canUseTool = this.createPermissionHandler(session);

    // 构建选项
    const options: QueryOptions = {
      model: mergedConfig.model || DEFAULT_MODEL,
      systemPrompt,
      settingSources,
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
    if (this.mcpServers && Object.keys(this.mcpServers).length > 0) {
      options.mcpServers = this.mcpServers;
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

    // 处理 ContentBlock 数组 处理可能包含多种类型内容块的消息（如文本、图片等），只提取其中的文本内容并合并返回
    const textBlocks = message.content.filter(
      (block): block is ContentBlock & { type: 'text'; text: string } =>
        block.type === 'text' && typeof block.text === 'string'
    );

    return textBlocks.map((block) => block.text).join('\n');
  }

  private isMcpToolName(toolName: string): boolean {
    return toolName.startsWith('mcp__');
  }
}
