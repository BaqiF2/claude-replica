# 示例项目

这是一个 TypeScript 示例项目，用于演示 Claude Replica 的基本功能。

## 概述

本项目包含简单的 TypeScript 代码示例，展示如何使用 Claude Replica 进行代码开发和审查。

## 技术栈

- TypeScript 5.x
- Node.js 20+

## 目录结构

```
src/
└── example.ts    # 示例代码
```

## 编码规范

- 使用 TypeScript 严格模式
- 使用 ESLint 进行代码检查
- 使用 Prettier 进行代码格式化
- 遵循函数式编程原则

## 常用命令

```bash
# 编译
npx tsc

# 运行
node dist/example.js

# 测试
npm test
```

## 注意事项

- 所有函数应有明确的类型注解
- 避免使用 any 类型
- 编写单元测试覆盖核心逻辑

## MCP 集成

Claude Replica 现在统一通过项目根目录的 `.mcp.json` 提供 MCP（Model Context Protocol）服务器配置，所有子系统会自动从这里加载并展开环境变量。CLI 增加了 `/mcp` 命令，便于在开发过程中查看、编辑和验证该配置，确保只有一个受控的配置源。

### MCP 配置示例与最佳实践

以下示例展示了常见的 `.mcp.json` 结构，MCP 服务器按名称组织在 `mcpServers` 中，分别描述传输类型、命令或 URL 以及可选的环境变量：

```json
{
  "mcpServers": {
    "local-filesystem": {
      "transport": "stdio",
      "command": "node ./tools/mcp-stdio-server.js",
      "env": {
        "MCP_TOKEN": "${MCP_TOKEN}"
      }
    },
    "remote-http": {
      "transport": "http",
      "url": "http://localhost:7000/mcp",
      "headers": {
        "Authorization": "Bearer ${MCP_API_KEY}"
      }
    }
  }
}
```

- 始终通过 `${ENV_VAR}` 语法引用环境变量，敏感信息不要写死在 JSON 中。
- 以功能或部署环境为单位命名服务器（例如 `local-filesystem`、`remote-http`），方便 `/mcp list` 的输出识别。
- 把 `.mcp.json` 保留在项目根并纳入版本控制（若需忽略机密字段，可在 CI/环境中动态注入）。
- 修改配置后立即运行 `/mcp validate` 检查语法和结构。

### `/mcp` 命令使用说明

Claude Replica 通过 `/mcp` 命令提供三个子命令：

- `/mcp` 或 `/mcp list`：列出 `.mcp.json` 中的服务器名称、传输类型与关键信息，若配置为空会提示使用 `/mcp edit` 创建。
- `/mcp edit`：打开 `.mcp.json`，优先使用 `$EDITOR`，否则按 `code`, `vim`, `nano`, `vi` 顺序尝试；文件不存在时会创建初始模板 `{ "mcpServers": {} }`。
- `/mcp validate`：语法或结构有误时会给出行号和字段提示，验证成功则汇总服务器数量与传输类型统计。

命令完成后会提示你重新加载应用，确保新配置生效。若遇到未知子命令，CLI 会显示帮助信息并建议使用以上选项。

### 配置迁移指南（`settings.json` → `.mcp.json`）

旧版本的 `settings.json` 中 `mcpServers` 配置已不再生效，系统会在启动时输出警告并推荐升级流程：

1. 在项目根创建 `.mcp.json`，内容至少包含 `{ "mcpServers": {} }`。
2. 把原 `settings.json` 中的 `mcpServers` 区块整体复制到 `.mcp.json`，保持服务器名称与 `transport`、`command`/`url` 设置。
3. 将所有敏感值替换为 `${ENV_VAR}` 并在系统或 CI 中注入真实值。
4. 运行 `/mcp validate` 确认配置有效，再执行 `/mcp list` 查看加载结果。
5. 启动或重启 Claude Replica，确认旧 `settings.json` 中的 `mcpServers` 警告不再出现。

迁移完成后，请只在 `.mcp.json` 中维护 MCP 配置，未来的 CLI 处理、日志与插件都会统一依赖它。
