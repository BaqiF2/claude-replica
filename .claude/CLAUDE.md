# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Replica is a command-line tool that replicates Claude Code functionality using the Claude Agent SDK. It provides AI-assisted programming capabilities with an extensible architecture supporting skills, sub-agents, hooks, and MCP integration.

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

# Terminal interaction tests
npm run test:terminal      # Run terminal tests (30s timeout)
npm run test:terminal:watch
npm run test:terminal:ci   # CI mode with junit reporter

# Property-based tests
npm run test:property      # Run fast-check property tests (60s timeout)
```

### Code Quality
```bash
npm run lint               # Check code with ESLint
npm run lint:fix           # Auto-fix ESLint issues
npm run format             # Format code with Prettier
npm run format:check       # Check formatting without changes
```

## Core Architecture

### Main Entry Flow
1. **`cli.ts`** - CLI entry point, parses arguments with `CLIParser`
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

### Agents System (`src/agents/`)
- **Purpose**: Specialized sub-agents for focused tasks, defined programmatically as presets.
- **Architecture**: Presets are defined in code (no `*.agent.md` files). `AgentRegistry` returns validated presets and the SDK receives `AgentDefinition[]`.
- **Constraints**: Sub-agents must not include `Task`. When any sub-agent is defined, the main agent auto-enables `Task` unless it is explicitly listed in `disallowedTools`.
- **Code locations**: `src/agents/PresetAgents.ts`, `src/agents/AgentRegistry.ts`, `src/main.ts`.

**Preset Agents**

| Agent | Scenario | Tools | Model |
| --- | --- | --- | --- |
| code-reviewer | Review correctness, edge cases, regressions | Read, Grep, Glob | sonnet |
| test-runner | Run tests/lint and summarize failures | Read, Grep, Glob, Bash | sonnet |
| doc-generator | Update or create documentation | Read, Grep, Glob, Write, Edit | sonnet |
| refactoring-specialist | Behavior-preserving refactors | Read, Grep, Glob, Edit, Write | sonnet |
| security-auditor | Security review and risk assessment | Read, Grep, Glob | sonnet |
| data-analyzer | Lightweight dataset/log analysis | Read, Grep, Glob, Bash | sonnet |

**Recommended Tool Combinations**

| Use case | Tools |
| --- | --- |
| Read-only review and auditing | Read, Grep, Glob |
| Test execution and diagnostics | Read, Grep, Glob, Bash |
| Documentation updates | Read, Grep, Glob, Write, Edit |
| Behavior-preserving refactors | Read, Grep, Glob, Edit, Write |

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

**Architecture Overview**

The permission system follows a clean separation between UI layer and permission logic layer:
- **Permission Logic**: `PermissionManager` implements SDK `canUseTool` callback, returns `PermissionResult` objects
- **UI Layer**: `PermissionUI` interface with `PermissionUIImpl` adapter, handles terminal interactions
- **Components**: `PermissionPanel` (tool permission prompts), `QuestionMenu` (AskUserQuestion interactive menus)

**Permission Modes**

Four permission modes with different behaviors:
- `default`: Prompt user for all tools (except whitelisted)
- `acceptEdits` (default): Auto-approve Read/Write/Edit/Grep/Glob, prompt for others
- `bypassPermissions`: Auto-approve all tools (no prompts)
- `plan`: Allow only Read/Grep/Glob/ExitPlanMode, deny all write operations

**Permission Flow**

1. Tool use triggers `canUseTool` callback → `PermissionManager.createCanUseToolHandler()`
2. Check `disallowedTools` blacklist → Return `{behavior: 'deny'}`
3. Check `allowedTools` whitelist → Return `{behavior: 'allow'}`
4. Check permission mode and tool type:
   - `bypassPermissions`: Allow all
   - `plan` mode: Allow only Read/Grep/Glob/ExitPlanMode
   - `acceptEdits`: Auto-allow Read/Write/Edit/Grep/Glob
   - `default`: Prompt user via `PermissionUI`
5. Special handling for `AskUserQuestion`: Call `handleAskUserQuestion()` → Return `updatedInput` with collected answers

**PermissionUI Interface**

```typescript
interface PermissionUI {
  promptToolPermission(request: ToolPermissionRequest): Promise<PermissionUIResult>;
  promptUserQuestions(questions: QuestionInput[]): Promise<QuestionAnswers>;
}
```

- `PermissionPanel.show()`: Displays tool permission request in terminal bottom panel, waits for y/n/Esc input
- `QuestionMenu.show()`: Renders interactive menu with arrow key navigation, Space (multi-select), Enter (confirm)

**Dynamic Permission Switching**

Users can switch permission modes at runtime:
- Press `Shift+Tab` in interactive mode → Cycles through modes
- Emoji indicators in prompt: 🟢 default, 🟡 acceptEdits, 🔴 bypassPermissions, 🔵 plan
- Changes propagate: `InteractiveUI` → `StreamingQueryManager.setPermissionMode()` → `MessageRouter` → SDK async update

**AskUserQuestion Handling**

When Claude uses `AskUserQuestion` tool:
1. `PermissionManager.handleAskUserQuestion()` extracts questions from input
2. `PermissionUI.promptUserQuestions()` displays interactive menus for each question
3. Collected answers are injected into `updatedInput.answers` field
4. Tool receives pre-filled answers, no prompt modification needed

**Key Files**

- `src/permissions/types.ts` - Core types: `PermissionResult`, `SDKCanUseTool`, `ToolPermissionRequest`
- `src/permissions/PermissionUI.ts` - UI interface and components: `PermissionPanel`, `QuestionMenu`
- `src/permissions/PermissionManager.ts` - Permission logic and `canUseTool` handler
- `src/ui/PermissionUIImpl.ts` - Adapter implementing `PermissionUI` interface
- `src/ui/InteractiveUI.ts` - Permission mode switching and emoji display

## Key Design Patterns

### Manager Pattern
Each subsystem has a manager class:
- `SessionManager` - session lifecycle
- `ConfigManager` - config loading/merging
- `SkillManager` - skill loading
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
- Terminal tests: `tests/terminal/` (uses node-pty for real terminal emulation)
- Property tests: `tests/**/*.property.test.ts` (fast-check)

### Terminal Tests
Use `tests/terminal/` for testing actual terminal interactions:
- Real terminal emulation via node-pty
- 30-second timeout (computationally expensive)
- Separate npm scripts for CI/watch/report modes

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
- `node-pty` (^1.1.0) - Terminal emulation
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
