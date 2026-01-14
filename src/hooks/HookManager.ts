/**
 * 文件功能：钩子管理模块，管理和执行钩子操作，支持 12 种 SDK 钩子事件类型
 *
 * 核心类：
 * - HookManager: 钩子管理器核心类
 *
 * 核心方法：
 * - loadHooks(): 从配置加载钩子定义
 * - executeHooks(): 执行指定事件的钩子
 * - registerHook(): 注册新的钩子
 * - unregisterHook(): 取消注册钩子
 * - listHooks(): 列出所有已注册的钩子
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * SDK 支持的 12 种钩子事件类型
 */
export type HookEvent =
  | 'PreToolUse' // 工具使用前
  | 'PostToolUse' // 工具使用后
  | 'PostToolUseFailure' // 工具使用失败后
  | 'Notification' // 通知事件
  | 'UserPromptSubmit' // 用户提交提示词
  | 'SessionStart' // 会话开始
  | 'SessionEnd' // 会话结束
  | 'Stop' // 停止事件
  | 'SubagentStart' // 子代理开始
  | 'SubagentStop' // 子代理停止
  | 'PreCompact' // 压缩前
  | 'PermissionRequest'; // 权限请求

/**
 * 所有支持的钩子事件列表
 */
export const ALL_HOOK_EVENTS: HookEvent[] = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PermissionRequest',
];

/**
 * 钩子上下文 - 包含钩子执行时的相关信息
 */
export interface HookContext {
  /** 触发的事件类型 */
  event: HookEvent;
  /** 工具名称（工具相关事件） */
  tool?: string;
  /** 工具参数 */
  args?: Record<string, unknown>;
  /** 工具执行结果 */
  result?: unknown;
  /** 错误信息（失败事件） */
  error?: Error;
  /** 会话 ID */
  sessionId?: string;
  /** 消息 UUID */
  messageUuid?: string;
  /** 子代理名称（子代理相关事件） */
  agentName?: string;
  /** 通知消息（通知事件） */
  notification?: string;
}

/**
 * 钩子定义
 */
export interface Hook {
  /** 匹配器 - 用于匹配工具名称或其他条件 */
  matcher: string;
  /** 钩子类型 */
  type: 'command' | 'prompt';
  /** 要执行的命令（command 类型） */
  command?: string;
  /** 要发送的提示词（prompt 类型） */
  prompt?: string;
}

/**
 * 钩子匹配器配置
 */
export interface HookMatcher {
  /** 匹配器字符串（支持正则表达式） */
  matcher: string;
  /** 该匹配器下的钩子列表 */
  hooks: Hook[];
}

/**
 * 钩子配置 - 按事件类型组织
 */
export type HookConfig = Partial<Record<HookEvent, HookMatcher[]>>;

/**
 * SDK 格式的钩子回调匹配器
 */
export interface SDKHookCallbackMatcher {
  /** 匹配器 */
  matcher: string | RegExp;
  /** 回调函数 */
  callback: (context: HookContext) => void | Promise<void>;
}

/**
 * SDK 格式的钩子配置
 */
export type SDKHookConfig = Partial<Record<HookEvent, SDKHookCallbackMatcher[]>>;

/**
 * 钩子执行结果
 */
export interface HookExecutionResult {
  /** 是否成功 */
  success: boolean;
  /** 钩子类型 */
  type: 'command' | 'prompt';
  /** 输出内容 */
  output?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 提示词钩子处理器
 */
export type PromptHookHandler = (prompt: string, context: HookContext) => Promise<void>;

/**
 * HookManager 配置选项
 */
export interface HookManagerOptions {
  /** 工作目录 */
  workingDir?: string;
  /** 提示词钩子处理器 */
  promptHandler?: PromptHookHandler;
  /** 命令执行超时（毫秒） */
  commandTimeout?: number;
  /** 是否启用调试日志 */
  debug?: boolean;
}

/**
 * 钩子管理器
 *
 * 负责加载、管理和执行钩子操作。
 */
export class HookManager {
  private config: HookConfig = {};
  private workingDir: string;
  private promptHandler?: PromptHookHandler;
  private commandTimeout: number;
  private debug: boolean;

  constructor(options: HookManagerOptions = {}) {
    this.workingDir = options.workingDir || process.cwd();
    this.promptHandler = options.promptHandler;
    this.commandTimeout = options.commandTimeout || 30000; // 默认 30 秒
    this.debug = options.debug || false;
  }

  /**
   * 从配置加载钩子
   *
   * @param config 钩子配置
   */
  loadHooks(config: HookConfig): void {
    // 验证配置中的事件类型
    for (const event of Object.keys(config)) {
      if (!ALL_HOOK_EVENTS.includes(event as HookEvent)) {
        if (this.debug) {
          console.warn(`Unknown hook event type: ${event}`);
        }
        continue;
      }
    }

    this.config = { ...config };
  }

  /**
   * 获取当前钩子配置
   */
  getConfig(): HookConfig {
    return { ...this.config };
  }

  /**
   * 转换为 SDK 格式
   *
   * @returns SDK 格式的钩子配置
   */
  getHooksForSDK(): SDKHookConfig {
    const result: SDKHookConfig = {};

    for (const [event, matchers] of Object.entries(this.config)) {
      if (!matchers || matchers.length === 0) continue;

      result[event as HookEvent] = matchers.map((m) => ({
        matcher: m.matcher,
        callback: async (context: HookContext) => {
          await this.executeHooks(m.hooks, context);
        },
      }));
    }

    return result;
  }

  /**
   * 执行钩子列表
   *
   * @param hooks 钩子列表
   * @param context 钩子上下文
   * @returns 执行结果列表
   */
  async executeHooks(hooks: Hook[], context: HookContext): Promise<HookExecutionResult[]> {
    const results: HookExecutionResult[] = [];

    for (const hook of hooks) {
      try {
        // 检查匹配器是否匹配
        if (!this.matchesContext(hook.matcher, context)) {
          continue;
        }

        if (hook.type === 'command' && hook.command) {
          const result = await this.executeCommand(hook.command, context);
          results.push(result);
        } else if (hook.type === 'prompt' && hook.prompt) {
          const result = await this.executePrompt(hook.prompt, context);
          results.push(result);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (this.debug) {
          console.error(`Hook execution failed:`, error);
        }
        results.push({
          success: false,
          type: hook.type,
          error: errorMessage,
        });
      }
    }

    return results;
  }

  /**
   * 检查匹配器是否匹配上下文
   *
   * @param matcher 匹配器字符串
   * @param context 钩子上下文
   * @returns 是否匹配
   */
  private matchesContext(matcher: string, context: HookContext): boolean {
    // 如果匹配器是 .* 或空，则匹配所有
    if (matcher === '.*' || matcher === '' || matcher === '*') {
      return true;
    }

    // 根据事件类型确定要匹配的值
    let valueToMatch: string | undefined;

    switch (context.event) {
      case 'PreToolUse':
      case 'PostToolUse':
      case 'PostToolUseFailure':
        valueToMatch = context.tool;
        break;
      case 'SubagentStart':
      case 'SubagentStop':
        valueToMatch = context.agentName;
        break;
      case 'Notification':
        valueToMatch = context.notification;
        break;
      default:
        // 对于其他事件，使用事件名称本身
        valueToMatch = context.event;
    }

    if (!valueToMatch) {
      return false;
    }

    // 尝试作为正则表达式匹配
    try {
      const regex = new RegExp(matcher, 'i');
      return regex.test(valueToMatch);
    } catch {
      // 如果不是有效的正则表达式，则进行简单的字符串匹配
      return valueToMatch.toLowerCase().includes(matcher.toLowerCase());
    }
  }

  /**
   * 执行命令类型钩子
   *
   * @param command 命令字符串
   * @param context 钩子上下文
   * @returns 执行结果
   */
  async executeCommand(command: string, context: HookContext): Promise<HookExecutionResult> {
    // 替换命令中的变量
    const expandedCommand = this.expandVariables(command, context);

    try {
      const { stdout, stderr } = await execAsync(expandedCommand, {
        cwd: this.workingDir,
        timeout: this.commandTimeout,
      });

      return {
        success: true,
        type: 'command',
        output: stdout || stderr,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        type: 'command',
        error: errorMessage,
      };
    }
  }

  /**
   * 执行提示词类型钩子
   *
   * @param prompt 提示词字符串
   * @param context 钩子上下文
   * @returns 执行结果
   */
  async executePrompt(prompt: string, context: HookContext): Promise<HookExecutionResult> {
    // 替换提示词中的变量
    const expandedPrompt = this.expandVariables(prompt, context);

    if (this.promptHandler) {
      try {
        await this.promptHandler(expandedPrompt, context);
        return {
          success: true,
          type: 'prompt',
          output: expandedPrompt,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          type: 'prompt',
          error: errorMessage,
        };
      }
    }

    // 如果没有提示词处理器，只记录日志
    if (this.debug) {
      console.log('Executing prompt hook:', expandedPrompt);
    }

    return {
      success: true,
      type: 'prompt',
      output: expandedPrompt,
    };
  }

  /**
   * 变量替换
   *
   * 支持的变量:
   * - $TOOL: 工具名称
   * - $FILE: 文件路径（从 args.path 获取）
   * - $COMMAND: 命令（从 args.command 获取）
   * - $EVENT: 事件类型
   * - $SESSION_ID: 会话 ID
   * - $MESSAGE_UUID: 消息 UUID
   * - $AGENT: 子代理名称
   * - $ERROR: 错误信息
   *
   * @param template 模板字符串
   * @param context 钩子上下文
   * @returns 替换后的字符串
   */
  expandVariables(template: string, context: HookContext): string {
    return template
      .replace(/\$TOOL/g, context.tool || '')
      .replace(/\$FILE/g, String(context.args?.path || context.args?.file || ''))
      .replace(/\$COMMAND/g, String(context.args?.command || ''))
      .replace(/\$EVENT/g, context.event || '')
      .replace(/\$SESSION_ID/g, context.sessionId || '')
      .replace(/\$MESSAGE_UUID/g, context.messageUuid || '')
      .replace(/\$AGENT/g, context.agentName || '')
      .replace(/\$ERROR/g, context.error?.message || '');
  }

  /**
   * 添加钩子
   *
   * @param event 事件类型
   * @param matcher 匹配器
   * @param hook 钩子定义
   */
  addHook(event: HookEvent, matcher: string, hook: Hook): void {
    if (!ALL_HOOK_EVENTS.includes(event)) {
      throw new Error(`Unknown hook event type: ${event}`);
    }

    if (!this.config[event]) {
      this.config[event] = [];
    }

    const existing = this.config[event]!.find((m) => m.matcher === matcher);
    if (existing) {
      existing.hooks.push(hook);
    } else {
      this.config[event]!.push({ matcher, hooks: [hook] });
    }
  }

  /**
   * 移除钩子
   *
   * @param event 事件类型
   * @param matcher 匹配器（如果不提供，则移除该事件的所有钩子）
   */
  removeHook(event: HookEvent, matcher?: string): void {
    if (!this.config[event]) {
      return;
    }

    if (matcher === undefined) {
      // 移除该事件的所有钩子
      delete this.config[event];
    } else {
      // 移除指定匹配器的钩子
      this.config[event] = this.config[event]!.filter((m) => m.matcher !== matcher);
      if (this.config[event]!.length === 0) {
        delete this.config[event];
      }
    }
  }

  /**
   * 清除所有钩子配置
   */
  clear(): void {
    this.config = {};
  }

  /**
   * 设置提示词处理器
   *
   * @param handler 提示词处理器函数
   */
  setPromptHandler(handler: PromptHookHandler): void {
    this.promptHandler = handler;
  }

  /**
   * 设置工作目录
   *
   * @param dir 工作目录路径
   */
  setWorkingDir(dir: string): void {
    this.workingDir = dir;
  }

  /**
   * 触发钩子事件
   *
   * 这是一个便捷方法，用于触发指定事件的所有匹配钩子。
   *
   * @param event 事件类型
   * @param context 钩子上下文（不包含 event 字段，会自动添加）
   * @returns 执行结果列表
   */
  async triggerEvent(
    event: HookEvent,
    context: Omit<HookContext, 'event'>
  ): Promise<HookExecutionResult[]> {
    const fullContext: HookContext = { ...context, event };
    const matchers = this.config[event];

    if (!matchers || matchers.length === 0) {
      return [];
    }

    const allResults: HookExecutionResult[] = [];

    for (const matcher of matchers) {
      const results = await this.executeHooks(matcher.hooks, fullContext);
      allResults.push(...results);
    }

    return allResults;
  }

  /**
   * 验证钩子配置
   *
   * @param config 钩子配置
   * @returns 验证结果
   */
  static validateConfig(config: HookConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const [event, matchers] of Object.entries(config)) {
      // 检查事件类型
      if (!ALL_HOOK_EVENTS.includes(event as HookEvent)) {
        errors.push(`Unknown hook event type: ${event}`);
        continue;
      }

      if (!Array.isArray(matchers)) {
        errors.push(`Event ${event} config must be an array`);
        continue;
      }

      for (let i = 0; i < matchers.length; i++) {
        const matcher = matchers[i];

        if (typeof matcher.matcher !== 'string') {
          errors.push(`Event ${event} matcher ${i + 1} missing 'matcher' field`);
        }

        if (!Array.isArray(matcher.hooks)) {
          errors.push(`Event ${event} matcher ${i + 1} 'hooks' must be an array`);
          continue;
        }

        for (let j = 0; j < matcher.hooks.length; j++) {
          const hook = matcher.hooks[j];

          if (hook.type !== 'command' && hook.type !== 'prompt') {
            errors.push(
              `Event ${event} matcher ${i + 1} hook ${j + 1} has invalid type: ${hook.type}`
            );
          }

          if (hook.type === 'command' && !hook.command) {
            errors.push(
              `Event ${event} matcher ${i + 1} command hook ${j + 1} missing 'command' field`
            );
          }

          if (hook.type === 'prompt' && !hook.prompt) {
            errors.push(
              `Event ${event} matcher ${i + 1} prompt hook ${j + 1} missing 'prompt' field`
            );
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
