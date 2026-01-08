# OpenSpec 使用指引

面向使用 OpenSpec 进行规格驱动开发的 AI 编码助理。

## TL;DR 快速清单

- 先查现有工作：`openspec spec list --long`、`openspec list`（全文检索才用 `rg`）
- 判断范围：是新增能力还是修改既有能力
- 选唯一的 `change-id`：kebab-case，动词开头（`add-`、`update-`、`remove-`、`refactor-`）
- 脚手架：`proposal.md`、`tasks.md`、`design.md`（必要时）、以及受影响能力的 delta spec
- 写 delta：使用 `## ADDED|MODIFIED|REMOVED|RENAMED Requirements`，每个 Requirement 至少一个 `#### Scenario:`
- 校验：`openspec validate [change-id] --strict` 并修正错误
- 请求审批：提案获批前不要开始实现

## 三阶段工作流

### 阶段 1：创建变更
需要创建提案的场景：
- 新增功能或能力
- 产生破坏性变更（API、Schema）
- 修改架构或模式  
- 性能优化导致行为变化
- 安全策略调整

触发语句示例：
- “Help me create a change proposal”
- “Help me plan a change”
- “Help me create a proposal”
- “I want to create a spec proposal”
- “I want to create a spec”

模糊匹配建议：
- 同时包含 `proposal/change/spec` 与 `create/plan/make/start/help` 之一

无需提案的情况：
- Bug 修复（恢复既有行为）
- 拼写/格式/注释
- 非破坏性的依赖升级
- 配置变更
- 针对既有行为的测试

**流程**
1. 阅读 `openspec/project.md`、`openspec list`、`openspec list --specs` 获取上下文。
2. 选择唯一动词前缀的 `change-id`，并在 `openspec/changes/<id>/` 下创建 `proposal.md`、`tasks.md`、可选的 `design.md` 以及各能力的 delta spec。
3. 编写 delta：使用 `## ADDED|MODIFIED|REMOVED Requirements`，每个 Requirement 至少一个 `#### Scenario:`。
4. 执行 `openspec validate <id> --strict`，确保通过后再分享提案。

### 阶段 2：实现变更
把这些步骤当作 TODO，逐项完成：
1. **阅读 proposal.md**——理解目标
2. **阅读 design.md**（如存在）——掌握技术决策
3. **阅读 tasks.md**——获取执行清单
4. **按顺序执行任务**——逐项完成
5. **确认完成度**——确保 `tasks.md` 中每项都已完成再更新状态
6. **更新清单**——全部完成后把任务改成 `- [x]`
7. **审批门禁**——提案审核通过前不要动手实现

### 阶段 3：归档变更
上线后提交独立 PR：
- 将 `changes/[name]/` → `changes/archive/YYYY-MM-DD-[name]/`
- 如果能力发生变化，同步更新 `specs/`
- 工具类变更可用 `openspec archive <change-id> --skip-specs --yes`（务必显式指定 change-id）
- 运行 `openspec validate --strict` 确认归档变更通过校验

## 开工前检查

**上下文检查清单：**
- [ ] 阅读相关能力的 `specs/[capability]/spec.md`
- [ ] 查看 `changes/` 中的未决变更避免冲突
- [ ] 阅读 `openspec/project.md` 了解约定
- [ ] 执行 `openspec list` 查看活跃变更
- [ ] 执行 `openspec list --specs` 了解现有能力

**创建 spec 前：**
- 先确认该能力是否已存在
- 优先修改现有 spec，避免重复
- 使用 `openspec show [spec]` 查看当前状态
- 如果需求模糊，先问 1–2 个澄清问题

### 检索指引
- 枚举 specs：`openspec spec list --long`（脚本可用 `--json`）
- 枚举 changes：`openspec list`（或过时但可用的 `openspec change list --json`）
- 查看详情：
  - Spec：`openspec show <spec-id> --type spec`（过滤时可用 `--json`）
  - Change：`openspec show <change-id> --json --deltas-only`
- 全文检索（用 ripgrep）：`rg -n "Requirement:|Scenario:" openspec/specs`

## 快速入门

### CLI 命令

```bash
# 常用命令
openspec list                  # 查看活跃变更
openspec list --specs          # 查看能力列表
openspec show [item]           # 展示 change 或 spec
openspec validate [item]       # 校验 change 或 spec
openspec archive <change-id> [--yes|-y]   # 上线后归档（非交互加 --yes）

# 项目管理
openspec init [path]           # 初始化 OpenSpec
openspec update [path]         # 更新指令文件

# 交互模式
openspec show                  # 交互式选择
openspec validate              # 批量校验模式

# 调试
openspec show [change] --json --deltas-only
openspec validate [change] --strict
```

### 命令常用参数

- `--json`：机器可读输出
- `--type change|spec`：区分 change 或 spec
- `--strict`：严格校验
- `--no-interactive`：禁用交互提示
- `--skip-specs`：归档时跳过 spec 更新
- `--yes`/`-y`：跳过确认（非交互归档）

## 目录结构

```
openspec/
├── project.md              # 项目约定
├── specs/                  # 事实真相层——当前已交付内容
│   └── [capability]/       # 单一聚焦能力
│       ├── spec.md         # 需求与场景
│       └── design.md       # 技术方案
├── changes/                # 提案层——计划中的变化
│   ├── [change-name]/
│   │   ├── proposal.md     # Why / What / Impact
│   │   ├── tasks.md        # 实施清单
│   │   ├── design.md       # 技术决策（按需）
│   │   └── specs/          # Delta 规格
│   │       └── [capability]/
│   │           └── spec.md # ADDED/MODIFIED/REMOVED
│   └── archive/            # 已完成变更
```

## 创建变更提案

### 决策树

```
有新诉求？
├─ 恢复既有行为的 Bug 修？→ 直接修
├─ 拼写/格式/注释？→ 直接修  
├─ 新功能/新能力？→ 写提案
├─ 破坏性变更？→ 写提案
├─ 架构级调整？→ 写提案
└─ 不确定？→ 写提案（更安全）
```

### 提案结构

1. **创建目录：** `changes/[change-id]/`（kebab-case，动词开头且唯一）
2. **撰写 proposal.md：**
```markdown
# Change: [变更简述]

## Why
[1-2 句说明动机/问题]

## What Changes
- [列出计划修改]
- [破坏性变更使用 **BREAKING** 标注]

## Impact
- Affected specs: [受影响能力]
- Affected code: [关键文件/子系统]
```

3. **创建 delta spec：** `specs/[capability]/spec.md`
```markdown
## ADDED Requirements
### Requirement: New Feature
The system SHALL provide...

#### Scenario: Success case
- **WHEN** user performs action
- **THEN** expected result

## MODIFIED Requirements
### Requirement: Existing Feature
[粘贴并更新完整需求]

## REMOVED Requirements
### Requirement: Old Feature
**Reason**: [移除原因]
**Migration**: [迁移方式]
```
如影响多个能力，在 `changes/[change-id]/specs/<capability>/spec.md` 下按能力拆分多个文件。

4. **创建 tasks.md：**
```markdown
## 1. Implementation
- [ ] 1.1 创建数据库 Schema
- [ ] 1.2 实现 API Endpoint
- [ ] 1.3 添加前端组件
- [ ] 1.4 编写测试
```

5. **按需新增 design.md：** 当满足以下任意条件时添加，否则省略：
- 跨多个服务/模块或引入新架构模式
- 新的外部依赖或重大数据模型变更
- 涉及安全、性能或复杂迁移
- 需要在编码前先定技术方案的模糊需求

最小 `design.md` 模板：
```markdown
## Context
[背景/约束/干系人]

## Goals / Non-Goals
- Goals: [...]
- Non-Goals: [...]

## Decisions
- Decision: [结论与原因]
- Alternatives considered: [备选方案与取舍]

## Risks / Trade-offs
- [风险] → 缓解措施

## Migration Plan
[步骤与回滚]

## Open Questions
- [...]
```

## Spec 文件格式

### 关键：Scenario 书写

**正确示例**（使用 `####` 标题）：
```markdown
#### Scenario: User login success
- **WHEN** valid credentials provided
- **THEN** return JWT token
```

**错误示例**：
```markdown
- **Scenario: User login**  ❌
**Scenario**: User login     ❌
### Scenario: User login      ❌
```

每个 Requirement 至少要有一个 Scenario。

### Requirement 措辞
- 规范性需求使用 SHALL/MUST；除非特意放宽，避免使用 should/may

### Delta 操作

- `## ADDED Requirements`：新增能力
- `## MODIFIED Requirements`：修改行为
- `## REMOVED Requirements`：删除能力
- `## RENAMED Requirements`：仅改名

标题按 `trim(header)` 精确匹配。

#### 何时使用 ADDED vs MODIFIED
- ADDED：新增独立能力或子能力。若只是新增一个平行关注点，优先 ADDED（例如新增 “Slash Command Configuration”）。
- MODIFIED：修改既有需求的行为/范围/验收标准。请粘贴完整需求（标题+全部场景），因为归档时会用你提供的内容覆盖旧版本。
- RENAMED：仅名称变更。若同时修改行为，需先 RENAMED 再 MODIFIED（使用新名称）。

常见错误：使用 MODIFIED 添加新内容却未包含旧文本，导致归档时丢失历史。如果没有确实修改既有需求，请放到 ADDED。

正确撰写 MODIFIED 的步骤：
1. 在 `openspec/specs/<capability>/spec.md` 找到目标需求。
2. 复制从 `### Requirement: ...` 到其全部 Scenario。
3. 粘贴到 `## MODIFIED Requirements` 下并更新为新行为。
4. 确认标题完全一致并至少带一个 `#### Scenario:`。

RENAMED 示例：
```markdown
## RENAMED Requirements
- FROM: `### Requirement: Login`
- TO: `### Requirement: User Authentication`
```

## 故障排查

### 常见错误

**“Change must have at least one delta”**
- 检查 `changes/[name]/specs/` 是否存在 .md 文件
- 确认文件包含 `## ADDED Requirements` 等操作头

**“Requirement must have at least one scenario”**
- 检查 Scenario 是否使用 `#### Scenario:` 格式（4 个 #）
- 不要用项目符号或加粗来模拟标题

**静默的场景解析失败**
- 需严格使用 `#### Scenario: Name`
- 调试命令：`openspec show [change] --json --deltas-only`

### 校验技巧

```bash
# 始终使用严格模式拿到完整检查
openspec validate [change] --strict

# 调试 delta 解析
openspec show [change] --json | jq '.deltas'

# 查看指定 Requirement
openspec show [spec] --json -r 1
```

## Happy Path 示例脚本

```bash
# 1) 查看现状
openspec spec list --long
openspec list
# 可选全文检索：
# rg -n "Requirement:|Scenario:" openspec/specs
# rg -n "^#|Requirement:" openspec/changes

# 2) 选择 change id 并脚手架
CHANGE=add-two-factor-auth
mkdir -p openspec/changes/$CHANGE/{specs/auth}
printf "## Why\n...\n\n## What Changes\n- ...\n\n## Impact\n- ...\n" > openspec/changes/$CHANGE/proposal.md
printf "## 1. Implementation\n- [ ] 1.1 ...\n" > openspec/changes/$CHANGE/tasks.md

# 3) 添加 delta（示例）
cat > openspec/changes/$CHANGE/specs/auth/spec.md << 'EOF'
## ADDED Requirements
### Requirement: Two-Factor Authentication
Users MUST provide a second factor during login.

#### Scenario: OTP required
- **WHEN** valid credentials are provided
- **THEN** an OTP challenge is required
EOF

# 4) 校验
openspec validate $CHANGE --strict
```

## 多能力示例

```
openspec/changes/add-2fa-notify/
├── proposal.md
├── tasks.md
└── specs/
    ├── auth/
    │   └── spec.md   # ADDED: Two-Factor Authentication
    └── notifications/
        └── spec.md   # ADDED: OTP email notification
```

auth/spec.md
```markdown
## ADDED Requirements
### Requirement: Two-Factor Authentication
...
```

notifications/spec.md
```markdown
## ADDED Requirements
### Requirement: OTP Email Notification
...
```

## 最佳实践

### 简洁优先
- 默认新增代码 <100 行
- 单文件实现，除非确有必要拆分
- 无充分理由不要引入新框架
- 选择可靠、成熟的模式

### 复杂度触发条件
仅在下列情况引入复杂度：
- 有性能数据证明当前方案过慢
- 明确的规模需求（>1000 用户或 >100MB 数据）
- 多个已验证用例确实需要抽象

### 清晰引用
- 代码位置使用 `file.ts:42`
- spec 引用写成 `specs/auth/spec.md`
- 关联更改与 PR 请显式链接

### 能力命名
- 使用动词-名词：`user-auth`、`payment-capture`
- 每个能力只表达一个目的
- 遵循 “10 分钟理解” 原则
- 描述若需要 “AND” 则应拆分

### change-id 命名
- 使用简短、描述性的 kebab-case：`add-two-factor-auth`
- 优先动词前缀：`add-`、`update-`、`remove-`、`refactor-`
- 若重名可追加 `-2`、`-3`

## 工具选择指南

| 任务 | 工具 | 原因 |
|------|------|-----|
| 按模式找文件 | Glob | 模式匹配快 |
| 搜索代码内容 | Grep | 正则优化过 |
| 读取特定文件 | Read | 直接访问 |
| 探索未知范围 | Task | 便于多步骤调查 |

## 故障恢复

### 变更冲突
1. 运行 `openspec list` 查看活跃变更
2. 检查是否存在重叠 spec
3. 与变更负责人沟通
4. 必要时合并提案

### 校验失败
1. 使用 `--strict` 运行
2. 查看 JSON 输出定位问题
3. 检查 spec 文件格式
4. 确认 Scenario 格式正确

### 缺乏上下文
1. 先读 project.md
2. 检查相关 specs
3. 回顾最近归档
4. 提问澄清

## 快速参考

### 阶段指示
- `changes/`：提案，尚未实现
- `specs/`：已实现、线上真实行为
- `archive/`：完成并归档

### 文件作用
- `proposal.md`：动机与范围
- `tasks.md`：执行步骤
- `design.md`：技术决策
- `spec.md`：需求与行为

### CLI 速查
```bash
openspec list              # 查看进行中工作
openspec show [item]       # 查看详情
openspec validate --strict # 校验正确性
openspec archive <change-id> [--yes|-y]  # 标记完成（自动化请加 --yes）
```

牢记：Specs 是事实，Changes 是计划。务必保持同步。
