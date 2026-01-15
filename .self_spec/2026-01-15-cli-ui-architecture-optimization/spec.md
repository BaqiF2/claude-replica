# CLI与UI分层架构优化规格说明

**项目**: Claude Replica CLI优化
**版本**: 2.0.0
**日期**: 2026-01-15
**状态**: 规格说明

---

## ADDED Requirements（新增需求）

### Requirement: Parser抽象接口定义
系统必须定义ParserInterface抽象接口,用于解耦CLI参数解析与业务逻辑的直接依赖关系。

#### Scenario: 定义ParserInterface核心方法
- **GIVEN** 需要抽象CLI参数解析能力
- **WHEN** 创建ParserInterface接口文件
- **THEN** 接口必须包含parse(args: string[]): OptionsInterface方法
- **AND** 接口必须包含getHelpText(): string方法
- **AND** 接口必须包含getVersionText(): string方法

#### Scenario: 定义OptionsInterface通用结构
- **GIVEN** 需要抽象CLI选项结构
- **WHEN** 创建OptionsInterface接口文件
- **THEN** 接口必须包含help: boolean属性
- **AND** 接口必须包含version: boolean属性
- **AND** 接口必须包含debug: boolean属性
- **AND** 接口必须支持[key: string]: unknown扩展属性

#### Scenario: 确保接口无外部依赖
- **GIVEN** ParserInterface和OptionsInterface已定义
- **WHEN** 检查接口文件的import声明
- **THEN** ParserInterface不得依赖任何外部模块
- **AND** OptionsInterface不得依赖任何外部模块

### Requirement: Output输出抽象接口定义
系统必须定义OutputInterface抽象接口,用于解耦CLI输出与console的直接依赖关系。

#### Scenario: 定义基础输出方法
- **GIVEN** 需要抽象CLI输出能力
- **WHEN** 创建OutputInterface接口文件
- **THEN** 接口必须包含info(message: string, options?: OutputOptions): void方法
- **AND** 接口必须包含warn(message: string, options?: OutputOptions): void方法
- **AND** 接口必须包含error(message: string, options?: OutputOptions): void方法
- **AND** 接口必须包含success(message: string, options?: OutputOptions): void方法

#### Scenario: 定义格式化输出方法
- **GIVEN** 需要支持结构化输出
- **WHEN** 扩展OutputInterface接口
- **THEN** 接口必须包含section(title: string, options?: OutputOptions): void方法
- **AND** 接口必须包含blankLine(count?: number): void方法

#### Scenario: 支持输出格式化选项
- **GIVEN** 需要支持颜色、缩进等格式化功能
- **WHEN** 定义OutputOptions类型
- **THEN** OutputOptions必须支持颜色配置
- **AND** OutputOptions必须支持时间戳配置
- **AND** OutputOptions必须支持缩进级别配置

### Requirement: UIFactory统一工厂接口定义
系统必须定义UIFactory抽象接口,用于统一管理Parser和Output的创建。

#### Scenario: 定义UIFactory核心方法
- **GIVEN** 需要统一管理Parser和Output创建
- **WHEN** 创建UIFactory接口文件
- **THEN** 接口必须包含createParser(): ParserInterface方法
- **AND** 接口必须包含createOutput(): OutputInterface方法

#### Scenario: 确保工厂接口仅依赖抽象
- **GIVEN** UIFactory接口已定义
- **WHEN** 检查接口依赖
- **THEN** UIFactory仅依赖ParserInterface抽象
- **AND** UIFactory仅依赖OutputInterface抽象
- **AND** UIFactory不得依赖具体实现类

### Requirement: TerminalParser默认实现
系统必须提供TerminalParser作为ParserInterface的Terminal环境默认实现,保持与现有CLIParser的100%兼容性。

#### Scenario: 实现ParserInterface接口
- **GIVEN** ParserInterface抽象接口已定义
- **WHEN** 创建TerminalParser类
- **THEN** TerminalParser必须实现ParserInterface接口
- **AND** parse方法必须委托给现有CLIParser.parse
- **AND** getHelpText方法必须委托给现有CLIParser.getHelpText
- **AND** getVersionText方法必须委托给现有CLIParser.getVersionText

#### Scenario: 保持向后兼容性
- **GIVEN** TerminalParser已实现
- **WHEN** 使用TerminalParser解析CLI参数
- **THEN** 解析结果必须与CLIParser完全一致
- **AND** 帮助文本格式必须与CLIParser完全一致
- **AND** 版本文本格式必须与CLIParser完全一致

#### Scenario: 最小依赖原则
- **GIVEN** TerminalParser已实现
- **WHEN** 检查TerminalParser的依赖
- **THEN** 仅依赖ParserInterface抽象
- **AND** 仅依赖现有CLIParser实现
- **AND** 不依赖SessionManager或ConfigManager等子系统

### Requirement: TerminalOutput默认实现
系统必须提供TerminalOutput作为OutputInterface的Terminal环境默认实现,保持与现有console输出的100%兼容性。

#### Scenario: 实现OutputInterface接口
- **GIVEN** OutputInterface抽象接口已定义
- **WHEN** 创建TerminalOutput类
- **THEN** TerminalOutput必须实现OutputInterface接口
- **AND** info方法必须委托给console.log
- **AND** warn方法必须委托给console.warn
- **AND** error方法必须委托给console.error
- **AND** success方法必须委托给console.log

#### Scenario: 实现格式化输出方法
- **GIVEN** OutputInterface定义了section和blankLine方法
- **WHEN** 实现TerminalOutput类
- **THEN** section方法必须输出标题后跟换行符
- **AND** blankLine方法必须输出指定数量的空行(默认1行)

#### Scenario: 保持向后兼容性
- **GIVEN** TerminalOutput已实现
- **WHEN** 使用TerminalOutput输出消息
- **THEN** 输出格式必须与console调用完全一致
- **AND** 颜色输出必须保持不变
- **AND** 换行符必须保持不变

### Requirement: TerminalUIFactory默认工厂实现
系统必须提供TerminalUIFactory作为UIFactory的Terminal环境默认实现,统一管理TerminalParser和TerminalOutput的创建。

#### Scenario: 实现UIFactory接口
- **GIVEN** UIFactory抽象接口已定义
- **WHEN** 创建TerminalUIFactory类
- **THEN** TerminalUIFactory必须实现UIFactory接口
- **AND** createParser方法必须返回TerminalParser实例
- **AND** createOutput方法必须返回TerminalOutput实例

#### Scenario: 简化工厂设计
- **GIVEN** 需要避免过度抽象
- **WHEN** 实现TerminalUIFactory
- **THEN** 直接实例化TerminalParser,无需额外的ParserFactory层
- **AND** 直接实例化TerminalOutput,无需额外的OutputFactory层
- **AND** 保持架构清晰简洁

#### Scenario: 最小依赖原则
- **GIVEN** TerminalUIFactory已实现
- **WHEN** 检查工厂依赖
- **THEN** 仅依赖UIFactory抽象接口
- **AND** 仅依赖TerminalParser和TerminalOutput实现
- **AND** 不依赖其他子系统

### Requirement: UIFactoryRegistry扩展支持
系统必须扩展现有UIFactoryRegistry以支持Parser和Output工厂的注册与管理。

#### Scenario: 扩展注册方法
- **GIVEN** 现有UIFactoryRegistry管理PermissionUI工厂
- **WHEN** 扩展UIFactoryRegistry
- **THEN** 必须添加registerUIFactory(type: string, factory: UIFactory)方法
- **AND** 必须添加createUIFactory(config?: UIConfig): UIFactory方法
- **AND** 必须保持与现有PermissionUI工厂的兼容性

#### Scenario: 注册默认Terminal工厂
- **GIVEN** UIFactoryRegistry已扩展
- **WHEN** 模块初始化
- **THEN** 必须自动注册TerminalUIFactory为'terminal'类型
- **AND** 默认工厂类型必须为'terminal'

#### Scenario: 支持环境变量配置
- **GIVEN** UIFactoryRegistry已扩展
- **WHEN** 创建UIFactory实例
- **THEN** 必须读取CLAUDE_UI_TYPE环境变量
- **AND** 根据环境变量值选择对应的工厂实现
- **AND** 未配置时使用默认'terminal'工厂

### Requirement: Application类Parser依赖解耦
系统必须重构Application类,移除对CLIParser和CLIOptions的直接依赖,使用抽象接口替代。

#### Scenario: 移除CLIParser导入
- **GIVEN** main.ts当前直接导入CLIParser
- **WHEN** 重构Application类
- **THEN** 必须移除`import { CLIParser }`导入声明
- **AND** 不得在任何地方直接使用CLIParser类型

#### Scenario: 移除CLIOptions导入
- **GIVEN** main.ts当前直接导入CLIOptions
- **WHEN** 重构Application类
- **THEN** 必须移除`import type { CLIOptions }`导入声明
- **AND** 不得在任何地方直接使用CLIOptions类型

#### Scenario: 使用UIFactory依赖注入
- **GIVEN** 需要解耦Parser依赖
- **WHEN** 修改Application构造函数
- **THEN** 构造函数必须接受UIFactory参数
- **AND** 通过uiFactory.createParser()创建parser实例
- **AND** 通过uiFactory.createOutput()创建output实例
- **AND** 将parser和output存储为私有成员变量

#### Scenario: 使用抽象接口类型
- **GIVEN** Application类已重构
- **WHEN** 声明成员变量类型
- **THEN** parser成员必须声明为ParserInterface类型
- **AND** output成员必须声明为OutputInterface类型
- **AND** run方法参数必须使用OptionsInterface类型

### Requirement: Application类Output依赖解耦
系统必须重构Application类,移除所有console.log/console.error直接调用,使用OutputInterface替代。

#### Scenario: 迁移handleEarlyReturns方法中的console调用
- **GIVEN** handleEarlyReturns方法当前使用console.log
- **WHEN** 重构handleEarlyReturns方法
- **THEN** 帮助文本输出必须使用this.output.info()替代console.log
- **AND** 版本信息输出必须使用this.output.success()替代console.log
- **AND** 方法参数类型必须从CLIOptions改为OptionsInterface

#### Scenario: 迁移错误处理中的console.error调用
- **GIVEN** main.ts存在console.error调用处理错误
- **WHEN** 重构错误处理代码
- **THEN** 所有console.error必须替换为this.output.error()
- **AND** 错误消息格式必须保持与原console.error完全一致

#### Scenario: 迁移信息提示中的console.log调用
- **GIVEN** main.ts存在console.log调用输出信息
- **WHEN** 重构信息输出代码
- **THEN** 所有console.log必须替换为this.output.info()或this.output.success()
- **AND** 输出格式必须保持与原console.log完全一致

#### Scenario: 完全消除console依赖
- **GIVEN** Application类已重构完成
- **WHEN** 检查main.ts文件
- **THEN** grep "console.log" src/main.ts结果行数必须为0
- **AND** grep "console.error" src/main.ts结果行数必须为0
- **AND** grep "console.warn" src/main.ts结果行数必须为0

### Requirement: cli.ts入口点UIFactory初始化
系统必须在cli.ts入口点正确初始化UIFactory并注入到Application类。

#### Scenario: 创建UIFactory实例
- **GIVEN** Application类需要UIFactory依赖
- **WHEN** 在cli.ts创建Application实例
- **THEN** 必须通过UIFactoryRegistry.createUIFactory()创建工厂实例
- **AND** 必须将工厂实例传递给Application构造函数

#### Scenario: 支持环境变量配置
- **GIVEN** UIFactoryRegistry支持环境变量配置
- **WHEN** 创建UIFactory实例
- **THEN** 必须读取CLAUDE_UI_TYPE环境变量
- **AND** 根据环境变量值选择对应工厂类型

#### Scenario: 向后兼容性保证
- **GIVEN** cli.ts已重构
- **WHEN** 未配置CLAUDE_UI_TYPE环境变量
- **THEN** 必须使用默认'terminal'类型工厂
- **AND** CLI行为必须与重构前完全一致

### Requirement: 向后兼容性保证
系统必须确保重构后的CLI行为与重构前100%一致,不引入任何破坏性变更。

#### Scenario: 帮助文本输出一致性
- **GIVEN** 用户执行--help参数
- **WHEN** 系统输出帮助文本
- **THEN** 输出格式必须与重构前完全一致
- **AND** 文本内容必须与重构前完全一致
- **AND** 颜色样式必须与重构前完全一致

#### Scenario: 版本信息输出一致性
- **GIVEN** 用户执行--version参数
- **WHEN** 系统输出版本信息
- **THEN** 输出格式必须与重构前完全一致
- **AND** 文本内容必须与重构前完全一致

#### Scenario: 错误信息输出一致性
- **GIVEN** 系统遇到错误情况
- **WHEN** 系统输出错误信息
- **THEN** 输出格式必须与重构前完全一致
- **AND** 错误消息文本必须与重构前完全一致
- **AND** 换行符和缩进必须与重构前完全一致

#### Scenario: 性能保持不变
- **GIVEN** 早期返回路径(--help, --version)需要保持高性能
- **WHEN** 执行time npm run start -- --help命令
- **THEN** 执行时间必须与重构前相差不超过10%
- **AND** 内存占用必须与重构前基本一致

### Requirement: 文件头文档规范遵守
系统必须为所有新创建的代码文件添加规范的文件头文档。

#### Scenario: ParserInterface文件头
- **GIVEN** 创建ParserInterface.ts文件
- **WHEN** 编写文件内容
- **THEN** 文件顶部必须包含功能说明注释
- **AND** 必须列出核心导出(ParserInterface接口)
- **AND** 必须说明接口的作用

#### Scenario: OutputInterface文件头
- **GIVEN** 创建OutputInterface.ts文件
- **WHEN** 编写文件内容
- **THEN** 文件顶部必须包含功能说明注释
- **AND** 必须列出核心导出(OutputInterface接口)
- **AND** 必须说明接口的作用

#### Scenario: UIFactory文件头
- **GIVEN** 创建UIFactory.ts文件
- **WHEN** 编写文件内容
- **THEN** 文件顶部必须包含功能说明注释
- **AND** 必须列出核心导出(UIFactory接口)
- **AND** 必须说明接口的作用

#### Scenario: 实现类文件头
- **GIVEN** 创建TerminalParser.ts、TerminalOutput.ts、TerminalUIFactory.ts文件
- **WHEN** 编写文件内容
- **THEN** 每个文件顶部必须包含功能说明注释
- **AND** 必须列出核心导出的类
- **AND** 必须说明类的作用和实现的接口

### Requirement: 代码规范遵守
系统必须遵守项目既定的代码规范,包括日志、异常和魔法值处理规则。

#### Scenario: 日志使用英文
- **GIVEN** 代码中需要输出日志
- **WHEN** 编写日志语句
- **THEN** 所有日志消息必须使用英文
- **AND** 不得使用中文或其他语言

#### Scenario: 异常使用英文
- **GIVEN** 代码中需要抛出或处理异常
- **WHEN** 编写异常消息
- **THEN** 所有异常消息必须使用英文
- **AND** 不得使用中文或其他语言

#### Scenario: 禁止魔法值
- **GIVEN** 代码中需要使用配置参数
- **WHEN** 定义配置值
- **THEN** 必须定义为具名常量
- **AND** 必须支持环境变量配置
- **AND** 格式必须为`const PARAM = parseInt(process.env.ENV_VAR || 'default', 10);`

---

## MODIFIED Requirements（修改需求）

无修改需求 - 本次为全新架构优化设计。

---

## REMOVED Requirements（移除需求）

### Requirement: main.ts直接依赖CLIParser和CLIOptions
**Reason**（原因）：违反依赖倒置原则,导致业务逻辑与CLI解析实现耦合,限制未来扩展性。
**Migration**（迁移）：使用ParserInterface和OptionsInterface抽象接口替代具体实现类依赖。

### Requirement: main.ts直接使用console.log/error输出
**Reason**（原因）：违反分层架构原则,CLI输出与UI层耦合,限制未来Web/GUI环境支持。
**Migration**（迁移）：使用OutputInterface抽象接口的info/warn/error/success方法替代直接console调用。

---

## RENAMED Requirements（重命名需求）

无重命名需求 - 本次为全新架构优化设计。
