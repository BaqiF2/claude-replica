# PermissionUI 工厂模式重构 - 规格说明

**版本**: 1.0.0
**日期**: 2026-01-14
**状态**: DRAFT

---

## ADDED Requirements（新增需求）

### Requirement: 系统应当提供 PermissionUIFactory 接口用于创建 PermissionUI 实例
系统必须定义 `PermissionUIFactory` 接口，该接口包含 `createPermissionUI()` 方法用于创建 `PermissionUI` 实例。工厂方法必须接受可选的输出流和输入流参数，并在未提供时使用默认值 `process.stdout` 和 `process.stdin`。

#### Scenario: 使用默认流创建 UI 实例
- **GIVEN** 一个 PermissionUIFactory 实例
- **WHEN** 调用 createPermissionUI() 且不提供任何参数
- **THEN** 必须返回一个 PermissionUI 实例，该实例使用 process.stdout 作为输出流，process.stdin 作为输入流

#### Scenario: 使用自定义流创建 UI 实例
- **GIVEN** 一个 PermissionUIFactory 实例和自定义的输出流/输入流
- **WHEN** 调用 createPermissionUI(output, input) 并提供自定义流
- **THEN** 必须返回一个 PermissionUI 实例，该实例使用提供的自定义流作为输出流和输入流

### Requirement: 系统应当提供 TerminalPermissionUIFactory 实现来创建终端 UI 实例
系统必须实现 `TerminalPermissionUIFactory` 类，该类必须实现 `PermissionUIFactory` 接口。该工厂必须能够创建 `PermissionUIImpl` 实例，并将创建的实例返回给调用方。

#### Scenario: 工厂创建终端 UI 实例
- **GIVEN** 一个 TerminalPermissionUIFactory 实例
- **WHEN** 调用 createPermissionUI() 方法
- **THEN** 必须返回一个 PermissionUIImpl 实例

#### Scenario: 工厂复用现有 PermissionUIImpl 实现
- **GIVEN** 一个 TerminalPermissionUIFactory 实例
- **WHEN** 工厂创建 PermissionUI 实例
- **THEN** 返回的实例必须与直接使用 `new PermissionUIImpl(output, input)` 创建的实例行为完全一致

### Requirement: 系统应当提供 UIFactoryRegistry 管理 UI 工厂注册和获取
系统必须提供 `UIFactoryRegistry` 类，该类必须支持注册、获取和创建 UI 工厂。该注册表必须能够根据 UI 类型管理多个工厂实例。

#### Scenario: 注册和获取工厂
- **GIVEN** 一个 UI 类型字符串和一个工厂实例
- **WHEN** 调用 UIFactoryRegistry.register(type, factory)
- **THEN** 工厂必须被注册，并且可以通过 UIFactoryRegistry.get(type) 检索到相同的实例

#### Scenario: 获取未注册的工厂类型
- **GIVEN** 一个未注册的 UI 类型字符串
- **WHEN** 调用 UIFactoryRegistry.get(type)
- **THEN** 必须抛出一个错误，错误消息为 "UI factory not found for type: {type}"

#### Scenario: 创建默认工厂
- **GIVEN** 一个 null 或 undefined 的配置
- **WHEN** 调用 UIFactoryRegistry.create(config)
- **THEN** 必须返回一个 TerminalPermissionUIFactory 实例

#### Scenario: 根据配置创建工厂
- **GIVEN** 一个有效的 UI 配置对象，包含 type 字段
- **WHEN** 调用 UIFactoryRegistry.create(config)
- **THEN** 必须返回与配置类型匹配的已注册工厂实例

### Requirement: 系统应当支持通过配置选择不同的 UI 工厂
系统必须在 PermissionConfig 接口中添加可选的 `ui` 字段，该字段必须包含 `type` 属性和可选的 `options` 属性。系统必须能够根据此配置自动选择相应的工厂。

#### Scenario: 默认配置使用终端 UI
- **GIVEN** 一个不包含 ui 字段的 PermissionConfig
- **WHEN** 调用 UIFactoryRegistry.create(config.ui)
- **THEN** 必须返回 TerminalPermissionUIFactory 实例

#### Scenario: 指定 UI 类型配置
- **GIVEN** 一个包含 ui.type = 'terminal' 的 PermissionConfig
- **WHEN** 调用 UIFactoryRegistry.create(config.ui)
- **THEN** 必须返回已注册的 'terminal' 类型工厂实例

### Requirement: 系统应当允许注册自定义 UI 工厂
系统必须允许第三方代码通过 `UIFactoryRegistry.register()` 方法注册自定义工厂。注册后，这些工厂必须能够通过 `UIFactoryRegistry.create()` 被检索和实例化。

#### Scenario: 注册自定义工厂
- **GIVEN** 一个自定义工厂实现
- **WHEN** 调用 UIFactoryRegistry.register('custom', factory) 注册该工厂
- **THEN** 工厂必须被成功注册，并且可以通过 UIFactoryRegistry.create({ type: 'custom' }) 被检索

#### Scenario: 覆盖已注册的工厂
- **GIVEN** 一个已注册类型的工厂实例 factory1
- **WHEN** 注册另一个同名类型的工厂实例 factory2
- **THEN** 新工厂必须替换旧工厂，后续获取操作必须返回 factory2

### Requirement: PermissionManager 应当通过工厂模式创建 PermissionUI 实例
PermissionManager 的构造函数必须修改为接收 `PermissionUIFactory` 实例而非 `PermissionUI` 实例。PermissionManager 必须在构造函数中调用工厂的 `createPermissionUI()` 方法来创建 UI 实例。

#### Scenario: 工厂注入构造函数
- **GIVEN** 一个 PermissionConfig、一个 PermissionUIFactory 实例和一个 ToolRegistry
- **WHEN** 创建 PermissionManager 实例
- **THEN** PermissionManager 必须调用工厂的 createPermissionUI() 方法创建 UI 实例

#### Scenario: 使用默认流创建 UI
- **GIVEN** 一个 PermissionManager 实例，其构造函数接收一个工厂
- **WHEN** PermissionManager 创建内部 UI 实例
- **THEN** 工厂的 createPermissionUI() 必须使用默认的 process.stdout 和 process.stdin 被调用

### Requirement: 系统应当保持向后兼容性
现有的 PermissionConfig 接口和功能必须保持不变。没有提供 ui 配置的系统必须能够正常工作，默认使用终端 UI 工厂。

#### Scenario: 现有配置继续有效
- **GIVEN** 一个仅包含 mode 字段的 PermissionConfig（不含 ui 字段）
- **WHEN** 使用该配置创建 PermissionManager
- **THEN** 系统必须正常工作，不抛出错误，并且默认使用终端 UI

#### Scenario: 现有代码不受影响
- **GIVEN** 现有的 PermissionManager 使用方式和权限检查流程
- **WHEN** 重构后系统处理工具权限检查
- **THEN** 所有现有功能必须与重构前保持完全一致，包括权限提示、用户交互和权限决策

---

## MODIFIED Requirements（修改需求）

### Requirement: PermissionManager 构造函数 - 依赖工厂而非具体实现
PermissionManager 的构造函数签名必须从 `constructor(config: PermissionConfig, permissionUI: PermissionUI, toolRegistry?: ToolRegistry)` 修改为 `constructor(config: PermissionConfig, uiFactory: PermissionUIFactory, toolRegistry?: ToolRegistry)`。

#### Scenario: 使用工厂实例化
- **GIVEN** 一个 PermissionUIFactory 实例
- **WHEN** 将工厂作为第二个参数传递给 PermissionManager 构造函数
- **THEN** PermissionManager 必须成功实例化，并能够通过工厂创建的 UI 实例执行权限操作

#### Scenario: 创建权限检查处理器
- **GIVEN** 一个使用工厂实例化的 PermissionManager
- **WHEN** 调用 createCanUseToolHandler() 方法
- **THEN** 返回的处理器必须能够正常工作，包括调用 UI 实例的 promptToolPermission 和 promptUserQuestions 方法

### Requirement: PermissionConfig 接口扩展 - 添加 UI 配置支持
PermissionConfig 接口必须扩展以包含可选的 `ui` 字段。现有字段必须保持不变，确保向后兼容性。

#### Scenario: 包含 UI 配置的完整配置
- **GIVEN** 一个包含 mode 和 ui 字段的 PermissionConfig
- **WHEN** 系统处理该配置
- **THEN** ui 字段必须被识别和使用，用于选择适当的 UI 工厂

#### Scenario: 仅有基础配置的向后兼容
- **GIVEN** 一个仅包含 mode 字段的 PermissionConfig（不包含 ui 字段）
- **WHEN** 系统处理该配置
- **THEN** 系统必须正常工作，ui 字段被视为可选且使用默认值

### Requirement: main.ts 集成 - 使用工厂模式创建 PermissionUI
main.ts 必须修改其 PermissionUI 实例化逻辑，从直接创建 `new PermissionUIImpl()` 改为使用 `UIFactoryRegistry.create()` 根据配置创建工厂，然后通过工厂创建 UI 实例。

#### Scenario: 根据配置创建工厂
- **GIVEN** 一个包含可选 ui 配置的权限配置
- **WHEN** main.ts 处理该配置创建 PermissionManager
- **THEN** 必须使用 UIFactoryRegistry.create() 根据配置选择适当的工厂

#### Scenario: 完整启动流程
- **GIVEN** 有效的权限配置和工具注册表
- **WHEN** 应用程序启动并创建 PermissionManager
- **THEN** 整个权限系统必须正常工作，包括工厂创建、UI 实例化和权限检查流程

---

## REMOVED Requirements（移除需求）

### Requirement: 直接实例化 PermissionUIImpl 的方式
**Reason**（原因）：直接实例化具体实现违反了依赖倒置原则，导致代码耦合度高且难以测试。改为通过工厂模式创建实例可以提高可扩展性和可测试性。

**Migration**（迁移）：代码应改为使用 `UIFactoryRegistry.create(config.ui)` 获取工厂实例，然后通过工厂的 `createPermissionUI()` 方法创建 UI 实例。对于大多数用户代码，这应该是透明的更改，因为 PermissionManager 现在处理工厂创建逻辑。

---

## RENAMED Requirements（重命名需求）

无重命名需求。
