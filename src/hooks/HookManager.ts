/**
 * 文件功能：钩子管理模块，管理和执行钩子操作，支持 12 种 SDK 钩子事件类型
 *
 * 作用说明：集中加载钩子配置、转换为 SDK 回调，并按事件执行命令/脚本/提示词钩子。
 *
 * 核心导出：
 * - HookManager
 * - HookEvent
 * - HookConfig
 * - HookContext
 * - ALL_HOOK_EVENTS
 * - DEFAULT_SCRIPT_ALLOWED_PATHS
 *
 * 核心类：
 * - HookManager: 钩子管理器核心类
 *
 * 核心方法：
 * - loadHooks(): 从配置加载钩子定义
 * - executeHooks(): 执行指定事件的钩子
 * - executeCommand(): 执行命令类型钩子
 * - executeScript(): 执行脚本类型钩子
 * - executePrompt(): 执行提示词类型钩子
 * - createSDKCallback(): 为单个钩子创建 SDK 回调函数
 * - expandVariables(): 变量替换（HookContext）
 * - expandVariablesFromSDKInput(): 变量替换（SDK HookInput）
 * - getHooksForSDK(): 转换为 SDK 格式
 * - validateConfig(): 验证钩子配置
 * - validateScriptPath(): 验证脚本路径是否在白名单内
 * - getDefaultScriptAllowedPaths(): 获取默认的脚本允许路径
 *
 * 核心常量：
 * - ALL_HOOK_EVENTS: 所有 12 种钩子事件列表
 * - DEFAULT_SCRIPT_ALLOWED_PATHS: 默认脚本允许路径白名单
 *
 * 核心接口：
 * - HookEvent: SDK 支持的 12 种钩子事件类型
 * - HookContext: 钩子执行时的上下文信息
 * - HookInput: SDK 传入的钩子输入数据
 * - HookJSONOutput: 钩子返回给 SDK 的输出数据
 * - Hook: 钩子定义（command/prompt/script）
 * - HookConfig: 钩子配置
 * - ScriptPathValidationResult: 脚本路径验证结果
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { Logger } from '../logging/Logger';

const execAsync = promisify(exec);
const requireModule = createRequire(__filename);
const dynamicImport = new Function(
  'specifier',
  'return import(specifier)'
) as (specifier: string) => Promise<unknown>;

// Configuration constants
const HOOKS_CONFIG_FILENAME = 'hooks.json';
const GIT_DIRECTORY_NAME = '.git';

/** Default command execution timeout in milliseconds */
const DEFAULT_COMMAND_TIMEOUT_MS = parseInt(process.env.HOOK_COMMAND_TIMEOUT_MS || '30000', 10);

/**
 * Default script allowed paths for hook scripts
 * These are relative to the project working directory
 */
export const DEFAULT_SCRIPT_ALLOWED_PATHS = ['./.claude/hooks', './hooks'];

/**
 * Script path validation result
 */
export interface ScriptPathValidationResult {
  /** Whether the path is valid and within allowed directories */
  valid: boolean;
  /** The resolved absolute path (if valid) */
  resolvedPath?: string;
  /** Error message (if invalid) */
  error?: string;
}

/**
 * SDK 支持的 12 种钩子事件类型
 *
 * - PreToolUse: 工具使用前触发
 * - PostToolUse: 工具使用成功后触发
 * - PostToolUseFailure: 工具使用失败后触发
 * - UserPromptSubmit: 用户提交提示词时触发
 * - SessionStart: 会话开始时触发
 * - SessionEnd: 会话结束时触发
 * - Stop: 会话停止时触发
 * - SubagentStart: 子代理启动时触发
 * - SubagentStop: 子代理停止时触发
 * - PreCompact: 上下文压缩前触发
 * - PermissionRequest: 权限请求时触发
 * - Notification: 通知事件触发
 */
export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Notification'
  | 'UserPromptSubmit'
  | 'SessionStart'
  | 'SessionEnd'
  | 'Stop'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact'
  | 'PermissionRequest';

/**
 * 所有支持的钩子事件列表（12 种）
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
  type: 'command' | 'prompt' | 'script';
  /** 要执行的命令（command 类型） */
  command?: string;
  /** 要发送的提示词（prompt 类型） */
  prompt?: string;
  /** 脚本文件路径（script 类型） */
  script?: string;
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
  type: 'command' | 'prompt' | 'script';
  /** 输出内容 */
  output?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * SDK HookInput 接口 - 从 SDK 传入的钩子输入数据
 */
export interface HookInput {
  /** 钩子事件名称 */
  hook_event_name: HookEvent;
  /** 工具名称 */
  tool_name?: string;
  /** 工具输入参数 */
  tool_input?: Record<string, unknown>;
  /** 当前工作目录 */
  cwd: string;
  /** 会话 ID */
  session_id?: string;
  /** 消息 UUID */
  message_uuid?: string;
}

/**
 * SDK HookJSONOutput 接口 - 钩子返回给 SDK 的输出数据
 */
export interface HookJSONOutput {
  /** 是否继续执行 */
  continue?: boolean;
  /** 决策：阻止或允许 */
  decision?: 'block' | 'allow';
  /** 决策原因 */
  reason?: string;
  /** 系统消息 */
  systemMessage?: string;
  /** 钩子特定输出 */
  hookSpecificOutput?: {
    hookEventName?: string;
    permissionDecision?: 'allow' | 'deny';
    permissionDecisionReason?: string;
    updatedInput?: Record<string, unknown>;
  };
  /** 内部字段：标记执行过程中是否发生错误（不影响 continue 字段） */
  _executionError?: boolean;
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
  /** 日志记录器 */
  logger?: Logger;
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
  private logger?: Logger;

  constructor(options: HookManagerOptions = {}) {
    this.workingDir = options.workingDir || process.cwd();
    this.promptHandler = options.promptHandler;
    this.commandTimeout = options.commandTimeout || DEFAULT_COMMAND_TIMEOUT_MS;
    this.debug = options.debug || false;
    this.logger = options.logger;
  }

  /**
   * 从配置加载钩子
   *
   * @param config 钩子配置
   */
  loadHooks(config: HookConfig): void {
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
        } else if (hook.type === 'script' && hook.script) {
          const hookInput = this.contextToHookInput(context);
          const scriptResult = await this.executeScript(
            hook.script,
            hookInput,
            context.messageUuid,
            new AbortController().signal
          );
          results.push({
            success: scriptResult.continue !== false && !scriptResult._executionError,
            type: 'script',
            output: scriptResult.systemMessage,
            error: scriptResult._executionError ? 'Script execution failed' : undefined,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (this.debug) {
          void this.logger?.error('Hook execution failed', {
            hookType: hook.type,
            matcher: hook.matcher,
            event: context.event,
            error: errorMessage,
          });
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
      void this.logger?.debug('Executing prompt hook', { prompt: expandedPrompt });
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
   * - $FILE: 文件路径（从 args.path 或 args.file 获取）
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
    // Build variable mapping for better readability
    const variables: Record<string, string> = {
      TOOL: context.tool || '',
      FILE: String(context.args?.path || context.args?.file || ''),
      COMMAND: String(context.args?.command || ''),
      EVENT: context.event || '',
      SESSION_ID: context.sessionId || '',
      MESSAGE_UUID: context.messageUuid || '',
      AGENT: context.agentName || '',
      ERROR: context.error?.message || '',
    };

    // Replace all variables in template
    return Object.entries(variables).reduce(
      (result, [key, value]) => result.replace(new RegExp(`\\$${key}`, 'g'), value),
      template
    );
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

          if (hook.type !== 'command' && hook.type !== 'prompt' && hook.type !== 'script') {
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

          if (hook.type === 'script' && !hook.script) {
            errors.push(
              `Event ${event} matcher ${i + 1} script hook ${j + 1} missing 'script' field`
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

  /**
   * 从项目根目录加载钩子配置
   *
   * @param workingDir 当前工作目录
   */
  async loadFromProjectRoot(workingDir: string): Promise<void> {
    const configPath = await this.getConfigPath(workingDir);
    if (!(await this.pathExists(configPath))) {
      // 如果文件不存在，清空现有配置
      this.config = {};
      return;
    }
    await this.loadFromFile(configPath);
  }

  /**
   * 获取项目根目录下的钩子配置路径
   *
   * @param workingDir 当前工作目录
   * @returns 钩子配置文件路径
   */
  async getConfigPath(workingDir: string): Promise<string> {
    const projectRoot = await this.findProjectRoot(workingDir);
    return path.join(projectRoot, '.claude', HOOKS_CONFIG_FILENAME);
  }

  /**
   * 从文件加载钩子配置
   *
   * @param configPath 配置文件路径
   */
  async loadFromFile(configPath: string): Promise<void> {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(content);

      // 验证配置格式
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Hooks configuration must be an object');
      }

      this.loadHooks(parsed as HookConfig);
    } catch (error) {
      // 如果读取失败，记录错误但不抛出，保持应用启动
      if (this.debug) {
        void this.logger?.error('Failed to load hooks from config file', {
          configPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      // 清空配置以防加载了部分配置
      this.config = {};
    }
  }

  /**
   * 查找项目根目录（向上查找 .git 目录）
   *
   * @param workingDir 当前工作目录
   * @returns 项目根目录路径
   */
  private async findProjectRoot(workingDir: string): Promise<string> {
    const resolvedWorkingDir = path.resolve(workingDir);
    let currentDir = resolvedWorkingDir;

    for (;;) {
      const gitPath = path.join(currentDir, GIT_DIRECTORY_NAME);
      try {
        await fs.stat(gitPath);
        return currentDir;
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code && err.code !== 'ENOENT') {
          throw error;
        }
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        return resolvedWorkingDir;
      }
      currentDir = parentDir;
    }
  }

  /**
   * 检查文件路径是否存在
   *
   * @param filePath 文件路径
   * @returns 是否存在
   */
  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 将 HookContext 转换为 HookInput
   *
   * @param context 钩子上下文
   * @returns SDK HookInput 对象
   */
  private contextToHookInput(context: HookContext): HookInput {
    return {
      hook_event_name: context.event,
      tool_name: context.tool,
      tool_input: context.args,
      cwd: this.workingDir,
      session_id: context.sessionId,
      message_uuid: context.messageUuid,
    };
  }

  /**
   * 验证脚本路径是否在允许的白名单目录内
   *
   * @param scriptPath 脚本路径（相对或绝对）
   * @param allowedPaths 允许的路径列表（相对于 cwd）
   * @param cwd 当前工作目录
   * @returns 验证结果
   */
  validateScriptPath(
    scriptPath: string,
    allowedPaths: string[],
    cwd: string
  ): ScriptPathValidationResult {
    // Reject empty script path
    if (!scriptPath || scriptPath.trim() === '') {
      return {
        valid: false,
        error: 'Script path is empty',
      };
    }

    // Resolve the script path to absolute and normalize
    const resolvedPath = this.resolveAndNormalizePath(scriptPath, cwd);

    // Check if the resolved path is within any of the allowed directories
    for (const allowedPath of allowedPaths) {
      if (this.isPathWithinDirectory(resolvedPath, allowedPath, cwd)) {
        return {
          valid: true,
          resolvedPath,
        };
      }
    }

    return {
      valid: false,
      error: `Script path "${scriptPath}" is not in allowed paths: ${allowedPaths.join(', ')}`,
    };
  }

  /**
   * Resolve and normalize a path
   *
   * @param inputPath Path to resolve (relative or absolute)
   * @param cwd Current working directory for relative paths
   * @returns Normalized absolute path
   */
  private resolveAndNormalizePath(inputPath: string, cwd: string): string {
    return path.isAbsolute(inputPath)
      ? path.normalize(inputPath)
      : path.normalize(path.join(cwd, inputPath));
  }

  /**
   * Check if a path is within a directory
   *
   * @param targetPath Path to check
   * @param directory Directory to check against (relative or absolute)
   * @param cwd Current working directory for relative paths
   * @returns Whether targetPath is within directory
   */
  private isPathWithinDirectory(targetPath: string, directory: string, cwd: string): boolean {
    // Resolve the directory to absolute
    const absoluteDir = this.resolveAndNormalizePath(directory, cwd);

    // Check if target path is exactly the directory or starts with directory + separator
    // Adding path.sep ensures we match directory boundaries, not partial names
    const dirWithSep = absoluteDir.endsWith(path.sep) ? absoluteDir : absoluteDir + path.sep;

    return targetPath === absoluteDir || targetPath.startsWith(dirWithSep);
  }

  /**
   * 获取默认的脚本允许路径
   *
   * @returns 默认允许路径列表
   */
  getDefaultScriptAllowedPaths(): string[] {
    return DEFAULT_SCRIPT_ALLOWED_PATHS;
  }

  /**
   * 执行脚本类型钩子
   *
   * 动态加载 JS/TS 模块，调用导出函数，返回完整的 SDK HookJSONOutput 对象。
   * 如果脚本不存在或执行失败，返回 { continue: true } 不阻止流程。
   *
   * @param scriptPath 脚本文件路径（相对或绝对）
   * @param context SDK HookInput 上下文
   * @param toolUseID 工具使用 ID
   * @param signal 中止信号
   * @param allowedPaths 可选的允许路径列表，用于白名单验证
   * @returns HookJSONOutput 对象
   */
  async executeScript(
    scriptPath: string,
    context: HookInput,
    toolUseID: string | undefined,
    signal: AbortSignal,
    allowedPaths?: string[]
  ): Promise<HookJSONOutput> {
    const cwd = context.cwd || this.workingDir;

    // Validate script path against whitelist if provided
    if (allowedPaths) {
      const validation = this.validateScriptPath(scriptPath, allowedPaths, cwd);
      if (!validation.valid) {
        if (this.debug) {
          void this.logger?.error('Hook script path validation failed', {
            scriptPath,
            error: validation.error,
          });
        }
        return { continue: true, reason: validation.error };
      }
    }

    // Resolve path (relative paths based on cwd)
    const absolutePath = path.isAbsolute(scriptPath)
      ? scriptPath
      : path.join(cwd, scriptPath);

    // Check if file exists
    if (!(await this.pathExists(absolutePath))) {
      if (this.debug) {
        void this.logger?.error('Hook script not found', { absolutePath });
      }
      return { continue: true, _executionError: true };
    }

    try {
      // Dynamically load module
      let loadedModule: unknown;
      try {
        loadedModule = requireModule(absolutePath);
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err && err.code === 'ERR_REQUIRE_ESM') {
          loadedModule = await dynamicImport(pathToFileURL(absolutePath).href);
        } else {
          throw error;
        }
      }

      const module = loadedModule as { default?: unknown; hook?: unknown };
      const hookFunction = module.default || module.hook || loadedModule;

      if (typeof hookFunction !== 'function') {
        if (this.debug) {
          void this.logger?.error('Hook script must export a default function', { absolutePath });
        }
        return { continue: true, _executionError: true };
      }

      // Call the hook function
      const result = await hookFunction(context, toolUseID, { signal });
      return result || { continue: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (this.debug) {
        void this.logger?.error('Hook script execution failed', {
          scriptPath: absolutePath,
          eventName: context.hook_event_name,
          toolName: context.tool_name,
          error: errorMessage,
        });
      }
      // Return continue: true on error to not block the flow
      return { continue: true, _executionError: true };
    }
  }

  /**
   * 为单个钩子创建 SDK 回调函数
   *
   * 根据钩子类型（command、prompt、script）创建相应的回调函数。
   *
   * @param hook 钩子定义
   * @returns SDK 回调函数
   */
  createSDKCallback(hook: Hook): (context: HookContext) => void | Promise<void> {
    return async (context: HookContext) => {
      if (hook.type === 'command' && hook.command) {
        await this.executeCommand(hook.command, context);
      } else if (hook.type === 'prompt' && hook.prompt) {
        await this.executePrompt(hook.prompt, context);
      } else if (hook.type === 'script' && hook.script) {
        const hookInput = this.contextToHookInput(context);
        await this.executeScript(
          hook.script,
          hookInput,
          context.messageUuid,
          new AbortController().signal
        );
      }
    };
  }

  /**
   * 从 SDK HookInput 扩展变量
   *
   * 支持的变量:
   * - $TOOL: 工具名称 (tool_name)
   * - $FILE: 文件路径（从 tool_input.file_path 或 tool_input.path 获取）
   * - $COMMAND: 命令（从 tool_input.command 获取）
   * - $CWD: 当前工作目录
   * - $SESSION_ID: 会话 ID
   * - $MESSAGE_UUID: 消息 UUID
   *
   * @param template 模板字符串
   * @param input SDK HookInput 上下文
   * @returns 替换后的字符串
   */
  expandVariablesFromSDKInput(template: string, input: HookInput): string {
    // Build variable mapping for better readability
    const variables: Record<string, string> = {
      TOOL: input.tool_name || '',
      FILE: String(input.tool_input?.file_path || input.tool_input?.path || ''),
      COMMAND: String(input.tool_input?.command || ''),
      CWD: input.cwd || '',
      SESSION_ID: input.session_id || '',
      MESSAGE_UUID: input.message_uuid || '',
    };

    // Replace all variables in template
    return Object.entries(variables).reduce(
      (result, [key, value]) => result.replace(new RegExp(`\\$${key}`, 'g'), value),
      template
    );
  }
}
