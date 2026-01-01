# 扩展系统示例

本示例展示 Claude Replica 的扩展系统，包括技能、命令、子代理和钩子。

## 目录结构

```
extensions/
├── README.md
├── CLAUDE.md
├── .claude-replica/
│   ├── settings.json
│   ├── skills/
│   │   ├── react-expert.md
│   │   └── testing-expert.md
│   ├── commands/
│   │   ├── review.md
│   │   ├── test.md
│   │   └── doc.md
│   ├── agents/
│   │   ├── code-reviewer.agent.md
│   │   └── test-writer.agent.md
│   └── hooks.json
└── src/
    └── app.tsx
```

## 技能示例

### react-expert.md

React 开发专家技能，当对话涉及 React 相关内容时自动激活。

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

你是 React 开发专家...
```

### testing-expert.md

测试专家技能，帮助编写高质量测试。

## 命令示例

### review.md

代码审查命令，快速审查指定文件。

使用：`/review src/app.tsx`

### test.md

测试生成命令，为指定文件生成测试。

使用：`/test src/app.tsx`

### doc.md

文档生成命令，为指定文件生成文档。

使用：`/doc src/app.tsx`

## 子代理示例

### code-reviewer.agent.md

代码审查专家代理，专注于代码质量分析。

### test-writer.agent.md

测试编写专家代理，专注于测试用例设计。

## 钩子示例

### hooks.json

配置自动化操作：

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

## 使用方法

1. 进入示例目录

```bash
cd examples/extensions
```

2. 启动 Claude Replica

```bash
claude-replica
```

3. 尝试以下操作

```
# 技能自动激活
请帮我创建一个 React 组件

# 使用命令
/review src/app.tsx
/test src/app.tsx

# 调用子代理
@code-reviewer 请审查 src/app.tsx
```

## 自定义扩展

### 创建新技能

1. 在 `.claude-replica/skills/` 创建 `.md` 文件
2. 添加 YAML frontmatter 定义元数据
3. 编写技能内容

### 创建新命令

1. 在 `.claude-replica/commands/` 创建 `.md` 文件
2. 定义命令名称和参数
3. 编写命令模板

### 创建新代理

1. 在 `.claude-replica/agents/` 创建 `.agent.md` 文件
2. 定义代理描述和工具
3. 编写代理提示词

### 配置钩子

1. 编辑 `.claude-replica/hooks.json`
2. 选择事件类型
3. 定义匹配器和操作
