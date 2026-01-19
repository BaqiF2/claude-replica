/**
 * 文件功能：SDK 配置加载模块，负责加载项目级配置，构建 SDK Options
 *
 * 核心类：
 * - SDKConfigLoader: SDK 配置加载器核心类
 *
 * 核心方法：
 * - loadProjectConfig(): 加载项目级配置
 * - buildOptionsWithSettingSources(): 构建 SDK 兼容的选项对象
 * - loadClaudeMd(): 加载 CLAUDE.md 文件内容
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../logging/Logger';

/**
 * 钩子事件类型
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
 * 所有有效的钩子事件类型列表
 */
const VALID_HOOK_EVENTS: HookEvent[] = [
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
 * 有效的钩子类型
 */
const VALID_HOOK_TYPES = ['command', 'prompt', 'script'] as const;

/**
 * 权限模式
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

/**
 * 配置源类型
 */
export type SettingSource = 'user' | 'project' | 'local';

/**
 * 钩子定义（配置文件中的格式）
 */
export interface HookDefinition {
  type: 'command' | 'prompt' | 'script';
  command?: string;
  prompt?: string;
  script?: string;
}

/**
 * 钩子配置（配置文件中的格式）
 */
export interface HookConfig {
  matcher: string;
  hooks: HookDefinition[];
}

/**
 * 钩子上下文
 */
export interface HookContext {
  event: HookEvent;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: Error;
  sessionId?: string;
  messageUuid?: string;
}

/**
 * 钩子回调匹配器（SDK 格式）
 */
export interface HookCallbackMatcher {
  matcher: string | RegExp;
  callback: (context: HookContext) => void | Promise<void>;
}

/**
 * MCP 服务器配置 - stdio 传输
 */
export interface McpStdioServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * MCP 服务器配置 - SSE 传输
 */
export interface McpSSEServerConfig {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

/**
 * MCP 服务器配置 - HTTP 传输
 */
export interface McpHttpServerConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

/**
 * MCP 服务器配置联合类型
 */
export type McpServerConfig = McpStdioServerConfig | McpSSEServerConfig | McpHttpServerConfig;

/**
 * 子代理定义
 */
export interface AgentDefinition {
  description: string;
  prompt: string;
  tools?: string[];
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
}

/**
 * 网络沙箱设置
 */
export interface NetworkSandboxSettings {
  allowedDomains?: string[];
  blockedDomains?: string[];
}

/**
 * 沙箱违规忽略设置
 */
export interface SandboxIgnoreViolations {
  network?: boolean;
  filesystem?: boolean;
}

/**
 * 沙箱设置
 */
export interface SandboxSettings {
  enabled?: boolean;
  autoAllowBashIfSandboxed?: boolean;
  excludedCommands?: string[];
  allowUnsandboxedCommands?: boolean;
  network?: NetworkSandboxSettings;
  ignoreViolations?: SandboxIgnoreViolations;
  enableWeakerNestedSandbox?: boolean;
}

/**
 * SDK Options 接口（部分）
 */
export interface SDKOptions {
  model?: string;
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string };
  allowedTools?: string[];
  disallowedTools?: string[];
  tools?: string[] | { type: 'preset'; preset: 'claude_code' };
  cwd?: string;
  permissionMode?: PermissionMode;
  mcpServers?: Record<string, McpServerConfig>;
  agents?: Record<string, AgentDefinition>;
  settingSources?: SettingSource[];
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
  maxTurns?: number;
  maxBudgetUsd?: number;
  maxThinkingTokens?: number;
  enableFileCheckpointing?: boolean;
  sandbox?: SandboxSettings;
}

/**
 * 项目配置接口
 */
export interface ProjectConfig {
  model?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  maxThinkingTokens?: number;
  allowedTools?: string[];
  disallowedTools?: string[];
  permissionMode?: PermissionMode;
  /** 存在旧版 settings.json 中的 mcpServers 字段时设为 true */
  legacyMcpServers?: boolean;
  agents?: Record<string, AgentDefinition>;
  hooks?: Partial<Record<HookEvent, HookConfig[]>>;
  sandbox?: SandboxSettings;
  projectName?: string;
}

/**
 * SDK 配置加载器
 *
 * 负责从项目目录加载配置
 */
export class SDKConfigLoader {
  constructor(private readonly logger: Logger) {}

  /**
   * 加载项目级配置
   *
   * 从 .claude/settings.json 读取配置
   *
   * @param workingDir - 工作目录路径
   * @returns 项目配置对象
   */
  async loadProjectConfig(workingDir: string): Promise<ProjectConfig> {
    const configPath = path.join(workingDir, '.claude', 'settings.json');

    if (!(await this.fileExists(configPath))) {
      return this.getDefaultProjectConfig();
    }

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return this.parseConfig(content);
    } catch (error) {
      await this.logger.warn('Unable to load project configuration', { configPath, error });
      return this.getDefaultProjectConfig();
    }
  }

  /**
   * 加载 CLAUDE.md 文件内容
   *
   * 按优先级搜索 CLAUDE.md 文件：
   * 1. 项目根目录的 CLAUDE.md
   * 2. .claude/CLAUDE.md
   *
   * @param workingDir - 工作目录路径
   * @returns CLAUDE.md 内容，如果不存在则返回 null
   */
  async loadClaudeMd(workingDir: string): Promise<string | null> {
    // 优先级：项目根目录 > .claude 目录
    const possiblePaths = [
      path.join(workingDir, 'CLAUDE.md'),
      path.join(workingDir, '.claude', 'CLAUDE.md'),
    ];

    for (const claudeMdPath of possiblePaths) {
      if (await this.fileExists(claudeMdPath)) {
        try {
          return await fs.readFile(claudeMdPath, 'utf-8');
        } catch (error) {
          await this.logger.warn('Unable to read CLAUDE.md', { claudeMdPath, error });
        }
      }
    }

    return null;
  }

  /**
   * 解析配置文件内容
   *
   * @param content - JSON 配置文件内容
   * @returns 解析后的配置对象
   */
  private parseConfig(content: string): ProjectConfig {
    const json = JSON.parse(content);
    const hasLegacyMcpServers = Object.prototype.hasOwnProperty.call(json, 'mcpServers');

    // Validate and parse hooks configuration
    const validatedHooks = this.validateAndParseHooks(json.hooks);

    return {
      ...this.getDefaultProjectConfig(),
      model: json.model,
      maxTurns: json.maxTurns,
      maxBudgetUsd: json.maxBudgetUsd,
      maxThinkingTokens: json.maxThinkingTokens,
      allowedTools: json.allowedTools,
      disallowedTools: json.disallowedTools,
      permissionMode: json.permissionMode,
      legacyMcpServers: hasLegacyMcpServers,
      agents: json.agents,
      hooks: validatedHooks,
      sandbox: json.sandbox,
    };
  }

  /**
   * 验证并解析 hooks 配置
   *
   * @param hooks - 原始 hooks 配置
   * @returns 验证后的 hooks 配置，无效配置返回 undefined
   */
  private validateAndParseHooks(
    hooks: unknown
  ): Partial<Record<HookEvent, HookConfig[]>> | undefined {
    // If hooks is not provided, return undefined
    if (hooks === undefined || hooks === null) {
      return undefined;
    }

    // If hooks is not an object, log warning and return undefined
    if (!this.isPlainObject(hooks)) {
      this.warn('Invalid hooks configuration: hooks must be an object');
      return undefined;
    }

    const result: Partial<Record<HookEvent, HookConfig[]>> = {};

    for (const [eventName, eventConfig] of Object.entries(hooks)) {
      // Check if event type is valid
      if (!VALID_HOOK_EVENTS.includes(eventName as HookEvent)) {
        this.warn(`Unknown hook event type: ${eventName}`, { eventName });
        continue;
      }

      // Check if event configuration is an array
      if (!Array.isArray(eventConfig)) {
        this.warn(`Invalid hooks configuration for event ${eventName}: event config must be an array`, {
          eventName,
        });
        continue;
      }

      // Validate and filter hook configurations
      const validConfigs: HookConfig[] = [];
      for (const config of eventConfig) {
        const validatedConfig = this.validateHookConfig(config, eventName);
        if (validatedConfig) {
          validConfigs.push(validatedConfig);
        }
      }

      if (validConfigs.length > 0) {
        result[eventName as HookEvent] = validConfigs;
      }
    }

    // Return undefined if no valid hooks found
    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * 验证单个 hook 配置项
   *
   * @param config - 原始 hook 配置
   * @param eventName - 事件名称（用于日志）
   * @returns 验证后的配置，无效返回 undefined
   */
  private validateHookConfig(config: unknown, eventName: string): HookConfig | undefined {
    if (!this.isPlainObject(config)) {
      this.warn(`Invalid hooks configuration for event ${eventName}: config must be an object`, {
        eventName,
      });
      return undefined;
    }

    const configObj = config;

    // Validate matcher field
    if (typeof configObj.matcher !== 'string') {
      this.warn(`Invalid hooks configuration for event ${eventName}: missing matcher field`, {
        eventName,
      });
      return undefined;
    }

    // Validate hooks field
    if (!Array.isArray(configObj.hooks)) {
      this.warn(`Invalid hooks configuration for event ${eventName}: hooks must be an array`, {
        eventName,
      });
      return undefined;
    }

    // Validate and filter hook definitions
    const validHooks: HookDefinition[] = [];
    for (const hookDef of configObj.hooks) {
      const validatedHook = this.validateHookDefinition(hookDef);
      if (validatedHook) {
        validHooks.push(validatedHook);
      }
    }

    if (validHooks.length === 0) {
      return undefined;
    }

    return {
      matcher: configObj.matcher,
      hooks: validHooks,
    };
  }

  /**
   * 验证单个 hook 定义
   *
   * @param hookDef - 原始 hook 定义
   * @returns 验证后的定义，无效返回 undefined
   */
  private validateHookDefinition(hookDef: unknown): HookDefinition | undefined {
    if (!this.isPlainObject(hookDef)) {
      this.warn('Invalid hook definition: must be an object');
      return undefined;
    }

    const def = hookDef as Record<string, unknown>;
    const hookType = def.type;

    // Validate type field using constant
    if (!VALID_HOOK_TYPES.includes(hookType as (typeof VALID_HOOK_TYPES)[number])) {
      this.warn('Invalid hook definition: unsupported type', {
        allowedTypes: VALID_HOOK_TYPES,
        receivedType: hookType,
      });
      return undefined;
    }

    // Validate required fields based on type
    const type = hookType as HookDefinition['type'];
    const requiredFieldMap: Record<HookDefinition['type'], keyof HookDefinition> = {
      command: 'command',
      prompt: 'prompt',
      script: 'script',
    };

    const requiredField = requiredFieldMap[type];
    const requiredValue = def[requiredField];
    if (typeof requiredValue !== 'string' || requiredValue.trim() === '') {
      this.warn(`Invalid hook definition: ${type} type requires ${requiredField} field`, {
        type,
        requiredField,
      });
      return undefined;
    }

    return {
      type,
      command:
        type === 'command' ? requiredValue : typeof def.command === 'string' ? def.command : undefined,
      prompt:
        type === 'prompt' ? requiredValue : typeof def.prompt === 'string' ? def.prompt : undefined,
      script:
        type === 'script' ? requiredValue : typeof def.script === 'string' ? def.script : undefined,
    };
  }

  /**
   * 检查值是否为普通对象（非数组、非 null）
   */
  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private warn(message: string, data?: Record<string, unknown>): void {
    void this.logger.warn(message, data);
    console.warn(message);
  }

  private getDefaultProjectConfig(): ProjectConfig {
    return {};
  }

  /**
   * 使用 SDK 的 settingSources 选项构建配置
   *
   * @param workingDir - 工作目录
   * @param sources - 配置源列表
   * @returns SDK Options
   */
  async buildOptionsWithSettingSources(
    workingDir: string,
    sources: SettingSource[] = ['project']
  ): Promise<Partial<SDKOptions>> {
    const additionalPrompt = await this.loadAdditionalPrompt(workingDir);

    return {
      // 使用 settingSources 让 SDK 自动加载配置
      settingSources: sources,

      // 使用预设系统提示词（会自动包含 CLAUDE.md）
      systemPrompt: additionalPrompt
        ? {
            type: 'preset',
            preset: 'claude_code',
            append: additionalPrompt,
          }
        : {
            type: 'preset',
            preset: 'claude_code',
          },

      // 使用预设工具集
      tools: {
        type: 'preset',
        preset: 'claude_code',
      },

      // 工作目录
      cwd: workingDir,
    };
  }

  /**
   * 加载额外的系统提示词
   *
   * @param workingDir - 工作目录
   * @returns 额外提示词内容
   */
  private async loadAdditionalPrompt(workingDir: string): Promise<string | undefined> {
    const promptPath = path.join(workingDir, '.claude', 'additional-prompt.md');

    if (await this.fileExists(promptPath)) {
      try {
        return await fs.readFile(promptPath, 'utf-8');
      } catch {
        return undefined;
      }
    }

    return undefined;
  }

  /**
   * 检查文件是否存在
   *
   * @param filePath - 文件路径
   * @returns 文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
