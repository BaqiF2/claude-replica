# Claude Replica 开发者指南

本指南面向希望贡献代码或扩展 Claude Replica 功能的开发者。

## 目录

- [开发环境设置](#开发环境设置)
- [项目架构](#项目架构)
- [核心模块](#核心模块)
- [扩展开发](#扩展开发)
  - [创建新的管理器](#创建新的管理器)
  - [添加新工具](#添加新工具)
  - [SDK Skills](#sdk-skills)
  - [创建插件](#创建插件)
  - [子代理扩展](#子代理扩展)
  - [自定义UI开发](#自定义ui开发)
- [测试](#测试)
- [代码规范](#代码规范)
- [发布流程](#发布流程)
- [贡献指南](#贡献指南)

## 开发环境设置

### 环境要求

- Node.js >= 20.0.0
- npm >= 9.0.0
- Git

### 克隆仓库

```bash
git clone https://github.com/your-username/claude-replica.git
cd claude-replica
```

### 安装依赖

```bash
npm install
```

### 构建项目

```bash
npm run build
```

### 本地链接

```bash
npm link
```

现在可以在任何目录使用 `claude-replica` 命令。

### 开发模式

```bash
# 监听文件变化并自动重新编译
npm run dev
```

### 运行测试

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch

# 运行特定测试
npm test -- --testPathPattern="SessionManager"
```

### 代码检查

```bash
# 检查代码
npm run lint

# 自动修复
npm run lint:fix

# 格式化代码
npm run format
```

## 项目架构

### 目录结构

```
claude-replica/
├── src/                    # 源代码
│   ├── agents/            # 子代理注册表
│   │   ├── AgentRegistry.ts
│   │   ├── PresetAgents.ts
│   │   └── index.ts
│   ├── checkpoint/        # 检查点系统（会话快照与回退）
│   │   ├── CheckpointManager.ts
│   │   └── index.ts
│   ├── cli/               # CLI 解析器
│   │   └── CLIParser.ts
│   ├── collaboration/     # 协作管理
│   │   ├── CollaborationManager.ts
│   │   └── index.ts
│   ├── commands/          # 命令管理器
│   │   ├── CommandManager.ts
│   │   └── index.ts
│   ├── config/            # 配置管理
│   │   ├── ConfigManager.ts
│   │   ├── SDKConfigLoader.ts
│   │   └── index.ts
│   ├── context/           # 上下文管理
│   │   ├── ContextManager.ts
│   │   └── index.ts
│   ├── core/              # 核心引擎
│   │   ├── MessageRouter.ts
│   │   ├── SessionManager.ts
│   │   └── StreamingMessageProcessor.ts
│   ├── custom-tools/      # 自定义工具（MCP 工具注册与管理）
│   │   ├── CustomToolManager.ts
│   │   ├── CustomToolRegistry.ts
│   │   └── index.ts
│   ├── docs/              # 文档生成器
│   │   └── index.ts
│   ├── extensibility/     # 扩展性架构（插件 API 和工具扩展）
│   │   ├── ExtensibilityManager.ts
│   │   └── index.ts
│   ├── hooks/             # 钩子管理器
│   │   ├── HookManager.ts
│   │   └── index.ts
│   ├── image/             # 图像处理
│   │   ├── ImageHandler.ts
│   │   └── index.ts
│   ├── language/          # 语言支持
│   │   └── index.ts
│   ├── logging/           # 日志系统
│   │   ├── Logger.ts
│   │   └── index.ts
│   ├── mcp/               # MCP 集成
│   │   ├── MCPManager.ts
│   │   └── index.ts
│   ├── output/            # 输出格式化
│   │   ├── OutputFormatter.ts
│   │   └── index.ts
│   ├── performance/       # 性能管理（缓存与优化）
│   │   ├── PerformanceManager.ts
│   │   └── index.ts
│   ├── permissions/       # 权限管理
│   │   ├── PermissionManager.ts
│   │   └── index.ts
│   ├── plugins/           # 插件系统
│   │   ├── PluginManager.ts
│   │   └── index.ts
│   ├── runners/           # 运行器（应用程序执行流程）
│   │   ├── ApplicationRunner.ts
│   │   ├── InteractiveRunner.ts
│   │   ├── NonInteractiveRunner.ts
│   │   ├── RunnerFactory.ts
│   │   └── index.ts
│   ├── sdk/               # SDK 封装层
│   │   ├── SDKQueryExecutor.ts
│   │   └── index.ts
│   ├── security/          # 安全管理（敏感数据检测等）
│   │   ├── SecurityManager.ts
│   │   └── index.ts
│   ├── tools/             # 工具注册表
│   │   ├── ToolRegistry.ts
│   │   └── index.ts
│   ├── ui/                # 交互式 UI
│   │   ├── contracts/     # UI 接口定义
│   │   │   ├── core/      # 核心接口（UIFactory, Parser, Output）
│   │   │   └── interactive/ # 交互 UI 接口
│   │   ├── factories/     # UI 工厂
│   │   │   ├── UIFactoryRegistry.ts
│   │   │   ├── TerminalUIFactory.ts
│   │   │   └── PermissionUIFactory.ts
│   │   ├── implementations/ # UI 实现
│   │   │   └── base/      # 基础实现（BaseInteractiveUI）
│   │   ├── TerminalInteractiveUI.ts
│   │   ├── TerminalParser.ts
│   │   ├── TerminalOutput.ts
│   │   └── index.ts
│   ├── cli.ts             # CLI 入口
│   ├── index.ts           # 主导出
│   └── main.ts            # 主程序（Application 类）
├── tests/                 # 测试文件
│   ├── agents/
│   ├── checkpoint/
│   ├── cli/
│   ├── commands/
│   ├── config/
│   ├── context/
│   ├── core/
│   ├── custom-tools/
│   ├── hooks/
│   ├── image/
│   ├── mcp/
│   ├── output/
│   ├── permissions/
│   ├── plugins/
│   ├── runners/
│   ├── sdk/
│   ├── tools/
│   ├── ui/
│   └── utils/
├── docs/                  # 文档
├── examples/              # 示例项目
└── dist/                  # 编译输出
```

### 架构图

```
┌───────────────────────────────────────────────────────────────────┐
│                          CLI 层                                    │
│  cli.ts → UIFactoryRegistry → UIFactory                           │
│           ├─ TerminalParser (ParserInterface)                     │
│           ├─ TerminalOutput (OutputInterface)                     │
│           └─ TerminalInteractiveUI (InteractiveUIInterface)       │
└───────────────────────────────────────────────────────────────────┘
                                ↓
┌───────────────────────────────────────────────────────────────────┐
│                       应用运行层 (Runners)                          │
│  ApplicationRunner → InteractiveRunner / NonInteractiveRunner     │
└───────────────────────────────────────────────────────────────────┘
                                ↓
┌───────────────────────────────────────────────────────────────────┐
│                      核心引擎层 (Core)                              │
│  SessionManager → MessageRouter → StreamingMessageProcessor       │
└───────────────────────────────────────────────────────────────────┘
                                ↓
┌───────────────────────────────────────────────────────────────────┐
│                      SDK 封装层 (SDK)                              │
│  SDKQueryExecutor → Claude Agent SDK query()                      │
└───────────────────────────────────────────────────────────────────┘
                                ↓
┌───────────────────────────────────────────────────────────────────┐
│                     Claude Agent SDK                               │
│  query() 函数 → 流式消息处理 → 工具调用                             │
└───────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────┬─────────────┬─────────────┬─────────────┬──────────┐
│  工具系统    │  扩展系统    │  MCP 集成   │  配置系统    │ 辅助系统  │
│ ToolRegistry│ SDK Skills  │ MCPManager  │ ConfigMgr   │ Security │
│ CustomTools │ CommandMgr  │             │ SDKConfig   │ Logging  │
│ Permission  │ AgentRegistry│            │ Loader      │ Perf.    │
│ Manager     │ HookManager │             │             │ Checkpoint│
│             │ PluginMgr   │             │             │          │
│             │ Context     │             │             │          │
└─────────────┴─────────────┴─────────────┴─────────────┴──────────┘
```

### 数据流

1. **用户输入** → CLIParser (TerminalParser) 解析命令行参数
2. **UI 初始化** → UIFactoryRegistry 选择并创建 UIFactory
3. **应用初始化** → Application 初始化所有管理器（配置、工具、权限、MCP 等）
4. **运行器选择** → RunnerFactory 创建 InteractiveRunner 或 NonInteractiveRunner
5. **会话管理** → SessionManager 创建/恢复会话
6. **消息路由** → MessageRouter 构建查询选项（系统提示、工具权限、子代理等）
7. **SDK 调用** → SDKQueryExecutor 调用 Claude Agent SDK 的 query() 函数
8. **流式处理** → StreamingMessageProcessor 处理 SDK 响应流
9. **输出** → TerminalInteractiveUI (InteractiveUIInterface) 或 TerminalOutput (OutputInterface) 显示结果

## 核心模块

### SessionManager

会话管理器负责会话的生命周期管理。

```typescript
// src/core/SessionManager.ts

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private sessionsDir: string;

  constructor(options?: SessionManagerOptions) {
    this.sessionsDir = options?.sessionsDir || 
      path.join(os.homedir(), '.claude-replica', 'sessions');
  }

  async createSession(
    workingDir: string,
    projectConfig?: ProjectConfig,
    userConfig?: UserConfig
  ): Promise<Session> {
    const session: Session = {
      id: this.generateSessionId(),
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      messages: [],
      context: {
        workingDirectory: workingDir,
        projectConfig: projectConfig || {},
        userConfig: userConfig || {},
        loadedSkills: [],
        activeAgents: [],
      },
      expired: false,
      workingDirectory: workingDir,
    };

    await this.saveSession(session);
    return session;
  }

  // ... 其他方法
}
```

### MessageRouter

消息路由器负责构建 SDK 查询选项。

```typescript
// src/core/MessageRouter.ts

export class MessageRouter {
  constructor(private options: MessageRouterOptions) {}

  async routeMessage(
    message: Message,
    session: Session
  ): Promise<QueryResult> {
    // 构建系统提示词
    const systemPrompt = await this.buildSystemPrompt(session);

    // 获取启用的工具
    const allowedTools = this.getEnabledToolNames(session);

    // 创建权限处理函数
    const canUseTool = this.createPermissionHandler(session);

    // 获取代理定义
    const agents = this.getAgentDefinitions(session);

    return {
      prompt: message.content as string,
      options: {
        model: session.context.projectConfig.model,
        systemPrompt,
        allowedTools,
        canUseTool,
        agents,
        // ... 其他选项
      },
    };
  }

  // ... 其他方法
}
```

### PermissionManager

权限管理器控制工具的使用权限。

```typescript
// src/permissions/PermissionManager.ts

export class PermissionManager {
  constructor(
    private config: PermissionConfig,
    private toolRegistry: ToolRegistry
  ) {}

  createCanUseToolHandler(): CanUseTool {
    return async ({ tool, args, context }) => {
      // 检查黑名单
      if (this.config.disallowedTools?.includes(tool)) {
        return false;
      }

      // 检查白名单
      if (this.config.allowedTools && 
          !this.config.allowedTools.includes(tool)) {
        return false;
      }

      // 根据权限模式处理
      switch (this.config.mode) {
        case 'bypassPermissions':
          return true;
        case 'plan':
          return false;
        case 'acceptEdits':
          return !this.isDangerousTool(tool);
        default:
          return this.shouldPromptForTool(tool, args)
            ? await this.promptUser(tool, args)
            : true;
      }
    };
  }

  // ... 其他方法
}
```

## 扩展开发

### 创建新的管理器

1. 在 `src/` 下创建目录
2. 创建主类文件
3. 创建 `index.ts` 导出
4. 在 `src/index.ts` 中添加导出
5. 编写测试

示例：

```typescript
// src/myfeature/MyFeatureManager.ts

export interface MyFeatureConfig {
  enabled: boolean;
  options: Record<string, unknown>;
}

export class MyFeatureManager {
  private config: MyFeatureConfig;

  constructor(config?: Partial<MyFeatureConfig>) {
    this.config = {
      enabled: true,
      options: {},
      ...config,
    };
  }

  async initialize(): Promise<void> {
    // 初始化逻辑
  }

  async process(input: string): Promise<string> {
    // 处理逻辑
    return input;
  }
}
```

```typescript
// src/myfeature/index.ts

export { MyFeatureManager, MyFeatureConfig } from './MyFeatureManager';
```

```typescript
// src/index.ts

export { MyFeatureManager, MyFeatureConfig } from './myfeature';
```

### 添加新工具

Claude Replica 支持通过自定义工具扩展功能。自定义工具使用 Zod schema 定义参数验证，通过 MCP 服务器自动注册到系统中。

#### 基本流程

1. 定义工具（使用 Zod + ToolDefinition）
2. 注册工具或模块（使用 CustomToolManager）
3. 配置权限（allowedTools / disallowedTools）

#### 简单示例

```typescript
import { z } from 'zod';
import type { ToolDefinition, ToolResult } from '@/custom-tools/types';

const echoSchema = z.object({ message: z.string().min(1) });

export const echoTool: ToolDefinition = {
  name: 'echo',
  description: 'Echo back the provided message.',
  module: 'demo/echo',
  schema: echoSchema,
  handler: async ({ message }) => ({
    content: [{ type: 'text', text: message }],
  }),
};
```

#### 详细文档

关于工具定义规范、模块注册、MCP 服务器配置、权限控制、环境变量配置等详细内容，请参考 [自定义工具配置指南](./reference/CUSTOM_TOOLS_CONFIG_GUIDE.md)。

### SDK Skills

Skills 由 Claude Agent SDK 自动发现，无需自定义 SkillManager。

- 支持用户级和项目级自动发现
- 用户级目录：`~/.claude/skills/<skill-name>/SKILL.md`
- 项目级目录：`.claude/skills/<skill-name>/SKILL.md`
- frontmatter 必须包含 `description`

示例：

```markdown
---
name: agent-sdk-dev
description: SDK 开发指南
---

技能内容正文...
```

### 子代理扩展

Claude Replica 采用程序化预设架构管理子代理。所有子代理在代码中定义，由 `AgentRegistry` 统一管理并暴露给 SDK。

#### 预设子代理

系统提供以下预设子代理：
- **code-reviewer**: 代码审查与回归风险检查
- **test-runner**: 测试执行与失败分析
- **doc-generator**: 文档撰写与更新
- **refactoring-specialist**: 保持行为不变的重构
- **security-auditor**: 安全风险审计与缓解建议
- **data-analyzer**: 轻量数据/日志分析

#### 添加新的子代理

1. 在 `src/agents/PresetAgents.ts` 中定义新的代理配置
2. 更新 `AgentRegistry` 注册流程
3. 遵循约束规则：
   - 必须包含 `description` 和 `prompt` 字段
   - 不允许使用 `Task` 工具
   - 模型只能是 `sonnet`、`opus`、`haiku`、`inherit`

#### 详细文档

关于子代理的使用方式、工具组合推荐、提示词编写建议、常见问题和故障排查，请参考 [SubAgents 使用指南](./reference/SUBAGENTS_GUIDE.md)。

### 自定义UI开发

Claude Replica 的 UI 层与核心逻辑完全解耦，支持实现自定义 UI 来替换默认的终端 UI。

#### UI 架构

UI 层由 4 个核心接口组成：
- **UIFactory**: 工厂入口，创建所有 UI 组件
- **ParserInterface**: CLI 参数解析
- **OutputInterface**: 标准输出（info/warn/error 等）
- **InteractiveUIInterface**: 交互 UI 核心（25 个方法）

#### 实现级别

- **Level 1 (5分钟)**: 最小实现，只需实现 `start()` 和 `stop()`
- **Level 2 (30分钟)**: 基础交互，覆盖核心显示方法
- **Level 3 (2-4小时)**: 完整功能，包含交互菜单和状态管理

#### 快速开始

继承 `BaseInteractiveUI` 只需实现两个必需方法：

```typescript
import { BaseInteractiveUI } from 'claude-replica';
// 或者直接从路径导入：import { BaseInteractiveUI } from 'claude-replica/ui';

export class MySimpleUI extends BaseInteractiveUI {
  async start(): Promise<void> {
    // 启动 UI 循环
  }

  stop(): void {
    // 停止 UI 并清理资源
  }
}
```

#### 详细文档

关于 UI 接口详解、实现级别指南、WebSocket UI 示例、回调机制、注册方式和最佳实践，请参考 [自定义UI实现指南](./reference/CUSTOM_UI_GUIDE.md)。

## 测试

### 测试结构

```
tests/
├── unit/                   # 单元测试
├── integration/            # 集成测试
├── e2e/                    # 端到端测试
├── architecture/           # 架构测试
├── checkpoint/             # 检查点系统测试
├── cli/                    # CLI 测试
├── collaboration/          # 协作功能测试
├── config/                 # 配置管理测试
├── context/                # 上下文管理测试
├── core/                   # 核心引擎测试
│   ├── SessionManager.test.ts
│   ├── MessageRouter.test.ts
│   └── StreamingMessageProcessor.test.ts
├── custom-tools/           # 自定义工具测试
├── docs/                   # 文档生成器测试
├── extensibility/          # 扩展性测试
├── hooks/                  # 钩子系统测试
├── image/                  # 图像处理测试
├── language/               # 语言支持测试
├── mcp/                    # MCP 集成测试
├── output/                 # 输出格式化测试
├── performance/            # 性能测试
├── permissions/            # 权限管理测试
├── plugins/                # 插件系统测试
├── runners/                # 运行器测试
├── sdk/                    # SDK 封装层测试
├── security/               # 安全管理测试
├── tools/                  # 工具注册表测试
├── ui/                     # UI 层测试
├── fixtures/               # 测试数据
├── helpers/                # 测试辅助函数
├── mocks/                  # 模拟对象
├── test-helpers/           # 测试工具
├── utils/                  # 工具函数测试
└── main.test.ts            # 主程序测试
```

### 编写测试

```typescript
// tests/core/SessionManager.test.ts

import { SessionManager } from '../../src/core/SessionManager';

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager({
      sessionsDir: '/tmp/test-sessions',
    });
  });

  afterEach(async () => {
    // 清理测试数据
  });

  describe('createSession', () => {
    it('should create a new session with unique ID', async () => {
      const session = await sessionManager.createSession('/test/dir');
      
      expect(session.id).toBeDefined();
      expect(session.workingDirectory).toBe('/test/dir');
      expect(session.messages).toHaveLength(0);
    });

    it('should set correct timestamps', async () => {
      const before = new Date();
      const session = await sessionManager.createSession('/test/dir');
      const after = new Date();

      expect(session.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // ... 更多测试
});
```

### 属性测试

使用 fast-check 进行属性测试：

```typescript
import * as fc from 'fast-check';

describe('ConfigManager', () => {
  describe('mergeConfigs', () => {
    it('should preserve project config priority', () => {
      fc.assert(
        fc.property(
          fc.record({
            model: fc.option(fc.string()),
            maxTurns: fc.option(fc.integer()),
          }),
          fc.record({
            model: fc.option(fc.string()),
            maxTurns: fc.option(fc.integer()),
          }),
          (userConfig, projectConfig) => {
            const merged = configManager.mergeConfigs(userConfig, projectConfig);
            
            // 项目配置优先
            if (projectConfig.model !== undefined) {
              expect(merged.model).toBe(projectConfig.model);
            }
          }
        )
      );
    });
  });
});
```

### 测试覆盖率

```bash
npm test -- --coverage
```

## 代码规范

### TypeScript 规范

- 使用严格模式
- 显式类型注解
- 避免 `any` 类型
- 使用接口定义数据结构

```typescript
// 好的做法
interface UserConfig {
  model?: string;
  maxTurns?: number;
}

function processConfig(config: UserConfig): void {
  // ...
}

// 避免
function processConfig(config: any): void {
  // ...
}
```

### 命名规范

- 类名：PascalCase
- 函数/方法：camelCase
- 常量：UPPER_SNAKE_CASE
- 文件名：PascalCase（类）或 camelCase（工具）

### 注释规范

使用 JSDoc 风格注释：

```typescript
/**
 * 会话管理器
 * 
 * 负责创建、保存和恢复会话
 * 
 * @example
 * ```typescript
 * const manager = new SessionManager();
 * const session = await manager.createSession('/path/to/project');
 * ```
 */
export class SessionManager {
  /**
   * 创建新会话
   * 
   * @param workingDir - 工作目录路径
   * @param projectConfig - 项目配置（可选）
   * @param userConfig - 用户配置（可选）
   * @returns 新创建的会话
   * @throws 如果无法创建会话目录
   */
  async createSession(
    workingDir: string,
    projectConfig?: ProjectConfig,
    userConfig?: UserConfig
  ): Promise<Session> {
    // ...
  }
}
```

### ESLint 配置

项目使用 ESLint 进行代码检查，配置在 `.eslintrc.json`。

### Prettier 配置

项目使用 Prettier 进行代码格式化，配置在 `.prettierrc.json`。

## 发布流程

### 版本号规范

遵循语义化版本（SemVer）：

- **主版本号**：不兼容的 API 变更
- **次版本号**：向后兼容的功能新增
- **修订号**：向后兼容的问题修复

### 发布步骤

1. 更新版本号

```bash
npm version patch  # 修订号
npm version minor  # 次版本号
npm version major  # 主版本号
```

2. 更新 CHANGELOG

3. 构建项目

```bash
npm run build
```

4. 运行测试

```bash
npm test
```

5. 发布到 npm

```bash
npm publish
```

### 预发布版本

```bash
npm version prerelease --preid=beta
npm publish --tag beta
```

## 贡献指南

### 提交 Issue

- 使用 Issue 模板
- 提供详细的复现步骤
- 包含环境信息

### 提交 PR

1. Fork 仓库
2. 创建功能分支

```bash
git checkout -b feature/my-feature
```

3. 编写代码和测试
4. 确保测试通过

```bash
npm test
npm run lint
```

5. 提交代码

```bash
git commit -m "feat: add my feature"
```

6. 推送并创建 PR

### Commit 规范

使用 Conventional Commits：

- `feat:` 新功能
- `fix:` 修复 bug
- `docs:` 文档更新
- `style:` 代码格式
- `refactor:` 重构
- `test:` 测试
- `chore:` 构建/工具

示例：

```
feat: add session expiration check
fix: resolve config merge priority issue
docs: update API documentation
```

### 代码审查

- 所有 PR 需要至少一个审查者批准
- 确保 CI 检查通过
- 解决所有审查意见

## 更多资源

- [用户指南](USER_GUIDE.md)
- [Claude Agent SDK 文档](https://docs.claude.com/en/api/agent-sdk/overview)
