# 权限系统重构设计文档

## 1. 项目概述

### 1.1 目标

根据 Claude Agent SDK 官方文档 (https://platform.claude.com/docs/zh-CN/agent-sdk/permissions) 重构权限相关功能,实现以下核心需求:

1. **默认权限模式**: 设置为 `acceptEdits`
2. **动态权限切换**: 保持 Shift+Tab 切换权限,支持流式动态更改
3. **持久权限显示**: 权限类型持续显示在终端提示符,格式: `> 🟡`
4. **canUseTool 回调**: 独立面板显示权限请求,支持用户批准/拒绝
5. **AskUserQuestion 支持**: 交互式菜单展示问题和选项,返回答案给 SDK
6. **代码清理**: 移除无关旧代码,保持分层设计

### 1.2 设计原则

- **UI层分离**: 权限逻辑层与终端UI层完全分离
- **SDK优先**: 严格遵循 Claude Agent SDK 的接口规范
- **简化设计**: 移除不必要的权限历史等功能
- **用户体验**: 清晰的权限状态显示和友好的交互设计

---

## 2. 架构设计

### 2.1 核心模块划分

```
┌─────────────────────────────────────────────────────┐
│                  Application Layer                  │
│                   (main.ts)                         │
└────────────────┬────────────────────────────────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
┌───▼──────────────┐   ┌─────▼──────────────────────┐
│  UI Layer        │   │  Permission Layer          │
│  (InteractiveUI) │◄──┤  (PermissionManager)       │
│                  │   │                            │
│  - 提示符emoji    │   │  - 权限检查逻辑             │
│  - Shift+Tab     │   │  - canUseTool回调          │
│  - 权限面板       │   │  - AskUserQuestion处理     │
│  - 交互式菜单     │   │                            │
└──────────────────┘   └─────┬──────────────────────┘
                             │
                      ┌──────▼─────────────────────┐
                      │  SDK Integration Layer     │
                      │  (MessageRouter,           │
                      │   SDKQueryExecutor)        │
                      │                            │
                      │  - 创建权限处理函数          │
                      │  - 传递给SDK               │
                      │  - 动态切换权限模式          │
                      └────────────────────────────┘
```

### 2.2 接口定义

#### 2.2.1 PermissionUI 接口

```typescript
/**
 * 权限UI接口 - UI层实现
 *
 * 职责: 处理所有权限相关的终端交互
 */
interface PermissionUI {
  /**
   * 显示工具权限请求面板
   *
   * @param request 权限请求信息
   * @returns 用户是否批准以及可选的拒绝原因
   */
  promptToolPermission(request: ToolPermissionRequest): Promise<PermissionUIResult>;

  /**
   * 显示AskUserQuestion交互式菜单
   *
   * @param questions 问题列表
   * @returns 用户答案映射 (问题文本 -> 答案)
   */
  promptUserQuestions(questions: QuestionInput[]): Promise<QuestionAnswers>;
}

interface ToolPermissionRequest {
  toolName: string;
  toolUseID: string;
  input: Record<string, unknown>;
  timestamp: Date;
}

interface PermissionUIResult {
  approved: boolean;
  reason?: string;  // 拒绝原因
}

interface QuestionInput {
  question: string;
  header: string;
  options: Array<{ label: string; description: string }>;
  multiSelect: boolean;
}

type QuestionAnswers = Record<string, string>;  // question -> answer(s)
```

#### 2.2.2 SDK CanUseTool 回调

```typescript
/**
 * SDK兼容的canUseTool回调签名
 */
type SDKCanUseTool = (
  toolName: string,
  input: any,
  options: {
    signal: AbortSignal;
    toolUseID: string;
  }
) => Promise<PermissionResult>;

interface PermissionResult {
  behavior: 'allow' | 'deny';
  message?: string;       // deny时的原因
  updatedInput?: any;     // 仅AskUserQuestion支持
  interrupt?: boolean;    // 是否中断会话
  toolUseID: string;      // 回传工具ID
}
```

### 2.3 权限模式定义

| 模式 | Emoji | 说明 | 自动批准工具 |
|------|-------|------|--------------|
| `default` | 🟢 | 标准权限模式 | 非危险工具 |
| `acceptEdits` | 🟡 | 自动接受编辑 | Write, Edit, 文件系统命令 |
| `bypassPermissions` | 🔴 | 绕过所有权限 | 所有工具 |
| `plan` | 🔵 | 计划模式 | 仅只读工具 |

**默认模式**: `acceptEdits`

---

## 3. 数据流设计

### 3.1 权限切换流程

```
用户按 Shift+Tab
    ↓
InteractiveUI.setupKeyListener()
    检测到键序列 \x1b[Z
    ↓
InteractiveUI.cyclePermissionMode()
    - 更新 currentPermissionMode
    - 更新提示符 emoji
    - 显示切换通知
    ↓
调用 onPermissionModeChange(newMode) 回调
    ↓
Application.onPermissionModeChange()
    调用 streamingQueryManager.setPermissionMode(newMode)
    ↓
StreamingQueryManager.setPermissionMode()
    1. messageRouter.setPermissionMode(newMode)  // 本地同步
    2. queryInstance.setPermissionMode(newMode)  // SDK异步切换
    ↓
SDK在当前工具执行完成后应用新模式
```

**关键点**:
- UI立即更新显示 (emoji变化)
- SDK异步切换 (当前工具执行完成后生效)
- 本地状态同步 (下次会话继续使用新模式)

### 3.2 canUseTool 回调流程

```
Claude调用工具
    ↓
SDK检查权限规则 (deny/allow/ask)
    ↓
未命中规则时,触发 canUseTool(toolName, input, options)
    ↓
MessageRouter.createPermissionHandler()
    - 检查 signal.aborted → deny + interrupt
    - 构建 ToolUseParams
    - 调用 PermissionManager.createCanUseToolHandler()
    ↓
PermissionManager 权限检查:
    1. 检查黑名单 → deny
    2. 检查白名单 → allow
    3. 检查危险模式 → allow
    4. 检查Bash命令过滤 → deny/allow
    5. 根据权限模式处理
    ↓
需要用户确认时:

    情况1: toolName === 'AskUserQuestion'
        ↓
    PermissionManager.handleAskUserQuestion()
        - 调用 permissionUI.promptUserQuestions()
        - QuestionMenu显示交互式菜单
        - 用户选择答案
        - 返回 PermissionResult {
            behavior: 'allow',
            updatedInput: {
              questions: input.questions,
              answers: {"问题": "答案"}
            }
          }

    情况2: 普通工具
        ↓
    PermissionManager.promptUserForTool()
        - 调用 permissionUI.promptToolPermission()
        - PermissionPanel显示权限面板
        - 用户批准/拒绝
        - 返回 PermissionResult {
            behavior: approved ? 'allow' : 'deny',
            message: reason
          }
    ↓
SDK收到PermissionResult
    - allow → 执行工具
    - deny → 向Claude反馈拒绝信息
```

### 3.3 AskUserQuestion 完整流程

```
Claude需要用户输入
    ↓
调用 AskUserQuestion 工具
    input: {
      questions: [
        {
          question: "Which database?",
          header: "Database",
          options: [{label: "PostgreSQL", description: "..."}],
          multiSelect: false
        }
      ]
    }
    ↓
触发 canUseTool('AskUserQuestion', input, options)
    ↓
PermissionManager.handleAskUserQuestion()
    遍历 input.questions
    对每个问题调用 permissionUI.promptUserQuestions()
    ↓
QuestionMenu.show()
    - 渲染菜单
    - 监听键盘事件 (↑↓ Space Enter Esc)
    - 返回用户选择的标签
    ↓
构建 answers 对象:
    {
      "Which database?": "PostgreSQL"
    }
    ↓
返回 PermissionResult {
  behavior: 'allow',
  updatedInput: {
    questions: input.questions,
    answers: answers
  },
  toolUseID: options.toolUseID
}
    ↓
SDK用 updatedInput 替换原始 input
    ↓
AskUserQuestion工具从 input.answers 读取答案
    ↓
Claude收到用户答案,继续对话
```

---

## 4. UI设计

### 4.1 持久权限显示 (输入提示符)

**当前**: `> ` (cyan)

**新设计**: `> 🟡` (包含权限emoji)

**实现**:

```typescript
// src/ui/InteractiveUI.ts

private getPermissionEmoji(): string {
  const emojiMap: Record<PermissionMode, string> = {
    default: '🟢',
    acceptEdits: '🟡',
    bypassPermissions: '🔴',
    plan: '🔵'
  };
  return emojiMap[this.currentPermissionMode];
}

private prompt(): Promise<string | null> {
  const emoji = this.getPermissionEmoji();
  const promptStr = this.colorize(`> ${emoji} `, 'cyan');
  // ... 其余逻辑
}
```

**视觉效果**:
```
> 🟢 Help me fix this bug
> 🟡 Create a new component
> 🔴 Run npm install
```

### 4.2 权限面板 (底部 1/3 区域)

**布局**: 终端底部占用约 10 行高度

**显示内容**:
- 分隔线
- 工具名称
- 工具参数 (长参数截断)
- 批准/拒绝选项

**视觉效果**:
```
[主对话区域 - 占据上方 2/3 屏幕]
> 🟡 Help me refactor this function

──────────────────────────────────────────────────
🔐 Permission Request
Tool: Bash
Parameters:
  command: npm install lodash --save

[y] Approve  [n] Deny  [Esc] Cancel
```

**实现要点**:
- 使用 ANSI 控制码实现分屏
- 保存/恢复光标位置
- 绝对定位到底部区域
- 面板显示后等待用户输入
- 用户选择后清除面板

**ANSI 控制码**:
- 保存光标: `\x1b[s`
- 恢复光标: `\x1b[u`
- 移动到坐标: `\x1b[{row};{col}H`
- 清除行: `\x1b[2K`

### 4.3 交互式菜单 (AskUserQuestion)

**单选模式**:
```
📋 Database Choice
Which database should we use?

  ▶ PostgreSQL
      Relational, ACID compliant
    MongoDB
      Document-based, flexible schema

↑↓: Navigate  Enter: Select  Esc: Cancel
```

**多选模式**:
```
📋 Features
Which features should we enable?

  [✓] Authentication
      User login and sessions
  [ ] Logging
      Request and error logging
  [✓] Caching
      Redis-based response caching

↑↓: Navigate  Space: Toggle  Enter: Confirm  Esc: Cancel
```

**交互逻辑**:
- `↑` (上箭头): 移动选择到上一项
- `↓` (下箭头): 移动选择到下一项
- `Space`: 多选模式下切换选项
- `Enter`: 确认选择
- `Esc`: 取消

**键盘事件**:
- 上箭头: `\x1b[A`
- 下箭头: `\x1b[B`
- 空格: ` ` (0x20)
- Enter: `\r` (0x0D) 或 `\n` (0x0A)
- Esc: `\x1b` (0x1B)

**渲染策略**:
1. 初始渲染菜单
2. 监听键盘事件
3. 选择变化时清除旧菜单并重新渲染
4. 确认后清除菜单并返回答案

---

## 5. 关键文件修改清单

### 5.1 核心权限层

#### `src/permissions/PermissionManager.ts` (重构)

**主要修改**:

1. **修改 `createCanUseToolHandler()` 返回类型**:
   ```typescript
   // 旧:
   createCanUseToolHandler(): CanUseTool  // 返回 boolean

   // 新:
   createCanUseToolHandler(): SDKCanUseTool  // 返回 PermissionResult
   ```

2. **修改 `checkPermissionByMode()` 返回类型**:
   ```typescript
   // 旧:
   private async checkPermissionByMode(toolName: string): Promise<boolean>

   // 新:
   private async checkPermissionByMode(
     toolName: string,
     input: any,
     toolUseID: string
   ): Promise<PermissionResult>
   ```

3. **新增 `handleAskUserQuestion()` 方法**:
   ```typescript
   private async handleAskUserQuestion(
     input: AskUserQuestionInput,
     options: { toolUseID: string; signal: AbortSignal }
   ): Promise<PermissionResult>
   ```

4. **新增 `PermissionUI` 依赖**:
   ```typescript
   constructor(
     config: PermissionConfig,
     permissionUI: PermissionUI  // 新增依赖注入
   ) {
     this.config = config;
     this.permissionUI = permissionUI;
   }
   ```

5. **删除权限历史相关代码**:
   - 删除 `PermissionRecord` 接口
   - 删除 `permissionHistory: PermissionRecord[]` 字段
   - 删除 `maxHistorySize` 常量
   - 删除 `recordPermission()` 方法
   - 删除 `getPermissionHistory()` 方法
   - 删除 `clearPermissionHistory()` 方法

6. **删除旧回调机制**:
   - 删除 `PromptUserCallback` 类型
   - 删除 `promptUserCallback` 字段
   - 删除 `setPromptUserCallback()` 方法

**新增类型定义**:
```typescript
// 移动到 src/permissions/types.ts
export interface PermissionResult {
  behavior: 'allow' | 'deny';
  message?: string;
  updatedInput?: any;
  interrupt?: boolean;
  toolUseID: string;
}

export type SDKCanUseTool = (
  toolName: string,
  input: any,
  options: { signal: AbortSignal; toolUseID: string }
) => Promise<PermissionResult>;
```

#### `src/permissions/PermissionUI.ts` (新增)

**文件职责**: 定义权限UI接口和实现类

**主要内容**:
1. `PermissionUI` 接口定义
2. `PermissionPanel` 类 (底部面板)
3. `QuestionMenu` 类 (交互式菜单)
4. ANSI控制码辅助函数

**关键类**:

```typescript
export class PermissionPanel {
  async show(request: ToolPermissionRequest): Promise<PermissionUIResult>;
  private drawSeparator(): void;
  private drawPanelContent(request: ToolPermissionRequest): void;
  private waitForUserInput(): Promise<boolean>;
  private clear(): void;
}

export class QuestionMenu {
  async show(question: QuestionInput): Promise<string>;
  private render(question: QuestionInput): void;
  private waitForSelection(question: QuestionInput): Promise<string[]>;
  private clearAndRender(question: QuestionInput): void;
  private calculateLineCount(question: QuestionInput): number;
  private clear(question: QuestionInput): void;
}
```

### 5.2 SDK 集成层

#### `src/core/MessageRouter.ts` (修改)

**主要修改**:

1. **修改 `createPermissionHandler()` 适配新格式**:
   ```typescript
   // 旧: baseHandler 返回 boolean
   const allowed = await baseHandler(enrichedParams);

   // 新: baseHandler 直接返回 PermissionResult
   const result = await baseHandler(toolName, input, options);
   return result;
   ```

2. **新增 `setPermissionMode()` 方法**:
   ```typescript
   async setPermissionMode(mode: PermissionMode): Promise<void> {
     if (this.queryInstance) {
       await this.queryInstance.setPermissionMode(mode);
     }
     this.permissionManager.setMode(mode);
   }
   ```

3. **存储 query 实例引用**:
   ```typescript
   private queryInstance: ReturnType<typeof query> | null = null;

   setQueryInstance(instance: ReturnType<typeof query>): void {
     this.queryInstance = instance;
   }
   ```

#### `src/sdk/StreamingQueryManager.ts` (修改)

**主要修改**:

1. **新增 `setPermissionMode()` 方法**:
   ```typescript
   async setPermissionMode(mode: PermissionMode): Promise<void> {
     // 1. 本地同步更新
     this.messageRouter.setPermissionMode(mode);

     // 2. SDK异步切换
     if (this.queryInstance) {
       await this.queryInstance.setPermissionMode(mode);
     }
   }
   ```

2. **在 `startExecution()` 中保存 query 实例**:
   ```typescript
   private async startExecution(): Promise<void> {
     const queryGenerator = query({...});
     this.queryInstance = queryGenerator;

     // 传递实例给 MessageRouter
     this.messageRouter.setQueryInstance(queryGenerator);

     // 继续处理...
   }
   ```

### 5.3 UI 层

#### `src/ui/InteractiveUI.ts` (修改)

**主要修改**:

1. **修改 `prompt()` 添加权限 emoji**:
   ```typescript
   private prompt(): Promise<string | null> {
     const emoji = this.getPermissionEmoji();
     const promptStr = this.colorize(`> ${emoji} `, 'cyan');
     // ... 其余逻辑保持
   }
   ```

2. **新增 `getPermissionEmoji()` 方法**:
   ```typescript
   private getPermissionEmoji(): string {
     const emojiMap: Record<PermissionMode, string> = {
       default: '🟢',
       acceptEdits: '🟡',
       bypassPermissions: '🔴',
       plan: '🔵'
     };
     return emojiMap[this.currentPermissionMode];
   }
   ```

3. **保持 `setupKeyListener()` 逻辑不变**:
   - Shift+Tab 检测逻辑保持
   - 触发 `cyclePermissionMode()`

4. **修改权限切换提示**:
   ```typescript
   private cyclePermissionMode(): void {
     // 切换模式
     const modes: PermissionMode[] = ['default', 'acceptEdits', 'bypassPermissions', 'plan'];
     const currentIndex = modes.indexOf(this.currentPermissionMode);
     const nextIndex = (currentIndex + 1) % modes.length;
     this.currentPermissionMode = modes[nextIndex];

     // 显示通知 (3秒后消失)
     const emoji = this.getPermissionEmoji();
     const label = PermissionModeLabels[this.currentPermissionMode];
     console.log(this.colorize(`\nℹ️ Switched to: ${emoji} ${label}`, 'cyan'));

     // 触发回调
     if (this.onPermissionModeChange) {
       this.onPermissionModeChange(this.currentPermissionMode);
     }
   }
   ```

#### `src/ui/PermissionUIImpl.ts` (新增)

**文件职责**: 实现 `PermissionUI` 接口,桥接 InteractiveUI

**主要内容**:
```typescript
export class PermissionUIImpl implements PermissionUI {
  private panel: PermissionPanel;
  private menu: QuestionMenu;

  constructor() {
    this.panel = new PermissionPanel();
    this.menu = new QuestionMenu();
  }

  async promptToolPermission(
    request: ToolPermissionRequest
  ): Promise<PermissionUIResult> {
    return this.panel.show(request);
  }

  async promptUserQuestions(
    questions: QuestionInput[]
  ): Promise<QuestionAnswers> {
    const answers: QuestionAnswers = {};

    for (const q of questions) {
      const answer = await this.menu.show(q);
      answers[q.question] = answer;
    }

    return answers;
  }
}
```

### 5.4 应用程序层

#### `src/main.ts` (修改)

**主要修改**:

1. **创建 PermissionUI 实例并注入**:
   ```typescript
   private async initialize(): Promise<void> {
     // ... 现有初始化逻辑

     // 创建权限UI
     const permissionUI = new PermissionUIImpl();

     // 创建权限管理器(注入UI)
     this.permissionManager = new PermissionManager(
       permissionConfig,
       permissionUI  // 注入依赖
     );

     // ... 其余逻辑
   }
   ```

2. **修改权限模式变更回调**:
   ```typescript
   private async runInteractive(): Promise<void> {
     this.ui = new InteractiveUI({
       // ... 其他配置
       onPermissionModeChange: async (mode: PermissionMode) => {
         // 动态切换权限
         await this.streamingQueryManager.setPermissionMode(mode);
       }
     });

     // ... 其余逻辑
   }
   ```

3. **删除旧回调设置**:
   ```typescript
   // 删除这行:
   this.permissionManager.setPromptUserCallback(...);
   ```

4. **修改默认权限模式**:
   ```typescript
   // src/config/ConfigBuilder.ts

   static buildPermissionConfig(
     options: CLIOptions,
     config: AppConfig
   ): PermissionConfig {
     return {
       mode: options.permissionMode || config.permissionMode || 'acceptEdits',  // 默认改为 acceptEdits
       // ... 其余配置
     };
   }
   ```

---

## 6. 技术难点和解决方案

### 6.1 终端分屏显示

**难点**: 在不阻塞主对话的情况下显示独立面板

**解决方案**:
1. 使用 ANSI 控制码精确控制光标位置
2. 保存/恢复光标: `\x1b[s` 和 `\x1b[u`
3. 绝对定位: `\x1b[{row};{col}H`
4. 动态计算面板区域 (基于 `process.stdout.rows`)

**实现示例**:
```typescript
async show(request: ToolPermissionRequest): Promise<boolean> {
  const terminalHeight = process.stdout.rows || 24;
  const mainAreaHeight = terminalHeight - this.panelHeight;

  // 保存光标
  process.stdout.write('\x1b[s');

  // 移动到面板起始位置
  process.stdout.write(`\x1b[${mainAreaHeight};0H`);

  // 绘制面板
  this.drawPanelContent(request);

  // 等待用户输入
  const approved = await this.waitForUserInput();

  // 清除面板
  this.clear();

  // 恢复光标
  process.stdout.write('\x1b[u');

  return approved;
}
```

### 6.2 交互式菜单键盘事件

**难点**: 在原始模式下正确解析方向键和特殊键

**ANSI 键序列映射**:
- 上箭头: `\x1b[A`
- 下箭头: `\x1b[B`
- 空格: ` ` (0x20)
- Enter: `\r` (0x0D) 或 `\n` (0x0A)
- Esc: `\x1b` (0x1B)

**解决方案**:
```typescript
private async waitForSelection(question: QuestionInput): Promise<string[]> {
  return new Promise((resolve) => {
    const handleKey = (data: Buffer) => {
      const key = data.toString();

      if (key === '\x1b[A' && this.selectedIndex > 0) {
        // 上箭头
        this.selectedIndex--;
        this.clearAndRender(question);
      } else if (key === '\x1b[B' && this.selectedIndex < options.length - 1) {
        // 下箭头
        this.selectedIndex++;
        this.clearAndRender(question);
      } else if (key === ' ' && multiSelect) {
        // 空格切换
        this.toggleSelection(this.selectedIndex);
        this.clearAndRender(question);
      } else if (key === '\r' || key === '\n') {
        // Enter确认
        process.stdin.removeListener('data', handleKey);
        resolve(this.getSelectedLabels());
      }
    };

    process.stdin.on('data', handleKey);
  });
}
```

### 6.3 动态权限切换时机

**难点**: SDK 的 `setPermissionMode()` 是异步的,需要正确处理时机

**切换流程**:
1. 用户按 Shift+Tab → UI 立即更新 emoji
2. 调用 `queryInstance.setPermissionMode()` → 异步切换
3. SDK 在当前工具执行完成后应用新模式
4. 本地 `PermissionManager` 同步更新 (用于下次会话)

**状态同步策略**:
```typescript
class StreamingQueryManager {
  private pendingModeChange: PermissionMode | null = null;

  async setPermissionMode(mode: PermissionMode): Promise<void> {
    // 1. 立即更新本地状态 (UI显示)
    this.messageRouter.setPermissionMode(mode);

    // 2. 标记待切换模式
    this.pendingModeChange = mode;

    // 3. SDK异步切换
    if (this.queryInstance) {
      await this.queryInstance.setPermissionMode(mode);
      this.pendingModeChange = null;
    }
  }

  private async startExecution(): Promise<void> {
    const q = query({...});
    this.queryInstance = q;

    // 4. 应用待切换模式
    if (this.pendingModeChange) {
      await q.setPermissionMode(this.pendingModeChange);
      this.pendingModeChange = null;
    }

    // 继续处理...
  }
}
```

**用户提示优化**:
```typescript
private cyclePermissionMode(): void {
  // 切换模式
  this.currentPermissionMode = newMode;

  // 显示通知
  const emoji = this.getPermissionEmoji();
  console.log(`\nℹ️ Switched to: ${emoji} ${label}`);

  // 如果有工具在执行,额外提示
  if (this.isToolExecuting) {
    console.log(this.colorize('(Will take effect after current tool completes)', 'gray'));
  }

  // 触发回调
  this.onPermissionModeChange(newMode);
}
```

### 6.4 AskUserQuestion 参数修改限制

**难点**: 确保只有 AskUserQuestion 能修改参数

**类型检查实现**:
```typescript
async createCanUseToolHandler(): SDKCanUseTool {
  return async (toolName, input, options): Promise<PermissionResult> => {
    // 特殊处理 AskUserQuestion
    if (toolName === 'AskUserQuestion') {
      return this.handleAskUserQuestion(input, options);
    }

    // 其他工具不支持参数修改
    const allowed = await this.checkPermission(toolName, input);
    return {
      behavior: allowed ? 'allow' : 'deny',
      toolUseID: options.toolUseID,
      // 注意: 不设置 updatedInput
    };
  };
}

private async handleAskUserQuestion(
  input: AskUserQuestionInput,
  options: { toolUseID: string }
): Promise<PermissionResult> {
  const answers = await this.promptUserQuestions(input.questions);

  return {
    behavior: 'allow',
    updatedInput: {
      questions: input.questions,  // 原封不动传回
      answers: answers              // 新增答案字段
    },
    toolUseID: options.toolUseID
  };
}
```

---

## 7. 验证方案

### 7.1 功能验证

**验证项 1: 默认权限模式**
- 启动应用,检查提示符显示 `> 🟡`
- 配置文件未指定时,默认使用 `acceptEdits` 模式

**验证项 2: 权限切换**
- 按 Shift+Tab,观察 emoji 循环变化: 🟢 → 🟡 → 🔴 → 🔵
- 显示切换通知: "ℹ️ Switched to: 🟡 Accept Edits"
- 提示符持久显示新 emoji

**验证项 3: canUseTool 回调**
- 触发需要权限的工具 (如 Bash)
- 底部显示权限面板
- 按 y 批准,工具执行
- 按 n 拒绝,Claude 收到拒绝信息并继续对话

**验证项 4: AskUserQuestion**
- 让 Claude 提出选择问题
- 显示交互式菜单
- 使用方向键选择,Enter 确认
- 多选模式下 Space 切换选项
- 答案正确传递给 Claude

**验证项 5: 动态切换**
- 在流式会话中按 Shift+Tab 切换权限
- 当前工具执行完成后,新权限生效
- 下一个工具调用使用新权限模式

### 7.2 单元测试

**测试文件**: `tests/permissions/PermissionManager.test.ts`

**测试用例**:
1. `createCanUseToolHandler()` 返回正确的 `PermissionResult`
2. 黑名单工具始终返回 `deny`
3. 白名单工具始终返回 `allow`
4. `acceptEdits` 模式自动批准 Write/Edit
5. `bypassPermissions` 模式批准所有工具
6. `handleAskUserQuestion()` 正确构建 `updatedInput`

**测试示例**:
```typescript
describe('PermissionManager', () => {
  it('should return PermissionResult with behavior allow', async () => {
    const manager = new PermissionManager(config, mockUI);
    const handler = manager.createCanUseToolHandler();

    const result = await handler('Read', {}, { toolUseID: '123', signal: new AbortController().signal });

    expect(result.behavior).toBe('allow');
    expect(result.toolUseID).toBe('123');
  });

  it('should handle AskUserQuestion with updatedInput', async () => {
    const mockUI = {
      promptUserQuestions: jest.fn().resolves({ 'Question?': 'Answer' })
    };

    const manager = new PermissionManager(config, mockUI);
    const handler = manager.createCanUseToolHandler();

    const result = await handler(
      'AskUserQuestion',
      { questions: [{ question: 'Question?', options: [...] }] },
      { toolUseID: '123', signal: new AbortController().signal }
    );

    expect(result.behavior).toBe('allow');
    expect(result.updatedInput.answers).toEqual({ 'Question?': 'Answer' });
  });
});
```

### 7.3 集成测试

**测试场景 1: 完整权限流程**
```typescript
// tests/integration/permission-flow.test.ts

it('should handle complete permission flow', async () => {
  const app = new Application();
  await app.initialize();

  // 模拟用户输入
  const input = 'Run npm install';

  // 模拟权限批准
  mockUI.promptToolPermission.mockResolvedValue({ approved: true });

  // 执行
  await app.processMessage(input);

  // 验证权限请求
  expect(mockUI.promptToolPermission).toHaveBeenCalledWith({
    toolName: 'Bash',
    input: { command: 'npm install' },
    // ...
  });
});
```

**测试场景 2: AskUserQuestion 流程**
```typescript
it('should handle AskUserQuestion flow', async () => {
  mockUI.promptUserQuestions.mockResolvedValue({
    'Which database?': 'PostgreSQL'
  });

  // 触发 AskUserQuestion
  const result = await permissionHandler(
    'AskUserQuestion',
    { questions: [...] },
    { toolUseID: '123', signal }
  );

  expect(result.updatedInput.answers).toEqual({
    'Which database?': 'PostgreSQL'
  });
});
```

---

## 8. 待删除代码清单

### 8.1 权限历史功能

**文件**: `src/permissions/PermissionManager.ts`

**删除内容**:
- `PermissionRecord` 接口 (第 79-88 行)
- `permissionHistory: PermissionRecord[]` 字段
- `maxHistorySize` 常量
- `recordPermission()` 方法
- `getPermissionHistory()` 方法
- `clearPermissionHistory()` 方法
- 所有调用 `recordPermission()` 的代码

### 8.2 旧回调机制

**文件**: `src/permissions/PermissionManager.ts`

**删除内容**:
- `PromptUserCallback` 类型定义
- `promptUserCallback: PromptUserCallback` 字段
- `setPromptUserCallback()` 方法

**文件**: `src/main.ts`

**删除内容**:
- `this.permissionManager.setPromptUserCallback(...)` 调用

### 8.3 简化权限提示

**文件**: `src/permissions/PermissionManager.ts`

**删除内容**:
- `formatPermissionRequest()` 方法 (如果存在)
- `promptUser()` 方法 (改为委托给 `PermissionUI`)

---

## 9. 实施步骤建议

### 阶段 1: 类型和接口定义 (1-2小时)
1. 创建 `src/permissions/types.ts` - 定义 `PermissionResult`, `SDKCanUseTool` 等类型
2. 创建 `src/permissions/PermissionUI.ts` - 定义 `PermissionUI` 接口

### 阶段 2: UI 层实现 (3-4小时)
1. 实现 `PermissionPanel` 类 (底部面板)
2. 实现 `QuestionMenu` 类 (交互式菜单)
3. 创建 `PermissionUIImpl` 适配器
4. 修改 `InteractiveUI.prompt()` 添加 emoji

### 阶段 3: 权限层重构 (2-3小时)
1. 修改 `PermissionManager.createCanUseToolHandler()` 返回类型
2. 实现 `handleAskUserQuestion()` 方法
3. 修改 `checkPermissionByMode()` 返回 `PermissionResult`
4. 删除权限历史和旧回调相关代码

### 阶段 4: SDK 集成层 (2-3小时)
1. 修改 `MessageRouter.createPermissionHandler()` 适配新格式
2. 添加 `MessageRouter.setPermissionMode()` 方法
3. 修改 `StreamingQueryManager` 添加动态权限切换
4. 存储 query 实例引用

### 阶段 5: 应用层集成 (1-2小时)
1. 修改 `main.ts` 创建 `PermissionUI` 实例
2. 注入依赖到 `PermissionManager`
3. 更新权限模式变更回调
4. 修改默认权限模式为 `acceptEdits`

### 阶段 6: 测试和验证 (2-3小时)
1. 编写单元测试
2. 编写集成测试
3. 手动功能验证
4. 修复发现的问题

**总计**: 约 11-17 小时

---

## 10. 风险和注意事项

### 10.1 兼容性风险

**风险**: 终端不支持 ANSI 控制码

**缓解措施**:
- 检测终端能力 (`process.stdout.isTTY`)
- 降级为序列显示 (无分屏)
- 提供配置选项禁用高级 UI

### 10.2 键盘事件冲突

**风险**: Shift+Tab 可能被终端或 IDE 捕获

**缓解措施**:
- 提供替代快捷键 (如 Ctrl+P)
- 支持命令行切换权限 (`:mode acceptEdits`)
- 文档说明终端配置

### 10.3 SDK 版本兼容性

**风险**: SDK 接口变更导致不兼容

**缓解措施**:
- 锁定 SDK 版本 (package.json)
- 单元测试覆盖 SDK 集成点
- 监控 SDK 更新日志

### 10.4 状态同步问题

**风险**: 权限切换后状态不一致

**缓解措施**:
- 集中状态管理 (单一真实来源)
- 异步切换完成后验证状态
- 记录切换日志便于调试

---

## 11. 后续优化方向

### 11.1 权限预设 (可选)

允许用户保存常用权限配置:
```json
{
  "permissionPresets": {
    "safe": { "mode": "default", "disallowedTools": ["Bash"] },
    "dev": { "mode": "acceptEdits", "allowedCommands": ["npm", "git"] },
    "auto": { "mode": "bypassPermissions" }
  }
}
```

### 11.2 权限审计日志 (可选)

记录权限决策到审计日志:
```typescript
{
  "timestamp": "2026-01-11T10:30:00Z",
  "tool": "Bash",
  "input": { "command": "rm -rf node_modules" },
  "decision": "denied",
  "reason": "Dangerous command detected"
}
```

### 11.3 批量权限确认 (可选)

允许一次性批准多个工具调用:
```
🔐 Multiple Permission Requests (3)

1. Bash: npm install
2. Write: package.json
3. Edit: src/main.ts

[a] Approve All  [d] Deny All  [r] Review Each
```

### 11.4 智能权限建议 (可选)

基于历史决策学习,自动建议权限模式:
```
ℹ️ Suggestion: Switch to 'Accept Edits' mode?
   You've approved 5 consecutive Write/Edit operations.
   [y] Yes  [n] No  [x] Don't ask again
```

---

## 12. 总结

本设计文档详细规划了权限系统的重构方案,核心目标包括:

1. ✅ 符合 Claude Agent SDK 官方规范
2. ✅ 清晰的 UI 层和权限层分离
3. ✅ 持久权限状态显示 (emoji 提示符)
4. ✅ 独立权限面板和交互式菜单
5. ✅ 完整的 AskUserQuestion 支持
6. ✅ 动态权限切换能力
7. ✅ 简化设计,移除冗余功能

**关键设计原则**:
- **SDK 优先**: 严格遵循官方接口
- **分层清晰**: UI 层完全独立
- **用户友好**: 直观的视觉反馈
- **可扩展**: 易于添加新功能

**实施路径**:
1. 定义接口 → 2. 实现 UI → 3. 重构权限层 → 4. 集成 SDK → 5. 应用层整合 → 6. 测试验证

**预期成果**:
- 更符合 SDK 规范的权限系统
- 更友好的用户交互体验
- 更清晰的代码架构
- 更易于维护和扩展
