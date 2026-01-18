# 待办事项进度显示功能设计文档

## 1. 背景与目标

### 1.1 背景
当前项目已集成 Claude Agent SDK，并在 `ToolRegistry` 中注册了 `TodoWrite` 工具。SDK 会在处理多步骤任务时通过 `tool_use` 消息调用 `TodoWrite` 工具，但系统目前**未对待办事项进行任何特殊显示**，仅按通用工具调用格式输出：`⏺ TodoWrite(todos: [...])`。

根据 Claude Agent SDK 文档（https://platform.claude.com/docs/zh-CN/agent-sdk/todo-tracking），待办事项跟踪是一种结构化的任务管理方式，可以帮助用户清晰地了解任务进度。

### 1.2 目标
实现待办事项进度的实时、详细、格式化显示，让用户能够直观地看到：
- 任务总数和完成情况统计
- 每个任务的状态（待处理、进行中、已完成）
- 当前正在处理的任务

## 2. 需求规格

### 2.1 功能需求

#### FR1: 实时显示
- **触发时机**: 每次 SDK 调用 `TodoWrite` 工具时立即显示
- **显示方式**: 在终端中输出独立的待办事项显示区域
- **更新策略**: 全量更新，每次显示完整的待办事项列表

#### FR2: 详细显示
显示内容包括：
1. **进度统计行**: 显示已完成/总任务数、进行中任务数
2. **完整任务列表**: 显示所有任务的序号、状态图标和描述

#### FR3: 状态可视化
- `pending` 状态: 使用 `⭕` 图标
- `in_progress` 状态: 使用 `🔧` 图标，显示 `activeForm` 文本
- `completed` 状态: 使用 `✅` 图标

#### FR4: 无持久化
- 待办事项仅在会话内存中跟踪
- 不存储到 session 文件
- 会话结束后不保留历史记录

#### FR5: 无额外配置
- 使用固定的显示格式和行为
- 不提供用户可配置选项

### 2.2 显示格式示例

```
⏺ TodoWrite
  进度: 3/10 已完成，当前正在处理: 1 个任务

  ⭕ 1. 分析代码结构
  ⭕ 2. 设计实现方案
  🔧 3. 正在实现待办事项显示功能
  ✅ 4. 编写单元测试
  ⭕ 5. 运行测试套件
  ...
```

### 2.3 非功能需求

#### NFR1: 性能
- 待办事项显示不应影响 SDK 消息处理性能
- 格式化和输出应在 10ms 内完成

#### NFR2: 兼容性
- 遵循现有 UI 渲染体系（ANSI 转义码）
- 不引入新的第三方依赖
- 支持颜色禁用配置（`enableColors`）

#### NFR3: 可维护性
- 遵循现有代码规范（文件头文档、魔法值配置）
- 符合项目的 Manager Pattern 和 Adapter Pattern
- 日志和异常信息使用英文

## 3. 技术方案

### 3.1 架构设计

#### 3.1.1 集成点
基于现有架构的三个关键集成点：

1. **消息处理层**: `StreamingQueryManager`
   - 检测 `TodoWrite` 工具调用
   - 触发 UI 显示回调

2. **UI 接口层**: `InteractiveUIInterface`
   - 新增 `displayTodoList()` 方法

3. **UI 实现层**: `TerminalInteractiveUI`
   - 实现待办事项的格式化和渲染

#### 3.1.2 调用链路
```
SDK query()
  → StreamingQueryManager.handleSDKMessage()
    → processToolUseBlock()
      → onToolUse callback
        → InteractiveRunner.onToolUse
          → 检测 TodoWrite
            → ui.displayTodoList(todos)
              → TerminalInteractiveUI.displayTodoList()
                → 格式化并输出到终端
```

### 3.2 数据结构

#### 3.2.1 TodoItem 接口
```typescript
/**
 * 待办事项接口
 */
export interface TodoItem {
  /** 任务描述（祈使形式） */
  content: string;
  /** 任务状态 */
  status: 'pending' | 'in_progress' | 'completed';
  /** 进行中时的描述（进行时形式） */
  activeForm: string;
}
```

#### 3.2.2 TodoWrite 工具输入
```typescript
interface TodoWriteInput {
  todos: TodoItem[];
}
```

### 3.3 实现方案

#### 3.3.1 方案选择
采用**方案 B：新增专用方法**（推荐）

**理由**：
- **职责清晰**: `displayToolUse()` 处理通用工具，`displayTodoList()` 专门处理待办事项
- **易于扩展**: 未来可以添加更多待办事项相关功能（如折叠/展开、过滤等）
- **代码可读性**: 避免在 `displayToolUse()` 中混入大量条件分支

**替代方案（不推荐）**：
- 方案 A：在 `displayToolUse()` 中特殊处理 `TodoWrite`
  - 缺点：违反单一职责原则，增加方法复杂度

#### 3.3.2 关键文件修改

##### 文件 1: `src/ui/InteractiveUIInterface.ts`
**修改内容**：
1. 新增 `TodoItem` 接口定义
2. 在 `InteractiveUIInterface` 接口中添加 `displayTodoList()` 方法

**修改示例**：
```typescript
/**
 * 待办事项接口
 */
export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

export interface InteractiveUIInterface {
  // ... 现有方法
  displayTodoList(todos: TodoItem[]): void;
}
```

##### 文件 2: `src/runners/InteractiveRunner.ts`
**修改内容**：
在 `onToolUse` 回调中特殊处理 `TodoWrite` 工具

**修改位置**: 第 104-109 行
**修改前**：
```typescript
onToolUse: (info) => {
  if (this.ui) {
    this.ui.stopComputing();
    this.ui.displayToolUse(info.name, info.input);
  }
}
```

**修改后**：
```typescript
onToolUse: (info) => {
  if (this.ui) {
    this.ui.stopComputing();

    // 特殊处理 TodoWrite 工具
    if (info.name === 'TodoWrite' && info.input.todos) {
      this.ui.displayTodoList(info.input.todos as TodoItem[]);
    } else {
      this.ui.displayToolUse(info.name, info.input);
    }
  }
}
```

##### 文件 3: `src/ui/TerminalInteractiveUI.ts`
**修改内容**：
1. 新增环境变量配置常量
2. 实现 `displayTodoList()` 方法

**新增常量**（在 COLORS 定义之后）：
```typescript
// Todo display configuration
const TERMINAL_UI_TODO_MAX_ITEMS = parseInt(
  process.env.TERMINAL_UI_TODO_MAX_ITEMS || '50',
  10
);
const TERMINAL_UI_TODO_MAX_LINE_LENGTH = parseInt(
  process.env.TERMINAL_UI_TODO_MAX_LINE_LENGTH || '100',
  10
);
```

**新增方法**（在 `displayToolUse()` 之后）：
```typescript
/**
 * Display todo list with progress
 * @param todos - Todo items from TodoWrite tool
 */
displayTodoList(todos: TodoItem[]): void {
  if (!todos || todos.length === 0) {
    return;
  }

  // Header
  const header = this.colorize('⏺', 'cyan') + ' ' + this.colorize('TodoWrite', 'bold');
  this.writeLine(header);

  // Statistics
  const completed = todos.filter(t => t.status === 'completed').length;
  const inProgress = todos.filter(t => t.status === 'in_progress').length;
  const total = todos.length;

  const stats = `  Progress: ${completed}/${total} completed, In progress: ${inProgress} task(s)`;
  this.writeLine(this.colorize(stats, 'gray'));
  this.writeLine('');

  // Todo items (限制显示数量)
  const itemsToShow = todos.slice(0, TERMINAL_UI_TODO_MAX_ITEMS);

  itemsToShow.forEach((todo, index) => {
    let icon: string;
    let text: string;
    let color: keyof typeof COLORS;

    switch (todo.status) {
      case 'completed':
        icon = '✅';
        text = todo.content;
        color = 'green';
        break;
      case 'in_progress':
        icon = '🔧';
        text = todo.activeForm || todo.content;
        color = 'cyan';
        break;
      case 'pending':
      default:
        icon = '⭕';
        text = todo.content;
        color = 'gray';
        break;
    }

    // 截断过长文本
    if (text.length > TERMINAL_UI_TODO_MAX_LINE_LENGTH) {
      text = text.substring(0, TERMINAL_UI_TODO_MAX_LINE_LENGTH - 3) + '...';
    }

    const line = `  ${icon} ${index + 1}. ${text}`;
    this.writeLine(this.colorize(line, color));
  });

  // 如果总数超过显示上限，显示省略提示
  if (todos.length > TERMINAL_UI_TODO_MAX_ITEMS) {
    const omitted = todos.length - TERMINAL_UI_TODO_MAX_ITEMS;
    this.writeLine(this.colorize(`  ... and ${omitted} more task(s)`, 'dim'));
  }
}
```

##### 文件 4: `src/ui/OutputInterface.ts`
**修改内容**：
导出 `TodoItem` 接口（如果需要在其他地方使用）

**修改位置**: 文件顶部导出部分
```typescript
export type { TodoItem } from './InteractiveUIInterface';
```

### 3.4 样式规范

#### 3.4.1 颜色方案
遵循现有 ANSI 颜色系统：
- **工具名称**: `bold`（粗体）
- **统计信息**: `gray`（灰色）
- **已完成任务**: `green`（绿色）
- **进行中任务**: `cyan`（青色）
- **待处理任务**: `gray`（灰色）
- **省略提示**: `dim`（暗淡）

#### 3.4.2 图标选择
- `⏺` - 工具调用标识（复用现有）
- `✅` - 已完成
- `🔧` - 进行中
- `⭕` - 待处理

### 3.5 环境变量配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `TERMINAL_UI_TODO_MAX_ITEMS` | `50` | 最多显示的待办事项数量 |
| `TERMINAL_UI_TODO_MAX_LINE_LENGTH` | `100` | 单行任务描述的最大长度 |

## 4. 实现计划

### 4.1 实施步骤

1. **类型定义**
   - 在 `InteractiveUIInterface.ts` 中定义 `TodoItem` 接口
   - 在 `InteractiveUIInterface` 接口中添加 `displayTodoList()` 方法签名

2. **UI 实现**
   - 在 `TerminalInteractiveUI.ts` 中添加环境变量配置常量
   - 实现 `displayTodoList()` 方法

3. **集成调用**
   - 修改 `InteractiveRunner.ts` 中的 `onToolUse` 回调
   - 添加 `TodoWrite` 工具的特殊处理逻辑

4. **类型导出**
   - 在 `OutputInterface.ts` 中导出 `TodoItem` 类型（可选）

### 4.2 实施顺序
建议按照**自下而上**的顺序实施：
1. 类型定义（基础）
2. UI 实现（核心）
3. 集成调用（连接）
4. 类型导出（辅助）

## 5. 测试验证

### 5.1 验证方法
由于 `TodoWrite` 是 SDK 内置工具，无法直接模拟调用，需要通过端到端测试验证。

#### 测试场景 1: 简单任务列表
**测试输入**:
```
用户: "帮我优化这个 React 组件的性能"
```

**预期输出**（SDK 可能调用 TodoWrite）:
```
⏺ TodoWrite
  Progress: 0/5 completed, In progress: 0 task(s)

  ⭕ 1. 分析组件渲染次数
  ⭕ 2. 识别不必要的重新渲染
  ⭕ 3. 实现 memoization
  ⭕ 4. 优化状态管理
  ⭕ 5. 验证性能改进
```

#### 测试场景 2: 进度更新
**预期行为**:
随着任务执行，待办事项列表应实时更新：
```
⏺ TodoWrite
  Progress: 2/5 completed, In progress: 1 task(s)

  ✅ 1. 分析组件渲染次数
  ✅ 2. 识别不必要的重新渲染
  🔧 3. 正在实现 memoization
  ⭕ 4. 优化状态管理
  ⭕ 5. 验证性能改进
```

#### 测试场景 3: 任务完成
**预期行为**:
所有任务完成后的显示：
```
⏺ TodoWrite
  Progress: 5/5 completed, In progress: 0 task(s)

  ✅ 1. 分析组件渲染次数
  ✅ 2. 识别不必要的重新渲染
  ✅ 3. 实现 memoization
  ✅ 4. 优化状态管理
  ✅ 5. 验证性能改进
```

### 5.2 验证清单
- [ ] 待办事项能够正确显示（格式、颜色、图标）
- [ ] 进度统计准确（已完成数、进行中数、总数）
- [ ] 状态图标正确（pending、in_progress、completed）
- [ ] activeForm 在 in_progress 状态下正确显示
- [ ] 长文本能够正确截断
- [ ] 超过上限的任务会显示省略提示
- [ ] 颜色禁用配置生效（enableColors: false）
- [ ] 不影响其他工具的正常显示

## 6. 关键文件清单

### 6.1 需要修改的文件
1. `/Users/wuwenjun/conductor/workspaces/claude-replica-v1/dakar/src/ui/InteractiveUIInterface.ts`
   - 新增 `TodoItem` 接口
   - 扩展 `InteractiveUIInterface` 接口

2. `/Users/wuwenjun/conductor/workspaces/claude-replica-v1/dakar/src/runners/InteractiveRunner.ts`
   - 修改 `onToolUse` 回调（第 104-109 行）

3. `/Users/wuwenjun/conductor/workspaces/claude-replica-v1/dakar/src/ui/TerminalInteractiveUI.ts`
   - 新增环境变量配置常量
   - 实现 `displayTodoList()` 方法

4. `/Users/wuwenjun/conductor/workspaces/claude-replica-v1/dakar/src/ui/OutputInterface.ts`（可选）
   - 导出 `TodoItem` 类型

### 6.2 参考文件
- `/Users/wuwenjun/conductor/workspaces/claude-replica-v1/dakar/src/sdk/StreamingQueryManager.ts`
  - 了解 tool_use 消息处理流程
- `/Users/wuwenjun/conductor/workspaces/claude-replica-v1/dakar/.claude/skills/agent-sdk-dev/claude-agent-sdk-doc/Todo-Lists.md`
  - Claude Agent SDK 官方文档

## 7. 风险与限制

### 7.1 技术风险
1. **SDK 行为不可控**: TodoWrite 的调用完全由 SDK 决定，无法保证何时触发
2. **终端兼容性**: Emoji 图标在某些终端中可能显示异常
3. **性能影响**: 频繁更新可能导致输出刷屏

### 7.2 缓解措施
1. **不可控行为**: 通过充分的端到端测试验证 SDK 行为
2. **终端兼容性**: 提供环境变量配置，允许用户选择 ASCII 图标（未来增强）
3. **性能影响**: 限制显示的任务数量（`TERMINAL_UI_TODO_MAX_ITEMS`）

### 7.3 限制
1. **无持久化**: 待办事项不会保存到会话文件
2. **无交互**: 用户无法手动标记任务完成或修改
3. **固定格式**: 不提供自定义显示格式的能力

## 8. 未来增强

### 8.1 潜在功能
1. **持久化存储**: 将待办事项保存到 `session/context.json` 或 `todos.json`
2. **用户交互**: 支持用户手动标记任务完成或添加新任务
3. **配置选项**: 在 `settings.json` 中提供显示模式、图标样式等配置
4. **状态栏模式**: 使用终端控制码实现固定位置的进度显示
5. **任务过滤**: 支持仅显示特定状态的任务（如仅显示 in_progress）
6. **任务分组**: 支持多个待办事项列表的并发跟踪

### 8.2 优先级
- **高**: 配置选项（用户反馈需求）
- **中**: 持久化存储（会话恢复场景）
- **低**: 用户交互、状态栏模式（复杂度高）

## 9. 参考资料

1. **Claude Agent SDK 文档**: https://platform.claude.com/docs/zh-CN/agent-sdk/todo-tracking
2. **项目架构文档**: `/Users/wuwenjun/conductor/workspaces/claude-replica-v1/dakar/.claude/CLAUDE.md`
3. **代码规范**: `/Users/wuwenjun/conductor/workspaces/claude-replica-v1/dakar/.claude/rules/`

## 10. 变更记录

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0 | 2026-01-18 | Claude | 初始版本 |
