# 实施计划：移除userConfig概念

## 概述

从应用中完全移除userConfig概念，统一通过ConfigManager管理所有配置。简化会话管理，消除配置合并逻辑，使MessageRouter直接使用projectConfig。

## Reference

- Design: [design.md](./design.md)
- Specification: [spec.md](./spec.md)

## 任务

- [x] 1. 修改SessionManager - 移除userConfig字段和参数
   - 从SessionContext接口移除userConfig: UserConfig字段
   - 更新createSession方法移除userConfig参数
   - 更新forkSession方法移除userConfig深拷贝操作
   - 简化loadSessionInternal方法，不处理userConfig字段
   - _Requirements: SessionManager - 移除userConfig字段和参数_

- [x] 2. 验证SessionManager修改
   - 检查SessionContext接口不再包含userConfig字段
   - 验证createSession方法签名正确移除userConfig参数
   - 确认forkSession不复制userConfig字段
   - 验证loadSessionInternal不加载userConfig字段
   - 运行SessionManager单元测试确保通过
   - _Validates: SessionManager - 移除userConfig字段和参数_

- [x] 3. 修改MessageRouter - 直接使用projectConfig
   - 更新getEnabledToolNames方法直接使用projectConfig（移除mergeConfigs调用）
   - 更新buildQueryOptions方法直接使用projectConfig
   - 移除所有配置合并逻辑和mergeConfigs()调用
   - 确保方法只依赖session.context中的projectConfig
   - _Requirements: MessageRouter - 直接使用projectConfig_

- [x] 4. 验证MessageRouter修改
   - 检查getEnabledToolNames方法不再调用mergeConfigs()
   - 验证buildQueryOptions方法直接使用projectConfig
   - 确认不存在任何userConfig引用
   - 运行MessageRouter单元测试确保通过
   - _Validates: MessageRouter - 直接使用projectConfig_

- [x] 5. 修改main.ts - 移除userConfig加载逻辑
   - 更新getOrCreateSession方法移除userConfig加载和传递
   - 更新临时会话创建逻辑移除userConfig字段设置
   - 简化showConfig方法直接使用ConfigManager获取配置
   - 移除所有配置合并代码，直接传递projectConfig
   - _Requirements: main.ts - 移除userConfig加载逻辑_

- [x] 6. 验证main.ts修改
   - 检查getOrCreateSession直接传递projectConfig
   - 验证临时会话不包含userConfig字段
   - 确认showConfig方法正确简化
   - 运行main单元测试确保通过
   - _Validates: main.ts - 移除userConfig加载逻辑_

- [x] 7. 更新测试文件
   - 修改tests/unit/core/SessionManager.test.ts移除userConfig参数
   - 修改tests/unit/core/MessageRouter.test.ts移除userConfig预期
   - 修改tests/unit/main.test.ts移除userConfig测试逻辑
   - 更新所有createSession调用移除userConfig参数
   - _Requirements: userConfig概念完全移除_

- [x] 8. 验证测试文件更新
   - 运行SessionManager测试确保通过
   - 运行MessageRouter测试确保通过
   - 运行main测试确保通过
   - 确认所有测试不再依赖userConfig
   - _Validates: userConfig概念完全移除_

- [x] 9. 运行完整测试套件
   - 执行所有单元测试：npm test
   - 检查是否有任何测试失败
   - 修复任何因userConfig移除导致的测试问题
   - 确认所有测试通过
   - _Validates: SessionManager - 移除userConfig字段和参数, MessageRouter - 直接使用projectConfig, main.ts - 移除userConfig加载逻辑_

- [x] 10. 功能验证测试
   - 测试基本会话功能正常创建和使用
   - 测试交互模式工作正常
   - 测试非交互模式工作正常
   - 验证权限模式切换正常
   - 验证工具权限检查基于projectConfig正确工作
   - _Validates: userConfig概念完全移除_

- [x] 11. 配置传递验证
   - 确认main.ts直接传递projectConfig，无合并逻辑
   - 验证MessageRouter直接使用projectConfig，无mergeConfigs()调用
   - 检查代码库中不存在任何userConfig引用
   - 验证配置传递流程：main.ts → createSession(workingDir, projectConfig)
   - _Validates: main.ts - 移除userConfig加载逻辑, MessageRouter - 直接使用projectConfig_

- [x] 12. 代码审查和清理
   - 搜索代码库确认无残留的userConfig引用
   - 检查是否有未处理的UserConfig类型定义
   - 确认所有mergeConfigs()调用已被移除
   - 清理任何注释中的userConfig引用
   - _Validates: userConfig概念完全移除_

- [ ] 13. 回归测试
   - 测试完整用户工作流程（会话创建、工具使用、会话恢复）
   - 验证各种配置场景正确工作
   - 测试会话fork功能正常
   - 确认无功能退化或意外行为
   - _Validates: SessionManager - 移除userConfig字段和参数, MessageRouter - 直接使用projectConfig, main.ts - 移除userConfig加载逻辑_

- [ ] 14. 最终验证和文档更新
   - 运行lint检查：npm run lint
   - 运行格式化检查：npm run format
   - 更新相关代码文档注释
   - 生成覆盖率报告：npm run test:coverage
   - 确认所有质量检查通过
   - _Validates: userConfig概念完全移除_
