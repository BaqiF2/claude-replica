# 会话管理系统重构规格说明

## ADDED Requirements

### Requirement: 会话统计信息计算
系统必须自动计算并缓存每个会话的统计信息，包括消息总数、token 使用量和成本。

#### Scenario: 保存会话时自动计算统计信息
- **GIVEN** 一个包含多条消息的会话对象
- **WHEN** 调用 `SessionManager.saveSession()` 方法
- **THEN** 系统必须自动调用 `calculateStats()` 计算统计信息
- **AND** 统计信息必须包含在 `session.stats` 字段中
- **AND** 统计信息必须持久化到 `metadata.json` 文件

#### Scenario: 统计信息包含完整数据
- **GIVEN** 一个包含消息历史的会话
- **WHEN** 调用 `calculateStats()` 方法
- **THEN** 返回的 `SessionStats` 对象必须包含 `messageCount`、`totalInputTokens`、`totalOutputTokens`、`totalCostUsd`
- **AND** 必须包含 `lastMessagePreview` 字段（最后一条消息的前 80 字符）

#### Scenario: 向后兼容旧会话
- **GIVEN** 一个缺少 `stats` 字段的旧会话文件
- **WHEN** 调用 `loadSession()` 加载会话
- **THEN** 系统不得抛出错误
- **AND** 下次调用 `saveSession()` 时必须自动补充 `stats` 字段

---

### Requirement: 会话分叉功能
系统必须支持从现有会话创建新的分支会话，复制消息历史和上下文，但生成独立的会话 ID。

#### Scenario: 成功分叉会话
- **GIVEN** 一个存在的源会话 ID
- **WHEN** 调用 `SessionManager.forkSession(sourceSessionId)`
- **THEN** 系统必须创建新会话对象
- **AND** 新会话必须深拷贝源会话的 `messages` 数组
- **AND** 新会话必须深拷贝源会话的 `context` 对象
- **AND** 新会话的 `parentSessionId` 必须设置为源会话 ID
- **AND** 新会话必须拥有新生成的会话 ID
- **AND** 新会话不得复制 `sdkSessionId` 字段
- **AND** 新会话不得复制 `snapshots` 目录

#### Scenario: 分叉不存在的会话
- **GIVEN** 一个不存在的会话 ID
- **WHEN** 调用 `SessionManager.forkSession(invalidId)`
- **THEN** 系统必须抛出错误
- **AND** 错误消息必须说明源会话不存在

#### Scenario: 分叉会话持久化
- **GIVEN** 一个成功分叉的会话对象
- **WHEN** 系统保存该会话到磁盘
- **THEN** `metadata.json` 必须包含 `parentSessionId` 字段
- **AND** `messages.json` 必须包含完整的消息历史副本
- **AND** `context.json` 必须包含完整的上下文副本

---

### Requirement: 最近会话列表查询
系统必须提供查询最近 N 个会话的功能，按创建时间倒序排列。

#### Scenario: 获取最近 10 个会话
- **GIVEN** 系统中存在超过 10 个会话
- **WHEN** 调用 `SessionManager.listRecentSessions(10)`
- **THEN** 系统必须返回 10 个会话对象
- **AND** 会话必须按 `createdAt` 倒序排列（最新在前）

#### Scenario: 会话数量少于限制
- **GIVEN** 系统中仅存在 5 个会话
- **WHEN** 调用 `SessionManager.listRecentSessions(10)`
- **THEN** 系统必须返回所有 5 个会话
- **AND** 不得抛出错误或返回空列表

#### Scenario: 空会话列表
- **GIVEN** 系统中不存在任何会话
- **WHEN** 调用 `SessionManager.listRecentSessions(10)`
- **THEN** 系统必须返回空数组

---

### Requirement: 会话恢复交互菜单
系统必须在交互模式中提供会话选择菜单，允许用户通过编号或键盘导航选择要恢复的会话。

#### Scenario: 显示会话菜单
- **GIVEN** 系统中存在多个会话
- **WHEN** 调用 `InteractiveUI.showSessionMenu(sessions)`
- **THEN** 系统必须在终端显示编号列表（1-N）
- **AND** 每个会话条目必须显示会话 ID 前 8 位
- **AND** 每个会话条目必须显示相对时间（如"2小时前"）
- **AND** 每个会话条目必须显示绝对时间（如"2026-01-12 14:30:15"）
- **AND** 每个会话条目必须显示最后一条消息的前 80 字符预览
- **AND** 每个会话条目必须显示统计摘要（消息数、token 数、成本）
- **AND** 菜单必须包含选项 `[0] 取消`

#### Scenario: 用户选择有效会话
- **GIVEN** 会话菜单正在显示
- **WHEN** 用户输入有效编号（1-N）并按 Enter
- **THEN** 系统必须返回对应的会话对象
- **AND** 不得返回 null

#### Scenario: 用户取消选择
- **GIVEN** 会话菜单正在显示
- **WHEN** 用户输入 0 或按 Esc 键
- **THEN** 系统必须返回 null
- **AND** 不得执行任何会话切换操作

#### Scenario: 显示分叉会话标记
- **GIVEN** 会话列表中包含至少一个分叉会话（存在 `parentSessionId`）
- **WHEN** 调用 `showSessionMenu(sessions)`
- **THEN** 分叉会话条目必须在开头显示 🔀 标记
- **AND** 非分叉会话不得显示该标记

#### Scenario: 无效输入处理
- **GIVEN** 会话菜单正在显示
- **WHEN** 用户输入超出范围的编号（如负数或 > N）
- **THEN** 系统必须显示错误提示
- **AND** 必须重新等待用户输入
- **AND** 不得返回或崩溃

---

### Requirement: /resume Slash Command
系统必须在交互模式中提供 `/resume` 命令，允许用户通过交互菜单恢复历史会话。

#### Scenario: 成功恢复会话
- **GIVEN** 用户在交互模式中
- **AND** 系统中存在至少一个会话
- **WHEN** 用户输入 `/resume` 命令
- **THEN** 系统必须调用 `showSessionMenu()` 显示会话列表
- **AND** 当用户选择会话后，必须调用 `loadSession(selectedId)` 加载会话
- **AND** 必须调用 `StreamingQueryManager.endSession()` 结束当前会话
- **AND** 必须调用 `StreamingQueryManager.startSession(loaded)` 启动新会话
- **AND** 必须显示成功提示消息，包含会话 ID 前缀和消息数量

#### Scenario: 无可用会话
- **GIVEN** 用户在交互模式中
- **AND** 系统中不存在任何会话
- **WHEN** 用户输入 `/resume` 命令
- **THEN** 系统必须显示 "没有可用的会话" 提示
- **AND** 不得显示会话菜单
- **AND** 不得执行任何会话切换操作

#### Scenario: 非交互模式警告
- **GIVEN** 用户在非交互模式中
- **WHEN** 尝试执行 `/resume` 命令
- **THEN** 系统必须显示警告消息
- **AND** 不得执行任何操作

#### Scenario: 用户取消恢复
- **GIVEN** 用户在交互模式中执行 `/resume`
- **AND** 会话菜单已显示
- **WHEN** 用户按 Esc 或输入 0 取消
- **THEN** 系统必须返回当前会话
- **AND** 不得执行任何会话切换操作

---

### Requirement: /fork Slash Command
系统必须在交互模式中提供 `/fork` 命令，允许用户分叉当前活动会话并切换到新会话。

#### Scenario: 成功分叉当前会话
- **GIVEN** 用户在交互模式中
- **AND** 存在活动会话
- **WHEN** 用户输入 `/fork` 命令
- **THEN** 系统必须调用 `forkSession(currentSessionId)` 创建新会话
- **AND** 必须调用 `saveSession(current)` 保存原会话
- **AND** 必须调用 `StreamingQueryManager.endSession()` 结束当前会话
- **AND** 必须调用 `StreamingQueryManager.startSession(forked)` 启动新会话
- **AND** 必须显示成功提示，包含新会话 ID 和父会话 ID

#### Scenario: 无活动会话
- **GIVEN** 用户在交互模式中
- **AND** 不存在活动会话
- **WHEN** 用户输入 `/fork` 命令
- **THEN** 系统必须显示 "当前没有活动会话，无法分叉" 提示
- **AND** 不得执行任何操作

#### Scenario: 非交互模式警告
- **GIVEN** 用户在非交互模式中
- **WHEN** 尝试执行 `/fork` 命令
- **THEN** 系统必须显示警告消息
- **AND** 不得执行任何操作

---

### Requirement: 自动会话清理
系统必须在启动时自动清理旧会话，保留最近 N 个（默认 10 个）。

#### Scenario: 启动时清理旧会话
- **GIVEN** 系统中存在超过 10 个会话
- **WHEN** 调用 `Application.initialize()`
- **THEN** 系统必须调用 `SessionManager.cleanOldSessions(10)`
- **AND** 必须删除创建时间最早的会话（保留最近 10 个）
- **AND** 不得删除当前活动会话

#### Scenario: 通过环境变量配置保留数量
- **GIVEN** 环境变量 `SESSION_KEEP_COUNT=5`
- **WHEN** 调用 `Application.initialize()`
- **THEN** 系统必须保留最近 5 个会话
- **AND** 删除其余旧会话

#### Scenario: 会话数量少于保留数量
- **GIVEN** 系统中仅存在 5 个会话
- **AND** 保留数量设置为 10
- **WHEN** 调用 `cleanOldSessions(10)`
- **THEN** 系统不得删除任何会话
- **AND** 不得抛出错误

---

### Requirement: 非交互模式无持久化
系统必须在非交互模式中使用临时会话对象，查询完成后不得持久化会话。

#### Scenario: 非交互模式执行查询
- **GIVEN** 用户以非交互模式启动（使用 `-p` 参数）
- **WHEN** 系统执行查询
- **THEN** 系统必须创建临时会话对象（ID 格式为 `temp-{timestamp}`）
- **AND** 必须将用户消息添加到临时会话
- **AND** 必须使用临时会话执行查询
- **AND** 查询完成后不得调用 `saveSession()`
- **AND** 不得在磁盘上创建会话目录

#### Scenario: 非交互模式输出结果
- **GIVEN** 非交互模式查询已完成
- **WHEN** 系统准备输出结果
- **THEN** 系统必须调用 `OutputFormatter.format(result)` 输出结果
- **AND** 不得保存任何会话数据
- **AND** 返回值必须为 0（成功）或 1（错误）

---

### Requirement: 会话元数据扩展
系统必须扩展会话元数据结构，支持 `parentSessionId` 和 `stats` 字段。

#### Scenario: 持久化包含扩展字段
- **GIVEN** 一个包含 `parentSessionId` 和 `stats` 字段的会话对象
- **WHEN** 调用 `saveSession()` 方法
- **THEN** `metadata.json` 必须包含 `parentSessionId` 字段
- **AND** `metadata.json` 必须包含完整的 `stats` 对象
- **AND** 所有字段必须正确序列化为 JSON

#### Scenario: 加载包含扩展字段的会话
- **GIVEN** 磁盘上存在包含 `parentSessionId` 和 `stats` 的 `metadata.json`
- **WHEN** 调用 `loadSession()` 方法
- **THEN** 返回的 `Session` 对象必须包含 `parentSessionId` 字段
- **AND** 返回的 `Session` 对象必须包含 `stats` 字段
- **AND** 所有字段值必须与磁盘数据一致

---

### Requirement: UI 辅助格式化方法
系统必须提供时间和统计信息的格式化方法，用于会话菜单显示。

#### Scenario: 相对时间格式化
- **GIVEN** 一个 2 小时前的日期对象
- **WHEN** 调用 `InteractiveUI.formatRelativeTime(date)`
- **THEN** 必须返回 "2小时前" 字符串

#### Scenario: 绝对时间格式化
- **GIVEN** 日期对象 `2026-01-12 14:30:15`
- **WHEN** 调用 `InteractiveUI.formatAbsoluteTime(date)`
- **THEN** 必须返回 "2026-01-12 14:30:15" 字符串

#### Scenario: 统计摘要格式化
- **GIVEN** `SessionStats` 对象包含 `messageCount=5, totalInputTokens=800, totalOutputTokens=400, totalCostUsd=0.0015`
- **WHEN** 调用 `InteractiveUI.formatStatsSummary(stats)`
- **THEN** 必须返回 "(5 条消息, 1.2k tokens, $0.0015)" 格式的字符串

#### Scenario: 缺少统计信息时的格式化
- **GIVEN** `stats` 参数为 undefined
- **WHEN** 调用 `formatStatsSummary(stats)`
- **THEN** 必须返回 "(无统计信息)" 或类似占位符字符串

---

## REMOVED Requirements

### Requirement: CLI 参数 --resume
**Reason**: 与新的交互式会话管理模式不一致，用户应使用 `/resume` Slash Command 替代。

**Migration**: 用户应在交互模式中使用 `/resume` 命令恢复会话，而非通过 CLI 参数指定会话 ID。

---

### Requirement: CLI 参数 --continue
**Reason**: 与新的交互式会话管理模式不一致，用户应使用 `/resume` Slash Command 替代。

**Migration**: 用户应在交互模式中使用 `/resume` 命令选择最近的会话，而非通过 `-c` 参数自动继续。

---

### Requirement: CLI 参数 --fork
**Reason**: 与新的交互式会话管理模式不一致，用户应使用 `/fork` Slash Command 替代。

**Migration**: 用户应在交互模式中使用 `/fork` 命令分叉当前会话，而非通过 CLI 参数启动时分叉。

---

### Requirement: 非交互模式会话持久化
**Reason**: 简化架构，专注于交互模式的会话管理。非交互模式通常用于一次性查询，无需保存历史。

**Migration**: 用户在非交互模式中执行的查询将不再创建会话文件。如需保存历史，请使用交互模式。

---

### Requirement: 会话过期机制（基于时间）
**Reason**: 新架构采用基于创建时间的自动清理机制（保留最近 N 个），时间过期机制不再需要。

**Migration**: 会话将按创建时间自动清理，无需用户配置过期时间。如需调整保留数量，请设置 `SESSION_KEEP_COUNT` 环境变量。

---

## MODIFIED Requirements

无需修改现有需求。所有变更均为新增或移除需求。

---

## RENAMED Requirements

无需重命名现有需求。
