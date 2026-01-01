/**
 * 权限管理器
 *
 * 管理工具执行权限，支持 SDK 的权限模式和自定义权限处理
 *
 * SDK 权限模式:
 * - default: 默认模式，危险操作需要用户确认
 * - acceptEdits: 自动接受文件编辑，其他危险操作仍需确认
 * - bypassPermissions: 绕过所有权限检查
 * - plan: 计划模式，不执行任何工具
 */

import { ToolRegistry } from '../tools/ToolRegistry';

/**
 * SDK 权限模式类型
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

/**
 * 工具使用上下文
 */
export interface ToolUseContext {
  /** 会话 ID */
  sessionId: string;
  /** 消息 UUID */
  messageUuid: string;
}

/**
 * 工具使用参数
 */
export interface ToolUseParams {
  /** 工具名称 */
  tool: string;
  /** 工具参数 */
  args: Record<string, unknown>;
  /** 上下文信息 */
  context: ToolUseContext;
}

/**
 * SDK 兼容的权限检查函数类型
 */
export type CanUseTool = (params: ToolUseParams) => boolean | Promise<boolean>;

/**
 * 用户确认回调函数类型
 */
export type PromptUserCallback = (message: string) => Promise<boolean>;

/**
 * 权限配置接口
 */
export interface PermissionConfig {
  /** 权限模式 */
  mode: PermissionMode;
  /** 工具白名单 */
  allowedTools?: string[];
  /** 工具黑名单 */
  disallowedTools?: string[];
  /** 危险模式：跳过所有权限检查 */
  allowDangerouslySkipPermissions?: boolean;
  /** 命令白名单（自动批准的 bash 命令） */
  allowedCommands?: string[];
  /** 命令黑名单（始终拒绝的 bash 命令） */
  disallowedCommands?: string[];
}

/**
 * 权限请求记录
 */
export interface PermissionRecord {
  /** 时间戳 */
  timestamp: Date;
  /** 工具名称 */
  tool: string;
  /** 工具参数 */
  args: Record<string, unknown>;
  /** 是否批准 */
  approved: boolean;
  /** 会话 ID */
  sessionId: string;
}

/**
 * 权限管理器类
 *
 * 负责管理工具执行权限，创建 SDK 兼容的权限处理函数
 */
export class PermissionManager {
  /** 权限配置 */
  private config: PermissionConfig;
  /** 工具注册表 */
  private toolRegistry: ToolRegistry;
  /** 用户确认回调 */
  private promptUserCallback?: PromptUserCallback;
  /** 权限请求历史 */
  private permissionHistory: PermissionRecord[] = [];
  /** 最大历史记录数 */
  private readonly maxHistorySize = 100;

  constructor(
    config: PermissionConfig,
    toolRegistry?: ToolRegistry,
    promptUserCallback?: PromptUserCallback
  ) {
    this.config = { ...config };
    this.toolRegistry = toolRegistry || new ToolRegistry();
    this.promptUserCallback = promptUserCallback;
  }

  /**
   * 创建 SDK 兼容的权限处理函数
   *
   * @returns CanUseTool 函数
   */
  createCanUseToolHandler(): CanUseTool {
    return async ({ tool, args, context }: ToolUseParams): Promise<boolean> => {
      // 1. 检查黑名单
      if (this.config.disallowedTools?.includes(tool)) {
        this.recordPermission(tool, args, false, context.sessionId);
        return false;
      }

      // 2. 检查白名单（如果设置了白名单，则只允许白名单中的工具）
      if (this.config.allowedTools && this.config.allowedTools.length > 0) {
        if (!this.config.allowedTools.includes(tool)) {
          this.recordPermission(tool, args, false, context.sessionId);
          return false;
        }
      }

      // 3. 危险模式：跳过所有检查
      if (this.config.allowDangerouslySkipPermissions) {
        this.recordPermission(tool, args, true, context.sessionId);
        return true;
      }

      // 4. 检查 Bash 命令的白名单/黑名单
      if (tool === 'Bash' && args.command) {
        const command = String(args.command);

        // 检查命令黑名单
        if (this.isCommandDisallowed(command)) {
          this.recordPermission(tool, args, false, context.sessionId);
          return false;
        }

        // 检查命令白名单
        if (this.isCommandAllowed(command)) {
          this.recordPermission(tool, args, true, context.sessionId);
          return true;
        }
      }

      // 5. 根据权限模式决定
      const result = await this.checkPermissionByMode(tool, args, context);
      this.recordPermission(tool, args, result, context.sessionId);
      return result;
    };
  }

  /**
   * 根据权限模式检查权限
   */
  private async checkPermissionByMode(
    tool: string,
    args: Record<string, unknown>,
    _context: ToolUseContext
  ): Promise<boolean> {
    switch (this.config.mode) {
      case 'bypassPermissions':
        // 绕过所有权限检查
        return true;

      case 'acceptEdits':
        // 自动接受文件编辑，其他需要确认
        if (['Write', 'Edit'].includes(tool)) {
          return true;
        }
        return this.promptUserForTool(tool, args);

      case 'plan':
        // 计划模式：不执行任何工具
        return false;

      case 'default':
      default:
        // 默认模式：某些工具需要确认
        if (this.shouldPromptForTool(tool)) {
          return this.promptUserForTool(tool, args);
        }
        return true;
    }
  }

  /**
   * 判断是否需要用户确认
   *
   * @param tool 工具名称
   * @returns 是否需要确认
   */
  shouldPromptForTool(tool: string): boolean {
    // 使用工具注册表判断是否为危险工具
    return this.toolRegistry.isDangerousTool(tool);
  }

  /**
   * 请求用户确认
   *
   * @param tool 工具名称
   * @param args 工具参数
   * @returns 用户是否批准
   */
  async promptUser(tool: string, args: Record<string, unknown>): Promise<boolean> {
    if (!this.promptUserCallback) {
      // 如果没有设置回调，默认拒绝
      console.warn(`权限请求: ${tool}，但未设置用户确认回调，默认拒绝`);
      return false;
    }

    const message = this.formatPermissionRequest(tool, args);
    return this.promptUserCallback(message);
  }

  /**
   * 请求用户确认工具使用
   */
  private async promptUserForTool(tool: string, args: Record<string, unknown>): Promise<boolean> {
    return this.promptUser(tool, args);
  }

  /**
   * 格式化权限请求消息
   */
  private formatPermissionRequest(tool: string, args: Record<string, unknown>): string {
    switch (tool) {
      case 'Write':
        return `允许写入文件: ${args.path}?`;
      case 'Edit':
        return `允许编辑文件: ${args.path}?`;
      case 'Bash':
        return `允许执行命令: ${args.command}?`;
      case 'KillBash':
        return `允许终止命令: ${args.pid || '后台进程'}?`;
      case 'NotebookEdit':
        return `允许编辑 Notebook: ${args.path}?`;
      default:
        return `允许使用工具 ${tool}?`;
    }
  }

  /**
   * 检查命令是否在白名单中
   */
  private isCommandAllowed(command: string): boolean {
    if (!this.config.allowedCommands || this.config.allowedCommands.length === 0) {
      return false;
    }

    return this.config.allowedCommands.some((pattern) => {
      // 支持简单的通配符匹配
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(command);
      }
      // 精确匹配或前缀匹配
      return command === pattern || command.startsWith(pattern + ' ');
    });
  }

  /**
   * 检查命令是否在黑名单中
   */
  private isCommandDisallowed(command: string): boolean {
    if (!this.config.disallowedCommands || this.config.disallowedCommands.length === 0) {
      return false;
    }

    return this.config.disallowedCommands.some((pattern) => {
      // 支持简单的通配符匹配
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(command);
      }
      // 精确匹配或包含匹配
      return command === pattern || command.includes(pattern);
    });
  }

  /**
   * 记录权限请求
   */
  private recordPermission(
    tool: string,
    args: Record<string, unknown>,
    approved: boolean,
    sessionId: string
  ): void {
    const record: PermissionRecord = {
      timestamp: new Date(),
      tool,
      args,
      approved,
      sessionId,
    };

    this.permissionHistory.push(record);

    // 限制历史记录大小
    if (this.permissionHistory.length > this.maxHistorySize) {
      this.permissionHistory.shift();
    }
  }

  /**
   * 运行时修改权限模式
   *
   * @param mode 新的权限模式
   */
  setMode(mode: PermissionMode): void {
    this.config.mode = mode;
  }

  /**
   * 获取当前权限模式
   */
  getMode(): PermissionMode {
    return this.config.mode;
  }

  /**
   * 获取当前配置
   */
  getConfig(): Readonly<PermissionConfig> {
    return { ...this.config };
  }

  /**
   * 添加工具到白名单
   *
   * @param tool 工具名称
   */
  addToAllowedTools(tool: string): void {
    if (!this.config.allowedTools) {
      this.config.allowedTools = [];
    }
    if (!this.config.allowedTools.includes(tool)) {
      this.config.allowedTools.push(tool);
    }
  }

  /**
   * 从白名单移除工具
   *
   * @param tool 工具名称
   */
  removeFromAllowedTools(tool: string): void {
    if (this.config.allowedTools) {
      this.config.allowedTools = this.config.allowedTools.filter((t) => t !== tool);
    }
  }

  /**
   * 添加工具到黑名单
   *
   * @param tool 工具名称
   */
  addToDisallowedTools(tool: string): void {
    if (!this.config.disallowedTools) {
      this.config.disallowedTools = [];
    }
    if (!this.config.disallowedTools.includes(tool)) {
      this.config.disallowedTools.push(tool);
    }
  }

  /**
   * 从黑名单移除工具
   *
   * @param tool 工具名称
   */
  removeFromDisallowedTools(tool: string): void {
    if (this.config.disallowedTools) {
      this.config.disallowedTools = this.config.disallowedTools.filter((t) => t !== tool);
    }
  }

  /**
   * 添加命令到白名单
   *
   * @param command 命令或命令模式
   */
  addToAllowedCommands(command: string): void {
    if (!this.config.allowedCommands) {
      this.config.allowedCommands = [];
    }
    if (!this.config.allowedCommands.includes(command)) {
      this.config.allowedCommands.push(command);
    }
  }

  /**
   * 从命令白名单移除
   *
   * @param command 命令或命令模式
   */
  removeFromAllowedCommands(command: string): void {
    if (this.config.allowedCommands) {
      this.config.allowedCommands = this.config.allowedCommands.filter((c) => c !== command);
    }
  }

  /**
   * 添加命令到黑名单
   *
   * @param command 命令或命令模式
   */
  addToDisallowedCommands(command: string): void {
    if (!this.config.disallowedCommands) {
      this.config.disallowedCommands = [];
    }
    if (!this.config.disallowedCommands.includes(command)) {
      this.config.disallowedCommands.push(command);
    }
  }

  /**
   * 从命令黑名单移除
   *
   * @param command 命令或命令模式
   */
  removeFromDisallowedCommands(command: string): void {
    if (this.config.disallowedCommands) {
      this.config.disallowedCommands = this.config.disallowedCommands.filter((c) => c !== command);
    }
  }

  /**
   * 设置用户确认回调
   *
   * @param callback 回调函数
   */
  setPromptUserCallback(callback: PromptUserCallback): void {
    this.promptUserCallback = callback;
  }

  /**
   * 获取权限请求历史
   *
   * @param limit 返回的最大记录数
   * @returns 权限请求记录数组
   */
  getPermissionHistory(limit?: number): PermissionRecord[] {
    if (limit && limit > 0) {
      return this.permissionHistory.slice(-limit);
    }
    return [...this.permissionHistory];
  }

  /**
   * 清除权限请求历史
   */
  clearPermissionHistory(): void {
    this.permissionHistory = [];
  }

  /**
   * 检查工具是否被允许（不执行用户确认）
   *
   * @param tool 工具名称
   * @returns 是否被允许
   */
  isToolAllowed(tool: string): boolean {
    // 检查黑名单
    if (this.config.disallowedTools?.includes(tool)) {
      return false;
    }

    // 检查白名单
    if (this.config.allowedTools && this.config.allowedTools.length > 0) {
      return this.config.allowedTools.includes(tool);
    }

    // 默认允许
    return true;
  }

  /**
   * 创建默认权限配置
   */
  static createDefaultConfig(): PermissionConfig {
    return {
      mode: 'default',
      allowedTools: undefined,
      disallowedTools: undefined,
      allowDangerouslySkipPermissions: false,
      allowedCommands: [],
      disallowedCommands: [
        'rm -rf /',
        'rm -rf /*',
        'dd if=/dev/zero',
        'mkfs',
        ':(){:|:&};:', // fork bomb
      ],
    };
  }
}
