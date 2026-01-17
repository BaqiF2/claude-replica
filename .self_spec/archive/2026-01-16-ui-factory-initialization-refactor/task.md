# 实施计划：UI 工厂初始化重构

## 概述
基于设计文档提炼需求与场景，按 TDD 流程输出可追溯的测试与实现任务清单。
覆盖 UIFactory 单例化、环境变量校验、注入复用与旧配置字段移除等核心变更。

## Reference
- Design: [design.md](design.md)
- Specification: [spec.md](spec.md)

## 任务

### Scenario 1: 多次调用返回同一实例 (任务组)

- [x] 1. [测试] 多次调用返回同一实例 - 编写测试用例
   - 测试文件: `tests/ui/factories/UIFactoryRegistry.test.ts`
   - 验证 GIVEN-WHEN-THEN 条件
   - _Requirements: UIFactoryRegistry 全局单例与重置_
   - _Scenario: 多次调用返回同一实例_
   - _TaskGroup: 1_

- [x] 2. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/factories/UIFactoryRegistry.test.ts`
   - 预期失败
   - _Validates: 1_
   - _TaskGroup: 1_

- [x] 3. [实现] 实现核心逻辑
   - 实现文件: `src/ui/factories/UIFactoryRegistry.ts`
   - 最小实现，满足测试
   - _Requirements: UIFactoryRegistry 全局单例与重置_
   - _TaskGroup: 1_

- [x] 4. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/factories/UIFactoryRegistry.test.ts`
   - 预期通过
   - _Validates: 3_
   - _TaskGroup: 1_

- [x] 5. [重构] 优化代码（可选）
   - 提高可读性和可维护性
   - _Requirements: UIFactoryRegistry 全局单例与重置_
   - _TaskGroup: 1_

### Scenario 2: resetForTesting 后重新创建实例 (任务组)

- [x] 1. [测试] resetForTesting 后重新创建实例 - 编写测试用例
   - 测试文件: `tests/ui/factories/UIFactoryRegistry.test.ts`
   - 验证 GIVEN-WHEN-THEN 条件
   - _Requirements: UIFactoryRegistry 全局单例与重置_
   - _Scenario: resetForTesting 后重新创建实例_
   - _TaskGroup: 2_

- [x] 2. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/factories/UIFactoryRegistry.test.ts`
   - 预期失败
   - _Validates: 1_
   - _TaskGroup: 2_

- [x] 3. [实现] 实现核心逻辑
   - 实现文件: `src/ui/factories/UIFactoryRegistry.ts`
   - 最小实现，满足测试
   - _Requirements: UIFactoryRegistry 全局单例与重置_
   - _TaskGroup: 2_

- [x] 4. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/factories/UIFactoryRegistry.test.ts`
   - 预期通过
   - _Validates: 3_
   - _TaskGroup: 2_

- [x] 5. [重构] 优化代码（可选）
   - 提高可读性和可维护性
   - _Requirements: UIFactoryRegistry 全局单例与重置_
   - _TaskGroup: 2_

### Scenario 3: TestUIFactory 返回可观察 mock (任务组)

- [x] 1. [测试] TestUIFactory 返回可观察 mock - 编写测试用例
   - 测试文件: `tests/helpers/TestUIFactory.test.ts`
   - 验证 GIVEN-WHEN-THEN 条件
   - _Requirements: TestUIFactory 测试辅助_
   - _Scenario: TestUIFactory 返回可观察 mock_
   - _TaskGroup: 3_

- [x] 2. [验证] Red 阶段
   - 运行: `npm test -- tests/helpers/TestUIFactory.test.ts`
   - 预期失败
   - _Validates: 1_
   - _TaskGroup: 3_

- [x] 3. [实现] 实现核心逻辑
   - 实现文件: `tests/helpers/TestUIFactory.ts`
   - 最小实现，满足测试
   - _Requirements: TestUIFactory 测试辅助_
   - _TaskGroup: 3_

- [x] 4. [验证] Green 阶段
   - 运行: `npm test -- tests/helpers/TestUIFactory.test.ts`
   - 预期通过
   - _Validates: 3_
   - _TaskGroup: 3_

- [x] 5. [重构] 优化代码（可选）
   - 提高可读性和可维护性
   - _Requirements: TestUIFactory 测试辅助_
   - _TaskGroup: 3_

### Scenario 4: 未设置环境变量时默认 terminal (任务组)

- [x] 1. [测试] 未设置环境变量时默认 terminal - 编写测试用例
   - 测试文件: `tests/ui/factories/UIFactoryRegistry.test.ts`
   - 验证 GIVEN-WHEN-THEN 条件
   - _Requirements: UI 类型解析与校验_
   - _Scenario: 未设置环境变量时默认 terminal_
   - _TaskGroup: 4_

- [x] 2. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/factories/UIFactoryRegistry.test.ts`
   - 预期失败
   - _Validates: 1_
   - _TaskGroup: 4_

- [x] 3. [实现] 实现核心逻辑
   - 实现文件: `src/ui/factories/UIFactoryRegistry.ts`
   - 最小实现，满足测试
   - _Requirements: UI 类型解析与校验_
   - _TaskGroup: 4_

- [x] 4. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/factories/UIFactoryRegistry.test.ts`
   - 预期通过
   - _Validates: 3_
   - _TaskGroup: 4_

- [x] 5. [重构] 优化代码（可选）
   - 提高可读性和可维护性
   - _Requirements: UI 类型解析与校验_
   - _TaskGroup: 4_

### Scenario 5: 非法环境变量触发错误 (任务组)

- [x] 1. [测试] 非法环境变量触发错误 - 编写测试用例
   - 测试文件: `tests/ui/factories/UIFactoryRegistry.test.ts`
   - 验证 GIVEN-WHEN-THEN 条件
   - _Requirements: UI 类型解析与校验_
   - _Scenario: 非法环境变量触发错误_
   - _TaskGroup: 5_

- [x] 2. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/factories/UIFactoryRegistry.test.ts`
   - 预期失败
   - _Validates: 1_
   - _TaskGroup: 5_

- [x] 3. [实现] 实现核心逻辑
   - 实现文件: `src/ui/factories/UIFactoryRegistry.ts`
   - 最小实现，满足测试
   - _Requirements: UI 类型解析与校验_
   - _TaskGroup: 5_

- [x] 4. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/factories/UIFactoryRegistry.test.ts`
   - 预期通过
   - _Validates: 3_
   - _TaskGroup: 5_

- [x] 5. [重构] 优化代码（可选）
   - 提高可读性和可维护性
   - _Requirements: UI 类型解析与校验_
   - _TaskGroup: 5_

### Scenario 6: Application 使用同一 UIFactory 实例 (任务组)

- [x] 1. [测试] Application 使用同一 UIFactory 实例 - 编写测试用例
   - 测试文件: `tests/main.test.ts`
   - 验证 GIVEN-WHEN-THEN 条件
   - _Requirements: Application/PermissionManager 复用注入 UIFactory_
   - _Scenario: Application 使用同一 UIFactory 实例_
   - _TaskGroup: 6_

- [x] 2. [验证] Red 阶段
   - 运行: `npm test -- tests/main.test.ts`
   - 预期失败
   - _Validates: 1_
   - _TaskGroup: 6_

- [x] 3. [实现] 实现核心逻辑
   - 实现文件: `src/main.ts`, `src/permissions/PermissionManager.ts`
   - 最小实现，满足测试
   - _Requirements: Application/PermissionManager 复用注入 UIFactory_
   - _TaskGroup: 6_

- [x] 4. [验证] Green 阶段
   - 运行: `npm test -- tests/main.test.ts`
   - 预期通过
   - _Validates: 3_
   - _TaskGroup: 6_

- [x] 5. [重构] 优化代码（可选）
   - 提高可读性和可维护性
   - _Requirements: Application/PermissionManager 复用注入 UIFactory_
   - _TaskGroup: 6_

### Scenario 7: 旧配置 ui 字段被忽略并移除 (任务组)

- [x] 1. [测试] 旧配置 ui 字段被忽略并移除 - 编写测试用例
   - 测试文件: `tests/config/ConfigManager.test.ts`
   - 验证 GIVEN-WHEN-THEN 条件
   - _Requirements: 配置与初始化中的 ui 字段流程_
   - _Scenario: 旧配置 ui 字段被忽略并移除_
   - _TaskGroup: 7_

- [x] 2. [验证] Red 阶段
   - 运行: `npm test -- tests/config/ConfigManager.test.ts`
   - 预期失败
   - _Validates: 1_
   - _TaskGroup: 7_

- [x] 3. [实现] 实现核心逻辑
   - 实现文件: `src/config/SDKConfigLoader.ts`, `src/config/ConfigManager.ts`, `src/permissions/PermissionManager.ts`
   - 最小实现，满足测试
   - _Requirements: 配置与初始化中的 ui 字段流程_
   - _TaskGroup: 7_

- [x] 4. [验证] Green 阶段
   - 运行: `npm test -- tests/config/ConfigManager.test.ts`
   - 预期通过
   - _Validates: 3_
   - _TaskGroup: 7_

- [x] 5. [重构] 优化代码（可选）
   - 提高可读性和可维护性
   - _Requirements: 配置与初始化中的 ui 字段流程_
   - _TaskGroup: 7_
