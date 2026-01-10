# Slash Command迁移到SDK原生支持 - SelfSpec规格说明

## ADDED Requirements（新增需求）

### Requirement: 系统应当完全迁移到SDK原生slash commands支持
系统必须将当前的独立CommandManager实现完全迁移到Claude Agent SDK原生的slash commands功能，不保留任何自定义实现。

#### Scenario: SDK原生slash commands处理流程
- **GIVEN** 用户在`.claude/commands/`目录中创建了符合SDK规范的命令文件
- **WHEN** 用户输入以`/`开头的命令
- **THEN** 系统应当直接将命令和参数传递给SDK处理
- **AND** SDK应当自动识别命令文件并执行相应逻辑
- **AND** 不得经过任何自定义的命令检测或处理逻辑

#### Scenario: 命令文件自动加载
- **GIVEN** 用户创建了`.claude/commands/`目录并放置了`.md`格式的命令文件
- **WHEN** 系统启动或初始化时
- **THEN** SDK应当自动扫描并加载该目录下的所有命令文件
- **AND** 无需额外的应用层配置或初始化代码

### Requirement: 系统应当仅支持`.claude/commands/`目录结构
系统必须只支持SDK标准目录结构，完全移除对其他目录的支持。

#### Scenario: 项目级命令目录支持
- **GIVEN** 用户在项目根目录创建了`.claude/commands/`目录
- **WHEN** 系统处理slash commands时
- **THEN** SDK应当能够找到并加载该目录中的命令文件
- **AND** 不应支持任何其他目录路径

#### Scenario: 不支持旧目录结构
- **GIVEN** 用户在`.claude-replica/commands/`目录中放置了旧格式的命令文件
- **WHEN** 系统处理slash commands时
- **THEN** SDK应当忽略这些文件，不进行任何处理
- **AND** 不应加载或执行这些旧格式的命令文件

### Requirement: 系统应当支持SDK规范的frontmatter字段
系统必须支持Claude Agent SDK规范中定义的frontmatter字段，包括`allowed-tools`、`description`、`model`和`argument-hint`。

#### Scenario: allowed-tools字段支持
- **GIVEN** 命令文件包含`allowed-tools: Read, Grep`的frontmatter
- **WHEN** SDK执行该命令时
- **THEN** SDK应当仅允许该命令使用Read和Grep工具
- **AND** 不允许该命令使用其他工具

#### Scenario: description字段支持
- **GIVEN** 命令文件包含`description: 代码审查`的frontmatter
- **WHEN** 系统显示命令帮助或自动补全时
- **THEN** SDK应当显示该描述信息
- **AND** 描述文本应当正确显示给用户

#### Scenario: argument-hint字段支持
- **GIVEN** 命令文件包含`argument-hint: <file>`的frontmatter
- **WHEN** 用户输入命令时
- **THEN** SDK应当为该命令显示参数提示`<file>`
- **AND** 帮助信息应当包含该提示文本

#### Scenario: model字段支持
- **GIVEN** 命令文件包含`model: sonnet`的frontmatter
- **WHEN** 执行该命令时
- **THEN** SDK应当使用指定的模型（sonnet）处理该命令
- **AND** 该命令应当独立于全局模型设置

### Requirement: 系统应当支持SDK规范的参数占位符
系统必须支持SDK规范的`$1, $2, $3`等参数占位符，移除对`$ARGUMENTS`的支持。

#### Scenario: 单一参数占位符
- **GIVEN** 用户输入命令`/review file.txt`
- **WHEN** SDK处理该命令时
- **THEN** SDK应当将`file.txt`替换到命令模板的`$1`位置
- **AND** 命令模板应当正确包含参数内容

#### Scenario: 多个参数占位符
- **GIVEN** 用户输入命令`/compare file1.txt file2.txt`
- **WHEN** SDK处理该命令时
- **THEN** SDK应当将`file1.txt`替换到`$1`，`file2.txt`替换到`$2`
- **AND** 参数顺序应当保持正确

#### Scenario: 无参数命令
- **GIVEN** 用户输入命令`/status`（不含参数）
- **WHEN** SDK处理该命令时
- **THEN** 命令模板中的`$1, $2, $3`占位符应当保持空白
- **AND** 系统应当正常执行命令（不应报错）

### Requirement: 系统应当简化消息处理流程
系统必须移除应用层的slash commands检测和处理逻辑，简化消息处理流程。

#### Scenario: 简化消息路由
- **GIVEN** 用户输入任何以`/`开头的消息
- **WHEN** 系统接收该消息时
- **THEN** 系统应当立即将消息传递给SDK
- **AND** 不进行任何应用层的命令检测或预处理

#### Scenario: 移除自定义命令管理器
- **GIVEN** 系统初始化时
- **WHEN** 创建Application实例时
- **THEN** 不应当创建或初始化CommandManager
- **AND** 所有与CommandManager相关的代码应当被移除

## MODIFIED Requirements（修改需求）

### Requirement: MessageRouter.getSettingSources()返回配置源
**原有需求**：MessageRouter应当返回当前使用的配置源列表
**修改后**：MessageRouter.getSettingSources()必须返回`['project']`，表示仅支持项目级配置

#### Scenario: 仅支持项目级配置源
- **GIVEN** 系统运行时
- **WHEN** 调用MessageRouter.getSettingSources()方法时
- **THEN** 方法应当返回`['project']`
- **AND** 不应包含'user'或'local'源
- **AND** 表明slash commands仅从项目目录`.claude/commands/`加载

## REMOVED Requirements（移除需求）

### Requirement: 移除独立的CommandManager实现
**原因**：功能已迁移至SDK原生支持，无需应用层自定义实现
**迁移**：用户无需迁移任何代码，SDK会自动处理所有slash commands

#### Scenario: 删除CommandManager类
- **GIVEN** 系统当前代码中包含CommandManager类
- **WHEN** 实施迁移时
- **THEN** 应当完全删除`src/commands/CommandManager.ts`文件
- **AND** 不保留任何CommandManager相关的代码

#### Scenario: 删除CommandManager测试
- **GIVEN** 现有测试包含CommandManager相关测试
- **WHEN** 实施迁移时
- **THEN** 应当删除`tests/commands/CommandManager.test.ts`文件
- **AND** 测试套件不应当包含任何CommandManager测试

### Requirement: 移除旧目录结构支持
**原因**：SDK原生仅支持`.claude/commands/`目录，不支持`.claude-replica/commands/`
**迁移**：用户应将命令文件迁移至`.claude/commands/`目录并使用新格式

#### Scenario: 移除.claude-replica/commands/支持
- **GIVEN** 当前系统支持`.claude-replica/commands/`目录
- **WHEN** 迁移完成后
- **THEN** 系统不应当扫描或加载该目录
- **AND** 放置在该目录的命令文件应当被忽略

### Requirement: 移除$ARGUMENTS参数占位符支持
**原因**：SDK规范使用`$1, $2, $3`占位符，不支持`$ARGUMENTS`
**迁移**：用户需将命令模板中的`$ARGUMENTS`替换为`$1, $2, $3`

#### Scenario: 不支持$ARGUMENTS占位符
- **GIVEN** 命令模板包含`$ARGUMENTS`占位符
- **WHEN** SDK处理该命令时
- **THEN** SDK不应当进行任何参数替换
- **AND** `$ARGUMENTS`文本应当保持原样显示

### Requirement: 移除allowedTools字段支持
**原因**：SDK规范使用`allowed-tools`（连字符），而非`allowedTools`（驼峰命名）
**迁移**：用户需将frontmatter中的`allowedTools`修改为`allowed-tools`

#### Scenario: 不支持驼峰命名字段
- **GIVEN** 命令文件frontmatter包含`allowedTools: Read`
- **WHEN** SDK处理该命令时
- **THEN** SDK不应当识别该字段
- **AND** 工具白名单应当不生效，该命令可使用所有工具

### Requirement: 移除argumentHint字段支持
**原因**：SDK规范使用`argument-hint`（连字符），而非`argumentHint`（驼峰命名）
**迁移**：用户需将frontmatter中的`argumentHint`修改为`argument-hint`

#### Scenario: 不支持argumentHint驼峰命名
- **GIVEN** 命令文件frontmatter包含`argumentHint: <file>`
- **WHEN** SDK处理该命令时
- **THEN** SDK不应当识别该字段
- **AND** 命令不应当显示参数提示信息

### Requirement: 移除命令嵌入语法支持
**原因**：SDK原生不支持`!`command``语法进行命令嵌入
**迁移**：SDK原生支持`!`command``和`@filename`语法，用户无需修改

#### Scenario: 不支持自定义命令嵌入
- **GIVEN** 命令模板包含`!`command``嵌入语法
- **WHEN** 使用SDK原生处理时
- **THEN** SDK不应当执行嵌入的命令
- **AND** 嵌入文本应当保持原样显示（不被执行）

**注意**：SDK原生支持`!`command``和`@filename`语法，无需迁移

## RENAMED Requirements（重命名需求）

无重命名需求
