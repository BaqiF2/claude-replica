# 基本使用示例

本示例展示 Claude Replica 的基本使用方法。

## 目录结构

```
basic-usage/
├── README.md
├── CLAUDE.md           # 项目上下文
├── .claude-replica/
│   ├── settings.json   # 项目配置
│   ├── skills/         # 技能文件
│   └── commands/       # 命令文件
└── src/
    └── example.ts      # 示例代码
```

## 快速开始

### 1. 配置认证

Claude Replica 使用 Claude Agent SDK，会自动从 Claude Code 配置中获取认证信息。

```bash
# 确保 Claude Code 已登录
claude login

# 或检查配置文件
ls ~/.claude/settings.json
```

### 2. 进入示例目录

```bash
cd examples/basic-usage
```

### 3. 启动交互式会话

```bash
claude-replica
```

### 4. 尝试以下操作

```
# 询问项目信息
请介绍一下这个项目

# 读取文件
请读取 src/example.ts 文件

# 代码审查
/review src/example.ts

# 生成测试
请为 src/example.ts 生成单元测试
```

## 配置说明

### CLAUDE.md

项目上下文文件，帮助 AI 理解项目：

```markdown
# 示例项目

这是一个 TypeScript 示例项目，用于演示 Claude Replica 的基本功能。

## 技术栈
- TypeScript
- Node.js

## 目录结构
- src/ - 源代码

## 编码规范
- 使用 TypeScript 严格模式
- 遵循 ESLint 规则
```

### settings.json

项目配置文件：

```json
{
  "model": "claude-sonnet-4-5-20250929",
  "permissionMode": "default",
  "allowedTools": ["Read", "Write", "Edit", "Bash", "Grep"]
}
```

## 技能示例

### typescript-expert.md

```markdown
---
name: typescript-expert
description: TypeScript 开发专家
triggers:
  - typescript
  - ts
  - type
---

你是 TypeScript 专家，擅长：
- 类型系统设计
- 泛型编程
- 类型推断优化
```

## 命令示例

### review.md

```markdown
---
name: review
description: 代码审查
argumentHint: <file>
---

请审查以下文件：
$ARGUMENTS

重点关注代码质量和最佳实践。
```

## 更多示例

- [扩展系统示例](../extensions/README.md)
- [MCP 集成示例](../mcp-integration/README.md)
- [CI/CD 示例](../ci-cd/README.md)
