# UI 抽象层重构设计说明

## 项目背景

Claude Replica 当前在 `InteractiveRunner` 中直接创建和使用 `InteractiveUI` 类,该类包含大量终端特定功能(readline、TTY、ANSI 颜色、键盘监听等),缺乏抽象层支持多种 UI 实现。本项目旨在通过引入抽象层,使框架能够轻松接入 Web UI、Desktop UI 等多种 UI 实现。

## 核心目标

1. **多端支持**: 支持 Terminal、Web、Desktop 等多种 UI 实现
2. **架构一致性**: 与现有 `ParserInterface`/`OutputInterface` 统一
3. **职责分离**: InteractiveRunner 只关注业务逻辑,UI 实现独立
4. **可扩展性**: 通过工厂模式和接口抽象,遵循开闭原则

## 当前架构问题

### 问题 1: 直接依赖具体实现

**位置**: `src/runners/InteractiveRunner.ts` 第 59-79 行

```typescript
// 当前代码直接创建 InteractiveUI 实例
this.ui = new InteractiveUI({
  onMessage: async (message: string) => { /* ... */ },
  // ...
});
```

**影响**:
- InteractiveRunner 与 InteractiveUI 强耦合
- 无法替换为其他 UI 实现
- 违反依赖倒置原则

### 问题 2: 终端特定功能混入

**位置**: `src/ui/InteractiveUI.ts` (1140 行代码)

**终端特定功能**:
- TTY 检测和原始模式设置 (第 199-201 行, 230-232 行)
- ANSI 颜色代码系统 (第 76-96 行)
- 键盘事件监听 (第 719-776 行)
  - Esc 双击检测 (300ms 窗口)
  - Shift+Tab 权限模式切换
  - Ctrl+C 退出
- Readline 输入处理 (第 191-195 行)

**影响**:
- Web UI 或 Desktop UI 无法复用这些终端特定代码
- 职责混合,难以维护

### 问题 3: 缺乏抽象层

**当前 UIFactory**:
```typescript
export interface UIFactory {
  createParser(): ParserInterface;
  createOutput(): OutputInterface;
  createPermissionUI(): PermissionUI;
  // 缺少 createInteractiveUI()
}
```

**影响**:
- UIFactory 不完整,无法创建 InteractiveUI
- 与 ParserInterface/OutputInterface 的架构不一致

### 问题 4: EventEmitter 耦合

**位置**: `src/ui/InteractiveUI.ts`

```typescript
export class InteractiveUI extends EventEmitter {
  // ...
  this.emit('stop');      // 第 234 行
  this.emit('rewind');    // 第 758, 765 行
  this.emit('interrupt'); // 第 758, 765 行
}
```

**影响**:
- 暴露了底层事件系统
- Web UI 等实现可能不需要 EventEmitter
- 隐式依赖,难以追踪

## 解决方案设计

### 架构设计

采用**三层抽象架构**:

```
┌─────────────────────────────────────────┐
│      InteractiveRunner (业务逻辑)       │
│  - 依赖 UIFactory                        │
│  - 使用 InteractiveUIInterface          │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  InteractiveUIInterface (通用接口)      │
│  - 定义所有 UI 必须实现的契约           │
│  - 纯回调函数,不暴露 EventEmitter       │
│  - 参数使用纯文本,不包含格式化信息     │
└─────────────────────────────────────────┘
                    ↓
┌──────────────────┬──────────────────────┐
│ TerminalUI       │  WebUI / DesktopUI   │
│ (终端实现)       │  (其他实现)          │
└──────────────────┴──────────────────────┘
```

### 核心设计决策

基于与用户的详细交流,以下是关键设计决策:

| 决策点 | 选择 | 理由 |
|-------|------|------|
| **接口策略** | 完全替代 - InteractiveUIInterface 成为唯一标准 | 避免重复维护,强制迁移 |
| **工厂职责** | 仅创建 InteractiveUI - 单一职责 | 保持工厂简洁,子组件由 UI 内部管理 |
| **异步支持** | start() 返回 Promise<void> | 支持 WebSocket 等异步初始化 |
| **事件机制** | 纯回调函数,不暴露 EventEmitter | 简化接口,提高类型安全性 |
| **进度显示** | 保持特定方法名(displayComputing, displayThinking) | 业务语义清晰 |
| **菜单抽象** | 保持业务语义(showSessionMenu, showRewindMenu) | 不暴露实现细节 |
| **格式化** | UI 实现层处理,接口接收纯文本 | 不同 UI 可有不同视觉风格 |
| **键盘事件** | UI 内部处理,通过回调通知 | 终端特定逻辑封装在实现内 |
| **依赖注入** | InteractiveRunner 直接注入 UIFactory | 遵循依赖倒置原则 |
| **闭包引用** | StreamingQueryManager 构造函数明确接收 ui | 消除隐式依赖 |
| **测试策略** | 集成测试为主,最小化 Mock | 验证功能完整性 |
| **代码清理** | 完全删除 InteractiveUI.ts | 强制迁移,避免混用 |

### 接口设计

#### InteractiveUIInterface 核心接口

**文件**: `src/ui/InteractiveUIInterface.ts`

**方法分类** (共 20+ 方法):

1. **生命周期管理**:
   - `start(): Promise<void>` - 启动交互式 UI,支持异步初始化
   - `stop(): void` - 停止 UI,清理资源

2. **消息显示**:
   - `displayMessage(message: string, role: MessageRole): void`
   - `displayToolUse(tool: string, args: Record<string, unknown>): void`
   - `displayToolResult(tool: string, result: string, isError?: boolean): void`

3. **进度指示**:
   - `displayThinking(content?: string): void` - 显示思考状态
   - `displayComputing(): void` - 显示计算动画
   - `stopComputing(): void` - 停止计算动画
   - `clearProgress(): void` - 清除进度指示

4. **状态通知**:
   - `displayError(message: string): void`
   - `displayWarning(message: string): void`
   - `displaySuccess(message: string): void`
   - `displayInfo(message: string): void`

5. **用户交互**:
   - `promptConfirmation(message: string): Promise<boolean>`
   - `showRewindMenu(snapshots: Snapshot[]): Promise<Snapshot | null>`
   - `showSessionMenu(sessions: Session[]): Promise<Session | null>`
   - `showConfirmationMenu(title, options, defaultKey?): Promise<boolean>`

6. **权限模式管理**:
   - `setInitialPermissionMode(mode: PermissionMode): void` - 静默设置初始模式
   - `setPermissionMode(mode: PermissionMode): void` - 运行时切换(带通知)
   - `displayPermissionStatus(mode: PermissionMode): void`

7. **处理状态管理**:
   - `setProcessingState(processing: boolean): void` - 同步处理状态

8. **工具方法**:
   - `formatRelativeTime(date: Date): string` - "X小时前"
   - `formatAbsoluteTime(date: Date): string` - "YYYY-MM-DD HH:mm:ss"
   - `formatStatsSummary(stats?: SessionStats): string` - "(X 条消息, Xk tokens, $X)"

#### InteractiveUICallbacks 回调接口

**替代 EventEmitter 的设计**:

```typescript
export interface InteractiveUICallbacks {
  onMessage: (message: string) => Promise<void>;
  onCommand: (command: string) => Promise<void>;
  onInterrupt: () => void;
  onRewind: () => Promise<void>;
  onPermissionModeChange?: (mode: PermissionMode) => void | Promise<void>;
  onQueueMessage?: (message: string) => void;
}
```

**设计理由**:
- 明确的类型定义,避免字符串事件名
- 支持异步回调 (`Promise<void>`)
- 可选回调用 `?` 标记,提高灵活性

#### InteractiveUIConfig 配置接口

```typescript
export interface InteractiveUIConfig {
  input?: NodeJS.ReadableStream;    // 默认 stdin
  output?: NodeJS.WritableStream;   // 默认 stdout
  enableColors?: boolean;            // 默认 true
}
```

### 实现设计

#### TerminalInteractiveUI 实现要点

**文件**: `src/ui/TerminalInteractiveUI.ts`

**构造函数签名**:
```typescript
constructor(
  callbacks: InteractiveUICallbacks,
  config: InteractiveUIConfig = {}
)
```

**核心修改**:
1. 移除 `extends EventEmitter`
2. 将所有 `emit()` 调用替换为回调函数调用
3. 保留所有终端特定功能:
   - ANSI 颜色系统
   - TTY 检测和原始模式
   - 键盘事件监听
   - Readline 输入处理

**事件处理迁移示例**:

```typescript
// 旧代码 (EventEmitter)
this.emit('interrupt');
this.onInterrupt();

// 新代码 (回调函数)
this.callbacks.onInterrupt();
```

```typescript
// 旧代码 (EventEmitter)
this.emit('rewind');
this.onRewind();

// 新代码 (回调函数)
this.callbacks.onRewind().catch((err) => {
  this.displayError(`Rewind failed: ${err.message}`);
});
```

#### UIFactory 扩展

**文件**: `src/ui/factories/UIFactory.ts`

**新增方法**:
```typescript
export interface UIFactory {
  createParser(): ParserInterface;
  createOutput(): OutputInterface;
  createPermissionUI(output?, input?): PermissionUI;

  // 新增方法
  createInteractiveUI(
    callbacks: InteractiveUICallbacks,
    config?: InteractiveUIConfig
  ): InteractiveUIInterface;
}
```

**TerminalUIFactory 实现**:
```typescript
createInteractiveUI(
  callbacks: InteractiveUICallbacks,
  config?: InteractiveUIConfig
): InteractiveUIInterface {
  return new TerminalInteractiveUI(callbacks, config);
}
```

### 依赖注入链重构

#### InteractiveRunner 修改

**关键修改点**:

1. **构造函数添加 uiFactory 参数**:
```typescript
constructor(
  private readonly output: OutputInterface,
  private readonly sessionManager: SessionManager,
  private readonly messageRouter: MessageRouter,
  private readonly sdkExecutor: SDKQueryExecutor,
  private readonly permissionManager: PermissionManager,
  private readonly mcpService: MCPService,
  private readonly rewindManager: RewindManager | null,
  private readonly configManager: ConfigManager,
  private readonly logger: Logger,
  private readonly uiFactory: UIFactory  // 新增
) {}
```

2. **使用 uiFactory 创建 UI 实例**:
```typescript
this.ui = this.uiFactory.createInteractiveUI({
  onMessage: async (message: string) => {
    this.ui!.setProcessingState(true);
    try {
      await this.handleUserMessage(message, session);
    } finally {
      this.ui!.setProcessingState(false);
    }
  },
  onCommand: async (command: string) => {
    await this.handleCommand(command, session);
  },
  onInterrupt: () => this.handleInterrupt(),
  onRewind: async () => await this.handleRewind(session),
  onPermissionModeChange: (mode: PermissionMode) =>
    this.permissionManager.setMode(mode),
  onQueueMessage: (message: string) => {
    if (this.streamingQueryManager) {
      this.streamingQueryManager.queueMessage(message);
    }
  },
});
```

#### StreamingQueryManager 修改

**关键修改点**:

1. **构造函数明确接收 ui 参数**:
```typescript
export interface StreamingQueryManagerOptions {
  messageRouter: MessageRouter;
  sdkExecutor: SDKQueryExecutor;
  sessionManager: SessionManager;
  ui?: InteractiveUIInterface;  // 新增
  onToolUse?: (info: ToolUseInfo) => void;
  onToolResult?: (info: ToolResultInfo) => void;
  onAssistantText?: (text: string) => void;
  onThinking?: (content?: string) => void;
}
```

2. **消除闭包引用**:
```typescript
// 旧代码 (闭包引用 this.ui)
this.streamingQueryManager = new StreamingQueryManagerImpl({
  onThinking: (content) => {
    if (this.ui) {  // 闭包引用
      this.ui.displayThinking(content);
    }
  },
  // ...
});

// 新代码 (明确传递 ui)
this.streamingQueryManager = new StreamingQueryManagerImpl({
  ui: this.ui,  // 明确传递
  onThinking: (content) => {
    if (this.ui) {
      this.ui.displayThinking(content);
    }
  },
  // ...
});
```

#### RunnerFactory 和 main.ts 修改

**RunnerFactory**:
```typescript
constructor(
  // ... 现有参数 ...
  private readonly uiFactory: UIFactory  // 新增
) {}

createRunner(options: ApplicationOptions): ApplicationRunner {
  return new InteractiveRunner(
    // ... 现有参数 ...
    this.uiFactory  // 新增
  );
}
```

**main.ts**:
```typescript
this.runnerFactory = new RunnerFactory(
  // ... 现有参数 ...
  this.uiFactory  // 新增
);
```

## 实施计划

### Phase 1: 接口定义和核心实现 (P0)

**目标**: 建立抽象层基础

**任务**:
1. 创建 `src/ui/InteractiveUIInterface.ts` - 定义接口和类型
2. 创建 `src/ui/TerminalInteractiveUI.ts` - 实现终端 UI
3. 扩展 `src/ui/factories/UIFactory.ts` - 添加 createInteractiveUI()
4. 实现 `src/ui/factories/TerminalUIFactory.ts` - 实现工厂方法

**验证点**:
- TypeScript 编译通过
- 接口完整性检查
- TerminalInteractiveUI 实现所有接口方法

### Phase 2: 依赖注入链重构 (P1)

**目标**: 更新调用链,使用工厂模式创建 UI

**任务**:
1. 修改 `src/runners/InteractiveRunner.ts` - 依赖注入 UIFactory
2. 修改 `src/sdk/StreamingQueryManager.ts` - 明确接收 ui 参数
3. 修改 `src/runners/RunnerFactory.ts` - 传递 uiFactory
4. 修改 `src/main.ts` - 传递 uiFactory

**验证点**:
- TypeScript 编译通过
- 依赖注入链完整性检查
- 手动测试交互模式启动

### Phase 3: 导出更新和测试适配 (P2)

**目标**: 更新公共 API 和测试基础设施

**任务**:
1. 更新 `src/ui/index.ts` - 更新导出
2. 更新 `tests/test-helpers/MockInteractiveUI.ts` - 实现新接口
3. 更新 `tests/integration/resume-command.test.ts` - 适配新 API
4. 更新 `tests/ui/InteractiveUI.test.ts` - 重命名和适配

**验证点**:
- 所有测试通过
- 测试覆盖率不降低

### Phase 4: 清理和强制迁移 (P3)

**目标**: 删除旧代码,确保完全迁移

**任务**:
1. 全局导入检查 - 确保所有导入已更新
2. 删除 `src/ui/InteractiveUI.ts` - 强制迁移
3. 更新文档 - 同步架构说明

**验证点**:
- TypeScript 编译通过
- 所有测试通过
- 文档与代码同步

### Phase 5: 完整验证 (P4)

**目标**: 端到端测试和回归验证

**任务**:
1. 集成测试 - 手动测试所有交互功能
2. 性能验证 - 对比重构前后性能
3. 代码审查 - 代码质量检查

**验证点**:
- 所有功能正常工作
- 性能无退化
- 代码质量符合规范

## 技术约束

### 兼容性要求

1. **Node.js 版本**: >= 20.0.0
2. **TypeScript 版本**: 严格模式,类型安全
3. **向后兼容**: 强制迁移,不保留旧 API

### 性能要求

1. **启动时间**: 不应明显增加
2. **消息处理延迟**: 保持在可接受范围内
3. **内存使用**: 无明显泄漏

### 代码质量要求

1. **文件头文档**: 所有新文件必须包含规范的文件头文档
2. **类型安全**: 严格的 TypeScript 类型检查
3. **测试覆盖**: 不降低现有测试覆盖率

## 风险评估

### 主要风险

| 风险 | 严重性 | 概率 | 影响 | 缓解措施 |
|-----|--------|------|------|---------|
| 功能回归 | 高 | 中 | 交互功能失效 | 完整集成测试清单,手动测试,回滚计划 |
| 性能退化 | 中 | 低 | UI 响应延迟 | 性能基准测试,内存监控 |
| 类型安全 | 中 | 低 | TypeScript 类型不匹配 | 严格类型检查,接口契约测试 |
| 测试覆盖不足 | 中 | 中 | 潜在 bug 未发现 | 覆盖率报告,边界条件测试 |

### 缓解措施

1. **功能回归**:
   - 手动测试清单覆盖所有交互功能
   - 集成测试验证核心流程
   - 保留 Git 分支便于回滚

2. **性能退化**:
   - 对比重构前后启动时间
   - 监控消息处理延迟
   - 检查内存泄漏

3. **类型安全**:
   - 开启 TypeScript 严格模式
   - 接口契约测试验证所有方法存在
   - 编译时验证

4. **测试覆盖**:
   - 运行覆盖率报告
   - 补充边界条件测试
   - Mock 完整性检查

## 未来扩展

### Web UI 实现示例

```typescript
export class WebInteractiveUI implements InteractiveUIInterface {
  private websocket: WebSocket | null = null;

  async start(): Promise<void> {
    // WebSocket 连接初始化 (异步)
    this.websocket = new WebSocket('ws://localhost:8080');
    await new Promise((resolve, reject) => {
      this.websocket!.onopen = resolve;
      this.websocket!.onerror = reject;
    });
  }

  displayMessage(message: string, role: MessageRole): void {
    // 发送消息到浏览器
    this.websocket?.send(JSON.stringify({
      type: 'display_message',
      message,
      role,
    }));
  }

  // 实现其他接口方法...
}
```

### Desktop UI 实现示例

```typescript
export class DesktopInteractiveUI implements InteractiveUIInterface {
  private ipcRenderer: Electron.IpcRenderer;

  async start(): Promise<void> {
    // 设置 IPC 监听
    this.ipcRenderer.on('user-message', (_event, message: string) => {
      this.callbacks.onMessage(message).catch(() => {});
    });
  }

  displayMessage(message: string, role: MessageRole): void {
    // 发送消息到渲染进程
    this.ipcRenderer.send('display-message', { message, role });
  }

  // 实现其他接口方法...
}
```

### UI 工厂扩展

```typescript
// 注册新的 UI 工厂
UIFactoryRegistry.registerUIFactory('web', new WebUIFactory());
UIFactoryRegistry.registerUIFactory('desktop', new DesktopUIFactory());

// 环境变量切换
CLAUDE_UI_TYPE=web npm run start
CLAUDE_UI_TYPE=desktop npm run start
```

## 验证完成标准

- [ ] 所有 5 个 Phase 的任务完成
- [ ] TypeScript 编译无错误
- [ ] 所有测试通过(单元测试 + 集成测试)
- [ ] 手动测试清单全部通过:
  - [ ] 交互模式启动
  - [ ] 消息输入和显示
  - [ ] 工具调用显示
  - [ ] 权限模式切换 (Shift+Tab)
  - [ ] Esc 中断功能
  - [ ] Esc+Esc 回退菜单
  - [ ] `/resume` 会话恢复
  - [ ] `/help` 命令
  - [ ] `/exit` 退出
- [ ] 性能无明显退化
- [ ] 文档已更新
- [ ] 代码风格检查通过

## 设计优势总结

1. **职责分离**: InteractiveRunner 只关注业务逻辑,UI 实现独立
2. **易于测试**: 可以 mock InteractiveUIInterface 进行单元测试
3. **可扩展**: 添加新 UI 无需修改现有代码(开闭原则)
4. **配置驱动**: 通过 `CLAUDE_UI_TYPE` 环境变量切换 UI 类型
5. **类型安全**: TypeScript 接口保证契约一致性
6. **架构一致**: 与现有 ParserInterface/OutputInterface 统一

## 参考资料

- **原计划文档**: `/Users/wuwenjun/.claude/plans/snazzy-drifting-gizmo.md`
- **项目架构文档**: `.claude/CLAUDE.md`
- **代码规范**: `.claude/rules/code-spec.md`
- **文件头文档规范**: `.claude/rules/file-header-documentation.md`
