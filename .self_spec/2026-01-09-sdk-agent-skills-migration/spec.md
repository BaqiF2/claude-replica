# SelfSpec - SDK Agent Skills 迁移

## ADDED Requirements（新增需求）

### Requirement: SDK Skills 自动发现
系统必须通过 SDK 的 settingSources 配置自动发现项目级 Skills，而非手动加载。

#### Scenario: 启动时自动发现项目 Skills
- **GIVEN** 项目根目录下存在 `.claude/skills/` 目录
- **WHEN** 系统初始化 MessageRouter 并构建查询选项
- **THEN** `settingSources` 必须包含 `'project'`
- **AND** SDK 必须能自动发现 `.claude/skills/` 下的所有 SKILL.md 文件

#### Scenario: 不再手动加载 Skills
- **GIVEN** 系统启动过程
- **WHEN** 执行 `loadExtensions()` 方法
- **THEN** 不应调用 SkillManager 的任何方法
- **AND** 不应手动读取或解析 SKILL.md 文件

### Requirement: Skill 工具启用
系统必须在 allowedTools 中包含 Skill 工具，以支持 SDK Skills 功能。

#### Scenario: ToolRegistry 注册 Skill 工具
- **GIVEN** ToolRegistry 初始化
- **WHEN** 调用 `initializeToolMetadata()` 方法
- **THEN** 必须注册名为 'Skill' 的工具
- **AND** 该工具的 category 必须为 `ToolCategory.AGENT`
- **AND** 该工具的 dangerous 属性必须为 `false`

#### Scenario: 默认启用 Skill 工具
- **GIVEN** 任意会话上下文
- **WHEN** 调用 `getEnabledToolNames()` 方法
- **THEN** 返回的工具列表必须包含 'Skill'
- **AND** 即使配置中未显式指定，也应自动添加

#### Scenario: 允许通过 disallowedTools 禁用
- **GIVEN** 配置中 `disallowedTools` 包含 'Skill'
- **WHEN** 调用 `getEnabledToolNames()` 方法
- **THEN** 返回的工具列表不应包含 'Skill'

### Requirement: 移除 Skills 系统提示词注入
系统不应将 Skills 内容追加到系统提示词，而是由 SDK 按需加载。

#### Scenario: buildAppendPrompt 返回 undefined
- **GIVEN** 任意会话上下文
- **WHEN** 调用 `buildAppendPrompt()` 方法
- **THEN** 必须返回 `undefined`
- **AND** 不应包含任何 Skills 相关内容

#### Scenario: 不构建 Skills 提示词字符串
- **GIVEN** MessageRouter 实例
- **WHEN** 检查其方法列表
- **THEN** 不应存在 `buildSkillsPrompt()` 方法

### Requirement: 移除 Skills 工具提取逻辑
系统不应从 Skills 的 tools 字段提取工具列表，因为该字段在 SDK 中无效。

#### Scenario: 不提取 Skills tools 字段
- **GIVEN** MessageRouter 实例
- **WHEN** 检查其方法列表
- **THEN** 不应存在 `getSkillTools()` 方法

#### Scenario: getEnabledToolNames 不依赖 loadedSkills
- **GIVEN** 任意会话上下文
- **WHEN** 调用 `getEnabledToolNames()` 方法
- **THEN** 不应访问 `session.context.loadedSkills` 字段
- **AND** 不应基于 Skills 的 tools 字段修改工具列表

### Requirement: 移除 SkillManager 依赖
系统必须完全移除 SkillManager 类及其所有使用。

#### Scenario: Main 模块不导入 SkillManager
- **GIVEN** `src/main.ts` 文件
- **WHEN** 检查导入语句
- **THEN** 不应包含 `import { SkillManager } from './skills/SkillManager'`

#### Scenario: Main 类不持有 SkillManager 实例
- **GIVEN** Main 类定义
- **WHEN** 检查实例变量
- **THEN** 不应存在 `skillManager` 属性
- **AND** 构造函数中不应初始化 SkillManager

#### Scenario: loadExtensions 不调用 SkillManager
- **GIVEN** `loadExtensions()` 方法实现
- **WHEN** 执行该方法
- **THEN** 不应调用 `skillManager.loadSkills()`
- **AND** 方法体应为空或仅包含注释

### Requirement: 移除 Skill 类型定义
系统不应在 SessionManager 中定义或引用 Skill 接口。

#### Scenario: SessionManager 不导出 Skill 接口
- **GIVEN** `src/core/SessionManager.ts` 文件
- **WHEN** 检查导出的类型定义
- **THEN** 不应存在 `export interface Skill`

#### Scenario: SessionContext 不包含 loadedSkills 字段
- **GIVEN** `SessionContext` 接口定义
- **WHEN** 检查接口字段
- **THEN** 不应存在 `loadedSkills: Skill[]` 字段

### Requirement: 公共 API 清理
系统的公共 API 不应暴露 SkillManager 相关导出。

#### Scenario: index.ts 不导出 SkillManager
- **GIVEN** `src/index.ts` 文件
- **WHEN** 检查导出语句
- **THEN** 不应包含 `export { SkillManager, Skill, SkillManagerConfig } from './skills'`

### Requirement: 移除 Skills 实现文件
系统必须删除所有 SkillManager 相关的源代码和测试文件。

#### Scenario: 删除 Skills 源代码目录
- **GIVEN** 文件系统
- **WHEN** 检查 `src/skills/` 目录
- **THEN** 该目录不应存在
- **AND** 不应存在 `src/skills/SkillManager.ts` 文件
- **AND** 不应存在 `src/skills/index.ts` 文件

#### Scenario: 删除 Skills 测试目录
- **GIVEN** 文件系统
- **WHEN** 检查 `tests/skills/` 目录
- **THEN** 该目录不应存在
- **AND** 不应存在 `tests/skills/SkillManager.test.ts` 文件

### Requirement: 现有 Skills 兼容性
现有的 SKILL.md 文件必须在 SDK 环境中正常工作，无需修改。

#### Scenario: Skills 包含必需的 description 字段
- **GIVEN** `.claude/skills/*/SKILL.md` 文件
- **WHEN** 检查文件的 frontmatter
- **THEN** 所有文件必须包含 `description` 字段
- **AND** `description` 应详细描述 Skill 的功能和适用场景

#### Scenario: Skills 使用有效的 frontmatter 格式
- **GIVEN** `.claude/skills/*/SKILL.md` 文件
- **WHEN** SDK 解析文件
- **THEN** frontmatter 必须使用 YAML 格式
- **AND** 格式必须符合 SDK 规范（三横线包围）

### Requirement: 测试覆盖更新
测试套件必须反映新的 SDK Skills 架构。

#### Scenario: MessageRouter 测试更新
- **GIVEN** `tests/core/MessageRouter.test.ts` 文件
- **WHEN** 运行测试套件
- **THEN** `buildAppendPrompt` 测试必须验证返回 `undefined`
- **AND** `getEnabledToolNames` 测试必须验证包含 'Skill' 工具
- **AND** 不应存在 `buildSkillsPrompt` 或 `getSkillTools` 的测试

#### Scenario: ToolRegistry 测试新增 Skill 工具验证
- **GIVEN** `tests/tools/ToolRegistry.test.ts` 文件
- **WHEN** 运行测试套件
- **THEN** 必须验证 'Skill' 工具已注册
- **AND** 必须验证 Skill 工具的 category 为 AGENT
- **AND** 必须验证 Skill 工具的 dangerous 属性为 false

#### Scenario: 集成测试覆盖 SDK Skills
- **GIVEN** `tests/integration/sdk-agent-skills.test.ts` 文件
- **WHEN** 运行集成测试
- **THEN** 必须验证 settingSources 包含 'project'
- **AND** 必须验证 allowedTools 包含 'Skill'
- **AND** 必须验证 buildAppendPrompt 返回 undefined
- **AND** 必须在临时目录中测试 Skills 发现功能

#### Scenario: SessionManager 测试移除 Skill 相关用例
- **GIVEN** `tests/core/SessionManager.test.ts` 文件
- **WHEN** 检查测试用例
- **THEN** 不应存在涉及 `loadedSkills` 字段的测试
- **AND** 不应存在涉及 `Skill` 接口的测试

## MODIFIED Requirements（修改需求）

无修改需求 - 这是全新功能迁移

## REMOVED Requirements（移除需求）

### Requirement: 手动 Skills 加载
**Reason**：已迁移到 SDK 官方 Agent Skills API，不再需要手动加载机制

**Migration**：
- 移除所有 `SkillManager.loadSkills()` 调用
- 确保 MessageRouter 配置中包含 `settingSources: ['project']`
- 确保 `allowedTools` 包含 'Skill'
- 现有 SKILL.md 文件无需修改

### Requirement: Skills 提示词构建
**Reason**：SDK 按需加载 Skills 内容，不再需要全部注入系统提示词

**Migration**：
- 移除 `buildSkillsPrompt()` 方法的所有调用
- `buildAppendPrompt()` 现在返回 `undefined`
- Skills 仍会被 Claude 自动识别和使用

### Requirement: Skills 工具字段支持
**Reason**：SDK 中 Skills 的 `tools` 字段无效，工具控制通过主配置的 `allowedTools` 完成

**Migration**：
- 从 SKILL.md 的 frontmatter 中移除 `tools` 字段（可选，不影响功能）
- 在主配置中通过 `allowedTools` 控制可用工具
- 不再使用 `getSkillTools()` 方法

## RENAMED Requirements（重命名需求）

无重命名需求
