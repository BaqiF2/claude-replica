# UI 抽象层重构规格说明

## ADDED Requirements

### Requirement: 系统必须支持多种 UI 实现类型
系统应当通过抽象接口支持 Terminal、Web、Desktop 等多种 UI 实现,允许通过环境变量 `CLAUDE_UI_TYPE` 进行运行时切换。

#### Scenario: 通过环境变量切换 Terminal UI
- **GIVEN** 环境变量 `CLAUDE_UI_TYPE` 设置为 "terminal"
- **WHEN** 应用程序启动
- **THEN** UIFactoryRegistry 应当返回 TerminalUIFactory
- **AND** 创建的 InteractiveUI 实例应当为 TerminalInteractiveUI 类型

#### Scenario: 未设置环境变量时使用默认 Terminal UI
- **GIVEN** 环境变量 `CLAUDE_UI_TYPE` 未设置
- **WHEN** 应用程序启动
- **THEN** UIFactoryRegistry 应当返回默认的 TerminalUIFactory
- **AND** 创建的 InteractiveUI 实例应当为 TerminalInteractiveUI 类型

### Requirement: 系统必须提供 InteractiveUIInterface 抽象接口
系统应当定义 InteractiveUIInterface 接口,包含所有 UI 实现必须支持的生命周期、消息显示、进度指示、状态通知、用户交互、权限管理、处理状态和工具方法。

#### Scenario: InteractiveUIInterface 定义完整的生命周期方法
- **GIVEN** InteractiveUIInterface 接口定义
- **WHEN** 检查接口方法签名
- **THEN** 接口应当包含 `start(): Promise<void>` 方法
- **AND** 接口应当包含 `stop(): void` 方法

#### Scenario: InteractiveUIInterface 定义完整的消息显示方法
- **GIVEN** InteractiveUIInterface 接口定义
- **WHEN** 检查接口方法签名
- **THEN** 接口应当包含 `displayMessage(message: string, role: MessageRole): void` 方法
- **AND** 接口应当包含 `displayToolUse(tool: string, args: Record<string, unknown>): void` 方法
- **AND** 接口应当包含 `displayToolResult(tool: string, result: string, isError?: boolean): void` 方法

#### Scenario: InteractiveUIInterface 定义完整的进度指示方法
- **GIVEN** InteractiveUIInterface 接口定义
- **WHEN** 检查接口方法签名
- **THEN** 接口应当包含 `displayThinking(content?: string): void` 方法
- **AND** 接口应当包含 `displayComputing(): void` 方法
- **AND** 接口应当包含 `stopComputing(): void` 方法
- **AND** 接口应当包含 `clearProgress(): void` 方法

#### Scenario: InteractiveUIInterface 定义完整的状态通知方法
- **GIVEN** InteractiveUIInterface 接口定义
- **WHEN** 检查接口方法签名
- **THEN** 接口应当包含 `displayError(message: string): void` 方法
- **AND** 接口应当包含 `displayWarning(message: string): void` 方法
- **AND** 接口应当包含 `displaySuccess(message: string): void` 方法
- **AND** 接口应当包含 `displayInfo(message: string): void` 方法

#### Scenario: InteractiveUIInterface 定义完整的用户交互方法
- **GIVEN** InteractiveUIInterface 接口定义
- **WHEN** 检查接口方法签名
- **THEN** 接口应当包含 `promptConfirmation(message: string): Promise<boolean>` 方法
- **AND** 接口应当包含 `showRewindMenu(snapshots: Snapshot[]): Promise<Snapshot | null>` 方法
- **AND** 接口应当包含 `showSessionMenu(sessions: Session[]): Promise<Session | null>` 方法
- **AND** 接口应当包含 `showConfirmationMenu(title: string, options: string[], defaultKey?: string): Promise<boolean>` 方法

#### Scenario: InteractiveUIInterface 定义完整的权限管理方法
- **GIVEN** InteractiveUIInterface 接口定义
- **WHEN** 检查接口方法签名
- **THEN** 接口应当包含 `setInitialPermissionMode(mode: PermissionMode): void` 方法
- **AND** 接口应当包含 `setPermissionMode(mode: PermissionMode): void` 方法
- **AND** 接口应当包含 `displayPermissionStatus(mode: PermissionMode): void` 方法

#### Scenario: InteractiveUIInterface 定义完整的处理状态管理方法
- **GIVEN** InteractiveUIInterface 接口定义
- **WHEN** 检查接口方法签名
- **THEN** 接口应当包含 `setProcessingState(processing: boolean): void` 方法

#### Scenario: InteractiveUIInterface 定义完整的工具方法
- **GIVEN** InteractiveUIInterface 接口定义
- **WHEN** 检查接口方法签名
- **THEN** 接口应当包含 `formatRelativeTime(date: Date): string` 方法
- **AND** 接口应当包含 `formatAbsoluteTime(date: Date): string` 方法
- **AND** 接口应当包含 `formatStatsSummary(stats?: SessionStats): string` 方法

### Requirement: 系统必须提供 InteractiveUICallbacks 回调接口
系统应当定义 InteractiveUICallbacks 接口,使用纯回调函数替代 EventEmitter,提供类型安全的事件处理机制。

#### Scenario: InteractiveUICallbacks 定义所有必需回调
- **GIVEN** InteractiveUICallbacks 接口定义
- **WHEN** 检查接口属性签名
- **THEN** 接口应当包含 `onMessage: (message: string) => Promise<void>` 属性
- **AND** 接口应当包含 `onCommand: (command: string) => Promise<void>` 属性
- **AND** 接口应当包含 `onInterrupt: () => void` 属性
- **AND** 接口应当包含 `onRewind: () => Promise<void>` 属性

#### Scenario: InteractiveUICallbacks 定义可选回调
- **GIVEN** InteractiveUICallbacks 接口定义
- **WHEN** 检查接口属性签名
- **THEN** 接口应当包含 `onPermissionModeChange?: (mode: PermissionMode) => void | Promise<void>` 可选属性
- **AND** 接口应当包含 `onQueueMessage?: (message: string) => void` 可选属性

### Requirement: 系统必须提供 InteractiveUIConfig 配置接口
系统应当定义 InteractiveUIConfig 接口,允许配置输入输出流和颜色支持。

#### Scenario: InteractiveUIConfig 定义所有配置项
- **GIVEN** InteractiveUIConfig 接口定义
- **WHEN** 检查接口属性签名
- **THEN** 接口应当包含 `input?: NodeJS.ReadableStream` 可选属性
- **AND** 接口应当包含 `output?: NodeJS.WritableStream` 可选属性
- **AND** 接口应当包含 `enableColors?: boolean` 可选属性

### Requirement: 系统必须实现 TerminalInteractiveUI 类
系统应当提供 TerminalInteractiveUI 类实现 InteractiveUIInterface 接口,支持所有终端特定功能(ANSI 颜色、TTY 检测、键盘事件监听、Readline 输入处理)。

#### Scenario: TerminalInteractiveUI 使用回调函数替代 EventEmitter
- **GIVEN** TerminalInteractiveUI 类定义
- **WHEN** 检查类继承关系
- **THEN** 类不应当继承 EventEmitter
- **AND** 类应当通过构造函数接收 InteractiveUICallbacks 参数

#### Scenario: TerminalInteractiveUI 调用 onMessage 回调
- **GIVEN** TerminalInteractiveUI 实例已创建,callbacks.onMessage 已定义
- **WHEN** 用户输入消息后按回车
- **THEN** 应当调用 callbacks.onMessage 并传递消息内容
- **AND** 回调应当返回 Promise

#### Scenario: TerminalInteractiveUI 调用 onCommand 回调
- **GIVEN** TerminalInteractiveUI 实例已创建,callbacks.onCommand 已定义
- **WHEN** 用户输入命令(以 "/" 开头)后按回车
- **THEN** 应当调用 callbacks.onCommand 并传递命令内容
- **AND** 回调应当返回 Promise

#### Scenario: TerminalInteractiveUI 调用 onInterrupt 回调
- **GIVEN** TerminalInteractiveUI 实例已创建,callbacks.onInterrupt 已定义
- **WHEN** 用户按下 Esc 键
- **THEN** 应当调用 callbacks.onInterrupt

#### Scenario: TerminalInteractiveUI 调用 onRewind 回调
- **GIVEN** TerminalInteractiveUI 实例已创建,callbacks.onRewind 已定义
- **WHEN** 用户在 300ms 内双击 Esc 键
- **THEN** 应当调用 callbacks.onRewind
- **AND** 回调应当返回 Promise

#### Scenario: TerminalInteractiveUI 调用 onPermissionModeChange 回调
- **GIVEN** TerminalInteractiveUI 实例已创建,callbacks.onPermissionModeChange 已定义
- **WHEN** 用户按下 Shift+Tab 键
- **THEN** 应当调用 callbacks.onPermissionModeChange 并传递新的权限模式
- **AND** 权限模式应当按 default → acceptEdits → bypassPermissions → plan → default 循环

#### Scenario: TerminalInteractiveUI 调用 onQueueMessage 回调
- **GIVEN** TerminalInteractiveUI 实例已创建,callbacks.onQueueMessage 已定义
- **WHEN** 正在处理请求时用户输入新消息
- **THEN** 应当调用 callbacks.onQueueMessage 并传递消息内容

#### Scenario: TerminalInteractiveUI 保留终端特定功能
- **GIVEN** TerminalInteractiveUI 实例已创建
- **WHEN** 检查类实现
- **THEN** 应当包含 ANSI 颜色系统功能
- **AND** 应当包含 TTY 检测和原始模式设置功能
- **AND** 应当包含键盘事件监听功能
- **AND** 应当包含 Readline 输入处理功能

### Requirement: UIFactory 接口必须扩展支持创建 InteractiveUI
系统应当在 UIFactory 接口中新增 `createInteractiveUI` 方法,保持与 createParser/createOutput 的架构一致性。

#### Scenario: UIFactory 定义 createInteractiveUI 方法
- **GIVEN** UIFactory 接口定义
- **WHEN** 检查接口方法签名
- **THEN** 接口应当包含 `createInteractiveUI(callbacks: InteractiveUICallbacks, config?: InteractiveUIConfig): InteractiveUIInterface` 方法

#### Scenario: TerminalUIFactory 实现 createInteractiveUI 方法
- **GIVEN** TerminalUIFactory 类定义
- **WHEN** 调用 createInteractiveUI 方法
- **THEN** 应当返回 TerminalInteractiveUI 实例
- **AND** 实例应当接收传递的 callbacks 和 config 参数

### Requirement: InteractiveRunner 必须通过依赖注入使用 UIFactory
系统应当修改 InteractiveRunner 构造函数,接收 UIFactory 参数,使用工厂模式创建 InteractiveUI 实例,消除直接依赖具体实现。

#### Scenario: InteractiveRunner 构造函数接收 UIFactory 参数
- **GIVEN** InteractiveRunner 类定义
- **WHEN** 检查构造函数签名
- **THEN** 构造函数应当包含 `uiFactory: UIFactory` 参数

#### Scenario: InteractiveRunner 使用 UIFactory 创建 InteractiveUI
- **GIVEN** InteractiveRunner 实例已创建,uiFactory 已注入
- **WHEN** 启动交互模式
- **THEN** 应当调用 `uiFactory.createInteractiveUI()` 创建 UI 实例
- **AND** 应当传递完整的 InteractiveUICallbacks 回调对象
- **AND** 回调对象应当包含 onMessage、onCommand、onInterrupt、onRewind、onPermissionModeChange、onQueueMessage

#### Scenario: InteractiveRunner 通过回调处理用户消息
- **GIVEN** InteractiveRunner 实例已创建,UI 已启动
- **WHEN** UI 触发 onMessage 回调
- **THEN** 应当调用 `ui.setProcessingState(true)`
- **AND** 应当调用 `handleUserMessage` 处理消息
- **AND** 处理完成后应当调用 `ui.setProcessingState(false)`

#### Scenario: InteractiveRunner 通过回调处理命令
- **GIVEN** InteractiveRunner 实例已创建,UI 已启动
- **WHEN** UI 触发 onCommand 回调
- **THEN** 应当调用 `handleCommand` 处理命令

#### Scenario: InteractiveRunner 通过回调处理中断
- **GIVEN** InteractiveRunner 实例已创建,UI 已启动
- **WHEN** UI 触发 onInterrupt 回调
- **THEN** 应当调用 `handleInterrupt` 处理中断

#### Scenario: InteractiveRunner 通过回调处理回退
- **GIVEN** InteractiveRunner 实例已创建,UI 已启动
- **WHEN** UI 触发 onRewind 回调
- **THEN** 应当调用 `handleRewind` 处理回退

#### Scenario: InteractiveRunner 通过回调处理权限模式变更
- **GIVEN** InteractiveRunner 实例已创建,UI 已启动
- **WHEN** UI 触发 onPermissionModeChange 回调
- **THEN** 应当调用 `permissionManager.setMode` 更新权限模式

#### Scenario: InteractiveRunner 通过回调处理消息队列
- **GIVEN** InteractiveRunner 实例已创建,UI 已启动,streamingQueryManager 已创建
- **WHEN** UI 触发 onQueueMessage 回调
- **THEN** 应当调用 `streamingQueryManager.queueMessage` 将消息加入队列

### Requirement: StreamingQueryManager 必须明确接收 UI 参数
系统应当修改 StreamingQueryManagerOptions 接口,新增 `ui?: InteractiveUIInterface` 参数,消除闭包引用,使依赖关系显式化。

#### Scenario: StreamingQueryManagerOptions 定义 ui 参数
- **GIVEN** StreamingQueryManagerOptions 接口定义
- **WHEN** 检查接口属性签名
- **THEN** 接口应当包含 `ui?: InteractiveUIInterface` 可选属性

#### Scenario: InteractiveRunner 创建 StreamingQueryManager 时传递 ui
- **GIVEN** InteractiveRunner 实例已创建,UI 已创建
- **WHEN** 创建 StreamingQueryManager 实例
- **THEN** 应当在 options 中传递 `ui: this.ui`
- **AND** StreamingQueryManager 应当能够直接访问 ui 实例

### Requirement: RunnerFactory 和 main.ts 必须传递 UIFactory
系统应当修改 RunnerFactory 构造函数,接收 UIFactory 参数,并在 main.ts 中注入 uiFactory,完成依赖注入链。

#### Scenario: RunnerFactory 构造函数接收 UIFactory 参数
- **GIVEN** RunnerFactory 类定义
- **WHEN** 检查构造函数签名
- **THEN** 构造函数应当包含 `uiFactory: UIFactory` 参数

#### Scenario: RunnerFactory 创建 InteractiveRunner 时传递 UIFactory
- **GIVEN** RunnerFactory 实例已创建,uiFactory 已注入
- **WHEN** 调用 `createRunner` 方法
- **THEN** 应当在创建 InteractiveRunner 时传递 `this.uiFactory`

#### Scenario: main.ts 创建 RunnerFactory 时传递 UIFactory
- **GIVEN** Application 实例已创建,uiFactory 已创建
- **WHEN** 创建 RunnerFactory 实例
- **THEN** 应当传递 `this.uiFactory` 参数

### Requirement: 系统必须更新公共导出和测试基础设施
系统应当更新 `src/ui/index.ts` 导出新接口,更新 MockInteractiveUI 实现新接口,适配所有测试用例。

#### Scenario: src/ui/index.ts 导出 InteractiveUIInterface
- **GIVEN** `src/ui/index.ts` 文件
- **WHEN** 检查导出列表
- **THEN** 应当导出 `InteractiveUIInterface`
- **AND** 应当导出 `InteractiveUICallbacks`
- **AND** 应当导出 `InteractiveUIConfig`
- **AND** 应当导出 `TerminalInteractiveUI`

#### Scenario: MockInteractiveUI 实现 InteractiveUIInterface
- **GIVEN** MockInteractiveUI 类定义
- **WHEN** 检查类实现
- **THEN** 类应当实现 InteractiveUIInterface 接口
- **AND** 所有接口方法应当有实现或 mock 实现

#### Scenario: 测试用例适配新的 InteractiveUI API
- **GIVEN** 所有集成测试和单元测试
- **WHEN** 运行测试套件
- **THEN** 所有测试应当通过
- **AND** 测试覆盖率应当不低于重构前

### Requirement: 系统必须删除旧的 InteractiveUI.ts 文件
系统应当在完成迁移验证后,删除 `src/ui/InteractiveUI.ts` 文件,强制使用新的抽象接口。

#### Scenario: 删除 InteractiveUI.ts 后编译通过
- **GIVEN** InteractiveUI.ts 文件已删除
- **WHEN** 运行 TypeScript 编译
- **THEN** 编译应当无错误
- **AND** 不应当有任何文件导入 InteractiveUI

#### Scenario: 删除 InteractiveUI.ts 后测试通过
- **GIVEN** InteractiveUI.ts 文件已删除
- **WHEN** 运行测试套件
- **THEN** 所有测试应当通过

## MODIFIED Requirements

无

## REMOVED Requirements

无

## RENAMED Requirements

无
