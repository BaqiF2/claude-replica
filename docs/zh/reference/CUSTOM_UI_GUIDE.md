# 自定义UI实现指南

本指南帮助开发者实现自己的UI层来扩展Claude Replica,支持多种用户界面(Web、桌面GUI、移动端等)。

## 目录

1. [概述](#概述)
2. [快速开始 - 5分钟实现最小UI](#快速开始---5分钟实现最小ui)
3. [核心概念](#核心概念)
4. [实现级别指南](#实现级别指南)
5. [接口详细参考](#接口详细参考)
6. [注册自定义UI](#注册自定义ui)
7. [最佳实践](#最佳实践)
8. [常见问题](#常见问题)

## 概述

Claude Replica采用分层UI架构,UI层与核心逻辑完全解耦。你可以实现自己的UI来替换默认的终端UI,支持：

- **Web UI**: 通过WebSocket或HTTP提供Web界面
- **桌面GUI**: Electron、Tauri等桌面应用
- **移动端**: React Native等移动应用框架
- **Headless**: CI/CD、自动化测试等无界面场景
- **自定义协议**: 任何自定义的交互方式

**核心优势**:
- ✅ 只需实现2个必需方法即可运行
- ✅ 继承`BaseInteractiveUI`获得所有默认实现
- ✅ 渐进式增强,按需覆盖方法
- ✅ 完整的TypeScript类型支持

## 快速开始 - 5分钟实现最小UI

### 步骤1: 继承BaseInteractiveUI

创建你的UI类,只需实现`start()`和`stop()`两个方法:

```typescript
import { BaseInteractiveUI } from 'claude-replica/ui/implementations/base';
import type {
  InteractiveUICallbacks,
  InteractiveUIConfig,
} from 'claude-replica/ui/contracts';

export class MySimpleUI extends BaseInteractiveUI {
  async start(): Promise<void> {
    console.log('My UI started');

    // TODO: 实现UI启动逻辑
    // 例如: 启动WebSocket服务器、显示窗口、监听用户输入等
    // 当收到用户输入时,调用: await this.callbacks.onMessage(userInput);
  }

  stop(): void {
    console.log('My UI stopped');

    // TODO: 实现UI停止逻辑
    // 例如: 关闭连接、清理资源、关闭窗口等
  }
}
```

**就这么简单!** 所有其他方法(displayMessage, displayError等)都已由`BaseInteractiveUI`提供默认实现。

### 步骤2: 实现UIFactory

创建工厂类来创建你的UI实例:

```typescript
import type { UIFactory } from 'claude-replica/ui/contracts';
import { MySimpleUI } from './MySimpleUI';

// 可复用现有的Parser、Output和PermissionUI实现
import {
  TerminalParser,
  TerminalOutput,
  PermissionUIImpl,
} from 'claude-replica/ui';

export class MyUIFactory implements UIFactory {
  createParser() {
    return new TerminalParser(); // 或自定义实现
  }

  createOutput() {
    return new TerminalOutput(); // 或自定义实现
  }

  createPermissionUI() {
    return new PermissionUIImpl(); // 或自定义实现
  }

  createInteractiveUI(callbacks, config) {
    return new MySimpleUI(callbacks, config);
  }
}
```

### 步骤3: 注册并使用

有三种方式注册你的自定义UI:

**方式1: 环境变量**
```bash
export CLAUDE_UI_TYPE=my-simple-ui
```

**方式2: 配置文件**
```json
// .claude-replica/settings.json
{
  "ui": {
    "type": "my-simple-ui"
  }
}
```

**方式3: 编程注册**
```typescript
import { UIFactoryRegistry } from 'claude-replica/ui/factories';
import { MyUIFactory } from './MyUIFactory';

// 在应用启动前注册
UIFactoryRegistry.registerUIFactory('my-simple-ui', new MyUIFactory());
```

**完成!** 现在你的自定义UI已经可以运行了。

## 核心概念

### 四个核心接口

Claude Replica的UI层由4个核心接口组成:

| 接口 | 职责 | 是否必须自己实现 |
|------|------|------------------|
| **UIFactory** | 工厂入口,创建所有UI组件 | ✅ 是 |
| **ParserInterface** | CLI参数解析 | ❌ 可复用TerminalParser |
| **OutputInterface** | 标准输出(info/warn/error等) | ❌ 可复用TerminalOutput |
| **InteractiveUIInterface** | 交互UI核心(25个方法) | ✅ 是(但可继承BaseInteractiveUI) |

### InteractiveUI方法分级

`InteractiveUIInterface`包含25个方法,按实现优先级分为4个级别:

#### ✅ REQUIRED (2个) - 必须实现
- `start()` - 启动UI循环
- `stop()` - 停止UI

#### 🟢 CORE (11个) - 建议实现
- `displayMessage()` - 显示对话消息
- `displayToolUse()` - 显示工具调用
- `displayToolResult()` - 显示工具结果
- `displayError()` - 显示错误
- 其他7个显示方法...

#### 🟡 OPTIONAL (10个) - 可选实现
- `showRewindMenu()` - 快照选择菜单
- `showSessionMenu()` - 会话选择菜单
- `promptConfirmation()` - 确认对话框
- 其他7个交互方法...

#### 🔵 UTILITY (3个) - 工具方法
- `formatRelativeTime()` - 时间格式化
- `formatAbsoluteTime()` - 时间格式化
- `formatStatsSummary()` - 统计信息格式化

**`BaseInteractiveUI`为所有非REQUIRED方法提供了默认实现。**

### 回调机制

UI通过回调与Runner层交互:

```typescript
interface InteractiveUICallbacks {
  // 处理用户消息(必须)
  onMessage: (message: string) => Promise<void>;

  // 中断处理(必须)
  onInterrupt: () => void;

  // Rewind功能(必须)
  onRewind: () => Promise<void>;

  // 权限模式变更(可选)
  onPermissionModeChange?: (mode: PermissionMode) => void | Promise<void>;

  // 获取Runner实例以调用公共方法(可选)
  getRunner?: () => InteractiveUIRunner;
}
```

**关键点**:
- 当收到用户输入时,调用`this.callbacks.onMessage(userInput)`
- 当用户请求中断时,调用`this.callbacks.onInterrupt()`
- 通过`this.callbacks.getRunner()`可调用更多Runner方法(列出会话、获取配置等)

## 实现级别指南

根据你的需求,选择合适的实现级别:

### Level 1: 最小实现 (5分钟)

**实现内容**: 只实现`start()`和`stop()`

**适用场景**:
- ✅ 快速原型验证
- ✅ Headless环境
- ✅ CI/CD管道
- ✅ 学习UI架构

**示例**: 参考`MinimalInteractiveUI`

```typescript
export class HeadlessUI extends BaseInteractiveUI {
  async start() {
    // 从stdin读取用户输入并调用callbacks.onMessage()
  }

  stop() {
    // 清理资源
  }
}
```

### Level 2: 基础交互 (30分钟)

**实现内容**: Level 1 + 覆盖核心显示方法

**覆盖的CORE方法**:
- `displayMessage()` - 显示对话
- `displayToolUse()` - 显示工具调用
- `displayToolResult()` - 显示工具结果
- `displayError()` - 显示错误

**适用场景**:
- ✅ Web UI (通过WebSocket发送消息)
- ✅ 简单GUI
- ✅ 日志文件输出
- ✅ 聊天机器人集成

**示例**:

```typescript
export class WebSocketUI extends BaseInteractiveUI {
  private ws: WebSocket;

  async start() {
    this.ws = new WebSocket('ws://localhost:8080');
    await this.waitForConnection();

    // 监听WebSocket消息
    this.ws.on('message', async (data) => {
      const userMessage = data.toString();
      await this.callbacks.onMessage(userMessage);
    });
  }

  stop() {
    this.ws.close();
  }

  // 覆盖核心显示方法
  displayMessage(message: string, role: MessageRole) {
    this.ws.send(JSON.stringify({
      type: 'message',
      role,
      content: message,
    }));
  }

  displayToolUse(tool: string, args: Record<string, unknown>) {
    this.ws.send(JSON.stringify({
      type: 'tool_use',
      tool,
      args,
    }));
  }

  displayToolResult(tool: string, result: string, isError?: boolean) {
    this.ws.send(JSON.stringify({
      type: 'tool_result',
      tool,
      result,
      isError,
    }));
  }

  displayError(message: string) {
    this.ws.send(JSON.stringify({
      type: 'error',
      content: message,
    }));
  }

  private waitForConnection(): Promise<void> {
    return new Promise((resolve) => {
      this.ws.once('open', resolve);
    });
  }
}
```

### Level 3: 完整功能 (2-4小时)

**实现内容**: Level 2 + 交互菜单和状态管理

**额外实现的OPTIONAL方法**:
- `showRewindMenu()` - 快照选择
- `showSessionMenu()` - 会话选择
- `promptConfirmation()` - 确认对话框
- `setPermissionMode()` - 权限模式切换
- `displayTodoList()` - 任务列表显示

**适用场景**:
- ✅ 高级Web UI
- ✅ 桌面GUI应用
- ✅ 富终端界面
- ✅ 完整的用户体验

**参考**: 查看`TerminalInteractiveUI`的完整实现

## 接口详细参考

### InteractiveUICallbacks

UI通过回调与Runner交互:

```typescript
interface InteractiveUICallbacks {
  // 处理用户消息
  onMessage: (message: string) => Promise<void>;

  // 中断当前操作
  onInterrupt: () => void;

  // 触发Rewind功能
  onRewind: () => Promise<void>;

  // 权限模式变更通知
  onPermissionModeChange?: (mode: PermissionMode) => void | Promise<void>;

  // 队列消息(用于后台处理)
  onQueueMessage?: (message: string) => void;

  // 获取Runner实例
  getRunner?: () => InteractiveUIRunner;
}
```

### InteractiveUIRunner

通过`getRunner()`获取,可调用Runner的公共方法:

```typescript
interface InteractiveUIRunner {
  // 列出所有会话
  listSessionsData(): Promise<Session[]>;

  // 获取项目配置
  getConfigData(): Promise<ProjectConfig>;

  // 获取权限配置
  getPermissionsData(): { mode: string; allowDangerouslySkipPermissions: boolean };

  // 列出最近会话
  listRecentSessionsData(limit: number): Promise<Session[]>;

  // 获取会话统计
  getSessionStatsData(): Promise<SessionStats>;

  // 恢复会话
  resumeSession(session: Session, forkSession: boolean): Promise<void>;

  // 获取会话信息
  getResumeSessionInfo(session: Session, forkSession: boolean): {
    hasValidSdkSession: boolean;
    forkIndicator: string;
    isFork: boolean;
    message: string;
  };

  // MCP配置管理
  getMCPConfigData(): Promise<MCPConfigListResult>;
  editMCPConfigData(): Promise<MCPConfigEditResult>;
  validateMCPConfigData(): Promise<MCPConfigValidationResult>;
}
```

### 所有接口方法签名

查看完整的方法列表和详细说明,请参考:
- `src/ui/contracts/interactive/InteractiveUIInterface.ts`
- 每个方法都有详细的@level标记和文档注释

## 注册自定义UI

### 方式1: 环境变量

最简单的方式,适用于开发和测试:

```bash
export CLAUDE_UI_TYPE=my-custom-ui
npm run start
```

### 方式2: 配置文件

在项目或用户配置中设置:

```json
// .claude-replica/settings.json (项目配置)
{
  "ui": {
    "type": "my-custom-ui"
  }
}

// 或 ~/.claude-replica/settings.json (用户配置)
{
  "ui": {
    "type": "my-custom-ui"
  }
}
```

### 方式3: 编程注册

在代码中注册(适用于库或插件):

```typescript
import { UIFactoryRegistry } from 'claude-replica/ui/factories';
import { MyUIFactory } from './MyUIFactory';

// 注册自定义UI
UIFactoryRegistry.registerUIFactory('my-custom-ui', new MyUIFactory());

// 然后设置环境变量或配置文件使用它
process.env.CLAUDE_UI_TYPE = 'my-custom-ui';
```

## 最佳实践

### 1. 继承BaseInteractiveUI

❌ **不推荐**: 直接实现InteractiveUIInterface
```typescript
export class MyUI implements InteractiveUIInterface {
  // 必须实现所有25个方法...
}
```

✅ **推荐**: 继承BaseInteractiveUI
```typescript
export class MyUI extends BaseInteractiveUI {
  // 只需实现start()和stop()
  // 其他方法按需覆盖
}
```

### 2. 渐进式增强

从Level 1开始,逐步添加功能:

```typescript
// 第1步: 最小实现
export class MyUI extends BaseInteractiveUI {
  async start() { /* ... */ }
  stop() { /* ... */ }
}

// 第2步: 添加核心显示
export class MyUI extends BaseInteractiveUI {
  async start() { /* ... */ }
  stop() { /* ... */ }

  displayMessage(message, role) { /* ... */ }
  displayError(message) { /* ... */ }
}

// 第3步: 添加交互菜单
export class MyUI extends BaseInteractiveUI {
  // ...
  async showSessionMenu(sessions) { /* ... */ }
  async promptConfirmation(message) { /* ... */ }
}
```

### 3. 错误处理

所有async方法都应该捕获和处理异常:

```typescript
async start() {
  try {
    await this.initializeUI();
  } catch (error) {
    console.error('Failed to start UI:', error);
    throw error; // 或返回友好的错误提示
  }
}
```

### 4. 资源清理

在`stop()`中清理所有资源:

```typescript
stop() {
  // 关闭连接
  this.websocket?.close();

  // 移除监听器
  this.removeAllListeners();

  // 清理定时器
  if (this.timer) {
    clearInterval(this.timer);
  }

  // 释放其他资源
  this.cleanup();
}
```

### 5. 配置驱动

通过`config`参数接收UI配置,避免硬编码:

```typescript
constructor(callbacks, config) {
  super(callbacks, config);

  this.host = config.host || 'localhost';
  this.port = config.port || 8080;
  this.enableColors = config.enableColors ?? true;
}
```

### 6. 测试覆盖

至少测试生命周期和核心显示方法:

```typescript
describe('MyUI', () => {
  it('should start and stop', async () => {
    const ui = new MyUI(mockCallbacks);
    await ui.start();
    expect(ui.isRunning()).toBe(true);

    ui.stop();
    expect(ui.isRunning()).toBe(false);
  });

  it('should display messages', () => {
    const ui = new MyUI(mockCallbacks);
    const spy = jest.spyOn(ui, 'displayMessage');

    ui.displayMessage('Hello', 'user');
    expect(spy).toHaveBeenCalledWith('Hello', 'user');
  });
});
```

### 7. 参考现有实现

学习`TerminalInteractiveUI`的模式(但不必照搬终端特定逻辑):

- 如何处理用户输入
- 如何管理UI状态
- 如何实现菜单交互
- 如何格式化输出

## 常见问题

### Q: 必须实现所有25个方法吗?

**A**: 不需要。继承`BaseInteractiveUI`只需实现`start()`和`stop()`。其他方法都有默认实现,可按需覆盖。

### Q: 可以复用TerminalParser和TerminalOutput吗?

**A**: 可以。如果你的UI不需要自定义CLI解析和输出格式,直接在UIFactory中使用现有实现:

```typescript
createParser() {
  return new TerminalParser();
}

createOutput() {
  return new TerminalOutput();
}
```

### Q: 如何处理用户输入?

**A**: 在`start()`中启动输入循环,收到输入后调用回调:

```typescript
async start() {
  this.ws.on('message', async (data) => {
    const userInput = data.toString();
    await this.callbacks.onMessage(userInput);
  });
}
```

### Q: 如何实现菜单交互?

**A**: 实现对应的OPTIONAL方法,使用你的UI框架显示菜单:

```typescript
async showSessionMenu(sessions: Session[]): Promise<Session | null> {
  // 使用你的UI框架(React、Vue、原生HTML等)显示菜单
  const selectedIndex = await this.displayMenuAndWaitForSelection(sessions);

  if (selectedIndex === null) return null;
  return sessions[selectedIndex];
}
```

### Q: BaseInteractiveUI的默认实现会影响功能吗?

**A**: 不会。默认实现是no-op(空操作)或返回默认值(如false、null),确保UI基本可运行。覆盖需要的方法即可。

### Q: 如何调试UI?

**A**: 使用环境变量启用调试日志:

```bash
export CLAUDE_DEBUG=true
export CLAUDE_UI_TYPE=my-custom-ui
npm run start
```

### Q: 如何处理多语言?

**A**: 在displayMessage等方法中实现国际化:

```typescript
displayMessage(message: string, role: MessageRole) {
  const translatedMessage = this.i18n.translate(message);
  this.render(translatedMessage, role);
}
```

### Q: 性能优化建议?

**A**:
- 避免频繁的DOM操作,使用虚拟滚动
- 批量更新UI而不是逐条显示
- 使用WebWorker处理耗时操作
- 实现消息队列避免阻塞

## 下一步

- 📖 查看`src/ui/implementations/base/MinimalInteractiveUI.ts`了解最小示例
- 📖 查看`src/ui/TerminalInteractiveUI.ts`了解完整实现
- 📖 参考`src/ui/contracts/interactive/InteractiveUIInterface.ts`查看所有接口定义
- 🔧 开始实现你的第一个自定义UI!

如有问题,欢迎提交Issue或查看项目文档。
