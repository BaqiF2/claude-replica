# Slash Command迁移到SDK原生支持实施方案

## 项目概述

项目名称：Claude Replica v1 (Cape Town)
分支：BaqiF2/cape-town
任务：将当前独立实现的CommandManager迁移到SDK原生slash commands支持

## 当前实现分析

### 架构现状
- **独立实现**：CommandManager在应用层独立处理slash commands，不经过SDK
- **目录结构**：
  - 项目级：`.claude-replica/commands/` 和 `.claude/commands/`（混合使用）
  - **仅支持项目级commands**：不包含用户级目录
  - **目标**：只使用`.claude/commands/`目录（符合SDK规范）
- **调用流程**：handleUserMessage() → 检测 `/` → handleCommand() → CommandManager → 生成prompt传递给SDK
- **核心文件**：
  - `src/commands/CommandManager.ts`（350行）
  - `src/main.ts:151-169`（加载）
  - `src/main.ts:322-400`（调用）

### 命令格式
```markdown
---
name: review
description: 代码审查
argumentHint: <file>
allowedTools: [Read, Grep]
---
命令模板内容
$ARGUMENTS
!`pwd`  # 命令嵌入
```

### MessageRouter集成点
- `buildQueryOptions()`: 构建SDK选项
- `getSettingSources()`: 返回`['project']`
- **未集成**：slash commands未被传递给SDK

## 迁移目标

### SDK官方规范要求
1. **目录结构**：
   - **项目命令**：`.claude/commands/`
   - **仅项目级**：不实现个人命令目录
   - 文件格式：`.md`文件，YAML frontmatter可选

2. **支持的frontmatter字段**：
   - `allowed-tools`: 工具白名单
   - `description`: 命令描述
   - `model`: 模型选择
   - `argument-hint`: 参数提示

3. **参数占位符**：
   - `$1`, `$2`, `$3`... （不是`$ARGUMENTS`）
   - SDK原生支持参数解析和替换

4. **特性对比**：
   - **当前支持但SDK不支持**：`!`command``命令嵌入
   - **当前格式需要修改**：`allowedTools` → `allowed-tools`

### 用户要求
- ✅ 完全迁移到SDK原生支持
- ✅ 以官方文档为准，不保留任何自定义特性
- ✅ 符合SDK最佳实践
- ✅ **仅支持项目级commands**：不实现用户级commands

## 详细实施计划

### 1. 架构调整方案

#### 目录使用
```bash
# 仅使用SDK标准目录
.claude/commands/  # 符合SDK原生规范
```

#### 处理流程变化
```
当前: handleUserMessage() → 检测"/" → handleCommand() → CommandManager → 生成prompt → SDK

迁移后: handleUserMessage() → 直接传递给SDK → SDK原生处理commands
```

#### MessageRouter集成点调整
- 保持`getSettingSources()`返回`['project']`
- 移除CommandManager从Application中
- 删除所有slash commands检测逻辑

### 2. 配置迁移方案

#### frontmatter字段映射

| 当前字段 | SDK规范 | 说明 |
|---------|--------|------|
| `allowedTools` | `allowed-tools` | 字段名变更 |
| `argumentHint` | `argument-hint` | 字段名变更 |
| `description` | `description` | 保持不变 |
| `model` | `model` | 当前不支持，需新增 |

#### 参数占位符迁移

**当前格式：**
```markdown
$ARGUMENTS  # 单一占位符，包含所有参数
```

**SDK格式：**
```markdown
$1  # 第一个参数
$2  # 第二个参数
$3  # 第三个参数
```

#### SDK命令格式示例

**命令文件示例（`.claude/commands/review.md`）：**
```markdown
---
allowed-tools: Read, Grep
description: 代码审查
argument-hint: <file>
---

请审查以下文件：
$1
```

### 3. 代码变更范围

#### 需要删除的代码（完整列表）

**文件：src/commands/CommandManager.ts**
- 全部删除（600行）

**文件：src/commands/index.ts**
- 全部删除（导出CommandManager）

**文件：src/main.ts**
- 第153-156行：commandDirs定义
- 第162-165行：this.commandManager.loadCommands()调用
- 第392-394行：自定义命令处理逻辑
- 第84行：this.commandManager属性
- 第117行：CommandManager导入

**文件：src/plugins/PluginManager.ts**
- 检查并删除CommandManager相关引用

**测试文件：tests/commands/CommandManager.test.ts**
- 全部删除（350行）

#### 需要修改的代码

**文件：src/main.ts:Application类**
```typescript
// 删除
import { CommandManager } from './commands/CommandManager';

// 删除属性
private commandManager: CommandManager;

// 删除初始化
this.commandManager = new CommandManager(config);

// 删除loadCustomExtensions中的commands加载
await this.commandManager.loadCommands(commandDirs).catch(...)

// 删除handleCommand中的自定义命令处理
const customCmd = this.commandManager.getCommand(cmdName);
if (customCmd) {
  await this.commandManager.executeCommand(cmdName, cmdArgs);
}
```

**文件：src/core/MessageRouter.ts**
```typescript
// 无需修改，getSettingSources()保持返回['project']
// 当前实现已经正确
getSettingSources(): ('user' | 'project' | 'local')[] {
  return ['project'];  // 保持不变，只支持项目级
}
```

### 4. 完全迁移策略

#### 迁移方式
- ✅ **立即删除CommandManager**
- ✅ **删除所有自定义实现**
- ✅ **让SDK原生处理slash commands**
- ✅ **仅使用`.claude/commands/`目录**
- ✅ **不提供向后兼容性**

#### 用户使用指南
用户只需：

1. **创建命令目录**：
   ```bash
   mkdir -p .claude/commands
   ```

2. **创建命令文件**（使用SDK格式）：
   - 目录：`.claude/commands/`
   - 文件：`.md`格式
   - 字段：`allowed-tools`（非`allowedTools`）
   - 参数：`$1, $2`（非`$ARGUMENTS`）

#### 推荐方案：完全迁移
- ✅ 简单、清晰
- ✅ 符合SDK最佳实践
- ✅ 无技术债务
- ✅ 代码库更小
- ✅ 零迁移成本

### 5. 测试策略

#### 现有测试调整

**删除的测试：**
- `tests/commands/CommandManager.test.ts`（全部删除）

**需要调整的测试：**
```typescript
// tests/integration/e2e.test.ts
// 检查是否测试了slash commands，需要移除或更新
```

#### 新增测试

**SDK原生commands测试：**
```typescript
describe('SDK Native Slash Commands', () => {
  it('应该支持SDK原生的slash commands目录结构', async () => {
    // 验证SDK自动加载.claude/commands/目录中的命令
  });

  it('应该支持$1, $2参数占位符', async () => {
    // 验证参数正确替换
  });

  it('应该支持allowed-tools frontmatter字段', async () => {
    // 验证工具白名单生效
  });
});
```

**注意**：SDK原生支持`!`command``命令嵌入和`@filename`文件引用，无需额外测试。

#### 端到端测试设计

**测试场景：**
1. 命令文件在`.claude/commands/`中
2. 通过SDK调用`/command-name`
3. 参数正确替换
4. 工具权限正确应用
5. 命令输出正确嵌入

### 6. 实施步骤

#### 分阶段实施计划

**阶段1：核心迁移（0.5天）**
1. 删除CommandManager相关代码
2. 移除main.ts中的commands处理
3. 运行测试确保基本功能正常

**阶段2：验证（0.5天）**
1. 运行所有测试套件
2. 手动测试交互模式
3. 验证SDK原生功能

**阶段3：文档更新（0.5天）**
1. 更新CLAUDE.md
2. 更新用户指南

#### 关键里程碑

- [ ] Day 0.5: 代码删除完成
- [ ] Day 1: 集成测试通过
- [ ] Day 1.5: 文档更新完成

#### 风险和缓解措施

**风险1：用户需要创建新的命令文件**
- 缓解：提供SDK格式的示例文件
- 缓解：清晰的错误提示
- 缓解：明确的使用指南

**风险2：功能差异导致用户体验下降**
- 缓解：验证SDK原生功能完整覆盖
- 缓解：SDK原生支持`!`command``和`@file`语法
- 缓解：充分测试

**风险3：测试覆盖不足**
- 缓解：利用SDK原生测试
- 缓解：端到端测试

## 核心文件清单

### Critical Files for Implementation

1. **src/commands/CommandManager.ts** - 完全删除（600行自定义实现）
2. **src/main.ts** - 删除CommandManager集成逻辑（约40行修改）
3. **src/core/MessageRouter.ts** - 无需修改（getSettingSources()已正确返回['project']）
4. **tests/commands/CommandManager.test.ts** - 删除测试文件

### Files to Modify

| 文件路径 | 修改类型 | 变更内容 |
|---------|---------|---------|
| src/main.ts | 删除 | CommandManager导入、属性、初始化、加载逻辑 |
| src/main.ts | 删除 | handleCommand中的自定义命令处理 |
| src/core/MessageRouter.ts | 无需修改 | getSettingSources()保持['project'] |
| src/plugins/PluginManager.ts | 检查 | 删除CommandManager相关引用 |
| tests/integration/e2e.test.ts | 检查 | 移除slash commands相关测试 |

### Files to Delete

| 文件路径 | 删除原因 |
|---------|---------|
| src/commands/CommandManager.ts | 功能由SDK接管 |
| src/commands/index.ts | 不再需要导出 |
| tests/commands/CommandManager.test.ts | 测试覆盖不再需要 |

### Files to Create

| 文件路径 | 创建类型 | 用途 |
|---------|---------|------|
| tests/integration/slash-commands.test.ts | 新建 | SDK原生commands测试（可选） |

## 迁移收益

- ✅ **代码库更小**：删除600行独立实现
- ✅ **架构更清晰**：简化消息处理流程
- ✅ **维护成本降低**：依赖SDK原生功能
- ✅ **官方兼容**：与Claude Code完全兼容
- ✅ **性能提升**：减少应用层处理开销
- ✅ **零技术债务**：完全移除自定义实现
- ✅ **零迁移成本**：无需迁移任何现有文件
- ✅ **快速实施**：实施周期仅1.5天
- ✅ **清晰使用**：仅需使用`.claude/commands/`目录

## 验证方案

### 验证步骤

1. **单元测试验证**
   ```bash
   npm test                    # 运行所有单元测试
   npm run test:integration    # 运行集成测试
   ```

2. **功能验证**
   ```bash
   # 创建测试命令文件
   echo "测试命令内容" > .claude/commands/test.md

   # 运行交互模式
   npm start -- --interactive

   # 输入：/test 参数
   # 验证：命令正确执行
   ```

3. **端到端验证**
   ```bash
   # 运行端到端测试
   npm run test:e2e

   # 验证：所有测试通过
   ```

4. **性能验证**
   ```bash
   # 对比迁移前后
   time npm start -- "询问"

   # 验证：响应时间无明显差异
   ```

### 验证清单

- [ ] 所有现有测试通过
- [ ] 新增SDK原生测试通过
- [ ] 交互模式正常工作
- [ ] 命令文件正确加载
- [ ] 参数替换正确
- [ ] 工具权限正确应用
- [ ] 文档已更新
- [ ] 示例已迁移

## 总结

这个完全迁移方案将：
- ✅ **完全符合SDK原生规范**
- ✅ **简化代码架构**（删除600行）
- ✅ **零技术债务**（移除所有自定义实现）
- ✅ **零迁移成本**（无需迁移任何现有文件）
- ✅ **极简实施**（实施周期仅1.5天）

**推荐立即开始实施，采用完全迁移方案以获得最大的技术收益和最清晰的技术架构。**

### 核心优势

1. **最简实现**：不提供迁移脚本，立即删除旧代码
2. **最清晰架构**：完全依赖SDK原生功能
3. **最快速交付**：实施周期仅1.5天
4. **零迁移成本**：无需迁移任何现有文件
5. **最低维护成本**：仅需维护`.claude/commands/`目录
