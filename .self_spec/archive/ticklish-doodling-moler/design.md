# Application初始化Builder模式重构设计文档

**日期**: 2026-01-14
**作者**: Claude Code Assistant
**版本**: v1.0
**参考Issue**: main.ts:168-175 初始化方法优化

## 1. 执行摘要

本文档描述了对 `main.ts` 中 Application 类初始化流程的**Builder模式重构方案**。当前 Application 类承担了13个不同的初始化任务，违反了单一职责原则。本方案通过 Builder 模式将初始化过程模块化、可配置、可测试，并提供清晰的依赖管理机制。

## 2. 问题分析

### 2.1 当前问题诊断

**现状代码**（main.ts:140-179）：
```typescript
class Application {
  async initialize(options: CLIOptions): Promise<void> {
    await this.logger.init();  // 1. 日志
    await this.configManager.ensureUserConfigDir(); // 2. 配置目录
    const projectConfig = await this.configManager.loadProjectConfig(workingDir); // 3. 项目配置
    const permissionConfig = this.configBuilder.buildPermissionConfigOnly(options, projectConfig);
    this.permissionManager = new PermissionManager(/* ... */); // 4. 权限管理
    this.messageRouter = new MessageRouter(/* ... */); // 5. 消息路由
    this.rewindManager = new RewindManager({ workingDir }); // 6. 回滚管理
    await this.rewindManager.initialize();

    // 问题：Application直接管理每个Manager的初始化细节
    await this.loadCustomExtensions(workingDir);  // 7. 钩子扩展
    await this.initializeCustomTools();          // 8. 自定义工具
    await this.loadMCPServers(workingDir);     // 9. MCP服务器
    await this.cleanOldSessions();             // 10. 会话清理
    // ... 后续初始化
  }
}
```

**核心问题**：
1. **职责混乱**: Application既做编排又做执行
2. **紧耦合**: 直接操作Manager内部实现细节
3. **依赖不透明**: 依赖关系隐含在代码中
4. **错误处理不一致**: 每个初始化步骤有不同的错误策略
5. **测试困难**: 无法单独测试某个初始化阶段
6. **扩展性差**: 新增子系统需要修改Application类

### 2.2 架构反模式识别

- ❌ **God Object反模式**: Application类承担过多职责
- ❌ **依赖管理混乱**: Manager依赖关系不明确
- ❌ **紧耦合**: Application直接依赖具体实现
- ❌ **违反单一职责**: 初始化流程与业务逻辑混杂

### 2.3 影响范围评估

**主要修改文件**:
- `src/main.ts` - 重构Application类
- `src/core/` - 新增初始化协调模块
- `src/managers/` - Manager类需实现统一接口

**测试影响**:
- 现有测试需要适配新的初始化方式
- 新增Builder模式的单元测试
- 集成测试需要验证初始化流程

**向后兼容性**:
- ✅ CLI接口不变
- ✅ 核心功能不变
- ✅ 配置格式不变
- ⚠️ 内部API变更（但用户不直接使用）

## 3. 解决方案：Builder模式

### 3.1 设计理念

**核心理念**：
1. **分离关注点**: 将"如何构建"与"构建什么"分离
2. **依赖显式化**: 通过Builder显式声明依赖关系
3. **初始化模块化**: 每个Manager自管理初始化
4. **错误边界清晰**: 统一的错误处理和恢复机制
5. **测试友好**: 可以轻松mock和替换组件

**Builder模式优势**：
- ✅ **可组合**: 通过链式调用灵活组合初始化阶段
- ✅ **可配置**: 支持环境变量、配置文件动态配置
- ✅ **可测试**: 每个阶段可以独立测试
- ✅ **可观察**: 清晰的初始化进度和状态
- ✅ **可扩展**: 新阶段通过方法添加（开闭原则）

### 3.2 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        初始化流程架构                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐                                              │
│  │  Application    │ 协调者 - 不直接执行初始化                     │
│  │  (简化版)      │ 负责整体流程控制和生命周期管理                   │
│  └────────┬────────┘                                              │
│           │                                                         │
│           │ uses                                                    │
│           │                                                         │
│  ┌────────▼────────┐                                              │
│  │ Application     │ Builder - 负责构建和配置                      │
│  │ Builder         │ 声明式定义初始化阶段                          │
│  └────────┬────────┘                                              │
│           │                                                         │
│           │ creates                                                │
│           │                                                         │
│  ┌────────▼────────┐     ┌──────────────────┐                     │
│  │ Initialization   │────▶│ ManagedService   │                     │
│  │ Phase (接口)     │     │ (Manager基类)    │                     │
│  └─────────────────┘     └──────────────────┘                     │
│                                │                                   │
│                   ┌───────────┼───────────┐                     │
│                   │           │           │                     │
│          ┌────────▼────┐ ┌───▼────┐ ┌────▼────────┐              │
│          │ HookManager  │ │MCPManager│ │SessionManager│             │
│          └─────────────┘ └────────┘ └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 核心组件设计

#### 3.3.1 ManagedService接口

**文件**: `src/core/ManagedService.ts`

```typescript
/**
 * 可管理服务接口
 *
 * 所有Manager类需要实现此接口以支持Builder模式初始化
 */
export interface ManagedService {
  /**
   * 服务名称
   * 用于依赖声明和日志记录
   */
  readonly name: string;

  /**
   * 服务依赖
   * 声明此服务依赖的其他服务名称
   */
  readonly dependencies: string[];

  /**
   * 初始化服务
   *
   * @param context ApplicationContext
   * @returns Promise<void>
   */
  initialize(context: ApplicationContext): Promise<void>;

  /**
   * 关闭服务（可选）
   *
   * @param context ApplicationContext
   * @returns Promise<void>
   */
  shutdown?(context: ApplicationContext): Promise<void>;

  /**
   * 健康检查（可选）
   *
   * @param context ApplicationContext
   * @returns Promise<boolean>
   */
  healthCheck?(context: ApplicationContext): Promise<boolean>;
}
```

#### 3.3.2 InitializationPhase类

**文件**: `src/core/InitializationPhase.ts`

```typescript
/**
 * 初始化阶段
 *
 * 封装一个Manager的初始化逻辑，支持配置、错误处理、度量
 */
export class InitializationPhase {
  constructor(
    public readonly name: string,
    private readonly serviceFactory: (context: ApplicationContext) => ManagedService,
    public readonly dependencies: string[] = [],
    private readonly config?: PhaseConfig
  ) {}

  /**
   * 执行初始化
   */
  async execute(context: ApplicationContext): Promise<InitializationResult> {
    const startTime = Date.now();
    const logger = context.get<LoggerService>('logger');

    try {
      await logger.debug(`Initializing phase: ${this.name}`);

      // 创建服务实例
      const service = this.serviceFactory(context);

      // 验证依赖
      await this.validateDependencies(context);

      // 执行初始化
      await service.initialize(context);

      const duration = Date.now() - startTime;

      await logger.debug(`Phase ${this.name} completed in ${duration}ms`);

      return new InitializationResult(
        this.name,
        true,
        undefined,
        duration
      );
    } catch (error) {
      const duration = Date.now() - startTime;

      await logger.error(`Phase ${this.name} failed: ${error.message}`);

      return new InitializationResult(
        this.name,
        false,
        error,
        duration
      );
    }
  }

  /**
   * 验证依赖是否满足
   */
  private async validateDependencies(context: ApplicationContext): Promise<void> {
    for (const dep of this.dependencies) {
      if (!context.has(dep)) {
        throw new InitializationError(
          `Missing dependency: ${dep} for phase: ${this.name}`,
          InitializationErrorType.CRITICAL,
          this.name
        );
      }
    }
  }
}

/**
 * 初始化结果
 */
export class InitializationResult {
  constructor(
    public readonly phase: string,
    public readonly success: boolean,
    public readonly error?: Error,
    public readonly duration: number
  ) {}
}

/**
 * 阶段配置
 */
export interface PhaseConfig {
  /** 是否可选（失败不影响整体） */
  optional?: boolean;
  /** 最大重试次数 */
  retryCount?: number;
  /** 重试间隔（毫秒） */
  retryDelay?: number;
  /** 是否后台执行 */
  background?: boolean;
}
```

#### 3.3.3 ApplicationBuilder类

**文件**: `src/core/ApplicationBuilder.ts`

```typescript
/**
 * Application Builder
 *
 * 负责构建和配置Application实例
 */
export class ApplicationBuilder {
  private phases: InitializationPhase[] = [];
  private contextBuilder: ApplicationContextBuilder;

  constructor() {
    this.contextBuilder = new ApplicationContextBuilder();
  }

  /**
   * 添加核心服务（Logger、Config等）
   */
  addCoreServices(): ApplicationBuilder {
    // Logger服务
    this.phases.push(new InitializationPhase(
      'logger',
      () => new LoggerService(),
      [],
      { optional: false }
    ));

    // Config服务
    this.phases.push(new InitializationPhase(
      'config',
      (ctx) => new ConfigManager(),
      ['logger'],
      { optional: false }
    ));

    // WorkingDirectory服务
    this.phases.push(new InitializationPhase(
      'workingDir',
      () => new WorkingDirectoryService(),
      ['config'],
      { optional: false }
    ));

    return this;
  }

  /**
   * 添加钩子扩展阶段
   */
  addHookPhase(): ApplicationBuilder {
    this.phases.push(new InitializationPhase(
      'hooks',
      (ctx) => {
        const hooksConfigPath = path.join(
          ctx.get<WorkingDirectoryService>('workingDir').get(),
          '.claude',
          'hooks.json'
        );

        const hookManager = new HookManager({
          workingDir: ctx.get<WorkingDirectoryService>('workingDir').get(),
          promptProcessor: ctx.get('promptProcessor'),
          debug: process.env.DEBUG === 'true'
        });

        return hookManager;
      },
      ['workingDir', 'logger'],
      {
        optional: true,
        retryCount: 0 // 钩子加载失败不应重试
      }
    ));

    return this;
  }

  /**
   * 添加自定义工具阶段
   */
  addCustomToolPhase(): ApplicationBuilder {
    this.phases.push(new InitializationPhase(
      'customTools',
      (ctx) => {
        const customToolManager = new CustomToolManager();
        // 注册计算器工具
        customToolManager.registerModule(CUSTOM_TOOL_MODULE_NAME, [calculatorTool]);
        return customToolManager;
      },
      ['logger'],
      { optional: true }
    ));

    return this;
  }

  /**
   * 添加MCP服务器阶段
   */
  addMCPServerPhase(): ApplicationBuilder {
    this.phases.push(new InitializationPhase(
      'mcp',
      (ctx) => {
        const mcpManager = new MCPManager({
          workingDir: ctx.get<WorkingDirectoryService>('workingDir').get(),
          logger: ctx.get<LoggerService>('logger')
        });
        return mcpManager;
      },
      ['workingDir', 'logger'],
      {
        optional: true,
        retryCount: 3,
        retryDelay: 1000
      }
    ));

    return this;
  }

  /**
   * 添加会话清理阶段（后台执行）
   */
  addSessionCleanupPhase(): ApplicationBuilder {
    this.phases.push(new InitializationPhase(
      'sessionCleanup',
      (ctx) => new SessionManager({
        storageDir: path.join(
          ctx.get<WorkingDirectoryService>('workingDir').get(),
          '.claude-replica',
          'sessions'
        ),
        logger: ctx.get<LoggerService>('logger')
      }),
      ['workingDir', 'logger'],
      {
        optional: true,
        background: true, // 后台执行，不阻塞主流程
        retryCount: 0
      }
    ));

    return this;
  }

  /**
   * 添加权限管理阶段
   */
  addPermissionPhase(uiFactory?: PermissionUIFactory): ApplicationBuilder {
    this.phases.push(new InitializationPhase(
      'permission',
      (ctx) => {
        const configManager = ctx.get<ConfigManager>('config');
        const projectConfig = configManager.getProjectConfigSync();

        const permissionConfig = this.configBuilder.buildPermissionConfigOnly(
          this.cliOptions,
          projectConfig
        );

        return new PermissionManager(permissionConfig, uiFactory);
      },
      ['config'],
      { optional: false }
    ));

    return this;
  }

  /**
   * 构建Application实例
   */
  async build(cliOptions?: CLIOptions): Promise<Application> {
    // 拓扑排序依赖
    const sortedPhases = this.topologicalSort(this.phases);

    // 构建上下文
    const context = await this.contextBuilder.build(sortedPhases);

    // 创建Application
    const app = new Application(context, cliOptions);

    // 执行初始化
    const results = await this.executePhases(sortedPhases, context);

    // 检查关键阶段失败
    const criticalFailures = results.filter(r => !r.success && !this.isOptionalPhase(r.phase));
    if (criticalFailures.length > 0) {
      throw new InitializationError(
        `Critical phases failed: ${criticalFailures.map(f => f.phase).join(', ')}`,
        InitializationErrorType.CRITICAL,
        'initialization'
      );
    }

    return app;
  }

  /**
   * 执行初始化阶段
   */
  private async executePhases(
    phases: InitializationPhase[],
    context: ApplicationContext
  ): Promise<InitializationResult[]> {
    const results: InitializationResult[] = [];

    for (const phase of phases) {
      const config = phase.config || {};

      if (config.background) {
        // 后台执行，不等待
        setImmediate(async () => {
          try {
            await phase.execute(context);
          } catch (error) {
            // 静默处理后台任务错误
            context.get<LoggerService>('logger')
              .warn(`Background phase ${phase.name} failed: ${error.message}`);
          }
        });
      } else {
        const result = await this.executePhaseWithRetry(phase, context);
        results.push(result);

        // 可选阶段失败不影响后续
        if (!result.success && !config.optional) {
          break; // 关键阶段失败，停止
        }
      }
    }

    return results;
  }

  /**
   * 带重试的执行
   */
  private async executePhaseWithRetry(
    phase: InitializationPhase,
    context: ApplicationContext
  ): Promise<InitializationResult> {
    const config = phase.config || {};
    const maxRetries = config.retryCount || 0;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await phase.execute(context);

      if (result.success) {
        return result;
      }

      lastError = result.error;

      if (attempt < maxRetries) {
        const delay = config.retryDelay || 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        context.get<LoggerService>('logger')
          .warn(`Retrying phase ${phase.name}, attempt ${attempt + 2}`);
      }
    }

    return new InitializationResult(
      phase.name,
      false,
      lastError,
      0
    );
  }

  /**
   * 拓扑排序依赖
   */
  private topologicalSort(phases: InitializationPhase[]): InitializationPhase[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const sorted: InitializationPhase[] = [];

    const visit = (phase: InitializationPhase) => {
      if (visited.has(phase.name)) return;
      if (visiting.has(phase.name)) {
        throw new Error(`Circular dependency detected: ${phase.name}`);
      }

      visiting.add(phase.name);

      for (const dep of phase.dependencies) {
        const depPhase = phases.find(p => p.name === dep);
        if (!depPhase) {
          throw new Error(`Missing dependency: ${dep} for phase: ${phase.name}`);
        }
        visit(depPhase);
      }

      visiting.delete(phase.name);
      visited.add(phase.name);
      sorted.push(phase);
    };

    for (const phase of phases) {
      visit(phase);
    }

    return sorted;
  }

  /**
   * 检查阶段是否为可选
   */
  private isOptionalPhase(phaseName: string): boolean {
    const phase = this.phases.find(p => p.name === phaseName);
    return phase?.config?.optional || false;
  }
}
```

#### 3.3.4 ApplicationContext类

**文件**: `src/core/ApplicationContext.ts`

```typescript
/**
 * Application上下文
 *
 * 负责管理服务实例的生命周期和依赖注入
 */
export class ApplicationContext {
  private services = new Map<string, unknown>();
  private singletons = new Map<string, () => unknown>();

  /**
   * 注册服务
   */
  register<T>(name: string, service: T): void {
    this.services.set(name, service);
  }

  /**
   * 注册单例工厂
   */
  registerSingleton<T>(name: string, factory: () => T): void {
    this.singletons.set(name, factory);
  }

  /**
   * 获取服务
   */
  get<T>(name: string): T {
    if (this.singletons.has(name)) {
      const factory = this.singletons.get(name)!;
      const service = factory();
      this.register(name, service);
      this.singletons.delete(name);
    }

    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service not found: ${name}`);
    }

    return service as T;
  }

  /**
   * 检查服务是否存在
   */
  has(name: string): boolean {
    return this.services.has(name) || this.singletons.has(name);
  }

  /**
   * 获取所有服务名称
   */
  getServiceNames(): string[] {
    return [
      ...this.services.keys(),
      ...this.singletons.keys()
    ];
  }

  /**
   * 清理资源
   */
  async dispose(): Promise<void> {
    for (const [name, service] of this.services.entries()) {
      if (service && typeof (service as any).shutdown === 'function') {
        try {
          await (service as any).shutdown(this);
        } catch (error) {
          console.error(`Failed to shutdown service ${name}:`, error);
        }
      }
    }

    this.services.clear();
    this.singletons.clear();
  }
}

/**
 * ApplicationContext Builder
 */
class ApplicationContextBuilder {
  private services = new Map<string, unknown>();

  build(phases: InitializationPhase[]): ApplicationContext {
    const context = new ApplicationContext();

    // 注册核心服务（Logger、Config等）
    this.registerCoreServices(context);

    // 执行各个阶段
    for (const phase of phases) {
      // ... phase execution logic
    }

    return context;
  }

  private registerCoreServices(context: ApplicationContext): void {
    // 注册Logger
    context.register('logger', new LoggerService());

    // 注册ConfigManager
    context.registerSingleton('config', () => new ConfigManager());

    // 注册WorkingDirectoryService
    context.registerSingleton('workingDir', () => new WorkingDirectoryService());

    // 注册其他核心服务...
  }
}
```

#### 3.3.5 重构后的Application类

**文件**: `src/main.ts` (部分重构)

```typescript
/**
 * Application - 简化版
 *
 * 负责应用生命周期管理和核心业务逻辑
 * 不再直接管理各Manager的初始化细节
 */
export class Application {
  private readonly context: ApplicationContext;
  private readonly cliOptions?: CLIOptions;
  private isInitialized = false;

  constructor(context: ApplicationContext, cliOptions?: CLIOptions) {
    this.context = context;
    this.cliOptions = cliOptions;
  }

  /**
   * 运行应用
   */
  async run(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // 核心业务逻辑
    await this.startMainLoop();
  }

  /**
   * 初始化应用
   *
   * 现在只需要启动各个Manager，细节由Builder管理
   */
  private async initialize(): Promise<void> {
    const logger = this.context.get<LoggerService>('logger');

    await logger.info('Starting application initialization...');

    // 各Manager已经通过Builder初始化完成
    // 这里只需要做最后的协调工作

    this.isInitialized = true;
    await logger.info('Application initialized successfully');
  }

  /**
   * 获取服务实例
   */
  getService<T>(name: string): T {
    return this.context.get<T>(name);
  }

  /**
   * 优雅关闭
   */
  async shutdown(): Promise<void> {
    const logger = this.context.get<LoggerService>('logger');
    await logger.info('Shutting down application...');

    await this.context.dispose();

    await logger.info('Application shutdown complete');
  }
}
```

#### 3.3.6 Manager类重构示例

**HookManager重构**:

```typescript
/**
 * HookManager - 重构后
 *
 * 实现ManagedService接口，自管理初始化逻辑
 */
export class HookManager implements ManagedService {
  readonly name = 'hooks';
  readonly dependencies = ['workingDir', 'logger'];

  private configPath: string;

  constructor(private options: HookManagerOptions) {
    this.configPath = path.join(
      options.workingDir,
      '.claude',
      'hooks.json'
    );
  }

  /**
   * 自管理初始化
   */
  async initialize(context: ApplicationContext): Promise<void> {
    const logger = context.get<LoggerService>('logger');

    try {
      await logger.debug('Loading hooks configuration...');

      const hooksContent = await fs.readFile(this.configPath, 'utf-8');
      const hooksConfig = JSON.parse(hooksContent);

      this.loadHooks(hooksConfig);

      await logger.debug('Hooks loaded successfully');
    } catch (error) {
      if (error.code === 'ENOENT') {
        await logger.debug('No hooks config found, skipping');
      } else {
        throw new InitializationError(
          `Failed to load hooks: ${error.message}`,
          InitializationErrorType.NON_CRITICAL,
          this.name
        );
      }
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(context: ApplicationContext): Promise<boolean> {
    // 检查钩子配置是否有效
    return true;
  }

  /**
   * 关闭
   */
  async shutdown(context: ApplicationContext): Promise<void> {
    // 清理钩子资源
  }
}
```

## 4. 使用示例

### 4.1 基础用法

```typescript
// 1. 创建Builder
const builder = new ApplicationBuilder();

// 2. 添加初始化阶段
const app = await builder
  .addCoreServices()
  .addHookPhase()
  .addCustomToolPhase()
  .addMCPServerPhase()
  .addSessionCleanupPhase()
  .build(cliOptions);

// 3. 运行应用
await app.run();
```

### 4.2 环境配置

```typescript
// 根据环境选择启用的阶段
const builder = new ApplicationBuilder()
  .addCoreServices();

// 开发环境启用调试功能
if (process.env.NODE_ENV === 'development') {
  builder.addHookPhase();
}

// 生产环境禁用会话清理
if (process.env.NODE_ENV !== 'production') {
  builder.addSessionCleanupPhase();
}

// 始终启用权限管理
builder.addPermissionPhase();

const app = await builder.build(cliOptions);
```

### 4.3 自定义配置

```typescript
// 自定义阶段配置
builder.addMCPServerPhase()
  .configure({
    optional: true,
    retryCount: 5,
    retryDelay: 2000
  });
```

## 5. 实现路线图

### 5.1 第一阶段：核心框架（Week 1）

**目标**: 建立Builder模式核心框架

**任务**:
1. 创建 `ManagedService` 接口
2. 创建 `InitializationPhase` 类
3. 创建 `ApplicationContext` 类
4. 创建 `ApplicationBuilder` 类
5. 重构一个Manager（HookManager）作为示例

**里程碑**:
- [ ] 所有核心类通过单元测试
- [ ] HookManager成功通过Builder初始化
- [ ] 拓扑排序依赖正常工作

### 5.2 第二阶段：Manager迁移（Week 2）

**目标**: 将所有Manager迁移到Builder模式

**任务**:
1. 重构 MCPManager
2. 重构 SessionManager
3. 重构 CustomToolManager
4. 重构 PermissionManager
5. 重构 RewindManager

**里程碑**:
- [ ] 所有Manager实现ManagedService接口
- [ ] 依赖关系清晰且无循环依赖
- [ ] 向后兼容性测试通过

### 5.3 第三阶段：Application简化（Week 3）

**目标**: 简化Application类

**任务**:
1. 重构Application类
2. 更新main.ts入口
3. 添加错误处理和恢复机制
4. 添加性能度量

**里程碑**:
- [ ] Application类职责单一
- [ ] 初始化时间可度量
- [ ] 错误处理策略统一

### 5.4 第四阶段：测试与优化（Week 4）

**目标**: 全面测试和性能优化

**任务**:
1. 编写完整的单元测试套件
2. 编写集成测试
3. 性能测试和优化
4. 文档更新

**里程碑**:
- [ ] 测试覆盖率 > 90%
- [ ] 性能指标满足要求
- [ ] 文档完整且准确

## 6. 测试策略

### 6.1 单元测试

**ManagedService接口测试**:
```typescript
describe('ManagedService', () => {
  it('should require name and dependencies', () => {
    const service = new MockService();
    expect(service.name).toBeDefined();
    expect(service.dependencies).toBeDefined();
  });

  it('should throw error if dependency missing', async () => {
    const context = new ApplicationContext();
    const service = new MockService(['missing']);

    await expect(service.initialize(context))
      .rejects.toThrow('Missing dependency');
  });
});
```

**ApplicationBuilder测试**:
```typescript
describe('ApplicationBuilder', () => {
  it('should build application with all phases', async () => {
    const builder = new ApplicationBuilder();
    const app = await builder
      .addCoreServices()
      .addHookPhase()
      .build();

    expect(app).toBeInstanceOf(Application);
  });

  it('should execute phases in dependency order', async () => {
    const executionOrder: string[] = [];

    class MockPhase extends InitializationPhase {
      async execute(context: ApplicationContext): Promise<InitializationResult> {
        executionOrder.push(this.name);
        return super.execute(context);
      }
    }

    const phase1 = new MockPhase('p1', () => new MockService(), ['p2']);
    const phase2 = new MockPhase('p2', () => new MockService(), []);

    const phases = [phase1, phase2];
    const sorted = builder['topologicalSort'](phases);

    expect(sorted.map(p => p.name)).toEqual(['p2', 'p1']);
  });
});
```

### 6.2 集成测试

**完整初始化流程测试**:
```typescript
describe('Application initialization integration', () => {
  it('should initialize all services successfully', async () => {
    const builder = new ApplicationBuilder();
    const app = await builder
      .addCoreServices()
      .addHookPhase()
      .addCustomToolPhase()
      .addMCPServerPhase()
      .build(mockOptions);

    expect(app.getService('logger')).toBeDefined();
    expect(app.getService('config')).toBeDefined();
    expect(app.getService('hookManager')).toBeDefined();
  });

  it('should handle optional phase failure gracefully', async () => {
    // 测试可选阶段失败不影响整体
  });
});
```

### 6.3 性能测试

**初始化时间测试**:
```typescript
describe('Initialization performance', () => {
  it('should complete core initialization within 500ms', async () => {
    const start = Date.now();

    const builder = new ApplicationBuilder();
    const app = await builder
      .addCoreServices()
      .build();

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(500);
  });
});
```

## 7. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 迁移过程中引入bug | 中 | 高 | 完整的测试套件，渐进式迁移 |
| 性能下降 | 低 | 中 | 性能基准测试，监控指标 |
| 向后兼容性破坏 | 低 | 高 | 保持公共API不变，内部实现可变更 |
| 循环依赖 | 低 | 中 | 拓扑排序检测，依赖分析工具 |
| 测试覆盖不足 | 中 | 高 | 要求 > 90% 覆盖率，代码审查 |

## 8. 成功指标

### 8.1 代码质量指标

- [ ] **单一职责**: Application类职责清晰，初始化逻辑分离
- [ ] **依赖显式**: 所有依赖关系通过Builder声明
- [ ] **可测试性**: 所有Manager可独立测试
- [ ] **错误边界**: 错误处理策略统一且清晰

### 8.2 性能指标

- [ ] **初始化时间**: 核心初始化 < 500ms
- [ ] **内存占用**: 无明显增长
- [ ] **CPU使用**: 无显著变化

### 8.3 维护性指标

- [ ] **新增Manager**: 无需修改Application类
- [ ] **配置灵活性**: 可通过配置控制初始化流程
- [ ] **文档完整性**: 所有组件有详细文档

## 9. 对比分析

### 9.1 当前设计 vs Builder模式

| 维度 | 当前设计 | Builder模式 |
|------|----------|-------------|
| **职责分离** | ❌ Application承担过多职责 | ✅ 职责清晰，各司其职 |
| **依赖管理** | ❌ 依赖关系隐含在代码中 | ✅ 依赖显式声明 |
| **错误处理** | ❌ 每个阶段策略不同 | ✅ 统一策略，可配置 |
| **可测试性** | ❌ 难以mock和测试 | ✅ 易于测试和mock |
| **可扩展性** | ❌ 添加Manager需修改Application | ✅ 通过Builder链式添加 |
| **可观察性** | ❌ 初始化过程不透明 | ✅ 清晰的进度和状态 |
| **性能** | ❌ 串行执行所有阶段 | ✅ 可并行执行独立阶段 |
| **代码量** | 少 | 中等（增加框架代码） |
| **学习曲线** | 平缓 | 稍陡（需要理解Builder模式） |

### 9.2 方案对比

**方案1 (Context模式)**:
- 优点: 简单，直接
- 缺点: 仍然需要修改Application类

**方案2 (Builder模式)** ⭐:
- 优点: 职责分离最清晰，扩展性最好
- 缺点: 代码量较大，学习曲线稍陡

**方案3 (配置驱动)**:
- 优点: 最灵活，完全声明式
- 缺点: 过度设计，复杂性高

**选择理由**: 方案2在复杂性和功能性之间取得最佳平衡，符合当前项目规模和需求。

## 10. 结论与建议

### 10.1 核心收益

1. **架构清晰**: 初始化流程模块化，职责分离
2. **维护性**: 新增子系统无需修改核心代码
3. **可测试**: 每个阶段可独立测试和mock
4. **可观察**: 初始化过程透明，错误可追踪
5. **可配置**: 支持环境变量和配置驱动

### 10.2 立即行动项

1. **立即开始**: 第一阶段核心框架实现
2. **优先迁移**: HookManager作为示例
3. **测试驱动**: 每个组件先写测试再实现
4. **渐进式**: 分4周完成，不影响主线开发

### 10.3 长期收益

- **降低技术债务**: 代码质量提升
- **提高开发效率**: 未来添加功能更容易
- **降低维护成本**: 问题定位和修复更快
- **提升团队协作**: 架构清晰，新人易上手

### 10.4 后续扩展

**未来可扩展方向**:
1. **配置驱动**: 支持JSON/YAML配置文件
2. **插件系统**: 支持第三方插件
3. **热重载**: 支持开发时热更新
4. **监控集成**: 添加APM和metrics
5. **容器化**: 支持Docker/Kubernetes部署

---

## 附录

### A. 完整代码示例

[代码过长，此处省略，详见实现文件]

### B. 相关文档

- [Builder Pattern - Refactoring.Guru](https://refactoring.guru/design-patterns/builder)
- [Dependency Injection - Martin Fowler](https://martinfowler.com/articles/injection.html)
- [Single Responsibility Principle - Robert Martin](https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html)

### C. 参考实现

- [Angular ApplicationRef](https://angular.io/api/core/ApplicationRef)
- [Spring Boot ApplicationContext](https://docs.spring.io/spring-framework/docs/current/reference/html/core.html#beans-factory)
- [NestJS Application](https://docs.nestjs.com/first-steps#application-setup)

---

**文档状态**: ✅ 完成
**审核状态**: ⏳ 待审核
**实施状态**: ⏳ 待开始
