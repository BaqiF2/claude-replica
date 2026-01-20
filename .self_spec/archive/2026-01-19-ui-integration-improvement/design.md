# UI层开发者友好化改进计划

## 目标

让开发者更容易集成自己的UI层到Claude Replica项目中,通过以下方式实现:
1. 创建开发者指南文档,清晰说明如何实现自定义UI
2. 重组接口文件结构,将契约接口集中到独立文件夹
3. 优化接口设计,标记可选方法并提供最小化基类实现
4. 提供快速开始示例和分级实现指南

## 背景分析

### 现有UI层架构

当前项目已有完整的UI层抽象,采用工厂模式实现UI可插拔性:

```
src/ui/
├── 接口定义 (散落在根目录)
│   ├── ParserInterface.ts          (3个方法)
│   ├── OutputInterface.ts          (6个方法)
│   ├── InteractiveUIInterface.ts   (25个方法)
│   └── OptionsInterface.ts
├── 实现
│   ├── TerminalParser.ts
│   ├── TerminalOutput.ts
│   └── TerminalInteractiveUI.ts    (1640行复杂实现)
└── 工厂
    ├── UIFactory.ts                (4个工厂方法)
    ├── UIFactoryRegistry.ts        (注册表)
    └── TerminalUIFactory.ts
```

**核心接口**:
- `UIFactory`: 工厂接口,定义4个工厂方法(createParser/createOutput/createPermissionUI/createInteractiveUI)
- `ParserInterface`: CLI参数解析(parse/getHelpText/getVersionText)
- `OutputInterface`: 标准输出(info/warn/error/success/section/blankLine)
- `InteractiveUIInterface`: 交互UI契约,包含25个方法:
  - 生命周期: start/stop (必须)
  - 消息显示: displayMessage/displayToolUse/displayToolResult/displayThinking等 (核心)
  - 交互菜单: promptConfirmation/showRewindMenu/showSessionMenu/showConfirmationMenu (可选)
  - 状态管理: setPermissionMode/displayPermissionStatus/setProcessingState (可选)
  - 格式化: formatRelativeTime/formatAbsoluteTime/formatStatsSummary (可选)
  - 特殊功能: displayTodoList (可选)
- `PermissionUI`: 权限交互(promptToolPermission/promptUserQuestions)

**现有注册机制**:
- `UIFactoryRegistry.registerUIFactory(type, factory)` 注册自定义工厂
- `CLAUDE_UI_TYPE` 环境变量选择UI类型(默认'terminal')
- 单例模式缓存UIFactory实例

### 存在的问题

1. **接口文件组织**: 接口定义散落在`src/ui/`根目录,缺乏统一的contracts文件夹,不易发现
2. **接口可选性不明确**: InteractiveUIInterface包含25个方法,但没有明确标记哪些是必须实现,哪些是可选
3. **缺少开发者指南**: 没有文档说明如何实现自定义UI,开发者需要通读代码
4. **缺少简化基类**: 虽然有MockInteractiveUI测试辅助类,但没有提供给开发者使用的最小化基类
5. **实现复杂度高**: TerminalInteractiveUI有1640行代码,大量终端特定逻辑(ANSI颜色、readline),对新实现者缺乏参考价值

## 实现方案

根据你的选择,采用以下策略:
- **接口设计**: 保持单一接口不变,为非核心方法增加可选标记和文档说明
- **文件重组**: 直接将接口文件移动到`src/ui/contracts/`文件夹,更新导入路径
- **基类实现**: 提供最小化默认实现,仅为非核心方法提供空实现或抛出"未实现"异常
- **文档范围**: 包含快速开始(5分钟最小UI)和实现级别指南(Level 1/2/3)

### 阶段1: 文件结构重组

#### 1.1 创建contracts目录结构

```
src/ui/contracts/
├── core/
│   ├── UIFactory.ts           (从 src/ui/factories/UIFactory.ts 移动)
│   ├── ParserInterface.ts     (从 src/ui/ParserInterface.ts 移动)
│   ├── OutputInterface.ts     (从 src/ui/OutputInterface.ts 移动)
│   └── OptionsInterface.ts    (从 src/ui/OptionsInterface.ts 移动)
├── interactive/
│   └── InteractiveUIInterface.ts (从 src/ui/InteractiveUIInterface.ts 移动)
├── permission/
│   └── PermissionUI.ts        (从 src/permissions/PermissionUI.ts 移动或重新导出)
└── index.ts                   (统一导出所有接口)
```

#### 1.2 更新导入路径

需要更新的文件:
- `src/ui/factories/TerminalUIFactory.ts`
- `src/ui/factories/UIFactoryRegistry.ts`
- `src/ui/implementations/TerminalParser.ts`
- `src/ui/implementations/TerminalOutput.ts`
- `src/ui/implementations/TerminalInteractiveUI.ts`
- `src/ui/PermissionUIImpl.ts`
- `src/runners/InteractiveRunner.ts`
- `src/main.ts`
- `tests/test-helpers/MockInteractiveUI.ts`
- 其他引用文件

#### 1.3 向后兼容导出

在`src/ui/index.ts`中保持旧路径导出:

```typescript
// 向后兼容: 重新导出contracts中的接口
export * from './contracts';
export * from './contracts/core/ParserInterface';
export * from './contracts/core/OutputInterface';
export * from './contracts/core/OptionsInterface';
export * from './contracts/interactive/InteractiveUIInterface';

// 实现类导出
export * from './TerminalInteractiveUI';
export * from './PermissionUIImpl';
```

### 阶段2: 接口优化

#### 2.1 InteractiveUIInterface方法分级

为接口方法添加详细的TSDoc注释,明确标记每个方法的重要性级别:

```typescript
export interface InteractiveUIInterface {
  /**
   * Start the UI loop.
   *
   * @level REQUIRED - Must be implemented by all UI implementations
   */
  start(): Promise<void>;

  /**
   * Stop the UI loop.
   *
   * @level REQUIRED - Must be implemented by all UI implementations
   */
  stop(): void;

  /**
   * Display a message from assistant or user.
   *
   * @level CORE - Should be implemented for basic functionality
   * @param message Message content
   * @param role Message role (user/assistant/system)
   */
  displayMessage(message: string, role: MessageRole): void;

  /**
   * Display a tool invocation.
   *
   * @level CORE - Should be implemented for basic functionality
   * @param tool Tool name
   * @param args Tool arguments
   */
  displayToolUse(tool: string, args: Record<string, unknown>): void;

  // ... 其他核心方法 (CORE级别)

  /**
   * Show rewind menu for snapshot selection.
   *
   * @level OPTIONAL - Can return null if not implemented
   * @param snapshots Available snapshots
   * @returns Selected snapshot or null
   */
  showRewindMenu(snapshots: Snapshot[]): Promise<Snapshot | null>;

  /**
   * Show session selection menu.
   *
   * @level OPTIONAL - Can return null if not implemented
   * @param sessions Available sessions
   * @returns Selected session or null
   */
  showSessionMenu(sessions: Session[]): Promise<Session | null>;

  // ... 其他可选方法 (OPTIONAL级别)

  /**
   * Format relative time display.
   *
   * @level UTILITY - Can return simple string if not implemented
   * @param date Date to format
   * @returns Formatted string
   */
  formatRelativeTime(date: Date): string;

  // ... 其他工具方法 (UTILITY级别)
}
```

**方法分级**:
- **REQUIRED** (2个): start, stop - 必须实现
- **CORE** (10个): displayMessage, displayToolUse, displayToolResult, displayThinking, displayComputing, stopComputing, clearProgress, displayError, displayWarning, displaySuccess, displayInfo - 应该实现,提供基本功能
- **OPTIONAL** (10个): promptConfirmation, showRewindMenu, showSessionMenu, showConfirmationMenu, setInitialPermissionMode, setPermissionMode, displayPermissionStatus, setProcessingState, displayTodoList - 可选实现
- **UTILITY** (3个): formatRelativeTime, formatAbsoluteTime, formatStatsSummary - 工具方法,可返回简单默认值

#### 2.2 添加方法级别常量

在接口文件中导出方法级别信息,供开发者参考:

```typescript
/**
 * Method implementation levels
 */
export const InteractiveUIMethodLevels = {
  REQUIRED: ['start', 'stop'],
  CORE: [
    'displayMessage',
    'displayToolUse',
    'displayToolResult',
    'displayThinking',
    'displayComputing',
    'stopComputing',
    'clearProgress',
    'displayError',
    'displayWarning',
    'displaySuccess',
    'displayInfo',
  ],
  OPTIONAL: [
    'promptConfirmation',
    'showRewindMenu',
    'showSessionMenu',
    'showConfirmationMenu',
    'setInitialPermissionMode',
    'setPermissionMode',
    'displayPermissionStatus',
    'setProcessingState',
    'displayTodoList',
  ],
  UTILITY: ['formatRelativeTime', 'formatAbsoluteTime', 'formatStatsSummary'],
} as const;
```

### 阶段3: 最小化基类实现

#### 3.1 创建BaseInteractiveUI抽象类

```typescript
// src/ui/implementations/base/BaseInteractiveUI.ts

/**
 * Base implementation of InteractiveUIInterface with minimal defaults.
 *
 * Provides empty or basic implementations for all methods except start() and stop(),
 * which must be implemented by subclasses.
 *
 * Usage:
 * ```typescript
 * class MyUI extends BaseInteractiveUI {
 *   async start() { // Your implementation }
 *   stop() { // Your implementation }
 * }
 * ```
 */
export abstract class BaseInteractiveUI implements InteractiveUIInterface {
  protected callbacks: InteractiveUICallbacks;
  protected config: InteractiveUIConfig;

  constructor(callbacks: InteractiveUICallbacks, config?: InteractiveUIConfig) {
    this.callbacks = callbacks;
    this.config = config || {};
  }

  // REQUIRED - Must be implemented by subclasses
  abstract start(): Promise<void>;
  abstract stop(): void;

  // CORE - Basic console output implementations
  displayMessage(message: string, role: MessageRole): void {
    console.log(`[${role}] ${message}`);
  }

  displayToolUse(tool: string, args: Record<string, unknown>): void {
    console.log(`Tool: ${tool}`, args);
  }

  displayToolResult(tool: string, result: string, isError?: boolean): void {
    if (isError) {
      console.error(`Tool ${tool} error: ${result}`);
    } else {
      console.log(`Tool ${tool} result: ${result}`);
    }
  }

  displayThinking(_content?: string): void {
    // No-op by default
  }

  displayComputing(): void {
    // No-op by default
  }

  stopComputing(): void {
    // No-op by default
  }

  clearProgress(): void {
    // No-op by default
  }

  displayError(message: string): void {
    console.error(`Error: ${message}`);
  }

  displayWarning(message: string): void {
    console.warn(`Warning: ${message}`);
  }

  displaySuccess(message: string): void {
    console.log(`Success: ${message}`);
  }

  displayInfo(message: string): void {
    console.info(`Info: ${message}`);
  }

  // OPTIONAL - Default implementations returning null or false
  async promptConfirmation(_message: string): Promise<boolean> {
    return false;
  }

  async showRewindMenu(_snapshots: Snapshot[]): Promise<Snapshot | null> {
    return null;
  }

  async showSessionMenu(_sessions: Session[]): Promise<Session | null> {
    return null;
  }

  async showConfirmationMenu(
    _title: string,
    _options: Array<{ key: string; label: string; description?: string }>,
    _defaultKey?: string
  ): Promise<boolean> {
    return false;
  }

  setInitialPermissionMode(_mode: PermissionMode): void {
    // No-op by default
  }

  setPermissionMode(_mode: PermissionMode): void {
    // No-op by default
  }

  displayPermissionStatus(_mode: PermissionMode): void {
    // No-op by default
  }

  setProcessingState(_processing: boolean): void {
    // No-op by default
  }

  displayTodoList(todos: TodoItem[]): void {
    console.log('Tasks:', todos);
  }

  // UTILITY - Basic string implementations
  formatRelativeTime(date: Date): string {
    return date.toISOString();
  }

  formatAbsoluteTime(date: Date): string {
    return date.toLocaleString();
  }

  formatStatsSummary(stats?: SessionStats): string {
    if (!stats) return 'No stats available';
    return JSON.stringify(stats);
  }
}
```

#### 3.2 创建MinimalInteractiveUI示例

```typescript
// src/ui/implementations/base/MinimalInteractiveUI.ts

/**
 * Minimal InteractiveUI implementation example.
 *
 * Only implements the two required methods (start/stop).
 * All other methods use default implementations from BaseInteractiveUI.
 *
 * This is the simplest possible UI implementation, suitable for:
 * - Headless/CI environments
 * - Quick prototyping
 * - Testing
 */
export class MinimalInteractiveUI extends BaseInteractiveUI {
  private running = false;

  async start(): Promise<void> {
    this.running = true;
    console.log('Minimal UI started');

    // Example: Wait for user input in a simple loop
    // In real implementation, this would handle user interaction
    await this.waitForStop();
  }

  stop(): void {
    this.running = false;
    console.log('Minimal UI stopped');
  }

  private async waitForStop(): Promise<void> {
    // Simple implementation: just wait until stop() is called
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.running) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }
}
```

### 阶段4: 开发者指南文档

#### 4.1 文档文件结构

```
.self_spec/2026-01-19-ui-integration-improvement/
├── design.md                    (本文件)
└── CUSTOM_UI_GUIDE.md          (开发者指南,中文)

docs/
├── en/
│   └── CUSTOM_UI_GUIDE.md      (英文版,后续创建)
└── zh/
    └── CUSTOM_UI_GUIDE.md      (中文版链接到.self_spec/)
```

#### 4.2 CUSTOM_UI_GUIDE.md 大纲

```markdown
# 自定义UI实现指南

## 目录
1. 概述
2. 快速开始 - 5分钟实现最小UI
3. 核心概念
4. 实现级别指南
5. 接口详细参考
6. 注册自定义UI
7. 最佳实践
8. 常见问题

## 1. 概述

Claude Replica采用分层UI架构,支持多种UI实现。本指南帮助你实现自己的UI层。

## 2. 快速开始 - 5分钟实现最小UI

**步骤1**: 继承BaseInteractiveUI

```typescript
import { BaseInteractiveUI } from 'claude-replica/ui/implementations/base';

export class MySimpleUI extends BaseInteractiveUI {
  async start(): Promise<void> {
    console.log('My UI started');
    // TODO: 实现UI启动逻辑
  }

  stop(): void {
    console.log('My UI stopped');
    // TODO: 实现UI停止逻辑
  }
}
```

**步骤2**: 实现UIFactory

```typescript
import { UIFactory } from 'claude-replica/ui/contracts';
import { TerminalParser, TerminalOutput, PermissionUIImpl } from 'claude-replica/ui';

export class MyUIFactory implements UIFactory {
  createParser() { return new TerminalParser(); }
  createOutput() { return new TerminalOutput(); }
  createPermissionUI() { return new PermissionUIImpl(); }
  createInteractiveUI(callbacks, config) {
    return new MySimpleUI(callbacks, config);
  }
}
```

**步骤3**: 注册并使用

```typescript
import { UIFactoryRegistry } from 'claude-replica/ui/factories';

UIFactoryRegistry.registerUIFactory('my-ui', new MyUIFactory());
process.env.CLAUDE_UI_TYPE = 'my-ui';
```

完成!你的最小UI已经可以运行。

## 3. 核心概念

### 3.1 四个核心接口

- **UIFactory**: 工厂入口,创建所有UI组件
- **ParserInterface**: CLI参数解析(可复用TerminalParser)
- **OutputInterface**: 标准输出(可复用TerminalOutput)
- **InteractiveUIInterface**: 交互UI核心(必须自己实现)

### 3.2 InteractiveUI方法分级

- **REQUIRED (2个)**: start(), stop() - 必须实现
- **CORE (11个)**: displayMessage(), displayError()等 - 建议实现
- **OPTIONAL (10个)**: showRewindMenu(), showSessionMenu()等 - 可选
- **UTILITY (3个)**: formatRelativeTime()等 - 可用默认实现

BaseInteractiveUI为所有非REQUIRED方法提供了默认实现。

## 4. 实现级别指南

### Level 1: 最小实现 (5分钟)

**实现内容**: 只实现start()和stop()

**适用场景**:
- 快速原型验证
- Headless环境
- CI/CD管道

**示例**: 见MinimalInteractiveUI

### Level 2: 基础交互 (30分钟)

**实现内容**: Level 1 + 覆盖核心显示方法

覆盖以下CORE方法:
- displayMessage() - 显示对话
- displayToolUse() - 显示工具调用
- displayToolResult() - 显示工具结果
- displayError() - 显示错误

**适用场景**:
- Web UI (通过WebSocket发送消息)
- 简单GUI
- 日志文件输出

**示例**:

```typescript
class WebSocketUI extends BaseInteractiveUI {
  private ws: WebSocket;

  async start() {
    this.ws = new WebSocket('ws://localhost:8080');
    await this.ws.waitForConnection();
  }

  stop() {
    this.ws.close();
  }

  displayMessage(message: string, role: MessageRole) {
    this.ws.send(JSON.stringify({ type: 'message', role, content: message }));
  }

  displayToolUse(tool: string, args: Record<string, unknown>) {
    this.ws.send(JSON.stringify({ type: 'tool_use', tool, args }));
  }

  displayToolResult(tool: string, result: string, isError?: boolean) {
    this.ws.send(JSON.stringify({ type: 'tool_result', tool, result, isError }));
  }

  displayError(message: string) {
    this.ws.send(JSON.stringify({ type: 'error', content: message }));
  }
}
```

### Level 3: 完整功能 (2-4小时)

**实现内容**: Level 2 + 交互菜单和状态管理

额外实现OPTIONAL方法:
- showRewindMenu() - 快照选择
- showSessionMenu() - 会话选择
- setPermissionMode() - 权限模式切换
- displayTodoList() - 任务列表显示

**适用场景**:
- 高级Web UI
- 桌面GUI应用
- 富终端界面

**参考**: 查看TerminalInteractiveUI的完整实现

## 5. 接口详细参考

### 5.1 InteractiveUICallbacks

UI通过回调与Runner交互:

```typescript
interface InteractiveUICallbacks {
  onMessage: (message: string) => Promise<void>;  // 处理用户消息
  onInterrupt: () => void;                        // 中断处理
  onRewind: () => Promise<void>;                  // 回放处理
  onPermissionModeChange?: (mode: PermissionMode) => void | Promise<void>;
  onQueueMessage?: (message: string) => void;
  getRunner?: () => InteractiveUIRunner;          // 获取Runner实例
}
```

### 5.2 InteractiveUIRunner

通过getRunner()获取,可调用Runner公共方法:

```typescript
interface InteractiveUIRunner {
  listSessionsData(): Promise<Session[]>;
  getConfigData(): Promise<ProjectConfig>;
  resumeSession(session: Session, forkSession: boolean): Promise<void>;
  // ... 其他方法
}
```

### 5.3 方法详解

[详细列出每个方法的签名、参数、返回值、使用场景]

## 6. 注册自定义UI

### 方式1: 环境变量

```bash
export CLAUDE_UI_TYPE=my-custom-ui
```

### 方式2: 配置文件

```json
{
  "ui": {
    "type": "my-custom-ui"
  }
}
```

### 方式3: 编程注册

```typescript
UIFactoryRegistry.registerUIFactory('my-ui', myFactory);
```

## 7. 最佳实践

1. **继承BaseInteractiveUI**: 减少样板代码
2. **渐进式实现**: 从Level 1开始,逐步添加功能
3. **错误处理**: 所有async方法应捕获异常
4. **资源清理**: 在stop()中清理所有资源
5. **测试覆盖**: 至少测试生命周期和核心显示方法
6. **参考实现**: 学习TerminalInteractiveUI的模式(但不必照搬终端特定逻辑)

## 8. 常见问题

**Q: 必须实现所有25个方法吗?**
A: 不需要。继承BaseInteractiveUI只需实现start()和stop()。

**Q: 可以复用TerminalParser和TerminalOutput吗?**
A: 可以。如果你的UI不需要自定义CLI解析,直接使用现有实现。

**Q: 如何处理用户输入?**
A: 在start()中启动输入循环,收到输入后调用callbacks.onMessage(message)。

**Q: 如何实现菜单交互?**
A: 实现showRewindMenu/showSessionMenu等方法,使用你的UI框架显示菜单并返回用户选择。

**Q: BaseInteractiveUI的默认实现会影响功能吗?**
A: 不会。默认实现是no-op或返回默认值,确保UI基本可运行。覆盖需要的方法即可。
```

## 实施步骤

### 步骤1: 创建目录结构
1. 创建`.self_spec/2026-01-19-ui-integration-improvement/`目录
2. 创建`src/ui/contracts/`及子目录
3. 创建`src/ui/implementations/base/`目录

### 步骤2: 移动接口文件
1. 移动核心接口到`src/ui/contracts/core/`
2. 移动交互接口到`src/ui/contracts/interactive/`
3. 更新PermissionUI位置或重新导出
4. 创建`src/ui/contracts/index.ts`统一导出

### 步骤3: 更新导入路径
1. 使用全局搜索替换更新所有导入
2. 在`src/ui/index.ts`添加向后兼容导出
3. 运行`npm run build`确认无编译错误

### 步骤4: 优化接口文档
1. 为InteractiveUIInterface每个方法添加@level标记
2. 添加InteractiveUIMethodLevels常量
3. 更新方法文档注释

### 步骤5: 创建基类实现
1. 实现BaseInteractiveUI抽象类
2. 实现MinimalInteractiveUI示例
3. 添加单元测试

### 步骤6: 编写开发者指南
1. 创建CUSTOM_UI_GUIDE.md
2. 填充完整内容(概述、快速开始、接口参考、最佳实践等)
3. 在主README.md中添加链接

### 步骤7: 测试验证
1. 运行所有现有测试,确保无回归
2. 测试BaseInteractiveUI和MinimalInteractiveUI
3. 验证文档示例代码可运行

## 关键文件清单

### 需要创建的文件 (7个)

**接口契约**:
- `src/ui/contracts/index.ts` - 统一导出
- `src/ui/contracts/core/` (移动现有文件)
- `src/ui/contracts/interactive/` (移动现有文件)

**基类实现**:
- `src/ui/implementations/base/BaseInteractiveUI.ts` - 抽象基类
- `src/ui/implementations/base/MinimalInteractiveUI.ts` - 最小示例
- `src/ui/implementations/base/index.ts` - 导出

**文档**:
- `.self_spec/2026-01-19-ui-integration-improvement/design.md` - 本文件
- `.self_spec/2026-01-19-ui-integration-improvement/CUSTOM_UI_GUIDE.md` - 开发者指南

### 需要修改的文件 (约15个)

**接口文件** (移动并优化):
- `src/ui/ParserInterface.ts` → `src/ui/contracts/core/ParserInterface.ts`
- `src/ui/OutputInterface.ts` → `src/ui/contracts/core/OutputInterface.ts`
- `src/ui/OptionsInterface.ts` → `src/ui/contracts/core/OptionsInterface.ts`
- `src/ui/InteractiveUIInterface.ts` → `src/ui/contracts/interactive/InteractiveUIInterface.ts` (优化文档)
- `src/ui/factories/UIFactory.ts` → `src/ui/contracts/core/UIFactory.ts`

**导入路径更新**:
- `src/ui/index.ts` - 向后兼容导出
- `src/ui/factories/UIFactoryRegistry.ts`
- `src/ui/factories/TerminalUIFactory.ts`
- `src/ui/TerminalParser.ts`
- `src/ui/TerminalOutput.ts`
- `src/ui/TerminalInteractiveUI.ts`
- `src/ui/PermissionUIImpl.ts`
- `src/runners/InteractiveRunner.ts`
- `src/main.ts`
- `tests/test-helpers/MockInteractiveUI.ts`

**文档更新**:
- `README.md` - 添加自定义UI指南链接
- `docs/zh/DEVELOPER_GUIDE.md` - 添加UI扩展章节

## 验证标准

### 端到端验证流程

1. **构建验证**:
   ```bash
   npm run build
   # 应无TypeScript错误
   ```

2. **测试验证**:
   ```bash
   npm test
   # 所有现有测试应通过
   ```

3. **最小UI验证**:
   - 使用MinimalInteractiveUI运行应用
   - 验证可以启动、显示消息、正常停止

4. **文档验证**:
   - 跟随CUSTOM_UI_GUIDE.md快速开始章节
   - 验证示例代码可编译和运行
   - 确保5分钟内可完成最小UI实现

### 成功标准

- [ ] 所有接口文件已移动到contracts目录
- [ ] 所有导入路径已更新,无编译错误
- [ ] BaseInteractiveUI提供完整默认实现
- [ ] MinimalInteractiveUI可成功运行
- [ ] CUSTOM_UI_GUIDE.md内容完整、示例可运行
- [ ] 所有现有测试通过(无回归)
- [ ] 新增测试覆盖率 > 80%

## 风险评估

### 低风险
- 文件移动操作(可回滚)
- 新增基类和文档(不影响现有代码)

### 中风险
- 导入路径更新(可能遗漏某些引用)
  - **缓解**: 使用全局搜索,逐个文件验证,运行完整测试套件

### 预期影响
- 对终端用户: 无影响(功能不变)
- 对现有代码: 需要更新导入路径
- 对新开发者: 极大降低集成难度

## 估算工作量

- 文件重组和路径更新: 2-3小时
- 接口文档优化: 1-2小时
- BaseInteractiveUI实现: 2-3小时
- 开发者指南编写: 4-6小时
- 测试和验证: 2-3小时

**总计**: 11-17小时 (约2个工作日)
