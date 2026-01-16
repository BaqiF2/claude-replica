---
name: spec
description: 从 design.md 生成 spec.md 和 task.md
version: 1.0.0
author: system
triggers:
   - "/spec"
   - "generate spec from design"
   - "create spec and tasks"
tools:
   - Read
   - Write
   - Glob
arguments:
   - name: change-id
     description: "变更 ID 目录名称（可选，默认从上下文推断）"
     required: false
---

# SelfSpec 生成器命令

从技术设计文档生成 SelfSpec 规格说明和 TDD 任务清单。

## 任务

将 `design.md` 转换为：
1. **spec.md** - SelfSpec delta 格式的需求规格说明
2. **task.md** - TDD 流程的实施检查清单

## 输入

路径：`.self_spec/$ARGUMENTS/design.md`

如果未提供 `$ARGUMENTS`：检查上下文 → 询问用户 → 查找最近的 design.md

## 输出格式

### 1. spec.md - SelfSpec Delta 格式

```markdown
## ADDED Requirements

### Requirement: [清晰的需求名称]
系统应当/必须 [精确的需求陈述]。

#### Scenario: [具体场景名称]
- **GIVEN** [前置条件]
- **WHEN** [操作触发]
- **THEN** [预期结果]
- **AND** [额外断言]

## MODIFIED Requirements

### Requirement: [现有需求名称]
[复制完整原始需求文本并更新]

## REMOVED Requirements

### Requirement: [要移除的需求]
**Reason**：[移除原因]
**Migration**：[迁移方案]

## RENAMED Requirements
- FROM: `### Requirement: 旧名称`
- TO: `### Requirement: 新名称`
```

**关键规则：**
- 场景格式：`#### Scenario:`（4 个井号）
- 模态词：使用"应当/必须"（SHALL/MUST）
- 完整性：每个需求至少 1 个场景
- 精确性：可测试的具体断言

### 2. task.md - TDD 任务清单

```markdown
# 实施计划：[功能名称]

## 概述
[1-2 句话总结]

## Reference
- Design: [design.md](./design.md)
- Specification: [spec.md](./spec.md)

## 任务

### Scenario 1: [场景名称] (任务组)

- [ ] 1. [测试] [Scenario 名称] - 编写测试用例
   - 测试文件: `tests/{module}.test.ts`
   - 验证 GIVEN-WHEN-THEN 条件
   - _Requirements: [需求名称]_
   - _Scenario: [Scenario 名称]_
   - _TaskGroup: 1_

- [ ] 2. [验证] Red 阶段
   - 运行: `npm test -- {test-file}`
   - 预期失败
   - _Validates: 1_
   - _TaskGroup: 1_

- [ ] 3. [实现] 实现核心逻辑
   - 实现文件: `src/{module}.ts`
   - 最小实现，满足测试
   - _Requirements: [需求名称]_
   - _TaskGroup: 1_

- [ ] 4. [验证] Green 阶段
   - 运行: `npm test -- {test-file}`
   - 预期通过
   - _Validates: 3_
   - _TaskGroup: 1_

- [ ] 5. [重构] 优化代码（可选）
   - 提高可读性和可维护性
   - _Requirements: [需求名称]_
   - _TaskGroup: 1_
```

**TDD 流程：**
1. [测试] 编写测试用例
2. [验证] Red - 预期失败
3. [实现] 最小实现
4. [验证] Green - 预期通过
5. [重构] 可选优化

**任务追溯标记：**
- `_Requirements:_` - 链接需求
- `_Scenario:_` - 链接场景
- `_Validates:_` - 链接验证对象
- `_TaskGroup:_` - 标记任务组

## 分析策略

1. **识别变更类型**
   - 新功能 → ADDED
   - 行为修改 → MODIFIED
   - 弃用 → REMOVED
   - 命名变更 → RENAMED

2. **提取需求**
   - 查找"必须/应当"陈述
   - 识别验收标准和架构决策

3. **生成场景**
   - 成功路径、错误路径、边缘情况

4. **创建任务**
   - 每个 Scenario 生成完整 TDD 循环
   - 指定测试文件路径和命令
   - 包含可追溯性标记

## 质量检查

**spec.md：**
- [ ] 每个需求至少 1 个场景
- [ ] 场景格式：`#### Scenario:`
- [ ] 使用"应当/必须"模态词
- [ ] MODIFIED 包含完整原始文本

**task.md：**
- [ ] 包含 Reference 栏
- [ ] 每个 Scenario 有完整 TDD 循环
- [ ] 任务包含追溯标记
- [ ] 使用任务标签前缀
- [ ] 无 TODO 占位符

## 执行步骤

1. Read: `.self_spec/$ARGUMENTS/design.md`
2. Analyze: 提取需求和场景
3. Generate: spec.md（SelfSpec delta 格式）
4. Generate: task.md（TDD 任务清单）
5. Write: 两个文件到 `.self_spec/$ARGUMENTS/`
6. Report: 生成摘要

---

**准备就绪。提供 change-id 或确认 design.md 路径以继续。**