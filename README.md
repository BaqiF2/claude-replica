# Claude Replica

[![npm version](https://badge.fury.io/js/claude-replica.svg)](https://badge.fury.io/js/claude-replica)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/claude-replica.svg)](https://nodejs.org)

完整复刻 Claude Code 的智能代码助手命令行工具。基于 Claude Agent SDK 构建，提供强大的 AI 辅助编程能力。

> **⚠️ 项目核心作用（非造轮子）**
>
> 本项目并非为了完全复制 Claude Code，而是作为 **学习与开发的脚手架**：
>
> 1. **📚 学习 Claude Code 核心功能** - 通过阅读 `doc/` 目录下的文档，深入了解 Claude Code 的设计思想、架构模式和功能特性
>
> 2. **🚀 掌握 Claude Agent SDK** - 通过 `doc/` 目录下的开发文档，熟练掌握 Claude Agent SDK 的核心功能和开发流程
>
> 3. **🎯 分层架构脚手架** - 采用清晰的分层设计（CLI层、业务逻辑层、SDK适配层），只需替换CLI层为任何"表现层"（Web界面、桌面应用、API服务等），即可快速构建全新的AI Agent。无需从零开始开发，充分发挥你的**想象力**！

## ✨ 功能特性

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
- 🔌 **插件系统** - 打包的功能扩展

### 集成能力
- 🌐 **MCP 集成** - Model Context Protocol 服务器支持
- 🔐 **权限管理** - 细粒度的工具权限控制
- ⏪ **回退系统** - 撤销文件修改，恢复到之前状态
- 🖼️ **图像支持** - 发送图像进行 UI 设计和调试
- 🏭 **CI/CD 支持** - 自动化管道集成

## 📦 安装

### 全局安装（推荐）

```bash
npm install -g claude-replica
```

### 本地安装

```bash
npm install claude-replica
```

### 从源码安装

```bash
git clone https://github.com/BaqiF2/claude-replica.git
cd claude-replica
npm install
npm run build
npm link
```

## 🔧 配置

### 认证配置

Claude Replica 使用 Claude Agent SDK，会自动从 Claude Code 配置中获取认证信息。只需确保 Claude Code 已正确配置：

```bash
# 方式一：使用 Claude Code CLI 登录
claude login

# 方式二：检查配置文件
ls ~/.claude/settings.json
```

认证信息会从以下位置自动加载（按优先级）：
- `~/.claude/settings.json` (用户级)
- `.claude/settings.json` (项目级)
- `.claude/settings.local.json` (本地级)

### 配置文件

Claude Replica 支持多级配置：

1. **用户级配置**: `~/.claude-replica/settings.json`
2. **项目级配置**: `.claude-replica/settings.json`
3. **本地配置**: `.claude-replica/settings.local.json`

配置优先级：本地 > 项目 > 用户

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

## 🚀 使用方法

### 交互模式

```bash
# 启动交互式会话
claude-replica

# 继续最近的会话
claude-replica -c

# 恢复指定会话
claude-replica --resume <session-id>
```

### 非交互模式

```bash
# 单次查询
claude-replica -p "解释这段代码的作用"

# 从文件读取查询
claude-replica -p "$(cat query.txt)"

# 管道输入
echo "分析这个项目结构" | claude-replica -p -

# 指定输出格式
claude-replica -p "生成测试用例" --output-format json
```

### 命令行选项

```
基本选项:
  -p, --print              非交互模式，执行查询后退出
  -c, --continue           继续最近的会话
  --resume <id>            恢复指定会话
  --help                   显示帮助信息
  --version                显示版本号

模型选项:
  --model <name>           指定模型 (sonnet, haiku, opus)

工具选项:
  --allowed-tools <tools>  允许的工具列表（逗号分隔）
  --disallowed-tools <t>   禁止的工具列表（逗号分隔）

权限选项:
  --permission-mode <m>    权限模式 (default, acceptEdits, bypassPermissions, plan)
  --dangerously-skip-permissions  跳过所有权限检查（危险）

输出选项:
  --output-format <f>      输出格式 (text, json, stream-json, markdown)
  --verbose                详细输出模式

高级选项:
  --max-turns <n>          最大对话轮数
  --max-budget-usd <n>     最大预算（美元）
  --sandbox                启用沙箱模式
  --timeout <seconds>      执行超时时间
```

### 内置命令

在交互模式下，可以使用以下命令：

```
/help        - 显示帮助信息
/sessions    - 列出所有会话
/config      - 显示当前配置
/permissions - 显示权限设置
/mcp         - 显示 MCP 服务器状态
/clear       - 清屏
/exit        - 退出程序
```

## 📚 扩展系统

### 技能 (Skills)

在 `.claude-replica/skills/` 目录创建技能文件：

```markdown
---
name: react-expert
description: React 开发专家
triggers:
  - react
  - component
  - hook
tools:
  - Read
  - Write
  - Bash
---

你是 React 开发专家，擅长：
- 函数组件和 Hooks
- 状态管理
- 性能优化
- 测试策略
```

### 自定义命令 (Commands)

在 `.claude-replica/commands/` 目录创建命令文件：

```markdown
---
name: review
description: 代码审查
argumentHint: <file>
---

请审查以下文件的代码质量：
$ARGUMENTS

重点关注：
1. 代码风格
2. 潜在 bug
3. 性能问题
4. 安全漏洞
```

使用：`/review src/main.ts`

### 子代理 (Agents)

在 `.claude-replica/agents/` 目录创建代理文件：

```markdown
---
description: 测试专家，专注于编写高质量测试
model: sonnet
tools:
  - Read
  - Write
  - Bash
---

你是测试专家，负责：
- 编写单元测试
- 编写集成测试
- 分析测试覆盖率
- 提供测试策略建议
```

### 钩子 (Hooks)

在 `.claude-replica/hooks.json` 配置钩子：

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

### MCP 服务器

在项目根目录创建 `.mcp.json`：

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"
    }
  }
}
```

## 🔒 权限模式

| 模式 | 描述 |
|------|------|
| `default` | 默认模式，敏感操作需要确认 |
| `acceptEdits` | 自动接受文件编辑 |
| `bypassPermissions` | 绕过所有权限检查 |
| `plan` | 计划模式，只生成计划不执行 |

## 🏭 CI/CD 集成

Claude Replica 支持在 CI/CD 环境中使用。认证信息由 Claude Agent SDK 自动处理，在 CI 环境中可通过环境变量覆盖：

```yaml
# GitHub Actions 示例
- name: Install Claude Code CLI
  run: npm install -g @anthropic-ai/claude-code

- name: Run Claude Replica
  env:
    # 在 CI 中通过环境变量提供认证（可选）
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  run: |
    claude-replica -p "分析代码并生成测试" \
      --output-format json \
      --timeout 300
```

CI 环境自动检测：
- GitHub Actions
- GitLab CI
- Jenkins
- CircleCI
- Travis CI
- Azure Pipelines

## 🛠️ 开发

### 环境要求

- Node.js >= 20.0.0
- npm >= 9.0.0

### 开发命令

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 构建
npm run build

# 运行测试
npm test

# 运行测试（监听模式）
npm run test:watch

# 代码检查
npm run lint

# 代码格式化
npm run format

# 清理构建产物
npm run clean
```

### 项目结构

```
claude-replica/
├── src/
│   ├── agents/       # 子代理注册表
│   ├── ci/           # CI/CD 支持
│   ├── cli/          # CLI 解析器
│   ├── commands/     # 命令管理器
│   ├── config/       # 配置管理
│   ├── context/      # 上下文管理
│   ├── core/         # 核心引擎
│   │   ├── MessageRouter.ts
│   │   ├── SessionManager.ts
│   │   └── StreamingMessageProcessor.ts
│   ├── hooks/        # 钩子管理器
│   ├── image/        # 图像处理
│   ├── mcp/          # MCP 集成
│   ├── output/       # 输出格式化
│   ├── permissions/  # 权限管理
│   ├── plugins/      # 插件系统
│   ├── rewind/       # 回退系统
│   ├── sandbox/      # 沙箱管理
│   ├── skills/       # 技能管理器
│   ├── tools/        # 工具注册表
│   ├── ui/           # 交互式 UI
│   ├── cli.ts        # CLI 入口
│   ├── index.ts      # 主导出
│   └── main.ts       # 主程序
├── tests/            # 测试文件
├── docs/             # 文档
├── examples/         # 示例项目
└── dist/             # 编译输出
```

## 📖 API 文档

详细的 API 文档请参阅 [docs/API.md](docs/API.md)。

## 📝 更新日志

### v0.1.0 (2026-01)

- 🎉 初始版本发布
- ✨ 核心功能实现
- 📦 扩展系统支持
- 🔌 MCP 集成
- 🏭 CI/CD 支持

## 🤝 贡献

欢迎贡献代码！请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解贡献指南。

## 📄 许可证

[MIT License](LICENSE)

## 🙏 致谢

- [Anthropic](https://www.anthropic.com/) - Claude AI 和 Agent SDK
- [Claude Code](https://claude.ai/code) - 原始灵感来源

## 📞 支持

- 📧 Email: wuwenjun19930614@gmail.com
- 🐛 Issues: [GitHub Issues](https://github.com/BaqiF2/claude-replica/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/BaqiF2/claude-replica/discussions)
