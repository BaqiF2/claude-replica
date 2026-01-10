# Custom Tools 实现规格说明

**任务目标**：分析并实现符合 Claude Agent SDK 官方最佳实践的自定义工具（Custom Tools）系统

**创建日期**：2026-01-10

---

## 1. 项目背景

### 1.1 当前状态

- 项目已实现完整的 MCP 服务器管理系统（`MCPManager`）
- 当前仅支持外部 MCP 服务器（stdio、SSE、HTTP 传输）
- 尚未实现进程内自定义工具功能
- 需要从零开始构建符合官方文档规范的 custom tools 系统

### 1.2 参考文档

官方文档：https://platform.claude.com/docs/zh-CN/agent-sdk/custom-tools

核心 API：
- `createSdkMcpServer(config)` - 创建进程内 MCP 服务器
- `tool(name, description, schema, handler)` - 定义类型安全的工具

### 1.3 与现有架构的关系

```
Application
  ├── MCPManager (管理外部 MCP 服务器)
  ├── CustomToolManager (NEW: 管理进程内自定义工具)
  └── SDKQueryExecutor (将两者传递给 SDK)
```

---

## 2. 核心需求

### 2.1 功能需求

#### FR-1: 工具定义与注册
- 支持使用 `tool()` 辅助函数定义工具
- 支持 Zod schema 进行参数验证和类型推导
- 提供集中式工具注册表管理
- 支持按功能模块组织工具

#### FR-2: MCP 服务器创建
- 使用 `createSdkMcpServer()` 创建进程内服务器
- 支持单个服务器包含多个工具
- 支持工具的 name、version 和 tools 配置

#### FR-3: 工具权限控制
- 集成现有的 `PermissionManager`
- 支持 `allowedTools` 控制工具访问
- 工具名称格式：`mcp__{server_name}__{tool_name}`

#### FR-4: 错误处理
- 工具内部捕获异常并返回结构化错误
- 错误格式：`{ content: [{ type: "text", text: "错误信息" }] }`
- 记录详细的工具执行日志（英文）

#### FR-5: 流式输入兼容
- 自定义工具必须配合流式输入模式使用
- 确保 `prompt` 参数使用 AsyncGenerator

### 2.2 非功能需求

#### NFR-1: 类型安全
- 使用 TypeScript + Zod 提供完整类型推导
- 所有工具参数必须通过 schema 验证
- 利用 Zod 的运行时验证和类型推导

#### NFR-2: 可测试性
- 为每个工具编写单元测试
- 提供集成测试验证工具与 SDK 的交互
- 测试覆盖率要求：核心功能 ≥ 80%

#### NFR-3: 可维护性
- 按功能模块组织工具文件（如 `src/custom-tools/math/`）
- 每个工具提供清晰的文档注释
- 遵循项目现有的代码规范和文件头文档规范

#### NFR-4: 性能
- 工具执行应为异步操作（async/await）
- 避免在工具执行中阻塞主线程
- 记录工具执行时间以便性能分析

---

## 3. 技术设计

### 3.1 目录结构

```
src/
├── custom-tools/
│   ├── index.ts                     # 导出所有工具和管理器
│   ├── CustomToolManager.ts         # 自定义工具管理器
│   ├── CustomToolRegistry.ts        # 工具注册表
│   ├── types.ts                     # 共享类型定义
│   ├── math/                        # 数学工具模块
│   │   ├── index.ts
│   │   └── calculator.tool.ts       # 示例：计算器工具
│   └── utils/
│       ├── error-handler.ts         # 错误处理工具
│       └── logger.ts                # 工具执行日志

tests/
├── custom-tools/
│   ├── CustomToolManager.test.ts
│   ├── CustomToolRegistry.test.ts
│   └── math/
│       └── calculator.tool.test.ts
└── integration/
    └── custom-tools-sdk.test.ts     # SDK 集成测试
```

### 3.2 核心类设计

#### 3.2.1 CustomToolManager

**职责**：管理所有自定义工具的注册、服务器创建和生命周期

```typescript
export class CustomToolManager {
  private registry: CustomToolRegistry;
  private mcpServers: Record<string, ReturnType<typeof createSdkMcpServer>>;

  constructor(options?: CustomToolManagerOptions);

  // 注册单个工具
  registerTool(tool: ToolDefinition): void;

  // 注册工具模块（一组相关工具）
  registerToolModule(moduleName: string, tools: ToolDefinition[]): void;

  // 创建 MCP 服务器（按模块组织）
  createMcpServers(): Record<string, ReturnType<typeof createSdkMcpServer>>;

  // 获取所有工具名称（用于 allowedTools）
  getAllToolNames(): string[];

  // 获取指定模块的工具名称
  getModuleToolNames(moduleName: string): string[];

  // 验证工具定义
  validateToolDefinition(tool: ToolDefinition): ValidationResult;
}
```

#### 3.2.2 CustomToolRegistry

**职责**：维护工具注册表，提供工具查询和过滤功能

```typescript
export class CustomToolRegistry {
  private tools: Map<string, ToolDefinition>;
  private moduleMap: Map<string, Set<string>>;

  // 注册工具
  register(tool: ToolDefinition): void;

  // 按模块注册
  registerModule(moduleName: string, tools: ToolDefinition[]): void;

  // 查询工具
  get(toolName: string): ToolDefinition | undefined;

  // 获取所有工具
  getAll(): ToolDefinition[];

  // 按模块查询
  getByModule(moduleName: string): ToolDefinition[];

  // 检查工具是否存在
  has(toolName: string): boolean;

  // 移除工具
  remove(toolName: string): boolean;

  // 清空注册表
  clear(): void;
}
```

#### 3.2.3 ToolDefinition 类型

```typescript
export interface ToolDefinition {
  // 工具名称（在 MCP 服务器内的名称）
  name: string;

  // 工具描述
  description: string;

  // 参数 schema（Zod schema）
  schema: ZodObject<any>;

  // 工具执行处理函数
  handler: ToolHandler;

  // 所属模块（用于分组管理）
  module: string;

  // 是否为危险工具（需要权限确认）
  dangerous?: boolean;

  // 工具元数据（可选）
  metadata?: {
    author?: string;
    version?: string;
    tags?: string[];
  };
}

export type ToolHandler = (args: any) => Promise<ToolResult>;

export interface ToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
}
```

### 3.3 示例工具实现

#### 3.3.1 计算器工具（`src/custom-tools/math/calculator.tool.ts`）

```typescript
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { ToolDefinition } from "../types";

/**
 * 简单计算器工具
 *
 * 支持基本的数学运算：加减乘除
 */
export const calculatorTool: ToolDefinition = {
  name: "calculate",
  description: "执行基本数学计算（加减乘除）",
  module: "math",

  schema: z.object({
    expression: z.string().describe("数学表达式，如 '2 + 3 * 4'"),
    precision: z.number().optional().default(2).describe("小数精度")
  }),

  handler: async (args) => {
    try {
      // 安全的数学表达式求值（生产环境应使用专业库如 mathjs）
      const result = evaluateSafely(args.expression);
      const formatted = Number(result).toFixed(args.precision);

      return {
        content: [{
          type: "text",
          text: `${args.expression} = ${formatted}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Calculation error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }
};

// SDK 工具定义（用于 createSdkMcpServer）
export const calculatorSdkTool = tool(
  calculatorTool.name,
  calculatorTool.description,
  {
    expression: z.string().describe("数学表达式，如 '2 + 3 * 4'"),
    precision: z.number().optional().default(2).describe("小数精度")
  },
  calculatorTool.handler
);
```

### 3.4 集成方式

#### 3.4.1 在 Application 中初始化

```typescript
// src/main.ts

import { CustomToolManager } from './custom-tools';
import { calculatorSdkTool } from './custom-tools/math/calculator.tool';

export class Application {
  private customToolManager: CustomToolManager;

  async initialize() {
    // 1. 创建自定义工具管理器
    this.customToolManager = new CustomToolManager();

    // 2. 注册工具模块
    this.customToolManager.registerToolModule('math', [calculatorSdkTool]);

    // 3. 创建 MCP 服务器
    const customMcpServers = this.customToolManager.createMcpServers();

    // 4. 合并外部 MCP 服务器和自定义工具服务器
    const allMcpServers = {
      ...this.mcpManager.getExpandedServersConfig(),
      ...customMcpServers
    };

    // 5. 传递给 SDKQueryExecutor
    this.sdkExecutor = new SDKQueryExecutor({
      mcpServers: allMcpServers
    });
  }
}
```

#### 3.4.2 工具权限控制

```typescript
// 在 PermissionManager 中扩展工具名称格式支持

// 自定义工具名称格式：mcp__math-tools__calculate
const customToolPattern = /^mcp__([a-z-]+)__([a-z_]+)$/;

// 在 allowedTools 配置中使用
const options = {
  allowedTools: [
    "mcp__math-tools__calculate",  // 允许计算器工具
    "Read",                          // SDK 内置工具
    "Write"
  ]
};
```

---

## 4. 实现计划

### 4.1 第一阶段：基础架构（优先级：高）

**任务**：
1. 创建 `CustomToolRegistry` 类
2. 创建 `CustomToolManager` 类
3. 定义核心类型（`ToolDefinition`、`ToolHandler`、`ToolResult`）
4. 实现工具注册和查询功能

**验收标准**：
- 能够注册和查询工具
- 通过单元测试验证注册表功能
- 类型定义完整且符合 TypeScript 规范

### 4.2 第二阶段：示例工具实现（优先级：高）

**任务**：
1. 实现计算器工具（`calculator.tool.ts`）
2. 使用 Zod schema 定义参数
3. 实现错误处理和日志记录
4. 编写工具单元测试

**验收标准**：
- 计算器工具能够正确执行数学运算
- Zod schema 验证工作正常
- 错误处理覆盖异常情况
- 单元测试覆盖率 ≥ 80%

### 4.3 第三阶段：SDK 集成（优先级：高）

**任务**：
1. 在 `CustomToolManager` 中实现 `createMcpServers()`
2. 使用 `createSdkMcpServer` 和 `tool` 创建服务器
3. 在 `Application` 中集成 `CustomToolManager`
4. 更新 `SDKQueryExecutor` 选项传递逻辑

**验收标准**：
- 自定义工具通过 MCP 服务器暴露给 SDK
- 工具名称格式正确（`mcp__{server}__{tool}`）
- 集成测试验证工具能够被 SDK 调用

### 4.4 第四阶段：权限控制与测试（优先级：中）

**任务**：
1. 扩展 `PermissionManager` 支持自定义工具名称格式
2. 实现工具权限配置（`allowedTools`）
3. 编写完整的集成测试
4. 编写使用文档和 README

**验收标准**：
- 权限控制正常工作
- 集成测试覆盖流式输入 + 自定义工具场景
- 文档清晰完整

---

## 5. 最佳实践对照检查

### 5.1 官方文档要求

| 要求 | 实现方案 | 状态 |
|------|---------|------|
| 使用 `createSdkMcpServer` | `CustomToolManager.createMcpServers()` | ✅ 规划中 |
| 使用 `tool()` 辅助函数 | 每个工具定义使用 `tool()` | ✅ 规划中 |
| Zod schema 验证 | 所有工具使用 Zod | ✅ 规划中 |
| 流式输入模式 | 确保 prompt 为 AsyncGenerator | ✅ 已支持 |
| 工具名称格式 | `mcp__{server}__{tool}` | ✅ 规划中 |
| 错误处理 | 内部 try-catch + 结构化返回 | ✅ 规划中 |
| 类型安全 | TypeScript + Zod 类型推导 | ✅ 规划中 |

### 5.2 架构设计要点

| 设计原则 | 实现方式 | 符合性 |
|---------|---------|--------|
| 管理器模式 | `CustomToolManager` 类 | ✅ 符合项目架构 |
| 模块化组织 | 按功能目录组织工具 | ✅ 易于维护 |
| 集中式注册表 | `CustomToolRegistry` | ✅ 统一管理 |
| 权限控制 | 集成 `PermissionManager` | ✅ 复用现有系统 |
| 测试覆盖 | 单元测试 + 集成测试 | ✅ 可测试性强 |

---

## 6. 风险与注意事项

### 6.1 技术风险

**风险 1：流式输入兼容性**
- **描述**：自定义 MCP 工具要求使用流式输入模式
- **缓解措施**：在集成测试中验证流式输入 + 自定义工具的组合场景
- **影响**：中等

**风险 2：工具名称冲突**
- **描述**：`mcp__{server}__{tool}` 格式可能与外部 MCP 服务器冲突
- **缓解措施**：为自定义工具服务器使用唯一前缀（如 `custom-tools-math`）
- **影响**：低

**风险 3：Zod 版本兼容性**
- **描述**：SDK 依赖的 Zod 版本可能与项目不一致
- **缓解措施**：在 `package.json` 中检查 Zod 版本，必要时使用 peerDependencies
- **影响**：低

### 6.2 实现注意事项

1. **禁止使用 eval()**
   - 计算器工具示例中提到 `eval()` 仅为演示
   - 生产环境必须使用安全的库（如 `mathjs`、`expr-eval`）

2. **日志统一使用英文**
   - 遵循项目 `.claude/rules/code-spec.md` 规范
   - 所有日志和异常消息使用英文

3. **魔法值配置化**
   - 所有配置参数定义为常量并支持环境变量
   - 例如：`const DEFAULT_PRECISION = parseInt(process.env.MATH_PRECISION || '2', 10);`

4. **文件头文档**
   - 所有代码文件必须包含文件头文档注释
   - 参考 `.claude/rules/file-header-documentation.md`

---

## 7. 成功标准

### 7.1 功能完整性

- [ ] 能够定义和注册自定义工具
- [ ] 能够通过 SDK 调用自定义工具
- [ ] 工具参数通过 Zod 验证
- [ ] 错误处理正常工作
- [ ] 权限控制正常工作

### 7.2 代码质量

- [ ] 单元测试覆盖率 ≥ 80%
- [ ] 集成测试验证 SDK 交互
- [ ] 所有 TypeScript 类型检查通过
- [ ] ESLint 和 Prettier 检查通过
- [ ] 文件头文档完整

### 7.3 文档完整性

- [ ] README 包含使用示例
- [ ] 每个工具有清晰的文档注释
- [ ] 提供从定义到使用的完整示例
- [ ] 包含错误处理和最佳实践说明

---

## 8. 参考资料

### 8.1 官方文档

- [Custom Tools 官方文档](https://platform.claude.com/docs/zh-CN/agent-sdk/custom-tools)
- [TypeScript SDK 参考](https://platform.claude.com/docs/zh-CN/agent-sdk/typescript)
- [MCP 协议文档](https://modelcontextprotocol.io)

### 8.2 项目内部文档

- `.claude/CLAUDE.md` - 项目架构文档
- `.claude/rules/code-spec.md` - 代码规范
- `.claude/rules/file-header-documentation.md` - 文件头文档规范
- `src/mcp/MCPManager.ts` - MCP 管理器参考实现
- `src/tools/ToolRegistry.ts` - 工具注册表参考实现

### 8.3 相关依赖

- `@anthropic-ai/claude-agent-sdk` (^0.1.76)
- `zod` (用于 schema 验证和类型推导)
- `mathjs` 或 `expr-eval` (安全的数学表达式求值)

---

## 9. 附录

### 9.1 示例配置文件

**自定义工具配置示例**（未来可扩展为配置文件加载）：

```json
{
  "customTools": {
    "math": {
      "enabled": true,
      "tools": ["calculate"],
      "serverName": "custom-tools-math",
      "version": "1.0.0"
    }
  },
  "permissions": {
    "allowedCustomTools": [
      "mcp__custom-tools-math__calculate"
    ]
  }
}
```

### 9.2 工具命名规范

- 工具名称：使用小写字母和下划线（如 `calculate`、`query_database`）
- 模块名称：使用小写字母和连字符（如 `math`、`data-processing`）
- 服务器名称：使用 `custom-tools-{module}` 格式（如 `custom-tools-math`）

### 9.3 完整的工具调用流程

```
1. 用户输入："计算 2 + 3"
   ↓
2. Application 初始化时注册计算器工具
   ↓
3. CustomToolManager.createMcpServers() 创建 MCP 服务器
   ↓
4. SDK 接收到 mcpServers 配置
   ↓
5. Claude 模型决定调用 mcp__custom-tools-math__calculate
   ↓
6. SDK 通过 MCP 协议调用工具
   ↓
7. calculator.tool.ts handler 执行计算
   ↓
8. 返回结果：{ content: [{ type: "text", text: "2 + 3 = 5" }] }
   ↓
9. Claude 模型接收结果并生成最终响应
   ↓
10. 用户看到："计算结果是 5"
```

---

**文档版本**：v1.0
**最后更新**：2026-01-10
**创建者**：Claude Sonnet 4.5
**审核状态**：待用户确认
