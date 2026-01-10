# SelfSpec Delta: Custom Tools 实现规格说明

## ADDED Requirements（新增需求）

### Requirement: 实现自定义工具定义与注册系统
系统应当提供完整的自定义工具定义、注册和管理功能，支持模块化组织、类型安全验证和集中式管理。

#### Scenario: 注册单个工具
- **GIVEN** 已初始化 CustomToolManager 实例
- **WHEN** 调用 registerTool() 方法注册一个工具定义
- **THEN** 工具应当被注册到 CustomToolRegistry 中
- **AND** 可以通过工具名称查询到该工具

#### Scenario: 注册工具模块
- **GIVEN** 已初始化 CustomToolManager 实例
- **WHEN** 调用 registerToolModule() 方法注册一组相关工具
- **THEN** 所有工具应当被注册到 CustomToolRegistry 中
- **AND** 可以按模块查询工具列表

#### Scenario: 查询已注册的工具
- **GIVEN** 已注册多个工具到注册表
- **WHEN** 调用 getAll() 方法获取所有工具
- **THEN** 应当返回包含所有工具定义的数组

#### Scenario: 验证工具定义
- **GIVEN** 包含名称、描述、Zod schema 和 handler 的工具定义
- **WHEN** 调用 validateToolDefinition() 方法
- **THEN** 应当返回验证成功的结果
- **AND** 无效定义应当返回验证错误

### Requirement: 实现 MCP 服务器创建功能
系统应当使用 createSdkMcpServer() 创建进程内 MCP 服务器，能够将自定义工具暴露给 Claude Agent SDK。

#### Scenario: 创建单个 MCP 服务器
- **GIVEN** 已注册一组工具到同一模块
- **WHEN** 调用 createMcpServers() 方法
- **THEN** 应当返回包含一个 MCP 服务器的对象
- **AND** 服务器配置包含正确的名称、版本和工具列表

#### Scenario: 创建多个 MCP 服务器
- **GIVEN** 已注册多个模块的工具
- **WHEN** 调用 createMcpServers() 方法
- **THEN** 应当返回多个 MCP 服务器对象
- **AND** 每个服务器对应一个工具模块

#### Scenario: 服务器配置验证
- **GIVEN** 自定义工具服务器配置
- **WHEN** SDK 接收服务器配置时
- **THEN** 配置应当符合 MCP 协议规范
- **AND** 工具名称格式应当为 mcp__{server_name}__{tool_name}

### Requirement: 集成权限控制系统
系统应当与现有的 PermissionManager 集成，支持自定义工具的权限控制。

#### Scenario: 检查工具权限
- **GIVEN** 已配置 allowedTools 列表包含自定义工具
- **WHEN** 用户尝试使用自定义工具时
- **THEN** PermissionManager 应当正确解析 mcp__{server}__{tool} 格式
- **AND** 未授权的工具应当被拒绝访问

#### Scenario: 权限过滤
- **GIVEN** 自定义工具注册表包含多个工具
- **WHEN** 调用 getAllToolNames() 方法
- **THEN** 应当返回所有已注册工具的完整名称

#### Scenario: 模块级权限
- **GIVEN** 按模块组织的工具
- **WHEN** 调用 getModuleToolNames(moduleName) 方法
- **THEN** 应当返回指定模块的所有工具名称

### Requirement: 实现错误处理机制
系统应当在工具执行过程中捕获异常并返回结构化错误信息。

#### Scenario: 工具执行异常
- **GIVEN** 工具 handler 中抛出异常
- **WHEN** 工具被 SDK 调用执行时
- **THEN** 异常应当被捕获并转换为结构化错误格式
- **AND** 错误信息格式为 { content: [{ type: "text", text: "错误信息" }] }

#### Scenario: 参数验证错误
- **GIVEN** 工具接收到的参数不符合 Zod schema
- **WHEN** 工具执行时进行参数验证
- **THEN** 验证错误应当被捕获并返回友好的错误信息

#### Scenario: 工具执行日志记录
- **GIVEN** 工具正在执行
- **WHEN** 工具开始执行、完成执行或发生错误时
- **THEN** 应当记录详细的执行日志（英文）
- **AND** 包含工具名称、执行时间、结果或错误信息

### Requirement: 支持流式输入模式
自定义工具应当配合流式输入模式使用，确保 prompt 参数使用 AsyncGenerator。

#### Scenario: 流式输入调用
- **GIVEN** SDK 使用流式输入模式
- **WHEN** Claude 模型决定调用自定义工具
- **THEN** 工具应当能够正确处理流式输入
- **AND** 返回结果应当立即返回给 SDK

#### Scenario: AsyncGenerator 兼容性
- **GIVEN** 工具 handler 使用 async/await
- **WHEN** SDK 调用工具时
- **THEN** 应当返回 Promise<ToolResult>

### Requirement: 提供完整的类型安全
系统应当使用 TypeScript + Zod 提供完整的类型推导和运行时验证。

#### Scenario: Zod schema 验证
- **GIVEN** 工具定义包含 Zod schema
- **WHEN** 工具被调用时
- **THEN** 参数应当通过 Zod 进行验证
- **AND** 类型推导应当正确工作

#### Scenario: TypeScript 类型检查
- **GIVEN** 工具定义和调用代码
- **WHEN** TypeScript 编译时
- **THEN** 类型检查应当通过
- **AND** IDE 应当显示正确的类型提示

#### Scenario: 运行时类型验证
- **GIVEN** 工具接收到的参数
- **WHEN** Zod schema 验证执行时
- **THEN** 应当验证参数类型和格式
- **AND** 验证失败应当抛出 ZodError

### Requirement: 提供示例计算器工具
系统应当实现一个示例计算器工具，演示自定义工具的定义和使用方式。

#### Scenario: 基本数学运算
- **GIVEN** 有效的数学表达式，如 "2 + 3 * 4"
- **WHEN** 调用 calculate 工具时
- **THEN** 应当返回正确计算结果
- **AND** 结果格式为 "{expression} = {result}"

#### Scenario: 指定小数精度
- **GIVEN** 数学表达式和 precision 参数
- **WHEN** 调用 calculate 工具时
- **THEN** 应当按照指定精度格式化结果
- **AND** 默认精度为 2 位小数

#### Scenario: 处理无效表达式
- **GIVEN** 无效的数学表达式，如 "2 +" 或除零
- **WHEN** 调用 calculate 工具时
- **THEN** 应当返回错误信息
- **AND** 错误信息以 "Calculation error:" 开头

### Requirement: 在 Application 中集成自定义工具管理器
系统应当将 CustomToolManager 集成到 Application 类中，合并外部 MCP 服务器和自定义工具服务器。

#### Scenario: Application 初始化
- **GIVEN** 启动 Application
- **WHEN** 调用 initialize() 方法时
- **THEN** 应当创建 CustomToolManager 实例
- **AND** 注册所有工具模块

#### Scenario: 服务器合并
- **GIVEN** 已配置外部 MCP 服务器和自定义工具
- **WHEN** SDKQueryExecutor 初始化时
- **THEN** 应当合并外部 MCP 服务器和自定义工具服务器
- **AND** 传递给 SDK 的配置包含两者

#### Scenario: SDK 选项传递
- **GIVEN** 合并后的 MCP 服务器配置
- **WHEN** 创建 SDKQueryExecutor 实例时
- **THEN** 应当将 mcpServers 选项传递给 SDK
- **AND** SDK 能够正确调用所有工具

### Requirement: 实现完整的测试覆盖
系统应当为自定义工具系统提供单元测试和集成测试。

#### Scenario: 单元测试覆盖
- **GIVEN** CustomToolRegistry 和 CustomToolManager 类
- **WHEN** 运行单元测试时
- **THEN** 测试覆盖率应当 ≥ 80%
- **AND** 所有公共方法都有测试用例

#### Scenario: 工具集成测试
- **GIVEN** 自定义工具和 SDK 配置
- **WHEN** 运行集成测试时
- **THEN** 应当验证工具能够被 SDK 成功调用
- **AND** 返回结果符合预期格式

#### Scenario: 流式输入测试
- **GIVEN** 流式输入模式和自定义工具
- **WHEN** 运行集成测试时
- **THEN** 应当验证流式输入与自定义工具的兼容性

### Requirement: 提供文档和示例
系统应当提供完整的使用文档和示例代码。

#### Scenario: README 文档
- **GIVEN** 项目文档
- **WHEN** 用户查看 README 时
- **THEN** 应当包含自定义工具的使用示例
- **AND** 包含从定义到使用的完整流程

#### Scenario: 代码文档注释
- **GIVEN** 所有自定义工具代码
- **WHEN** 用户查看代码时
- **THEN** 每个类和方法应当有清晰的文档注释
- **AND** 遵循项目文件头文档规范

#### Scenario: 最佳实践指南
- **GIVEN** 项目文档
- **WHEN** 用户需要使用自定义工具时
- **THEN** 应当提供错误处理和性能优化指南
- **AND** 包含命名规范和架构决策说明

## MODIFIED Requirements（修改需求）

无

## REMOVED Requirements（移除需求）

无

## RENAMED Requirements（重命名需求）

无
