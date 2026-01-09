# SelfSpec 规格说明：系统提示词配置最佳实践

## ADDED Requirements

### Requirement: SDK 预设系统提示词
系统必须使用 Claude Agent SDK 的 `claude_code` 预设作为基础系统提示词，保留完整的工具指令、安全规则和代码指南。

#### Scenario: 构建系统提示词配置时使用预设格式
- **GIVEN** 应用需要为 SDK 查询构建系统提示词配置
- **WHEN** 调用 `MessageRouter.getSystemPromptOptions()` 方法
- **THEN** 必须返回 `{ type: 'preset', preset: 'claude_code' }` 格式的配置对象
- **AND** 不得使用自定义的字符串作为完整系统提示词

#### Scenario: 无自定义内容时的预设使用
- **GIVEN** 会话中没有加载任何技能或自定义指令
- **WHEN** 构建系统提示词配置
- **THEN** 返回的配置对象必须仅包含 `type` 和 `preset` 字段
- **AND** 不包含 `append` 字段（值为 undefined）

### Requirement: SDK 自动加载 CLAUDE.md
系统必须通过 `settingSources` 配置让 SDK 自动加载项目级 CLAUDE.md 文件，不得在应用层手动加载并拼接。

#### Scenario: 配置 SDK 自动加载项目级配置
- **GIVEN** 应用需要构建 SDK 查询选项
- **WHEN** 调用 `MessageRouter.buildQueryOptions()` 方法
- **THEN** 返回的选项必须包含 `settingSources: ['project']` 字段
- **AND** 不得手动调用 `SDKConfigLoader.loadClaudeMd()` 方法

#### Scenario: 仅支持项目级 CLAUDE.md
- **GIVEN** 系统配置 settingSources
- **WHEN** 调用 `MessageRouter.getSettingSources()` 方法
- **THEN** 必须返回 `['project']` 数组
- **AND** 不得包含 `'user'` 源（不支持用户级 CLAUDE.md）

#### Scenario: SDK 处理不存在的 CLAUDE.md 文件
- **GIVEN** 项目目录中不存在 CLAUDE.md 文件
- **WHEN** SDK 尝试通过 settingSources 加载配置
- **THEN** SDK 应正常处理（不抛出错误）
- **AND** 系统提示词仅包含预设内容和 append 内容

### Requirement: 自定义内容仅通过 append 追加
系统必须将技能和运行时自定义指令通过 `append` 字段追加到系统提示词，不得将 CLAUDE.md 内容包含在 append 中。

#### Scenario: 有技能时构建 append 内容
- **GIVEN** 会话中已加载一个或多个技能
- **WHEN** 调用 `MessageRouter.buildAppendPrompt()` 方法
- **THEN** 必须返回包含所有技能内容的字符串
- **AND** 字符串以 `<!-- Skills Section -->` 标记开始
- **AND** 每个技能使用 `## Skill: {name}` 格式分隔

#### Scenario: 无技能时 append 为空
- **GIVEN** 会话中没有加载任何技能
- **WHEN** 调用 `MessageRouter.buildAppendPrompt()` 方法
- **THEN** 必须返回 `undefined`
- **AND** 系统提示词配置对象不包含 `append` 字段

#### Scenario: append 不包含 CLAUDE.md 内容
- **GIVEN** 项目中存在 CLAUDE.md 文件
- **WHEN** 构建 append 字段内容
- **THEN** append 字符串必须仅包含技能和自定义指令
- **AND** 不得包含 CLAUDE.md 文件的内容（由 SDK 自动加载）

### Requirement: 类型接口支持预设对象格式
系统必须更新相关类型接口以支持系统提示词的预设对象格式和 settingSources 配置。

#### Scenario: QueryOptions 接口支持预设对象
- **GIVEN** MessageRouter 定义 QueryOptions 接口
- **WHEN** 检查 systemPrompt 字段类型
- **THEN** 必须支持联合类型：`string | { type: 'preset'; preset: 'claude_code'; append?: string }`
- **AND** 保持向后兼容字符串格式

#### Scenario: SDKQueryOptions 接口包含 settingSources
- **GIVEN** SDKQueryExecutor 定义 SDKQueryOptions 接口
- **WHEN** 检查接口字段
- **THEN** 必须包含可选字段 `settingSources?: SettingSource[]`
- **AND** 支持 systemPrompt 的预设对象格式

#### Scenario: SDK Options 映射包含 settingSources
- **GIVEN** SDKQueryExecutor 将内部选项映射到 SDK Options
- **WHEN** 调用 `mapToSDKOptions()` 方法且输入包含 settingSources
- **THEN** 返回的 SDK Options 必须包含 `settingSources` 字段
- **AND** 字段值必须完整传递到 SDK

## MODIFIED Requirements

### Requirement: MessageRouter 系统提示词构建逻辑
系统必须通过独立方法构建系统提示词的各个组成部分，而非直接拼接字符串。

#### Scenario: 删除旧的字符串拼接方法
- **GIVEN** MessageRouter 类存在旧的系统提示词构建方法
- **WHEN** 重构系统提示词逻辑
- **THEN** 必须删除 `buildSystemPrompt()` 方法
- **AND** 必须删除 `getDefaultSystemInstructions()` 方法

#### Scenario: 使用新方法构建查询选项
- **GIVEN** 应用需要构建 SDK 查询选项
- **WHEN** 调用 `MessageRouter.buildQueryOptions()` 方法
- **THEN** 必须调用 `getSystemPromptOptions()` 获取系统提示词配置
- **AND** 必须调用 `getSettingSources()` 获取 settingSources 配置
- **AND** 不得调用旧的 `buildSystemPrompt()` 方法

## REMOVED Requirements

（本次变更无移除需求）

## RENAMED Requirements

（本次变更无重命名需求）