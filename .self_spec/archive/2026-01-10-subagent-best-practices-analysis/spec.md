# SubAgent 最佳实践分析与调整规格说明

## ADDED Requirements

### Requirement: 系统应当提供代码中定义的预设 SubAgents
系统必须在代码中提供 6 个预设的 SubAgent 定义,无需用户配置即可使用。

#### Scenario: 加载预设 Agents
- **GIVEN** 用户启动 Claude Replica 应用
- **WHEN** 系统初始化 AgentRegistry
- **THEN** 系统应当自动加载 6 个预设 agents
- **AND** 预设 agents 应当包括: code-reviewer, test-runner, doc-generator, refactoring-specialist, security-auditor, data-analyzer
- **AND** 控制台应当显示 "SubAgents initialized: 6 preset agent(s)"

#### Scenario: 预设 Agent 定义完整性
- **GIVEN** 系统加载的预设 agents
- **WHEN** 检查每个预设 agent 定义
- **THEN** 每个 agent 必须包含 description 字段(长度 > 20 字符)
- **AND** 每个 agent 必须包含 prompt 字段(长度 > 50 字符)
- **AND** 每个 agent 必须包含 tools 数组
- **AND** 每个 agent 必须包含 model 字段(值为 sonnet/opus/haiku/inherit 之一)

#### Scenario: 预设 Agent 工具组合最佳实践
- **GIVEN** 系统加载的预设 agents
- **WHEN** 检查预设 agent 的工具配置
- **THEN** code-reviewer 应当使用只读工具: Read, Grep, Glob
- **AND** test-runner 应当使用测试执行工具: Bash, Read, Grep
- **AND** doc-generator 应当使用文档生成工具: Read, Write, Grep, Glob
- **AND** refactoring-specialist 应当使用代码修改工具: Read, Edit, Write, Grep, Glob
- **AND** security-auditor 应当使用只读分析工具: Read, Grep, Glob 且模型为 opus
- **AND** data-analyzer 应当使用数据处理工具: Read, Bash, Grep, Glob

### Requirement: 系统应当移除基于文件系统的 Agent 加载方式
系统必须完全移除 .agent.md 文件格式支持,不再从文件系统加载 agent 定义。

#### Scenario: 移除 loadAgents 方法
- **GIVEN** AgentRegistry 类
- **WHEN** 查找 loadAgents() 方法
- **THEN** 该方法应当不存在
- **AND** 不应当存在任何扫描 ~/.claude/agents/ 或 .claude/agents/ 目录的代码

#### Scenario: 移除文件解析逻辑
- **GIVEN** AgentRegistry 类
- **WHEN** 查找 parseAgentFile() 方法
- **THEN** 该方法应当不存在
- **AND** 不应当存在任何解析 YAML frontmatter 的代码
- **AND** 不应当存在任何读取 *.agent.md 文件的代码

#### Scenario: 移除目录扫描逻辑
- **GIVEN** Application.loadCustomExtensions() 方法
- **WHEN** 检查方法实现
- **THEN** 不应当调用 agentRegistry.loadAgents()
- **AND** 不应当传递任何目录路径给 AgentRegistry

### Requirement: 系统应当验证并自动修正 Agent 定义以符合 SDK 约束
系统必须验证所有 agent 定义,确保符合 Claude Agent SDK 的约束条件,并自动过滤不合规的配置。

#### Scenario: 过滤子代理中的 Task 工具
- **GIVEN** 一个 agent 定义,其 tools 列表包含 "Task"
- **WHEN** 系统调用 AgentRegistry.validateAgentDefinitions()
- **THEN** 系统应当自动从 tools 列表中移除 "Task"
- **AND** 系统应当在控制台输出警告: "Agent \"{name}\" includes Task tool. SubAgents cannot use Task to prevent nesting. Task has been removed from the tool list."

#### Scenario: 验证必需字段 - description
- **GIVEN** 一个 agent 定义,其 description 为空字符串或仅包含空白字符
- **WHEN** 系统调用 AgentRegistry.validateAgentDefinitions()
- **THEN** 系统应当抛出错误: "Agent definition validation failed: Agent \"{name}\": description is required"

#### Scenario: 验证必需字段 - prompt
- **GIVEN** 一个 agent 定义,其 prompt 为空字符串或仅包含空白字符
- **WHEN** 系统调用 AgentRegistry.validateAgentDefinitions()
- **THEN** 系统应当抛出错误: "Agent definition validation failed: Agent \"{name}\": prompt is required"

#### Scenario: 验证 model 字段有效性
- **GIVEN** 一个 agent 定义,其 model 值为 "invalid-model"
- **WHEN** 系统调用 AgentRegistry.validateAgentDefinitions()
- **THEN** 系统应当将 model 值修正为 "inherit"
- **AND** 系统应当在控制台输出警告: "Agent \"{name}\" has invalid model \"invalid-model\". Valid models: sonnet, opus, haiku, inherit. Defaulting to \"inherit\"."

### Requirement: 系统应当在有 SubAgents 定义时自动启用主代理的 Task 工具
系统必须检测是否有 SubAgents 定义,并在存在 SubAgents 时自动为主代理启用 Task 工具。

#### Scenario: 自动启用 Task 工具
- **GIVEN** 系统中存在至少一个 agent 定义
- **WHEN** MessageRouter 调用 getEnabledToolNames() 方法
- **THEN** 返回的工具列表应当包含 "Task"
- **AND** 系统应当在控制台输出: "Info: Task tool automatically enabled because subAgents are defined. Main agent requires Task tool to delegate work to subagents."

#### Scenario: 无 SubAgents 时不自动添加 Task
- **GIVEN** 系统中不存在任何 agent 定义
- **WHEN** MessageRouter 调用 getEnabledToolNames() 方法
- **THEN** 返回的工具列表不应当自动包含 "Task"(除非用户明确配置)

#### Scenario: 尊重 disallowedTools 配置
- **GIVEN** 系统中存在 agent 定义
- **AND** 配置中 disallowedTools 包含 "Task"
- **WHEN** MessageRouter 调用 getEnabledToolNames() 方法
- **THEN** 返回的工具列表不应当包含 "Task"
- **AND** 系统应当尊重用户的显式禁用配置

### Requirement: 系统应当提供 PresetAgents 模块导出预设 Agent 定义
系统必须创建独立的 PresetAgents 模块,提供获取预设 agents 的函数接口。

#### Scenario: 导出 getPresetAgents 函数
- **GIVEN** PresetAgents 模块
- **WHEN** 调用 getPresetAgents()
- **THEN** 应当返回包含 6 个 agent 定义的 Record 对象
- **AND** 返回的对象应当是新创建的副本(而非原始对象引用)

#### Scenario: 导出 getPresetAgentNames 函数
- **GIVEN** PresetAgents 模块
- **WHEN** 调用 getPresetAgentNames()
- **THEN** 应当返回包含 6 个 agent 名称的字符串数组
- **AND** 数组应当包括: "code-reviewer", "test-runner", "doc-generator", "refactoring-specialist", "security-auditor", "data-analyzer"

#### Scenario: 导出 isPresetAgent 函数
- **GIVEN** PresetAgents 模块
- **WHEN** 调用 isPresetAgent("code-reviewer")
- **THEN** 应当返回 true
- **AND** 调用 isPresetAgent("non-existent-agent") 应当返回 false

### Requirement: 系统应当简化 AgentRegistry 实现为仅返回预设 Agents
系统必须重构 AgentRegistry 类,移除所有文件加载逻辑,仅返回预设 agents。

#### Scenario: getAll 方法返回预设 Agents
- **GIVEN** 已初始化的 AgentRegistry 实例
- **WHEN** 调用 registry.getAll()
- **THEN** 应当返回恰好 6 个 agent 定义
- **AND** 返回的 agents 应当与 getPresetAgents() 的结果一致

#### Scenario: getAgent 方法返回指定 Agent
- **GIVEN** 已初始化的 AgentRegistry 实例
- **WHEN** 调用 registry.getAgent("code-reviewer")
- **THEN** 应当返回 code-reviewer 的 agent 定义
- **AND** 调用 registry.getAgent("non-existent") 应当返回 undefined

#### Scenario: getAgentsForSDK 方法返回 SDK 格式
- **GIVEN** 已初始化的 AgentRegistry 实例
- **WHEN** 调用 registry.getAgentsForSDK()
- **THEN** 应当返回 Record<string, AgentDefinition> 格式的对象
- **AND** 返回的对象可直接传递给 SDK query() 选项

## MODIFIED Requirements

无修改需求 - 此为全新功能实现,不涉及修改现有需求。

## REMOVED Requirements

### Requirement: 系统应当从文件系统加载 .agent.md 格式的 Agent 定义
**Reason**: 从文件系统方式迁移到程序化定义方式,以完全符合 Claude Agent SDK 官方推荐的最佳实践。文件系统方式存在架构不符、配置分散、缺少预设等问题。

**Migration**:
- 现有 .agent.md 文件可通过 settings.json 的 agents 字段配置(未来可能支持)
- 系统提供 6 个预设 agents 覆盖常见场景,用户无需手动创建 agent 文件
- 参考 docs/migration-from-agent-md.md 获取详细迁移指南

## RENAMED Requirements

无重命名需求 - 此为全新功能实现,不涉及重命名现有需求。
