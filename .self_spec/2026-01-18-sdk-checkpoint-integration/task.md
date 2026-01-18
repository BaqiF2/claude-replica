# 实施计划: SDK 文件检查点集成

## 概述
将现有的 RewindManager 替换为基于 Claude Agent SDK 的文件检查点功能,实现自动检查点捕获、恢复界面和配置管理。

## Reference
- Design: [design.md](./design.md)
- Specification: [spec.md](./spec.md)

## 任务

### CheckpointManager 核心实现 (任务组 1)

#### 包含场景
- Scenario: 初始化检查点管理器
- Scenario: 捕获用户消息检查点
- Scenario: 列出可用检查点
- Scenario: 恢复文件到检查点状态

#### 任务列表

- [x] 1. [测试] 编写 CheckpointManager 测试用例
   - 测试文件: `tests/checkpoint/CheckpointManager.test.ts`
   - 覆盖初始化、捕获、列表、恢复、持久化场景
   - _Requirements: SDK 文件检查点管理器_
   - _Scenarios: 初始化检查点管理器, 捕获用户消息检查点, 列出可用检查点, 恢复文件到检查点状态_
   - _TaskGroup: 1_

- [x] 2. [验证] Red 阶段
   - 运行: `npm test -- tests/checkpoint/CheckpointManager.test.ts`
   - 预期失败
   - _Validates: 1_
   - _TaskGroup: 1_

- [x] 3. [实现] 实现 CheckpointManager 类
   - 实现文件: `src/checkpoint/CheckpointManager.ts`, `src/checkpoint/index.ts`
   - 实现 CheckpointMetadata 接口、initialize()、captureCheckpoint()、listCheckpoints()、restoreCheckpoint()、saveCheckpoints()、loadCheckpoints() 方法
   - 检查点数量限制为 10 个 (通过环境变量配置)
   - 存储路径: `~/.claude-replica/sessions/{session-id}/checkpoints/metadata.json`
   - _Requirements: SDK 文件检查点管理器_
   - _Scenarios: 初始化检查点管理器, 捕获用户消息检查点, 列出可用检查点, 恢复文件到检查点状态_
   - _TaskGroup: 1_

- [x] 4. [验证] Green 阶段
   - 运行: `npm test -- tests/checkpoint/CheckpointManager.test.ts`
   - 预期通过
   - _Validates: 3_
   - _TaskGroup: 1_

- [x] 5. [重构] 优化 CheckpointManager 代码(可选)
   - 提高可读性和可维护性
   - _Requirements: SDK 文件检查点管理器_
   - _TaskGroup: 1_

---

### StreamingQueryManager 检查点捕获 (任务组 2)

#### 包含场景
- Scenario: 处理用户消息并捕获检查点
- Scenario: 智能提取检查点描述
- Scenario: 提供 Query 实例访问

#### 任务列表

- [x] 6. [测试] 编写 StreamingQueryManager 检查点捕获测试
   - 测试文件: `tests/sdk/StreamingQueryManager.checkpoint.test.ts`
   - 覆盖用户消息捕获、描述提取、Query 实例访问场景
   - _Requirements: 自动捕获用户消息检查点_
   - _Scenarios: 处理用户消息并捕获检查点, 智能提取检查点描述, 提供 Query 实例访问_
   - _TaskGroup: 2_

- [x] 7. [验证] Red 阶段
   - 运行: `npm test -- tests/sdk/StreamingQueryManager.checkpoint.test.ts`
   - 预期失败
   - _Validates: 6_
   - _TaskGroup: 2_

- [x] 8. [实现] 修改 StreamingQueryManager
   - 实现文件: `src/sdk/StreamingQueryManager.ts`
   - 在 handleSDKMessage() 中添加用户消息 UUID 捕获逻辑
   - 实现 captureUserMessageCheckpoint()、extractCheckpointDescription()、getQueryInstance() 方法
   - 在 StreamingQueryManagerOptions 接口中添加 checkpointManager 可选参数
   - _Requirements: 自动捕获用户消息检查点_
   - _Scenarios: 处理用户消息并捕获检查点, 智能提取检查点描述, 提供 Query 实例访问_
   - _TaskGroup: 2_

- [x] 9. [验证] Green 阶段
   - 运行: `npm test -- tests/sdk/StreamingQueryManager.checkpoint.test.ts`
   - 预期通过
   - _Validates: 8_
   - _TaskGroup: 2_

- [x] 10. [重构] 优化消息处理逻辑(可选)
   - 提高可读性和可维护性
   - _Requirements: 自动捕获用户消息检查点_
   - _TaskGroup: 2_

---

### SDKQueryExecutor 配置集成 (任务组 3)

#### 包含场景
- Scenario: 启用文件检查点并配置 extraArgs

#### 任务列表

- [x] 11. [测试] 编写 SDKQueryExecutor 检查点配置测试
   - 测试文件: `tests/sdk/SDKQueryExecutor.checkpoint.test.ts`
   - 覆盖 enableFileCheckpointing 和 extraArgs 配置场景
   - _Requirements: SDK 检查点配置集成_
   - _Scenarios: 启用文件检查点并配置 extraArgs_
   - _TaskGroup: 3_

- [x] 12. [验证] Red 阶段
   - 运行: `npm test -- tests/sdk/SDKQueryExecutor.checkpoint.test.ts`
   - 预期失败
   - _Validates: 11_
   - _TaskGroup: 3_

- [x] 13. [实现] 修改 SDKQueryExecutor mapToSDKOptions()
   - 实现文件: `src/sdk/SDKQueryExecutor.ts`
   - 在第 755-757 行附近添加检查点配置逻辑
   - 当 enableFileCheckpointing=true 时,自动添加 extraArgs['replay-user-messages']=null
   - _Requirements: SDK 检查点配置集成_
   - _Scenarios: 启用文件检查点并配置 extraArgs_
   - _TaskGroup: 3_

- [x] 14. [验证] Green 阶段
   - 运行: `npm test -- tests/sdk/SDKQueryExecutor.checkpoint.test.ts`
   - 预期通过
   - _Validates: 13_
   - _TaskGroup: 3_

- [x] 15. [重构] 优化配置映射逻辑(可选)
   - 提高可读性和可维护性
   - _Requirements: SDK 检查点配置集成_
   - _TaskGroup: 3_

---

### InteractiveRunner 恢复界面 (任务组 4)

#### 包含场景
- Scenario: 双击 ESC 触发检查点菜单
- Scenario: 用户选择检查点并恢复
- Scenario: 检查点功能未启用时的提示
- Scenario: 无可用检查点时的提示

#### 任务列表

- [x] 16. [测试] 编写 InteractiveRunner 检查点恢复测试
   - 测试文件: `tests/runners/InteractiveRunner.checkpoint.test.ts`
   - 覆盖菜单触发、恢复流程、错误提示场景
   - _Requirements: 交互式检查点恢复界面_
   - _Scenarios: 双击 ESC 触发检查点菜单, 用户选择检查点并恢复, 检查点功能未启用时的提示, 无可用检查点时的提示_
   - _TaskGroup: 4_

- [x] 17. [验证] Red 阶段
   - 运行: `npm test -- tests/runners/InteractiveRunner.checkpoint.test.ts`
   - 预期失败
   - _Validates: 16_
   - _TaskGroup: 4_

- [x] 18. [实现] 重构 InteractiveRunner.handleRewind()
   - 实现文件: `src/runners/InteractiveRunner.ts`
   - 替换 rewindManager 为 checkpointManager 构造函数参数
   - 重写 handleRewind() 方法使用 CheckpointManager
   - 转换检查点为 UISnapshot 格式并调用 ui.showRewindMenu()
   - 实现错误处理和成功/失败提示
   - 在 run() 方法中传递 checkpointManager 给 StreamingQueryManager
   - _Requirements: 交互式检查点恢复界面_
   - _Scenarios: 双击 ESC 触发检查点菜单, 用户选择检查点并恢复, 检查点功能未启用时的提示, 无可用检查点时的提示_
   - _TaskGroup: 4_

- [x] 19. [验证] Green 阶段
   - 运行: `npm test -- tests/runners/InteractiveRunner.checkpoint.test.ts`
   - 预期通过
   - _Validates: 18_
   - _TaskGroup: 4_

- [x] 20. [重构] 优化恢复交互逻辑(可选)
   - 提高可读性和可维护性
   - _Requirements: 交互式检查点恢复界面_
   - _TaskGroup: 4_

---

### 配置管理和验证 (任务组 5)

#### 包含场景
- Scenario: 加载检查点配置选项
- Scenario: 环境变量与配置不一致时的警告

#### 任务列表

- [x] 21. [测试] 编写配置管理测试用例
   - 测试文件: `tests/config/checkpoint-config.test.ts`
   - 覆盖配置加载、环境变量验证场景
   - _Requirements: 检查点配置管理_
   - _Scenarios: 加载检查点配置选项, 环境变量与配置不一致时的警告_
   - _TaskGroup: 5_

- [x] 22. [验证] Red 阶段
   - 运行: `npm test -- tests/config/checkpoint-config.test.ts`
   - 预期失败
   - _Validates: 21_
   - _TaskGroup: 5_

- [x] 23. [实现] 修改 SDKConfigLoader 添加检查点配置
   - 实现文件: `src/config/SDKConfigLoader.ts`
   - 在 ProjectConfig 接口中添加 enableFileCheckpointing (默认 true) 和 checkpointKeepCount (默认 10) 选项
   - _Requirements: 检查点配置管理_
   - _Scenarios: 加载检查点配置选项, 环境变量与配置不一致时的警告_
   - _TaskGroup: 5_

- [x] 24. [验证] Green 阶段
   - 运行: `npm test -- tests/config/checkpoint-config.test.ts`
   - 预期通过
   - _Validates: 23_
   - _TaskGroup: 5_

- [x] 25. [重构] 优化配置验证逻辑(可选)
   - 提高可读性和可维护性
   - _Requirements: 检查点配置管理_
   - _TaskGroup: 5_

---

### 依赖注入架构调整 (任务组 6)

#### 包含场景
- Scenario: Application 初始化 CheckpointManager
- Scenario: RunnerFactory 创建交互式运行器
- Scenario: InteractiveRunner 依赖 CheckpointManager

#### 任务列表

- [x] 26. [测试] 编写依赖注入集成测试
   - 测试文件: `tests/integration/checkpoint-dependency-injection.test.ts`
   - 覆盖 Application、RunnerFactory、InteractiveRunner 的 CheckpointManager 传递场景
   - _Requirements: 依赖注入架构调整_
   - _Scenarios: Application 初始化 CheckpointManager, RunnerFactory 创建交互式运行器, InteractiveRunner 依赖 CheckpointManager_
   - _TaskGroup: 6_

- [x] 27. [验证] Red 阶段
   - 运行: `npm test -- tests/integration/checkpoint-dependency-injection.test.ts`
   - 预期失败
   - _Validates: 26_
   - _TaskGroup: 6_

- [x] 28. [实现] 修改 Application、RunnerFactory、InteractiveRunner
   - 实现文件: `src/main.ts`, `src/runners/RunnerFactory.ts`, `src/runners/InteractiveRunner.ts`
   - 在 main.ts 中移除 RewindManager 初始化,添加 CheckpointManager 初始化和环境变量检查
   - 在 RunnerFactory 中替换 rewindManager 参数为 checkpointManager
   - 确保依赖链正确传递: Application → RunnerFactory → InteractiveRunner → StreamingQueryManager
   - _Requirements: 依赖注入架构调整_
   - _Scenarios: Application 初始化 CheckpointManager, RunnerFactory 创建交互式运行器, InteractiveRunner 依赖 CheckpointManager_
   - _TaskGroup: 6_

- [x] 29. [验证] Green 阶段
   - 运行: `npm test -- tests/integration/checkpoint-dependency-injection.test.ts`
   - 预期通过
   - _Validates: 28_
   - _TaskGroup: 6_

- [x] 30. [重构] 优化依赖注入结构(可选)
   - 提高可读性和可维护性
   - _Requirements: 依赖注入架构调整_
   - _TaskGroup: 6_

---

### 移除 RewindManager 系统 (任务组 7)

#### 包含场景
- (清理任务,无需测试覆盖)

#### 任务列表

- [x] 31. [验证] 确认所有 RewindManager 测试已不再依赖
   - 运行: `npm test`
   - 确保现有测试套件未引用 RewindManager
   - _Requirements: RewindManager 快照管理系统 (REMOVED)_
   - _TaskGroup: 7_

- [x] 32. [实现] 删除 RewindManager 相关文件
   - 删除文件: `src/rewind/RewindManager.ts`, `src/rewind/index.ts`, `tests/rewind/RewindManager.test.ts`
   - 从 main.ts、RunnerFactory.ts、InteractiveRunner.ts 中移除所有 RewindManager 导入和引用
   - _Requirements: RewindManager 快照管理系统 (REMOVED)_
   - _TaskGroup: 7_

- [x] 33. [验证] 运行完整测试套件
   - 运行: `npm test`
   - 确保所有测试通过,无引用错误
   - _Validates: 32_
   - _TaskGroup: 7_

- [x] 34. [验证] 运行构建
   - 运行: `npm run build`
   - 确保构建成功,无编译错误
   - _Validates: 32_
   - _TaskGroup: 7_

---

### 端到端集成测试 (任务组 8)

#### 包含场景
- (完整流程验证)

#### 任务列表

- [x] 35. [测试] 编写端到端检查点流程测试
   - 测试文件: `tests/e2e/checkpoint-flow.test.ts`
   - 覆盖完整流程: 启动会话 → 发送消息 → 捕获检查点 → 恢复检查点 → 验证文件状态
   - _Requirements: 所有需求_
   - _TaskGroup: 8_

- [x] 36. [验证] Red 阶段
   - 运行: `npm test -- tests/e2e/checkpoint-flow.test.ts`
   - 预期失败(如果有未实现功能)
   - _Validates: 35_
   - _TaskGroup: 8_

- [x] 37. [实现] 修复端到端流程问题(如有)
   - 根据测试失败原因修复集成问题
   - _Requirements: 所有需求_
   - _TaskGroup: 8_

- [x] 38. [验证] Green 阶段
   - 运行: `npm test -- tests/e2e/checkpoint-flow.test.ts`
   - 预期通过
   - _Validates: 37_
   - _TaskGroup: 8_

- [x] 39. [验证] 手动端到端测试
   - 设置 CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1
   - 启动交互模式并执行完整用户流程
   - 验证 UI 显示、检查点创建、恢复功能
   - _Validates: 37_
   - _TaskGroup: 8_

- [x] 40. [重构] 优化端到端流程(可选)
   - 提高可读性和可维护性
   - _Requirements: 所有需求_
   - _TaskGroup: 8_

---

## 实施注意事项

### 环境变量要求
```bash
export CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1
```

### 检查点存储路径
```
~/.claude-replica/sessions/{session-id}/checkpoints/metadata.json
```

### 配置文件示例
`.claude-replica/settings.json`:
```json
{
  "enableFileCheckpointing": true,
  "checkpointKeepCount": 10
}
```

### 任务执行顺序
严格按照任务组 1-8 顺序执行,每个任务组内按照 TDD 流程 ([测试] → [验证 Red] → [实现] → [验证 Green] → [重构]) 执行。

### 质量保证
- 所有测试必须通过 (`npm test`)
- 构建必须成功 (`npm run build`)
- 代码必须符合项目规范 (`npm run lint`)
- 手动端到端测试必须验证完整用户流程
