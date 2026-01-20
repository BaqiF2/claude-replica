# Claude Replica

[![npm version](https://badge.fury.io/js/claude-replica.svg)](https://badge.fury.io/js/claude-replica)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/claude-replica.svg)](https://nodejs.org)

完整复刻 Claude Code 功能的智能代码助手命令行工具。本项目深度集成官方 **Claude Agent SDK**，旨在提供一个高性能、高可扩展性的 AI 辅助编程基座。

---

## 🎯 项目核心

* **基于 Claude Agent SDK 打造**：本项目是构建在 Anthropic 官方 Agent SDK 之上的自定义编程应用，完整实现了代码感知、工具调用与任务执行的闭环。
* **标准化分层架构**：采用清晰的 CLI 层、业务逻辑层与 SDK 适配层设计。这种高度解耦的架构使得开发者可以轻松剥离原有的命令行界面，**快速接入 Web、桌面端或插件等其他 UI 表现层**，实现能力的无缝迁移。

---

## 💡 你可以用它做什么？

### 1. 深度定制个性化编程工具

你可以通过修改核心逻辑或扩展组件，打造最符合个人工作流的 Claude 变体：

* **修改组件逻辑**：根据需求调整 Agent 的决策过程或工具使用偏好。
* **注入特定技能**：利用内置的技能系统（Skills）为特定框架或公司内部代码库编写专属指南。
* **自定义自动化钩子**：利用 Hook 系统在代码生成后自动执行特定的 Lint 或测试操作。

### 2. 快速产出专属垂直领域应用

借助本项目成熟的“脚手架”分层设计，你可以跳过底层建设，专注于业务价值：

* **跨平台 UI 适配**：只需开发表现层，即可将 AI 编程能力集成到企业内部门户或定制化 IDE 中。
* **行业垂直应用**：结合 MCP 集成，接入特定行业的专业数据库（如金融法律条文、医疗规范），快速孵化垂直领域的 AI 助理。

---

## ✨ 核心特性

### 核心功能
- 🤖 **智能对话** - 基于 Claude Agent SDK 的智能代码助手
- 📁 **文件操作** - 读取、编辑、创建和删除文件
- 🔧 **命令执行** - 安全执行 Bash 命令
- 🔍 **代码搜索** - 强大的代码库导航与搜索能力
- 💾 **会话管理** - 保存和恢复对话会话

### 扩展系统
- 🎯 **技能系统** - 自动加载领域知识和工作流指南
- 📝 **自定义命令** - 创建可重用的命令模板
- 🤝 **子代理** - 专门化的任务处理代理
- 🪝 **钩子系统** - 工具使用后自动触发的操作

### 集成能力
- 🌐 **MCP 集成** - Model Context Protocol 服务器支持
- 🔐 **权限管理** - 细粒度的工具权限控制
- ⏪ **回退系统** - 撤销文件修改，恢复到之前状态
- 🖼️ **图像支持** - 发送图像进行 UI 设计和调试
---

## 🚀 快速开始

### 从源码安装

```bash
git clone https://github.com/BaqiF2/claude-replica.git
cd claude-replica
npm install
npm run build
npm link
```

### 运行

```bash
# 开启交互式对话
claude-replica

# 针对特定问题进行单次查询
claude-replica -p "重构当前目录下的 index.ts 文件，提高其可读性"

```

---

## 🔧 配置

### 配置文件

在项目根目录创建 `.claude/settings.json` 配置文件：

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

### 认证配置

Claude Replica 使用 Claude Agent SDK，会自动从 Claude Code 配置中获取认证信息。

**方式一：使用 Claude Code CLI 登录**
```bash
claude login
```

**方式二：在项目配置中设置 API Key**
```json
{
  "apiKey": "your-api-key-here"
}
```

**方式三：使用环境变量（CI/CD 环境）**
```bash
export ANTHROPIC_API_KEY="your-api-key"
```

## 🚀 快速使用

### 基本命令

```bash
# 交互模式
claude-replica

# 非交互模式
claude-replica -p "解释这段代码的作用"

# 继续上次会话
claude-replica -c

# 指定模型
claude-replica --model sonnet
```

### 内置命令

在交互模式下可使用 `/help`、`/sessions`、`/config`、`/permissions`、`/mcp` 等命令。

📖 **详细使用说明**：查看 [用户指南](docs/zh/USER_GUIDE.md) 了解所有命令行选项、会话管理、输出格式等完整功能。

## 📚 扩展系统

Claude Replica 提供了强大的扩展系统，让你可以根据需求自定义和扩展功能：

### 技能系统 (Skills)
在 `.claude/skills/` 目录创建 `SKILL.md` 文件，自动加载领域知识和工作流指南。

### 自定义命令 (Commands)
在 `.claude/commands/` 目录创建 `.md` 文件，定义可重用的命令模板。

### 子代理 (Subagents)
预设专门化的任务处理代理（code-reviewer、test-runner、doc-generator 等），在 `src/agents/` 中定义。详见 [SubAgents 使用指南](docs/zh/reference/SUBAGENTS_GUIDE.md)。

### 钩子系统 (Hooks)
在 `.claude/hooks.json` 配置事件驱动的自动化操作（支持 12 种事件类型）。

### 自定义工具 (Custom Tools)
使用 Zod schema 定义 TypeScript 工具，通过进程内 MCP 服务器注册。详见 [自定义工具配置指南](docs/zh/reference/CUSTOM_TOOLS_CONFIG_GUIDE.md)。

### 自定义 UI
基于分层 UI 架构，实现自定义界面（Web UI、桌面 GUI 等）。详见 [自定义 UI 实现指南](docs/zh/reference/CUSTOM_UI_GUIDE.md)。

### MCP 集成
在项目根目录创建 `.mcp.json` 配置 Model Context Protocol 服务器，支持 stdio、SSE、HTTP 传输。

📖 **完整扩展开发指南**：查看 [开发者指南](docs/zh/DEVELOPER_GUIDE.md) 了解如何创建新的管理器、添加新工具、开发插件等高级内容。

## 🔒 权限管理

Claude Replica 提供细粒度的权限控制，支持四种权限模式：

| 模式 | 描述 |
|------|------|
| `default` | 默认模式，敏感操作需要确认 |
| `acceptEdits` | 自动接受文件编辑 |
| `bypassPermissions` | 绕过所有权限检查（危险）|
| `plan` | 计划模式，只生成计划不执行 |

可通过命令行 `--permission-mode` 或配置文件设置。支持工具白名单/黑名单配置。

📖 **详细权限配置**：查看 [用户指南 - 权限管理](docs/zh/USER_GUIDE.md#权限管理) 了解更多。

---

## 📖 文档导航

- **[用户指南](docs/zh/USER_GUIDE.md)** - 详细的使用说明、最佳实践和故障排除
- **[开发者指南](docs/zh/DEVELOPER_GUIDE.md)** - 项目架构、扩展开发和贡献指南
- **[SubAgents 使用指南](docs/zh/reference/SUBAGENTS_GUIDE.md)** - 子代理详细说明
- **[自定义工具配置指南](docs/zh/reference/CUSTOM_TOOLS_CONFIG_GUIDE.md)** - 自定义工具开发
- **[自定义 UI 实现指南](docs/zh/reference/CUSTOM_UI_GUIDE.md)** - UI 扩展开发

---

## 🤝 贡献

欢迎贡献代码！请阅读 [CONTRIBUTING_ZH.md](CONTRIBUTING.md) 了解贡献指南。

## 📄 许可证

[MIT License](LICENSE)

## 📞 支持

- 📧 Email: wuwenjun19930614@gmail.com
- 🐛 Issues: [GitHub Issues](https://github.com/BaqiF2/claude-replica/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/BaqiF2/claude-replica/discussions)
