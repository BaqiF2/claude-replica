# 实施计划: SubAgent 最佳实践架构迁移

## 概述

将 Claude Replica 的 SubAgent 实现从文件系统方式完全迁移到程序化定义架构,提供 6 个预设 agents,移除 .agent.md 文件支持,确保完全符合 Claude Agent SDK 最佳实践。

## 任务

- [x] 1. 创建 PresetAgents 模块定义预设 SubAgents
  - 新建 `src/agents/PresetAgents.ts` 文件
  - 定义 6 个预设 agents: code-reviewer, test-runner, doc-generator, refactoring-specialist, security-auditor, data-analyzer
  - 为每个 agent 配置最佳实践的工具组合(如 code-reviewer 使用 Read/Grep/Glob 只读工具)
  - 编写高质量的 description 和 prompt(展示最佳实践)
  - 实现导出函数: getPresetAgents(), getPresetAgentNames(), isPresetAgent()
  - 确保所有 agent 定义不包含 Task 工具
  - 添加完整的文件头文档说明模块功能和导出
  - _Requirements: 系统应当提供代码中定义的预设 SubAgents, 系统应当提供 PresetAgents 模块导出预设 Agent 定义_

- [x] 2. 重构 AgentRegistry 移除文件系统加载逻辑
  - 完全重写 `src/agents/AgentRegistry.ts` 文件
  - 删除 loadAgents() 方法及所有文件系统扫描代码
  - 删除 parseAgentFile() 方法及所有 YAML frontmatter 解析代码
  - 简化 getAll() 方法为直接返回 getPresetAgents()
  - 简化 getAgent(name) 方法为从预设 agents 中查找
  - 保持 getAgentsForSDK() 方法,返回 SDK 兼容格式
  - 实现 validateAgentDefinitions() 静态方法,包含以下验证逻辑:
    - 验证 description 和 prompt 必需字段
    - 自动过滤子代理中的 Task 工具并输出警告
    - 验证 model 字段有效性(sonnet/opus/haiku/inherit),无效则修正为 inherit 并警告
  - 更新文件头文档说明移除文件加载,采用程序化定义
  - _Requirements: 系统应当移除基于文件系统的 Agent 加载方式, 系统应当验证并自动修正 Agent 定义以符合 SDK 约束, 系统应当简化 AgentRegistry 实现为仅返回预设 Agents_

- [X] 3. 更新 Application 初始化逻辑
  - 修改 `src/main.ts` 中的 loadCustomExtensions() 方法
  - 移除 agentRegistry.loadAgents() 调用及目录路径配置
  - 添加预设 agents 数量的控制台输出: "SubAgents initialized: {count} preset agent(s)"
  - 确保 AgentRegistry 无需外部初始化即可工作
  - _Requirements: 系统应当移除基于文件系统的 Agent 加载方式_

- [x] 4. 实现主代理自动启用 Task 工具逻辑
  - 修改 `src/core/MessageRouter.ts` 中的 getEnabledToolNames() 方法
  - 添加检测逻辑: 调用 getAgentDefinitions(session) 检查是否有 agents
  - 如果存在 agents 且 Task 工具不在列表中,自动添加 Task 工具
  - 输出信息日志: "Info: Task tool automatically enabled because subAgents are defined..."
  - 确保 disallowedTools 配置能覆盖自动添加(用户显式禁用优先)
  - _Requirements: 系统应当在有 SubAgents 定义时自动启用主代理的 Task 工具_

- [x] 5. 编写 PresetAgents 单元测试
  - 创建 `tests/unit/agents/PresetAgents.test.ts` 文件
  - 测试 getPresetAgents() 返回 6 个 agents
  - 测试所有预设 agents 不包含 Task 工具
  - 测试所有预设 agents 具有有效的 description(长度 > 20)
  - 测试所有预设 agents 具有有效的 prompt(长度 > 50)
  - 测试 getPresetAgentNames() 返回正确的名称列表
  - 测试 isPresetAgent() 正确识别预设 agent
  - _Requirements: 系统应当提供代码中定义的预设 SubAgents, 系统应当提供 PresetAgents 模块导出预设 Agent 定义_

- [x] 6. 编写 AgentRegistry 单元测试
  - 重写 `tests/unit/agents/AgentRegistry.test.ts` 文件
  - 测试 getAll() 返回恰好 6 个预设 agents
  - 测试 getAll() 包含所有预设 agent 名称
  - 测试 getAgent(name) 正确返回指定 agent 或 undefined
  - 测试 validateAgentDefinitions() 自动过滤 Task 工具并输出警告
  - 测试 validateAgentDefinitions() 验证 description 必需字段
  - 测试 validateAgentDefinitions() 验证 prompt 必需字段
  - 测试 validateAgentDefinitions() 修正无效 model 值
  - _Requirements: 系统应当验证并自动修正 Agent 定义以符合 SDK 约束, 系统应当简化 AgentRegistry 实现为仅返回预设 Agents_

- [x] 7. 编写 MessageRouter 集成测试
  - 更新 `tests/integration/sdk-agent-skills.test.ts` 文件
  - 测试预设 agents 自动加载
  - 测试每次获取的 agents 一致性
  - 测试有 agents 时主代理自动启用 Task 工具
  - 测试无 agents 时不自动添加 Task 工具
  - 测试 disallowedTools 配置覆盖自动添加
  - _Requirements: 系统应当在有 SubAgents 定义时自动启用主代理的 Task 工具_

- [x] 8. 端到端手动测试
  - 运行 `npm run build` 编译项目
  - 运行 `npm run start` 启动 CLI
  - 验证控制台输出 "SubAgents initialized: 6 preset agent(s)"
  - 测试用户输入 "请使用 code-reviewer 审查 src/main.ts"
  - 验证主代理正确调用 code-reviewer 子代理
  - 验证子代理使用 Read/Grep/Glob 工具分析代码
  - 验证返回代码审查结果
  - _Requirements: 所有需求的端到端验证_

- [x] 9. 更新 CLAUDE.md 文档
  - 重写 `.claude/CLAUDE.md` 的 Agents System 章节
  - 说明程序化定义架构替代文件系统方式
  - 列出 6 个预设 agents 及其场景、工具组合、模型
  - 说明关键 SDK 约束(子代理不能用 Task,主代理自动启用 Task)
  - 提供推荐工具组合表格
  - 说明代码位置: PresetAgents.ts, AgentRegistry.ts, main.ts
  - _Requirements: 文档更新以反映新架构_

- [x] 10. 创建 SubAgents 使用指南
  - 新建 `docs/subagents-guide.md` 文件
  - 说明 SubAgents 核心概念和使用场景
  - 详细介绍 6 个预设 agents 及其使用示例
  - 说明关键约束: Task 工具限制、必需字段
  - 提供最佳实践: 工具组合、提示词编写、模型选择
  - 包含常见问题 FAQ 和故障排查
  - 提供端到端完整使用案例
  - _Requirements: 用户指南文档_

- [x] 11. 运行完整测试套件
  - 运行 `npm test` 执行所有单元测试
  - 运行 `npm run test:integration` 执行集成测试
  - 确保所有测试通过
  - 检查测试覆盖率报告
  - _Requirements: 测试验证所有需求实现_

- [x] 12. 验证和代码审查
  - 检查所有新增/修改文件的文件头文档
  - 验证魔法值已定义为具名常量
  - 验证日志和异常消息使用英文
  - 运行 `npm run lint` 和 `npm run format:check`
  - 执行代码审查确保符合项目规范
  - _Requirements: 代码质量和规范验证_
