# Claude Replica API Documentation

This document provides detailed programming API documentation for Claude Replica, for developers to integrate into their own projects.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core API](#core-api)
  - [Application](#application)
  - [SessionManager](#sessionmanager)
  - [MessageRouter](#messagerouter)
- [Configuration API](#configuration-api)
  - [ConfigManager](#configmanager)
  - [SDKConfigLoader](#sdkconfigloader)
- [Tool API](#tool-api)
  - [ToolRegistry](#toolregistry)
  - [PermissionManager](#permissionmanager)
- [Extension API](#extension-api)
  - [CommandManager](#commandmanager)
  - [AgentRegistry](#agentregistry)
  - [HookManager](#hookmanager)
- [Integration API](#integration-api)
  - [MCPManager](#mcpmanager)
  - [RewindManager](#rewindmanager)
  - [PluginManager](#pluginmanager)
- [UI API](#ui-api)
  - [TerminalInteractiveUI](#terminalinteractiveui)
  - [OutputFormatter](#outputformatter)
- [Type Definitions](#type-definitions)

## Installation

```bash
npm install claude-replica
```

## Quick Start

```typescript
import { Application, main } from 'claude-replica';

// Method 1: Use main function
const exitCode = await main(['-p', 'Hello, please introduce yourself']);

// Method 2: Use Application class
const app = new Application();
const exitCode = await app.run(['-p', 'Analyze this code']);
```

## Core API

### Application

Main application class, responsible for initializing and running the entire application.

```typescript
import { Application } from 'claude-replica';

const app = new Application();

// Run the application
const exitCode = await app.run(args: string[]): Promise<number>;
```

### SessionManager

Session manager, responsible for creating, saving, and restoring sessions.

```typescript
import { SessionManager, Session } from 'claude-replica';

const sessionManager = new SessionManager();

// Create new session
const session = await sessionManager.createSession(
  workingDir: string,
  projectConfig?: ProjectConfig,
  userConfig?: UserConfig
): Promise<Session>;

// Load session
const session = await sessionManager.loadSession(
  sessionId: string
): Promise<Session | null>;

// Save session
await sessionManager.saveSession(session: Session): Promise<void>;

// List all sessions
const sessions = await sessionManager.listSessions(): Promise<Session[]>;

// Get recent session
const recentSession = await sessionManager.getRecentSession(): Promise<Session | null>;

// Clean expired sessions
await sessionManager.cleanSessions(olderThan: Date): Promise<void>;

// Add message to session
await sessionManager.addMessage(
  session: Session,
  message: { role: string; content: string }
): Promise<void>;
```

#### Session Interface

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

Message router, responsible for handling user messages and calling SDK.

```typescript
import { MessageRouter, MessageRouterOptions } from 'claude-replica';

const router = new MessageRouter(options: MessageRouterOptions);

// Route message
const queryResult = await router.routeMessage(
  message: Message,
  session: Session
): Promise<QueryResult>;
```

#### MessageRouterOptions Interface

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

## Configuration API

### ConfigManager

Configuration manager, responsible for loading and merging configurations.

```typescript
import { ConfigManager, UserConfig, ProjectConfig } from 'claude-replica';

const configManager = new ConfigManager();

// Ensure user config directory exists
await configManager.ensureUserConfigDir(): Promise<void>;

// Load user config
const userConfig = await configManager.loadUserConfig(): Promise<UserConfig>;

// Load project config
const projectConfig = await configManager.loadProjectConfig(
  directory: string
): Promise<ProjectConfig>;

// Merge configs
const mergedConfig = configManager.mergeConfigs(
  userConfig: UserConfig,
  projectConfig: ProjectConfig,
  localConfig?: ProjectConfig
): ProjectConfig;

// Load CLAUDE.md file
const claudeMd = await configManager.loadClaudeMd(
  directory: string
): Promise<string | null>;
```

#### Configuration Interfaces

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

SDK configuration loader, used to build SDK-compatible configurations.

```typescript
import { SDKConfigLoader, SDKOptions } from 'claude-replica';

const loader = new SDKConfigLoader();

// Load full config
const config = await loader.loadFullConfig(
  workingDirectory: string
): Promise<SDKOptions>;

// Build options with setting sources
const options = await loader.buildOptionsWithSettingSources(
  settingSources: SettingSource[]
): Promise<SDKOptions>;
```

## Tool API

### ToolRegistry

Tool registry, managing the list of available tools.

```typescript
import { ToolRegistry } from 'claude-replica';

const toolRegistry = new ToolRegistry();

// Get default tool list
const defaultTools = toolRegistry.getDefaultTools(): string[];
// Returns: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob']

// Get all available tools
const allTools = toolRegistry.getAllTools(): string[];

// Get enabled tools based on config
const enabledTools = toolRegistry.getEnabledTools(config: {
  allowedTools?: string[];
  disallowedTools?: string[];
}): string[];

// Validate tool name
const isValid = toolRegistry.isValidTool(toolName: string): boolean;
```

#### Available Tools List

| Tool Name | Description |
|-----------|-------------|
| `Read` | Read file content |
| `Write` | Write file |
| `Edit` | Edit file (diff format) |
| `Bash` | Execute bash command |
| `BashOutput` | Get background command output |
| `KillBash` | Terminate background command |
| `Grep` | Search file content |
| `Glob` | File path matching |
| `Task` | Delegate task to subagent |
| `AskUserQuestion` | Ask user question |
| `WebFetch` | Fetch web content |
| `WebSearch` | Search web |
| `TodoWrite` | Write task list |
| `NotebookEdit` | Edit Jupyter notebook |
| `ListMcpResources` | List MCP resources |
| `ReadMcpResource` | Read MCP resource |

### PermissionManager

Permission manager, controlling tool usage permissions.

```typescript
import { PermissionManager, PermissionConfig } from 'claude-replica';

const permissionManager = new PermissionManager(
  config: PermissionConfig,
  toolRegistry: ToolRegistry
);

// Create SDK-compatible permission handler
const canUseTool = permissionManager.createCanUseToolHandler(): CanUseTool;

// Check if user confirmation is needed
const needsPrompt = permissionManager.shouldPromptForTool(
  tool: string,
  args: Record<string, unknown>
): boolean;

// Set user confirmation callback
permissionManager.setPromptUserCallback(
  callback: (message: string) => Promise<boolean>
): void;

// Modify permission mode at runtime
permissionManager.setMode(mode: PermissionMode): void;

// Get current config
const config = permissionManager.getConfig(): PermissionConfig;
```

#### PermissionConfig Interface

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

## Extension API

### CommandManager

Command manager, loading and executing custom commands.

```typescript
import { CommandManager, Command } from 'claude-replica';

const commandManager = new CommandManager();

// Load commands from directory
await commandManager.loadCommands(directories: string[]): Promise<Command[]>;

// Get specific command
const command = commandManager.getCommand(name: string): Command | undefined;

// Execute command
const result = await commandManager.executeCommand(
  name: string,
  args: string
): Promise<CommandExecutionResult>;

// List all commands
const commands = commandManager.listCommands(): Array<{
  name: string;
  description: string;
}>;
```

#### Command Interface

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

Subagent registry, managing subagent definitions.

```typescript
import { AgentRegistry, Agent } from 'claude-replica';

const agentRegistry = new AgentRegistry();

// Load agents from directory
await agentRegistry.loadAgents(directories: string[]): Promise<void>;

// Get specific agent
const agent = agentRegistry.getAgent(name: string): Agent | undefined;

// List all agents
const agents = agentRegistry.listAgents(): Array<{
  name: string;
  description: string;
}>;

// Match agent based on task description
const agentName = agentRegistry.matchAgent(task: string): string | null;

// Convert to SDK format
const sdkAgents = agentRegistry.getAgentsForSDK(): Record<string, AgentDefinition>;
```

#### Agent Interface

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

Hook manager, managing event-triggered automation operations.

```typescript
import { HookManager, HookConfig, HookEvent } from 'claude-replica';

const hookManager = new HookManager();

// Load hook config
hookManager.loadHooks(config: HookConfig): void;

// Convert to SDK format
const sdkHooks = hookManager.getHooksForSDK(): SDKHookConfig;

// Add hook
hookManager.addHook(
  event: HookEvent,
  matcher: string,
  hook: Hook
): void;

// Remove hook
hookManager.removeHook(event: HookEvent, matcher: string): void;
```

#### HookConfig Interface

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

## Integration API

### MCPManager

MCP manager, managing Model Context Protocol servers.

```typescript
import { MCPManager, McpServerConfig } from 'claude-replica';

const mcpManager = new MCPManager();

// Load servers from config file
await mcpManager.loadServersFromConfig(configPath: string): Promise<void>;

// Add server
mcpManager.addServer(name: string, config: McpServerConfig): void;

// Remove server
mcpManager.removeServer(name: string): void;

// Get all server configs
const config = mcpManager.getServersConfig(): MCPServerConfigMap;

// List server names
const servers = mcpManager.listServers(): string[];

// Validate config
const result = mcpManager.validateConfig(
  config: McpServerConfig
): ConfigValidationResult;
```

#### MCP Configuration Interface

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

#### MCP Configuration File Format

The `.mcp.json` file supports two formats:

**MCP Specification Format (Recommended):**
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

**Direct Mapping Format (Backward Compatible):**
```json
{
  "server-name": {
    "command": "npx",
    "args": ["-y", "@package/server"]
  }
}
```

**Migration Note:** Users upgrading from v1.x should note that the `transport` field in MCP SSE/HTTP server configurations has been renamed to `type` to comply with official specifications. The legacy `transport` field is still supported but will emit a deprecation warning. We recommend migrating as soon as possible. This backward compatibility support will be removed in v2.0.

```typescript
// Legacy format (deprecated)
{
  "transport": "sse",
  "url": "https://example.com"
}

// New format (recommended)
{
  "type": "sse",
  "url": "https://example.com"
}
```

### RewindManager

Rewind manager, managing file snapshots and restoration.

```typescript
import { RewindManager, Snapshot } from 'claude-replica';

const rewindManager = new RewindManager({ workingDir: process.cwd() });

// Initialize
await rewindManager.initialize(): Promise<void>;

// Capture snapshot
const snapshot = await rewindManager.captureSnapshot(
  files: string[],
  description: string
): Promise<Snapshot>;

// Restore snapshot
const result = await rewindManager.restoreSnapshot(
  snapshotId: string
): Promise<RestoreResult>;

// List snapshots
const snapshots = await rewindManager.listSnapshots(): Promise<Snapshot[]>;
```

#### Snapshot Interface

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

Plugin manager, managing plugin installation and loading.

```typescript
import { PluginManager, Plugin } from 'claude-replica';

const pluginManager = new PluginManager();

// Install plugin
const result = await pluginManager.installPlugin(
  source: string
): Promise<PluginInstallResult>;

// Uninstall plugin
await pluginManager.uninstallPlugin(name: string): Promise<void>;

// List installed plugins
const plugins = pluginManager.listPlugins(): Plugin[];

// Load plugin
const plugin = await pluginManager.loadPlugin(
  directory: string
): Promise<Plugin>;
```

#### Plugin Interface

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

Terminal-based interactive UI implementation that conforms to InteractiveUIInterface.

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

#### InteractiveUIOptions Interface

```typescript
type InteractiveUIOptions = InteractiveUICallbacks & InteractiveUIConfig;
```

### OutputFormatter

Output formatter, supporting multiple output formats.

```typescript
import { OutputFormatter, OutputFormat, QueryResult } from 'claude-replica';

const formatter = new OutputFormatter();

// Format output
const output = formatter.format(
  result: QueryResult,
  format: OutputFormat
): string;

// Validate format
const isValid = formatter.isValidFormat(format: string): boolean;
```

#### OutputFormat Type

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

## Type Definitions

All type definitions can be imported from the main module:

```typescript
import {
  // Core types
  Session,
  SessionContext,
  Message,
  ContentBlock,

  // Configuration types
  UserConfig,
  ProjectConfig,
  SDKOptions,

  // Permission types
  PermissionConfig,
  PermissionMode,
  CanUseTool,

  // Extension types
  Command,
  Agent,
  AgentDefinition,
  Hook,
  HookConfig,
  HookEvent,

  // Integration types
  McpServerConfig,
  Snapshot,
  Plugin,

  // UI types
  TerminalInteractiveUI,
  InteractiveUIInterface,
  InteractiveUICallbacks,
  InteractiveUIConfig,
  InteractiveUIOptions,
  OutputFormat,
  QueryResult,
} from 'claude-replica';
```

## Error Handling

Claude Replica defines the following error types:

```typescript
import { CLIParseError, TimeoutError } from 'claude-replica';

// CLI parse error
try {
  const options = cliParser.parse(args);
} catch (error) {
  if (error instanceof CLIParseError) {
    console.error('Argument error:', error.message);
  }
}

// Timeout error
try {
  await executeWithTimeout(task, timeout);
} catch (error) {
  if (error instanceof TimeoutError) {
    console.error('Execution timeout:', error.message);
  }
}
```

## Exit Codes

```typescript
import { ExitCodes } from 'claude-replica';

// Exit code definitions
const ExitCodes = {
  SUCCESS: 0,           // Success
  ERROR: 1,             // General error
  CONFIG_ERROR: 2,      // Configuration error
  AUTH_ERROR: 3,        // Authentication error
  NETWORK_ERROR: 4,     // Network error
  TIMEOUT_ERROR: 5,     // Timeout error
  PERMISSION_ERROR: 6,  // Permission error
};
```

## More Information

- [README](../README_EN.md) - Project overview and quick start
- [User Guide](USER_GUIDE_EN.md) - Detailed usage instructions
- [Developer Guide](DEVELOPER_GUIDE_EN.md) - Development and contribution guide
