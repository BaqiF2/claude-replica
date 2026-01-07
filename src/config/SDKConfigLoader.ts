/**
 * 文件功能：SDK 配置加载模块，负责加载和合并用户级、项目级配置，构建 SDK Options
 *
 * 核心类：
 * - SDKConfigLoader: SDK 配置加载器核心类
 *
 * 核心方法：
 * - loadUserConfig(): 加载用户级配置
 * - loadProjectConfig(): 加载项目级配置
 * - mergeConfigs(): 合并多个配置源
 * - buildSDKOptions(): 构建 SDK 兼容的选项对象
 * - loadClaudeMd(): 加载 CLAUDE.md 文件内容
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

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
  type: 'command' | 'prompt';
  command?: string;
  prompt?: string;
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
  transport: 'sse';
  url: string;
  headers?: Record<string, string>;
}

/**
 * MCP 服务器配置 - HTTP 传输
 */
export interface McpHttpServerConfig {
  transport: 'http';
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
 * 用户/项目配置接口（从配置文件加载的原始格式）
 */
export interface UserConfig {
  model?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  maxThinkingTokens?: number;
  allowedTools?: string[];
  disallowedTools?: string[];
  permissionMode?: PermissionMode;
  mcpServers?: Record<string, McpServerConfig>;
  agents?: Record<string, AgentDefinition>;
  hooks?: Partial<Record<HookEvent, HookConfig[]>>;
  sandbox?: SandboxSettings;
  enableFileCheckpointing?: boolean;
}

/**
 * 项目配置接口（扩展用户配置）
 */
export interface ProjectConfig extends UserConfig {
  projectName?: string;
}

/**
 * SDK 配置加载器
 *
 * 负责从用户目录和项目目录加载配置，并合并为可用的配置对象
 */
export class SDKConfigLoader {
  /** 用户配置目录 */
  private readonly userConfigDir: string;

  constructor() {
    // claude 配置目录
    this.userConfigDir = path.join(os.homedir(), '.claude');
  }

  /**
   * 加载完整配置
   *
   * @param workingDir - 工作目录路径
   * @returns 合并后的配置
   */
  async loadFullConfig(workingDir: string): Promise<UserConfig> {
    // 1. 加载用户级配置
    const userConfig = await this.loadUserConfig();

    // 2. 加载项目级配置
    const projectConfig = await this.loadProjectConfig(workingDir);

    // 3. 合并配置
    return this.mergeConfigs(userConfig, projectConfig);
  }

  /**
   * 加载用户级配置
   *
   * 从 ~/.claude/settings.json 读取配置
   *
   * @returns 用户配置对象
   */
  async loadUserConfig(): Promise<UserConfig> {
    const configPath = path.join(this.userConfigDir, 'settings.json');

    if (!(await this.fileExists(configPath))) {
      return {};
    }

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return this.parseConfig(content);
    } catch (error) {
      console.warn(`Warning: Unable to load user configuration ${configPath}:`, error);
      return {};
    }
  }

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
      return {};
    }

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return this.parseConfig(content);
    } catch (error) {
      console.warn(`Warning: Unable to load project configuration ${configPath}:`, error);
      return {};
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
          console.warn(`Warning: Unable to read CLAUDE.md ${claudeMdPath}:`, error);
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
  private parseConfig(content: string): UserConfig {
    const json = JSON.parse(content);

    return {
      model: json.model,
      maxTurns: json.maxTurns,
      maxBudgetUsd: json.maxBudgetUsd,
      maxThinkingTokens: json.maxThinkingTokens,
      allowedTools: json.allowedTools,
      disallowedTools: json.disallowedTools,
      permissionMode: json.permissionMode,
      mcpServers: json.mcpServers,
      agents: json.agents,
      hooks: json.hooks,
      sandbox: json.sandbox,
      enableFileCheckpointing: json.enableFileCheckpointing,
    };
  }

  /**
   * 合并配置
   *
   * 项目配置覆盖用户配置，遵循优先级规则
   *
   * @param userConfig - 用户配置
   * @param projectConfig - 项目配置
   * @returns 合并后的配置
   */
  mergeConfigs(userConfig: UserConfig, projectConfig: UserConfig): UserConfig {
    return {
      // 基本配置：项目覆盖用户
      model: projectConfig.model ?? userConfig.model,
      maxTurns: projectConfig.maxTurns ?? userConfig.maxTurns,
      maxBudgetUsd: projectConfig.maxBudgetUsd ?? userConfig.maxBudgetUsd,
      maxThinkingTokens: projectConfig.maxThinkingTokens ?? userConfig.maxThinkingTokens,
      permissionMode: projectConfig.permissionMode ?? userConfig.permissionMode,
      enableFileCheckpointing:
        projectConfig.enableFileCheckpointing ?? userConfig.enableFileCheckpointing,

      // 工具配置：项目配置优先，否则使用用户配置
      allowedTools: projectConfig.allowedTools ?? userConfig.allowedTools,

      // disallowedTools 合并（两者都禁用的工具）
      disallowedTools: this.mergeArrays(userConfig.disallowedTools, projectConfig.disallowedTools),

      // 对象类型深度合并
      mcpServers: this.mergeObjects(userConfig.mcpServers, projectConfig.mcpServers),

      agents: this.mergeObjects(userConfig.agents, projectConfig.agents),

      hooks: this.mergeHooks(userConfig.hooks, projectConfig.hooks),

      sandbox: this.mergeSandbox(userConfig.sandbox, projectConfig.sandbox),
    };
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
   * 合并数组（去重）
   *
   * @param arr1 - 第一个数组
   * @param arr2 - 第二个数组
   * @returns 合并后的数组
   */
  private mergeArrays(arr1?: string[], arr2?: string[]): string[] | undefined {
    if (!arr1 && !arr2) return undefined;
    const merged = new Set([...(arr1 || []), ...(arr2 || [])]);
    return Array.from(merged);
  }

  /**
   * 合并对象
   *
   * @param obj1 - 第一个对象
   * @param obj2 - 第二个对象
   * @returns 合并后的对象
   */
  private mergeObjects<T extends Record<string, unknown>>(obj1?: T, obj2?: T): T | undefined {
    if (!obj1 && !obj2) return undefined;
    return {
      ...obj1,
      ...obj2,
    } as T;
  }

  /**
   * 合并钩子配置
   *
   * @param userHooks - 用户钩子配置
   * @param projectHooks - 项目钩子配置
   * @returns 合并后的钩子配置
   */
  private mergeHooks(
    userHooks?: Partial<Record<HookEvent, HookConfig[]>>,
    projectHooks?: Partial<Record<HookEvent, HookConfig[]>>
  ): Partial<Record<HookEvent, HookConfig[]>> | undefined {
    if (!userHooks && !projectHooks) return undefined;

    const result: Partial<Record<HookEvent, HookConfig[]>> = {};

    // 获取所有钩子事件
    const allEvents = new Set([
      ...Object.keys(userHooks || {}),
      ...Object.keys(projectHooks || {}),
    ]) as Set<HookEvent>;

    for (const event of allEvents) {
      result[event] = [...(userHooks?.[event] || []), ...(projectHooks?.[event] || [])];
    }

    return result;
  }

  /**
   * 合并沙箱配置
   *
   * @param userSandbox - 用户沙箱配置
   * @param projectSandbox - 项目沙箱配置
   * @returns 合并后的沙箱配置
   */
  private mergeSandbox(
    userSandbox?: SandboxSettings,
    projectSandbox?: SandboxSettings
  ): SandboxSettings | undefined {
    if (!userSandbox && !projectSandbox) return undefined;

    return {
      ...userSandbox,
      ...projectSandbox,
      // 排除命令列表合并
      excludedCommands: this.mergeArrays(
        userSandbox?.excludedCommands,
        projectSandbox?.excludedCommands
      ),
      // 网络设置深度合并
      network: {
        ...userSandbox?.network,
        ...projectSandbox?.network,
        allowedDomains: this.mergeArrays(
          userSandbox?.network?.allowedDomains,
          projectSandbox?.network?.allowedDomains
        ),
        blockedDomains: this.mergeArrays(
          userSandbox?.network?.blockedDomains,
          projectSandbox?.network?.blockedDomains
        ),
      },
    };
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
