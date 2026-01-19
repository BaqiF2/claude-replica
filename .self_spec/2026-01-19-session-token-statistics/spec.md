# Session 维度 Token 统计功能规格说明

## ADDED Requirements

### Requirement: UsageStats 接口扩展
系统必须扩展 UsageStats 接口，新增 cacheCreationInputTokens 和 cacheReadInputTokens 字段以支持缓存 token 统计。

#### Scenario: UsageStats 包含完整的缓存字段
- **GIVEN** 系统定义 UsageStats 接口
- **WHEN** 接口被使用时
- **THEN** 接口应包含 inputTokens、outputTokens、cacheCreationInputTokens、cacheReadInputTokens 字段
- **AND** cacheCreationInputTokens 和 cacheReadInputTokens 字段类型为 number

---

### Requirement: SessionStats 接口扩展
系统必须扩展 SessionStats 接口，新增 totalCacheCreationInputTokens 和 totalCacheReadInputTokens 字段以支持累计缓存统计。

#### Scenario: SessionStats 包含完整的累计缓存字段
- **GIVEN** 系统定义 SessionStats 接口
- **WHEN** 接口被使用时
- **THEN** 接口应包含 totalCacheCreationInputTokens 和 totalCacheReadInputTokens 字段
- **AND** 这两个字段类型为 number

---

### Requirement: SDKQueryResult 接口扩展
系统必须扩展 SDKQueryResult 接口的 usage 字段，新增 cacheCreationInputTokens 和 cacheReadInputTokens 以从 SDK 响应中传递缓存数据。

#### Scenario: SDKQueryResult.usage 包含缓存字段
- **GIVEN** SDK 返回包含缓存统计的响应
- **WHEN** SDKQueryExecutor 处理响应时
- **THEN** SDKQueryResult.usage 应包含 cacheCreationInputTokens 和 cacheReadInputTokens 字段
- **AND** 字段值从 SDK 响应的 cache_creation_input_tokens 和 cache_read_input_tokens 映射而来

---

### Requirement: SDK 响应缓存字段提取
系统必须在 SDKQueryExecutor.executeStreaming() 方法中从 SDK result 消息提取缓存相关字段。

#### Scenario: 从 SDK result 消息提取缓存字段
- **GIVEN** SDK 返回 result 消息包含 usage 数据
- **WHEN** executeStreaming() 处理 result 消息时
- **THEN** 应提取 cache_creation_input_tokens 并映射为 cacheCreationInputTokens
- **AND** 应提取 cache_read_input_tokens 并映射为 cacheReadInputTokens

#### Scenario: SDK 响应缺少缓存字段时使用默认值
- **GIVEN** SDK 返回的 result 消息 usage 数据缺少缓存字段
- **WHEN** executeStreaming() 处理 result 消息时
- **THEN** cacheCreationInputTokens 应默认为 0
- **AND** cacheReadInputTokens 应默认为 0

---

### Requirement: SessionManager 按消息 ID 去重统计
系统必须在 calculateStats() 方法中按消息 ID 去重，避免相同 ID 的消息被重复计入统计。

#### Scenario: 相同消息 ID 只统计一次
- **GIVEN** 会话中存在多条相同 ID 的消息
- **WHEN** calculateStats() 计算统计数据时
- **THEN** 相同 ID 的消息 usage 只被累加一次
- **AND** 使用 Set 数据结构记录已处理的消息 ID

#### Scenario: 累加所有缓存字段
- **GIVEN** 会话中存在多条不同 ID 的消息
- **WHEN** calculateStats() 计算统计数据时
- **THEN** 应累加所有消息的 cacheCreationInputTokens 到 totalCacheCreationInputTokens
- **AND** 应累加所有消息的 cacheReadInputTokens 到 totalCacheReadInputTokens

---

### Requirement: InteractiveUIRunner 接口扩展
系统必须在 InteractiveUIRunner 接口中新增 getSessionStatsData() 方法声明。

#### Scenario: InteractiveUIRunner 定义 getSessionStatsData 方法
- **GIVEN** 系统定义 InteractiveUIRunner 接口
- **WHEN** 接口被实现时
- **THEN** 应包含 getSessionStatsData(): Promise<SessionStats> 方法声明

---

### Requirement: InteractiveRunner 实现 getSessionStatsData
系统必须在 InteractiveRunner 中实现 getSessionStatsData() 方法，返回当前会话的统计数据。

#### Scenario: 存在活跃会话时返回统计数据
- **GIVEN** 存在活跃会话
- **WHEN** 调用 getSessionStatsData() 时
- **THEN** 应返回包含完整统计数据的 SessionStats 对象
- **AND** 统计数据应包含 totalCacheCreationInputTokens 和 totalCacheReadInputTokens

#### Scenario: 无活跃会话时返回空统计
- **GIVEN** 不存在活跃会话
- **WHEN** 调用 getSessionStatsData() 时
- **THEN** 应返回所有字段为 0 或空字符串的 SessionStats 对象

---

### Requirement: /stats 命令实现
系统必须在 TerminalInteractiveUI 中实现 /stats 命令，显示会话 token 统计信息。

#### Scenario: /stats 命令显示详细统计
- **GIVEN** 用户在交互模式下
- **WHEN** 用户输入 /stats 命令时
- **THEN** 应显示 input tokens、output tokens、cache creation、cache read 统计
- **AND** 应显示缓存命中率（cache_read / input_tokens）

#### Scenario: 缓存命中率计算与显示格式
- **GIVEN** 会话存在 token 统计数据
- **WHEN** 显示缓存命中率时
- **THEN** 命中率计算公式为 cache_read_input_tokens / input_tokens * 100
- **AND** 显示格式为 "cache_read/input_tokens = X%"

#### Scenario: input_tokens 为 0 时命中率显示
- **GIVEN** 会话 totalInputTokens 为 0
- **WHEN** 计算缓存命中率时
- **THEN** 命中率应显示为 "0.0%"

---

### Requirement: /help 命令更新
系统必须更新 /help 命令输出，包含 /stats 命令的说明。

#### Scenario: /help 显示 /stats 命令说明
- **GIVEN** 用户在交互模式下
- **WHEN** 用户输入 /help 命令时
- **THEN** 帮助信息应包含 "/stats - Show session token statistics (including cache breakdown)"

---

### Requirement: 向后兼容性
系统必须保证旧会话数据可正常加载，新增的缓存字段使用默认值 0。

#### Scenario: 加载旧会话数据时缓存字段默认为 0
- **GIVEN** 存在不包含缓存字段的旧会话数据
- **WHEN** 加载并计算统计时
- **THEN** cacheCreationInputTokens 应默认为 0
- **AND** cacheReadInputTokens 应默认为 0
- **AND** 不应抛出错误

## MODIFIED Requirements

无

## REMOVED Requirements

无

## RENAMED Requirements

无
