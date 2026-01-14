# Claude Replica

[![npm version](https://badge.fury.io/js/claude-replica.svg)](https://badge.fury.io/js/claude-replica)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/claude-replica.svg)](https://nodejs.org)

A complete replica of Claude Code's intelligent coding assistant command-line tool. Built on the Claude Agent SDK, providing powerful AI-assisted programming capabilities.

## 🌐 Language / 语言

[Chinese Documentation](README_ZH.md) | 中文文档

> **⚠️ Core Purpose (Not Reinventing the Wheel)**
>
> This project is not intended to completely replicate Claude Code, but serves as a **learning and development scaffold**:
>
> 1. **📚 Learn Claude Code Core Features** - Deep dive into Claude Code's design philosophy, architectural patterns, and feature set by reading the documentation in the `doc/` directory
>
> 2. **🚀 Master Claude Agent SDK** - Through development documentation in the `doc/` directory, gain proficiency with the Claude Agent SDK's core capabilities and development workflows
>
> 3. **🎯 Layered Architecture Scaffold** - Adopting a clear layered design (CLI layer, business logic layer, SDK adaptation layer), simply replace the CLI layer with any "presentation layer" (Web interface, desktop app, API service, etc.) to rapidly build entirely new AI Agents. No need to start from scratch—unleash your **imagination**!

## ✨ Features

### Core Functionality
- 🤖 **Intelligent Conversation** - AI coding assistant based on Claude Agent SDK
- 📁 **File Operations** - Read, edit, create, and delete files
- 🔧 **Command Execution** - Safely execute Bash commands
- 🔍 **Code Search** - Powerful codebase navigation and search capabilities
- 💾 **Session Management** - Save, restore, resume, and fork conversation sessions with statistics
- 🧹 **Automatic Cleanup** - Configurable automatic session cleanup to manage disk space
- 📊 **Session Statistics** - Track token usage, costs, and message counts per session

### Extension Systems
- 🎯 **Skills System** - Auto-loading domain knowledge and workflow guides
- 📝 **Custom Commands** - Create reusable command templates
- 🤝 **Subagents** - Specialized task-handling agents
- 🪝 **Hooks System** - Automatically triggered actions after tool use
- 🔌 **Plugin System** - Packaged feature extensions

### Integration Capabilities
- 🌐 **MCP Integration** - Model Context Protocol server support
- 🔐 **Permission Management** - Fine-grained tool permission control
- ⏪ **Rewind System** - Undo file modifications, restore to previous state
- 🖼️ **Image Support** - Send images for UI design and debugging
- 🏭 **CI/CD Support** - Automated pipeline integration

## 📦 Installation

### Global Installation (Recommended)

```bash
npm install -g claude-replica
```

### Local Installation

```bash
npm install claude-replica
```

### Install from Source

```bash
git clone https://github.com/BaqiF2/claude-replica.git
cd claude-replica
npm install
npm run build
npm link
```

## 🔧 Configuration

### Authentication Configuration

Claude Replica uses the Claude Agent SDK and automatically retrieves authentication information from Claude Code configuration. Simply ensure Claude Code is properly configured:

```bash
# Method 1: Login using Claude Code CLI
claude login

# Method 2: Check configuration file
ls ~/.claude/settings.json
```

Authentication information is automatically loaded from the following locations (by priority):
- `~/.claude/settings.json` (user-level)
- `.claude/settings.json` (project-level)
- `.claude/settings.local.json` (local-level)

### Configuration Files

Claude Replica supports multi-level configuration:

1. **User-level config**: `~/.claude/settings.json`
2. **Project-level config**: `.claude/settings.json`
3. **Local config**: `.claude/settings.local.json`

Configuration priority: Local > Project > User

```json
{
  "model": "claude-sonnet-4-5-20250929",
  "permissionMode": "default",
  "maxTurns": 100,
  "maxBudgetUsd": 10,
  "allowedTools": ["Read", "Write", "Bash", "Grep"],
  "disallowedTools": [],
  "sessionKeepCount": 10
}
```

#### Session Management Configuration

```bash
# Environment variables (.env file)
SESSION_KEEP_COUNT=10  # Number of recent sessions to keep (default: 10)
```

## 🚀 Usage

### Interactive Mode

```bash
# Start interactive session
claude-replica
```

Once in interactive mode, use built-in commands to manage sessions:

```bash
# List and resume recent sessions
/resume

# Fork current session to create a branch
/fork

# View all sessions
/sessions
```

### Non-Interactive Mode

```bash
# Single query
claude-replica -p "Explain what this code does"

# Read query from file
claude-replica -p "$(cat query.txt)"

# Pipe input
echo "Analyze this project structure" | claude-replica -p -

# Specify output format
claude-replica -p "Generate test cases" --output-format json
```

### Command-Line Options

```
Basic Options:
  -p, --print              Non-interactive mode, execute query and exit
  --help                   Show help information
  --version                Show version number

Model Options:
  --model <name>           Specify model (sonnet, haiku, opus)

Tool Options:
  --allowed-tools <tools>  List of allowed tools (comma-separated)
  --disallowed-tools <t>   List of disallowed tools (comma-separated)

Permission Options:
  --permission-mode <m>    Permission mode (default, acceptEdits, bypassPermissions, plan)
  --dangerously-skip-permissions  Skip all permission checks (dangerous)

Output Options:
  --output-format <f>      Output format (text, json, stream-json, markdown)
  --verbose                Verbose output mode

Advanced Options:
  --max-turns <n>          Maximum conversation turns
  --max-budget-usd <n>     Maximum budget (USD)
  --sandbox                Enable sandbox mode
  --timeout <seconds>      Execution timeout

Note: Session management commands (--continue, --resume, --fork) have been
removed. Use interactive mode commands instead: /resume, /fork
```

### Built-in Commands

In interactive mode, use the following commands:

```
/help        - Show help information
/resume      - List and resume recent sessions
/fork        - Fork current session to create a branch
/sessions    - List all sessions
/config      - Show current configuration
/permissions - Show permission settings
/mcp         - Show MCP server status
/clear       - Clear screen
/exit        - Exit program
```

#### Session Management Commands

**`/resume`** - Resume a Previous Session
- Lists recent sessions with statistics (message count, token usage, cost)
- Shows relative and absolute timestamps
- Displays parent session for forked sessions (🔀)
- Select a session by number or press Esc to cancel

**`/fork`** - Create a Session Branch
- Creates a new session based on the current session
- Copies all messages, context, and statistics
- Sets parent session ID for tracking branches
- Automatically switches to the new forked session

**Session Statistics**
Each session displays:
- Message count
- Token usage (input/output)
- Total cost in USD
- Last message preview
- Creation time and last activity time

## 📚 Extension System

### Skills

Create skill files in `.claude/skills/` directory:

```markdown
---
name: react-expert
description: React development expert
triggers:
  - react
  - component
  - hook
tools:
  - Read
  - Write
  - Bash
---

You are a React development expert, specializing in:
- Function components and Hooks
- State management
- Performance optimization
- Testing strategies
```

### Custom Commands

Create command files in `.claude/commands/` directory:

```markdown
---
name: review
description: Code review
argumentHint: <file>
---

Please review the code quality of the following file:
$ARGUMENTS

Focus on:
1. Code style
2. Potential bugs
3. Performance issues
4. Security vulnerabilities
```

Usage: `/review src/main.ts`

### Subagents

Create agent files in `.claude/agents/` directory:

```markdown
---
description: Testing expert, focused on writing high-quality tests
model: sonnet
tools:
  - Read
  - Write
  - Bash
---

You are a testing expert responsible for:
- Writing unit tests
- Writing integration tests
- Analyzing test coverage
- Providing testing strategy advice
```

### Hooks

Configure hooks in `.claude/hooks.json`:

```json
{
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
  ]
}
```

### MCP Servers

Create `.mcp.json` in the project root:

```json
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
  }
}
```

### Custom Tools (In-Process MCP)

Define TypeScript tools with Zod schemas and register them as in-process MCP servers. The built-in calculator tool lives in `src/custom-tools/math/calculator.ts` and is registered in `src/main.ts` with the module name `math/calculators` (server name `custom-tools-math-calculators` by default).

Tool definition example:

```ts
import { z } from 'zod';
import type { ToolDefinition, ToolResult } from '../custom-tools/types';

const echoSchema = z.object({
  message: z.string().min(1),
});

export const echoTool: ToolDefinition<typeof echoSchema, { message: string }, ToolResult> = {
  name: 'echo',
  description: 'Echo back the provided message.',
  module: 'demo/echo',
  schema: echoSchema,
  handler: async ({ message }) => ({
    content: [{ type: 'text', text: message }],
  }),
};
```

Module registration example:

```ts
import { CustomToolManager } from './custom-tools';
import { echoTool } from './custom-tools/demo/echo';

const manager = new CustomToolManager();
manager.registerModule('demo/echo', [echoTool]);
const customServers = manager.createMcpServers();
```

Usage example:

```bash
claude-replica -p "Use the calculator tool to evaluate (12.5 + 7.5) / 4 with 2 decimals"
```

Permission configuration example:

```json
{
  "permissionMode": "default",
  "allowedTools": [
    "mcp__custom-tools-math-calculators__calculator",
    "mcp__custom-tools-math-calculators__*"
  ]
}
```

The MCP tool name format is `mcp__{server}__{tool}`. For modules, the server name is built from `CUSTOM_TOOL_SERVER_NAME_PREFIX` and `CUSTOM_TOOL_MODULE_SEPARATOR` (default: `custom-tools` + `-`), so `math/calculators` becomes `custom-tools-math-calculators`.

## 🔒 Permission Modes

| Mode | Description |
|------|-------------|
| `default` | Default mode, sensitive operations require confirmation |
| `acceptEdits` | Auto-accept file edits |
| `bypassPermissions` | Bypass all permission checks |
| `plan` | Plan mode, only generate plans without execution |

## 💾 Session Management

### Session Persistence

Sessions are automatically saved and stored in `~/.claude-replica/sessions/`:
- **Interactive Mode**: Sessions persist across commands and can be resumed
- **Non-Interactive Mode**: Uses temporary sessions that are not saved to disk

### Session Features

1. **Automatic Statistics Calculation**
   - Token usage tracking (input/output)
   - Cost calculation in USD
   - Message count
   - Last message preview

2. **Session Branching (Forking)**
   - Create branches from existing sessions
   - Track parent-child relationships
   - Visual indicator (🔀) for forked sessions

3. **Automatic Cleanup**
   - Configurable session retention (default: 10 sessions)
   - Cleans old sessions on application startup
   - Preserves active sessions

### Migration from Old CLI Arguments

**Old Usage (Deprecated):**
```bash
# These CLI arguments have been removed
claude-replica -c              # Continue recent session
claude-replica --resume <id>   # Resume specific session
claude-replica --fork          # Fork session
```

**New Usage (Interactive Mode):**
```bash
# Start interactive mode
claude-replica

# Inside interactive mode:
/resume    # List and resume recent sessions
/fork      # Fork current session
```

**Benefits of New Approach:**
- Consistent interactive experience
- Better session visualization
- More detailed session information
- Easier session management

## 🏭 CI/CD Integration

Claude Replica supports use in CI/CD environments. Authentication is handled automatically by the Claude Agent SDK, and can be overridden via environment variables in CI environments:

```yaml
# GitHub Actions Example
- name: Install Claude Code CLI
  run: npm install -g @anthropic-ai/claude-code

- name: Run Claude Replica
  env:
    # Provide authentication via environment variable in CI (optional)
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  run: |
    claude-replica -p "Analyze code and generate tests" \
      --output-format json \
      --timeout 300
```

CI environment auto-detection:
- GitHub Actions
- GitLab CI
- Jenkins
- CircleCI
- Travis CI
- Azure Pipelines

## 🛠️ Development

### Environment Requirements

- Node.js >= 20.0.0
- npm >= 9.0.0

### Development Commands

```bash
# Install dependencies
npm install

# Development mode (watch for changes)
npm run dev

# Build
npm run build

# Run tests
npm test

# Run tests (watch mode)
npm run test:watch

# Lint code
npm run lint

# Format code
npm run format

# Clean build artifacts
npm run clean
```

### Project Structure

```
claude-replica/
├── src/
│   ├── agents/       # Subagent registry
│   ├── ci/           # CI/CD support
│   ├── cli/          # CLI parser
│   ├── commands/     # Command manager
│   ├── config/       # Configuration management
│   ├── context/      # Context management
│   ├── core/         # Core engine
│   │   ├── MessageRouter.ts
│   │   ├── SessionManager.ts
│   │   └── StreamingMessageProcessor.ts
│   ├── hooks/        # Hook manager
│   ├── image/        # Image processing
│   ├── mcp/          # MCP integration
│   ├── output/       # Output formatting
│   ├── permissions/  # Permission management
│   ├── plugins/      # Plugin system
│   ├── rewind/       # Rewind system
│   ├── sandbox/      # Sandbox management
│   ├── skills/       # Skill manager
│   ├── tools/        # Tool registry
│   ├── ui/           # Interactive UI
│   ├── cli.ts        # CLI entry point
│   ├── index.ts      # Main export
│   └── main.ts       # Main program
├── tests/            # Test files
├── docs/             # Documentation
├── examples/         # Example projects
└── dist/             # Build output
```

## 📖 API Documentation

For detailed API documentation, see [docs/API.md](docs/zh/API.md).

## 📝 Changelog

### v0.1.0 (2026-01)

- 🎉 Initial release
- ✨ Core functionality implementation
- 📦 Extension system support
- 🔌 MCP integration
- 🏭 CI/CD support

## 🤝 Contributing

We welcome contributions! Please read [CONTRIBUTING_EN.md](CONTRIBUTING_EN.md) for contribution guidelines.

## 📄 License

[MIT License](LICENSE)

## 🙏 Acknowledgments

- [Anthropic](https://www.anthropic.com/) - Claude AI and Agent SDK
- [Claude Code](https://claude.ai/code) - Original inspiration source

## 📞 Support

- 📧 Email: wuwenjun19930614@gmail.com
- 🐛 Issues: [GitHub Issues](https://github.com/BaqiF2/claude-replica/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/BaqiF2/claude-replica/discussions)
