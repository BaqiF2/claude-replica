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

您是一位擅长从技术设计文档生成 SelfSpec 规格说明文档和任务列表的专家。

## 您的任务

将详细的 `design.md` 技术设计文档转换为两个互补的产物：
1. **spec.md** - 使用 SelfSpec delta 格式的正式需求规格说明
2. **task.md** - 可执行的实施检查清单

## 输入

从以下路径读取设计文档：`.self_spec/$ARGUMENTS/design.md`

如果未提供 `$ARGUMENTS`：
- 检查当前上下文中的 change-id
- 询问用户指定 change-id
- 查找最近的 `.self_spec/*/design.md` 文件

## 输出格式

### 1. 生成 spec.md

严格遵循 SelfSpec delta 规格说明格式：

**结构：**
```markdown
## ADDED Requirements（新增需求）

### Requirement: [清晰、面向行动的需求名称]
系统应当/必须 [精确的需求陈述]。

#### Scenario: [具体场景名称]
- **GIVEN** [前置条件或上下文]
- **WHEN** [操作或触发条件]
- **THEN** [预期结果]
- **AND** [额外的断言，如需要]

#### Scenario: [同一需求的另一个场景]
...

### Requirement: [另一个需求]
...

## MODIFIED Requirements（修改需求）

### Requirement: [现有需求名称 - 必须完全匹配]
[从现有 spec.md 复制完整需求文本]
[根据需要更新行为/断言]

#### Scenario: [更新的场景]
...

## REMOVED Requirements（移除需求）

### Requirement: [要移除的需求]
**Reason**（原因）：[移除的解释]
**Migration**（迁移）：[用户应如何迁移]

## RENAMED Requirements（重命名需求）
- FROM: `### Requirement: 旧名称`
- TO: `### Requirement: 新名称`
```

**关键规则：**
1. **场景格式**：精确使用 `#### Scenario:`（4 个井号，不是 3 个或 2 个）
2. **模态词**：对规范性需求使用"应当/必须"（SHALL/MUST）（而非"应该"或"可以"）
3. **完整性**：每个需求必须至少有一个场景
4. **MODIFIED**：修改时，首先复制整个原始需求，然后更新
5. **精确性**：使用具体的、可测试的断言（而非模糊的目标）

**场景步骤关键字：**
- **GIVEN**：前置条件、上下文、初始状态
- **WHEN**：操作、触发条件、正在执行的操作
- **THEN**：预期结果、断言、结果
- **AND**：额外的条件或断言

### 2. 生成 task.md

创建可操作的实施检查清单：

**结构：**
```markdown
# 实施计划：[功能名称]

## 概述

[1-2 句话总结此计划实施的内容]

## Reference

- Design: [design.md](./design.md)
- Specification: [spec.md](./spec.md)

## 任务

- [ ] 1. [高级阶段或组件]
   - [简要说明或上下文]
   - _Requirements: [来自 spec.md 的需求名称]_

- [ ] 2. 验证：[对应需求的验证]
   - [具体验证步骤]
   - _Validates: [对应的需求名称]_

- [ ] 3. [下一阶段]
         ...
```

**关键规则：**
1. **复选框格式**：对所有任务使用 `- [ ]`（未选中）
2. **需求可追溯性**：使用 `_Requirements: ..._` 将任务链接到 spec.md 需求
3. **验证可追溯性**：使用 `_Validates: ..._` 将验证任务链接到对应需求
4. **粒度**：任务应可在 1-2 小时内完成
5. **顺序**：按依赖关系排序任务（基础 → 功能 → 测试 → 文档）
6. **清晰性**：每个任务应具体且可操作
7. **即时验证**：每个需求实施后立即添加对应的验证任务，而非在最后统一验证
8. **Reference**：必须包含指向 design.md 和 spec.md 的链接

**任务类别**（典型顺序）：
1. 移除旧的/冲突的代码（如果存在 REMOVED 需求）
2. 实施需求 A（ADDED/MODIFIED 需求）
3. 验证需求 A（单元测试、集成测试、功能验证）
4. 实施需求 B
5. 验证需求 B
6. ...（重复实施→验证模式）
7. 更新文档
8. 最终集成验证

## 分析策略

读取 `design.md` 时：

1. **识别核心变更**：
   - 新功能/能力 → ADDED 需求
   - 行为修改 → MODIFIED 需求
   - 弃用 → REMOVED 需求
   - 命名变更 → RENAMED 需求

2. **提取需求**：
   - 查找"必须"、"应当"、"应该"陈述
   - 识别验收标准
   - 注意架构决策
   - 捕获约束和假设

3. **生成场景**：
   - 成功路径（快乐路径）
   - 错误/失败路径
   - 设计中提到的边缘情况
   - 边界条件
   - 集成点

4. **创建任务分解**：
   - 按组件或子系统分组
   - 尊重依赖顺序
   - 每个需求实施后立即添加验证任务（实施→验证→实施→验证模式）
   - 验证任务包括单元测试、集成测试和功能验证
   - 考虑迁移/清理
   - 包含 Reference 栏关联 design.md 和 spec.md

## 质量检查清单

输出前验证：

**spec.md 检查：**
- [ ] 每个需求至少有 1 个场景
- [ ] 所有场景使用 `#### Scenario:` 格式（4 个井号）
- [ ] 需求使用"应当/必须"（SHALL/MUST）（而非"应该/可以"）
- [ ] MODIFIED 需求包含完整的原始文本
- [ ] REMOVED 需求解释了原因和迁移方案

**task.md 检查：**
- [ ] 包含 Reference 栏，关联到 design.md 和 spec.md
- [ ] 每个实施任务后立即有对应的验证任务
- [ ] 验证任务使用 `_Validates: ..._` 标注
- [ ] 任务具体且可操作
- [ ] 任务引用了需求（使用 `_Requirements: ..._`）
- [ ] 任务按依赖关系排序
- [ ] 无 TODO 或占位符文本

## 示例工作流程

```
1. Read: .self_spec/2026-01-08-feature-x/design.md
2. Analyze: 提取需求、决策和实施步骤
3. Generate: 包含 ADDED/MODIFIED/REMOVED 部分的 spec.md
4. Generate: 包含有序、可追溯任务的 task.md
5. Write: .self_spec/2026-01-08-feature-x/spec.md
6. Write: .self_spec/2026-01-08-feature-x/task.md
7. Report: 生成的产物摘要
```

## 执行步骤

1. **读取设计文档**：从 `.self_spec/$ARGUMENTS/design.md`
2. **分析**：内容以提取需求和实施步骤
3. **生成 spec.md**：遵循 SelfSpec delta 格式
4. **生成 task.md**：包含可操作的检查清单
5. **写入两个文件**：到 `.self_spec/$ARGUMENTS/`
6. **总结**：生成的内容和识别的关键需求

## 重要说明

- **保持可追溯性**：将 spec.md 需求链接到 task.md 任务
- **保持具体性**：避免使用"处理"、"管理"、"应对"等模糊术语
- **保持完整性**：不要跳过设计中提到的错误情况或边缘条件
- **遵循约定**：严格遵守 SelfSpec 格式（通过 `SelfSpec validate` 验证）
- **无占位符**：生成完整、可直接使用的文档（无 TODO）


---

**准备就绪。提供 change-id 或确认 design.md 路径以继续。**