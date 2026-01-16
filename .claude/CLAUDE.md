# CLAUDE.md

Claude Replica replicates Claude Code functionality using the Claude Agent SDK, providing AI-assisted programming with extensible skills, sub-agents, hooks, and MCP integration.

## Core Architecture

### Main Entry Flow
1. **cli.ts** - CLI entry point, creates UIFactory via UIFactoryRegistry and starts Application
2. **main.ts** - Application class orchestrates subsystems
3. **MessageRouter** - Routes messages to SDK, builds prompts
4. **SDKQueryExecutor** - Wraps SDK query() function
5. **StreamingMessageProcessor** - Handles SDK response stream
6. **SessionManager** - Manages conversation persistence

### SDK Integration
All SDK interactions flow through `src/sdk/SDKQueryExecutor.ts`. When modifying SDK integration, only change `SDKQueryExecutor.ts` and `MessageRouter.ts`. SDK is imported from `@anthropic-ai/claude-agent-sdk`.

### UI Factory Layer
- **UIFactoryRegistry** (`src/ui/factories/UIFactoryRegistry.ts`): Selects UIFactory via `CLAUDE_UI_TYPE`
- **UIFactory** (`src/ui/factories/UIFactory.ts`): Creates ParserInterface and OutputInterface

### Configuration
Three-level configuration (priority: Local > Project > User):
- `~/.claude-replica/settings.json` (User)
- `.claude-replica/settings.json` (Project)
- `.claude-replica/settings.local.json` (Local)

Configs deep-merge via `ConfigManager.mergeConfigs()`. All SDK options configurable: model, tools, permissions, MCP servers, hooks, agents, sandbox settings.

### Session Persistence
Sessions stored in `~/.claude-replica/sessions/session-{timestamp}-{id}/`:
- `metadata.json` - id, timestamps, stats (token usage, cost, message count), sdkSessionId
- `messages.json` - conversation history
- `context.json` - loaded skills, agents, configs
- `snapshots/` - rewind system snapshots

**Interactive Mode**: Sessions persist and can be resumed via `/resume` command.
**Non-Interactive Mode**: Uses temporary sessions (not saved).

Auto-cleanup based on `SESSION_KEEP_COUNT` environment variable (default: 10 sessions).

## Extension Systems

### Skills (`src/skills/`)
Domain knowledge guides injected into system prompt. `*.skill.md` files with YAML frontmatter auto-loaded via `SkillManager`.

### Agents (`src/agents/`)
Specialized sub-agents for focused tasks, defined programmatically as presets. Key files: `PresetAgents.ts`, `AgentRegistry.ts`, `main.ts`. Constraints: Sub-agents must not include `Task`.

### Hooks (`src/hooks/`)
Event-driven automation on tool/session events via `.claude-replica/hooks.json`. 12 event types including PreToolUse, PostToolUse, SessionStart, UserPromptSubmit.

### MCP Integration (`src/mcp/`)
Model Context Protocol server management. `*.mcp.json` configs with stdio/SSE/HTTP transports via `MCPManager`.

## Tool System

### Built-in Tools
11 tool categories in `ToolRegistry`: File ops (Read, Write, Edit), Commands (Bash), Search (Grep, Glob), User interaction (AskUserQuestion), Network (WebFetch, WebSearch), Tasks (Task, TodoWrite), Jupyter (NotebookEdit), Plan mode (ExitPlanMode), MCP tools.

### Permission Management
Four permission modes:
- `default`: Prompt user for all tools (except whitelisted)
- `acceptEdits` (default): Auto-approve Read/Write/Edit/Grep/Glob
- `bypassPermissions`: Auto-approve all tools
- `plan`: Allow only Read/Grep/Glob/ExitPlanMode

Permission flow: Tool use → `PermissionManager.createCanUseToolHandler()` → Check blacklist/whitelist → Apply mode rules → Handle AskUserQuestion.

Runtime switching via Shift+Tab with emoji indicators: 🟢 default, 🟡 acceptEdits, 🔴 bypassPermissions, 🔵 plan.

## Key Design Patterns
- **Manager Pattern**: SessionManager, ConfigManager, SkillManager, AgentRegistry, HookManager, MCPManager, PermissionManager, ContextManager
- **Adapter Pattern**: SDKQueryExecutor, MessageRouter
- **Strategy Pattern**: OutputFormatter, PermissionManager, ContextManager

## Important Subsystems
- **Context Management**: Token counting, budget enforcement, conversation summarization
- **Security**: Sensitive data detection, dangerous command identification, log sanitization
- **Output Formatting**: text, json, stream-json, markdown formats

## Critical Integration Points
When modifying codebase, understand these choke points:
1. **All SDK queries** → `SDKQueryExecutor.execute()`
2. **All configs** → `ConfigManager.mergeConfigs()`
3. **All permissions** → `PermissionManager.createCanUseToolHandler()`
4. **All system prompts** → `MessageRouter.buildSystemPrompt()`
5. **All output** → `OutputFormatter.format()`
6. **All events** → `HookManager.executeHooks()`

## Development Commands
```bash
npm run build              # Compile TypeScript
npm run dev                # Watch mode
npm run start              # Run CLI
npm test                   # Run all tests
npm run lint               # Check code
npm run format             # Format code
```

## Dependencies
- `@anthropic-ai/claude-agent-sdk` - Claude Agent SDK
- `node-pty` - Terminal emulation
- `diff` - File diff utilities
- `ajv` - JSON schema validation

**Environment**: Node.js >= 20.0.0, npm >= 9.0.0
**Authentication**: Uses Claude Agent SDK auth from `~/.claude/settings.json`, `.claude/settings.json`, `.claude/settings.local.json`
