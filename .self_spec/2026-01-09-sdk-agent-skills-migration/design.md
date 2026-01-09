# 从自定义 Skills 迁移到 SDK Agent Skills API - 设计文档

## 一、项目背景

### 1.1 当前状况

**项目已实现自定义 Skills 系统**：
- 实现文件：`src/skills/SkillManager.ts`（492 行）
- 机制：通过 `SkillManager` 手动加载 Skills，将内容追加到 `systemPrompt.append`
- Skills 文件：`.claude/skills/` 目录下的 SKILL.md 文件

**主要问题**：
1. 未使用 Claude Agent SDK 的官方 Agent Skills API
2. 维护 492 行自定义代码
3. Skills 手动匹配和注入，不符合 SDK 最佳实践
4. Skills 的 `tools` 字段在自定义实现中有效，但与 SDK 行为不一致

### 1.2 SDK Agent Skills API 介绍

根据官方文档（`.claude/skills/agent-sdk-dev/claude-agent-sdk-doc/Agent-Skills.md`）：

**核心特性**：
- Skills 定义为文件系统工件（`.claude/skills/` 目录中的 SKILL.md）
- SDK 通过 `settingSources` 选项自动加载 Skills
- Claude 根据 `description` 自主决定何时调用 Skills
- Skills 内容按需加载，不会全部注入系统提示词
- 需要在 `allowedTools` 中添加 `"Skill"` 工具

**配置要求**：
```typescript
{
  settingSources: ["project"],  // 必需：加载项目级 Skills
  allowedTools: ["Skill", ...], // 必需：启用 Skill 工具
  cwd: "/path/to/project"       // Skills 相对于此目录
}
```

**Skills 目录**：
- 项目级：`{cwd}/.claude/skills/` - 通过 Git 共享（仅支持此级别）

**关键差异**：
| 特性 | 自定义实现 | SDK API |
|-----|----------|---------|
| 加载方式 | `SkillManager.loadSkills()` 手动 | `settingSources` 自动 |
| 触发方式 | 手动匹配上下文 | Claude 自主决策 |
| 注入方式 | 追加到系统提示词 | 按需加载 |
| tools 字段 | 有效 | 无效（通过主 allowedTools 控制） |

---

## 二、迁移决策

### 2.1 用户选择

通过与用户交流，确定以下迁移策略：

| 决策点 | 选择 | 理由 |
|-------|------|------|
| **集成方式** | 迁移到 SDK Agent Skills API | 符合官方最佳实践，长期维护性好 |
| **SkillManager 处理** | 完全移除 | 简化代码，减少维护负担 |
| **兼容性策略** | 一次性迁移所有 Skills | 彻底解决，避免混合实现的复杂性 |
| **工具管理** | 默认启用 Skill 工具 | 简化使用，符合项目风格 |

### 2.2 迁移目标

**技术目标**：
1. 完全移除 `SkillManager` 及其相关代码
2. 配置 SDK 以使用官方 Agent Skills API
3. 确保现有 Skills 文件无需修改即可在 SDK 中工作
4. 保持功能一致性（Skills 仍能被正确触发和使用）

**非功能目标**：
1. 减少代码维护成本（移除 492 行自定义代码）
2. 提高可靠性（依赖 SDK 内置实现）
3. 符合官方最佳实践
4. 改善性能（Skills 按需加载，不全部注入）

---

## 三、技术设计

### 3.1 架构变更

#### 当前架构（自定义 Skills）

```
┌─────────────────────────────────────────────────────────┐
│ main.ts                                                 │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ loadExtensions()                                    │ │
│ │ ├─> SkillManager.loadSkills([...skillDirs])       │ │
│ │ └─> 存储 Skills 到 Session.context.loadedSkills   │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ MessageRouter                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ buildQueryOptions()                                 │ │
│ │ ├─> buildAppendPrompt(session)                     │ │
│ │ │   ├─> buildSkillsPrompt(loadedSkills)           │ │
│ │ │   └─> 返回 Skills 内容字符串                     │ │
│ │ ├─> getSkillTools(loadedSkills)                   │ │
│ │ │   └─> 提取 Skills 的 tools 字段                 │ │
│ │ └─> 构建 systemPrompt.append = skillsPrompt       │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ SDK query()                                             │
│ ├─> systemPrompt: { preset: 'claude_code',            │
│ │                    append: skillsPrompt }            │
│ └─> Claude 接收完整的系统提示词（包含所有 Skills）      │
└─────────────────────────────────────────────────────────┘
```

#### 目标架构（SDK Agent Skills）

```
┌─────────────────────────────────────────────────────────┐
│ main.ts                                                 │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ loadExtensions()                                    │ │
│ │ └─> 不再加载 Skills（由 SDK 自动处理）              │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ MessageRouter                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ buildQueryOptions()                                 │ │
│ │ ├─> getSettingSources() → ['project']             │ │
│ │ ├─> getEnabledToolNames() → [..., 'Skill']        │ │
│ │ ├─> buildAppendPrompt() → undefined               │ │
│ │ └─> 构建 settingSources 和 allowedTools           │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ SDK query()                                             │
│ ├─> settingSources: ['project']                       │
│ ├─> allowedTools: [..., 'Skill']                      │
│ ├─> SDK 自动发现 .claude/skills/ （项目级）          │
│ └─> Claude 按需调用 Skill 工具加载特定 Skills         │
└─────────────────────────────────────────────────────────┘
```

**关键差异**：
1. ✅ 移除了 `SkillManager` 的手动加载
2. ✅ 移除了 Skills 内容注入到系统提示词
3. ✅ Skills 由 SDK 自动发现和管理
4. ✅ Claude 自主决定何时使用哪个 Skill

### 3.2 核心文件变更

#### 3.2.1 `src/tools/ToolRegistry.ts`

**变更**：添加 Skill 工具注册

**位置**：`initializeToolMetadata()` 方法，第 206 行之后

**代码**：
```typescript
this.registerTool({
  name: 'Skill',
  category: ToolCategory.AGENT,
  description: 'Load and execute agent skills',
  dangerous: false,
});
```

**理由**：
- SDK 需要 `Skill` 工具才能执行 Skills
- 必须在 `ToolRegistry` 中注册才能被识别为有效工具

#### 3.2.2 `src/core/MessageRouter.ts`

**这是变更最多的文件**，涉及 5 处修改：

##### 修改 1：`getSettingSources()` (第 547-549 行)

**之前**：
```typescript
getSettingSources(): ('user' | 'project' | 'local')[] {
  return ['project'];
}
```

**保持不变**：
```typescript
getSettingSources(): ('user' | 'project' | 'local')[] {
  return ['project'];  // 仅支持项目级 Skills
}
```

**理由**：
- SDK 需要 `settingSources` 包含 `'project'` 才能加载项目级 Skills
- 项目决策：仅支持项目级 Skills（`.claude/skills/`），不支持用户级

##### 修改 2：`buildAppendPrompt()` (第 522-537 行)

**之前**：
```typescript
buildAppendPrompt(session: Session): string | undefined {
  const parts: string[] = [];

  // 构建技能提示词（仅包含技能内容）
  const skillsPrompt = this.buildSkillsPrompt(session.context.loadedSkills);
  if (skillsPrompt) {
    parts.push(skillsPrompt);
  }

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join('\n\n');
}
```

**修改为**：
```typescript
buildAppendPrompt(session: Session): string | undefined {
  // Skills 现在由 SDK 通过 settingSources 自动管理，不再需要追加
  return undefined;
}
```

**理由**：
- Skills 不再需要手动注入到系统提示词
- SDK 会自动发现和按需加载 Skills

##### 修改 3：删除 `buildSkillsPrompt()` (第 632-644 行)

**删除整个方法**：
```typescript
private buildSkillsPrompt(skills: Skill[]): string {
  if (skills.length === 0) {
    return '';
  }

  const parts: string[] = [];
  for (const skill of skills) {
    parts.push(`## Skill: ${skill.name}\n\n${skill.content}`);
  }
  return parts.join('\n\n');
}
```

**理由**：不再需要构建 Skills 提示词字符串

##### 修改 4：删除 `getSkillTools()` (第 652-664 行)

**删除整个方法**：
```typescript
private getSkillTools(skills: Skill[]): string[] {
  const tools = new Set<string>();

  for (const skill of skills) {
    if (skill.tools && Array.isArray(skill.tools)) {
      skill.tools.forEach((tool) => tools.add(tool));
    }
  }

  return Array.from(tools);
}
```

**理由**：
- SDK 中 Skills 的 `tools` 字段无效
- 工具控制通过主配置的 `allowedTools` 完成

##### 修改 5：`getEnabledToolNames()` (第 400-427 行)

**之前**：
```typescript
getEnabledToolNames(session: Session): string[] {
  const { projectConfig, userConfig, loadedSkills } = session.context;
  const mergedConfig = this.configManager.mergeConfigs(userConfig, projectConfig);

  let tools = this.toolRegistry.getEnabledTools({
    allowedTools: mergedConfig.allowedTools,
    disallowedTools: mergedConfig.disallowedTools,
  });

  // 添加技能所需的工具
  const skillTools = this.getSkillTools(loadedSkills);
  for (const tool of skillTools) {
    if (!tools.includes(tool) && this.toolRegistry.isValidTool(tool)) {
      tools.push(tool);
    }
  }

  if (mergedConfig.disallowedTools && mergedConfig.disallowedTools.length > 0) {
    const disallowedSet = new Set(mergedConfig.disallowedTools);
    tools = tools.filter((tool) => !disallowedSet.has(tool));
  }

  return tools;
}
```

**修改为**：
```typescript
getEnabledToolNames(session: Session): string[] {
  const { projectConfig, userConfig } = session.context;
  const mergedConfig = this.configManager.mergeConfigs(userConfig, projectConfig);

  let tools = this.toolRegistry.getEnabledTools({
    allowedTools: mergedConfig.allowedTools,
    disallowedTools: mergedConfig.disallowedTools,
  });

  // 确保 Skill 工具默认启用
  if (!tools.includes('Skill')) {
    tools.push('Skill');
  }

  if (mergedConfig.disallowedTools && mergedConfig.disallowedTools.length > 0) {
    const disallowedSet = new Set(mergedConfig.disallowedTools);
    tools = tools.filter((tool) => !disallowedSet.has(tool));
  }

  return tools;
}
```

**关键变更**：
1. 移除 `loadedSkills` 参数解构
2. 删除 Skills 工具提取逻辑（第 412-418 行）
3. 添加逻辑确保 `Skill` 工具默认启用

#### 3.2.3 `src/main.ts`

**变更**：删除 SkillManager 相关所有代码

##### 删除 1：导入语句 (第 26 行)
```typescript
import { SkillManager } from './skills/SkillManager';
```

##### 删除 2：实例变量 (第 53 行)
```typescript
private readonly skillManager: SkillManager;
```

##### 删除 3：初始化 (第 79 行)
```typescript
this.skillManager = new SkillManager();
```

##### 删除 4：加载逻辑 (第 151-167 行)
```typescript
private async loadExtensions(workingDir: string): Promise<void> {
  const skillDirs = [
    path.join(os.homedir(), '.claude', 'skills'),
    path.join(workingDir, '.claude', 'skills'),
  ];

  await Promise.all([
    this.skillManager.loadSkills(skillDirs).catch((error) => {
      console.warn('Warning: Failed to load skills:', error);
    }),
  ]);
}
```

**修改为**：
```typescript
private async loadExtensions(workingDir: string): Promise<void> {
  // Skills 现在由 SDK 通过 settingSources 自动管理
  // 不再需要手动加载
}
```

#### 3.2.4 `src/core/SessionManager.ts`

**变更**：删除 Skill 类型定义和字段

##### 删除 1：Skill 接口 (第 65-72 行)
```typescript
export interface Skill {
  name: string;
  description: string;
  triggers?: string[];
  tools?: string[];
  content: string;
  metadata: Record<string, unknown>;
  sourcePath?: string;
  sourceType?: 'user' | 'project';
}
```

##### 删除 2：SessionContext 中的字段 (第 92 行)
```typescript
export interface SessionContext {
  workingDirectory: string;
  projectConfig: ProjectConfig;
  userConfig: UserConfig;
  loadedSkills: Skill[];  // ← 删除此行
  activeAgents: Agent[];
}
```

**注意**：如果其他模块依赖 `Skill` 类型，可能需要保留基础类型定义或从其他地方导入。

#### 3.2.5 `src/index.ts`

**变更**：删除 SkillManager 导出 (第 76 行)

**删除**：
```typescript
export { SkillManager, Skill, SkillManagerConfig } from './skills';
```

**理由**：公共 API 不再暴露 SkillManager

#### 3.2.6 删除整个目录

```bash
rm -rf src/skills/
rm -rf tests/skills/
```

**删除的文件**：
- `src/skills/SkillManager.ts` (492 行)
- `src/skills/index.ts`
- `tests/skills/SkillManager.test.ts`

---

### 3.3 现有 Skills 文件验证

**目标**：确认现有 SKILL.md 文件格式符合 SDK 要求

#### 3.3.1 SDK 格式要求

根据官方文档：

**必需字段**：
- `description` - 决定 Claude 何时调用此 Skill

**可选字段**：
- `name` - Skill 名称（默认从目录名提取）
- `triggers` - 触发关键词（仍有效）
- `tools` - ⚠️ 在 SDK 中**无效**，被忽略

**frontmatter 示例**：
```yaml
---
name: my-skill
description: |
  Detailed description that helps Claude decide when to use this skill.
  Should clearly explain the skill's purpose and applicable scenarios.
triggers:
  - keyword1
  - keyword2
---

# Skill Content (Markdown)
```

#### 3.3.2 现有 Skills 验证

**1. `.claude/skills/agent-sdk-dev/SKILL.md`**

```yaml
---
name: agent-sdk-dev
description: |
  Expert assistant for developing with claude-agent-sdk. Use when user asks about:
  - Creating custom tools or MCP servers
  - Setting up permissions, security controls, or hooks
  - ...
---
```

✅ **符合要求**：
- 有 `name` 和 `description`
- 无 `tools` 字段（符合最佳实践）
- `description` 详细描述了适用场景

**2. `.claude/skills/code-reading-guide/SKILL.md`**

```yaml
---
name: code-reading-guide
description: 为新入职员工或代码审查者生成结构化的代码阅读路径指南。自动分析项目架构...
---
```

✅ **符合要求**：
- 有 `name` 和 `description`
- 格式正确

**3. `.claude/skills/verification-before-completion/SKILL.md`**

```yaml
---
name: 完成前验证
description: 在提交代码或创建 Pull Request 之前，当即将声称工作已完成、已修复或通过时...
---
```

✅ **符合要求**：
- 有 `name` 和 `description`
- 格式正确

#### 3.3.3 结论

**所有现有 Skills 文件格式已符合 SDK 要求，无需任何修改。**

---

### 3.4 测试策略

#### 3.4.1 单元测试修改

**1. `tests/core/MessageRouter.test.ts`**

**需要修改的测试**：

```typescript
describe('buildAppendPrompt', () => {
  it('应该返回 undefined（Skills 由 SDK 管理）', () => {
    const session = createTestSession();
    const result = router.buildAppendPrompt(session);
    expect(result).toBeUndefined();
  });
});

describe('getEnabledToolNames', () => {
  it('应该自动包含 Skill 工具', () => {
    const session = createTestSession();
    const tools = router.getEnabledToolNames(session);
    expect(tools).toContain('Skill');
  });

  it('应该不再提取 Skills 的 tools 字段', () => {
    // 删除此测试，因为不再支持 Skills tools 字段
  });
});
```

**删除的测试**：
- `buildSkillsPrompt()` 的所有测试
- `getSkillTools()` 的所有测试

**2. `tests/tools/ToolRegistry.test.ts`**

**新增测试**：

```typescript
describe('Skill tool', () => {
  it('应该注册 Skill 工具', () => {
    const registry = new ToolRegistry();
    expect(registry.isValidTool('Skill')).toBe(true);
  });

  it('Skill 工具应该不是危险工具', () => {
    const registry = new ToolRegistry();
    const metadata = registry.getToolMetadata('Skill');
    expect(metadata?.dangerous).toBe(false);
  });

  it('Skill 工具应该属于 AGENT 类别', () => {
    const registry = new ToolRegistry();
    const metadata = registry.getToolMetadata('Skill');
    expect(metadata?.category).toBe(ToolCategory.AGENT);
  });
});
```

**3. `tests/core/SessionManager.test.ts`**

**需要删除的测试**：
- 所有涉及 `loadedSkills` 字段的测试
- 所有涉及 `Skill` 接口的测试

#### 3.4.2 集成测试（新增）

**创建新文件**：`tests/integration/sdk-agent-skills.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('SDK Agent Skills Integration', () => {
  let testDir: string;

  beforeEach(async () => {
    // 创建临时测试目录
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-test-'));

    // 创建测试 Skill
    const skillDir = path.join(testDir, '.claude', 'skills', 'test-skill');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      `---
name: test-skill
description: Test skill for integration testing
---

# Test Skill Content
`
    );
  });

  afterEach(async () => {
    // 清理测试目录
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('应该通过 settingSources 加载项目级 Skills', async () => {
    const session = await sessionManager.createSession(testDir);
    const options = await messageRouter.buildQueryOptions(session);

    expect(options.settingSources).toContain('project');
  });

  it('应该在 allowedTools 中包含 Skill 工具', async () => {
    const session = await sessionManager.createSession(testDir);
    const options = await messageRouter.buildQueryOptions(session);

    expect(options.allowedTools).toContain('Skill');
  });

  it('应该不再追加 Skills 到系统提示词', async () => {
    const session = await sessionManager.createSession(testDir);
    const appendPrompt = messageRouter.buildAppendPrompt(session);

    expect(appendPrompt).toBeUndefined();
  });

  it('settingSources 应该仅包含 project', async () => {
    const session = await sessionManager.createSession(testDir);
    const options = await messageRouter.buildQueryOptions(session);

    expect(options.settingSources).toEqual(['project']);
  });
});
```

#### 3.4.3 手动验证步骤

**验证 1：Skills 自动发现**
```bash
# 启动应用
npm start

# 在交互界面询问
> What skills are available?

# 预期结果：Claude 列出所有 .claude/skills/ 中的 Skills
```

**验证 2：Skills 调用**
```bash
# 触发 agent-sdk-dev skill
> How do I create a custom MCP tool?

# 预期结果：
# - Claude 自动识别需要 agent-sdk-dev skill
# - 加载并使用该 skill 内容回答
# - 回答质量与之前一致
```

**验证 3：settingSources 配置传递**
```bash
# 启用调试日志（如果项目支持）
DEBUG=true npm start

# 检查日志输出
# 预期：看到 settingSources: ['project']
```

---

## 四、实施计划

### 4.1 实施阶段

#### 阶段 1：准备工作（30 分钟）

1. **创建特性分支**
   ```bash
   git checkout -b feat/migrate-to-sdk-skills
   ```

2. **备份关键文件**
   ```bash
   mkdir -p .backup/skills-migration
   cp -r src/skills/ .backup/skills-migration/
   cp src/main.ts .backup/skills-migration/
   cp src/core/MessageRouter.ts .backup/skills-migration/
   cp src/core/SessionManager.ts .backup/skills-migration/
   ```

3. **验证现有 Skills 格式**
   ```bash
   grep -r "description:" .claude/skills/*/SKILL.md
   ```

#### 阶段 2：代码修改（2 小时）

**按顺序执行**：

1. 修改 `src/tools/ToolRegistry.ts` - 添加 Skill 工具（5 分钟）
2. 修改 `src/core/MessageRouter.ts` - 5 处变更（30 分钟）
3. 修改 `src/core/SessionManager.ts` - 删除 Skill 接口和字段（10 分钟）
4. 修改 `src/main.ts` - 删除 SkillManager 逻辑（20 分钟）
5. 修改 `src/index.ts` - 删除导出（5 分钟）
6. 删除目录：`rm -rf src/skills/ tests/skills/`（5 分钟）
7. 编译验证：`npm run build`（10 分钟）

#### 阶段 3：测试调整（1.5 小时）

1. 修改 `tests/core/MessageRouter.test.ts`（30 分钟）
2. 添加 `tests/tools/ToolRegistry.test.ts` 中的 Skill 工具测试（15 分钟）
3. 修改 `tests/core/SessionManager.test.ts`（15 分钟）
4. 创建新的集成测试 `tests/integration/sdk-agent-skills.test.ts`（30 分钟）
5. 运行测试：`npm test`（15 分钟）

#### 阶段 4：文档更新（1 小时）

1. 更新 `docs/zh/DEVELOPER_GUIDE.md`（15 分钟）
2. 更新 `docs/zh/API.md`（10 分钟）
3. 更新 `docs/en/DEVELOPER_GUIDE.md`（15 分钟）
4. 更新 `docs/en/API.md`（10 分钟）
5. 创建 `MIGRATION_SKILLS.md`（10 分钟）

#### 阶段 5：验证和调试（2 小时）

1. 本地手动测试（60 分钟）
   - Skills 发现
   - Skills 调用
   - 用户级 Skills 加载
   - settingSources 配置

2. 调试和修复问题（60 分钟）

#### 阶段 6：提交和 PR（30 分钟）

1. 提交代码
2. 创建 Pull Request
3. 编写 PR 描述

**总时间估算**：约 7 小时

### 4.2 验证清单

**代码变更**：
- [ ] ToolRegistry 包含 Skill 工具
- [ ] MessageRouter.getSettingSources() 返回 ['project']
- [ ] MessageRouter.buildAppendPrompt() 返回 undefined
- [ ] MessageRouter.buildSkillsPrompt() 已删除
- [ ] MessageRouter.getSkillTools() 已删除
- [ ] MessageRouter.getEnabledToolNames() 自动添加 Skill 工具
- [ ] SessionManager.Skill 接口已删除
- [ ] SessionContext.loadedSkills 字段已删除
- [ ] main.ts 不再导入和使用 SkillManager
- [ ] src/skills/ 目录已删除
- [ ] tests/skills/ 目录已删除
- [ ] index.ts 不再导出 SkillManager

**编译和测试**：
- [ ] `npm run build` 成功，无类型错误
- [ ] `npm test` 所有测试通过
- [ ] 新增集成测试覆盖 Skills 场景

**功能验证**：
- [ ] Skills 自动发现工作正常
- [ ] Skills 能被 Claude 正确调用
- [ ] 项目级 Skills 能正常加载
- [ ] settingSources 正确传递给 SDK
- [ ] allowedTools 包含 Skill 工具

**文档**：
- [ ] 所有文档已更新
- [ ] 新增 SDK Skills 使用说明
- [ ] 创建迁移指南

---

## 五、风险与缓解

### 5.1 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|-----|------|------|---------|
| Skills 未被 SDK 正确发现 | 高 | 中 | 验证 settingSources 配置，添加详细日志 |
| Skill 工具未启用 | 高 | 低 | 默认添加到 allowedTools，添加单元测试 |
| 现有 Skills 格式不兼容 | 中 | 低 | 已验证格式符合 SDK 要求 |
| 用户级 Skills 加载失败 | 中 | 中 | 提供清晰的错误日志和文档说明 |
| 工具权限控制失效 | 中 | 低 | 移除 Skills tools 字段依赖 |
| 集成测试失败 | 低 | 中 | 编写全面的测试覆盖 |

### 5.2 回滚计划

如果迁移失败：

```bash
# 恢复删除的文件
git checkout HEAD -- src/skills/ tests/skills/

# 恢复修改的文件
git checkout HEAD -- \
  src/main.ts \
  src/core/MessageRouter.ts \
  src/core/SessionManager.ts \
  src/index.ts \
  src/tools/ToolRegistry.ts

# 重新构建
npm run build
npm test
```

---

## 六、文档更新

### 6.1 需要删除的内容

**从所有文档中删除**：
- SkillManager 类的 API 文档
- `loadSkills()`, `matchSkills()`, `applySkills()` 等方法说明
- 自定义 Skills 加载流程描述
- Skills 的 `tools` 字段说明

### 6.2 需要新增的内容

**在开发者指南中添加**：

```markdown
## Agent Skills（代理技能）

本项目使用 Claude Agent SDK 的 Agent Skills API 管理技能模块。

### Skills 目录结构
- **项目级 Skills**：`.claude/skills/` - 通过 Git 共享（仅支持此级别）

### 创建新 Skill

1. 在 `.claude/skills/` 创建新目录（如 `my-skill/`）
2. 创建 `SKILL.md` 文件：

```yaml
---
name: my-skill
description: |
  简要描述 Skill 功能和适用场景。
  这个描述决定了 Claude 何时调用此 Skill。
---

# Skill 内容（Markdown）

详细说明如何使用此 Skill...
```

### 工作原理

- SDK 在启动时自动发现 Skills 元数据
- Claude 根据 `description` 自主决定何时调用
- Skill 内容按需加载，不会全部注入系统提示词

### 注意事项

⚠️ **重要**：
- `tools` 字段在 SDK 中无效，通过主配置的 `allowedTools` 控制
- 确保 `description` 清晰描述 Skill 的适用场景
- Skill 名称默认从目录名提取
```

### 6.3 迁移指南

**创建新文档**：`MIGRATION_SKILLS.md`

```markdown
# Skills 迁移公告

## 重大变更

本项目已从自定义 SkillManager 迁移到 Claude Agent SDK 的官方 Agent Skills API。

## 影响范围

### 已移除
- `SkillManager` 类及其所有方法
- 手动加载 Skills 的 API
- Skills 的 `tools` 字段支持

### 无影响
- 现有 `.claude/skills/` 目录中的 SKILL.md 文件无需修改
- Skills 功能保持不变，仍然自动触发
- Skills 的触发条件和使用方式不变

## 技术变更

### 之前（自定义实现）
```typescript
const skillManager = new SkillManager();
await skillManager.loadSkills([skillDir]);
const skills = skillManager.matchSkills(context);
```

### 现在（SDK 管理）
```typescript
// Skills 由 SDK 自动管理，无需手动加载
// 只需确保 settingSources 包含 'project'
const options = {
  settingSources: ['project'],
  allowedTools: ['Skill', 'Read', 'Write', ...]
};
```

## 注意事项

1. **`tools` 字段失效**：SKILL.md 中的 `tools` 字段在 SDK 中不生效

2. **自动发现**：Skills 在应用启动时自动发现

3. **按需加载**：Skill 内容仅在 Claude 决定调用时加载

## 迁移检查清单

- [ ] 确认所有 SKILL.md 文件有 `description` 字段
- [ ] 移除任何手动调用 SkillManager 的代码
- [ ] 更新依赖 SkillManager 的自定义扩展
```

---

## 七、总结

### 7.1 迁移优势

✅ **符合官方最佳实践** - 使用 SDK 推荐的 Agent Skills API
✅ **简化代码维护** - 移除 492 行自定义代码
✅ **更可靠的 Skills 管理** - SDK 自动发现和按需加载
✅ **无需修改现有 Skills** - 所有 SKILL.md 文件格式已符合要求
✅ **更好的性能** - Skills 按需加载，不全部注入系统提示词
✅ **更好的用户体验** - Claude 自主决策何时使用 Skills

### 7.2 关键成功因素

1. ✅ 现有 Skills 文件格式已符合 SDK 要求
2. ✅ 项目已实现 `settingSources` 配置支持
3. ✅ 清晰的迁移计划和验证清单
4. ✅ 完整的测试覆盖
5. ✅ 详细的文档更新

### 7.3 实施时间

**预估时间**：6.5-7 小时
- 代码修改：2 小时
- 测试调整：1.5 小时
- 文档更新：1 小时
- 验证调试：2 小时
- 提交和 PR：0.5 小时
