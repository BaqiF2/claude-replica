# 系统提示词自定义配置功能设计规格说明

## 一、项目概述

### 目标
实现符合 Claude Agent SDK 最佳实践的系统提示词配置功能，使用 SDK 的 `settingSources` 机制自动加载 CLAUDE.md，并通过 `append` 字段追加自定义内容（如技能）。

### 核心需求
1. **SDK 自动加载 CLAUDE.md**：使用 `settingSources: ['project']` 让 SDK 自动加载项目级配置文件
2. **仅支持项目级**：不支持用户级 CLAUDE.md（`~/.claude/CLAUDE.md`），每个项目独立配置
3. **预设 + Append 模式**：使用 `{ type: 'preset', preset: 'claude_code', append: '...' }` 格式
4. **保留完整系统提示词**：通过 SDK 预设保留 Claude Code 的完整系统提示词（工具指令、安全规则等）
5. **仅追加自定义内容**：`append` 字段仅用于技能和其他运行时自定义指令，不包含 CLAUDE.md

### 设计依据
根据官方文档 (https://platform.claude.com/docs/zh-CN/agent-sdk/modifying-system-prompts)：

> **重要：** SDK 只有在您明确配置 `settingSources` 时才会读取 CLAUDE.md 文件。`claude_code` 系统提示词预设不会自动加载 CLAUDE.md - 您还必须指定设置源。

正确的配置方式：
```typescript
{
  systemPrompt: {
    type: "preset",
    preset: "claude_code",
    append: "自定义追加内容（技能等）"
  },
  settingSources: ["project"]  // SDK 自动加载项目级 CLAUDE.md
}
```

**注意**：Tyler 仅支持项目级 CLAUDE.md，不加载用户级配置（`~/.claude/CLAUDE.md`）。

---

## 二、设计决策

### 2.1 CLAUDE.md 加载策略
**交由 SDK 自动加载**：
- 通过 `settingSources` 配置让 SDK 自动加载 CLAUDE.md
- 不在应用层手动调用 `loadClaudeMd()` 并拼接到 `append`
- SDK 会按照标准路径优先级查找并加载文件（`CLAUDE.md` 或 `.claude/CLAUDE.md`）

### 2.2 系统提示词组成
```
┌─────────────────────────────────────────────────────┐
│ 完整系统提示词                                        │
├─────────────────────────────────────────────────────┤
│ 1. Claude Code 预设提示词（via preset: 'claude_code'）│
│    ├─ 工具使用指令                                    │
│    ├─ 代码风格和格式指南                              │
│    ├─ 安全和安全指令                                  │
│    └─ 环境上下文                                      │
│                                                       │
│ 2. CLAUDE.md 内容（via settingSources）               │
│    └─ SDK 自动加载并注入                              │
│                                                       │
│ 3. 自定义追加内容（via append）                       │
│    ├─ 技能提示词                                      │
│    └─ 运行时动态指令                                  │
└─────────────────────────────────────────────────────┘
```

### 2.3 配置时机
- `settingSources` 在构建 SDK Options 时指定
- SDK 在每次 query 调用时自动加载 CLAUDE.md
- `append` 内容在会话创建时构建，会话期间保持不变（除非重新加载技能）

---

## 三、技术实现方案

### 3.1 核心组件架构

#### 修改组件：MessageRouter

**文件**：`src/core/MessageRouter.ts`

**核心变更**：
1. **删除方法**：`buildSystemPrompt()` - 不再手动拼接系统提示词字符串
2. **删除方法**：`getDefaultSystemInstructions()` - 使用 SDK 预设替代
3. **新增方法**：`getSystemPromptOptions()` - 返回 SDK 格式的系统提示词配置
4. **新增方法**：`buildAppendPrompt()` - 构建 append 字段内容（仅技能等自定义内容）
5. **新增方法**：`getSettingSources()` - 返回 settingSources 配置
6. **修改方法**：`buildQueryOptions()` - 使用新方法并添加 settingSources

**新方法设计**：

```typescript
/**
 * 构建系统提示词选项（SDK 格式）
 *
 * 策略：
 * 1. 使用 SDK 预设：{ type: 'preset', preset: 'claude_code' }
 * 2. CLAUDE.md 由 SDK 通过 settingSources 自动加载（不在此处理）
 * 3. append 字段仅包含技能和运行时自定义指令
 *
 * @param session - 当前会话
 * @returns SDK 系统提示词配置对象
 */
getSystemPromptOptions(
  session: Session
): { type: 'preset'; preset: 'claude_code'; append?: string }

/**
 * 构建 append 字段内容
 *
 * 仅包含需要在运行时追加的自定义内容：
 * - 技能提示词
 * - 其他动态指令（未来扩展）
 *
 * @param session - 当前会话
 * @returns append 字符串（如果为空则返回 undefined）
 */
buildAppendPrompt(session: Session): string | undefined

/**
 * 获取 settingSources 配置
 *
 * 指定 SDK 应该从哪些源加载配置（包括 CLAUDE.md）
 * Tyler 仅支持项目级，返回 ['project']
 *
 * @param session - 当前会话
 * @returns settingSources 数组（始终为 ['project']）
 */
getSettingSources(session: Session): SettingSource[]
```

**append 字段结构**：
```
<!-- Skills Section -->
## Skill: skill-name

[技能内容]

## Skill: another-skill

[另一个技能内容]
```

**关键说明**：
- ✅ CLAUDE.md **不包含**在 append 中，由 SDK 通过 `settingSources` 自动加载
- ✅ append 仅用于技能和其他运行时动态指令
- ✅ 如果 append 为空，则不设置该字段（返回 `undefined`）
- ✅ 保留完整的 Claude Code 系统提示词（工具指令、安全规则等）

---

#### 修改组件：QueryOptions 接口

**文件**：`src/core/MessageRouter.ts`

**接口变更**：
```typescript
export interface QueryOptions {
  model: string;

  // 修改：支持预设对象格式（不再仅是字符串）
  systemPrompt:
    | string  // 支持完全自定义（特殊场景）
    | {
        type: 'preset';
        preset: 'claude_code';
        append?: string;
      };

  // 新增：settingSources 配置
  settingSources?: SettingSource[];

  allowedTools: string[];
  disallowedTools?: string[];
  cwd: string;
  permissionMode: PermissionMode;
  // ... 其他字段保持不变
}
```

---

#### 修改组件：SDKQueryExecutor

**文件**：`src/sdk/SDKQueryExecutor.ts`

**接口变更**：
```typescript
export interface SDKQueryOptions {
  prompt: string;
  model?: string;

  // 修改：支持预设对象格式
  systemPrompt?:
    | string
    | { type: 'preset'; preset: 'claude_code'; append?: string };

  // 新增：settingSources
  settingSources?: SettingSource[];

  allowedTools?: string[];
  // ... 其他字段
}
```

**方法变更**：`mapToSDKOptions()`
```typescript
mapToSDKOptions(options: SDKQueryOptions): SDKOptions {
  const sdkOptions: SDKOptions = {
    model: options.model,
    // ... 其他字段映射
  };

  // 映射 systemPrompt（支持对象和字符串）
  if (options.systemPrompt) {
    sdkOptions.systemPrompt = options.systemPrompt;
  }

  // 映射 settingSources（关键新增）
  if (options.settingSources) {
    sdkOptions.settingSources = options.settingSources;
  }

  // ... 其他映射
  return sdkOptions;
}
```

---

#### 无需修改：SDKConfigLoader

**文件**：`src/config/SDKConfigLoader.ts`

**保留现有方法**：`loadClaudeMd(workingDir: string)`

**说明**：
- 此方法保留用于向后兼容或特殊场景
- 主流程不再调用此方法加载 CLAUDE.md
- CLAUDE.md 完全由 SDK 通过 `settingSources` 自动处理

---

### 3.2 完整调用链路

```
Application.run()
  └─> SessionManager.createSession() / resumeSession()
      └─> MessageRouter.routeMessage()
          └─> MessageRouter.buildQueryOptions()
              ├─> getSystemPromptOptions()
              │   └─> buildAppendPrompt()  // 仅构建技能等自定义内容
              │       └─> buildSkillsPrompt()
              │
              └─> getSettingSources()  // 返回 ['project']

              构建结果：
              {
                systemPrompt: {
                  type: 'preset',
                  preset: 'claude_code',
                  append: '<!-- Skills Section -->\n[Skills 内容]'  // 仅技能
                },
                settingSources: ['project'],  // SDK 自动加载项目级 CLAUDE.md
                // ... 其他配置
              }

SDKQueryExecutor.execute()
  └─> mapToSDKOptions()
      ├─> 映射 systemPrompt 对象
      └─> 映射 settingSources 数组
      └─> 传递给 SDK query()

SDK query() 内部处理：
  ├─> 应用 Claude Code 预设系统提示词
  ├─> 根据 settingSources 自动加载 CLAUDE.md 并注入
  └─> 追加 append 字段内容（技能等）
```

**关键变更对比**：

| 方面 | 变更前（错误方式） | 变更后（最佳实践） |
|------|------------------|------------------|
| **CLAUDE.md 加载** | ❌ 手动调用 `loadClaudeMd()` 并拼接到 append | ✅ 通过 `settingSources` 让 SDK 自动加载 |
| **系统提示词** | ❌ 自定义的简陋指令 | ✅ 完整的 Claude Code 预设提示词 |
| **append 内容** | ❌ 包含 CLAUDE.md + 技能 | ✅ 仅包含技能等运行时自定义内容 |
| **符合最佳实践** | ❌ 否 | ✅ 是 |

---

### 3.3 实现场景

#### 场景 1：有 CLAUDE.md + 有技能

**CLAUDE.md 内容**：
```markdown
# My Project

这是项目文档说明...

## 编码规范
- 遵循 TypeScript 严格模式
- 使用函数式编程风格
```

**行为**：
- SDK 自动加载项目级 CLAUDE.md（通过 `settingSources: ['project']`）
- `buildAppendPrompt()` 返回技能内容
- 最终配置：
  ```typescript
  {
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: '<!-- Skills Section -->\n## Skill: test-helper\n[技能内容]'
    },
    settingSources: ['project']
  }
  ```
- 日志：`Debug: Built system prompt with skills (X chars in append)`

#### 场景 2：有 CLAUDE.md + 无技能

**行为**：
- SDK 自动加载项目级 CLAUDE.md
- `buildAppendPrompt()` 返回 `undefined`（无技能内容）
- 最终配置：
  ```typescript
  {
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code'
      // 无 append 字段
    },
    settingSources: ['project']
  }
  ```
- 日志：无（正常场景）

#### 场景 3：无 CLAUDE.md + 有技能

**行为**：
- SDK 尝试加载项目级 CLAUDE.md 但未找到（正常）
- `buildAppendPrompt()` 返回技能内容
- 最终配置：
  ```typescript
  {
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: '<!-- Skills Section -->\n## Skill: test-helper\n[技能内容]'
    },
    settingSources: ['project']
  }
  ```
- 日志：无（正常场景）

#### 场景 4：无 CLAUDE.md + 无技能

**行为**：
- SDK 尝试加载项目级 CLAUDE.md 但未找到
- `buildAppendPrompt()` 返回 `undefined`
- 最终配置：
  ```typescript
  {
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code'
    },
    settingSources: ['project']
  }
  ```
- 使用纯 Claude Code 预设提示词
- 日志：无（正常场景）

---

## 四、关键文件清单

### 需要修改的文件

1. **src/core/MessageRouter.ts** （核心变更）
   - 删除：`buildSystemPrompt()` 方法
   - 删除：`getDefaultSystemInstructions()` 方法
   - 新增：`getSystemPromptOptions()` - 返回 SDK 预设格式
   - 新增：`buildAppendPrompt()` - 构建 append 字段（仅技能）
   - 新增：`getSettingSources()` - 返回 settingSources 配置
   - 修改：`buildQueryOptions()` - 使用新方法并添加 settingSources
   - 修改：`QueryOptions` 接口 - systemPrompt 支持对象格式

2. **src/sdk/SDKQueryExecutor.ts** （适配变更）
   - 修改：`SDKQueryOptions` 接口 - 添加 settingSources 字段
   - 修改：`mapToSDKOptions()` - 映射 settingSources 到 SDK Options

3. **tests/unit/MessageRouter.test.ts** （测试更新）
   - 更新测试以验证新的系统提示词构建逻辑
   - 测试 preset + append 结构
   - 测试 settingSources 配置
   - 测试各种场景（有/无 CLAUDE.md，有/无技能）

### 无需修改的文件

- **src/config/SDKConfigLoader.ts** - 保留 `loadClaudeMd()` 用于向后兼容
- **src/config/ConfigManager.ts** - 无需变更

---

## 五、日志策略

### 5.1 正常场景（无日志）
- CLAUDE.md 由 SDK 自动处理，应用层无需记录日志
- 无技能加载时无需日志
- 使用纯预设提示词时无需日志

### 5.2 Debug 日志（可选）
```typescript
// 当有 append 内容时
console.debug(`Built system prompt with append (${appendLength} characters)`);

// 设置 settingSources 时
console.debug(`Configured settingSources: ${JSON.stringify(sources)}`);
```

**说明**：
- 由于 CLAUDE.md 由 SDK 自动加载，应用层不再记录加载日志
- 仅在 debug 模式下记录 append 和 settingSources 配置
- SDK 自身会处理 CLAUDE.md 的加载日志（如果启用 SDK 调试）

---

## 六、测试策略

### 6.1 单元测试场景

#### MessageRouter.test.ts

**getSystemPromptOptions() 测试**：
- ✅ 无技能时返回纯预设对象 `{ type: 'preset', preset: 'claude_code' }`
- ✅ 有技能时返回带 append 的预设对象
- ✅ append 字段仅包含技能内容，不包含 CLAUDE.md
- ✅ 多个技能时正确组合到 append 中

**getSettingSources() 测试**：
- ✅ 返回 `['project']` 配置（仅项目级）
- ✅ 验证不包含 'user' 源

**buildAppendPrompt() 测试**：
- ✅ 无技能时返回 `undefined`
- ✅ 有技能时返回正确格式的字符串
- ✅ Skills 内容正确格式化

**buildQueryOptions() 测试**：
- ✅ 正确组合 systemPrompt 对象
- ✅ 正确设置 settingSources 数组
- ✅ 其他配置字段保持不变

#### SDKQueryExecutor.test.ts

**mapToSDKOptions() 测试**：
- ✅ 正确映射 systemPrompt 对象格式
- ✅ 正确映射 settingSources 数组
- ✅ 支持 systemPrompt 为字符串的场景（向后兼容）

### 6.2 集成测试

**端到端测试**：
- ✅ 验证 SDK 正确接收 systemPrompt 预设对象
- ✅ 验证 SDK 正确接收 settingSources 配置
- ✅ 验证 SDK 自动加载 CLAUDE.md（通过观察最终行为）
- ✅ 验证技能内容正确追加到系统提示词

**场景测试**：
- ✅ 场景 1：有 CLAUDE.md + 有技能
- ✅ 场景 2：有 CLAUDE.md + 无技能
- ✅ 场景 3：无 CLAUDE.md + 有技能
- ✅ 场景 4：无 CLAUDE.md + 无技能

---

## 七、实现步骤

### 阶段 1：接口更新（低风险）

1. **更新类型定义**
   - 修改 `QueryOptions` 接口，systemPrompt 支持对象格式
   - 修改 `SDKQueryOptions` 接口，添加 settingSources 字段
   - 确保类型兼容性

### 阶段 2：MessageRouter 重构（核心变更）

2. **删除旧方法**
   - 删除 `buildSystemPrompt()` 方法
   - 删除 `getDefaultSystemInstructions()` 方法

3. **实现新方法**
   - 实现 `getSystemPromptOptions()` - 返回 SDK 预设格式
   - 实现 `buildAppendPrompt()` - 构建 append 字段（仅技能）
   - 实现 `getSettingSources()` - 返回 settingSources 配置

4. **修改 buildQueryOptions()**
   - 使用 `getSystemPromptOptions()` 替代 `buildSystemPrompt()`
   - 添加 `settingSources` 字段到返回的 QueryOptions
   - 确保不调用 `loadClaudeMd()`

### 阶段 3：SDKQueryExecutor 适配（低风险）

5. **更新 mapToSDKOptions()**
   - 添加 settingSources 映射逻辑
   - 确保 systemPrompt 对象正确传递
   - 保持向后兼容（支持字符串 systemPrompt）

### 阶段 4：测试验证

6. **单元测试**
   - 更新 MessageRouter.test.ts
   - 更新 SDKQueryExecutor.test.ts
   - 运行所有单元测试并确保通过

7. **集成测试**
   - 测试 4 个场景组合
   - 验证 SDK 正确接收配置
   - 验证 CLAUDE.md 自动加载

8. **手动测试**
   - 创建测试项目
   - 测试有/无 CLAUDE.md 场景
   - 测试有/无技能场景
   - 观察 SDK 行为

### 阶段 5：文档更新

9. **更新项目文档**
   - 更新 CLAUDE.md 使用说明
   - 说明新的 settingSources 机制
   - 说明 preset + append 模式
   - 添加迁移指南（如需要）

---

## 八、风险评估

### 8.1 技术风险

| 风险 | 影响 | 缓解措施 | 状态 |
|------|------|----------|------|
| **SDK CLAUDE.md 加载行为差异** | 中 | 详细测试 SDK 加载机制，确保与手动加载行为一致 | ⚠️ 需验证 |
| **向后兼容性** | 低 | 保留 `loadClaudeMd()` 方法用于回滚 | ✅ 已规划 |
| **类型兼容性** | 低 | systemPrompt 支持联合类型（对象 \| 字符串） | ✅ 已规划 |
| **Skills 分隔标记冲突** | 低 | 使用 HTML 注释格式，极少出现在正常内容中 | ✅ 低风险 |

### 8.2 关键风险点：SDK 自动加载行为

**潜在风险**：
- SDK 通过 `settingSources` 自动加载 CLAUDE.md 的行为可能与手动加载略有不同
- SDK 的路径查找优先级需要验证
- SDK 的错误处理方式可能不同

**缓解措施**：
1. **详细测试**：测试所有 CLAUDE.md 位置（根目录、.claude 目录）
2. **行为对比**：对比 SDK 加载和手动加载的结果
3. **回滚策略**：保留 `loadClaudeMd()` 方法，必要时可快速回滚
4. **文档说明**：明确记录 SDK 加载机制和预期行为

### 8.3 性能影响

| 方面 | 变更前 | 变更后 | 影响 |
|------|--------|--------|------|
| **CLAUDE.md 加载** | 手动文件读取（一次） | SDK 自动加载（每次 query） | ⚠️ 可能略有开销 |
| **系统提示词构建** | 字符串拼接 | SDK 内部处理 | ✅ 性能相当或更优 |
| **整体性能** | 基准 | 预计相当 | ✅ 无明显影响 |

**说明**：
- SDK 可能在每次 query 时加载 CLAUDE.md，但通常有内部缓存
- 相比手动加载的性能差异预计可忽略
- 换取的是完整的 Claude Code 系统提示词和符合最佳实践

### 8.4 回滚策略

如果遇到问题，可快速回滚：

1. **回滚步骤**：
   - 恢复 `buildSystemPrompt()` 方法
   - 在 `buildQueryOptions()` 中使用旧方法
   - 移除 `settingSources` 配置
   - 将 systemPrompt 改回字符串类型

2. **回滚成本**：
   - 代码变更量小（主要在 MessageRouter.ts）
   - 测试已覆盖，风险低
   - 可在单次提交中完成回滚

3. **保留机制**：
   - `ConfigManager.loadClaudeMd()` 保持不变
   - 旧的拼接逻辑可从 git 历史恢复

---

## 九、示例配置

### 9.1 标准 CLAUDE.md

```markdown
# Tyler - Claude Replica 项目

这是一个 Claude Agent SDK 的 CLI 封装工具，提供 AI 辅助编程能力。

## 项目架构

核心组件包括：
- MessageRouter: 消息路由和系统提示词管理
- SDKQueryExecutor: SDK 查询执行器
- SessionManager: 会话管理

## 开发指南

请遵循以下原则：
- 遵循 TypeScript 严格模式
- 使用函数式编程风格
- 编写完整的单元测试
```

**效果**：SDK 通过 `settingSources: ['project']` 自动加载此项目级文件并注入到系统提示词中。

### 9.2 最终传递给 SDK 的配置

```typescript
// MessageRouter.buildQueryOptions() 返回值示例
{
  model: 'sonnet',

  // 系统提示词配置（SDK 预设格式）
  systemPrompt: {
    type: 'preset',
    preset: 'claude_code',  // 完整的 Claude Code 系统提示词
    append: '<!-- Skills Section -->\n## Skill: test-helper\n[技能内容...]'
  },

  // SDK 自动加载项目级 CLAUDE.md
  settingSources: ['project'],

  allowedTools: ['Read', 'Write', 'Edit', ...],
  cwd: '/path/to/project',
  permissionMode: 'default',
  // ... 其他配置
}
```

### 9.3 与官方文档对照

**官方推荐方式**（from https://platform.claude.com/docs/zh-CN/agent-sdk/modifying-system-prompts）：
```typescript
{
  systemPrompt: {
    type: "preset",
    preset: "claude_code",
    append: "自定义追加内容"
  },
  settingSources: ["project"]  // 或 ["project", "user"]
}
```

**Tyler 实现**：
```typescript
{
  systemPrompt: {
    type: 'preset',
    preset: 'claude_code',
    append: buildAppendPrompt(session)  // 仅技能和自定义指令
  },
  settingSources: ['project']  // 仅项目级，不支持用户级
}
```

**说明**：
- ✅ 格式完全符合官方最佳实践
- ✅ Tyler 选择仅支持项目级 CLAUDE.md（`['project']`）
- ✅ 不加载用户级 `~/.claude/CLAUDE.md`，每个项目独立配置

---

## 十、总结

本实现方案通过以下设计实现了符合 Claude Agent SDK 最佳实践的系统提示词配置：

### 核心改进

1. **使用 SDK 标准机制**：
   - ✅ 采用 `{ type: 'preset', preset: 'claude_code' }` 预设格式
   - ✅ 通过 `settingSources` 让 SDK 自动加载 CLAUDE.md
   - ✅ 使用 `append` 字段仅追加自定义内容（技能等）

2. **保留完整系统提示词**：
   - ✅ Claude Code 预设包含完整的工具指令、安全规则、代码指南
   - ✅ 不丢失任何 SDK 内置功能
   - ✅ 支持输出样式等 SDK 高级特性

3. **清晰的职责分离**：
   - ✅ SDK 负责加载 CLAUDE.md（通过 `settingSources`）
   - ✅ 应用层负责构建技能和运行时自定义指令（通过 `append`）
   - ✅ 不混淆基础提示词和自定义内容

4. **简洁的实现逻辑**：
   - ✅ 删除手动拼接系统提示词的复杂逻辑
   - ✅ 删除自定义的简陋系统指令
   - ✅ 代码更简洁，易于维护和测试

### 关键价值

| 方面 | 价值 |
|------|------|
| **符合最佳实践** | ✅ 完全遵循官方文档推荐方式 |
| **功能完整性** | ✅ 保留 Claude Code 完整能力 |
| **可维护性** | ✅ 代码更简洁，逻辑更清晰 |
| **可扩展性** | ✅ 支持输出样式等 SDK 高级功能 |
| **向后兼容** | ✅ 保留回滚机制，风险可控 |

### 与官方文档对比

| 方面 | 官方最佳实践 | Tyler 实现 | 状态 |
|------|-------------|-----------|------|
| 系统提示词格式 | `{ type: 'preset', preset: 'claude_code' }` | ✅ 一致 | ✅ |
| CLAUDE.md 加载 | `settingSources: ['project']` 或 `['project', 'user']` | ✅ `['project']`（仅项目级） | ✅ |
| 自定义内容追加 | `append: "自定义内容"` | ✅ 一致（仅技能） | ✅ |
| 保留完整提示词 | ✅ 保留 Claude Code 预设 | ✅ 保留 | ✅ |

**结论**：Tyler 实现完全符合 Claude Agent SDK 官方最佳实践！ ✅

**设计选择说明**：
- Tyler 选择 `settingSources: ['project']`（仅项目级）
- 不加载用户级 `~/.claude/CLAUDE.md`
- 每个项目完全独立配置，不受全局配置影响
- 符合 SDK 支持的配置选项，属于有效的最佳实践
