# 实施计划：Custom Tools 系统实现

## 概述

实现符合 Claude Agent SDK 官方最佳实践的自定义工具系统，包括工具定义、注册、MCP 服务器创建、权限控制、错误处理和测试覆盖。该系统将支持进程内自定义工具，提供类型安全的 Zod schema 验证，并集成到现有 Application 架构中。

## 任务

- [x] 1. 创建基础类型定义
  - 定义 ToolDefinition、ToolHandler、ToolResult 接口
  - 定义 CustomToolManagerOptions 类型
  - 定义 ValidationResult 类型
  - _Requirements: 实现自定义工具定义与注册系统_

- [x] 2. 实现 CustomToolRegistry 类
  - 实现工具注册、查询、移除功能
  - 实现模块映射管理
  - 添加单元测试（覆盖所有公共方法）
  - _Requirements: 实现自定义工具定义与注册系统_

- [x] 3. 实现 CustomToolManager 类
  - 实现工具和工具模块注册功能
  - 实现 MCP 服务器创建功能
  - 实现工具名称获取功能
  - 实现工具定义验证功能
  - _Requirements: 实现自定义工具定义与注册系统_

- [x] 4. 创建工具模块目录结构
  - 创建 src/custom-tools/ 目录
  - 创建 math/ 子模块目录
  - 创建 utils/ 工具目录
  - 创建类型导出文件
  - _Requirements: 实现自定义工具定义与注册系统_

- [x] 5. 实现计算器工具示例
  - 使用 Zod schema 定义参数验证
  - 实现安全的数学表达式求值（使用 mathjs 或 expr-eval）
  - 实现错误处理和日志记录
  - 使用英文日志和错误消息
  - _Requirements: 提供示例计算器工具_

- [x] 6. 实现工具执行日志记录器
  - 创建 logger.ts 工具
  - 记录工具执行开始/完成/错误
  - 包含工具名称、执行时间、结果或错误
  - 所有日志使用英文
  - _Requirements: 实现错误处理机制_

- [x] 7. 实现结构化错误处理器
  - 创建 error-handler.ts 工具
  - 捕获和转换工具执行异常
  - 返回 { content: [{ type: "text", text: "错误信息" }] } 格式
  - 处理 Zod 验证错误
  - _Requirements: 实现错误处理机制_

- [x] 8. 编写 CustomToolRegistry 单元测试
  - 测试工具注册和查询功能
  - 测试模块映射功能
  - 测试工具移除和清空功能
  - 目标覆盖率 ≥ 80%
  - _Requirements: 实现完整的测试覆盖_

- [x] 9. 编写 CustomToolManager 单元测试
  - 测试工具注册功能
  - 测试 MCP 服务器创建功能
  - 测试工具名称获取功能
  - 测试工具定义验证功能
  - _Requirements: 实现完整的测试覆盖_

- [x] 10. 编写计算器工具单元测试
  - 测试基本数学运算
  - 测试小数精度控制
  - 测试无效表达式处理
  - 测试参数验证
  - _Requirements: 实现完整的测试覆盖_

- [x] 11. 在 Application 中集成 CustomToolManager
  - 修改 Application.initialize() 方法
  - 创建 CustomToolManager 实例
  - 注册工具模块（math/calculators）
  - 创建 MCP 服务器
  - _Requirements: 在 Application 中集成自定义工具管理器_

- [x] 12. 更新 SDKQueryExecutor 集成
  - 修改 SDKQueryExecutor 选项传递逻辑
  - 合并外部 MCP 服务器和自定义工具服务器
  - 确保 mcpServers 选项正确传递给 SDK
  - _Requirements: 在 Application 中集成自定义工具管理器_

- [x] 13. 扩展 PermissionManager 支持自定义工具
  - 添加 mcp__{server}__{tool} 名称格式解析
  - 更新 allowedTools 检查逻辑
  - 支持模块级权限控制
  - _Requirements: 集成权限控制系统_

- [x] 14. 编写自定义工具与 SDK 集成测试
  - 验证工具能够被 SDK 成功调用
  - 测试工具返回结果格式
  - 测试流式输入与自定义工具兼容性
  - 测试权限控制集成
  - _Requirements: 实现完整的测试覆盖_

- [x] 15. 验证流式输入兼容性
  - 确保工具支持 AsyncGenerator prompt
  - 测试流式输入模式下的工具调用
  - 验证返回结果实时性
  - _Requirements: 支持流式输入模式_

- [x] 16. 执行类型安全验证
  - 运行 TypeScript 编译检查
  - 验证 Zod schema 类型推导
  - 检查 IDE 类型提示
  - 修复所有类型错误
  - _Requirements: 提供完整的类型安全_

- [x] 17. 代码质量检查
  - 运行 ESLint 检查
  - 运行 Prettier 格式化
  - 检查测试覆盖率 ≥ 80%
  - 修复所有代码质量问题
  - _Requirements: 实现完整的测试覆盖_

- [x] 18. 添加文件头文档注释
  - 为所有自定义工具文件添加文档注释
  - 遵循项目文件头文档规范
  - 说明文件功能、核心类和作用
  - 检查所有新创建的文件
  - _Requirements: 提供文档和示例_

- [x] 19. 创建自定义工具使用文档
  - 更新 README.md 添加自定义工具部分
  - 包含工具定义示例
  - 包含工具使用示例
  - 说明权限配置方法
  - _Requirements: 提供文档和示例_

- [x] 20. 完整功能验证
  - 运行所有单元测试
  - 运行所有集成测试
  - 手动验证计算器工具功能
  - 验证权限控制正常工作
  - _Requirements: 所有功能需求_

- [x] 21. 最终检查和质量保证
  - 验证所有验收标准
  - 检查代码覆盖率报告
  - 确认文档完整性
  - 提交最终实现
  - _Requirements: 所有需求_
