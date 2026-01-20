# 自定义工具配置指南

本指南说明如何配置自定义工具、注册为 MCP 服务器并纳入权限控制。内容保持简洁，重点覆盖命名、权限与环境变量配置。

## 配置流程

1. 定义工具（Zod + ToolDefinition）
2. 注册工具或模块（CustomToolManager）
3. 配置权限（allowedTools / disallowedTools）

## 工具定义要点

- `name`：工具名称，字母开头，仅允许字母、数字、`-`、`_`
- `module`：模块名称，允许 `/` 分层；同模块工具会合并到一个 MCP 服务器
- `schema`：Zod schema，用于运行时验证与类型推导
- `handler`：`async` 函数，返回 `ToolResult`（`content` 文本块）

示例（简化版）：

```ts
import { z } from 'zod';
import type { ToolDefinition, ToolResult } from '../../custom-tools/types';

const echoSchema = z.object({ message: z.string().min(1) });

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

## 模块注册与 MCP 服务器

在 `src/main.ts` 中通过 `CustomToolManager` 注册模块并创建 MCP 服务器：

- `registerTool()`：注册单个工具
- `registerModule()`：注册同模块工具集合
- `createMcpServers()`：生成 MCP 服务器配置并传给 SDK

模块名会转换为 MCP 服务器名，默认规则如下：

```
server = {prefix}{separator}{module.replace('/', separator)}
```

默认示例：

- `module`: `math/calculators`
- `CUSTOM_TOOL_SERVER_NAME_PREFIX`: `custom-tools`
- `CUSTOM_TOOL_MODULE_SEPARATOR`: `-`
- `server`: `custom-tools-math-calculators`

SDK 中的完整工具名格式为：

```
mcp__{server}__{tool}
```

## 权限配置

通过配置 `allowedTools` 或 `disallowedTools` 控制自定义工具权限：

```json
{
  "permissionMode": "default",
  "allowedTools": [
    "mcp__custom-tools-math-calculators__calculator",
    "mcp__custom-tools-math-calculators__*"
  ]
}
```

## 环境变量（常用）

- `CUSTOM_TOOL_SERVER_NAME_PREFIX`：MCP 服务器名前缀，默认 `custom-tools`
- `CUSTOM_TOOL_SERVER_VERSION`：服务器版本号，默认 `1.0.0`
- `CUSTOM_TOOL_MODULE_SEPARATOR`：模块分隔符，默认 `-`
- `CUSTOM_TOOL_MODULE_NAME`：主应用注册模块名，默认 `math/calculators`

工具级别配置通常在工具文件内定义，例如 `src/custom-tools/math/calculator.ts` 提供
`CUSTOM_TOOL_CALCULATOR_*` 系列环境变量用于命名、描述与参数约束。

## 错误与日志

- 工具执行结果需返回 `{ content: [{ type: 'text', text: '...' }] }` 格式
- 建议使用 `withToolErrorHandling` 统一错误输出为 `ToolResult`
- 执行日志应为英文，可使用 `withToolExecutionLogging` 输出开始/结束/失败信息

## 流式输入兼容

- SDK 流式输入模式下，工具 handler 仍以 `async` 方式返回 `Promise<ToolResult>`
- 无需额外配置，只需确保 handler 不阻塞并及时返回结果

## 相关代码位置

- `src/custom-tools/CustomToolManager.ts`
- `src/custom-tools/types.ts`
- `src/custom-tools/utils/error-handler.ts`
- `src/custom-tools/utils/logger.ts`
- `src/custom-tools/math/calculator.ts`
- `src/main.ts`
