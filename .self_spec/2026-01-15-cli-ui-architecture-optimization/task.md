# 实施计划：CLI与UI分层架构优化

## 概述

本计划实施CLI参数解析抽象层和CLI输出抽象层的完整重构,通过引入ParserInterface、OutputInterface和UIFactory统一工厂,消除main.ts对CLIParser/CLIOptions的直接依赖和24处console调用,实现CLI与UI层的完全解耦。

## Reference

- Design: [design.md](./design.md)
- Specification: [spec.md](./spec.md)

## 任务

- [x] 1. 创建ParserInterface抽象接口
   - 定义parse(args: string[]): OptionsInterface方法
   - 定义getHelpText(): string方法
   - 定义getVersionText(): string方法
   - 确保接口无外部依赖
   - 添加规范的文件头文档
   - _Requirements: Parser抽象接口定义, 文件头文档规范遵守_

- [x] 2. 验证ParserInterface接口定义
   - 单元测试验证接口定义完整性
   - 验证接口方法签名正确性
   - 验证接口无外部依赖
   - _Validates: Parser抽象接口定义_

- [x] 3. 创建OptionsInterface抽象接口
   - 定义help: boolean属性
   - 定义version: boolean属性
   - 定义debug: boolean属性
   - 定义[key: string]: unknown扩展属性
   - 确保接口无外部依赖
   - 添加规范的文件头文档
   - _Requirements: Parser抽象接口定义, 文件头文档规范遵守_

- [x] 4. 验证OptionsInterface接口定义
   - 单元测试验证接口定义完整性
   - 验证接口属性类型正确性
   - 验证接口扩展属性支持
   - _Validates: Parser抽象接口定义_

- [x] 5. 创建OutputInterface抽象接口
   - 定义info(message: string, options?: OutputOptions): void方法
   - 定义warn(message: string, options?: OutputOptions): void方法
   - 定义error(message: string, options?: OutputOptions): void方法
   - 定义success(message: string, options?: OutputOptions): void方法
   - 定义section(title: string, options?: OutputOptions): void方法
   - 定义blankLine(count?: number): void方法
   - 定义OutputOptions类型(颜色、时间戳、缩进配置)
   - 确保接口无外部依赖
   - 添加规范的文件头文档
   - _Requirements: Output输出抽象接口定义, 文件头文档规范遵守_

- [x] 6. 验证OutputInterface接口定义
   - 单元测试验证接口定义完整性
   - 验证接口方法签名正确性
   - 验证OutputOptions类型定义
   - _Validates: Output输出抽象接口定义_

- [x] 7. 创建UIFactory抽象接口
   - 定义createParser(): ParserInterface方法
   - 定义createOutput(): OutputInterface方法
   - 确保仅依赖ParserInterface和OutputInterface抽象
   - 添加规范的文件头文档
   - _Requirements: UIFactory统一工厂接口定义, 文件头文档规范遵守_

- [x] 8. 验证UIFactory接口定义
   - 单元测试验证接口定义完整性
   - 验证接口仅依赖抽象接口
   - 验证工厂方法签名正确性
   - _Validates: UIFactory统一工厂接口定义_

- [x] 9. 实现TerminalParser类
   - 实现ParserInterface接口
   - parse方法委托给CLIParser.parse
   - getHelpText方法委托给CLIParser.getHelpText
   - getVersionText方法委托给CLIParser.getVersionText
   - 确保仅依赖ParserInterface和CLIParser
   - 添加规范的文件头文档
   - _Requirements: TerminalParser默认实现, 文件头文档规范遵守_

- [x] 10. 验证TerminalParser实现
   - 单元测试验证parse方法与CLIParser行为一致
   - 单元测试验证getHelpText方法与CLIParser行为一致
   - 单元测试验证getVersionText方法与CLIParser行为一致
   - 验证TerminalParser仅依赖ParserInterface和CLIParser
   - 集成测试验证向后兼容性
   - _Validates: TerminalParser默认实现_

- [x] 11. 实现TerminalOutput类
   - 实现OutputInterface接口
   - info方法委托给console.log
   - warn方法委托给console.warn
   - error方法委托给console.error
   - success方法委托给console.log
   - section方法输出标题后跟换行符
   - blankLine方法输出指定数量空行(默认1行)
   - 确保仅依赖OutputInterface
   - 添加规范的文件头文档
   - _Requirements: TerminalOutput默认实现, 文件头文档规范遵守_

- [x] 12. 验证TerminalOutput实现
   - 单元测试验证info方法与console.log行为一致
   - 单元测试验证warn方法与console.warn行为一致
   - 单元测试验证error方法与console.error行为一致
   - 单元测试验证success方法与console.log行为一致
   - 单元测试验证section和blankLine方法
   - 集成测试验证输出格式、颜色、换行符一致性
   - _Validates: TerminalOutput默认实现_

- [x] 13. 实现TerminalUIFactory类
   - 实现UIFactory接口
   - createParser方法直接返回TerminalParser实例
   - createOutput方法直接返回TerminalOutput实例
   - 避免额外的ParserFactory和OutputFactory层
   - 确保仅依赖UIFactory、TerminalParser、TerminalOutput
   - 添加规范的文件头文档
   - _Requirements: TerminalUIFactory默认工厂实现, 文件头文档规范遵守_

- [x] 14. 验证TerminalUIFactory实现
   - 单元测试验证createParser返回TerminalParser实例
   - 单元测试验证createOutput返回TerminalOutput实例
   - 验证工厂仅依赖必要的类
   - 验证架构简洁性(无多余工厂层)
   - _Validates: TerminalUIFactory默认工厂实现_

- [x] 15. 扩展UIFactoryRegistry支持UIFactory注册
   - 添加registerUIFactory(type: string, factory: UIFactory)方法
   - 添加createUIFactory(config?: UIConfig): UIFactory方法
   - 保持与现有PermissionUI工厂兼容性
   - 添加文件头文档说明扩展内容
   - _Requirements: UIFactoryRegistry扩展支持_

- [x] 16. 注册默认TerminalUIFactory
   - 在模块初始化时自动注册TerminalUIFactory为'terminal'类型
   - 设置默认工厂类型为'terminal'
   - 支持读取CLAUDE_UI_TYPE环境变量
   - 根据环境变量值选择对应工厂
   - _Requirements: UIFactoryRegistry扩展支持_

- [x] 17. 验证UIFactoryRegistry扩展
   - 单元测试验证registerUIFactory方法
   - 单元测试验证createUIFactory方法
   - 单元测试验证环境变量配置(CLAUDE_UI_TYPE)
   - 单元测试验证默认'terminal'工厂注册
   - 验证与现有PermissionUI工厂兼容性
   - _Validates: UIFactoryRegistry扩展支持_

- [x] 18. 重构Application类移除CLIParser依赖
   - 移除`import { CLIParser }`导入声明
   - 移除`import type { CLIOptions }`导入声明
   - 修改构造函数接受UIFactory参数
   - 通过uiFactory.createParser()创建parser实例
   - 通过uiFactory.createOutput()创建output实例
   - parser成员声明为ParserInterface类型
   - output成员声明为OutputInterface类型
   - _Requirements: Application类Parser依赖解耦, Application类Output依赖解耦_

- [x] 19. 验证Application类Parser依赖移除
   - 架构测试验证main.ts无CLIParser导入
   - 架构测试验证main.ts无CLIOptions导入
   - 单元测试验证Application构造函数接受UIFactory
   - 单元测试验证parser成员为ParserInterface类型
   - 单元测试验证output成员为OutputInterface类型
   - _Validates: Application类Parser依赖解耦_

- [x] 20. 重构Application.run方法使用抽象接口
   - run方法使用ParserInterface解析参数
   - run方法使用OptionsInterface作为参数类型
   - 确保不使用具体CLIParser或CLIOptions类型
   - _Requirements: Application类Parser依赖解耦_

- [x] 21. 验证Application.run方法抽象化
   - 单元测试验证run方法使用ParserInterface
   - 单元测试验证run方法使用OptionsInterface
   - 集成测试验证CLI参数解析功能正常
   - _Validates: Application类Parser依赖解耦_

- [x] 22. 重构handleEarlyReturns方法使用OutputInterface
   - 将console.log(this.parser.getHelpText())替换为this.output.info(this.parser.getHelpText())
   - 将console.log(`claude-replica v${VERSION}`)替换为this.output.success(`claude-replica v${VERSION}`)
   - 方法参数类型从CLIOptions改为OptionsInterface
   - _Requirements: Application类Output依赖解耦_

- [x] 23. 验证handleEarlyReturns方法重构
   - 单元测试验证帮助文本使用output.info输出
   - 单元测试验证版本信息使用output.success输出
   - 单元测试验证方法参数为OptionsInterface类型
   - 集成测试验证--help和--version输出格式一致性
   - _Validates: Application类Output依赖解耦_

- [x] 24. 迁移main.ts中所有console.error调用
   - 识别main.ts中所有console.error调用(预计约12处)
   - 逐一替换为this.output.error()
   - 保持错误消息格式完全一致
   - _Requirements: Application类Output依赖解耦_

- [x] 25. 验证console.error调用迁移
   - 架构测试验证main.ts无console.error调用
   - 单元测试验证错误输出格式与原console.error一致
   - 集成测试验证错误场景输出正常
   - _Validates: Application类Output依赖解耦_

- [x] 26. 迁移main.ts中所有console.log调用
   - 识别main.ts中所有console.log调用(预计约12处)
   - 根据语义选择替换为this.output.info()或this.output.success()
   - 对于分节输出使用this.output.section()
   - 对于空行输出使用this.output.blankLine()
   - 保持输出格式完全一致
   - _Requirements: Application类Output依赖解耦_

- [x] 27. 验证console.log调用迁移
   - 架构测试验证main.ts无console.log调用
   - 架构测试验证main.ts无console.warn调用
   - 单元测试验证信息输出格式与原console.log一致
   - 集成测试验证各种输出场景正常
   - _Validates: Application类Output依赖解耦_

- [x] 28. 修改cli.ts入口点初始化UIFactory
   - 在cli.ts中通过UIFactoryRegistry.createUIFactory()创建工厂实例
   - 将工厂实例传递给Application构造函数
   - 支持读取CLAUDE_UI_TYPE环境变量
   - 未配置时使用默认'terminal'工厂
   - _Requirements: cli.ts入口点UIFactory初始化_

- [x] 29. 验证cli.ts入口点重构
   - 单元测试验证cli.ts正确创建UIFactory实例
   - 单元测试验证UIFactory传递给Application构造函数
   - 集成测试验证环境变量配置功能
   - 集成测试验证默认'terminal'工厂使用
   - _Validates: cli.ts入口点UIFactory初始化_

- [x] 30. 向后兼容性验证 - 帮助文本输出
   - 执行`npm run start -- --help`
   - 对比重构前后输出格式、内容、颜色样式
   - 确保100%一致
   - _Validates: 向后兼容性保证_

- [x] 31. 向后兼容性验证 - 版本信息输出
   - 执行`npm run start -- --version`
   - 对比重构前后输出格式和内容
   - 确保100%一致
   - _Validates: 向后兼容性保证_

- [x] 32. 向后兼容性验证 - 错误信息输出
   - 触发各种错误场景(无效参数、配置错误等)
   - 对比重构前后错误输出格式、内容、换行符
   - 确保100%一致
   - _Validates: 向后兼容性保证_

- [x] 33. 性能验证 - 早期返回路径
   - 执行`time npm run start -- --help`记录执行时间
   - 执行`time npm run start -- --version`记录执行时间
   - 对比重构前后性能差异
   - 确保性能相差不超过10%
   - _Validates: 向后兼容性保证_

- [x] 34. 架构验证 - 依赖检查
   - 执行`grep -r "import.*CLIParser" src/main.ts | wc -l`验证结果为0
   - 执行`grep -r "import.*CLIOptions" src/main.ts | wc -l`验证结果为0
   - 执行`grep -r "console.log" src/main.ts | wc -l`验证结果为0
   - 执行`grep -r "console.error" src/main.ts | wc -l`验证结果为0
   - 执行`grep -r "console.warn" src/main.ts | wc -l`验证结果为0
   - _Validates: Application类Parser依赖解耦, Application类Output依赖解耦_

- [x] 35. 代码规范验证 - 日志和异常使用英文
   - 检查所有新增代码中的日志语句
   - 检查所有新增代码中的异常消息
   - 确保全部使用英文
   - _Validates: 代码规范遵守_

- [x] 36. 代码规范验证 - 魔法值处理
   - 检查所有新增代码中的配置参数
   - 确保所有配置值定义为具名常量
   - 确保支持环境变量配置
   - 确保格式符合规范`const PARAM = parseInt(process.env.ENV_VAR || 'default', 10);`
   - _Validates: 代码规范遵守_

- [x] 37. 文件头文档验证
   - 检查ParserInterface.ts、OptionsInterface.ts文件头
   - 检查OutputInterface.ts文件头
   - 检查UIFactory.ts文件头
   - 检查TerminalParser.ts、TerminalOutput.ts、TerminalUIFactory.ts文件头
   - 确保所有文件包含功能说明、核心导出列表、作用说明
   - _Validates: 文件头文档规范遵守_

- [x] 38. 完整测试套件执行
   - 执行`npm run build`确保编译成功
   - 执行`npm test`确保所有单元测试通过
   - 执行集成测试确保所有功能正常
   - 执行架构测试确保依赖解耦完成
   - _Validates: 所有需求_

- [x] 39. 更新AGENTS.md文档
   - 添加UIFactory架构说明
   - 添加ParserInterface和OutputInterface说明
   - 更新CLI入口点初始化流程说明
   - 更新架构图包含UI工厂层
   - _Requirements: 无(文档更新)_

- [x] 40. 最终验证与发布准备
   - 执行完整的回归测试
   - 验证所有成功标准达成
   - 生成变更日志(Changelog)
   - 准备发布说明
   - _Validates: 所有需求_
