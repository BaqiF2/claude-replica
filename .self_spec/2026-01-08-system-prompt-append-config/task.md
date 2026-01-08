# 实施计划：系统提示词配置最佳实践

## 概述

重构系统提示词配置逻辑，使用 Claude Agent SDK 的 `claude_code` 预设和 `settingSources` 机制，符合官方最佳实践。

## 任务

- [x] 1. 更新类型定义
  - 修改 `QueryOptions` 接口的 `systemPrompt` 字段为联合类型（支持预设对象格式）
  - 修改 `SDKQueryOptions` 接口，添加 `settingSources` 字段
  - 确保类型兼容性和向后兼容
  - _Requirements: 类型接口支持预设对象格式_

- [x] 2. 重构 MessageRouter 核心方法
  - 删除 `buildSystemPrompt()` 方法
  - 删除 `getDefaultSystemInstructions()` 方法
  - 实现 `getSystemPromptOptions()` 方法（返回 SDK 预设格式）
  - 实现 `buildAppendPrompt()` 方法（仅构建技能和自定义指令）
  - 实现 `getSettingSources()` 方法（返回 `['project']`）
  - _Requirements: SDK 预设系统提示词, 自定义内容仅通过 append 追加, SDK 自动加载 CLAUDE.md, MessageRouter 系统提示词构建逻辑_

- [x] 3. 更新 buildQueryOptions 方法
  - 调用 `getSystemPromptOptions()` 替代旧的 `buildSystemPrompt()`
  - 添加 `settingSources` 字段到返回的 QueryOptions
  - 确保不再手动调用 `loadClaudeMd()`
  - _Requirements: SDK 自动加载 CLAUDE.md, MessageRouter 系统提示词构建逻辑_

- [x] 4. 更新 SDKQueryExecutor 映射逻辑
  - 修改 `mapToSDKOptions()` 方法，添加 settingSources 映射
  - 确保 systemPrompt 预设对象正确传递到 SDK
  - 保持向后兼容（支持字符串 systemPrompt）
  - _Requirements: 类型接口支持预设对象格式_

- [x] 5. 更新 MessageRouter 单元测试
  - 测试 `getSystemPromptOptions()` 方法（无技能 / 有技能场景）
  - 测试 `buildAppendPrompt()` 方法（返回 undefined / 正确格式字符串）
  - 测试 `getSettingSources()` 方法（返回 `['project']`）
  - 测试 `buildQueryOptions()` 方法（正确组合 systemPrompt 对象和 settingSources）
  - 验证 append 不包含 CLAUDE.md 内容
  - _Requirements: SDK 预设系统提示词, 自定义内容仅通过 append 追加, SDK 自动加载 CLAUDE.md_

- [x] 6. 更新 SDKQueryExecutor 单元测试
  - 测试 `mapToSDKOptions()` 正确映射 systemPrompt 预设对象
  - 测试 settingSources 正确映射到 SDK Options
  - 测试向后兼容场景（字符串 systemPrompt）
  - _Requirements: 类型接口支持预设对象格式_

- [x] 7. 集成测试：四种场景组合
  - 测试场景 1：有 CLAUDE.md + 有技能
  - 测试场景 2：有 CLAUDE.md + 无技能
  - 测试场景 3：无 CLAUDE.md + 有技能
  - 测试场景 4：无 CLAUDE.md + 无技能
  - 验证 SDK 正确接收 systemPrompt 和 settingSources
  - 验证 SDK 自动加载 CLAUDE.md 行为
  - _Requirements: SDK 预设系统提示词, 自定义内容仅通过 append 追加, SDK 自动加载 CLAUDE.md_

- [x] 8. 手动验证 SDK 行为
  - 创建测试项目，添加测试 CLAUDE.md 文件
  - 运行应用并观察 SDK query 调用
  - 验证 SDK 是否正确加载 CLAUDE.md（通过行为观察或 SDK 调试日志）
  - 验证技能内容正确追加
  - _Requirements: SDK 自动加载 CLAUDE.md, 自定义内容仅通过 append 追加_

- [x] 9. 更新项目文档
  - 更新 CLAUDE.md 使用说明（说明 settingSources 机制）
  - 说明新的 preset + append 模式
  - 添加配置示例和最佳实践
  - 说明仅支持项目级 CLAUDE.md（不支持用户级）
  - _Requirements: SDK 预设系统提示词, SDK 自动加载 CLAUDE.md_

- [x] 10. 运行完整测试套件
  - 运行所有单元测试（`npm test`）
  - 运行集成测试
  - 确保所有测试通过
  - _Requirements: 所有需求_

- [x] 11. 代码审查和清理
  - 检查是否有遗留的旧代码（`buildSystemPrompt` 引用）
  - 确认 `SDKConfigLoader.loadClaudeMd()` 未被主流程调用
  - 验证日志输出合理（仅在 debug 模式记录 append 和 settingSources）
  - _Requirements: MessageRouter 系统提示词构建逻辑_
