# Claude Replica 开发者指南

本指南面向希望贡献代码或扩展 Claude Replica 功能的开发者。

## 目录

- [开发环境设置](#开发环境设置)
- [项目架构](#项目架构)
- [核心模块](#核心模块)
- [扩展开发](#扩展开发)
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
│   │   └── index.ts
│   ├── ci/                # CI/CD 支持
│   │   ├── CISupport.ts
│   │   └── index.ts
│   ├── cli/               # CLI 解析器
│   │   └── CLIParser.ts
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
│   ├── hooks/             # 钩子管理器
│   │   ├── HookManager.ts
│   │   └── index.ts
│   ├── image/             # 图像处理
│   │   ├── ImageHandler.ts
│   │   └── index.ts
│   ├── mcp/               # MCP 集成
│   │   ├── MCPManager.ts
│   │   └── index.ts
│   ├── output/            # 输出格式化
│   │   ├── OutputFormatter.ts
│   │   └── index.ts
│   ├── permissions/       # 权限管理
│   │   ├── PermissionManager.ts
│   │   └── index.ts
│   ├── plugins/           # 插件系统
│   │   ├── PluginManager.ts
│   │   └── index.ts
│   ├── rewind/            # 回退系统
│   │   ├── RewindManager.ts
│   │   └── index.ts
│   ├── sandbox/           # 沙箱管理
│   │   ├── SandboxManager.ts
│   │   └── index.ts
│   ├── skills/            # 技能管理器
│   │   ├── SkillManager.ts
│   │   └── index.ts
│   ├── tools/             # 工具注册表
│   │   ├── ToolRegistry.ts
│   │   └── index.ts
│   ├── ui/                # 交互式 UI
│   │   ├── InteractiveUI.ts
│   │   └── index.ts
│   ├── cli.ts             # CLI 入口
│   ├── index.ts           # 主导出
│   └── main.ts            # 主程序
├── tests/                 # 测试文件
│   ├── agents/
│   ├── ci/
│   ├── cli/
│   ├── commands/
│   ├── config/
│   ├── context/
│   ├── core/
│   ├── hooks/
│   ├── image/
│   ├── mcp/
│   ├── output/
│   ├── permissions/
│   ├── plugins/
│   ├── rewind/
│   ├── sandbox/
│   ├── skills/
│   ├── tools/
│   ├── ui/
│   └── utils/
├── docs/                  # 文档
├── examples/              # 示例项目
└── dist/                  # 编译输出
```

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI 层                                │
│  CLIParser → InteractiveUI / OutputFormatter                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      核心引擎层                               │
│  SessionManager → MessageRouter → StreamingMessageProcessor │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   Claude Agent SDK                           │
│  query() 函数 → 流式消息处理 → 工具调用                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────┬──────────────┬──────────────┬────────────────┐
│  工具系统     │  扩展系统     │  MCP 集成    │  配置系统       │
│ ToolRegistry │ SkillManager │ MCPManager   │ ConfigManager  │
│ Permission   │ CommandMgr   │              │ SDKConfigLoader│
│ Manager      │ AgentRegistry│              │                │
│              │ HookManager  │              │                │
│              │ PluginManager│              │                │
└──────────────┴──────────────┴──────────────┴────────────────┘
```

### 数据流

1. **用户输入** → CLIParser 解析命令行参数
2. **初始化** → Application 初始化所有管理器
3. **会话管理** → SessionManager 创建/恢复会话
4. **消息路由** → MessageRouter 构建查询选项
5. **SDK 调用** → 调用 Claude Agent SDK 的 query() 函数
6. **流式处理** → StreamingMessageProcessor 处理响应
7. **输出** → InteractiveUI 或 OutputFormatter 显示结果

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

工具通过 SDK 内置支持，但可以通过 MCP 添加自定义工具。

1. 创建 MCP 服务器
2. 在 `.mcp.json` 中配置
3. 工具自动注册

### 创建插件

插件是打包的扩展集合。

```
my-plugin/
├── plugin.json          # 插件元数据
├── commands/            # 命令文件
├── skills/              # 技能文件
├── agents/              # 代理文件
├── hooks.json           # 钩子配置
└── .mcp.json           # MCP 服务器配置
```

```json
// plugin.json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "我的插件",
  "author": "Your Name",
  "repository": "https://github.com/your-username/my-plugin"
}
```

## 测试

### 测试结构

```
tests/
├── agents/
│   └── AgentRegistry.test.ts
├── core/
│   ├── SessionManager.test.ts
│   └── MessageRouter.test.ts
├── utils/
│   ├── index.ts
│   └── testHelpers.ts
└── main.test.ts
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

- [API 文档](API.md)
- [用户指南](USER_GUIDE.md)
- [Claude Agent SDK 文档](https://docs.claude.com/en/api/agent-sdk/overview)
