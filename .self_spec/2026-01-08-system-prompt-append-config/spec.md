## ADDED Requirements

### Requirement: Claude Code Preset System Prompt
系统必须（SHALL）通过 `{ type: 'preset', preset: 'claude_code' }` 方式向 Claude Agent SDK 提供系统提示词，禁止继续拼接自定义基础指令串。

#### Scenario: 构建 Query Options
- **GIVEN** MessageRouter 需要生成查询配置
- **WHEN** 调用 `getSystemPromptOptions(session)`
- **THEN** 返回值包含 `type: 'preset'` 与 `preset: 'claude_code'`
- **AND** 不再调用 `buildSystemPrompt()` 或 `getDefaultSystemInstructions()` 这种手动拼接函数

### Requirement: Project-Only CLAUDE.md Loading
系统必须（SHALL）仅通过 `settingSources: ['project']` 让 SDK 自动加载项目根目录下的 CLAUDE.md，不得读取 `~/.claude/CLAUDE.md` 等用户级配置。

#### Scenario: 发起 SDK 查询
- **GIVEN** MessageRouter 调用 `buildQueryOptions()`
- **WHEN** 生成的选项传入 SDK
- **THEN** `settingSources` 精确等于 `['project']`
- **AND** 系统未主动读取或拼接任何用户级 CLAUDE.md 内容

### Requirement: Append Prompt Content Scope
系统必须（SHALL）只在 `append` 字段中放入技能提示和其他运行时动态指令，不得把 CLAUDE.md 或基础系统提示词的内容复制进去。

#### Scenario: 构建 Append 内容
- **GIVEN** Session 启用了一个技能
- **WHEN** 调用 `buildAppendPrompt(session)`
- **THEN** 返回值只包含技能 Markdown/指令
- **AND** 当无技能或动态指令时返回 `undefined`（或不设置 `append`）

### Requirement: Query Options Refactor
系统必须（SHALL）在 MessageRouter 内提供新的辅助方法以支撑上述配置，包括 `getSystemPromptOptions()`、`buildAppendPrompt()` 与 `getSettingSources()`，并在 `buildQueryOptions()` 中统一使用这些方法。

#### Scenario: Query Options 结构
- **GIVEN** MessageRouter 构建一次完整查询
- **WHEN** `buildQueryOptions(session, query)` 被调用
- **THEN** 结果对象包含 `systemPrompt`（引用 `getSystemPromptOptions()` 输出）
- **AND** 包含 `settingSources`（引用 `getSettingSources()` 输出）
- **AND** 旧的 `buildSystemPrompt()`、`getDefaultSystemInstructions()` 已被移除
