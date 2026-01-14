# Claude Replica User Guide

This guide provides detailed instructions on how to use Claude Replica for daily development work.

## Table of Contents

- [Getting Started](#getting-started)
  - [Installation](#installation)
  - [Configure API Key](#configure-api-key)
  - [First Use](#first-use)
- [Basic Usage](#basic-usage)
  - [Interactive Mode](#interactive-mode)
  - [Non-Interactive Mode](#non-interactive-mode)
  - [Session Management](#session-management)
- [Advanced Features](#advanced-features)
  - [Skills System](#skills-system)
  - [Custom Commands](#custom-commands)
  - [Subagents](#subagents)
  - [Hook System](#hook-system)
- [MCP Integration](#mcp-integration)
- [Permission Management](#permission-management)
- [Rewind System](#rewind-system)
- [CI/CD Integration](#cicd-integration)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Getting Started

### Installation

#### Global Installation (Recommended)

```bash
npm install -g claude-replica
```

After installation, you can use the `claude-replica` command in any directory.

#### Project Local Installation

```bash
npm install claude-replica
npx claude-replica
```

#### Install from Source

```bash
git clone https://github.com/your-username/claude-replica.git
cd claude-replica
npm install
npm run build
npm link
```

### Configure Authentication

Claude Replica uses the Claude Agent SDK and automatically retrieves authentication information from Claude Code configuration.

#### Method 1: Use Claude Code CLI Login (Recommended)

```bash
# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Login
claude login
```

After login, authentication information is saved in the `~/.claude/` directory, and Claude Replica will automatically use it.

#### Method 2: Environment Variables (CI/CD Environment)

In CI/CD environments, authentication can be overridden via environment variables:

```bash
# Linux/macOS
export ANTHROPIC_API_KEY="your-api-key"

# Windows (PowerShell)
$env:ANTHROPIC_API_KEY="your-api-key"

# Windows (CMD)
set ANTHROPIC_API_KEY=your-api-key
```

### First Use

```bash
# Start interactive session
claude-replica

# Or ask directly
claude-replica -p "Hello, please introduce yourself"
```

## Basic Usage

### Interactive Mode

Interactive mode provides a continuous conversation experience:

```bash
claude-replica
```

In interactive mode:
- Directly input messages to converse with AI
- Use commands starting with `/` to perform special operations
- Press `Esc` to interrupt current operation
- Press `Esc + Esc` to open rewind menu
- Input `/exit` or `Ctrl+C` to exit

#### Built-in Commands

| Command | Description |
|---------|-------------|
| `/help` | Show help information |
| `/sessions` | List all sessions |
| `/config` | Show current configuration |
| `/permissions` | Show permission settings |
| `/mcp` | Show MCP server status |
| `/clear` | Clear screen |
| `/exit` | Exit program |

### Non-Interactive Mode

Non-interactive mode is suitable for scripts and automation:

```bash
# Basic query
claude-replica -p "Explain what this code does"

# Read query from file
claude-replica -p "$(cat query.txt)"

# Pipe input
echo "Analyze this project structure" | claude-replica -p -

# Specify output format
claude-replica -p "Generate test cases" --output-format json

# Set timeout
claude-replica -p "Refactor this function" --timeout 300
```

#### Output Formats

| Format | Description |
|--------|-------------|
| `text` | Plain text (default) |
| `json` | JSON format with complete information |
| `stream-json` | Streaming JSON, one event per line |
| `markdown` | Markdown format |

### Session Management

Sessions allow you to save and restore conversation context.

```bash
# Continue most recent session
claude-replica -c

# Resume specific session
claude-replica --resume abc123

# List all sessions
claude-replica sessions

# Clean old sessions
claude-replica sessions clean --older-than 7d
```

Sessions are automatically saved in the `~/.claude-replica/sessions/` directory.

## Advanced Features

### Skills System

Skills are auto-loading domain knowledge modules that help AI better understand specific domains.

#### Create Skill

Create `.md` files in the `.claude/skills/` directory:

```markdown
---
name: react-expert
description: React development expert
triggers:
  - react
  - component
  - hook
  - jsx
tools:
  - Read
  - Write
  - Bash
---

You are a React development expert, specializing in:

## Core Capabilities
- Function components and Hooks development
- State management (useState, useReducer, Context)
- Performance optimization (useMemo, useCallback, React.memo)
- Custom Hook design

## Best Practices
- Components should be small and focused
- Use TypeScript for type checking
- Write unit tests and integration tests
- Follow React official recommended patterns

## Common Commands
- `npm run dev` - Start development server
- `npm test` - Run tests
- `npm run build` - Build production version
```

#### Skill Directory

Skills can be placed in the following locations:
- User-level: `~/.claude/skills/`
- Project-level: `.claude/skills/`

Project-level skills take precedence over user-level skills.

### Custom Commands

Commands are reusable prompt templates.

#### Create Command

Create `.md` files in the `.claude/commands/` directory:

```markdown
---
name: review
description: Code review
argumentHint: <file>
allowedTools:
  - Read
  - Grep
---

Please review the code quality of the following file:

$ARGUMENTS

Focus on:
1. Code style and readability
2. Potential bugs and error handling
3. Performance issues
4. Security vulnerabilities
5. Test coverage

Please provide specific improvement suggestions and code examples.
```

#### Use Commands

```bash
# In interactive mode
/review src/main.ts

# Or
/review src/utils/*.ts
```

#### Command Variables

| Variable | Description |
|----------|-------------|
| `$ARGUMENTS` | User-provided arguments |
| `!`command`` | Execute command and embed output |

Example:

```markdown
---
name: git-summary
description: Git commit summary
---

Please analyze recent Git commits:

!`git log --oneline -10`

And generate a change summary.
```

### Subagents

Subagents are specialized AI instances used to handle specific types of tasks.

#### Create Subagent

Create `.agent.md` files in the `.claude/agents/` directory:

```markdown
---
description: Testing expert, focused on writing high-quality tests
model: sonnet
tools:
  - Read
  - Write
  - Bash
  - Grep
---

You are a testing expert responsible for:

## Responsibilities
- Writing unit tests
- Writing integration tests
- Analyzing test coverage
- Providing testing strategy advice

## Testing Principles
- Tests should be independent and repeatable
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Prioritize testing edge cases and error conditions

## Supported Frameworks
- Jest (JavaScript/TypeScript)
- Pytest (Python)
- JUnit (Java)
- Go Test (Go)
```

#### Use Subagents

Subagents automatically match based on task description, or can be called explicitly:

```
@test-expert Please write unit tests for src/utils.ts
```

### Hook System

Hooks allow automatic execution of actions when specific events occur.

#### Configure Hooks

Create `.claude/hooks.json`:

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
  ],
  "SessionStart": [
    {
      "matcher": ".*",
      "hooks": [
        {
          "type": "prompt",
          "prompt": "Please remember to follow the project's coding standards"
        }
      ]
    }
  ]
}
```

#### Hook Events

| Event | Description |
|-------|-------------|
| `PreToolUse` | Before tool use |
| `PostToolUse` | After tool use |
| `PostToolUseFailure` | After tool use failure |
| `SessionStart` | Session start |
| `SessionEnd` | Session end |
| `UserPromptSubmit` | User submits prompt |
| `Notification` | Notification event |
| `Stop` | Stop event |
| `SubagentStart` | Subagent start |
| `SubagentStop` | Subagent stop |
| `PreCompact` | Before compaction |
| `PermissionRequest` | Permission request |

#### Hook Variables

| Variable | Description |
|----------|-------------|
| `$TOOL` | Tool name |
| `$FILE` | File path being operated on |
| `$COMMAND` | Executed command |

## MCP Integration

MCP (Model Context Protocol) allows integration of external tools and services.

### Configure MCP Server

Create `.mcp.json`:

```json
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
  }
}
```

### Transport Types

#### stdio (Default)

```json
{
  "server-name": {
    "command": "npx",
    "args": ["-y", "package-name"],
    "env": {}
  }
}
```

#### SSE

```json
{
  "server-name": {
    "transport": "sse",
    "url": "https://example.com/sse",
    "headers": {
      "Authorization": "Bearer ${API_KEY}"
    }
  }
}
```

#### HTTP

```json
{
  "server-name": {
    "transport": "http",
    "url": "https://example.com/api",
    "headers": {}
  }
}
```

### View MCP Status

```bash
# In interactive mode
/mcp
```

## Permission Management

Claude Replica provides fine-grained permission control.

### Permission Modes

| Mode | Description |
|------|-------------|
| `default` | Default mode, sensitive operations require confirmation |
| `acceptEdits` | Auto-accept file edits |
| `bypassPermissions` | Bypass all permission checks (dangerous) |
| `plan` | Plan mode, only generate plans without execution |

### Set Permission Mode

```bash
# Command line
claude-replica --permission-mode acceptEdits

# Configuration file
{
  "permissionMode": "acceptEdits"
}
```

### Tool Whitelist/Blacklist

```bash
# Allow only specific tools
claude-replica --allowed-tools Read,Write,Grep

# Disallow specific tools
claude-replica --disallowed-tools Bash,WebFetch
```

### Danger Mode

⚠️ **Warning**: The following option will skip all security checks, only use in fully trusted environments.

```bash
claude-replica --dangerously-skip-permissions
```

## Rewind System

The rewind system allows undoing AI file modifications.

### Use Rewind

1. Press `Esc + Esc` in interactive mode to open rewind menu
2. Select snapshot to restore
3. Confirm restore

### Snapshot Management

- Snapshots are automatically created for each file modification
- Up to 50 snapshots are saved
- Snapshots contain file content before modification

## CI/CD Integration

Claude Replica supports use in CI/CD environments.

### GitHub Actions

```yaml
name: Code Review

on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install Claude Code CLI
        run: npm install -g @anthropic-ai/claude-code

      - name: Install Claude Replica
        run: npm install -g claude-replica

      - name: Run Code Review
        env:
          # Provide authentication via environment variable in CI
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          claude-replica -p "Review code changes in this PR" \
            --output-format json \
            --timeout 300
```

### GitLab CI

```yaml
code-review:
  image: node:20
  script:
    - npm install -g @anthropic-ai/claude-code
    - npm install -g claude-replica
    - claude-replica -p "Analyze code quality" --output-format json
  variables:
    # Provide authentication via environment variable in CI
    ANTHROPIC_API_KEY: $ANTHROPIC_API_KEY
```

### CI Environment Detection

Claude Replica automatically detects the following CI environments:
- GitHub Actions
- GitLab CI
- Jenkins
- CircleCI
- Travis CI
- Azure Pipelines

In CI environments:
- Automatically use non-interactive mode
- Output structured logs
- Support timeout limits
- Return appropriate exit codes
- Provide authentication via environment variable `ANTHROPIC_API_KEY`

### Exit Codes

| Exit Code | Description |
|-----------|-------------|
| 0 | Success |
| 1 | General error |
| 2 | Configuration error |
| 3 | Authentication error |
| 4 | Network error |
| 5 | Timeout error |
| 6 | Permission error |

## Best Practices

### 1. Use CLAUDE.md

Create `CLAUDE.md` file in project root, describing project context:

```markdown
# Project Name

## Overview
This is a React + TypeScript project...

## Tech Stack
- React 18
- TypeScript 5
- Vite
- Tailwind CSS

## Directory Structure
- src/components/ - React components
- src/hooks/ - Custom Hooks
- src/utils/ - Utility functions

## Coding Standards
- Use function components
- Use TypeScript strict mode
- Follow ESLint rules

## Common Commands
- npm run dev - Start development server
- npm test - Run tests
- npm run build - Build production version
```

### 2. Configure Project-level Settings

Create `.claude/settings.json`:

```json
{
  "model": "claude-sonnet-4-5-20250929",
  "permissionMode": "acceptEdits",
  "allowedTools": ["Read", "Write", "Edit", "Bash", "Grep", "Glob"],
  "maxTurns": 50
}
```

### 3. Use Skills to Improve Efficiency

Create skills for common tasks:
- Code review skills
- Test writing skills
- Documentation generation skills
- Refactoring skills

### 4. Create Common Commands

Create commands for repetitive tasks:
- `/review` - Code review
- `/test` - Generate tests
- `/doc` - Generate documentation
- `/refactor` - Refactor code

### 5. Use Hooks for Automation

Configure hooks to automatically execute:
- Run lint after file save
- Run tests after test file modification
- Update documentation after code modification

## Troubleshooting

### Authentication Issues

```
Error: API error: authentication failed
```

Solution:
1. Ensure Claude Code is properly configured: run `claude login`
2. In CI environment, check if `ANTHROPIC_API_KEY` environment variable is set
3. Confirm API key is valid and not expired

### Network Issues

```
Error: Network error: unable to connect to server
```

Solution:
1. Check network connection
2. Check proxy settings
3. Try using VPN

### Permission Issues

```
Error: Permission denied
```

Solution:
1. Check file/directory permissions
2. Use `--permission-mode acceptEdits`
3. Check tool whitelist/blacklist configuration

### Timeout Issues

```
Error: Execution timeout
```

Solution:
1. Increase timeout `--timeout 600`
2. Simplify queries
3. Break down complex tasks

### Debug Mode

Enable debug mode to get detailed information:

```bash
CLAUDE_REPLICA_DEBUG=true claude-replica -p "your query"
```

Or use `--verbose` option:

```bash
claude-replica -p "your query" --verbose
```

### Log Files

Logs are saved in `~/.claude-replica/logs/` directory and can be used for troubleshooting.

## Getting Help

- 📖 [API Documentation](API_EN.md)
- 🛠️ [Developer Guide](DEVELOPER_GUIDE_EN.md)
- 🐛 [GitHub Issues](https://github.com/your-username/claude-replica/issues)
- 💬 [GitHub Discussions](https://github.com/your-username/claude-replica/discussions)
