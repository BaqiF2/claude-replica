# 实施计划：PermissionUI 工厂模式重构

## 概述

本计划实施 PermissionUI 工厂模式重构，通过引入工厂模式和依赖注入来解决当前代码中直接实例化具体实现的问题。重构将提高代码的可扩展性、可测试性和可维护性，同时保持向后兼容性。

## Reference

- Design: [design.md](design.md)
- Specification: [spec.md](spec.md)

## 任务

- [x] 1. 创建工厂接口和基础实现
   - 创建 src/ui/factories/PermissionUIFactory.ts，定义工厂接口
   - 创建 src/ui/factories/TerminalPermissionUIFactory.ts，实现终端UI工厂
   - 添加 JSDoc 文档和类型定义
   - _Requirements: 系统应当提供 PermissionUIFactory 接口用于创建 PermissionUI 实例, 系统应当提供 TerminalPermissionUIFactory 实现来创建终端 UI 实例_

- [x] 2. 验证：工厂接口和基础实现
   - 运行 TypeScript 编译检查，确保接口和实现正确
   - 验证工厂接口的类型定义和 JSDoc 文档
   - 检查工厂实现是否正确实现接口
   - _Validates: 系统应当提供 PermissionUIFactory 接口用于创建 PermissionUI 实例, 系统应当提供 TerminalPermissionUIFactory 实现来创建终端 UI 实例_

- [x] 3. 创建工厂注册表
   - 创建 src/ui/factories/UIFactoryRegistry.ts，实现注册表功能
   - 实现静态方法：register()、get()、create()
   - 在模块加载时注册默认的终端UI工厂
   - 添加错误处理和类型检查
   - _Requirements: 系统应当提供 UIFactoryRegistry 管理 UI 工厂注册和获取_

- [x] 4. 验证：工厂注册表
   - 编写单元测试验证 register() 和 get() 方法
   - 测试未知类型抛错场景
   - 测试 create() 方法的默认工厂创建逻辑
   - 运行测试确保所有用例通过
   - _Validates: 系统应当提供 UIFactoryRegistry 管理 UI 工厂注册和获取_

- [x] 5. 重构 PermissionManager 构造函数
   - 修改 PermissionManager.ts 构造函数签名
   - 将第二个参数从 PermissionUI 改为 PermissionUIFactory
   - 在构造函数中通过工厂创建 UI 实例
   - 更新构造函数 JSDoc 文档
   - _Requirements: PermissionManager 应当通过工厂模式创建 PermissionUI 实例_

- [x] 6. 验证：PermissionManager 重构
   - 运行现有单元测试，检查 PermissionManager 相关测试
   - 如果有 PermissionManager 的集成测试，运行并确保通过
   - 验证工厂注入逻辑是否正确
   - _Validates: PermissionManager 应当通过工厂模式创建 PermissionUI 实例_

- [x] 7. 更新 main.ts 集成逻辑
   - 修改 main.ts 中 PermissionUI 实例化代码
   - 使用 UIFactoryRegistry.create() 根据配置选择工厂
   - 将工厂实例传递给 PermissionManager 构造函数
   - 添加空值检查和默认处理
   - _Requirements: main.ts 集成 - 使用工厂模式创建 PermissionUI_

- [x] 8. 验证：main.ts 集成
   - 编译项目检查 TypeScript 错误
   - 运行构建命令确保项目可以正常编译
   - 检查运行时是否正确加载和创建工厂
   - _Validates: main.ts 集成 - 使用工厂模式创建 PermissionUI_

- [x] 9. 扩展配置系统支持 UI 配置
   - 在 PermissionConfig 接口中添加可选的 ui 字段
   - 定义 UIConfig 接口，包含 type 和 options 字段
   - 更新 ConfigManager 类型定义（如需要）
   - 文档化新的配置选项
   - _Requirements: 系统应当支持通过配置选择不同的 UI 工厂_

- [x] 10. 验证：配置系统扩展
   - 编译检查确保类型定义正确
   - 验证向后兼容性（无 ui 字段的配置仍正常工作）
   - 测试配置解析逻辑
   - _Validates: 系统应当支持通过配置选择不同的 UI 工厂_

- [x] 11. 编写工厂接口单元测试
   - 创建 TerminalPermissionUIFactory 的单元测试文件
   - 测试 createPermissionUI() 方法的默认流和自定义流场景
   - 测试工厂返回的实例类型和行为一致性
   - 确保测试覆盖所有公共方法
   - _Requirements: 系统应当提供 PermissionUIFactory 接口用于创建 PermissionUI 实例_

- [x] 12. 验证：工厂接口单元测试
   - 运行 TerminalPermissionUIFactory 相关测试
   - 检查测试覆盖率报告，确保关键路径被覆盖
   - 验证所有测试用例通过
   - _Validates: 系统应当提供 PermissionUIFactory 接口用于创建 PermissionUI 实例_

- [x] 13. 编写注册表单元测试
   - 创建 UIFactoryRegistry 的单元测试文件
   - 测试 register() 和 get() 方法的正确性
   - 测试未知类型错误抛出
   - 测试 create() 方法的各种场景（默认配置、特定配置）
   - _Requirements: 系统应当提供 UIFactoryRegistry 管理 UI 工厂注册和获取_

- [x] 14. 验证：注册表单元测试
   - 运行 UIFactoryRegistry 相关测试
   - 检查测试覆盖率达到项目标准
   - 验证所有测试场景正确实现
   - _Validates: 系统应当提供 UIFactoryRegistry 管理 UI 工厂注册和获取_

- [x] 15. 编写 PermissionManager 工厂注入测试
   - 创建或更新 PermissionManager 测试文件
   - 测试构造函数接收工厂实例的正确性
   - 测试工厂方法被正确调用
   - 测试 createCanUseToolHandler() 的功能完整性
   - _Requirements: PermissionManager 应当通过工厂模式创建 PermissionUI 实例_

- [x] 16. 验证：PermissionManager 工厂注入测试
   - 运行 PermissionManager 相关测试
   - 检查工厂注入逻辑是否正确工作
   - 验证权限检查流程与重构前行为一致
   - _Validates: PermissionManager 应当通过工厂模式创建 PermissionUI 实例_

- [x] 17. 编写完整流程集成测试
   - 创建集成测试文件测试完整工厂流程
   - 测试从配置选择到权限检查的完整链路
   - 测试默认配置和自定义配置的场景
   - 验证系统启动和运行流程
   - _Requirements: main.ts 集成 - 使用工厂模式创建 PermissionUI, 系统应当保持向后兼容性_

- [x] 18. 验证：完整流程集成测试
   - 运行集成测试套件
   - 验证所有端到端场景正确工作
   - 检查性能无明显回归
   - _Validates: main.ts 集成 - 使用工厂模式创建 PermissionUI, 系统应当保持向后兼容性_

- [x] 19. 运行完整测试套件
   - 运行所有单元测试
   - 运行所有集成测试
   - 检查测试覆盖率报告
   - 确保没有测试失败或回归
   - _Validates: 系统应当保持向后兼容性_

- [x] 20. 验证向后兼容性
   - 测试现有功能是否完全不受影响
   - 验证权限提示、用户交互等核心功能
   - 检查是否有任何破坏性更改
   - 确认项目文档的兼容性说明
   - _Validates: 系统应当保持向后兼容性_

- [x] 21. 代码质量检查
   - 运行 npm run lint 检查代码规范
   - 运行 npm run format 格式化代码
   - 检查是否有未使用的导入或变量
   - 验证 JSDoc 文档完整性和准确性
   - _Validates: 所有重构代码符合项目质量标准_

- [x] 22. 性能基准测试
   - 对比重构前后的启动时间
   - 测试工厂创建的性能开销
   - 验证内存使用无明显增加
   - 记录性能基准数据
   - _Validates: 工厂创建无明显性能开销_

- [x] 23. 更新项目文档
   - 更新架构文档说明新的工厂模式
   - 更新 API 文档反映构造函数变更
   - 在 README 中添加扩展新 UI 类型的指南
   - 更新相关设计文档和注释
   - _Requirements: 提供完整的架构文档和扩展指南_

- [x] 24. 最终验证和验收
   - 手动测试完整的用户交互流程
   - 验证所有验收标准都已满足
   - 准备提交代码审查
   - 创建变更日志和发布说明
   - _Validates: 所有需求和验收标准完全满足_

## 成功标准

- [x] 所有现有测试通过（100% 向后兼容）
- [x] 新增测试覆盖所有工厂相关代码（>80% 覆盖率）
- [x] 可以通过配置选择不同 UI 类型
- [x] 添加新 UI 类型无需修改核心逻辑
- [x] 代码通过 lint 和格式检查
- [x] 性能无明显回归
- [x] 文档完整且准确

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 工厂创建逻辑有 bug | 低 | 中 | 充分的单元测试和集成测试 |
| 配置格式不兼容 | 低 | 中 | 向后兼容，默认值处理 |
| 测试覆盖不足 | 中 | 高 | 完整的测试套件和覆盖率检查 |
| 破坏现有功能 | 低 | 高 | 全面回归测试和手动验证 |
| 性能回归 | 低 | 中 | 性能基准测试和优化 |

## 迁移指南

对于现有用户：
1. **无需更改**：现有配置和代码无需任何修改
2. **可选增强**：用户可以选择通过 `ui` 配置自定义 UI 类型
3. **未来扩展**：开发者可以注册自定义 UI 工厂，无需修改核心代码

对于开发者：
1. 新的 UI 类型：通过 `UIFactoryRegistry.register()` 注册工厂
2. 自定义工厂：实现 `PermissionUIFactory` 接口
3. 配置使用：在 PermissionConfig.ui 中指定类型
