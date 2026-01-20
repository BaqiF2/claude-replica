# 实施计划：Session 维度 Token 统计功能

## 概述

为 Claude Replica 应用新增 session 维度的 token 统计功能，扩展数据接口以追踪缓存 token 使用情况，并通过 /stats 命令在 UI 层显示缓存命中率。

## Reference

- Design: [design.md](design.md)
- Specification: [spec.md](spec.md)

## 任务

### 数据接口扩展 (任务组 1)

#### 包含场景
- Scenario: UsageStats 包含完整的缓存字段
- Scenario: SessionStats 包含完整的累计缓存字段
- Scenario: SDKQueryResult.usage 包含缓存字段

#### 任务列表

- [x] 1. [测试] 编写数据接口测试用例
   - 测试文件: `tests/core/SessionManager.test.ts`
   - 验证 UsageStats 接口包含 cacheCreationInputTokens 和 cacheReadInputTokens 字段
   - 验证 SessionStats 接口包含 totalCacheCreationInputTokens 和 totalCacheReadInputTokens 字段
   - _Requirements: UsageStats 接口扩展, SessionStats 接口扩展_
   - _Scenarios: UsageStats 包含完整的缓存字段, SessionStats 包含完整的累计缓存字段_
   - _TaskGroup: 1_

- [x] 2. [验证] Red 阶段 - 数据接口测试
   - 运行: `npm test -- tests/core/SessionManager.test.ts`
   - 预期失败：接口尚未包含缓存字段
   - _Validates: 1_
   - _TaskGroup: 1_

- [x] 3. [实现] 扩展 UsageStats 和 SessionStats 接口
   - 实现文件: `src/core/SessionManager.ts`
   - 在 UsageStats 接口添加 cacheCreationInputTokens 和 cacheReadInputTokens 字段
   - 在 SessionStats 接口添加 totalCacheCreationInputTokens 和 totalCacheReadInputTokens 字段
   - _Requirements: UsageStats 接口扩展, SessionStats 接口扩展_
   - _Scenarios: UsageStats 包含完整的缓存字段, SessionStats 包含完整的累计缓存字段_
   - _TaskGroup: 1_

- [x] 4. [实现] 扩展 SDKQueryResult 接口
   - 实现文件: `src/sdk/SDKQueryExecutor.ts`
   - 在 SDKQueryResult.usage 添加 cacheCreationInputTokens 和 cacheReadInputTokens 字段
   - _Requirements: SDKQueryResult 接口扩展_
   - _Scenarios: SDKQueryResult.usage 包含缓存字段_
   - _TaskGroup: 1_

- [x] 5. [验证] Green 阶段 - 数据接口测试
   - 运行: `npm test -- tests/core/SessionManager.test.ts`
   - 预期通过：接口已包含所有必需字段
   - _Validates: 3, 4_
   - _TaskGroup: 1_

---

### SDK 响应处理 (任务组 2)

#### 包含场景
- Scenario: 从 SDK result 消息提取缓存字段
- Scenario: SDK 响应缺少缓存字段时使用默认值

#### 任务列表

- [x] 6. [测试] 编写 SDK 响应处理测试用例
   - 测试文件: `tests/sdk/SDKQueryExecutor.test.ts`
   - 验证从 SDK result 消息正确提取 cache_creation_input_tokens 和 cache_read_input_tokens
   - 验证缺少缓存字段时默认为 0
   - _Requirements: SDK 响应缓存字段提取_
   - _Scenarios: 从 SDK result 消息提取缓存字段, SDK 响应缺少缓存字段时使用默认值_
   - _TaskGroup: 2_

- [x] 7. [验证] Red 阶段 - SDK 响应处理测试
   - 运行: `npm test -- tests/sdk/SDKQueryExecutor.test.ts`
   - 预期失败：尚未实现缓存字段提取逻辑
   - _Validates: 6_
   - _TaskGroup: 2_

- [x] 8. [实现] 实现 SDK 缓存字段提取逻辑
   - 实现文件: `src/sdk/SDKQueryExecutor.ts`
   - 在 executeStreaming() 方法中提取 cache_creation_input_tokens 和 cache_read_input_tokens
   - 映射为 cacheCreationInputTokens 和 cacheReadInputTokens
   - 缺少字段时默认为 0
   - _Requirements: SDK 响应缓存字段提取_
   - _Scenarios: 从 SDK result 消息提取缓存字段, SDK 响应缺少缓存字段时使用默认值_
   - _TaskGroup: 2_

- [x] 9. [验证] Green 阶段 - SDK 响应处理测试
   - 运行: `npm test -- tests/sdk/SDKQueryExecutor.test.ts`
   - 预期通过：缓存字段提取逻辑正确实现
   - _Validates: 8_
   - _TaskGroup: 2_

---

### 统计计算逻辑 (任务组 3)

#### 包含场景
- Scenario: 相同消息 ID 只统计一次
- Scenario: 累加所有缓存字段
- Scenario: 加载旧会话数据时缓存字段默认为 0

#### 任务列表

- [x] 10. [测试] 编写统计计算测试用例
   - 测试文件: `tests/core/SessionManager.test.ts`
   - 验证按消息 ID 去重统计
   - 验证正确累加 cacheCreationInputTokens 和 cacheReadInputTokens
   - 验证旧会话数据兼容性（缺少字段默认为 0）
   - _Requirements: SessionManager 按消息 ID 去重统计, 向后兼容性_
   - _Scenarios: 相同消息 ID 只统计一次, 累加所有缓存字段, 加载旧会话数据时缓存字段默认为 0_
   - _TaskGroup: 3_

- [x] 11. [验证] Red 阶段 - 统计计算测试
   - 运行: `npm test -- tests/core/SessionManager.test.ts`
   - 预期失败：尚未实现去重和缓存累加逻辑
   - _Validates: 10_
   - _TaskGroup: 3_

- [x] 12. [实现] 更新 calculateStats() 方法
   - 实现文件: `src/core/SessionManager.ts`
   - 使用 Set 按消息 ID 去重
   - 累加 cacheCreationInputTokens 到 totalCacheCreationInputTokens
   - 累加 cacheReadInputTokens 到 totalCacheReadInputTokens
   - 处理缺少字段的情况（默认为 0）
   - _Requirements: SessionManager 按消息 ID 去重统计, 向后兼容性_
   - _Scenarios: 相同消息 ID 只统计一次, 累加所有缓存字段, 加载旧会话数据时缓存字段默认为 0_
   - _TaskGroup: 3_

- [x] 13. [验证] Green 阶段 - 统计计算测试
   - 运行: `npm test -- tests/core/SessionManager.test.ts`
   - 预期通过：统计计算逻辑正确实现
   - _Validates: 12_
   - _TaskGroup: 3_

---

### Runner 层接口 (任务组 4)

#### 包含场景
- Scenario: InteractiveUIRunner 定义 getSessionStatsData 方法
- Scenario: 存在活跃会话时返回统计数据
- Scenario: 无活跃会话时返回空统计

#### 任务列表

- [x] 14. [测试] 编写 Runner 接口测试用例
   - 测试文件: `tests/runners/InteractiveRunner.test.ts`
   - 验证 getSessionStatsData() 存在活跃会话时返回正确统计
   - 验证无活跃会话时返回空统计对象
   - _Requirements: InteractiveUIRunner 接口扩展, InteractiveRunner 实现 getSessionStatsData_
   - _Scenarios: InteractiveUIRunner 定义 getSessionStatsData 方法, 存在活跃会话时返回统计数据, 无活跃会话时返回空统计_
   - _TaskGroup: 4_

- [x] 15. [验证] Red 阶段 - Runner 接口测试
   - 运行: `npm test -- tests/runners/InteractiveRunner.test.ts`
   - 预期失败：尚未实现 getSessionStatsData() 方法
   - _Validates: 14_
   - _TaskGroup: 4_

- [x] 16. [实现] 扩展 InteractiveUIRunner 接口
   - 实现文件: `src/ui/InteractiveUIInterface.ts`
   - 添加 getSessionStatsData(): Promise<SessionStats> 方法声明
   - _Requirements: InteractiveUIRunner 接口扩展_
   - _Scenarios: InteractiveUIRunner 定义 getSessionStatsData 方法_
   - _TaskGroup: 4_

- [x] 17. [实现] 实现 InteractiveRunner.getSessionStatsData()
   - 实现文件: `src/runners/InteractiveRunner.ts`
   - 获取活跃会话并调用 sessionManager.calculateSessionStats()
   - 无活跃会话时返回空统计对象
   - _Requirements: InteractiveRunner 实现 getSessionStatsData_
   - _Scenarios: 存在活跃会话时返回统计数据, 无活跃会话时返回空统计_
   - _TaskGroup: 4_

- [x] 18. [验证] Green 阶段 - Runner 接口测试
   - 运行: `npm test -- tests/runners/InteractiveRunner.test.ts`
   - 预期通过：getSessionStatsData() 方法正确实现
   - _Validates: 16, 17_
   - _TaskGroup: 4_

---

### UI 层 /stats 命令 (任务组 5)

#### 包含场景
- Scenario: /stats 命令显示详细统计
- Scenario: 缓存命中率计算与显示格式
- Scenario: input_tokens 为 0 时命中率显示
- Scenario: /help 显示 /stats 命令说明

#### 任务列表

- [x] 19. [测试] 编写 /stats 命令测试用例
   - 测试文件: `tests/ui/TerminalInteractiveUI.test.ts`
   - 验证 /stats 命令显示 token 统计和缓存命中率
   - 验证缓存命中率计算公式和显示格式
   - 验证 input_tokens 为 0 时命中率显示为 "0.0%"
   - 验证 /help 包含 /stats 命令说明
   - _Requirements: /stats 命令实现, /help 命令更新_
   - _Scenarios: /stats 命令显示详细统计, 缓存命中率计算与显示格式, input_tokens 为 0 时命中率显示, /help 显示 /stats 命令说明_
   - _TaskGroup: 5_

- [x] 20. [验证] Red 阶段 - /stats 命令测试
   - 运行: `npm test -- tests/ui/TerminalInteractiveUI.test.ts`
   - 预期失败：尚未实现 /stats 命令
   - _Validates: 19_
   - _TaskGroup: 5_

- [x] 21. [实现] 实现 /stats 命令处理
   - 实现文件: `src/ui/TerminalInteractiveUI.ts`
   - 在 handleSlashCommand() 中添加 'stats' case
   - 实现 showSessionStats() 方法调用 runner.getSessionStatsData()
   - 实现 displaySessionStats() 方法显示统计信息
   - _Requirements: /stats 命令实现_
   - _Scenarios: /stats 命令显示详细统计, 缓存命中率计算与显示格式, input_tokens 为 0 时命中率显示_
   - _TaskGroup: 5_

- [x] 22. [实现] 更新 /help 命令
   - 实现文件: `src/ui/TerminalInteractiveUI.ts`
   - 在帮助文本中添加 "/stats - Show session token statistics (including cache breakdown)"
   - _Requirements: /help 命令更新_
   - _Scenarios: /help 显示 /stats 命令说明_
   - _TaskGroup: 5_

- [x] 23. [验证] Green 阶段 - /stats 命令测试
   - 运行: `npm test -- tests/ui/TerminalInteractiveUI.test.ts`
   - 预期通过：/stats 命令正确实现
   - _Validates: 21, 22_
   - _TaskGroup: 5_

---

### 集成验证 (任务组 6)

#### 包含场景
- 全流程集成验证

#### 任务列表

- [x] 24. [测试] 编写端到端集成测试
   - 测试文件: `tests/integration/session-stats.test.ts`
   - 验证从 SDK 响应到 UI 显示的完整数据流
   - 验证缓存统计在多轮对话中正确累加
   - _Requirements: 全部需求_
   - _Scenarios: 全部场景_
   - _TaskGroup: 6_

- [x] 25. [验证] 集成测试验证
   - 运行: `npm test -- tests/integration/session-stats.test.ts`
   - 预期通过：端到端流程正确
   - _Validates: 24_
   - _TaskGroup: 6_

- [x] 26. [验证] 全量测试验证
   - 运行: `npm test`
   - 预期通过：所有测试通过，无回归
   - _Validates: 1-25_
   - _TaskGroup: 6_

- [x] 27. [重构] 代码优化（可选）
   - 检查代码风格一致性
   - 优化可读性和可维护性
   - 确保符合项目编码规范
   - _Requirements: 全部需求_
   - _TaskGroup: 6_
