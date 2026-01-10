# SubAgents 使用指南

## 核心概念

SubAgents 是主代理调用的子代理，用于在特定任务上提供更聚焦的能力。Claude Replica 采用程序化预设架构，所有 SubAgents 在代码中定义并由 `AgentRegistry` 暴露给 SDK。

## 预设 SubAgents 一览

| Agent | 适用场景 | 工具组合 | 模型 |
| --- | --- | --- | --- |
| code-reviewer | 代码审查、回归风险检查 | Read, Grep, Glob | sonnet |
| test-runner | 执行测试与失败分析 | Read, Grep, Glob, Bash | sonnet |
| doc-generator | 文档撰写与更新 | Read, Grep, Glob, Write, Edit | sonnet |
| refactoring-specialist | 保持行为不变的重构 | Read, Grep, Glob, Edit, Write | sonnet |
| security-auditor | 安全风险审计与缓解建议 | Read, Grep, Glob | sonnet |
| data-analyzer | 轻量数据/日志分析 | Read, Grep, Glob, Bash | sonnet |

## 使用方式与示例

在 CLI 里直接描述需要的子代理与任务，例如：

- code-reviewer：`请使用 code-reviewer 审查 src/main.ts`
- test-runner：`请使用 test-runner 运行 npm test 并总结失败`
- doc-generator：`请使用 doc-generator 更新 README.md 的使用说明`
- refactoring-specialist：`请使用 refactoring-specialist 重构 src/core/MessageRouter.ts`
- security-auditor：`请使用 security-auditor 审计 src/security/`
- data-analyzer：`请使用 data-analyzer 分析 docs/ 或 logs/ 下的日志数据`

## 关键约束

- 子代理不能使用 `Task` 工具，系统会自动过滤并提示警告。
- 子代理必须包含 `description` 和 `prompt` 字段。
- `model` 仅允许 `sonnet`、`opus`、`haiku`、`inherit`，否则会被修正为 `inherit` 并提示警告。
- 当存在 SubAgents 时，主代理会自动启用 `Task` 工具；若用户在 `disallowedTools` 中显式禁用，则以用户配置为准。

## 最佳实践

### 工具组合推荐

| 目标 | 推荐工具 |
| --- | --- |
| 只读审查与安全审计 | Read, Grep, Glob |
| 测试执行与诊断 | Read, Grep, Glob, Bash |
| 文档更新 | Read, Grep, Glob, Write, Edit |
| 小范围重构 | Read, Grep, Glob, Edit, Write |

### 提示词编写建议

- 明确角色与边界：是否允许改动代码、是否允许运行命令。
- 明确输出格式：是否需要严重性分级、是否需要定位到文件行号。
- 明确上下文：指定要分析的目录或文件列表，避免大范围扫描。

### 模型选择建议

- `sonnet`：通用质量和成本平衡，适合大多数子代理任务。
- `opus`：高复杂度分析与高可靠性需求场景。
- `haiku`：快速、轻量的任务。
- `inherit`：沿用主代理模型设置。

## 常见问题（FAQ）

**Q：为什么子代理不能使用 Task 工具？**  
A：SDK 约束要求子代理不允许调用 Task，避免嵌套代理调用造成不确定性。

**Q：我能添加新的子代理吗？**  
A：当前仅支持预设子代理。如需新增，请在 `src/agents/PresetAgents.ts` 中定义并更新 `AgentRegistry` 流程。

**Q：为什么没有 `.agent.md` 文件？**  
A：系统已迁移为程序化预设架构，移除了文件系统加载方式。

## 故障排查

**症状：子代理没有被调用**  
- 检查输入是否明确指定了预设 agent 名称。
- 检查是否被 `disallowedTools` 禁用了 `Task`。

**症状：模型被改成 inherit**  
- 检查自定义 agent 定义是否使用了非法 model 值。

**症状：子代理无法运行测试**  
- 确认子代理工具组合包含 `Bash`，例如使用 `test-runner`。

## 端到端完整示例

1. 构建并启动 CLI：
   - `npm run build`
   - `npm run start`
2. 触发子代理审查：
   - `请使用 code-reviewer 审查 src/main.ts`
3. 预期行为：
   - 主代理自动启用 `Task` 工具并调用 `code-reviewer`。
   - 子代理使用 Read/Grep/Glob 读取代码，输出问题清单与定位信息。

## 相关代码位置

- 预设定义：`src/agents/PresetAgents.ts`
- 注册与校验：`src/agents/AgentRegistry.ts`
- 初始化输出：`src/main.ts`
