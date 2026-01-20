# Hooks 系统优化 - 规格说明

## ADDED Requirements

### Requirement: 三种 Hook 回调类型支持
系统应当支持三种 hook 回调类型：command（Shell 命令）、script（JS/TS 文件）、prompt（文本提示词）。

#### Scenario: 执行 Command 类型回调
- **GIVEN** hook 配置中定义了 command 类型回调，包含 Shell 命令和变量占位符
- **WHEN** 触发对应的 hook 事件
- **THEN** 系统执行命令，支持变量替换（$TOOL、$FILE、$COMMAND 等），退出码为 0 时返回 `{ continue: true }`，非 0 时返回 `{ decision: 'block' }`

#### Scenario: 执行 Script 类型回调
- **GIVEN** hook 配置中定义了 script 类型回调，指向 JS/TS 文件路径
- **WHEN** 触发对应的 hook 事件
- **THEN** 系统动态加载脚本模块，调用导出函数，并返回完整的 SDK HookJSONOutput 对象

#### Scenario: 执行 Prompt 类型回调
- **GIVEN** hook 配置中定义了 prompt 类型回调，包含纯文本提示词
- **WHEN** 触发对应的 hook 事件
- **THEN** 系统执行变量替换，返回 `{ systemMessage: expandedPrompt, continue: true }`

### Requirement: 统一 Hook 配置管理
系统应当将 hooks 配置纳入 settings.json，由 ConfigManager 统一加载和管理。

#### Scenario: 从 settings.json 加载 hooks 配置
- **GIVEN** 项目配置文件 `.claude/settings.json` 包含 hooks 字段
- **WHEN** ConfigManager 加载项目配置
- **THEN** hooks 配置被正确解析，存储在 ProjectConfig.hooks 中，可供后续使用

#### Scenario: 将 hooks 配置传递给 HookManager
- **GIVEN** ConfigManager 已加载项目配置，Application 初始化时
- **WHEN** Application 初始化 HookManager
- **THEN** 通过 `HookManager.loadHooks(config.hooks)` 将配置传递给 HookManager

### Requirement: SDK 完整集成
系统应当在消息查询过程中完整集成 SDK hooks，使配置正确传递到 SDK 查询选项。

#### Scenario: MessageRouter 构建 SDK hooks 配置
- **GIVEN** MessageRouter 已注入 HookManager，Session 包含项目配置
- **WHEN** buildQueryOptions() 被调用
- **THEN** 通过 `getHooksForSDK()` 调用 `HookManager.convertToSDKFormat()` 将配置转换为 SDK 格式，并包含在返回的 QueryOptions.hooks 中

#### Scenario: 转换配置为 SDK 格式
- **GIVEN** HookManager 已加载内部 hooks 配置
- **WHEN** `convertToSDKFormat()` 被调用
- **THEN** 将内部配置转换为 SDK HookCallbackMatcher[] 格式，每个 hook 转换为对应的回调函数

### Requirement: 完整 Hook 事件支持
系统应当支持 12 种 hook 事件，并标注 TypeScript SDK 独有的事件。

#### Scenario: 支持所有标准事件
- **GIVEN** 配置中定义了支持的 hook 事件（PreToolUse、PostToolUse、UserPromptSubmit、Stop、SubagentStop、PreCompact）
- **WHEN** 这些事件被触发
- **THEN** 系统执行对应的 hook 回调

#### Scenario: 支持 TypeScript 独有事件
- **GIVEN** 配置中包含 TypeScript 独有事件（PostToolUseFailure、SubagentStart、PermissionRequest、SessionStart、SessionEnd、Notification）
- **WHEN** 验证配置时
- **THEN** 系统标注这些事件为 TypeScript 独有，并在配置有效性检查时发出警告

### Requirement: Hook 脚本路径白名单
系统应当通过白名单机制控制允许加载的脚本路径，确保安全性。

#### Scenario: 验证脚本路径在白名单内
- **GIVEN** 配置中定义了 hookScriptPaths 白名单，hook 配置中指定了脚本路径
- **WHEN** 执行 script 类型回调时
- **THEN** 系统验证脚本绝对路径是否在白名单目录内，在白名单内时加载，不在时拒绝加载

#### Scenario: 使用默认白名单
- **GIVEN** 未配置 hookScriptPaths，使用默认白名单
- **WHEN** 执行 script 类型回调时
- **THEN** 系统使用默认白名单 `["./.claude/hooks", "./hooks"]` 进行验证

### Requirement: 向后兼容和废弃处理
系统应当检测旧的 `.claude/hooks.json` 文件，发出迁移警告，但不自动加载。

#### Scenario: 检测 hooks.json 并警告
- **GIVEN** 项目中存在 `.claude/hooks.json` 文件
- **WHEN** 应用启动时
- **THEN** 系统记录警告日志，提示用户迁移到 settings.json

#### Scenario: 不自动加载旧配置
- **GIVEN** 项目中存在 `.claude/hooks.json` 文件
- **WHEN** 应用加载配置
- **THEN** 系统不读取 hooks.json，用户必须手动迁移到 settings.json

### Requirement: 配置错误处理
系统应当优雅处理配置和执行错误，记录日志但不中断应用启动。

#### Scenario: 处理无效的 hooks 配置
- **GIVEN** hooks 配置包含无效字段或格式错误
- **WHEN** ConfigManager 验证配置时
- **THEN** 系统记录警告日志，跳过无效配置，应用继续启动

#### Scenario: 处理脚本加载失败
- **GIVEN** script 类型回调指向不存在的文件或加载失败
- **WHEN** 执行该 hook 时
- **THEN** 系统捕获异常，记录错误日志，返回 `{ continue: true }` 不阻止流程

#### Scenario: 处理命令执行超时
- **GIVEN** command 类型回调配置了 timeout，命令执行超时
- **WHEN** 执行该 hook 时
- **THEN** 系统中止命令执行，记录日志但不阻止流程，返回 `{ continue: true }`

### Requirement: HookManager 核心方法实现
系统应当实现 HookManager 的核心方法，支持配置加载、执行和 SDK 转换。

#### Scenario: 完整实现 HookManager 方法
- **GIVEN** HookManager 类已定义
- **WHEN** 初始化和使用 HookManager 时
- **THEN** 系统实现以下方法：loadHooks()、convertToSDKFormat()、executeCommand()、executeScript()、executePrompt()、createSDKCallback()

#### Scenario: 变量替换支持
- **GIVEN** 回调中包含变量占位符（$TOOL、$FILE、$COMMAND、$CWD 等）
- **WHEN** 执行 command 或 prompt 类型回调时
- **THEN** 系统使用 SDK HookInput 数据进行变量替换，生成实际的命令或提示词

### Requirement: MessageRouter 集成 HookManager
系统应当在 MessageRouter 中注入 HookManager，并在 buildQueryOptions 中组装 hooks 配置。

#### Scenario: MessageRouter 构造函数接收 HookManager
- **GIVEN** Application 初始化 MessageRouter 时
- **WHEN** 创建 MessageRouter 实例
- **THEN** 通过构造函数参数接收 HookManager 注入

#### Scenario: buildQueryOptions 中添加 hooks 字段
- **GIVEN** MessageRouter 已注入 HookManager，session 包含项目配置
- **WHEN** buildQueryOptions() 被调用
- **THEN** 调用 getHooksForSDK() 获取 hooks 配置，并在返回的 QueryOptions 中包含 hooks 字段（如果存在）

## MODIFIED Requirements

### Requirement: HookManager 架构重构
系统现有的 HookManager 应当从"配置加载器"重构为"纯执行器"。

**原始需求文本：** HookManager 原本负责从文件系统加载 hooks 配置，此次重构应当：
1. 移除 `loadFromProjectRoot()` 和 `loadFromFile()` 方法
2. 配置加载职责转移到 ConfigManager
3. HookManager 专注于接收配置、执行回调、转换为 SDK 格式

**修改内容：** 重构后的 HookManager：
- `loadHooks(config: HooksConfig)`: 接收 ConfigManager 提供的配置对象
- `convertToSDKFormat(config)`: 转换为 SDK 兼容格式
- 三种执行方法：`executeCommand()`、`executeScript()`、`executePrompt()`
- `createSDKCallback()`: 为单个 hook 创建 SDK 回调函数
- 移除所有文件 I/O 操作

### Requirement: Application 初始化流程调整
系统现有的 Application 初始化流程应当调整以支持 hooks 配置的传递。

**原始需求文本：** Application 在启动时初始化各个管理器和核心组件，此次调整应当：
1. 在初始化 MessageRouter 时注入 HookManager
2. 在 HookManager 初始化后调用 `loadHooks(projectConfig.hooks)`

**修改内容：** Application 初始化顺序调整：
1. ConfigManager 加载项目配置（包含 hooks）
2. HookManager 初始化
3. 调用 `HookManager.loadHooks(projectConfig.hooks)`
4. MessageRouter 初始化时注入 HookManager

## REMOVED Requirements

（无）

## RENAMED Requirements

（无）
