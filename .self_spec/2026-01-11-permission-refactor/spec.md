# Permission System Refactor Specification

## ADDED Requirements

### Requirement: 默认权限模式应当设置为 acceptEdits
系统应当将默认权限模式设置为 `acceptEdits`，以自动接受编辑类工具操作。

#### Scenario: 无配置文件时使用 acceptEdits 作为默认模式
- **GIVEN** 用户未在配置文件中指定 `permissionMode`
- **WHEN** 应用程序初始化权限配置
- **THEN** 权限模式应当设置为 `acceptEdits`

#### Scenario: 启动时提示符显示对应 emoji
- **GIVEN** 权限模式为 `acceptEdits`
- **WHEN** 交互式 UI 显示输入提示符
- **THEN** 提示符应当显示为 `> 🟡 ` (黄色圆形 emoji)

### Requirement: 系统必须支持持久权限状态显示
系统必须在终端输入提示符中持续显示当前权限模式对应的 emoji。

#### Scenario: 不同权限模式显示不同 emoji
- **GIVEN** 系统处于某一权限模式
- **WHEN** 用户查看输入提示符
- **THEN** 提示符应当根据模式显示对应 emoji:
  - `default`: `> 🟢`
  - `acceptEdits`: `> 🟡`
  - `bypassPermissions`: `> 🔴`
  - `plan`: `> 🔵`

#### Scenario: 权限切换后 emoji 立即更新
- **GIVEN** 用户按下 Shift+Tab 切换权限模式
- **WHEN** 权限模式从 `default` 切换到 `acceptEdits`
- **THEN** 提示符 emoji 应当立即从 `🟢` 变更为 `🟡`

### Requirement: 系统应当支持通过 Shift+Tab 动态切换权限模式
系统应当允许用户在运行时通过 Shift+Tab 键序列循环切换四种权限模式。

#### Scenario: 检测 Shift+Tab 键序列
- **GIVEN** 交互式 UI 已启动并监听键盘事件
- **WHEN** 用户按下 Shift+Tab (ANSI 序列 `\x1b[Z`)
- **THEN** 系统应当触发权限模式切换逻辑

#### Scenario: 循环切换权限模式顺序
- **GIVEN** 当前权限模式为 `default`
- **WHEN** 用户连续按下 Shift+Tab 三次
- **THEN** 权限模式应当依次变为: `acceptEdits` → `bypassPermissions` → `plan`

#### Scenario: 显示模式切换通知
- **GIVEN** 用户触发权限模式切换
- **WHEN** 模式从 `default` 切换到 `acceptEdits`
- **THEN** 系统应当输出通知: `ℹ️ Switched to: 🟡 Accept Edits`

#### Scenario: 调用权限模式变更回调
- **GIVEN** InteractiveUI 配置了 `onPermissionModeChange` 回调
- **WHEN** 用户切换权限模式到 `bypassPermissions`
- **THEN** 系统应当调用回调函数并传递新模式 `bypassPermissions`

### Requirement: 系统应当支持 SDK 异步权限模式切换
系统应当在用户切换权限后，通过 SDK 的 `setPermissionMode` 方法异步应用新模式。

#### Scenario: 本地状态立即同步更新
- **GIVEN** 用户切换权限模式到 `acceptEdits`
- **WHEN** `StreamingQueryManager.setPermissionMode()` 被调用
- **THEN** `MessageRouter` 的本地权限模式应当立即更新为 `acceptEdits`

#### Scenario: SDK 异步切换权限模式
- **GIVEN** StreamingQueryManager 持有 SDK query 实例引用
- **WHEN** 调用 `setPermissionMode('bypassPermissions')`
- **THEN** 系统应当调用 `queryInstance.setPermissionMode('bypassPermissions')`
- **AND** SDK 应当在当前工具执行完成后应用新模式

#### Scenario: 新会话应用已切换的权限模式
- **GIVEN** 用户在流式会话中切换权限模式到 `plan`
- **WHEN** StreamingQueryManager 启动新的 query 执行
- **THEN** 系统应当在创建 query 实例后立即应用待切换的权限模式

### Requirement: 系统必须实现符合 SDK 规范的 canUseTool 回调
系统必须提供符合 Claude Agent SDK 规范的 canUseTool 回调函数，返回 PermissionResult 对象。

#### Scenario: canUseTool 返回 allow 决策
- **GIVEN** PermissionManager 配置允许 Read 工具
- **WHEN** SDK 调用 `canUseTool('Read', {file_path: 'foo'}, {toolUseID: '123', signal})`
- **THEN** 回调应当返回 `{behavior: 'allow', toolUseID: '123'}`

#### Scenario: canUseTool 返回 deny 决策
- **GIVEN** PermissionManager 黑名单包含 Bash 工具
- **WHEN** SDK 调用 `canUseTool('Bash', {command: 'rm -rf'}, {toolUseID: '456', signal})`
- **THEN** 回调应当返回 `{behavior: 'deny', message: '...', toolUseID: '456'}`

#### Scenario: 检测到 signal.aborted 时中断会话
- **GIVEN** SDK 传递的 AbortSignal 已被中止
- **WHEN** canUseTool 回调被调用
- **THEN** 回调应当返回 `{behavior: 'deny', interrupt: true, toolUseID: '...'}`

### Requirement: 系统应当通过独立面板显示工具权限请求
系统应当在终端底部独立区域显示工具权限请求面板，允许用户批准或拒绝。

#### Scenario: 在底部区域显示权限面板
- **GIVEN** canUseTool 需要用户确认 Bash 工具权限
- **WHEN** PermissionPanel.show() 被调用
- **THEN** 系统应当使用 ANSI 控制码在终端底部约 10 行高度显示面板

#### Scenario: 显示工具名称和参数
- **GIVEN** 权限请求包含工具名 `Bash` 和参数 `{command: 'npm install'}`
- **WHEN** 权限面板渲染
- **THEN** 面板应当显示:
  - 工具名称: `Tool: Bash`
  - 参数内容: `command: npm install`

#### Scenario: 用户批准权限请求
- **GIVEN** 权限面板正在显示
- **WHEN** 用户按下 `y` 键
- **THEN** 系统应当返回 `{approved: true}`
- **AND** 清除权限面板

#### Scenario: 用户拒绝权限请求
- **GIVEN** 权限面板正在显示
- **WHEN** 用户按下 `n` 键
- **THEN** 系统应当返回 `{approved: false, reason: '...'}`
- **AND** 清除权限面板

#### Scenario: 用户取消权限请求
- **GIVEN** 权限面板正在显示
- **WHEN** 用户按下 `Esc` 键
- **THEN** 系统应当返回 `{approved: false}`
- **AND** 清除权限面板

### Requirement: 系统必须支持 AskUserQuestion 工具的交互式菜单
系统必须为 AskUserQuestion 工具提供交互式菜单，支持单选和多选模式。

#### Scenario: 单选模式显示选项列表
- **GIVEN** AskUserQuestion 包含单选问题
  ```json
  {
    "question": "Which database?",
    "header": "Database",
    "options": [
      {"label": "PostgreSQL", "description": "Relational DB"},
      {"label": "MongoDB", "description": "Document DB"}
    ],
    "multiSelect": false
  }
  ```
- **WHEN** QuestionMenu.show() 被调用
- **THEN** 系统应当渲染菜单显示两个选项，第一个选项带有 `▶` 选择指示器

#### Scenario: 多选模式显示复选框
- **GIVEN** AskUserQuestion 包含多选问题，`multiSelect: true`
- **WHEN** QuestionMenu 渲染选项
- **THEN** 每个选项前应当显示复选框: `[ ]` (未选中) 或 `[✓]` (已选中)

#### Scenario: 方向键导航选项
- **GIVEN** QuestionMenu 正在显示，当前选择索引为 0
- **WHEN** 用户按下下箭头键 (`\x1b[B`)
- **THEN** 选择索引应当变为 1
- **AND** 菜单应当重新渲染，显示新的选择指示器位置

#### Scenario: 空格键切换多选选项
- **GIVEN** QuestionMenu 处于多选模式，当前选项未被选中
- **WHEN** 用户按下空格键
- **THEN** 当前选项应当切换为选中状态
- **AND** 复选框应当从 `[ ]` 变为 `[✓]`

#### Scenario: Enter 确认选择
- **GIVEN** QuestionMenu 显示中，用户已选择 PostgreSQL 选项
- **WHEN** 用户按下 Enter 键 (`\r` 或 `\n`)
- **THEN** 菜单应当返回用户选择的标签 `"PostgreSQL"`
- **AND** 清除菜单显示

#### Scenario: Esc 取消选择
- **GIVEN** QuestionMenu 正在显示
- **WHEN** 用户按下 Esc 键 (`\x1b`)
- **THEN** 系统应当返回取消状态或默认值
- **AND** 清除菜单显示

### Requirement: 系统必须为 AskUserQuestion 工具返回 updatedInput
系统必须在处理 AskUserQuestion 工具时，将用户答案注入到 updatedInput 字段中。

#### Scenario: 构建 updatedInput 包含用户答案
- **GIVEN** 用户通过交互式菜单选择了 "PostgreSQL"
- **WHEN** handleAskUserQuestion 处理问题 "Which database?"
- **THEN** 返回的 PermissionResult 应当包含:
  ```json
  {
    "behavior": "allow",
    "updatedInput": {
      "questions": [...],
      "answers": {"Which database?": "PostgreSQL"}
    },
    "toolUseID": "..."
  }
  ```

#### Scenario: 多个问题依次收集答案
- **GIVEN** AskUserQuestion 包含两个问题
- **WHEN** 系统依次显示菜单并收集答案
- **THEN** updatedInput.answers 应当包含两个键值对:
  ```json
  {
    "问题1": "答案1",
    "问题2": "答案2"
  }
  ```

#### Scenario: SDK 用 updatedInput 替换原始 input
- **GIVEN** canUseTool 返回包含 updatedInput 的 PermissionResult
- **WHEN** SDK 执行 AskUserQuestion 工具
- **THEN** 工具应当从 `input.answers` 读取用户答案

### Requirement: 系统应当实现 UI 层和权限逻辑层的完全分离
系统应当通过 PermissionUI 接口将终端交互逻辑与权限检查逻辑解耦。

#### Scenario: PermissionManager 通过接口调用 UI
- **GIVEN** PermissionManager 需要用户确认工具权限
- **WHEN** checkPermissionByMode 需要提示用户
- **THEN** 应当调用 `permissionUI.promptToolPermission(request)`
- **AND** PermissionManager 不应直接操作终端输出

#### Scenario: PermissionUI 接口由 UI 层实现
- **GIVEN** InteractiveUI 初始化
- **WHEN** Application 创建 PermissionManager
- **THEN** 应当将 PermissionUIImpl 实例注入到 PermissionManager 构造函数

#### Scenario: PermissionUIImpl 桥接终端组件
- **GIVEN** PermissionUIImpl.promptToolPermission() 被调用
- **WHEN** 处理权限请求
- **THEN** 应当委托给 PermissionPanel.show()
- **AND** PermissionUIImpl 应当适配返回值格式

### Requirement: 系统应当删除权限历史记录功能
系统应当移除权限历史记录相关代码，简化权限管理。

#### Scenario: PermissionManager 不再维护 permissionHistory
- **GIVEN** PermissionManager 重构完成
- **WHEN** 检查类字段
- **THEN** 应当不存在 `permissionHistory: PermissionRecord[]` 字段

#### Scenario: 移除权限历史相关方法
- **GIVEN** PermissionManager 重构完成
- **WHEN** 检查类方法
- **THEN** 应当不存在以下方法:
  - `recordPermission()`
  - `getPermissionHistory()`
  - `clearPermissionHistory()`

#### Scenario: 移除 PermissionRecord 类型定义
- **GIVEN** 代码库重构完成
- **WHEN** 搜索 `PermissionRecord` 类型引用
- **THEN** 应当不存在该类型的定义或使用

### Requirement: 系统应当删除旧的回调机制
系统应当移除旧的 PromptUserCallback 回调机制，使用 PermissionUI 接口替代。

#### Scenario: PermissionManager 不再使用 promptUserCallback 字段
- **GIVEN** PermissionManager 重构完成
- **WHEN** 检查类字段
- **THEN** 应当不存在 `promptUserCallback` 字段

#### Scenario: 移除 setPromptUserCallback 方法
- **GIVEN** PermissionManager 重构完成
- **WHEN** 检查类方法
- **THEN** 应当不存在 `setPromptUserCallback()` 方法

#### Scenario: Application 不再调用 setPromptUserCallback
- **GIVEN** main.ts 重构完成
- **WHEN** 检查初始化代码
- **THEN** 应当不存在 `permissionManager.setPromptUserCallback()` 调用

### Requirement: 系统应当支持 ANSI 控制码的终端分屏显示
系统应当使用 ANSI 转义序列实现权限面板的独立区域显示。

#### Scenario: 保存和恢复光标位置
- **GIVEN** PermissionPanel.show() 开始执行
- **WHEN** 显示权限面板
- **THEN** 应当先输出 `\x1b[s` 保存光标
- **AND** 面板关闭后输出 `\x1b[u` 恢复光标

#### Scenario: 绝对定位到终端底部
- **GIVEN** 终端高度为 24 行，面板高度为 10 行
- **WHEN** PermissionPanel 计算绘制位置
- **THEN** 应当输出 `\x1b[14;0H` 移动光标到第 14 行第 0 列

#### Scenario: 清除面板区域
- **GIVEN** 用户已确认权限请求
- **WHEN** PermissionPanel.clear() 被调用
- **THEN** 应当从面板起始行到终端底部依次输出 `\x1b[2K` 清除每一行

### Requirement: 系统应当处理终端兼容性问题
系统应当检测终端能力，在不支持高级特性时降级显示。

#### Scenario: 检测 TTY 支持
- **GIVEN** PermissionPanel 初始化
- **WHEN** 检查终端能力
- **THEN** 应当通过 `process.stdout.isTTY` 判断是否为 TTY 环境

#### Scenario: 非 TTY 环境降级为序列显示
- **GIVEN** `process.stdout.isTTY` 返回 false
- **WHEN** PermissionPanel.show() 被调用
- **THEN** 应当使用简单的序列输出模式，不使用 ANSI 控制码

## MODIFIED Requirements

无修改的需求。

## REMOVED Requirements

无移除的需求。

## RENAMED Requirements

无重命名的需求。
