/**
 * 文件功能：工具注册表，负责管理 SDK 内置工具的启用和配置
 *
 * 核心类：
 * - ToolRegistry: 工具注册表类，管理所有 SDK 内置工具的注册、查询和启用状态
 *
 * 核心方法：
 * - getDefaultTools(): 获取默认启用的工具列表
 * - getAllTools(): 获取所有可用工具列表
 * - getEnabledTools(): 根据配置获取启用的工具列表
 * - isValidTool(): 验证工具名称是否有效
 * - getToolMetadata(): 获取工具元数据
 * - isDangerousTool(): 检查工具是否为危险工具
 * - validateConfig(): 验证工具配置
 */

/**
 * 工具配置接口
 */
export interface ToolConfig {
  /** 允许的工具列表 (白名单) */
  allowedTools?: string[];
  /** 禁止的工具列表 (黑名单) */
  disallowedTools?: string[];
}

/**
 * 工具分类
 */
export enum ToolCategory {
  /** 文件操作工具 */
  FILE = 'file',
  /** 命令执行工具 */
  COMMAND = 'command',
  /** 搜索工具 */
  SEARCH = 'search',
  /** 子代理工具 */
  AGENT = 'agent',
  /** 用户交互工具 */
  USER = 'user',
  /** 网络工具 */
  NETWORK = 'network',
  /** 任务管理工具 */
  TASK = 'task',
  /** Jupyter 工具 */
  JUPYTER = 'jupyter',
  /** 计划模式工具 */
  PLAN = 'plan',
  /** MCP 工具 */
  MCP = 'mcp',
}

/**
 * 工具元数据
 */
export interface ToolMetadata {
  /** 工具名称 */
  name: string;
  /** 工具分类 */
  category: ToolCategory;
  /** 工具描述 */
  description: string;
  /** 是否为危险工具 (需要权限确认) */
  dangerous: boolean;
}

/**
 * 工具注册表类
 *
 * 负责管理 SDK 内置工具的注册、查询和启用状态
 */
export class ToolRegistry {
  /** 工具元数据映射 */
  private readonly toolMetadata: Map<string, ToolMetadata>;

  constructor() {
    this.toolMetadata = new Map();
    this.initializeToolMetadata();
  }

  /**
   * 初始化工具元数据
   */
  private initializeToolMetadata(): void {
    // 文件操作工具
    this.registerTool({
      name: 'Read',
      category: ToolCategory.FILE,
      description: '读取文件内容',
      dangerous: false,
    });
    this.registerTool({
      name: 'Write',
      category: ToolCategory.FILE,
      description: '写入文件',
      dangerous: true,
    });
    this.registerTool({
      name: 'Edit',
      category: ToolCategory.FILE,
      description: '编辑文件 (使用 diff 格式)',
      dangerous: true,
    });

    // 命令执行工具
    this.registerTool({
      name: 'Bash',
      category: ToolCategory.COMMAND,
      description: '执行 bash 命令',
      dangerous: true,
    });
    this.registerTool({
      name: 'BashOutput',
      category: ToolCategory.COMMAND,
      description: '获取后台命令输出',
      dangerous: false,
    });
    this.registerTool({
      name: 'KillBash',
      category: ToolCategory.COMMAND,
      description: '终止后台命令',
      dangerous: true,
    });

    // 搜索工具
    this.registerTool({
      name: 'Grep',
      category: ToolCategory.SEARCH,
      description: '搜索文件内容',
      dangerous: false,
    });
    this.registerTool({
      name: 'Glob',
      category: ToolCategory.SEARCH,
      description: '文件路径匹配',
      dangerous: false,
    });

    // 子代理工具
    this.registerTool({
      name: 'Task',
      category: ToolCategory.AGENT,
      description: '委托任务给子代理',
      dangerous: false,
    });
    this.registerTool({
      name: 'Skill',
      category: ToolCategory.AGENT,
      description: '执行 Agent Skill',
      dangerous: false,
    });

    // 用户交互工具
    this.registerTool({
      name: 'AskUserQuestion',
      category: ToolCategory.USER,
      description: '向用户提问',
      dangerous: false,
    });

    // 网络工具
    this.registerTool({
      name: 'WebFetch',
      category: ToolCategory.NETWORK,
      description: '获取网页内容',
      dangerous: false,
    });
    this.registerTool({
      name: 'WebSearch',
      category: ToolCategory.NETWORK,
      description: '搜索网页',
      dangerous: false,
    });

    // 任务管理工具
    this.registerTool({
      name: 'TodoWrite',
      category: ToolCategory.TASK,
      description: '写入任务列表',
      dangerous: false,
    });

    // Jupyter 工具
    this.registerTool({
      name: 'NotebookEdit',
      category: ToolCategory.JUPYTER,
      description: '编辑 Jupyter notebook',
      dangerous: true,
    });

    // 计划模式工具
    this.registerTool({
      name: 'ExitPlanMode',
      category: ToolCategory.PLAN,
      description: '退出计划模式',
      dangerous: false,
    });

    // MCP 工具
    this.registerTool({
      name: 'ListMcpResources',
      category: ToolCategory.MCP,
      description: '列出 MCP 资源',
      dangerous: false,
    });
    this.registerTool({
      name: 'ReadMcpResource',
      category: ToolCategory.MCP,
      description: '读取 MCP 资源',
      dangerous: false,
    });
  }

  /**
   * 注册工具元数据
   */
  private registerTool(metadata: ToolMetadata): void {
    this.toolMetadata.set(metadata.name, metadata);
  }

  /**
   * 获取默认启用的工具列表
   *
   * 默认工具集包含最常用的文件操作和搜索工具
   *
   * @returns 默认工具名称数组
   */
  getDefaultTools(): string[] {
    return ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'];
  }

  /**
   * 获取所有可用工具列表
   *
   * @returns 所有工具名称数组
   */
  getAllTools(): string[] {
    return Array.from(this.toolMetadata.keys());
  }

  /**
   * 根据配置获取启用的工具列表
   *
   * 处理逻辑:
   * 1. 如果指定了 allowedTools，则使用白名单
   * 2. 否则使用默认工具列表
   * 3. 从结果中移除 disallowedTools 中的工具
   *
   * @param config 工具配置
   * @returns 启用的工具名称数组
   */
  getEnabledTools(config: ToolConfig = {}): string[] {
    // 1. 确定基础工具列表
    let tools: string[];

    if (config.allowedTools && config.allowedTools.length > 0) {
      // 使用白名单，但只保留有效的工具名称
      tools = config.allowedTools.filter((tool) => this.isValidTool(tool));
    } else {
      // 使用默认工具列表
      tools = [...this.getDefaultTools()];
    }

    // 2. 移除黑名单中的工具
    if (config.disallowedTools && config.disallowedTools.length > 0) {
      const disallowedSet = new Set(config.disallowedTools);
      tools = tools.filter((tool) => !disallowedSet.has(tool));
    }

    return tools;
  }

  /**
   * 验证工具名称是否有效
   *
   * @param toolName 工具名称
   * @returns 是否为有效的工具名称
   */
  isValidTool(toolName: string): boolean {
    return this.toolMetadata.has(toolName);
  }

  /**
   * 获取工具元数据
   *
   * @param toolName 工具名称
   * @returns 工具元数据，如果工具不存在则返回 undefined
   */
  getToolMetadata(toolName: string): ToolMetadata | undefined {
    return this.toolMetadata.get(toolName);
  }

  /**
   * 检查工具是否为危险工具
   *
   * @param toolName 工具名称
   * @returns 是否为危险工具
   */
  isDangerousTool(toolName: string): boolean {
    const metadata = this.toolMetadata.get(toolName);
    return metadata?.dangerous ?? false;
  }

  /**
   * 验证工具配置
   *
   * @param config 工具配置
   * @returns 验证结果，包含无效的工具名称
   */
  validateConfig(config: ToolConfig): { valid: boolean; invalidTools: string[] } {
    const invalidTools: string[] = [];

    // 检查 allowedTools 中的无效工具
    if (config.allowedTools) {
      for (const tool of config.allowedTools) {
        if (!this.isValidTool(tool)) {
          invalidTools.push(tool);
        }
      }
    }

    // 检查 disallowedTools 中的无效工具
    if (config.disallowedTools) {
      for (const tool of config.disallowedTools) {
        if (!this.isValidTool(tool)) {
          invalidTools.push(tool);
        }
      }
    }

    return {
      valid: invalidTools.length === 0,
      invalidTools: [...new Set(invalidTools)], // 去重
    };
  }
}
