/**
 * 文件功能：权限管理模块，管理工具执行权限，支持多种权限模式
 *
 * 核心类：
 * - PermissionManager: 权限管理器核心类
 *
 * 核心方法：
 * - createCanUseToolHandler(): 创建 SDK 兼容的权限检查函数
 * - setMode(): 运行时修改权限模式
 * - getConfig(): 获取当前权限配置
 * - promptUser(): 提示用户确认危险操作（待重构）
 */

import { ToolRegistry } from '../tools/ToolRegistry';
import { PermissionUI } from './PermissionUI';
import { PermissionResult, SDKCanUseTool } from './types';

const MCP_TOOL_PREFIX = 'mcp__';
const MCP_TOOL_SEPARATOR = '__';
const MCP_TOOL_WILDCARD = '*';

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
 * 权限管理器类
 *
 * 负责管理工具执行权限，创建 SDK 兼容的权限处理函数
 */
export class PermissionManager {
  /** 权限配置 */
  private config: PermissionConfig;
  /** 工具注册表 */
  private toolRegistry: ToolRegistry;
  /** 权限 UI 接口 */
  private permissionUI: PermissionUI;

  constructor(
    config: PermissionConfig,
    permissionUI: PermissionUI,
    toolRegistry?: ToolRegistry
  ) {
    this.config = { ...config };
    this.permissionUI = permissionUI;
    this.toolRegistry = toolRegistry || new ToolRegistry();
  }

  /**
   * 创建 SDK 兼容的权限处理函数
   *
   * @returns SDKCanUseTool 函数
   */
  createCanUseToolHandler(): SDKCanUseTool {
    return async (
      toolName: string,
      input: unknown,
      options: { signal: AbortSignal; toolUseID: string }
    ): Promise<PermissionResult> => {
      const { signal, toolUseID } = options;

      // 1. 检查 signal.aborted
      if (signal.aborted) {
        return {
          behavior: 'deny',
          interrupt: true,
          message: 'Request aborted',
          toolUseID,
        };
      }

      // 2. 将 input 转换为 args 格式
      const args = (input as Record<string, unknown>) || {};

      // 3. 检查黑名单
      if (this.isToolInList(toolName, this.config.disallowedTools)) {
        return {
          behavior: 'deny',
          message: `Tool '${toolName}' is in disallowed list`,
          toolUseID,
        };
      }

      // 4. 检查白名单（如果设置了白名单，则只允许白名单中的工具）
      if (this.config.allowedTools && this.config.allowedTools.length > 0) {
        if (!this.isToolInList(toolName, this.config.allowedTools)) {
          return {
            behavior: 'deny',
            message: `Tool '${toolName}' is not in allowed list`,
            toolUseID,
          };
        }
      }

      // 5. 危险模式：跳过所有检查
      if (this.config.allowDangerouslySkipPermissions) {
        // AskUserQuestion 仍需特殊处理以收集用户输入
        if (toolName === 'AskUserQuestion') {
          return this.handleAskUserQuestion(input, options);
        }
        return {
          behavior: 'allow',
          updatedInput: args,
          toolUseID,
        };
      }

      // 6. 特殊处理 AskUserQuestion 工具（非 bypass 模式下）
      if (toolName === 'AskUserQuestion') {
        return this.handleAskUserQuestion(input, options);
      }

      // 7. 检查 Bash 命令的白名单/黑名单
      if (toolName === 'Bash' && args.command) {
        const command = String(args.command);

        // 检查命令黑名单
        if (this.isCommandDisallowed(command)) {
          return {
            behavior: 'deny',
            message: `Command '${command}' is disallowed`,
            toolUseID,
          };
        }

        // 检查命令白名单
        if (this.isCommandAllowed(command)) {
          return {
            behavior: 'allow',
            updatedInput: args,
            toolUseID,
          };
        }
      }

      // 8. 根据权限模式决定
      return this.checkPermissionByMode(toolName, args, toolUseID);
    };
  }

  /**
   * 根据权限模式检查权限
   */
  private async checkPermissionByMode(
    tool: string,
    args: Record<string, unknown>,
    toolUseID: string
  ): Promise<PermissionResult> {
    switch (this.config.mode) {
      case 'bypassPermissions':
        // 绕过所有权限检查
        return {
          behavior: 'allow',
          updatedInput: args,
          toolUseID,
        };

      case 'acceptEdits':
        // 自动接受文件编辑，其他需要确认
        if (['Write', 'Edit'].includes(tool)) {
          return {
            behavior: 'allow',
            updatedInput: args,
            toolUseID,
          };
        }
        return this.promptUserForTool(tool, args, toolUseID);

      case 'plan':
        // 计划模式：只允许只读工具（Read, Grep, Glob）和 ExitPlanMode
        if (['Read', 'Grep', 'Glob', 'ExitPlanMode'].includes(tool)) {
          return {
            behavior: 'allow',
            updatedInput: args,
            toolUseID,
          };
        }
        return {
          behavior: 'deny',
          message: 'Plan mode: tool execution disabled',
          toolUseID,
        };

      case 'default':
      default:
        // 默认模式：某些工具需要确认
        if (this.shouldPromptForTool(tool)) {
          return this.promptUserForTool(tool, args, toolUseID);
        }
        return {
          behavior: 'allow',
          updatedInput: args,
          toolUseID,
        };
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
   * 请求用户确认工具使用
   */
  private async promptUserForTool(
    tool: string,
    args: Record<string, unknown>,
    toolUseID: string
  ): Promise<PermissionResult> {
    const result = await this.permissionUI.promptToolPermission({
      toolName: tool,
      toolUseID,
      input: args,
      timestamp: new Date(),
    });

    if (result.approved) {
      return {
        behavior: 'allow',
        updatedInput: args,
        toolUseID,
      };
    } else {
      return {
        behavior: 'deny',
        message: result.reason || 'User denied permission',
        toolUseID,
      };
    }
  }

  /**
   * 处理 AskUserQuestion 工具
   */
  private async handleAskUserQuestion(
    input: unknown,
    options: { toolUseID: string; signal: AbortSignal }
  ): Promise<PermissionResult> {
    const { toolUseID } = options;

    // 提取问题列表
    const inputObj = input as { questions?: unknown[] };
    if (!inputObj.questions || !Array.isArray(inputObj.questions)) {
      return {
        behavior: 'deny',
        message: 'Invalid AskUserQuestion input: missing questions array',
        toolUseID,
      };
    }

    try {
      // 调用 UI 层收集用户答案
      const answers = await this.permissionUI.promptUserQuestions(inputObj.questions as any);

      // 构建 PermissionResult with updatedInput
      return {
        behavior: 'allow',
        updatedInput: {
          questions: inputObj.questions,
          answers,
        },
        toolUseID,
      };
    } catch (error) {
      return {
        behavior: 'deny',
        message: error instanceof Error ? error.message : 'User canceled AskUserQuestion',
        toolUseID,
      };
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

  private isToolInList(tool: string, list?: string[]): boolean {
    if (!list || list.length === 0) {
      return false;
    }

    const keys = this.getToolPermissionKeys(tool);
    return keys.some((key) => list.includes(key));
  }

  private getToolPermissionKeys(tool: string): string[] {
    const mcpParts = this.parseMcpToolName(tool);
    if (!mcpParts) {
      return [tool];
    }

    const moduleKey = this.buildMcpModuleKey(mcpParts.server);
    return [tool, moduleKey, `${moduleKey}${MCP_TOOL_SEPARATOR}${MCP_TOOL_WILDCARD}`];
  }

  private parseMcpToolName(tool: string): { server: string; tool: string } | null {
    if (!tool.startsWith(MCP_TOOL_PREFIX)) {
      return null;
    }

    const remainder = tool.slice(MCP_TOOL_PREFIX.length);
    const separatorIndex = remainder.indexOf(MCP_TOOL_SEPARATOR);
    if (separatorIndex <= 0) {
      return null;
    }

    const server = remainder.slice(0, separatorIndex);
    const toolName = remainder.slice(separatorIndex + MCP_TOOL_SEPARATOR.length);
    if (!toolName) {
      return null;
    }

    return { server, tool: toolName };
  }

  private buildMcpModuleKey(server: string): string {
    return `${MCP_TOOL_PREFIX}${server}`;
  }
}
