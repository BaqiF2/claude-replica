# SubAgent 最佳实践分析与调整方案（程序化定义架构）

## 项目背景

Claude Replica 是基于 Claude Agent SDK 构建的 CLI 工具，支持通过 subAgent 实现任务专业化分工、并行处理、上下文隔离和权限控制。本规格说明旨在将当前基于文件系统的 subAgent 实现**完全迁移到 SDK 推荐的程序化定义架构**，并确保完全符合官方最佳实践。

---

## 任务目标

### 核心目标
1. **架构重构**：从文件系统方式（`.agent.md`）迁移到程序化定义（代码中定义）
2. **符合 SDK 标准**：完全对齐 Claude Agent SDK 官方最佳实践
3. **预设 Agents**：在代码中提供 6 个常用的预设 agents（code-reviewer, test-runner 等）
4. **简化架构**：移除文件系统和配置文件扩展，仅使用编程方式

### 实施策略
- **SDK 推荐架构**：采用官方推荐的编程方式（在 query 选项中传递 agents）
- **代码中硬编码预设**：6 个预设 agents 直接在代码中定义，不可扩展
- **移除文件系统支持**：完全删除 `.agent.md` 文件加载逻辑
- **最佳实践内置**：预设 agents 展示工具组合最佳实践

---

## 当前实现分析

### 当前架构（文件系统方式）

```
AgentRegistry.loadAgents(directories)
  ↓
扫描 ~/.claude/agents/ 和 .claude/agents/
  ↓
解析 *.agent.md 文件（YAML frontmatter）
  ↓
AgentRegistry.getAgentsForSDK() → Record<string, AgentDefinition>
  ↓
MessageRouter.getAgentDefinitions() → 传递给 SDK
```

**关键组件**：
- `AgentRegistry` (`src/agents/AgentRegistry.ts`) - 文件系统加载和解析
- `*.agent.md` 文件格式 - YAML frontmatter + Markdown 内容

### 当前实现的问题

| 问题 | 描述 | SDK 推荐 |
|------|------|---------|
| **架构不符** | 使用文件系统方式，非 SDK 主推方式 | 程序化定义（在代码中或配置文件中） |
| **缺少预设** | 用户需要手动创建代理文件 | 提供常用预设 agents |
| **配置分散** | .agent.md 文件分布在多个目录 | 集中在 settings.json |
| **Task 工具未验证** | 文件中可能包含 Task 工具 | 必须过滤 Task 工具 |
| **主代理缺少 Task** | 未自动添加 Task 工具 | 有 agents 时自动启用 |

---

## 目标架构（程序化定义方式）

### 新架构设计

```
代码中的预设 Agents（src/agents/PresetAgents.ts）
  ↓
AgentRegistry.getAll() → 6 个预设 agents（固定）
  ↓
AgentRegistry.getAgentsForSDK() → Record<string, AgentDefinition>
  ↓
MessageRouter.getAgentDefinitions() → 传递给 SDK query() 选项
```

### 核心变更

#### 1. 移除文件系统加载
- ❌ 删除 `loadAgents()` 方法
- ❌ 删除 `parseAgentFile()` 方法
- ❌ 删除 `.agent.md` 文件格式支持
- ❌ 删除所有文件系统相关逻辑

#### 2. 代码中定义预设 Agents（仅此一种方式）
- ✅ 创建 `src/agents/PresetAgents.ts` 定义 6 个预设 agents
- ✅ 内置 code-reviewer, test-runner, doc-generator 等
- ✅ 展示最佳实践（工具组合、提示词质量）
- ✅ 硬编码，不支持用户扩展或覆盖

---

## 详细实施方案

### 步骤 1：创建预设 Agents 定义

**新建文件**：`src/agents/PresetAgents.ts`

```typescript
/**
 * 文件功能：预设 SubAgent 定义，基于 Claude Agent SDK 最佳实践
 *
 * 核心导出：
 * - PRESET_AGENTS: 预设 agent 定义集合
 * - getPresetAgents(): 获取所有预设 agents
 */

import { AgentDefinition } from '../types';

/**
 * 预设 SubAgents 集合
 *
 * 基于 SDK 最佳实践，提供常用场景的 agent 定义
 */
export const PRESET_AGENTS: Record<string, AgentDefinition> = {
  /**
   * 代码审查专家
   * 场景：代码质量分析、安全审查、最佳实践检查
   * 工具组合：只读分析（Read, Grep, Glob）
   */
  'code-reviewer': {
    description: 'Expert code reviewer for quality, security, and best practices analysis. Use for reviewing code changes, identifying vulnerabilities, and suggesting improvements.',
    model: 'sonnet',
    tools: ['Read', 'Grep', 'Glob'],
    prompt: `You are a code review specialist with expertise in security, performance, and best practices.

When reviewing code:
- Identify security vulnerabilities (SQL injection, XSS, CSRF, etc.)
- Check for performance issues (N+1 queries, memory leaks, inefficient algorithms)
- Verify adherence to coding standards and conventions
- Suggest specific, actionable improvements
- Highlight positive patterns worth maintaining

Be thorough but concise. Focus on high-impact issues first.`,
  },

  /**
   * 测试执行专家
   * 场景：运行测试、分析测试结果、调试失败用例
   * 工具组合：测试执行（Bash, Read, Grep）
   */
  'test-runner': {
    description: 'Test execution specialist for running and analyzing test suites. Use for executing tests, analyzing failures, and generating test reports.',
    model: 'sonnet',
    tools: ['Bash', 'Read', 'Grep'],
    prompt: `You are a test execution expert. Your role is to run tests and provide clear analysis of results.

When working with tests:
- Execute test commands efficiently
- Analyze test output and identify failing tests
- Provide clear explanations of test failures
- Suggest fixes for common test issues
- Generate concise test reports

Focus on actionable insights that help developers fix issues quickly.`,
  },

  /**
   * 文档生成专家
   * 场景：生成 API 文档、README、技术规范
   * 工具组合：文档生成（Read, Write, Grep, Glob）
   */
  'doc-generator': {
    description: 'Documentation specialist for generating API docs, READMEs, and technical specifications. Use for creating comprehensive documentation from code.',
    model: 'sonnet',
    tools: ['Read', 'Write', 'Grep', 'Glob'],
    prompt: `You are a technical documentation expert. Create clear, comprehensive documentation.

When generating docs:
- Extract information from code accurately
- Write clear, concise explanations
- Include practical examples
- Follow documentation best practices (consistent formatting, proper structure)
- Ensure completeness without verbosity

Produce documentation that serves both beginners and experienced users.`,
  },

  /**
   * 重构专家
   * 场景：代码重构、结构优化、技术债务清理
   * 工具组合：代码修改（Read, Edit, Write, Grep, Glob）
   */
  'refactoring-specialist': {
    description: 'Code refactoring specialist for improving code structure and quality. Use for refactoring, removing code smells, and reducing technical debt.',
    model: 'sonnet',
    tools: ['Read', 'Edit', 'Write', 'Grep', 'Glob'],
    prompt: `You are a refactoring expert focused on improving code quality.

When refactoring:
- Preserve existing functionality (no behavior changes)
- Improve code readability and maintainability
- Apply design patterns appropriately
- Remove code duplication
- Simplify complex logic
- Update related tests and documentation

Make incremental, safe changes. Explain your refactoring decisions.`,
  },

  /**
   * 安全审计专家
   * 场景：安全漏洞扫描、敏感数据检测、依赖审计
   * 工具组合：只读分析（Read, Grep, Glob）
   */
  'security-auditor': {
    description: 'Security audit specialist for vulnerability scanning and sensitive data detection. Use for security reviews, dependency audits, and compliance checks.',
    model: 'opus', // 使用更强大的模型进行安全分析
    tools: ['Read', 'Grep', 'Glob'],
    prompt: `You are a security auditing expert. Perform thorough security analysis.

Focus areas:
- OWASP Top 10 vulnerabilities
- Sensitive data exposure (API keys, passwords, tokens)
- Insecure dependencies and outdated packages
- Authentication and authorization flaws
- Cryptography misuse
- Input validation issues

Provide severity ratings (Critical/High/Medium/Low) and remediation steps.`,
  },

  /**
   * 数据分析专家
   * 场景：日志分析、数据提取、趋势识别
   * 工具组合：读取和命令执行（Read, Bash, Grep, Glob）
   */
  'data-analyzer': {
    description: 'Data analysis specialist for log analysis, data extraction, and pattern identification. Use for analyzing logs, metrics, and structured data.',
    model: 'sonnet',
    tools: ['Read', 'Bash', 'Grep', 'Glob'],
    prompt: `You are a data analysis expert. Extract insights from data and logs.

When analyzing:
- Identify patterns and anomalies
- Aggregate and summarize data effectively
- Generate statistical summaries
- Visualize trends when possible
- Provide actionable insights

Present findings clearly with supporting evidence.`,
  },
};

/**
 * 获取所有预设 agents
 *
 * @returns 预设 agent 定义映射
 */
export function getPresetAgents(): Record<string, AgentDefinition> {
  return { ...PRESET_AGENTS };
}

/**
 * 获取预设 agent 名称列表
 *
 * @returns 预设 agent 名称数组
 */
export function getPresetAgentNames(): string[] {
  return Object.keys(PRESET_AGENTS);
}

/**
 * 检查 agent 名称是否为预设
 *
 * @param name - Agent 名称
 * @returns 是否为预设 agent
 */
export function isPresetAgent(name: string): boolean {
  return name in PRESET_AGENTS;
}
```

### 步骤 2：重构 AgentRegistry

**文件**：`src/agents/AgentRegistry.ts`

**完全重写**，移除文件加载逻辑：

```typescript
/**
 * 文件功能：SubAgent 注册和管理，基于程序化定义方式
 *
 * 核心类：
 * - AgentRegistry: Agent 注册中心
 *
 * 核心方法：
 * - getAll(): 获取所有 agents（预设 + 自定义）
 * - getAgent(name): 获取指定 agent
 * - getAgentsForSDK(): 转换为 SDK 格式
 * - validateAgentDefinitions(): 验证 agent 定义
 */

import { AgentDefinition } from '../types';
import { getPresetAgents } from './PresetAgents';

export class AgentRegistry {
  /**
   * 获取所有 agents（仅预设）
   *
   * @returns 所有 agent 定义（6 个预设）
   */
  getAll(): Record<string, AgentDefinition> {
    return getPresetAgents();
  }

  /**
   * 获取指定 agent
   *
   * @param name - Agent 名称
   * @returns Agent 定义，不存在则返回 undefined
   */
  getAgent(name: string): AgentDefinition | undefined {
    return this.getAll()[name];
  }

  /**
   * 获取 SDK 格式的 agents
   *
   * @returns Record<name, AgentDefinition>
   */
  getAgentsForSDK(): Record<string, AgentDefinition> {
    return this.getAll();
  }

  /**
   * 验证 agent 定义
   *
   * SDK 约束：
   * 1. description 和 prompt 必须存在
   * 2. tools 不能包含 Task（防止嵌套）
   * 3. model 必须是有效值
   *
   * @param agents - Agent 定义映射
   * @returns 验证后的 agent 定义
   */
  static validateAgentDefinitions(
    agents: Record<string, AgentDefinition>
  ): Record<string, AgentDefinition> {
    const validated: Record<string, AgentDefinition> = {};
    const errors: string[] = [];

    for (const [name, definition] of Object.entries(agents)) {
      // 检查必需字段
      if (!definition.description?.trim()) {
        errors.push(`Agent "${name}": description is required`);
        continue;
      }
      if (!definition.prompt?.trim()) {
        errors.push(`Agent "${name}": prompt is required`);
        continue;
      }

      // 过滤 Task 工具（子代理不能使用 Task）
      let tools = definition.tools;
      if (tools?.includes('Task')) {
        console.warn(
          `Warning: Agent "${name}" includes Task tool. SubAgents cannot use Task to prevent nesting. ` +
          `Task has been removed from the tool list.`
        );
        tools = tools.filter(tool => tool !== 'Task');
      }

      // 验证 model 值
      const validModels = ['sonnet', 'opus', 'haiku', 'inherit'];
      let model = definition.model;
      if (model && !validModels.includes(model)) {
        console.warn(
          `Warning: Agent "${name}" has invalid model "${model}". ` +
          `Valid models: ${validModels.join(', ')}. Defaulting to "inherit".`
        );
        model = 'inherit';
      }

      validated[name] = {
        description: definition.description,
        prompt: definition.prompt,
        tools: tools && tools.length > 0 ? tools : undefined,
        model: model || 'inherit',
      };
    }

    if (errors.length > 0) {
      throw new Error(`Agent definition validation failed:\n${errors.join('\n')}`);
    }

    return validated;
  }
}
```

### 步骤 3：更新 Application 初始化

**文件**：`src/main.ts`

**修改 `loadCustomExtensions()` 方法**：

```typescript
/**
 * 加载自定义扩展
 *
 * @param workingDir - 工作目录
 */
private async loadCustomExtensions(workingDir: string): Promise<void> {
  // 移除：agentRegistry.loadAgents() 文件加载逻辑
  // 预设 agents 已在代码中定义，无需加载

  // 显示预设 agents 数量
  const agentCount = Object.keys(this.agentRegistry.getAll()).length;
  console.log(`SubAgents initialized: ${agentCount} preset agent(s)`);

  // ... 其他扩展加载逻辑
}
```

### 步骤 4：MessageRouter 自动添加 Task 工具

**文件**：`src/core/MessageRouter.ts`

**修改 `getEnabledToolNames()` 方法**（保持之前设计）：

```typescript
getEnabledToolNames(session: Session): string[] {
  const { projectConfig, userConfig } = session.context;
  const mergedConfig = this.configManager.mergeConfigs(userConfig, projectConfig);

  let tools = this.toolRegistry.getEnabledTools({
    allowedTools: mergedConfig.allowedTools,
    disallowedTools: mergedConfig.disallowedTools,
  });

  // 默认启用 Skill 工具
  if (!tools.includes('Skill') && this.toolRegistry.isValidTool('Skill')) {
    tools.push('Skill');
  }

  // ✅ 如果有 subAgents 定义，确保主代理可以使用 Task 工具
  const agentDefinitions = this.getAgentDefinitions(session);
  if (Object.keys(agentDefinitions).length > 0) {
    if (!tools.includes('Task') && this.toolRegistry.isValidTool('Task')) {
      tools.push('Task');
      console.log(
        'Info: Task tool automatically enabled because subAgents are defined. ' +
        'Main agent requires Task tool to delegate work to subAgents.'
      );
    }
  }

  // 移除禁用的工具
  if (mergedConfig.disallowedTools && mergedConfig.disallowedTools.length > 0) {
    const disallowedSet = new Set(mergedConfig.disallowedTools);
    tools = tools.filter((tool) => !disallowedSet.has(tool));
  }

  return tools;
}
```

---

## 对比分析：新旧架构

| 维度 | 旧架构（文件系统） | 新架构（程序化定义） | 改进 |
|------|------------------|-------------------|------|
| **定义方式** | `.agent.md` 文件 + YAML frontmatter | 代码中定义（硬编码） | ✅ 符合 SDK 推荐 |
| **预设 Agents** | 无，用户需手动创建 | 6 个内置预设（reviewer, tester, etc.） | ✅ 开箱即用 |
| **用户扩展** | 支持文件系统扩展 | 不支持，仅预设 | ✅ 简化架构 |
| **Task 工具验证** | 未实现 | 自动过滤 + 警告 | ✅ 符合 SDK 约束 |
| **主代理 Task 工具** | 未自动添加 | 自动检测并添加 | ✅ 符合 SDK 约束 |
| **类型安全** | 文件解析，运行时验证 | TypeScript 类型，编译时检查 | ✅ 更安全 |
| **文档和示例** | 需要外部文档 | 代码即文档（预设展示最佳实践） | ✅ 学习曲线低 |
| **可扩展性** | 仅文件系统 | 代码 + 配置文件 | ✅ 灵活性高 |

---

## 测试策略

### 单元测试

**新增**：`tests/unit/agents/PresetAgents.test.ts`

```typescript
describe('PresetAgents', () => {
  it('should provide all preset agents', () => {
    const agents = getPresetAgents();
    expect(Object.keys(agents).length).toBeGreaterThan(0);
  });

  it('should not include Task tool in any preset agent', () => {
    const agents = getPresetAgents();
    for (const [name, definition] of Object.entries(agents)) {
      if (definition.tools) {
        expect(definition.tools).not.toContain('Task');
      }
    }
  });

  it('should have valid descriptions and prompts', () => {
    const agents = getPresetAgents();
    for (const [name, definition] of Object.entries(agents)) {
      expect(definition.description).toBeTruthy();
      expect(definition.description.length).toBeGreaterThan(20);
      expect(definition.prompt).toBeTruthy();
      expect(definition.prompt.length).toBeGreaterThan(50);
    }
  });
});
```

**新增**：`tests/unit/agents/AgentRegistry.test.ts`

```typescript
describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  it('should return all preset agents by default', () => {
    const agents = registry.getAll();
    const presetNames = getPresetAgentNames();

    for (const name of presetNames) {
      expect(agents[name]).toBeDefined();
    }
  });

  it('should return fixed preset agents (no customization)', () => {
    const agents = registry.getAll();

    // 预设 agents 数量固定
    expect(Object.keys(agents).length).toBe(6);

    // 包含所有预设 agents
    expect(agents['code-reviewer']).toBeDefined();
    expect(agents['test-runner']).toBeDefined();
    expect(agents['doc-generator']).toBeDefined();
    expect(agents['refactoring-specialist']).toBeDefined();
    expect(agents['security-auditor']).toBeDefined();
    expect(agents['data-analyzer']).toBeDefined();
  });

  it('should throw error for agents missing required fields', () => {
    const invalidAgents = {
      'invalid-agent': {
        description: '',
        prompt: 'Test',
      },
    };

    expect(() => {
      AgentRegistry.validateAgentDefinitions(invalidAgents);
    }).toThrow('description is required');
  });
});
```

### 集成测试

**修改**：`tests/integration/sdk-agent-skills.test.ts`

```typescript
describe('SDK Agent Skills - Programmatic Definition', () => {
  it('should load preset agents automatically', () => {
    const registry = new AgentRegistry();
    const agents = registry.getAll();

    // 验证预设 agents 存在
    expect(agents['code-reviewer']).toBeDefined();
    expect(agents['test-runner']).toBeDefined();
    expect(agents['doc-generator']).toBeDefined();
  });

  it('should always return the same preset agents', () => {
    const registry = new AgentRegistry();
    const agents1 = registry.getAll();
    const agents2 = registry.getAll();

    // 每次获取的 agents 应该一致
    expect(agents1).toEqual(agents2);
    expect(Object.keys(agents1).length).toBe(6);
  });

  it('should auto-enable Task tool when agents are defined', () => {
    const session = {
      context: {
        activeAgents: [],
        projectConfig: {},
        userConfig: {},
      },
    };

    const registry = new AgentRegistry();
    const messageRouter = new MessageRouter({ /* ... */ });

    // 模拟有 agents 定义
    session.context.activeAgents = Object.entries(registry.getAll()).map(
      ([name, def]) => ({ name, ...def })
    );

    const tools = messageRouter.getEnabledToolNames(session);
    expect(tools).toContain('Task');
  });
});
```

### 端到端验证

**手动测试步骤**：

1. **验证预设 agents 加载**
   ```bash
   npm run build
   npm run start
   ```

   预期输出：
   ```
   SubAgents initialized: 6 preset(s) + 0 custom(s)
   ```

2. **测试 subAgent 调用**

   用户输入：
   ```
   请使用 code-reviewer 审查 src/main.ts
   ```

   预期行为：
   - 主代理自动启用 Task 工具
   - 调用 code-reviewer 子代理
   - 子代理使用 Read/Grep/Glob 分析代码
   - 返回审查结果

---

## 迁移路径

### 破坏性变更分析

| 变更 | 影响 | 缓解措施 |
|------|------|---------|
| 移除 `.agent.md` 文件支持 | 🔴 破坏性 | 提供 6 个预设 agents 覆盖常见场景 |
| 移除 AgentRegistry.loadAgents() | 🔴 API 破坏性 | 内部 API，无外部调用 |
| 移除文件系统目录配置 | 🔴 配置破坏性 | 预设 agents 减少配置需求 |
| 不支持用户自定义 | 🟡 功能限制 | 6 个预设 agents 应覆盖大多数场景 |

### 迁移步骤

#### 阶段 1：实现新架构（2-3 天）

1. **Day 1**：
   - 创建 `PresetAgents.ts`，定义 6 个预设 agents
   - 重写 `AgentRegistry.ts`，移除文件加载逻辑
   - 添加 `validateAgentDefinitions()` 验证

2. **Day 2**：
   - 更新 `Application.loadCustomExtensions()`
   - 更新 `MessageRouter.getEnabledToolNames()`
   - 配置文件格式定义和验证

3. **Day 3**：
   - 单元测试编写
   - 集成测试更新

#### 阶段 2：文档和工具（1-2 天）

4. **Day 4**：
   - 更新 CLAUDE.md
   - 创建 SubAgents 使用指南
   - 提供 .agent.md → settings.json 迁移示例

5. **Day 5**（可选）：
   - 创建迁移工具脚本（辅助用户转换现有 .agent.md 文件）

#### 阶段 3：验证和发布（1 天）

6. **Day 6**：
   - 端到端手动测试
   - 性能验证
   - 最终文档审查

---

## 文档更新

### CLAUDE.md 更新

**位置**：`.claude/CLAUDE.md`

**完全重写 Agents System 章节**：

```markdown
### Agents System (`src/agents/`)

#### 概述
- **Purpose**: Specialized sub-agents for specific tasks
- **Architecture**: Programmatic definition (in code + settings.json)
- **Preset Agents**: 6 built-in agents for common scenarios
- **SDK Integration**: Fully aligned with Claude Agent SDK best practices

#### 预设 Agents

项目提供 6 个开箱即用的预设 agents：

| Agent | 场景 | 工具组合 | 模型 |
|-------|------|---------|------|
| `code-reviewer` | 代码审查、安全分析 | Read, Grep, Glob | sonnet |
| `test-runner` | 测试执行、结果分析 | Bash, Read, Grep | sonnet |
| `doc-generator` | 文档生成、API 文档 | Read, Write, Grep, Glob | sonnet |
| `refactoring-specialist` | 代码重构、优化 | Read, Edit, Write, Grep, Glob | sonnet |
| `security-auditor` | 安全审计、漏洞扫描 | Read, Grep, Glob | opus |
| `data-analyzer` | 日志分析、数据提取 | Read, Bash, Grep, Glob | sonnet |

#### 自定义 Agents

在 `settings.json` 中添加 `agents` 字段自定义 agents：

```json
{
  "agents": {
    "custom-agent": {
      "description": "Agent description for auto-matching",
      "model": "sonnet",
      "tools": ["Read", "Grep", "Glob"],
      "prompt": "System prompt defining agent's role..."
    }
  }
}
```

**自定义 agents 可以覆盖预设 agents**（使用相同名称）。

#### ⚠️ 关键约束（SDK 最佳实践）

**子代理工具限制**：
- 子代理的 `tools` 列表**不能包含 `Task` 工具**
- 原因：防止无限嵌套调用
- 自动处理：系统自动过滤并显示警告

**主代理工具要求**：
- 使用子代理时，主代理必须在 `allowedTools` 中包含 `Task` 工具
- 自动处理：检测到 agents 时自动添加 Task

#### 推荐工具组合

| 任务类型 | 推荐工具 | 参考 Agent |
|---------|---------|-----------|
| **只读分析** | Read, Grep, Glob | code-reviewer, security-auditor |
| **测试执行** | Bash, Read, Grep | test-runner |
| **代码修改** | Read, Edit, Write, Grep, Glob | refactoring-specialist |
| **文档生成** | Read, Write, Grep, Glob | doc-generator |
| **数据处理** | Read, Bash, Grep, Glob | data-analyzer |

#### 代码位置

- **预设定义**: `src/agents/PresetAgents.ts`
- **注册管理**: `src/agents/AgentRegistry.ts`
- **初始化**: `src/main.ts` 中的 `loadCustomExtensions()`
```

### 新增：docs/subagents-guide.md

**内容大纲**：

1. **核心概念** - SubAgents 是什么，为何使用
2. **预设 Agents** - 6 个内置 agents 的详细说明和使用示例
3. **自定义 Agents** - settings.json 配置指南
4. **关键约束** - Task 工具限制、必需字段
5. **最佳实践** - 工具组合、提示词编写、模型选择
6. **常见问题** - FAQ 和故障排查
7. **完整示例** - 端到端使用案例

### 新增：docs/migration-from-agent-md.md

**迁移指南**，帮助用户从 `.agent.md` 迁移到 settings.json：

```markdown
# 从 .agent.md 迁移到程序化定义

## 背景

Claude Replica v2.0 采用 SDK 推荐的程序化定义方式管理 subAgents，
不再支持 `.agent.md` 文件格式。

## 迁移步骤

### 旧格式（.agent.md）

`.claude/agents/my-agent.agent.md`:
```yaml
---
description: My custom agent
model: sonnet
tools:
  - Read
  - Grep
---

Agent prompt here...
```

### 新格式（settings.json）

`.claude/settings.json`:
```json
{
  "agents": {
    "my-agent": {
      "description": "My custom agent",
      "model": "sonnet",
      "tools": ["Read", "Grep"],
      "prompt": "Agent prompt here..."
    }
  }
}
```

## 转换示例

### 示例 1：代码审查 Agent

**旧**（`.claude/agents/reviewer.agent.md`）:
```yaml
---
description: Code quality reviewer
model: sonnet
tools:
  - Read
  - Grep
  - Glob
---

You are a code reviewer...
```

**新**（`.claude/settings.json`）:
```json
{
  "agents": {
    "reviewer": {
      "description": "Code quality reviewer",
      "model": "sonnet",
      "tools": ["Read", "Grep", "Glob"],
      "prompt": "You are a code reviewer..."
    }
  }
}
```

## 注意事项

1. **JSON 格式**：提示词需要转义换行符或使用单行
2. **工具名称**：保持大小写一致（如 `Read` 而非 `read`）
3. **覆盖预设**：如果名称与预设相同，会覆盖预设定义
```

---

## 关键文件清单

### 核心逻辑（3 个文件）

1. **`src/agents/PresetAgents.ts`**（新增，~300 行）
   - 定义 6 个预设 agents
   - 展示最佳实践（工具组合、提示词质量）

2. **`src/agents/AgentRegistry.ts`**（重写，~150 行）
   - 移除文件加载逻辑
   - 实现 `setCustomAgents()`, `getAll()`, `validateAgentDefinitions()`

3. **`src/main.ts`**（修改，~20 行）
   - 更新 `loadCustomExtensions()` 方法
   - 从 settings.json 加载自定义 agents

### 验证逻辑（1 个文件）

4. **`src/core/MessageRouter.ts`**（修改，~15 行）
   - 修改 `getEnabledToolNames()` 方法
   - 自动添加 Task 工具逻辑

### 测试文件（3 个文件）

5. **`tests/unit/agents/PresetAgents.test.ts`**（新增，~60 行）
   - 预设 agents 验证测试

6. **`tests/unit/agents/AgentRegistry.test.ts`**（重写，~100 行）
   - Registry 逻辑测试
   - 自定义 agents 覆盖测试
   - Task 工具过滤测试

7. **`tests/integration/sdk-agent-skills.test.ts`**（修改，~50 行）
   - 端到端集成测试

### 文档文件（3 个文件）

8. **`.claude/CLAUDE.md`**（修改，~80 行）
   - 重写 Agents System 章节

9. **`docs/subagents-guide.md`**（新增，~400 行）
   - 完整使用指南

10. **`docs/migration-from-agent-md.md`**（新增，~150 行）
    - 迁移指南

---

## 实施时间线

**总计：5-6 个工作日**

### Week 1: 核心实现

**Day 1-2: 预设 Agents 和 Registry 重构**
- 创建 `PresetAgents.ts`，定义 6 个预设 agents
- 重写 `AgentRegistry.ts`，移除文件加载逻辑
- 实现验证逻辑（`validateAgentDefinitions()`）

**Day 3: 集成和验证**
- 更新 `Application.loadCustomExtensions()`
- 更新 `MessageRouter.getEnabledToolNames()`
- 单元测试编写

### Week 2: 测试和文档

**Day 4: 集成测试**
- 更新集成测试
- 端到端手动测试
- 性能验证

**Day 5: 文档**
- 更新 CLAUDE.md
- 创建 SubAgents 使用指南
- 创建迁移指南

**Day 6: 收尾和发布准备**（可选）
- 创建迁移工具脚本
- 最终验证
- 发布准备

---

## 验证清单

### 功能验证
- [ ] 预设 agents 自动加载（6 个）
- [ ] settings.json 自定义 agents 正确加载
- [ ] 自定义 agents 可以覆盖预设
- [ ] Task 工具自动过滤 + 警告
- [ ] 主代理自动启用 Task 工具
- [ ] disallowedTools 仍能禁用 Task
- [ ] 配置验证（必需字段、有效 model）

### 测试验证
- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 端到端手动测试成功
- [ ] 无性能退化

### 文档验证
- [ ] CLAUDE.md 准确完整
- [ ] SubAgents 指南清晰易懂
- [ ] 迁移指南实用
- [ ] 示例代码可运行

---

## 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 破坏现有 .agent.md 用户配置 | 🔴 高 | 高 | 详细迁移指南 + 迁移工具脚本 |
| 预设 agents 不满足所有需求 | 🟡 中 | 中 | settings.json 扩展 + 文档说明 |
| settings.json 格式复杂 | 🟡 中 | 低 | 提供示例 + 模板 |
| 性能影响（代码中定义） | 🟢 低 | 极低 | 预设已优化，无运行时开销 |

---

## 总结

本规格说明设计了从文件系统方式到程序化定义方式的完整迁移方案：

1. **移除 .agent.md 文件支持**，完全采用代码 + settings.json 定义
2. **提供 6 个预设 agents**，覆盖常见场景，展示最佳实践
3. **支持 settings.json 扩展**，用户可自定义或覆盖预设
4. **内置验证和自动修正**，确保符合 SDK 约束（Task 工具黑白名单）

预计实施周期为 **5-6 个工作日**，完成后 Claude Replica 的 subAgent 架构将完全符合 Claude Agent SDK 的官方推荐方式。
