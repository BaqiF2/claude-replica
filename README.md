# Claude Replica

[![npm version](https://badge.fury.io/js/claude-replica.svg)](https://badge.fury.io/js/claude-replica)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/claude-replica.svg)](https://nodejs.org)

A complete replica of Claude Code's intelligent coding assistant command-line tool. Deeply integrated with the official **Claude Agent SDK**, designed to provide a high-performance, highly extensible AI-assisted programming foundation.

## 🌐 Language / 语言

[中文文档](README_ZH.md) | Chinese Documentation

---

## 🎯 Core Purpose

* **Built on Claude Agent SDK**: This project is a custom programming application built on top of Anthropic's official Agent SDK, fully implementing a closed loop of code awareness, tool invocation, and task execution.
* **Standardized Layered Architecture**: Adopts a clear layered design (CLI layer, business logic layer, SDK adaptation layer). This highly decoupled architecture allows developers to easily strip away the original command-line interface and **quickly integrate Web, desktop, plugins, or other UI presentation layers**, enabling seamless capability migration.

---

## 💡 What Can You Do With It?

### 1. Deeply Customize Your Personal Programming Tool

You can create a Claude variant that best fits your personal workflow by modifying core logic or extending components:

* **Modify Component Logic**: Adjust the Agent's decision-making process or tool usage preferences according to your needs.
* **Inject Specific Skills**: Use the built-in Skills system to write specialized guides for specific frameworks or internal company codebases.
* **Custom Automation Hooks**: Use the Hook system to automatically execute specific Lint or test operations after code generation.

### 2. Rapidly Build Domain-Specific Vertical Applications

Leveraging this project's mature "scaffolding" layered design, you can skip infrastructure development and focus on business value:

* **Cross-Platform UI Adaptation**: Develop only the presentation layer to integrate AI programming capabilities into enterprise internal portals or customized IDEs.
* **Industry Vertical Applications**: Combined with MCP integration, connect to industry-specific professional databases (such as financial legal texts, medical regulations) to rapidly incubate vertical domain AI assistants.

---

## ✨ Core Features

### Core Functionality
- 🤖 **Intelligent Conversation** - AI coding assistant based on Claude Agent SDK
- 📁 **File Operations** - Read, edit, create, and delete files
- 🔧 **Command Execution** - Safely execute Bash commands
- 🔍 **Code Search** - Powerful codebase navigation and search capabilities
- 💾 **Session Management** - Save and restore conversation sessions

### Extension Systems
- 🎯 **Skills System** - Auto-loading domain knowledge and workflow guides
- 📝 **Custom Commands** - Create reusable command templates
- 🤝 **Subagents** - Specialized task-handling agents
- 🪝 **Hooks System** - Automatically triggered actions after tool use

### Integration Capabilities
- 🌐 **MCP Integration** - Model Context Protocol server support
- 🔐 **Permission Management** - Fine-grained tool permission control
- ⏪ **Rewind System** - Undo file modifications, restore to previous state
- 🖼️ **Image Support** - Send images for UI design and debugging
---

## 🚀 Quick Start

### Install from Source

```bash
git clone https://github.com/BaqiF2/claude-replica.git
cd claude-replica
npm install
npm run build
npm link
```

### Run

```bash
# Start interactive conversation
claude-replica

# Single query for specific task
claude-replica -p "Refactor index.ts in current directory to improve readability"

```

---

## 🔧 Configuration

### Configuration File

Create a `.claude/settings.json` configuration file in your project root:

```json
{
  "model": "claude-sonnet-4-5-20250929",
  "permissionMode": "default",
  "maxTurns": 100,
  "maxBudgetUsd": 10,
  "allowedTools": ["Read", "Write", "Bash", "Grep"],
  "disallowedTools": []
}
```

### Authentication Configuration

Claude Replica uses the Claude Agent SDK and automatically retrieves authentication information from Claude Code configuration.

**Method 1: Login using Claude Code CLI**
```bash
claude login
```

**Method 2: Set API Key in project configuration**
```json
{
  "apiKey": "your-api-key-here"
}
```

**Method 3: Use environment variables (CI/CD environments)**
```bash
export ANTHROPIC_API_KEY="your-api-key"
```

## 🚀 Quick Usage

### Basic Commands

```bash
# Interactive mode
claude-replica

# Non-interactive mode
claude-replica -p "Explain what this code does"

# Continue last session
claude-replica -c

# Specify model
claude-replica --model sonnet
```

### Built-in Commands

In interactive mode, use `/help`, `/sessions`, `/config`, `/permissions`, `/mcp`, and other commands.

📖 **Detailed Usage Instructions**: See [User Guide](docs/zh/USER_GUIDE.md) for all command-line options, session management, output formats, and complete functionality.

## 📚 Extension System

Claude Replica provides a powerful extension system that allows you to customize and extend functionality according to your needs:

### Skills System
Create `SKILL.md` files in the `.claude/skills/` directory to automatically load domain knowledge and workflow guides.

### Custom Commands
Create `.md` files in the `.claude/commands/` directory to define reusable command templates.

### Subagents
Preset specialized task-handling agents (code-reviewer, test-runner, doc-generator, etc.), defined in `src/agents/`. See [SubAgents Guide](docs/zh/reference/SUBAGENTS_GUIDE.md) for details.

### Hooks System
Configure event-driven automation operations in `.claude/hooks.json` (supports 12 event types).

### Custom Tools
Define TypeScript tools using Zod schemas and register them via in-process MCP servers. See [Custom Tools Configuration Guide](docs/zh/reference/CUSTOM_TOOLS_CONFIG_GUIDE.md) for details.

### Custom UI
Based on layered UI architecture, implement custom interfaces (Web UI, desktop GUI, etc.). See [Custom UI Implementation Guide](docs/zh/reference/CUSTOM_UI_GUIDE.md) for details.

### MCP Integration
Create `.mcp.json` in the project root to configure Model Context Protocol servers, supporting stdio, SSE, and HTTP transports.

📖 **Complete Extension Development Guide**: See [Developer Guide](docs/zh/DEVELOPER_GUIDE.md) to learn how to create new managers, add new tools, develop plugins, and other advanced topics.

## 🔒 Permission Management

Claude Replica provides fine-grained permission control with four permission modes:

| Mode | Description |
|------|-------------|
| `default` | Default mode, sensitive operations require confirmation |
| `acceptEdits` | Auto-accept file edits |
| `bypassPermissions` | Bypass all permission checks (dangerous) |
| `plan` | Plan mode, only generate plans without execution |

Can be set via command-line `--permission-mode` or configuration file. Supports tool whitelist/blacklist configuration.

📖 **Detailed Permission Configuration**: See [User Guide - Permission Management](docs/zh/USER_GUIDE.md#权限管理) for more information.

---

## 📖 Documentation Navigation

- **[User Guide](docs/zh/USER_GUIDE.md)** - Detailed usage instructions, best practices, and troubleshooting
- **[Developer Guide](docs/zh/DEVELOPER_GUIDE.md)** - Project architecture, extension development, and contribution guidelines
- **[SubAgents Guide](docs/zh/reference/SUBAGENTS_GUIDE.md)** - Detailed subagent documentation
- **[Custom Tools Configuration Guide](docs/zh/reference/CUSTOM_TOOLS_CONFIG_GUIDE.md)** - Custom tool development
- **[Custom UI Implementation Guide](docs/zh/reference/CUSTOM_UI_GUIDE.md)** - UI extension development

---

## 🤝 Contributing

We welcome contributions! Please read [CONTRIBUTING_ZH.md](CONTRIBUTING.md) for contribution guidelines.

## 📄 License

[MIT License](LICENSE)

## 📞 Support

- 📧 Email: wuwenjun19930614@gmail.com
- 🐛 Issues: [GitHub Issues](https://github.com/BaqiF2/claude-replica/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/BaqiF2/claude-replica/discussions)
