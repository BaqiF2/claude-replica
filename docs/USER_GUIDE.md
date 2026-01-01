# Claude Replica 用户指南

本指南详细介绍如何使用 Claude Replica 进行日常开发工作。

## 目录

- [入门](#入门)
  - [安装](#安装)
  - [配置 API 密钥](#配置-api-密钥)
  - [第一次使用](#第一次使用)
- [基本使用](#基本使用)
  - [交互模式](#交互模式)
  - [非交互模式](#非交互模式)
  - [会话管理](#会话管理)
- [高级功能](#高级功能)
  - [技能系统](#技能系统)
  - [自定义命令](#自定义命令)
  - [子代理](#子代理)
  - [钩子系统](#钩子系统)
- [MCP 集成](#mcp-集成)
- [权限管理](#权限管理)
- [回退系统](#回退系统)
- [CI/CD 集成](#cicd-集成)
- [最佳实践](#最佳实践)
- [故障排除](#故障排除)

## 入门

### 安装

#### 全局安装（推荐）

```bash
npm install -g claude-replica
```

安装完成后，可以在任何目录使用 `claude-replica` 命令。

#### 项目本地安装

```bash
npm install claude-replica
npx claude-replica
```

#### 从源码安装

```bash
git clone https://github.com/your-username/claude-replica.git
cd claude-replica
npm install
npm run build
npm link
```

### 配置认证

Claude Replica 使用 Claude Agent SDK，会自动从 Claude Code 配置中获取认证信息。

#### 方式 1: 使用 Claude Code CLI 登录（推荐）

```bash
# 安装 Claude Code CLI
npm install -g @anthropic-ai/claude-code

# 登录
claude login
```

登录后，认证信息会保存在 `~/.claude/` 目录下，Claude Replica 会自动使用。

#### 方式 2: 环境变量（CI/CD 环境）

在 CI/CD 环境中，可以通过环境变量覆盖认证：

```bash
# Linux/macOS
export ANTHROPIC_API_KEY="your-api-key"

# Windows (PowerShell)
$env:ANTHROPIC_API_KEY="your-api-key"

# Windows (CMD)
set ANTHROPIC_API_KEY=your-api-key
```

### 第一次使用

```bash
# 启动交互式会话
claude-replica

# 或者直接提问
claude-replica -p "你好，请介绍一下自己"
```

## 基本使用

### 交互模式

交互模式提供持续的对话体验：

```bash
claude-replica
```

在交互模式下：
- 直接输入消息与 AI 对话
- 使用 `/` 开头的命令执行特殊操作
- 按 `Esc` 中断当前操作
- 按 `Esc + Esc` 打开回退菜单
- 输入 `/exit` 或 `Ctrl+C` 退出

#### 内置命令

| 命令 | 描述 |
|------|------|
| `/help` | 显示帮助信息 |
| `/sessions` | 列出所有会话 |
| `/config` | 显示当前配置 |
| `/permissions` | 显示权限设置 |
| `/mcp` | 显示 MCP 服务器状态 |
| `/clear` | 清屏 |
| `/exit` | 退出程序 |

### 非交互模式

非交互模式适合脚本和自动化：

```bash
# 基本查询
claude-replica -p "解释这段代码的作用"

# 从文件读取查询
claude-replica -p "$(cat query.txt)"

# 管道输入
echo "分析这个项目结构" | claude-replica -p -

# 指定输出格式
claude-replica -p "生成测试用例" --output-format json

# 设置超时
claude-replica -p "重构这个函数" --timeout 300
```

#### 输出格式

| 格式 | 描述 |
|------|------|
| `text` | 纯文本（默认） |
| `json` | JSON 格式，包含完整信息 |
| `stream-json` | 流式 JSON，每行一个事件 |
| `markdown` | Markdown 格式 |

### 会话管理

会话允许你保存和恢复对话上下文。

```bash
# 继续最近的会话
claude-replica -c

# 恢复指定会话
claude-replica --resume abc123

# 列出所有会话
claude-replica sessions

# 清理旧会话
claude-replica sessions clean --older-than 7d
```

会话自动保存在 `~/.claude-replica/sessions/` 目录。

## 高级功能

### 技能系统

技能是自动加载的领域知识模块，帮助 AI 更好地理解特定领域。

#### 创建技能

在 `.claude-replica/skills/` 目录创建 `.md` 文件：

```markdown
---
name: react-expert
description: React 开发专家
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

你是 React 开发专家，擅长：

## 核心能力
- 函数组件和 Hooks 开发
- 状态管理（useState, useReducer, Context）
- 性能优化（useMemo, useCallback, React.memo）
- 自定义 Hook 设计

## 最佳实践
- 组件应该小而专注
- 使用 TypeScript 进行类型检查
- 编写单元测试和集成测试
- 遵循 React 官方推荐的模式

## 常用命令
- `npm run dev` - 启动开发服务器
- `npm test` - 运行测试
- `npm run build` - 构建生产版本
```

#### 技能目录

技能可以放在以下位置：
- 用户级：`~/.claude-replica/skills/`
- 项目级：`.claude-replica/skills/`

项目级技能优先于用户级技能。

### 自定义命令

命令是可重用的提示词模板。

#### 创建命令

在 `.claude-replica/commands/` 目录创建 `.md` 文件：

```markdown
---
name: review
description: 代码审查
argumentHint: <file>
allowedTools:
  - Read
  - Grep
---

请审查以下文件的代码质量：

$ARGUMENTS

重点关注：
1. 代码风格和可读性
2. 潜在的 bug 和错误处理
3. 性能问题
4. 安全漏洞
5. 测试覆盖率

请提供具体的改进建议和代码示例。
```

#### 使用命令

```bash
# 在交互模式中
/review src/main.ts

# 或者
/review src/utils/*.ts
```

#### 命令变量

| 变量 | 描述 |
|------|------|
| `$ARGUMENTS` | 用户提供的参数 |
| `!`command`` | 执行命令并嵌入输出 |

示例：

```markdown
---
name: git-summary
description: Git 提交摘要
---

请分析最近的 Git 提交：

!`git log --oneline -10`

并生成一份变更摘要。
```

### 子代理

子代理是专门化的 AI 实例，用于处理特定类型的任务。

#### 创建子代理

在 `.claude-replica/agents/` 目录创建 `.agent.md` 文件：

```markdown
---
description: 测试专家，专注于编写高质量测试
model: sonnet
tools:
  - Read
  - Write
  - Bash
  - Grep
---

你是测试专家，负责：

## 职责
- 编写单元测试
- 编写集成测试
- 分析测试覆盖率
- 提供测试策略建议

## 测试原则
- 测试应该独立且可重复
- 使用描述性的测试名称
- 遵循 AAA 模式（Arrange, Act, Assert）
- 优先测试边界条件和错误情况

## 支持的框架
- Jest (JavaScript/TypeScript)
- Pytest (Python)
- JUnit (Java)
- Go Test (Go)
```

#### 使用子代理

子代理会根据任务描述自动匹配，或者可以显式调用：

```
@test-expert 请为 src/utils.ts 编写单元测试
```

### 钩子系统

钩子允许在特定事件发生时自动执行操作。

#### 配置钩子

创建 `.claude-replica/hooks.json`：

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
          "prompt": "请记住遵循项目的编码规范"
        }
      ]
    }
  ]
}
```

#### 钩子事件

| 事件 | 描述 |
|------|------|
| `PreToolUse` | 工具使用前 |
| `PostToolUse` | 工具使用后 |
| `PostToolUseFailure` | 工具使用失败后 |
| `SessionStart` | 会话开始 |
| `SessionEnd` | 会话结束 |
| `UserPromptSubmit` | 用户提交提示词 |
| `Notification` | 通知事件 |
| `Stop` | 停止事件 |
| `SubagentStart` | 子代理开始 |
| `SubagentStop` | 子代理停止 |
| `PreCompact` | 压缩前 |
| `PermissionRequest` | 权限请求 |

#### 钩子变量

| 变量 | 描述 |
|------|------|
| `$TOOL` | 工具名称 |
| `$FILE` | 操作的文件路径 |
| `$COMMAND` | 执行的命令 |

## MCP 集成

MCP (Model Context Protocol) 允许集成外部工具和服务。

### 配置 MCP 服务器

创建 `.mcp.json`：

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"
    }
  },
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
  },
  "postgres": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres"],
    "env": {
      "DATABASE_URL": "${DATABASE_URL}"
    }
  }
}
```

### 传输类型

#### stdio（默认）

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

### 查看 MCP 状态

```bash
# 在交互模式中
/mcp
```

## 权限管理

Claude Replica 提供细粒度的权限控制。

### 权限模式

| 模式 | 描述 |
|------|------|
| `default` | 默认模式，敏感操作需要确认 |
| `acceptEdits` | 自动接受文件编辑 |
| `bypassPermissions` | 绕过所有权限检查（危险） |
| `plan` | 计划模式，只生成计划不执行 |

### 设置权限模式

```bash
# 命令行
claude-replica --permission-mode acceptEdits

# 配置文件
{
  "permissionMode": "acceptEdits"
}
```

### 工具白名单/黑名单

```bash
# 只允许特定工具
claude-replica --allowed-tools Read,Write,Grep

# 禁止特定工具
claude-replica --disallowed-tools Bash,WebFetch
```

### 危险模式

⚠️ **警告**：以下选项会跳过所有安全检查，仅在完全信任的环境中使用。

```bash
claude-replica --dangerously-skip-permissions
```

## 回退系统

回退系统允许撤销 AI 的文件修改。

### 使用回退

1. 在交互模式中按 `Esc + Esc` 打开回退菜单
2. 选择要恢复的快照
3. 确认恢复

### 快照管理

- 每次文件修改自动创建快照
- 最多保存 50 个快照
- 快照包含修改前的文件内容

## CI/CD 集成

Claude Replica 支持在 CI/CD 环境中使用。

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
          # 在 CI 中通过环境变量提供认证
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          claude-replica -p "审查这个 PR 的代码变更" \
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
    - claude-replica -p "分析代码质量" --output-format json
  variables:
    # 在 CI 中通过环境变量提供认证
    ANTHROPIC_API_KEY: $ANTHROPIC_API_KEY
```

### CI 环境检测

Claude Replica 自动检测以下 CI 环境：
- GitHub Actions
- GitLab CI
- Jenkins
- CircleCI
- Travis CI
- Azure Pipelines

在 CI 环境中：
- 自动使用非交互模式
- 输出结构化日志
- 支持超时限制
- 返回适当的退出码
- 通过环境变量 `ANTHROPIC_API_KEY` 提供认证

### 退出码

| 退出码 | 描述 |
|--------|------|
| 0 | 成功 |
| 1 | 一般错误 |
| 2 | 配置错误 |
| 3 | 认证错误 |
| 4 | 网络错误 |
| 5 | 超时错误 |
| 6 | 权限错误 |

## 最佳实践

### 1. 使用 CLAUDE.md

在项目根目录创建 `CLAUDE.md` 文件，描述项目上下文：

```markdown
# 项目名称

## 概述
这是一个 React + TypeScript 项目...

## 技术栈
- React 18
- TypeScript 5
- Vite
- Tailwind CSS

## 目录结构
- src/components/ - React 组件
- src/hooks/ - 自定义 Hooks
- src/utils/ - 工具函数

## 编码规范
- 使用函数组件
- 使用 TypeScript 严格模式
- 遵循 ESLint 规则

## 常用命令
- npm run dev - 启动开发服务器
- npm test - 运行测试
- npm run build - 构建生产版本
```

### 2. 配置项目级设置

创建 `.claude-replica/settings.json`：

```json
{
  "model": "claude-sonnet-4-5-20250929",
  "permissionMode": "acceptEdits",
  "allowedTools": ["Read", "Write", "Edit", "Bash", "Grep", "Glob"],
  "maxTurns": 50
}
```

### 3. 使用技能提高效率

为常见任务创建技能：
- 代码审查技能
- 测试编写技能
- 文档生成技能
- 重构技能

### 4. 创建常用命令

为重复性任务创建命令：
- `/review` - 代码审查
- `/test` - 生成测试
- `/doc` - 生成文档
- `/refactor` - 重构代码

### 5. 使用钩子自动化

配置钩子自动执行：
- 文件保存后运行 lint
- 测试文件修改后运行测试
- 代码修改后更新文档

## 故障排除

### 认证问题

```
错误: API 错误: 认证失败
```

解决方案：
1. 确保 Claude Code 已正确配置：运行 `claude login`
2. 在 CI 环境中，检查 `ANTHROPIC_API_KEY` 环境变量是否设置
3. 确认 API 密钥有效且未过期

### 网络问题

```
错误: 网络错误: 无法连接到服务器
```

解决方案：
1. 检查网络连接
2. 检查代理设置
3. 尝试使用 VPN

### 权限问题

```
错误: 权限被拒绝
```

解决方案：
1. 检查文件/目录权限
2. 使用 `--permission-mode acceptEdits`
3. 检查工具白名单/黑名单配置

### 超时问题

```
错误: 执行超时
```

解决方案：
1. 增加超时时间 `--timeout 600`
2. 简化查询
3. 分解复杂任务

### 调试模式

启用调试模式获取详细信息：

```bash
CLAUDE_REPLICA_DEBUG=true claude-replica -p "你的查询"
```

或使用 `--verbose` 选项：

```bash
claude-replica -p "你的查询" --verbose
```

### 日志文件

日志保存在 `~/.claude-replica/logs/` 目录，可用于问题排查。

## 获取帮助

- 📖 [API 文档](API.md)
- 🛠️ [开发者指南](DEVELOPER_GUIDE.md)
- 🐛 [GitHub Issues](https://github.com/your-username/claude-replica/issues)
- 💬 [GitHub Discussions](https://github.com/your-username/claude-replica/discussions)
