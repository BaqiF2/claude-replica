## ADDED Requirements

### Requirement: UIFactoryRegistry 全局单例与重置
系统必须在 `UIFactoryRegistry.createUIFactory()` 中创建并缓存全局 UIFactory 实例，并在测试中提供 `resetForTesting()` 以清空缓存。

#### Scenario: 多次调用返回同一实例
- **GIVEN** `UIFactoryRegistry` 尚未创建实例且未设置 `CLAUDE_UI_TYPE`
- **WHEN** 连续调用 `createUIFactory()` 两次
- **THEN** 两次返回的实例引用相同
- **AND** 未发生重复的具体 UIFactory 创建

#### Scenario: resetForTesting 后重新创建实例
- **GIVEN** 已创建 UIFactory 单例实例
- **WHEN** 调用 `UIFactoryRegistry.resetForTesting()` 后再次调用 `createUIFactory()`
- **THEN** 返回的新实例与之前实例不同
- **AND** 单例缓存被重新初始化

### Requirement: TestUIFactory 测试辅助
系统必须提供 `TestUIFactory`，实现 `UIFactory` 接口并返回可观察的 mock 组件以支持测试断言。

#### Scenario: TestUIFactory 返回可观察 mock
- **GIVEN** 一个 `TestUIFactory` 实例
- **WHEN** 调用 `createParser()`、`createOutput()`、`createPermissionUI()`
- **THEN** 每个方法返回的对象可用于断言其方法调用
- **AND** mock 调用记录可在测试中读取

## MODIFIED Requirements

### Requirement: UI 类型解析与校验
系统必须仅使用 `CLAUDE_UI_TYPE` 环境变量选择 UI 类型，未设置时默认 `terminal`，且在值非法时抛出错误以阻止启动。

#### Scenario: 未设置环境变量时默认 terminal
- **GIVEN** 未设置 `CLAUDE_UI_TYPE`
- **WHEN** 调用 `UIFactoryRegistry.createUIFactory()`
- **THEN** 返回 `TerminalUIFactory` 实例
- **AND** 使用默认 UI 类型 `terminal`

#### Scenario: 非法环境变量触发错误
- **GIVEN** `CLAUDE_UI_TYPE=invalid`
- **WHEN** 调用 `UIFactoryRegistry.createUIFactory()`
- **THEN** 抛出错误，消息包含 `Invalid CLAUDE_UI_TYPE: "invalid"` 及支持类型列表
- **AND** 启动流程被中止

### Requirement: Application/PermissionManager 复用注入 UIFactory
系统必须要求 Application 构造函数显式传入 `UIFactory`，并在 `initialize()` 中复用该实例创建 `PermissionManager`（由 `PermissionManager` 内部提取 PermissionUI）。

#### Scenario: Application 使用同一 UIFactory 实例
- **GIVEN** 使用 `TestUIFactory` 构造的 Application
- **WHEN** 调用 `initialize()`
- **THEN** `PermissionManager` 使用该 `UIFactory` 创建 PermissionUI
- **AND** 初始化过程中不创建新的 UIFactory 实例

## REMOVED Requirements

### Requirement: 配置与初始化中的 ui 字段流程
系统不再应当从配置文件的 `ui` 字段驱动 UI 初始化或将其保存在运行时配置中。

**Reason**：UI 类型仅由 `CLAUDE_UI_TYPE` 决定，配置文件中的 `ui` 字段从未生效且会导致重复初始化路径。
**Migration**：从配置文件移除 `ui` 字段，使用 `CLAUDE_UI_TYPE` 并在 CLI 创建 `UIFactory` 后注入 Application。

#### Scenario: 旧配置 ui 字段被忽略并移除
- **GIVEN** 项目配置包含 `ui` 字段
- **WHEN** 加载项目配置并构建 PermissionConfig
- **THEN** 生成的配置对象不包含 `ui` 字段
- **AND** 加载过程不报错

## RENAMED Requirements
（无）
