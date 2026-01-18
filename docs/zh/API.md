# Claude Replica API 文档

本文档详细介绍 Claude Replica 的编程 API，供开发者在自己的项目中集成使用。

## 目录

- [安装](#安装)
- [快速开始](#快速开始)
- [核心 API](#核心-api)
  - [Application](#application)
  - [SessionManager](#sessionmanager)
  - [MessageRouter](#messagerouter)
- [配置 API](#配置-api)
  - [ConfigManager](#configmanager)
  - [SDKConfigLoader](#sdkconfigloader)
- [工具 API](#工具-api)
  - [ToolRegistry](#toolregistry)
  - [PermissionManager](#permissionmanager)
- [扩展 API](#扩展-api)
  - [CommandManager](#commandmanager)
  - [AgentRegistry](#agentregistry)
  - [HookManager](#hookmanager)
- [集成 API](#集成-api)
  - [MCPManager](#mcpmanager)
  - [RewindManager](#rewindmanager)
  - [PluginManager](#pluginmanager)
- [UI API](#ui-api)
  - [TerminalInteractiveUI](#terminalinteractiveui)
  - [OutputFormatter](#outputformatter)
- [类型定义](#类型定义)

## 安装

```bash
npm install claude-replica
```

## 快速开始

```typescript
import { Application, main } from 'claude-replica';

// 方式 1: 使用 main 函数
const exitCode = await main(['-p', '你好，请介绍一下自己']);

// 方式 2: 使用 Application 类
const app = new Application();
const exitCode = await app.run(['-p', '分析这段代码']);
```

## 核心 API

### Application

主应用程序类，负责初始化和运行整个应用。

```typescript
import { Application } from 'claude-replica';

const app = new Application();

// 运行应用程序
const exitCode = await app.run(args: string[]): Promise<number>;
```

### SessionManager

会话管理器，负责创建、保存和恢复会话。

```typescript
import { SessionManager, Session } from 'claude-replica';

const sessionManager = new SessionManager();

// 创建新会话
const session = await sessionManager.createSession(
  workingDir: string,
  projectConfig?: ProjectConfig,
  userConfig?: UserConfig
): Promise<Session>;

// 加载会话
const session = await sessionManager.loadSession(
  sessionId: string
): Promise<Session | null>;

// 保存会话
await sessionManager.saveSession(session: Session): Promise<void>;

// 列出所有会话
const sessions = await sessionManager.listSessions(): Promise<Session[]>;

// 获取最近的会话
const recentSession = await sessionManager.getRecentSession(): Promise<Session | null>;

// 清理过期会话
await sessionManager.cleanSessions(olderThan: Date): Promise<void>;

// 添加消息到会话
await sessionManager.addMessage(
  session: Session,
  message: { role: string; content: string }
): Promise<void>;
```

#### Session 接口

```typescript
interface Session {
  id: string;
  createdAt: Date;
  lastAccessedAt: Date;
  messages: Message[];
  context: SessionContext;
  expired: boolean;
  workingDirectory: string;
}

interface SessionContext {
  workingDirectory: string;
  projectConfig: ProjectConfig;
  userConfig: UserConfig;
  activeAgents: Agent[];
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
  timestamp: Date;
}
```

### MessageRouter

消息路由器，负责处理用户消息并调用 SDK。

```typescript
import { MessageRouter, MessageRouterOptions } from 'claude-replica';

const router = new MessageRouter(options: MessageRouterOptions);

// 路由消息
const queryResult = await router.routeMessage(
  message: Message,
  session: Session
): Promise<QueryResult>;
```

#### MessageRouterOptions 接口

```typescript
interface MessageRouterOptions {
  configManager: ConfigManager;
  toolRegistry: ToolRegistry;
  permissionManager: PermissionManager;
}

interface QueryResult {
  prompt: string;
  options: QueryOptions;
}

interface QueryOptions {
  model?: string;
  systemPrompt?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  cwd?: string;
  permissionMode?: PermissionMode;
  mcpServers?: Record<string, McpServerConfig>;
  agents?: Record<string, AgentDefinition>;
  hooks?: HookConfig;
  maxTurns?: number;
  maxBudgetUsd?: number;
}
```

## 配置 API

### ConfigManager

配置管理器，负责加载和合并配置。

```typescript
import { ConfigManager, UserConfig, ProjectConfig } from 'claude-replica';

const configManager = new ConfigManager();

// 确保用户配置目录存在
await configManager.ensureUserConfigDir(): Promise<void>;

// 加载用户配置
const userConfig = await configManager.loadUserConfig(): Promise<UserConfig>;

// 加载项目配置
const projectConfig = await configManager.loadProjectConfig(
  directory: string
): Promise<ProjectConfig>;

// 合并配置
const mergedConfig = configManager.mergeConfigs(
  userConfig: UserConfig,
  projectConfig: ProjectConfig,
  localConfig?: ProjectConfig
): ProjectConfig;

// 加载 CLAUDE.md 文件
const claudeMd = await configManager.loadClaudeMd(
  directory: string
): Promise<string | null>;
```

#### 配置接口

```typescript
interface UserConfig {
  model?: string;
  maxTokens?: number;
  hooks?: HookConfig;
  defaultTools?: string[];
  permissions?: PermissionConfig;
}

interface ProjectConfig extends UserConfig {
  projectName?: string;
  claudeMd?: string;
  permissionMode?: PermissionMode;
  allowedTools?: string[];
  disallowedTools?: string[];
  maxTurns?: number;
  maxBudgetUsd?: number;
  maxThinkingTokens?: number;
  sandbox?: SandboxSettings;
  mcpServers?: Record<string, McpServerConfig>;
}
```

### SDKConfigLoader

SDK 配置加载器，用于构建 SDK 兼容的配置。

```typescript
import { SDKConfigLoader, SDKOptions } from 'claude-replica';

const loader = new SDKConfigLoader();

// 加载完整配置
const config = await loader.loadFullConfig(
  workingDirectory: string
): Promise<SDKOptions>;

// 构建带有配置源的选项
const options = await loader.buildOptionsWithSettingSources(
  settingSources: SettingSource[]
): Promise<SDKOptions>;
```

## 工具 API

### ToolRegistry

工具注册表，管理可用的工具列表。

```typescript
import { ToolRegistry } from 'claude-replica';

const toolRegistry = new ToolRegistry();

// 获取默认工具列表
const defaultTools = toolRegistry.getDefaultTools(): string[];
// 返回: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob']

// 获取所有可用工具
const allTools = toolRegistry.getAllTools(): string[];

// 根据配置获取启用的工具
const enabledTools = toolRegistry.getEnabledTools(config: {
  allowedTools?: string[];
  disallowedTools?: string[];
}): string[];

// 验证工具名称
const isValid = toolRegistry.isValidTool(toolName: string): boolean;
```

#### 可用工具列表

| 工具名称 | 描述 |
|---------|------|
| `Read` | 读取文件内容 |
| `Write` | 写入文件 |
| `Edit` | 编辑文件（diff 格式） |
| `Bash` | 执行 bash 命令 |
| `BashOutput` | 获取后台命令输出 |
| `KillBash` | 终止后台命令 |
| `Grep` | 搜索文件内容 |
| `Glob` | 文件路径匹配 |
| `Task` | 委托任务给子代理 |
| `AskUserQuestion` | 向用户提问 |
| `WebFetch` | 获取网页内容 |
| `WebSearch` | 搜索网页 |
| `TodoWrite` | 写入任务列表 |
| `NotebookEdit` | 编辑 Jupyter notebook |
| `ListMcpResources` | 列出 MCP 资源 |
| `ReadMcpResource` | 读取 MCP 资源 |

### PermissionManager

权限管理器，控制工具的使用权限。

```typescript
import { PermissionManager, PermissionConfig } from 'claude-replica';

const permissionManager = new PermissionManager(
  config: PermissionConfig,
  toolRegistry: ToolRegistry
);

// 创建 SDK 兼容的权限处理函数
const canUseTool = permissionManager.createCanUseToolHandler(): CanUseTool;

// 检查是否需要用户确认
const needsPrompt = permissionManager.shouldPromptForTool(
  tool: string,
  args: Record<string, unknown>
): boolean;

// 设置用户确认回调
permissionManager.setPromptUserCallback(
  callback: (message: string) => Promise<boolean>
): void;

// 运行时修改权限模式
permissionManager.setMode(mode: PermissionMode): void;

// 获取当前配置
const config = permissionManager.getConfig(): PermissionConfig;
```

#### PermissionConfig 接口

```typescript
interface PermissionConfig {
  mode: PermissionMode;
  allowedTools?: string[];
  disallowedTools?: string[];
  allowDangerouslySkipPermissions?: boolean;
  customPermissionHandler?: CanUseTool;
}

type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

type CanUseTool = (params: {
  tool: string;
  args: Record<string, unknown>;
  context: { sessionId: string; messageUuid: string };
}) => boolean | Promise<boolean>;
```

## 扩展 API

### CommandManager

命令管理器，加载和执行自定义命令。

```typescript
import { CommandManager, Command } from 'claude-replica';

const commandManager = new CommandManager();

// 从目录加载命令
await commandManager.loadCommands(directories: string[]): Promise<Command[]>;

// 获取指定命令
const command = commandManager.getCommand(name: string): Command | undefined;

// 执行命令
const result = await commandManager.executeCommand(
  name: string,
  args: string
): Promise<CommandExecutionResult>;

// 列出所有命令
const commands = commandManager.listCommands(): Array<{
  name: string;
  description: string;
}>;
```

#### Command 接口

```typescript
interface Command {
  name: string;
  description: string;
  argumentHint?: string;
  allowedTools?: string[];
  template: string;
}

interface CommandExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
}
```

### AgentRegistry

子代理注册表，管理子代理定义。

```typescript
import { AgentRegistry, Agent } from 'claude-replica';

const agentRegistry = new AgentRegistry();

// 从目录加载代理
await agentRegistry.loadAgents(directories: string[]): Promise<void>;

// 获取指定代理
const agent = agentRegistry.getAgent(name: string): Agent | undefined;

// 列出所有代理
const agents = agentRegistry.listAgents(): Array<{
  name: string;
  description: string;
}>;

// 根据任务描述匹配代理
const agentName = agentRegistry.matchAgent(task: string): string | null;

// 转换为 SDK 格式
const sdkAgents = agentRegistry.getAgentsForSDK(): Record<string, AgentDefinition>;
```

#### Agent 接口

```typescript
interface Agent {
  description: string;
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  prompt: string;
  tools?: string[];
}

interface AgentDefinition {
  description: string;
  tools?: string[];
  prompt: string;
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
}
```

### HookManager

钩子管理器，管理事件触发的自动化操作。

```typescript
import { HookManager, HookConfig, HookEvent } from 'claude-replica';

const hookManager = new HookManager();

// 加载钩子配置
hookManager.loadHooks(config: HookConfig): void;

// 转换为 SDK 格式
const sdkHooks = hookManager.getHooksForSDK(): SDKHookConfig;

// 添加钩子
hookManager.addHook(
  event: HookEvent,
  matcher: string,
  hook: Hook
): void;

// 移除钩子
hookManager.removeHook(event: HookEvent, matcher: string): void;
```

#### HookConfig 接口

```typescript
type HookEvent =
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

interface Hook {
  matcher: string | RegExp;
  type: 'command' | 'prompt';
  command?: string;
  prompt?: string;
}

interface HookConfig {
  [event: string]: Array<{
    matcher: string;
    hooks: Hook[];
  }>;
}
```

## 集成 API

### MCPManager

MCP 管理器，管理 Model Context Protocol 服务器。

```typescript
import { MCPManager, McpServerConfig } from 'claude-replica';

const mcpManager = new MCPManager();

// 从配置文件加载服务器
await mcpManager.loadServersFromConfig(configPath: string): Promise<void>;

// 添加服务器
mcpManager.addServer(name: string, config: McpServerConfig): void;

// 移除服务器
mcpManager.removeServer(name: string): void;

// 获取所有服务器配置
const config = mcpManager.getServersConfig(): MCPServerConfigMap;

// 列出服务器名称
const servers = mcpManager.listServers(): string[];

// 验证配置
const result = mcpManager.validateConfig(
  config: McpServerConfig
): ConfigValidationResult;
```

#### MCP 配置接口

```typescript
interface McpStdioServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface McpSSEServerConfig {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

interface McpHttpServerConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

type McpServerConfig =
  | McpStdioServerConfig
  | McpSSEServerConfig
  | McpHttpServerConfig;
```

#### MCP 配置文件格式

`.mcp.json` 文件支持两种格式：

**MCP 规范格式（推荐）：**
```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@package/server"],
      "env": {
        "KEY": "${ENV_VAR}"
      }
    }
  }
}
```

**直接映射格式（向后兼容）：**
```json
{
  "server-name": {
    "command": "npx",
    "args": ["-y", "@package/server"]
  }
}
```

**迁移说明：** 从 v1.x 升级的用户请注意，MCP SSE/HTTP 服务器配置中的 `transport` 字段已重命名为 `type` 以符合官方规范。旧版本的 `transport` 字段仍然支持，但会输出弃用警告，建议尽快迁移。该向后兼容支持将在 v2.0 版本中移除。

```typescript
// 旧版本 (已弃用)
{
  "transport": "sse",
  "url": "https://example.com"
}

// 新版本 (推荐)
{
  "type": "sse",
  "url": "https://example.com"
}
```

### RewindManager

回退管理器，管理文件快照和恢复。

```typescript
import { RewindManager, Snapshot } from 'claude-replica';

const rewindManager = new RewindManager({ workingDir: process.cwd() });

// 初始化
await rewindManager.initialize(): Promise<void>;

// 捕获快照
const snapshot = await rewindManager.captureSnapshot(
  files: string[],
  description: string
): Promise<Snapshot>;

// 恢复快照
const result = await rewindManager.restoreSnapshot(
  snapshotId: string
): Promise<RestoreResult>;

// 列出快照
const snapshots = await rewindManager.listSnapshots(): Promise<Snapshot[]>;
```

#### Snapshot 接口

```typescript
interface Snapshot {
  id: string;
  timestamp: Date;
  description: string;
  files: Map<string, FileSnapshot>;
}

interface FileSnapshot {
  path: string;
  content: string;
  exists: boolean;
}

interface RestoreResult {
  success: boolean;
  restoredFiles: string[];
  errors?: string[];
}
```

### PluginManager

插件管理器，管理插件的安装和加载。

```typescript
import { PluginManager, Plugin } from 'claude-replica';

const pluginManager = new PluginManager();

// 安装插件
const result = await pluginManager.installPlugin(
  source: string
): Promise<PluginInstallResult>;

// 卸载插件
await pluginManager.uninstallPlugin(name: string): Promise<void>;

// 列出已安装插件
const plugins = pluginManager.listPlugins(): Plugin[];

// 加载插件
const plugin = await pluginManager.loadPlugin(
  directory: string
): Promise<Plugin>;
```

#### Plugin 接口

```typescript
interface Plugin {
  name: string;
  version: string;
  description: string;
  author?: string;
  repository?: string;
  dependencies?: Record<string, string>;
  commands?: Command[];
  agents?: Agent[];
  skills?: PluginSkill[];
  hooks?: HookConfig;
  mcpServers?: MCPServerConfigMap;
}

interface PluginSkill {
  name: string;
  description: string;
  triggers?: string[];
  tools?: string[];
  content: string;
  metadata?: Record<string, unknown>;
  sourcePath: string;
}

interface PluginInstallResult {
  success: boolean;
  plugin?: Plugin;
  error?: string;
}
```

## UI API

### TerminalInteractiveUI

终端交互式 UI 实现，符合 InteractiveUIInterface。

```typescript
import {
  TerminalInteractiveUI,
  InteractiveUICallbacks,
  InteractiveUIConfig,
} from 'claude-replica';

const callbacks: InteractiveUICallbacks = {
  onMessage: async (message) => {},
  onCommand: async (command) => {},
  onInterrupt: () => {},
  onRewind: async () => {},
  onPermissionModeChange: async (mode) => {},
  onQueueMessage: (message) => {},
};

const config: InteractiveUIConfig = {
  input: process.stdin,
  output: process.stdout,
  enableColors: true,
};

const ui = new TerminalInteractiveUI(callbacks, config);

await ui.start();
ui.stop();

ui.displayMessage(message, 'user');
ui.displayToolUse('Read', { path: 'file.txt' });
ui.displayToolResult('Read', 'ok');
ui.displayThinking('Reasoning...');
ui.displayComputing();
ui.stopComputing();
ui.clearProgress();

ui.displayError('error');
ui.displayWarning('warning');
ui.displaySuccess('success');
ui.displayInfo('info');

const confirmed = await ui.promptConfirmation('Continue?');
const selected = await ui.showRewindMenu(snapshots);
```

#### InteractiveUIOptions 接口

```typescript
type InteractiveUIOptions = InteractiveUICallbacks & InteractiveUIConfig;
```

### OutputFormatter

输出格式化器，支持多种输出格式。

```typescript
import { OutputFormatter, OutputFormat, QueryResult } from 'claude-replica';

const formatter = new OutputFormatter();

// 格式化输出
const output = formatter.format(
  result: QueryResult,
  format: OutputFormat
): string;

// 验证格式
const isValid = formatter.isValidFormat(format: string): boolean;
```

#### OutputFormat 类型

```typescript
type OutputFormat = 'text' | 'json' | 'stream-json' | 'markdown';

interface QueryResult {
  content: string;
  success: boolean;
  toolCalls?: ToolCall[];
  metadata?: Record<string, unknown>;
}

interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
}
```

## 类型定义

所有类型定义都可以从主模块导入：

```typescript
import {
  // 核心类型
  Session,
  SessionContext,
  Message,
  ContentBlock,
  
  // 配置类型
  UserConfig,
  ProjectConfig,
  SDKOptions,
  
  // 权限类型
  PermissionConfig,
  PermissionMode,
  CanUseTool,
  
  // 扩展类型
  Command,
  Agent,
  AgentDefinition,
  Hook,
  HookConfig,
  HookEvent,
  
  // 集成类型
  McpServerConfig,
  Snapshot,
  Plugin,
  
  // UI 类型
  TerminalInteractiveUI,
  InteractiveUIInterface,
  InteractiveUICallbacks,
  InteractiveUIConfig,
  InteractiveUIOptions,
  OutputFormat,
  QueryResult,
} from 'claude-replica';
```

## 错误处理

Claude Replica 定义了以下错误类型：

```typescript
import { CLIParseError, TimeoutError } from 'claude-replica';

// CLI 解析错误
try {
  const options = cliParser.parse(args);
} catch (error) {
  if (error instanceof CLIParseError) {
    console.error('参数错误:', error.message);
  }
}

// 超时错误
try {
  await executeWithTimeout(task, timeout);
} catch (error) {
  if (error instanceof TimeoutError) {
    console.error('执行超时:', error.message);
  }
}
```

## 退出码

```typescript
import { ExitCodes } from 'claude-replica';

// 退出码定义
const ExitCodes = {
  SUCCESS: 0,           // 成功
  ERROR: 1,             // 一般错误
  CONFIG_ERROR: 2,      // 配置错误
  AUTH_ERROR: 3,        // 认证错误
  NETWORK_ERROR: 4,     // 网络错误
  TIMEOUT_ERROR: 5,     // 超时错误
  PERMISSION_ERROR: 6,  // 权限错误
};
```

## 更多信息

- [README](../../README_ZH.md) - 项目概述和快速开始
- [用户指南](USER_GUIDE.md) - 详细使用说明
- [开发者指南](DEVELOPER_GUIDE.md) - 开发和贡献指南
