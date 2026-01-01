# 设计文档 - Claude Code 完整复刻

## SDK 版本说明

本设计基于 **Claude Agent SDK v0.1.x** (原 Claude Code SDK)。

**版本要求**:
- 包名: `@anthropic-ai/claude-agent-sdk`
- 版本: `^0.1.76` (使用最新稳定版本)
- 安装命令: `npm install @anthropic-ai/claude-agent-sdk@^0.1.76`

**重要变更**:
- 核心 API: `query()` 函数(返回异步生成器)
- 配置加载: 不再自动加载 CLAUDE.md 和 settings.json,需要显式加载
- 官方文档: https://docs.claude.com/en/api/agent-sdk/overview

## 概述

本项目使用 TypeScript 和 `@anthropic-ai/claude-agent-sdk` 构建一个完整的 Claude Code 复刻版本。该工具将提供命令行界面,支持交互式和非交互式模式,具备文件操作、命令执行、会话管理、扩展系统等完整功能。

设计目标:
- 使用 Claude Agent SDK (原 Claude Code SDK) 作为核心引擎
- 基于 `query()` 函数实现流式消息处理
- 提供与 Claude Code 相同的用户体验
- 支持完整的扩展系统(技能、命令、子代理、钩子、插件)
- 实现 MCP 服务器集成
- 提供良好的性能和安全性

**注意**: Claude Agent SDK v0.1.x 不再自动加载本地配置文件(如 CLAUDE.md、settings.json),需要显式配置才能启用这些功能。

## 架构

### 高层架构

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI 层                                │
│  (命令行解析、交互式界面、输出格式化)                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      核心引擎层                               │
│  (会话管理、上下文管理、消息路由)                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   Claude Agent SDK                           │
│  (query() 函数、流式消息处理、工具调用)                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────┬──────────────┬──────────────┬────────────────┐
│  工具系统     │  扩展系统     │  MCP 集成    │  配置系统       │
│  (文件、Bash) │ (技能、命令)  │ (外部工具)   │ (设置、权限)    │
└──────────────┴──────────────┴──────────────┴────────────────┘
```

### 模块划分

1. **CLI 模块** - 命令行接口和用户交互
2. **核心引擎模块** - 会话管理和消息处理
3. **工具模块** - 文件操作、Bash 执行等内置工具
4. **扩展模块** - 技能、命令、子代理、钩子、插件
5. **MCP 模块** - MCP 服务器连接和工具代理
6. **配置模块** - 配置加载、合并和验证
7. **会话模块** - 会话持久化和恢复
8. **权限模块** - 权限检查和用户确认

### 核心实现示例

以下是使用 Claude Agent SDK 的核心实现模式:

```typescript
import { query, Options } from '@anthropic-ai/claude-agent-sdk';

// 1. 构建配置
async function buildQueryOptions(session: Session): Promise<Options> {
  const configLoader = new SDKConfigLoader();
  const baseConfig = await configLoader.loadFullConfig(session.workingDirectory);
  
  return {
    ...baseConfig,
    // 认证由 SDK 自动从 Claude Code 配置获取，无需手动设置 apiKey
    model: session.context.projectConfig.model || 'claude-3-5-sonnet-latest',
    systemPrompt: await buildSystemPrompt(session),
    allowedTools: getEnabledToolNames(session),
    cwd: session.workingDirectory,
    permissionMode: session.context.projectConfig.permissionMode || 'default',
    // 使用 settingSources 让 SDK 加载 Claude Code 配置
    settingSources: ['user', 'project'],
  };
}

// 2. 执行查询并处理流式响应
async function* processUserMessage(
  userMessage: string,
  session: Session
): AsyncGenerator<string> {
  const options = await buildQueryOptions(session);
  
  // 注意: query() 使用对象参数
  for await (const result of query({ prompt: userMessage, options })) {
    // 处理不同类型的消息
    if (result.type === 'assistant') {
      // 处理助手消息
      const content = result.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            yield block.text;
          }
        }
      }
    } else if (result.type === 'result') {
      // 处理最终结果
      if (result.subtype === 'success') {
        console.log(`Query completed. Cost: $${result.total_cost_usd}`);
      }
    }
  }
}

// 3. 在 CLI 中使用
async function main() {
  const session = await sessionManager.createSession(process.cwd());
  const userMessage = await getUserInput();
  
  for await (const chunk of processUserMessage(userMessage, session)) {
    process.stdout.write(chunk);
  }
}
```

## 组件和接口

### 1. CLI 组件

#### CLIParser
```typescript
interface CLIOptions {
  // 基本选项
  print?: boolean;              // -p, --print
  continue?: boolean;           // -c, --continue
  resume?: string;              // --resume <session-id>
  resumeSessionAt?: string;     // --resume-at <message-uuid>
  forkSession?: boolean;        // --fork
  
  // 模型和提示
  model?: string;               // 模型名称
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string };
  
  // 工具和权限
  allowedTools?: string[];
  disallowedTools?: string[];
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  allowDangerouslySkipPermissions?: boolean;
  
  // 输出
  outputFormat?: 'text' | 'json' | 'stream-json' | 'markdown';
  verbose?: boolean;
  includePartialMessages?: boolean;
  
  // 扩展
  agents?: string;              // JSON 字符串
  pluginDir?: string;
  settingSources?: ('user' | 'project' | 'local')[];
  
  // 高级选项
  maxTurns?: number;
  maxBudgetUsd?: number;
  maxThinkingTokens?: number;
  enableFileCheckpointing?: boolean;
  sandbox?: boolean;            // 启用沙箱
  
  // 其他
  help?: boolean;
  version?: boolean;
}

class CLIParser {
  parse(args: string[]): CLIOptions;
}
```

#### InteractiveUI
```typescript
interface InteractiveUIOptions {
  onMessage: (message: string) => Promise<void>;
  onInterrupt: () => void;
  onRewind: () => Promise<void>;
}

class InteractiveUI {
  constructor(options: InteractiveUIOptions);
  
  start(): Promise<void>;
  stop(): void;
  
  displayMessage(message: string, role: 'user' | 'assistant'): void;
  displayToolUse(tool: string, args: any): void;
  displayProgress(message: string): void;
  
  promptConfirmation(message: string): Promise<boolean>;
  showRewindMenu(snapshots: Snapshot[]): Promise<Snapshot | null>;
}
```

### 2. 核心引擎组件

#### SDK 集成层

**核心 API: query() 函数**

Claude Agent SDK 的核心是 `query()` 函数,它创建一个异步生成器来流式处理消息:

```typescript
import { query, Options, SDKMessage, Query } from '@anthropic-ai/claude-agent-sdk';

// 基本使用示例
async function* chatWithClaude(userMessage: string, options: Options) {
  // 注意: query() 接受对象参数 { prompt, options }
  const queryInstance: Query = query({ prompt: userMessage, options });
  
  for await (const result: SDKMessage of queryInstance) {
    // result 是 SDKMessage 类型,包含多种消息类型
    yield result;
  }
}

// Options 接口 (部分重要选项)
interface Options {
  // 注意: apiKey 已移除，认证由 SDK 自动从 Claude Code 配置获取
  model?: string;                    // 模型名称,默认 'claude-3-5-sonnet-latest'
  systemPrompt?: string | {          // 系统提示词或预设
    type: 'preset';
    preset: 'claude_code';
    append?: string;
  };
  allowedTools?: string[];           // 允许的工具名称列表
  disallowedTools?: string[];        // 禁止的工具名称列表
  tools?: string[] | {               // 工具配置
    type: 'preset';
    preset: 'claude_code';
  };
  cwd?: string;                      // 工作目录
  permissionMode?: PermissionMode;   // 权限模式
  settingSources?: SettingSource[];  // 配置源（'user' | 'project' | 'local'）
  canUseTool?: CanUseTool;          // 自定义权限函数
  mcpServers?: Record<string, McpServerConfig>;  // MCP 服务器配置
  agents?: Record<string, AgentDefinition>;      // 子代理定义
  settingSources?: SettingSource[];  // 配置源: 'user' | 'project' | 'local'
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;  // 钩子配置
  maxTurns?: number;                 // 最大对话轮数
  maxBudgetUsd?: number;             // 最大预算(美元)
  maxThinkingTokens?: number;        // 最大思考 token 数
  enableFileCheckpointing?: boolean; // 启用文件检查点
  sandbox?: SandboxSettings;         // 沙箱配置
  // ... 更多选项见 SDK 文档
}

// Query 接口 - 提供运行时控制方法
interface Query extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>;
  rewindFiles(userMessageUuid: string): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  setModel(model?: string): Promise<void>;
  setMaxThinkingTokens(maxThinkingTokens: number | null): Promise<void>;
  supportedCommands(): Promise<SlashCommand[]>;
  supportedModels(): Promise<ModelInfo[]>;
  mcpServerStatus(): Promise<McpServerStatus[]>;
  accountInfo(): Promise<AccountInfo>;
}
```

**集成策略**:
1. 我们的 `MessageRouter` 封装 `query()` 函数
2. 管理会话状态和消息历史
3. 处理不同类型的 SDKMessage
4. 实现流式输出到 CLI
5. 利用 Query 对象的控制方法实现高级功能

#### SessionManager
```typescript
interface Session {
  id: string;
  createdAt: Date;
  lastAccessedAt: Date;
  messages: Message[];
  context: SessionContext;
  expired: boolean;
}

interface SessionContext {
  workingDirectory: string;
  projectConfig: ProjectConfig;
  userConfig: UserConfig;
  loadedSkills: Skill[];
  activeAgents: Agent[];
}

class SessionManager {
  createSession(workingDir: string): Promise<Session>;
  loadSession(sessionId: string): Promise<Session>;
  saveSession(session: Session): Promise<void>;
  listSessions(): Promise<Session[]>;
  cleanSessions(olderThan: Date): Promise<void>;
  
  getRecentSession(): Promise<Session | null>;
}
```

#### MessageRouter
```typescript
import { query, Options, SDKMessage, Query } from '@anthropic-ai/claude-agent-sdk';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
  timestamp: Date;
}

interface ContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  [key: string]: any;
}

class MessageRouter {
  constructor(
    private configManager: ConfigManager,
    private agentRegistry: AgentRegistry
  );
  
  async routeMessage(
    message: Message, 
    session: Session
  ): Promise<Query> {
    // 使用 query() 函数处理消息
    // 认证由 SDK 自动从 Claude Code 配置获取
    const options: Options = {
      model: session.context.projectConfig.model || 'claude-3-5-sonnet-latest',
      systemPrompt: this.buildSystemPrompt(session),
      allowedTools: this.getEnabledToolNames(session),
      cwd: session.workingDirectory,
      permissionMode: session.context.projectConfig.permissionMode || 'default',
      canUseTool: this.createPermissionHandler(session),
      mcpServers: session.context.projectConfig.mcpServers,
      agents: this.getAgentDefinitions(session),
      settingSources: ['user', 'project'],  // 加载用户和项目配置（包含认证信息）
      hooks: session.context.projectConfig.hooks,
      // ... 其他配置
    };
    
    // 注意: query() 使用对象参数
    return query({ prompt: message.content as string, options });
  }
  
  private shouldRouteToAgent(message: Message, session: Session): Agent | null;
  private buildSystemPrompt(session: Session): string;
  private getEnabledToolNames(session: Session): string[];
  private createPermissionHandler(session: Session): CanUseTool;
  private getAgentDefinitions(session: Session): Record<string, AgentDefinition>;
}
```

### 3. 工具组件

#### ToolRegistry

**重要说明**: Claude Agent SDK 使用内置工具名称字符串,而非自定义 Tool 对象。工具通过 `allowedTools` 和 `disallowedTools` 字符串数组控制。

**SDK 内置工具列表**:

1. **文件操作工具**:
   - `Read` - 读取文件内容
   - `Write` - 写入文件
   - `Edit` - 编辑文件(使用 diff 格式)

2. **命令执行工具**:
   - `Bash` - 执行 bash 命令
   - `BashOutput` - 获取后台命令输出
   - `KillBash` - 终止后台命令

3. **搜索工具**:
   - `Grep` - 搜索文件内容
   - `Glob` - 文件路径匹配

4. **子代理工具**:
   - `Task` - 委托任务给子代理

5. **用户交互工具**:
   - `AskUserQuestion` - 向用户提问

6. **网络工具**:
   - `WebFetch` - 获取网页内容
   - `WebSearch` - 搜索网页

7. **任务管理工具**:
   - `TodoWrite` - 写入任务列表

8. **Jupyter 工具**:
   - `NotebookEdit` - 编辑 Jupyter notebook

9. **计划模式工具**:
   - `ExitPlanMode` - 退出计划模式

10. **MCP 工具**:
    - `ListMcpResources` - 列出 MCP 资源
    - `ReadMcpResource` - 读取 MCP 资源

```typescript
class ToolRegistry {
  // 获取默认启用的工具列表
  getDefaultTools(): string[] {
    return ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'];
  }
  
  // 获取所有可用工具列表
  getAllTools(): string[] {
    return [
      'Read', 'Write', 'Edit',
      'Bash', 'BashOutput', 'KillBash',
      'Grep', 'Glob',
      'Task',
      'AskUserQuestion',
      'WebFetch', 'WebSearch',
      'TodoWrite',
      'NotebookEdit',
      'ExitPlanMode',
      'ListMcpResources', 'ReadMcpResource'
    ];
  }
  
  // 根据配置获取启用的工具
  getEnabledTools(config: {
    allowedTools?: string[];
    disallowedTools?: string[];
  }): string[] {
    let tools = this.getDefaultTools();
    
    if (config.allowedTools) {
      tools = config.allowedTools;
    }
    
    if (config.disallowedTools) {
      tools = tools.filter(t => !config.disallowedTools!.includes(t));
    }
    
    return tools;
  }
  
  // 验证工具名称是否有效
  isValidTool(toolName: string): boolean {
    return this.getAllTools().includes(toolName);
  }
}
```

**工具配置示例**:

```typescript
// 使用预设工具集
const options: Options = {
  tools: { type: 'preset', preset: 'claude_code' },  // 使用 Claude Code 默认工具集
  // ...
};

// 或者显式指定工具
const options: Options = {
  allowedTools: ['Read', 'Write', 'Bash', 'Grep'],  // 只允许这些工具
  disallowedTools: ['WebFetch', 'WebSearch'],       // 禁用这些工具
  // ...
};
```

**工具执行流程**:
1. 通过 `allowedTools` 或 `disallowedTools` 配置工具访问权限
2. SDK 内部处理工具调用和执行
3. 工具执行结果自动返回给模型
4. 权限检查通过 `permissionMode` 和 `canUseTool` 控制

### 4. 扩展组件

#### SkillManager
```typescript
interface Skill {
  name: string;
  description: string;
  triggers?: string[];
  tools?: string[];
  content: string;
  metadata: Record<string, any>;
}

class SkillManager {
  loadSkills(directories: string[]): Promise<Skill[]>;
  matchSkills(context: string): Skill[];
  
  // 将技能内容应用到系统提示词
  applySkills(skills: Skill[], baseSystemPrompt: string): string {
    let prompt = baseSystemPrompt;
    
    for (const skill of skills) {
      prompt += `\n\n## Skill: ${skill.name}\n\n${skill.content}`;
    }
    
    return prompt;
  }
  
  // 获取技能相关的工具列表
  getSkillTools(skills: Skill[]): string[] {
    const tools = new Set<string>();
    for (const skill of skills) {
      if (skill.tools) {
        skill.tools.forEach(t => tools.add(t));
      }
    }
    return Array.from(tools);
  }
}
```

**技能集成流程**:

1. **加载技能**: 从 `.kiro/skills/` 目录加载所有 SKILL.md 文件
2. **匹配技能**: 根据对话上下文或触发器匹配相关技能
3. **注入提示词**: 将技能内容添加到 `systemPrompt` 中
4. **启用工具**: 确保技能需要的工具被启用

```typescript
async function buildSystemPrompt(session: Session): Promise<string> {
  let prompt = '';
  
  // 1. 添加 CLAUDE.md 内容
  const claudeMd = await configManager.loadClaudeMd(session.workingDirectory);
  if (claudeMd) {
    prompt += claudeMd + '\n\n';
  }
  
  // 2. 添加匹配的技能
  const matchedSkills = skillManager.matchSkills(session.context);
  prompt = skillManager.applySkills(matchedSkills, prompt);
  
  // 3. 添加其他系统指令
  prompt += '\n\n' + getDefaultSystemInstructions();
  
  return prompt;
}
```

#### CommandManager
```typescript
interface Command {
  name: string;
  description: string;
  argumentHint?: string;
  allowedTools?: string[];
  template: string;
}

class CommandManager {
  loadCommands(directories: string[]): Promise<Command[]>;
  getCommand(name: string): Command | undefined;
  executeCommand(name: string, args: string, session: Session): Promise<void>;
  
  listCommands(): Array<{ name: string; description: string }>;
}
```

#### AgentRegistry
```typescript
import { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';

// SDK 的 AgentDefinition 类型
type AgentDefinition = {
  description: string;
  tools?: string[];
  prompt: string;
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
}

// 我们的 Agent 接口(用于加载和管理)
interface Agent {
  description: string;
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  prompt: string;
  tools?: string[];
  // 注意: name 不在 AgentDefinition 中,而是作为 Record 的 key
}

class AgentRegistry {
  private agents: Map<string, Agent> = new Map();
  
  // 从目录加载代理定义
  async loadAgents(directories: string[]): Promise<void> {
    for (const dir of directories) {
      const files = await this.findAgentFiles(dir);
      for (const file of files) {
        const agent = await this.parseAgentFile(file);
        const name = path.basename(file, '.md');
        this.agents.set(name, agent);
      }
    }
  }
  
  // 获取代理
  getAgent(name: string): Agent | undefined {
    return this.agents.get(name);
  }
  
  // 列出所有代理
  listAgents(): Array<{ name: string; description: string }> {
    return Array.from(this.agents.entries()).map(([name, agent]) => ({
      name,
      description: agent.description
    }));
  }
  
  // 根据任务描述匹配合适的代理
  matchAgent(task: string): string | null {
    for (const [name, agent] of this.agents.entries()) {
      if (this.isTaskMatch(task, agent.description)) {
        return name;
      }
    }
    return null;
  }
  
  // 转换为 SDK 格式(用于 query() 的 agents 选项)
  getAgentsForSDK(): Record<string, AgentDefinition> {
    const result: Record<string, AgentDefinition> = {};
    
    for (const [name, agent] of this.agents.entries()) {
      result[name] = {
        description: agent.description,
        prompt: agent.prompt,
        tools: agent.tools,
        model: agent.model
      };
    }
    
    return result;
  }
  
  private async findAgentFiles(dir: string): Promise<string[]> {
    // 查找所有 agent.md 或 *.agent.md 文件
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.agent.md')) {
        files.push(path.join(dir, entry.name));
      }
    }
    
    return files;
  }
  
  private async parseAgentFile(filePath: string): Promise<Agent> {
    const content = await fs.readFile(filePath, 'utf-8');
    const { data: frontmatter, content: prompt } = matter(content);
    
    return {
      description: frontmatter.description || '',
      model: frontmatter.model || 'inherit',
      prompt: prompt.trim(),
      tools: frontmatter.tools || []
    };
  }
  
  private isTaskMatch(task: string, description: string): boolean {
    // 简单的关键词匹配
    const keywords = description.toLowerCase().split(/\s+/);
    const taskLower = task.toLowerCase();
    return keywords.some(keyword => taskLower.includes(keyword));
  }
}
```

**子代理集成示例**:

```typescript
const agentRegistry = new AgentRegistry();
await agentRegistry.loadAgents(['.kiro/agents', './agents']);

const options: Options = {
  // 传递代理定义给 SDK
  agents: agentRegistry.getAgentsForSDK(),
  
  // 确保 Task 工具被启用(用于调用子代理)
  allowedTools: ['Read', 'Write', 'Bash', 'Task'],
  
  // ...
};

// SDK 会自动处理子代理的调用
// 当模型使用 Task 工具时,SDK 会创建子代理实例并执行任务
```

**agent.md 文件示例**:

```markdown
---
description: 代码审查专家,专注于安全性和性能
model: sonnet
tools:
  - Read
  - Grep
---

你是专家代码审查员,关注:
- 安全漏洞和潜在风险
- 性能瓶颈和优化机会
- 代码可维护性和可读性
- 最佳实践和编码规范

审查代码时,请提供:
1. 发现的问题列表
2. 严重程度评估
3. 具体的改进建议
4. 代码示例(如果适用)
```

#### HookManager

**重要说明**: Claude Agent SDK 支持 12 种钩子事件类型,通过 `hooks` 配置选项传递。

```typescript
import { HookEvent, HookCallbackMatcher } from '@anthropic-ai/claude-agent-sdk';

// SDK 支持的钩子事件类型
type HookEvent =
  | 'PreToolUse'           // 工具使用前
  | 'PostToolUse'          // 工具使用后
  | 'PostToolUseFailure'   // 工具使用失败后
  | 'Notification'         // 通知事件
  | 'UserPromptSubmit'     // 用户提交提示词
  | 'SessionStart'         // 会话开始
  | 'SessionEnd'           // 会话结束
  | 'Stop'                 // 停止事件
  | 'SubagentStart'        // 子代理开始
  | 'SubagentStop'         // 子代理停止
  | 'PreCompact'           // 压缩前
  | 'PermissionRequest';   // 权限请求

// 钩子回调匹配器
type HookCallbackMatcher = {
  matcher: string | RegExp;  // 匹配工具名称或其他条件
  callback: (context: HookContext) => void | Promise<void>;
}

interface HookContext {
  event: HookEvent;
  tool?: string;
  args?: any;
  result?: any;
  error?: Error;
  sessionId?: string;
  messageUuid?: string;
}

// 我们的钩子配置接口
interface Hook {
  matcher: string | RegExp;
  type: 'command' | 'prompt';
  command?: string;
  prompt?: string;
}

interface HookConfig {
  PreToolUse?: Array<{ matcher: string; hooks: Hook[] }>;
  PostToolUse?: Array<{ matcher: string; hooks: Hook[] }>;
  PostToolUseFailure?: Array<{ matcher: string; hooks: Hook[] }>;
  Notification?: Array<{ matcher: string; hooks: Hook[] }>;
  UserPromptSubmit?: Array<{ matcher: string; hooks: Hook[] }>;
  SessionStart?: Array<{ matcher: string; hooks: Hook[] }>;
  SessionEnd?: Array<{ matcher: string; hooks: Hook[] }>;
  Stop?: Array<{ matcher: string; hooks: Hook[] }>;
  SubagentStart?: Array<{ matcher: string; hooks: Hook[] }>;
  SubagentStop?: Array<{ matcher: string; hooks: Hook[] }>;
  PreCompact?: Array<{ matcher: string; hooks: Hook[] }>;
  PermissionRequest?: Array<{ matcher: string; hooks: Hook[] }>;
}

class HookManager {
  private config: HookConfig = {};
  
  // 从配置加载钩子
  loadHooks(config: HookConfig): void {
    this.config = config;
  }
  
  // 转换为 SDK 格式
  getHooksForSDK(): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
    const result: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {};
    
    for (const [event, matchers] of Object.entries(this.config)) {
      result[event as HookEvent] = matchers.map(m => ({
        matcher: m.matcher,
        callback: async (context: HookContext) => {
          await this.executeHooks(m.hooks, context);
        }
      }));
    }
    
    return result;
  }
  
  private async executeHooks(hooks: Hook[], context: HookContext): Promise<void> {
    for (const hook of hooks) {
      try {
        if (hook.type === 'command') {
          await this.executeCommand(hook.command!, context);
        } else if (hook.type === 'prompt') {
          await this.executePrompt(hook.prompt!, context);
        }
      } catch (error) {
        console.error(`钩子执行失败:`, error);
      }
    }
  }
  
  private async executeCommand(command: string, context: HookContext): Promise<void> {
    // 替换命令中的变量
    const expandedCommand = this.expandVariables(command, context);
    
    // 执行命令
    const { exec } = require('child_process');
    await new Promise((resolve, reject) => {
      exec(expandedCommand, (error: any, stdout: any, stderr: any) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
  }
  
  private async executePrompt(prompt: string, context: HookContext): Promise<void> {
    // 将提示词发送给模型
    // 这需要访问当前的 query 实例
    console.log('执行提示词钩子:', prompt);
  }
  
  private expandVariables(template: string, context: HookContext): string {
    return template
      .replace(/\$TOOL/g, context.tool || '')
      .replace(/\$FILE/g, context.args?.path || '')
      .replace(/\$COMMAND/g, context.args?.command || '');
  }
  
  // 添加钩子
  addHook(event: HookEvent, matcher: string, hook: Hook): void {
    if (!this.config[event]) {
      this.config[event] = [];
    }
    
    const existing = this.config[event]!.find(m => m.matcher === matcher);
    if (existing) {
      existing.hooks.push(hook);
    } else {
      this.config[event]!.push({ matcher, hooks: [hook] });
    }
  }
  
  // 移除钩子
  removeHook(event: HookEvent, matcher: string): void {
    if (this.config[event]) {
      this.config[event] = this.config[event]!.filter(m => m.matcher !== matcher);
    }
  }
}
```

**钩子集成示例**:

```typescript
const hookManager = new HookManager();
hookManager.loadHooks({
  PostToolUse: [
    {
      matcher: 'Write|Edit',
      hooks: [
        {
          type: 'command',
          command: 'npm run lint:fix $FILE'
        }
      ]
    }
  ],
  SessionStart: [
    {
      matcher: '.*',
      hooks: [
        {
          type: 'prompt',
          prompt: '请记住遵循项目的编码规范'
        }
      ]
    }
  ]
});

const options: Options = {
  hooks: hookManager.getHooksForSDK(),
  // ...
};
```

**钩子配置文件示例** (settings.json):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npm run lint:fix $FILE"
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "命令执行失败,请检查错误信息并重试"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "请遵循项目的编码规范和最佳实践"
          }
        ]
      }
    ]
  }
}
```

#### PluginManager
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
  skills?: Skill[];
  hooks?: HookConfig;
  mcpServers?: MCPServerConfig;
}

class PluginManager {
  installPlugin(source: string): Promise<void>;
  uninstallPlugin(name: string): Promise<void>;
  listPlugins(): Plugin[];
  loadPlugin(directory: string): Promise<Plugin>;
}
```

### 5. MCP 组件

#### MCPManager

**重要说明**: Claude Agent SDK 通过 `mcpServers` 配置选项直接集成 MCP,SDK 内部自动处理 MCP 工具的调用,无需手动转换。

```typescript
import { 
  McpServerConfig, 
  McpStdioServerConfig,
  McpSSEServerConfig,
  McpHttpServerConfig,
  McpSdkServerConfigWithInstance
} from '@anthropic-ai/claude-agent-sdk';

// MCP 服务器配置类型
type MCPServerConfig = Record<string, 
  | McpStdioServerConfig      // stdio 传输
  | McpSSEServerConfig        // SSE 传输
  | McpHttpServerConfig       // HTTP 传输
  | McpSdkServerConfigWithInstance  // SDK 内置服务器
>;

// stdio 传输配置
interface McpStdioServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

// SSE 传输配置
interface McpSSEServerConfig {
  transport: 'sse';
  url: string;
  headers?: Record<string, string>;
}

// HTTP 传输配置
interface McpHttpServerConfig {
  transport: 'http';
  url: string;
  headers?: Record<string, string>;
}

class MCPManager {
  private config: MCPServerConfig = {};
  
  // 从配置文件加载 MCP 服务器
  async loadServersFromConfig(configPath: string): Promise<void> {
    const content = await fs.readFile(configPath, 'utf-8');
    this.config = JSON.parse(content);
  }
  
  // 添加 MCP 服务器
  addServer(name: string, config: McpServerConfig): void {
    this.config[name] = config;
  }
  
  // 移除 MCP 服务器
  removeServer(name: string): void {
    delete this.config[name];
  }
  
  // 获取所有服务器配置
  getServersConfig(): MCPServerConfig {
    return this.config;
  }
  
  // 获取服务器列表
  listServers(): string[] {
    return Object.keys(this.config);
  }
  
  // 验证服务器配置
  validateConfig(config: McpServerConfig): boolean {
    if ('command' in config) {
      // stdio 配置
      return typeof config.command === 'string' && Array.isArray(config.args);
    } else if ('transport' in config) {
      // SSE 或 HTTP 配置
      return typeof config.url === 'string';
    }
    return false;
  }
}
```

**MCP 集成策略**:

1. **加载 MCP 服务器配置**:
   - 从 `.mcp.json` 或 `mcp.json` 读取配置
   - 支持多种传输类型: stdio, SSE, HTTP, SDK

2. **SDK 自动处理**:
   - 将 MCP 配置传递给 `query()` 的 `mcpServers` 选项
   - SDK 自动启动 MCP 服务器进程
   - SDK 自动将 MCP 工具注册为可用工具
   - SDK 自动处理工具调用和结果返回

3. **集成示例**:
```typescript
const mcpManager = new MCPManager();
await mcpManager.loadServersFromConfig('.mcp.json');

const options: Options = {
  // 直接传递 MCP 配置给 SDK
  mcpServers: mcpManager.getServersConfig(),
  
  // MCP 工具会自动添加到可用工具列表
  // 可以通过 allowedTools 控制访问
  allowedTools: [
    'Read', 'Write', 'Bash',
    'ListMcpResources', 'ReadMcpResource'  // MCP 相关工具
  ],
  
  // 严格模式:验证 MCP 配置
  strictMcpConfig: true,
  
  // ...
};

// 运行时查询 MCP 服务器状态
const queryInstance = query({ prompt: message, options });
const mcpStatus = await queryInstance.mcpServerStatus();
console.log('MCP 服务器状态:', mcpStatus);
```

4. **MCP 配置文件示例**:

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"
    }
  },
  "database": {
    "command": "python",
    "args": ["-m", "mcp_server_postgres"],
    "env": {
      "DATABASE_URL": "${DATABASE_URL}"
    }
  },
  "weather": {
    "transport": "sse",
    "url": "https://weather-mcp.example.com/sse",
    "headers": {
      "Authorization": "Bearer ${WEATHER_API_KEY}"
    }
  }
}
```

5. **MCP 工具使用**:
   - MCP 服务器提供的工具会自动注册
   - 工具名称格式: `<server-name>_<tool-name>`
   - 通过 `ListMcpResources` 和 `ReadMcpResource` 访问 MCP 资源
   - SDK 自动处理工具调用的路由和结果返回

**注意事项**:
- SDK 会自动管理 MCP 服务器的生命周期(启动、停止、重连)
- 不需要手动转换 MCP 工具为 SDK 工具格式
- 使用 `strictMcpConfig: true` 可以启用严格的配置验证
- 可以通过 `Query.mcpServerStatus()` 查询服务器状态

### 6. 配置组件

#### ConfigManager
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
}

class ConfigManager {
  loadUserConfig(): Promise<UserConfig>;
  loadProjectConfig(directory: string): Promise<ProjectConfig>;
  mergeConfigs(user: UserConfig, project: ProjectConfig, local?: ProjectConfig): ProjectConfig;
  
  saveConfig(config: UserConfig | ProjectConfig, path: string): Promise<void>;
  
  // 加载 CLAUDE.md 文件内容(需要显式调用)
  loadClaudeMd(directory: string): Promise<string | null>;
  
  // 加载 settings.json 配置(需要显式调用)
  loadSettings(directory: string): Promise<UserConfig | null>;
}
```

**重要说明**: Claude Agent SDK v0.1.x 不再自动加载 CLAUDE.md 和 settings.json。我们的实现需要:
1. 显式读取这些配置文件
2. 手动将内容注入到 `systemPrompt` 或其他配置选项中
3. 在会话初始化时主动加载和应用这些配置

### 7. 权限组件

#### PermissionManager

**重要说明**: Claude Agent SDK 使用 `permissionMode` 和 `canUseTool` 函数来控制权限,而非自定义的 PermissionConfig 接口。

**SDK 权限模式**:

```typescript
type PermissionMode =
  | 'default'           // 默认模式:某些工具需要确认
  | 'acceptEdits'       // 自动接受文件编辑
  | 'bypassPermissions' // 绕过所有权限检查
  | 'plan'              // 计划模式:不执行工具,只生成计划
```

**权限配置接口**:

```typescript
import { CanUseTool, PermissionMode } from '@anthropic-ai/claude-agent-sdk';

interface PermissionConfig {
  mode: PermissionMode;
  allowedTools?: string[];           // 工具白名单
  disallowedTools?: string[];        // 工具黑名单
  allowDangerouslySkipPermissions?: boolean;  // 危险:跳过所有权限
  customPermissionHandler?: CanUseTool;       // 自定义权限函数
}

// CanUseTool 函数签名
type CanUseTool = (params: {
  tool: string;
  args: Record<string, unknown>;
  context: {
    sessionId: string;
    messageUuid: string;
  };
}) => boolean | Promise<boolean>;

class PermissionManager {
  constructor(
    private config: PermissionConfig,
    private ui: InteractiveUI
  );
  
  // 创建 SDK 兼容的权限处理函数
  createCanUseToolHandler(): CanUseTool {
    return async ({ tool, args, context }) => {
      // 1. 检查黑名单
      if (this.config.disallowedTools?.includes(tool)) {
        return false;
      }
      
      // 2. 检查白名单
      if (this.config.allowedTools && !this.config.allowedTools.includes(tool)) {
        return false;
      }
      
      // 3. 危险模式:跳过所有检查
      if (this.config.allowDangerouslySkipPermissions) {
        return true;
      }
      
      // 4. 根据权限模式决定
      switch (this.config.mode) {
        case 'bypassPermissions':
          return true;
        
        case 'acceptEdits':
          // 自动接受文件编辑,其他需要确认
          if (['Write', 'Edit'].includes(tool)) {
            return true;
          }
          return this.promptUser(tool, args);
        
        case 'plan':
          // 计划模式:不执行任何工具
          return false;
        
        case 'default':
        default:
          // 默认模式:某些工具需要确认
          return this.shouldPromptForTool(tool) 
            ? this.promptUser(tool, args)
            : true;
      }
    };
  }
  
  private shouldPromptForTool(tool: string): boolean {
    // 需要用户确认的工具
    const dangerousTools = ['Write', 'Edit', 'Bash', 'KillBash'];
    return dangerousTools.includes(tool);
  }
  
  private async promptUser(tool: string, args: any): Promise<boolean> {
    const message = this.formatPermissionRequest(tool, args);
    return this.ui.promptConfirmation(message);
  }
  
  private formatPermissionRequest(tool: string, args: any): string {
    switch (tool) {
      case 'Write':
        return `允许写入文件: ${args.path}?`;
      case 'Edit':
        return `允许编辑文件: ${args.path}?`;
      case 'Bash':
        return `允许执行命令: ${args.command}?`;
      default:
        return `允许使用工具 ${tool}?`;
    }
  }
  
  // 运行时修改权限模式
  setMode(mode: PermissionMode): void {
    this.config.mode = mode;
  }
  
  // 添加到白名单
  addToAllowedTools(tool: string): void {
    if (!this.config.allowedTools) {
      this.config.allowedTools = [];
    }
    if (!this.config.allowedTools.includes(tool)) {
      this.config.allowedTools.push(tool);
    }
  }
  
  // 添加到黑名单
  addToDisallowedTools(tool: string): void {
    if (!this.config.disallowedTools) {
      this.config.disallowedTools = [];
    }
    if (!this.config.disallowedTools.includes(tool)) {
      this.config.disallowedTools.push(tool);
    }
  }
}
```

**权限集成示例**:

```typescript
// 1. 创建权限管理器
const permissionManager = new PermissionManager(
  {
    mode: 'default',
    allowedTools: ['Read', 'Grep'],  // 这些工具总是允许
    disallowedTools: ['WebFetch'],   // 这些工具总是禁止
  },
  ui
);

// 2. 在 query() 选项中使用
const options: Options = {
  permissionMode: permissionManager.config.mode,
  allowedTools: permissionManager.config.allowedTools,
  disallowedTools: permissionManager.config.disallowedTools,
  canUseTool: permissionManager.createCanUseToolHandler(),
  allowDangerouslySkipPermissions: permissionManager.config.allowDangerouslySkipPermissions,
  // ...
};

// 3. 运行时修改权限模式(通过 Query 对象)
const queryInstance = query({ prompt: message, options });
await queryInstance.setPermissionMode('acceptEdits');
```

**权限模式说明**:

- **`default`**: 默认模式,危险操作(Write, Edit, Bash)需要用户确认
- **`acceptEdits`**: 自动接受文件编辑,其他危险操作仍需确认
- **`bypassPermissions`**: 绕过所有权限检查,自动执行所有工具
- **`plan`**: 计划模式,不执行任何工具,只生成执行计划

### 8. 回退组件

#### RewindManager
```typescript
interface Snapshot {
  id: string;
  timestamp: Date;
  description: string;
  files: Map<string, string>;  // path -> content
}

class RewindManager {
  captureSnapshot(description: string, files: string[]): Promise<Snapshot>;
  restoreSnapshot(snapshotId: string): Promise<void>;
  listSnapshots(): Snapshot[];
  
  private maxSnapshots = 50;
}
```

## 数据模型

### SDK 配置加载策略

**重要**: Claude Agent SDK v0.1.x 提供 `settingSources` 选项来控制配置加载,可以自动加载 CLAUDE.md 和其他配置文件。

```typescript
import { Options, SettingSource } from '@anthropic-ai/claude-agent-sdk';

// 配置源类型
type SettingSource = 'user' | 'project' | 'local';

class SDKConfigLoader {
  // 加载完整配置
  async loadFullConfig(workingDir: string): Promise<Partial<Options>> {
    // 1. 加载用户级配置
    const userConfig = await this.loadUserConfig();
    
    // 2. 加载项目级配置
    const projectConfig = await this.loadProjectConfig(workingDir);
    
    // 3. 合并配置
    return this.mergeConfigs(userConfig, projectConfig);
  }
  
  // 加载用户级配置 (~/.claude/settings.json)
  private async loadUserConfig(): Promise<Partial<Options>> {
    const configPath = path.join(os.homedir(), '.claude', 'settings.json');
    
    if (!await this.fileExists(configPath)) {
      return {};
    }
    
    const content = await fs.readFile(configPath, 'utf-8');
    return this.parseConfig(content);
  }
  
  // 加载项目级配置 (.claude/settings.json)
  private async loadProjectConfig(workingDir: string): Promise<Partial<Options>> {
    const configPath = path.join(workingDir, '.claude', 'settings.json');
    
    if (!await this.fileExists(configPath)) {
      return {};
    }
    
    const content = await fs.readFile(configPath, 'utf-8');
    return this.parseConfig(content);
  }
  
  // 解析配置文件
  private parseConfig(content: string): Partial<Options> {
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
      // ...
    };
  }
  
  // 合并配置(项目配置覆盖用户配置)
  private mergeConfigs(
    userConfig: Partial<Options>,
    projectConfig: Partial<Options>
  ): Partial<Options> {
    return {
      ...userConfig,
      ...projectConfig,
      
      // 数组类型需要特殊处理
      allowedTools: projectConfig.allowedTools || userConfig.allowedTools,
      disallowedTools: [
        ...(userConfig.disallowedTools || []),
        ...(projectConfig.disallowedTools || [])
      ],
      
      // 对象类型需要深度合并
      mcpServers: {
        ...userConfig.mcpServers,
        ...projectConfig.mcpServers
      },
      agents: {
        ...userConfig.agents,
        ...projectConfig.agents
      },
      hooks: this.mergeHooks(userConfig.hooks, projectConfig.hooks),
    };
  }
  
  // 合并钩子配置
  private mergeHooks(
    userHooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>,
    projectHooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>
  ): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
    const result: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {};
    
    // 合并所有钩子事件
    const allEvents = new Set([
      ...Object.keys(userHooks || {}),
      ...Object.keys(projectHooks || {})
    ]);
    
    for (const event of allEvents) {
      result[event as HookEvent] = [
        ...(userHooks?.[event as HookEvent] || []),
        ...(projectHooks?.[event as HookEvent] || [])
      ];
    }
    
    return result;
  }
  
  // 使用 SDK 的 settingSources 选项
  async buildOptionsWithSettingSources(
    workingDir: string,
    sources: SettingSource[] = ['project']
  ): Promise<Partial<Options>> {
    return {
      // 使用 settingSources 让 SDK 自动加载配置
      settingSources: sources,
      
      // 使用预设系统提示词(会自动包含 CLAUDE.md)
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: await this.loadAdditionalPrompt(workingDir)
      },
      
      // 使用预设工具集
      tools: {
        type: 'preset',
        preset: 'claude_code'
      },
      
      // 工作目录
      cwd: workingDir,
      
      // 其他配置...
    };
  }
  
  // 加载额外的系统提示词
  private async loadAdditionalPrompt(workingDir: string): Promise<string | undefined> {
    const promptPath = path.join(workingDir, '.claude', 'additional-prompt.md');
    
    if (await this.fileExists(promptPath)) {
      return fs.readFile(promptPath, 'utf-8');
    }
    
    return undefined;
  }
  
  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
}
```

**配置加载策略说明**:

1. **使用 `settingSources` (推荐)**:
   ```typescript
   const options: Options = {
     settingSources: ['user', 'project', 'local'],  // 按优先级加载
     systemPrompt: { type: 'preset', preset: 'claude_code' },  // 自动包含 CLAUDE.md
     tools: { type: 'preset', preset: 'claude_code' },
     // ...
   };
   ```
   - SDK 会自动加载指定源的配置
   - `'user'`: ~/.claude/settings.json
   - `'project'`: .claude/settings.json
   - `'local'`: 本地配置(优先级最高)

2. **手动加载配置**:
   ```typescript
   const configLoader = new SDKConfigLoader();
   const config = await configLoader.loadFullConfig(workingDir);
   
   // 认证由 SDK 自动从 Claude Code 配置获取
   const options: Options = {
     ...config,
     settingSources: ['user', 'project'],  // 加载认证信息
     // ...
   };
   ```

3. **混合方式**:
   ```typescript
   const options: Options = {
     settingSources: ['user', 'project'],  // 让 SDK 加载配置和认证
     
     // 手动覆盖特定选项
     model: 'claude-3-5-sonnet-latest',
     maxTurns: 50,
     
     // 添加额外的系统提示词
     systemPrompt: {
       type: 'preset',
       preset: 'claude_code',
       append: '请特别注意代码安全性'
     },
     
     // ...
   };
   ```

**配置优先级**:
- 命令行参数 > 本地配置 > 项目配置 > 用户配置 > 默认值
- `settingSources` 数组中后面的源优先级更高

### 配置文件结构

#### settings.json
```json
{
  "model": "claude-3-5-sonnet-latest",
  "maxTurns": 50,
  "maxBudgetUsd": 10.0,
  "maxThinkingTokens": 10000,
  "enableFileCheckpointing": true,
  
  "allowedTools": ["Read", "Write", "Edit", "Bash", "Grep", "Glob"],
  "disallowedTools": ["WebFetch", "WebSearch"],
  
  "permissionMode": "default",
  "allowDangerouslySkipPermissions": false,
  
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "excludedCommands": ["rm -rf /", "dd if=/dev/zero"],
    "allowUnsandboxedCommands": false,
    "network": {
      "allowedDomains": ["github.com", "npmjs.com"],
      "blockedDomains": []
    },
    "ignoreViolations": {
      "network": false,
      "filesystem": false
    },
    "enableWeakerNestedSandbox": false
  },
  
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npm run lint:fix $FILE"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "请遵循项目的编码规范"
          }
        ]
      }
    ]
  },
  
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  },
  
  "agents": {
    "reviewer": {
      "description": "代码审查专家",
      "model": "sonnet",
      "prompt": "你是专家代码审查员...",
      "tools": ["Read", "Grep"]
    }
  },
  
  "outputFormat": "text",
  "includePartialMessages": false,
  "executable": "node",
  "executableArgs": ["--max-old-space-size=4096"]
}
```

#### .mcp.json
```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"
    }
  },
  "database": {
    "command": "python",
    "args": ["-m", "mcp_server_postgres"],
    "env": {
      "DATABASE_URL": "${DATABASE_URL}"
    }
  },
  "weather": {
    "transport": "sse",
    "url": "https://weather-mcp.example.com/sse",
    "headers": {
      "Authorization": "Bearer ${WEATHER_API_KEY}"
    }
  },
  "api-server": {
    "transport": "http",
    "url": "https://api.example.com/mcp",
    "headers": {
      "X-API-Key": "${API_KEY}"
    }
  }
}
```

#### CLAUDE.md
```markdown
# 项目上下文

这是一个 TypeScript 项目,使用 Node.js 18+ 和 npm。

## 编码规范

- 使用 TypeScript 严格模式
- 遵循 ESLint 配置
- 使用 Prettier 格式化代码
- 所有函数必须有 JSDoc 注释

## 项目结构

- `src/` - 源代码
- `tests/` - 测试文件
- `docs/` - 文档

## 开发流程

1. 创建功能分支
2. 编写代码和测试
3. 运行 `npm test` 确保测试通过
4. 运行 `npm run lint` 检查代码质量
5. 提交 PR

## 注意事项

- 不要直接修改 `main` 分支
- 所有 API 调用必须有错误处理
- 敏感信息使用环境变量
```

#### SKILL.md
```markdown
---
name: typescript-expert
description: TypeScript 和 Node.js 专家
triggers:
  - TypeScript development
  - Node.js
  - npm
tools:
  - Read
  - Write
  - Bash
  - Grep
---

# TypeScript 开发专家技能

## 核心能力
- TypeScript 5.0+ 高级特性
- Node.js 18+ API 和最佳实践
- npm 包管理和发布
- 异步编程和 Promise 处理

## 编码标准
- 使用严格的类型检查
- 避免使用 `any` 类型
- 优先使用函数式编程风格
- 使用现代 ES2022+ 特性

## 常用模式
- 使用 async/await 处理异步操作
- 使用泛型提高代码复用性
- 使用装饰器简化元编程
- 使用类型守卫确保类型安全
```

#### command.md
```markdown
---
name: test
description: 运行所有单元测试
argument-hint: [test-pattern]
allowed-tools:
  - Bash
  - Read
---

运行项目的单元测试:

1. 执行 `npm test $ARGUMENTS`
2. 分析测试结果
3. 如果有失败,展示失败原因和堆栈跟踪
4. 提供修复建议
```

#### agent.md
```markdown
---
description: 代码审查专家,专注于安全性和性能
model: sonnet
tools:
  - Read
  - Grep
---

你是专家代码审查员,关注:
- 安全漏洞和潜在风险
- 性能瓶颈和优化机会
- 代码可维护性和可读性
- 最佳实践和编码规范

审查代码时,请提供:
1. 发现的问题列表(按严重程度排序)
2. 每个问题的详细说明
3. 具体的改进建议
4. 代码示例(如果适用)

审查重点:
- SQL 注入、XSS 等安全问题
- 内存泄漏、性能瓶颈
- 代码重复、过度复杂
- 缺少错误处理
- 不符合项目规范
```

#### 沙箱配置说明

**SandboxSettings 接口**:

```typescript
type SandboxSettings = {
  enabled?: boolean;                    // 是否启用沙箱
  autoAllowBashIfSandboxed?: boolean;   // 沙箱中自动允许 Bash
  excludedCommands?: string[];          // 排除的命令列表
  allowUnsandboxedCommands?: boolean;   // 允许非沙箱命令
  network?: NetworkSandboxSettings;     // 网络沙箱设置
  ignoreViolations?: SandboxIgnoreViolations;  // 忽略违规
  enableWeakerNestedSandbox?: boolean;  // 启用较弱的嵌套沙箱
}

type NetworkSandboxSettings = {
  allowedDomains?: string[];   // 允许的域名
  blockedDomains?: string[];   // 阻止的域名
}

type SandboxIgnoreViolations = {
  network?: boolean;      // 忽略网络违规
  filesystem?: boolean;   // 忽略文件系统违规
}
```

**沙箱使用示例**:

```typescript
const options: Options = {
  sandbox: {
    enabled: true,
    autoAllowBashIfSandboxed: true,
    excludedCommands: [
      'rm -rf /',
      'dd if=/dev/zero',
      'mkfs',
      'format'
    ],
    network: {
      allowedDomains: [
        'github.com',
        'npmjs.com',
        'api.anthropic.com'
      ],
      blockedDomains: [
        'malicious-site.com'
      ]
    },
    ignoreViolations: {
      network: false,
      filesystem: false
    }
  },
  // ...
};
```

### 会话存储结构

```
~/.claude-replica/sessions/
├── <session-id>/
│   ├── metadata.json
│   ├── messages.json
│   ├── context.json
│   └── snapshots/
│       ├── <snapshot-id>.json
│       └── ...
└── ...
```

#### metadata.json
```json
{
  "id": "session-123",
  "createdAt": "2025-01-01T00:00:00Z",
  "lastAccessedAt": "2025-01-01T01:00:00Z",
  "workingDirectory": "/path/to/project",
  "expired": false
}
```

## 正确性属性

*属性是一个特征或行为,应该在系统的所有有效执行中保持为真。属性作为人类可读规范和机器可验证正确性保证之间的桥梁。*

### 属性 1: 配置合并的优先级

*对于任意*用户配置、项目配置和本地配置,合并后的配置应该遵循优先级规则:本地配置覆盖项目配置,项目配置覆盖用户配置。

**验证: 需求 7.3**

### 属性 2: 会话恢复的完整性

*对于任意*保存的会话,恢复后的会话应该包含相同的消息历史、上下文和状态。

**验证: 需求 6.3, 6.4**

### 属性 3: 技能匹配的一致性

*对于任意*对话上下文和技能集合,如果技能的描述或触发器匹配上下文,则该技能应该被激活。

**验证: 需求 8.2**

### 属性 4: 工具权限的安全性

*对于任意*工具调用,如果该工具不在白名单中且不在自动批准模式,则必须请求用户确认。

**验证: 需求 14.1, 14.3**

### 属性 5: MCP 工具调用的透明性

*对于任意*MCP 工具调用,系统应该正确地将请求转发到对应的 MCP 服务器并返回结果。

**验证: 需求 12.3, 12.4**

### 属性 6: 回退操作的可逆性

*对于任意*文件修改序列,如果创建了快照,则回退到该快照应该恢复所有文件到快照时的状态。

**验证: 需求 15.3**

### 属性 7: 命令参数替换的正确性

*对于任意*命令模板和参数,执行命令时 $ARGUMENTS 应该被正确替换为用户提供的参数。

**验证: 需求 9.3**

### 属性 8: 子代理上下文的隔离性

*对于任意*子代理执行的任务,其上下文应该与主会话隔离,不影响主会话的上下文窗口。

**验证: 需求 10.5**

### 属性 9: 钩子触发的准确性

*对于任意*工具使用事件,如果钩子的匹配器匹配工具名称,则该钩子应该被触发。

**验证: 需求 11.2**

### 属性 10: 输出格式的一致性

*对于任意*输出格式选项,系统输出应该严格遵循指定的格式(JSON、stream-json、markdown 或 text)。

**验证: 需求 17.1, 17.2, 17.3**

### 属性 11: 会话过期的时效性

*对于任意*会话,如果从创建时间起超过 5 小时,则该会话应该被标记为过期。

**验证: 需求 6.5**

### 属性 12: 插件加载的完整性

*对于任意*已安装的插件,系统应该加载插件中定义的所有命令、代理、技能和钩子。

**验证: 需求 13.2**

## 错误处理

### API 错误处理

1. **速率限制错误**
   - 检测 429 状态码
   - 实现指数退避重试
   - 显示剩余配额和重置时间

2. **认证错误**
   - 检测 401/403 状态码
   - 提示用户检查 Claude Code 配置（`claude login`）
   - 在 CI 环境中提示检查 ANTHROPIC_API_KEY 环境变量

3. **网络错误**
   - 检测连接超时和网络中断
   - 自动重试最多 3 次
   - 显示重试进度

### 工具执行错误

1. **文件操作错误**
   - 捕获文件不存在、权限不足等错误
   - 提供清晰的错误消息
   - 建议可能的解决方案

2. **命令执行错误**
   - 捕获命令不存在、执行失败等错误
   - 返回完整的 stderr 输出
   - 记录退出码

3. **MCP 连接错误**
   - 检测 MCP 服务器连接失败
   - 提供调试信息
   - 支持手动重连

### 配置错误

1. **配置文件格式错误**
   - 验证 JSON 格式
   - 提供详细的解析错误位置
   - 建议修复方案

2. **配置值验证错误**
   - 检查必需字段
   - 验证值的类型和范围
   - 提供默认值

### 用户输入错误

1. **命令行参数错误**
   - 验证参数格式
   - 显示帮助信息
   - 提供使用示例

2. **交互式输入错误**
   - 处理无效的命令
   - 提供命令建议
   - 显示可用命令列表

## 测试策略

### 单元测试

使用 Jest 作为测试框架,为每个组件编写单元测试:

1. **CLI 组件测试**
   - 测试命令行参数解析
   - 测试各种选项组合
   - 测试错误处理

2. **配置管理测试**
   - 测试配置加载和合并
   - 测试配置验证
   - 测试配置优先级
   - **测试 `settingSources` 的配置加载**
   - **测试预设系统提示词的使用**

3. **工具管理测试**
   - 测试工具名称验证
   - 测试工具启用/禁用逻辑
   - 测试 `allowedTools` 和 `disallowedTools` 的处理
   - **测试工具与 SDK 的集成**

4. **扩展系统测试**
   - 测试技能加载和匹配
   - 测试命令执行
   - 测试钩子触发
   - 测试子代理定义转换

5. **SDK 集成测试**
   - 测试 `query()` 函数的调用(使用对象参数)
   - 测试 `Options` 接口的构建
   - 测试 `SDKMessage` 类型的处理
   - 测试流式消息处理
   - 测试 `Query` 对象的控制方法

6. **权限系统测试**
   - 测试 `PermissionMode` 枚举值
   - 测试 `canUseTool` 函数的创建和执行
   - 测试权限模式切换
   - 测试工具白名单和黑名单

7. **MCP 集成测试**
   - 测试 MCP 配置加载
   - 测试多种传输类型(stdio, SSE, HTTP)
   - 测试 MCP 服务器状态查询
   - 测试 `strictMcpConfig` 验证

8. **沙箱功能测试**
   - 测试沙箱启用/禁用
   - 测试命令排除列表
   - 测试网络沙箱设置
   - 测试违规处理

### 属性测试

使用 fast-check 进行基于属性的测试,每个测试运行至少 100 次迭代:

1. **配置合并属性测试**
   - **Feature: claude-code-replica, Property 1: 配置合并的优先级**
   - 生成随机配置对象
   - 验证合并后的优先级正确

2. **会话恢复属性测试**
   - **Feature: claude-code-replica, Property 2: 会话恢复的完整性**
   - 生成随机会话数据
   - 验证保存和恢复的一致性

3. **技能匹配属性测试**
   - **Feature: claude-code-replica, Property 3: 技能匹配的一致性**
   - 生成随机技能和上下文
   - 验证匹配逻辑的正确性

4. **权限检查属性测试**
   - **Feature: claude-code-replica, Property 4: 工具权限的安全性**
   - 生成随机工具调用
   - 验证权限检查的正确性

5. **回退操作属性测试**
   - **Feature: claude-code-replica, Property 6: 回退操作的可逆性**
   - 生成随机文件修改序列
   - 验证回退后文件状态正确

### 集成测试

1. **端到端工作流测试**
   - 测试完整的用户交互流程
   - 测试文件操作和命令执行
   - 测试会话保存和恢复

2. **MCP 集成测试**
   - 测试 MCP 服务器连接
   - 测试工具调用和结果返回
   - 测试错误处理

3. **扩展系统集成测试**
   - 测试技能、命令、代理的协同工作
   - 测试钩子的触发和执行
   - 测试插件的加载和卸载

4. **SDK 类型兼容性测试**
   - 测试 `Options` 接口的所有字段
   - 测试 `SDKMessage` 类型的所有变体
   - 测试 `Query` 接口的所有方法
   - 测试 `AgentDefinition` 类型
   - 测试 `HookEvent` 枚举
   - 测试 `PermissionMode` 枚举

### 测试覆盖率目标

- 代码覆盖率: ≥ 80%
- 分支覆盖率: ≥ 75%
- 关键路径覆盖率: 100%

### 测试环境

- Node.js 20+ (推荐 22 LTS)
- TypeScript 5.9+
- Jest 30+
- fast-check 3.0+
- @anthropic-ai/claude-agent-sdk ^0.1.74

**版本说明**:
- **Node.js**: 推荐使用 Node.js 22 LTS,最低要求 Node.js 20
- **TypeScript**: 使用 5.9.2 或更高版本,支持最新的 ES2024 特性
- **Jest**: 使用 Jest 30,注意迁移指南中的 API 变更(如 `toBeCalled()` → `toHaveBeenCalled()`)
- **fast-check**: 使用 3.0 或更高版本进行属性测试
- **@anthropic-ai/claude-agent-sdk**: 使用 V0.1.x 版本 (^0.1.76),确保 API 稳定性

**安装命令**:
```bash
npm install --save @anthropic-ai/claude-agent-sdk@^0.1.76
npm install --save-dev typescript@^5.9.0 jest@^30.0.0 fast-check@^3.0.0
```

### 持续集成

- 每次提交自动运行所有测试
- PR 合并前必须通过所有测试
- 定期运行性能测试和压力测试
- 定期验证与最新 SDK 版本的兼容性
