# Claude Replica Code Reading Guide

> **Target Audience**: New developers, code reviewers, contributors
> **Last Updated**: 2026-01-02
> **Estimated Reading Time**: 45-60 minutes

---

## 📋 Project Overview

**Claude Replica** is a complete replica of Claude Code's intelligent coding assistant command-line tool, using the Claude Agent SDK to provide AI-assisted programming capabilities.

### Core Features

- ✅ **SDK Integration**: Complete encapsulation of Claude Agent SDK's query() function
- 🔄 **Session Management**: Support for session creation, saving, restoration, and expiration cleanup
- 🔌 **Extensible Architecture**: Skills, Commands, Agents, Hooks
- 🛠️ **Tool System**: 11 categories of built-in tools (file operations, command execution, search, network, etc.)
- 🔐 **Permission Management**: Multiple permission modes and fine-grained tool control
- 🎨 **Multiple Outputs**: text / json / stream-json / markdown
- 🚀 **CI/CD Support**: Automatic CI environment detection and behavior adjustment

### Tech Stack

| Category | Technology | Version |
|----------|------------|---------|
| Language | TypeScript | 5.9+ |
| Runtime | Node.js | 20.0.0+ |
| Core Dependency | @anthropic-ai/claude-agent-sdk | ^0.1.76 |
| Terminal Emulation | node-pty | ^1.1.0 |
| Testing Framework | Jest | 29+ |
| Property Testing | fast-check | ^3.23.2 |
| Build Tool | TypeScript Compiler | - |
| Code Quality | ESLint + Prettier | - |

---

## 🏗️ Architecture Design

### Overall Architecture Pattern

Claude Replica adopts **Layered Architecture + Manager Pattern**, with clear layer responsibilities and loose coupling through dependency injection.

```
┌─────────────────────────────────────────────────────────────┐
│                      CLI Layer (Entry)                          │
│  cli.ts → CLIParser → Argument parsing                               │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                  Application Layer (Orchestration)                       │
│  main.ts → Application class → Initialize all managers                 │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                   Core Layer (Core Logic)                         │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ MessageRouter  │→ │ SessionManager  │  │ Streaming    │ │
│  │  Message       │  │ Session         │  │ Processor    │ │
│  │  Routing       │  │ Management      │  │              │ │
│  └────────────────┘  └─────────────────┘  └──────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                 SDK Integration Layer (SDK Integration)                 │
│  SDKQueryExecutor → Encapsulate Claude Agent SDK                    │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                Extension Systems Layer (Extension Systems)                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Skills   │ │ Commands │ │ Agents   │ │ Hooks    │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│  ┌──────────┐                                                │
│  │   MCP    │  Model Context Protocol integration                   │
│  └──────────┘                                                │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                  Infrastructure Layer (Infrastructure)                      │
│  Config | Permissions | Tools | Security | Output | CI      │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Patterns

1. **Manager Pattern**
   - Each subsystem is managed by an independent Manager class
   - Unified initialization, loading, and cleanup interfaces

2. **Adapter Pattern**
   - `SDKQueryExecutor`: Internal options → SDK Options
   - `MessageRouter`: Session context → SDK system prompt

3. **Strategy Pattern**
   - `OutputFormatter`: Multiple output formats
   - `PermissionManager`: Different permission modes

---

## 📚 Layered Reading Path

### 🎯 Recommended Reading Order

Read in the order of **from top to bottom, from entry to implementation**, thoroughly understanding each layer before moving to the next.

---

## Layer 1: CLI Entry Layer (5 minutes)

**Goal**: Understand how the program starts and how arguments are parsed

### Core Files

| File | Responsibility | Key Points |
|------|----------------|------------|
| `src/cli.ts` | CLI entry point | npm bin entry, delegates to main.ts |
| `src/cli/CLIParser.ts` | Command-line argument parsing | Supports --help, --version, -p, --model and 20+ options |

### Reading Points

1. **cli.ts**:
   - How to call `main()` function
   - Error handling and exit codes

2. **CLIParser.ts**:
   - List of supported command-line options
   - Argument validation logic
   - `CLIOptions` interface definition

### Code Tracing

```typescript
// 1. User executes command
$ claude-replica -p "help me fix this bug"

// 2. cli.ts (entry point)
main(process.argv.slice(2))
  .then(exitCode => process.exit(exitCode))

// 3. CLIParser parses arguments
const options = cliParser.parse(args)
// → { prompt: "help me fix this bug", ... }
```

---

## Layer 2: Application Orchestration Layer (15 minutes)

**Goal**: Master application initialization flow and subsystem collaboration

### Core Files

| File | Responsibility | Key Classes/Methods |
|------|----------------|-------------------|
| `src/main.ts` | Application main program | `Application` class, `run()`, `initialize()` |

### Reading Points

1. **Application class constructor** (lines 198-211)
   - Initialize all manager instances
   - Dependency injection relationship diagram

2. **initialize() method** (lines 295-336)
   - Configuration loading order: User → Project → Local
   - Extension system loading: Skills, Commands, Agents, Hooks
   - MCP server configuration loading

3. **Running modes** (lines 216-266)
   - **Interactive mode**: `runInteractive()` → UI loop
   - **Non-interactive mode**: `runNonInteractive()` → Single query

4. **Key methods**:
   - `getOrCreateSession()`: Session creation/restoration logic
   - `executeQuery()`: Core query execution flow
   - `handleInterrupt()`: Interrupt handling (Ctrl+C)

### Dependency Relationship Diagram

```
Application
  ├── CLIParser          (Argument parsing)
  ├── ConfigManager      (Configuration management)
  ├── SessionManager     (Session management)
  ├── ToolRegistry       (Tool registry)
  ├── SkillManager       (Skill loading)
  ├── CommandManager     (Command templates)
  ├── AgentRegistry      (Subagents)
  ├── HookManager        (Event hooks)
  ├── MCPManager         (MCP servers)
  ├── PermissionManager  (Permission control)
  ├── MessageRouter      (Message routing)
  ├── SDKQueryExecutor   (SDK execution)
  ├── RewindManager      (Time rewind)
  ├── SecurityManager    (Security checks)
  ├── OutputFormatter    (Output formatting)
  └── CISupport          (CI/CD support)
```

### Code Tracing: Query Execution Flow

```typescript
// User sends message
handleUserMessage(message, session)
  ↓
// Execute query
executeQuery(prompt, session, options)
  ↓
// Route message → Build system prompt and tool list
messageRouter.routeMessage(message, session)
  ↓
// Call SDK execution
sdkExecutor.execute({ prompt, model, systemPrompt, ... })
  ↓
// Save response to session
sessionManager.addMessage(session, { role: 'assistant', content })
```

---

## Layer 3: Core Business Layer (20 minutes)

**Goal**: Understand message routing, session management, and streaming processing core logic

### 3.1 Message Routing (`src/core/MessageRouter.ts`)

**Core Responsibilities**:
- Build system prompt (CLAUDE.md + Skills)
- Get enabled tool list
- Create permission handler
- Assemble SDK query options

**Key Methods**:

| Method | Responsibility | Line Numbers |
|--------|----------------|--------------|
| `routeMessage()` | Route message to SDK | 129-140 |
| `buildSystemPrompt()` | Build system prompt | 155-191 |
| `getEnabledToolNames()` | Get enabled tools | 204-231 |
| `createPermissionHandler()` | Create permission function | 241-258 |
| `buildQueryOptions()` | Build query options | 302-343 |

**Reading Points**:
1. System prompt composition order: CLAUDE.md → Skills → Default instructions → Append prompt
2. Tool enabling logic: Base tools + Skill tools - Disabled tools
3. How permission handler wraps `PermissionManager`

### 3.2 Session Management (`src/core/SessionManager.ts`)

**Core Responsibilities**:
- Create and persist sessions
- Load and restore sessions
- Session expiration management (5 hours)
- SDK session ID management

**Session Storage Structure**:
```
~/.claude-replica/sessions/session-{timestamp}-{id}/
├── metadata.json     # id, timestamps, sdkSessionId
├── messages.json     # conversation history (including usage statistics)
├── context.json      # skills, agents, configuration
└── snapshots/        # Rewind snapshots
```

**Key Methods**:

| Method | Responsibility |
|--------|----------------|
| `createSession()` | Create new session |
| `saveSession()` | Persist session to disk |
| `loadSession()` | Load session from disk |
| `addMessage()` | Add message to session |
| `cleanExpiredSessions()` | Clean expired sessions |

**Reading Points**:
1. Session ID generation: `crypto.randomBytes(16).toString('hex')`
2. Expiration logic: `expiresAt = createdAt + 5 hours`
3. Purpose of SDK session ID: Restore historical message context

### 3.3 Streaming Message Processing (`src/core/StreamingMessageProcessor.ts`)

**Core Responsibilities**:
- Process SDK returned streaming messages
- Identify message types (assistant, result, tool_use)
- Accumulate text content

---

## Layer 4: SDK Integration Layer (10 minutes)

**Goal**: Understand how to encapsulate and call the Claude Agent SDK

### Core File: `src/sdk/SDKQueryExecutor.ts`

**Core Responsibilities**:
1. Map internal options to SDK `Options` format
2. Call SDK `query()` function
3. Handle async generator stream
4. Error classification and handling (network, authentication, rate limit, timeout, interruption)
5. Interrupt support (AbortController)

**Key Methods**:

| Method | Responsibility | Validation Requirements |
|--------|----------------|-------------------------|
| `execute()` | Execute SDK query | 1.1, 1.3, 4.1-4.3 |
| `mapToSDKOptions()` | Option mapping | 1.2, 6.1-6.5 |
| `processMessage()` | Process single message | 2.2 |
| `interrupt()` | Interrupt current query | 4.1, 4.2 |

**Error Classification System**:

```typescript
enum SDKErrorType {
  NETWORK,         // Network errors (ENOTFOUND, ECONNREFUSED)
  AUTHENTICATION,  // Authentication errors (401, 403)
  RATE_LIMIT,      // Rate limit (429)
  TIMEOUT,         // Timeout errors
  INTERRUPTED,     // User interruption
  UNKNOWN          // Unknown errors
}
```

**Reading Points**:
1. **Interrupt mechanism**: Use `AbortController` to implement Ctrl+C interrupt
2. **Message stream processing**: `for await (const message of queryGenerator)`
3. **Token statistics**: Extract `usage` information from `result` message
4. **Session restoration**: `resume` parameter passes SDK session ID

**Code Tracing: SDK Query Flow**

```typescript
// 1. Execute query
sdkExecutor.execute(options)
  ↓
// 2. Map options
const sdkOptions = sdkExecutor.mapToSDKOptions(options)
  ↓
// 3. Call SDK
const generator = query({ prompt, options: sdkOptions })
  ↓
// 4. Iterate message stream
for await (const message of generator) {
  if (message.type === 'assistant') {
    // Accumulate response text
  } else if (message.type === 'result') {
    // Extract usage statistics
    return { response, usage, totalCostUsd }
  }
}
```

---

## Layer 5: Extension Systems Layer (15 minutes)

**Goal**: Understand the loading mechanism and role of the four major extension systems

### 5.1 Skills System (`src/skills/SkillManager.ts`)

**Purpose**: Inject domain knowledge and workflows into system prompt

**File Format**:
```markdown
---
name: my-skill
description: Skill description
triggers: [keyword1, keyword2]
tools: [Read, Write]
---

Skill content (Markdown)
```

**Loading Paths**:
- `~/.claude-replica/skills/` (user-level)
- `.claude-replica/skills/` (project-level)

**Core Methods**:
- `loadSkills()`: Load all skills from directory
- `parseSkillFile()`: Parse YAML frontmatter

### 5.2 Commands System (`src/commands/CommandManager.ts`)

**Purpose**: Provide reusable command templates

**File Format**:
```markdown
---
name: my-command
description: Command description
allowedTools: [Bash, Read]
---

Command content, supports variables: $ARGUMENTS
```

**Invocation**: `/user:command` or `/project:command`

### 5.3 Agents System (`src/agents/AgentRegistry.ts`)

**Purpose**: Register subagents for specialized tasks

**File Format**:
```markdown
---
name: my-agent
description: Agent description
model: sonnet | opus | haiku | inherit
tools: [Read, Grep]
---

Agent prompt content
```

**SDK Integration**: Convert to SDK's `AgentDefinition[]`

### 5.4 Hooks System (`src/hooks/HookManager.ts`)

**Purpose**: Event-driven automation

**Configuration File**: `.claude-replica/hooks.json`

**Supported Events** (12 types):
- PreToolUse / PostToolUse
- SessionStart / SessionEnd
- UserPromptSubmit
- MessageStreaming
- ...

**Hook Actions**:
- Execute command
- Inject prompt

### 5.5 MCP Integration (`src/mcp/MCPManager.ts`)

**Purpose**: Model Context Protocol server management

**Configuration File**: `.mcp.json` or `mcp.json`

**Transport Types**:
- stdio (command + args)
- SSE (HTTP streaming)
- HTTP (REST API)

---

## Layer 6: Infrastructure Systems Layer (10 minutes)

### 6.1 Configuration Management (`src/config/ConfigManager.ts`)

**Configuration Levels** (Priority: Local > Project > User):
1. User: `~/.claude-replica/settings.json`
2. Project: `.claude-replica/settings.json`
3. Local: `.claude-replica/settings.local.json`

**Merge Strategy**: `mergeConfigs()` deep merge

### 6.2 Permission Management (`src/permissions/PermissionManager.ts`)

**Permission Modes**:
- `default`: Interactive confirmation
- `acceptEdits`: Auto-accept edit operations
- `bypassPermissions`: Skip all permission checks
- `plan`: Plan mode (read-only tools)

**Permission Check Flow**:
```typescript
canUseTool(params) {
  1. Check disallowedTools blacklist
  2. Check allowedTools whitelist
  3. Check bypass flag
  4. Check Bash command filters
  5. Prompt user confirmation (if needed)
}
```

### 6.3 Tool Registry (`src/tools/ToolRegistry.ts`)

**11 Categories of Tools**:
- File operations: Read, Write, Edit
- Command execution: Bash, BashOutput, KillBash
- Search: Grep, Glob
- User interaction: AskUserQuestion
- Network: WebFetch, WebSearch
- Tasks: Task, TodoWrite
- Jupyter: NotebookEdit
- Plan: ExitPlanMode
- MCP: ListMcpResources, ReadMcpResource

### 6.4 Security Management (`src/security/SecurityManager.ts`)

**Functions**:
- Detect sensitive data (API keys, passwords, tokens)
- Identify dangerous commands (`rm -rf`, `dd`, `mkfs`)
- Log sanitization
- Confirm destructive operations

### 6.5 Output Formatting (`src/output/OutputFormatter.ts`)

**Supported Formats**:
- `text`: Plain text (default)
- `json`: Structured JSON with complete information
- `stream-json`: Streaming JSON, one event per line
- `markdown`: Markdown formatted output

---

## 🔍 Key Integration Points

When modifying the codebase, understand these choke points:

1. **All SDK queries** → `SDKQueryExecutor.execute()`
2. **All configurations** → `ConfigManager.mergeConfigs()`
3. **All permissions** → `PermissionManager.createCanUseToolHandler()`
4. **All system prompts** → `MessageRouter.buildSystemPrompt()`
5. **All outputs** → `OutputFormatter.format()`
6. **All events** → `HookManager.executeHooks()`

---

## 📊 Testing Architecture

### Test Organization

- **Unit tests**: `tests/unit/`
- **Integration tests**: `tests/integration/`
- **Terminal tests**: `tests/terminal/` (uses node-pty for real terminal emulation)
- **Property tests**: `tests/**/*.property.test.ts` (fast-check)

### Terminal Tests

Use `tests/terminal/` for testing actual terminal interactions:
- Real terminal emulation via node-pty
- 30-second timeout (computationally expensive)
- Separate npm scripts for CI/watch/report modes

---

## 🚀 Common Workflows

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

---

## 📚 Further Reading

- [API Documentation](API_EN.md) - Detailed API reference
- [Developer Guide](DEVELOPER_GUIDE_EN.md) - Development guidelines
- [User Guide](USER_GUIDE_EN.md) - Usage instructions
- [Plugin API](PLUGIN_API_EN.md) - Extension development

---

## 💡 Tips for Code Reading

1. **Start from top layer**: Begin with CLI entry points, then drill down
2. **Follow the data flow**: Trace how a user query travels through the system
3. **Understand manager roles**: Each manager has a clear responsibility
4. **Check tests**: Tests often show intended usage patterns
5. **Use IDE features**: Leverage TypeScript's type system and IDE navigation

---

**Happy reading!** 🎉
