# GEMINI.md

## 回复
- 与用户的所有交互回复必须使用中文，保持简洁、友好、事实准确。

## 代码注释
- 仅在代码本身难以自解释时才添加注释，并保持表述短小清晰。
- 避免描述显而易见的操作，注释应帮助读者理解复杂逻辑或关键约束。

## 日志
- 统一使用英文输出日志信息，确保便于检索和分析。
- 按重要程度选择日志级别，必要时附加结构化上下文，便于排障。

## 魔法值
禁止硬编码数值，所有配置参数必须定义为具名常量并支持环境变量配置：`const PARAM = parseInt(process.env.ENV_VAR || 'default', 10);`

# 文件头文档规范

## 规则说明

所有代码文件（.ts, .js, .tsx, .jsx 等）必须在文件顶部包含规范的文档注释，说明文件的功能、核心类/方法及其作用。

## 强制要求

每个代码文件的头部必须包含以下信息：

### 1. 文件功能说明
简要描述该文件的主要职责和提供的功能（1-3 句话）。

### 2. 核心导出列表
列出文件中导出的核心类、方法、常量等。

### 3. 作用说明
为每个核心类和方法提供简短的作用说明（一句话概括即可）。

## 文档格式示例

### TypeScript 文件示例

```typescript
/**
 * 文件功能：会话管理模块，负责创建、保存、加载和清理用户会话
 *
 * 核心类：
 * - SessionManager: 会话生命周期管理器
 *
 * 核心方法：
 * - createSession(): 创建新会话实例
 * - loadSession(): 从磁盘加载指定会话数据
 * - saveSession(): 持久化会话到本地存储
 * - cleanExpiredSessions(): 清理过期会话
 * - resumeSession(): 恢复现有会话并支持 SDK 会话续接
 */

export class SessionManager {
  // 实现代码...
}
```

### JavaScript 文件示例

```javascript
/**
 * 文件功能：工具函数集合，提供字符串处理、日期格式化等通用功能
 *
 * 核心方法：
 * - formatDate(): 将日期格式化为指定字符串格式
 * - sanitizeInput(): 清理用户输入，移除危险字符
 * - parseTemplate(): 模板变量替换
 */

export function formatDate(date, format) {
  // 实现代码...
}
```

## 适用范围

- 所有 src/ 目录下的源代码文件
- 测试文件（tests/）可使用简化版本，但仍需说明测试的主要目标
- 配置文件和脚本建议添加但不强制

## 检查清单

在提交代码前，确保：
- [ ] 文件头包含功能说明
- [ ] 列出了所有核心导出（类、方法、常量）
- [ ] 每个核心导出都有简短的作用说明
- [ ] 文档与实际代码保持同步

## 注意事项

- 文档应简洁明了，避免冗长描述
- 当文件内容发生重大变更时，必须同步更新文件头文档
- 对于复杂的类和方法，可在类/方法定义处添加更详细的 JSDoc/TSDoc 注释


This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Replica is a command-line tool that replicates Claude Code functionality using the Claude Agent SDK. It provides AI-assisted programming capabilities with an extensible architecture supporting skills, commands, sub-agents, hooks, and MCP integration.

## Development Commands

### Building & Running
```bash
npm run build              # Compile TypeScript to dist/
npm run dev                # Watch mode compilation
npm run start              # Run the CLI (requires prior build)
npm run clean              # Remove dist/ directory
```

### Testing
```bash
npm test                   # Run all tests with Jest
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Generate coverage report
npm run test:property      # Run fast-check property tests (60s timeout)
```

Terminal interaction tests (node-pty CLI emulation suite) have been removed and are no longer exposed via npm scripts.

### Code Quality
```bash
npm run lint               # Check code with ESLint
npm run lint:fix           # Auto-fix ESLint issues
npm run format             # Format code with Prettier
npm run format:check       # Check formatting without changes
```

## Core Architecture

### Main Entry Flow
1. **`cli.ts`** - CLI entry point, creates UIFactory via `UIFactoryRegistry` and starts `Application`
2. **`main.ts`** - `Application` class orchestrates all subsystems
3. **`MessageRouter`** - Routes user messages to SDK, builds system prompts
4. **`SDKQueryExecutor`** - Wraps Claude Agent SDK `query()` function
5. **`StreamingMessageProcessor`** - Handles SDK response stream
6. **`SessionManager`** - Manages conversation persistence

### SDK Integration Layer

All SDK interactions flow through `src/sdk/SDKQueryExecutor.ts`:
- Maps internal options to SDK `Options` format
- Handles async generator stream from SDK
- Classifies errors (network, auth, rate_limit, timeout, interrupted, unknown)
- Supports session resumption via SDK session IDs

**Critical**: When modifying SDK integration, only change `SDKQueryExecutor.ts` and `MessageRouter.ts`. The SDK is imported from `@anthropic-ai/claude-agent-sdk`.

### UI Factory Layer
- **UIFactoryRegistry** (`src/ui/factories/UIFactoryRegistry.ts`): Selects UIFactory via `CLAUDE_UI_TYPE`
- **UIFactory** (`src/ui/factories/UIFactory.ts`): Creates ParserInterface and OutputInterface

### Configuration System

Configuration loads from three levels (priority: Local > Project > User):
1. User: `~/.claude-replica/settings.json`
2. Project: `.claude-replica/settings.json`
3. Local: `.claude-replica/settings.local.json`

Configs deep-merge through `ConfigManager.mergeConfigs()`. All SDK options are configurable: model, tools, permissions, MCP servers, hooks, agents, sandbox settings.

### Environment Variables

Configuration via `.env` file in project root. All configurable parameters read from environment variables with defaults: `const PARAM = parseInt(process.env.ENV_VAR || 'default', 10);`

### Session Persistence

Sessions stored in `~/.claude-replica/sessions/session-{timestamp}-{id}/`:
- `metadata.json` - id, timestamps, expiry (configurable via `SESSION_EXPIRY_HOURS`), sdkSessionId
- `messages.json` - conversation history
- `context.json` - loaded skills, agents, configs
- `snapshots/` - rewind system snapshots

Sessions auto-save after each operation. Expired sessions are cleaned up automatically based on `SESSION_EXPIRY_HOURS` (default: 5 hours).

## Extension Systems

### Skills System (`src/skills/`)
- **Purpose**: Domain knowledge and workflow guides injected into system prompt
- **Format**: `*.skill.md` files with YAML frontmatter
- **Locations**: `~/.claude/skills/` (user) and `.claude-replica/skills/` (project)
- **Loading**: Auto-loaded via `SkillManager`, merged into system prompt by `MessageRouter`
- **Frontmatter**: `name`, `description`, `triggers[]`, `tools[]`

### Commands System (`src/commands/`)
- **Purpose**: Reusable command templates with parameter substitution
- **Format**: `*.command.md` files with YAML frontmatter
- **Invocation**: `/user:command` or `/project:command`
- **Features**: Template variables (`$ARGUMENTS`), embedded command output, tool allowlists

### Agents System (`src/agents/`)
- **Purpose**: Specialized sub-agents for specific tasks
- **Format**: `*.agent.md` files with YAML frontmatter
- **Registration**: `AgentRegistry` loads definitions
- **Definition**: `description`, `model` (sonnet/opus/haiku/inherit), `prompt`, `tools[]`
- **SDK Integration**: Passed to SDK as `AgentDefinition[]` in options

### Hooks System (`src/hooks/`)
- **Purpose**: Event-driven automation on tool/session events
- **Config**: `.claude-replica/hooks.json`
- **Events**: 12 types including PreToolUse, PostToolUse, SessionStart, UserPromptSubmit, etc.
- **Actions**: Command execution or prompt injection
- **Matchers**: Regex patterns for filtering events

### MCP Integration (`src/mcp/`)
- **Purpose**: Model Context Protocol server management
- **Config**: `*.mcp.json` files in project root
- **Transports**: stdio (command+args), SSE (HTTP streaming), HTTP (REST)
- **Manager**: `MCPManager` validates configs, manages server lifecycle

## Tool System

### Built-in Tools (`src/tools/ToolRegistry.ts`)
11 tool categories registered in `ToolRegistry`:
- File ops: Read, Write, Edit
- Commands: Bash, BashOutput, KillBash
- Search: Grep, Glob
- User interaction: AskUserQuestion
- Network: WebFetch, WebSearch
- Tasks: Task (sub-agents), TodoWrite
- Jupyter: NotebookEdit
- Plan mode: ExitPlanMode
- MCP: ListMcpResources, ReadMcpResource

### Permission Management (`src/permissions/`)
Modes: `default`, `acceptEdits`, `bypassPermissions`, `plan`

Permission flow:
1. Check disallowedTools blacklist
2. Check allowedTools whitelist
3. Check bypass flag
4. Check Bash command filters
5. Prompt user (if mode requires)

All permission checks flow through `PermissionManager.createCanUseToolHandler()`.

## Key Design Patterns

### Manager Pattern
Each subsystem has a manager class:
- `SessionManager` - session lifecycle
- `ConfigManager` - config loading/merging
- `SkillManager` - skill loading
- `CommandManager` - command templates
- `AgentRegistry` - sub-agent definitions
- `HookManager` - event hooks
- `MCPManager` - MCP servers
- `PermissionManager` - tool permissions
- `ContextManager` - context window management

### Adapter Pattern
- `SDKQueryExecutor` - adapts internal options to SDK format
- `MessageRouter` - adapts session context to SDK-compatible system prompt

### Strategy Pattern
- `OutputFormatter` - text/json/stream-json/markdown formats
- `PermissionManager` - different permission modes
- `ContextManager` - compression strategies

## Important Subsystems

### Context Management (`src/context/`)
- Token counting and budget enforcement
- Message importance scoring
- Conversation summarization for compression
- Manages token limits per SDK constraints

### Security (`src/security/`)
- Detects sensitive data (API keys, passwords, tokens)
- Identifies dangerous commands (rm -rf, etc.)
- Sanitizes logs and output
- Confirms destructive operations

### Output Formatting (`src/output/`)
Formats: `text` (default), `json`, `stream-json`, `markdown`

JSON output structure:
```json
{
  "response": "text response",
  "toolCalls": [...],
  "metadata": {
    "sessionId": "...",
    "tokensUsed": {"input": N, "output": N},
    "cost": {"usd": N}
  }
}
```

## Testing Architecture

### Test Organization
- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/`
- Property tests: `tests/**/*.property.test.ts` (fast-check)
- Terminal interaction tests: removed (CLI emulation suite deprecated)

## Common Workflows

### Adding a New Tool
1. Define tool metadata in `src/tools/ToolRegistry.ts`
2. Implement executor in dedicated file
3. Register in `ToolRegistry.getAllTools()`
4. Add permission rules if dangerous
5. Update tests

### Adding Extension Support
1. Create manager in `src/{extension-type}/`
2. Implement file loading with YAML frontmatter parsing
3. Register in `Application` class initialization
4. Hook into `MessageRouter` for system prompt injection
5. Add validation and error handling

### Modifying SDK Integration
1. Only change `SDKQueryExecutor.ts` and `MessageRouter.ts`
2. Maintain type compatibility with SDK imports
3. Update error classification if needed
4. Test session resumption still works
5. Verify streaming message handling

### Working with Sessions
Sessions are sacred - never corrupt session files:
- Always use `SessionManager` methods (create, load, save)
- Never directly write to `~/.claude-replica/sessions/`
- Validate message structure before saving
- Handle expiry checks properly

## Critical Integration Points

When modifying the codebase, understand these choke points:
1. **All SDK queries** → `SDKQueryExecutor.execute()`
2. **All configs** → `ConfigManager.mergeConfigs()`
3. **All permissions** → `PermissionManager.createCanUseToolHandler()`
4. **All system prompts** → `MessageRouter.buildSystemPrompt()`
5. **All output** → `OutputFormatter.format()`
6. **All events** → `HookManager.executeHooks()`

## Dependencies

### Core
- `@anthropic-ai/claude-agent-sdk` (^0.1.76) - Claude Agent SDK
- `diff` (^8.0.2) - File diff utilities
- `ajv` (^8.17.1) - JSON schema validation

### Development
- TypeScript 5.9+
- Jest 29+ for testing
- ESLint + Prettier for code quality
- fast-check for property testing

## Environment Requirements
- Node.js >= 20.0.0
- npm >= 9.0.0

## Authentication
Claude Replica uses Claude Agent SDK authentication from:
1. `~/.claude/settings.json` (user-level, from Claude Code CLI)
2. `.claude/settings.json` (project-level)
3. `.claude/settings.local.json` (local-level)

Set `ANTHROPIC_API_KEY` environment variable if needed.
