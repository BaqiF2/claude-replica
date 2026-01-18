# 文件检查点功能实现方案

## 项目概览

将现有的 RewindManager 替换为基于 Claude Agent SDK 的文件检查点功能,支持多个恢复点。为终端交互模式添加文件检查点交互。

## 用户需求总结

根据与用户的访谈,确定以下关键需求:

1. **触发方式**: 保持现有的双击 ESC (300ms内) 触发方式
2. **自动创建**: 在 `message.type === 'user'` 时自动创建检查点
3. **存储位置**: 集成到 `~/.claude-replica/sessions/{session-id}/checkpoints/`
4. **菜单显示**: 显示时间戳和描述 (与现有 rewind 菜单保持一致)
5. **数量限制**: 每个会话保留 10 个检查点
6. **故障处理**: 显示警告信息
7. **替换策略**: 完全替换现有 RewindManager
8. **配置方式**: 通过环境变量控制

## 架构设计

### 1. 新增 CheckpointManager 类

**文件**: `src/checkpoint/CheckpointManager.ts` (新建)

#### 数据结构

```typescript
/**
 * SDK 检查点元数据接口
 */
interface CheckpointMetadata {
  id: string;              // 用户消息 UUID
  timestamp: Date;
  description: string;     // 从用户消息提取
  sessionId: string;       // SDK 会话 ID
}

/**
 * CheckpointManager - 管理 SDK 文件检查点
 *
 * 核心职责:
 * - 捕获检查点元数据 (UUID, 描述, 时间戳)
 * - 持久化检查点元数据到会话目录
 * - 提供检查点列表供 UI 显示
 * - 调用 SDK rewindFiles() 恢复检查点
 */
class CheckpointManager {
  private checkpoints: CheckpointMetadata[] = [];
  private maxCheckpoints: number = 10;
  private sessionId: string;
  private checkpointsDir: string;  // ~/.claude-replica/sessions/{session-id}/checkpoints/

  constructor(options: CheckpointManagerOptions);

  // 初始化: 从磁盘加载检查点元数据
  async initialize(): Promise<void>;

  // 捕获检查点元数据 (在 StreamingQueryManager 中调用)
  captureCheckpoint(uuid: string, description: string, sessionId: string): void;

  // 列出检查点 (供 UI 显示)
  listCheckpoints(): CheckpointMetadata[];

  // 恢复检查点 (调用 SDK rewindFiles)
  async restoreCheckpoint(checkpointId: string, queryInstance: Query): Promise<void>;

  // 持久化检查点元数据到磁盘
  private async saveCheckpoints(): Promise<void>;

  // 从磁盘加载检查点元数据
  private async loadCheckpoints(): Promise<void>;
}
```

#### 存储位置

检查点元数据存储在:
```
~/.claude-replica/sessions/{session-id}/checkpoints/metadata.json
```

元数据文件格式:
```json
{
  "checkpoints": [
    {
      "id": "msg-xxx-yyy",
      "timestamp": "2026-01-18T10:30:00Z",
      "description": "Add dark mode toggle to settings",
      "sessionId": "session-xxx"
    }
  ]
}
```

**设计理由**:
- SDK 检查点的实际文件数据由 SDK 自己管理,我们只需存储元数据
- 检查点与会话绑定,跟随会话的生命周期
- 10 个检查点限制通过数组管理实现 (超出时删除最旧的)

### 2. 修改 StreamingQueryManager

**文件**: `src/sdk/StreamingQueryManager.ts`

#### 修改点

在 `handleSDKMessage()` 方法中添加用户消息 UUID 捕获逻辑:

```typescript
private handleSDKMessage(message: SDKMessage): void {
  if (message.type === 'assistant') {
    this.handleAssistantMessage(message as SDKAssistantMessage);
  } else if (message.type === 'user' && 'message' in message) {
    this.handleUserMessage(message);

    // 新增: 捕获用户消息 UUID 作为检查点
    if (message.uuid && this.checkpointManager && this.activeSession) {
      this.captureUserMessageCheckpoint(message);
    }
  }
}

private captureUserMessageCheckpoint(message: SDKMessage): void {
  if (!this.checkpointManager || !this.activeSession) return;

  const description = this.extractCheckpointDescription(message);
  const sessionId = this.activeSession.session.sdkSessionId;

  if (sessionId) {
    this.checkpointManager.captureCheckpoint(
      message.uuid!,
      description,
      sessionId
    );
  }
}

private extractCheckpointDescription(message: SDKMessage): string {
  const userMessage = message as { message?: { content?: string | any[] } };
  const content = userMessage.message?.content;

  if (typeof content === 'string') {
    return content.substring(0, 80).replace(/\n/g, ' ');
  }

  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        return block.text.substring(0, 80).replace(/\n/g, ' ');
      }
    }
  }

  return `Checkpoint at ${new Date().toLocaleTimeString()}`;
}
```

#### 构造函数修改

添加 `checkpointManager` 参数:

```typescript
export interface StreamingQueryManagerOptions {
  // 现有字段...
  checkpointManager?: CheckpointManager;
}

constructor(options: StreamingQueryManagerOptions) {
  // 现有代码...
  this.checkpointManager = options.checkpointManager;
}
```

#### 添加 getQueryInstance 方法

为 InteractiveRunner 提供访问 queryInstance 的方法:

```typescript
getQueryInstance(): Query | null {
  return this.queryInstance;
}
```

### 3. 修改 SDKQueryExecutor

**文件**: `src/sdk/SDKQueryExecutor.ts`

#### 修改 mapToSDKOptions() 方法

在第 755-757 行附近,添加检查点配置逻辑:

```typescript
// 文件检查点
if (options.enableFileCheckpointing !== undefined) {
  sdkOptions.enableFileCheckpointing = options.enableFileCheckpointing;

  // 自动添加 extraArgs 以接收用户消息 UUID
  sdkOptions.extraArgs = {
    ...sdkOptions.extraArgs,
    'replay-user-messages': null,
  };
}
```

**位置**: 紧跟在现有的 `enableFileCheckpointing` 检查之后 (第 755 行)

### 4. 修改 InteractiveRunner

**文件**: `src/runners/InteractiveRunner.ts`

#### 构造函数修改

将 `rewindManager` 替换为 `checkpointManager`:

```typescript
constructor(
  output: OutputInterface,
  private readonly sessionManager: SessionManager,
  private readonly messageRouter: MessageRouter,
  private readonly sdkExecutor: SDKQueryExecutor,
  private readonly permissionManager: PermissionManager,
  private readonly mcpService: MCPService,
  private readonly checkpointManager: CheckpointManager | null,  // 替换 rewindManager
  private readonly configManager: ConfigManager,
  private readonly uiFactory: UIFactory,
  private readonly logger: Logger
) {
  this.output = output;
}
```

#### 重构 handleRewind() 方法

完全重写 `handleRewind()` 方法使用 CheckpointManager:

```typescript
private async handleRewind(_session: Session): Promise<void> {
  await this.logger.info('Opening checkpoint menu');

  if (!this.checkpointManager) {
    if (this.ui) {
      this.ui.displayWarning('Checkpoint feature not enabled');
    }
    return;
  }

  const checkpoints = this.checkpointManager.listCheckpoints();

  if (checkpoints.length === 0) {
    if (this.ui) {
      this.ui.displayWarning('No checkpoints available');
    }
    return;
  }

  // 转换为 UI Snapshot 格式
  const uiSnapshots: UISnapshot[] = checkpoints.map((c) => ({
    id: c.id,
    timestamp: c.timestamp,
    description: c.description,
    files: [], // SDK 检查点不需要显示文件列表
  }));

  if (this.ui) {
    const selected = await this.ui.showRewindMenu(uiSnapshots);

    if (selected) {
      try {
        const queryInstance = this.streamingQueryManager?.getQueryInstance();

        if (!queryInstance) {
          throw new Error('No active query session. Cannot restore checkpoint.');
        }

        await this.checkpointManager.restoreCheckpoint(
          selected.id,
          queryInstance
        );

        this.ui.displaySuccess(`Restored to checkpoint: ${selected.description}`);
        await this.logger.info('Checkpoint restored successfully', { checkpointId: selected.id });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.ui.displayError(`Restore failed: ${errorMessage}`);
        await this.logger.error('Checkpoint restore failed', error);
      }
    }
  }
}
```

#### 传递 checkpointManager 给 StreamingQueryManager

在 `run()` 方法中 (第 92 行附近):

```typescript
this.streamingQueryManager = new StreamingQueryManagerImpl({
  messageRouter: this.messageRouter,
  sdkExecutor: this.sdkExecutor,
  sessionManager: this.sessionManager,
  ui: this.ui,
  checkpointManager: this.checkpointManager,  // 新增
  onThinking: (content) => { /* 现有代码 */ },
  onToolUse: (info) => { /* 现有代码 */ },
  onToolResult: (info) => { /* 现有代码 */ },
  onAssistantText: (text) => { /* 现有代码 */ },
});
```

### 5. 修改 main.ts

**文件**: `src/main.ts`

#### 移除 RewindManager 初始化

删除第 173-174 行:
```typescript
// 删除这两行
this.rewindManager = new RewindManager({ workingDir });
await this.rewindManager.initialize();
```

#### 添加 CheckpointManager 初始化

在相同位置添加:

```typescript
// 文件检查点初始化
const enableCheckpointing = process.env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING === '1';

if (enableCheckpointing) {
  // CheckpointManager 将在 InteractiveRunner.run() 中初始化
  // 因为需要 session 信息
  this.checkpointManager = null; // 占位,稍后初始化
} else {
  this.checkpointManager = null;
}
```

#### 环境变量检查和警告

在 Application 构造函数或 initialize() 方法中添加:

```typescript
private async checkCheckpointEnvironment(): Promise<void> {
  const config = await this.configManager.getProjectConfig();

  if (config.enableFileCheckpointing &&
      process.env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING !== '1') {
    console.warn('Warning: File checkpointing enabled in config but environment variable not set');
    console.warn('Set CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1 to enable SDK checkpointing');
  }
}
```

在 `initialize()` 方法中调用:
```typescript
await this.checkCheckpointEnvironment();
```

### 6. 修改 RunnerFactory

**文件**: `src/runners/RunnerFactory.ts`

#### 修改构造函数

将 `rewindManager` 替换为 `checkpointManager`:

```typescript
constructor(
  private readonly output: OutputInterface,
  private readonly sessionManager: SessionManager,
  private readonly messageRouter: MessageRouter,
  private readonly sdkExecutor: SDKQueryExecutor,
  private readonly permissionManager: PermissionManager,
  private readonly mcpService: MCPService,
  private readonly checkpointManager: CheckpointManager | null,  // 替换
  private readonly configManager: ConfigManager,
  private readonly uiFactory: UIFactory,
  private readonly logger: Logger
) {}
```

#### 修改 createInteractiveRunner() 方法

传递 `checkpointManager`:

```typescript
createInteractiveRunner(): InteractiveRunner {
  return new InteractiveRunner(
    this.output,
    this.sessionManager,
    this.messageRouter,
    this.sdkExecutor,
    this.permissionManager,
    this.mcpService,
    this.checkpointManager,  // 替换
    this.configManager,
    this.uiFactory,
    this.logger
  );
}
```

### 7. 配置管理

**文件**: `src/config/SDKConfigLoader.ts`

#### 添加配置选项

```typescript
export interface ProjectConfig {
  // 现有字段...

  /** 是否启用 SDK 文件检查点 (默认 true) */
  enableFileCheckpointing?: boolean;

  /** 检查点保留数量 (默认 10) */
  checkpointKeepCount?: number;
}
```

#### 配置文件示例

在 `.claude-replica/settings.json` 中:

```json
{
  "enableFileCheckpointing": true,
  "checkpointKeepCount": 10
}
```

### 8. 移除 RewindManager

#### 删除文件

删除以下文件:
- `src/rewind/RewindManager.ts`
- `src/rewind/index.ts`
- `tests/rewind/RewindManager.test.ts`

#### 删除导入

从以下文件中删除 RewindManager 的导入和类型引用:
- `src/main.ts`
- `src/runners/RunnerFactory.ts`
- `src/runners/InteractiveRunner.ts`

## 数据流

### 检查点创建流程

```
用户输入消息
    ↓
MessageRouter.buildStreamMessage()
    ↓
LiveMessageGenerator.push()
    ↓
SDK query() 处理消息
    ↓
SDK 返回用户消息 (type='user', uuid='msg-xxx')
    ↓
StreamingQueryManager.handleSDKMessage()
    ↓
StreamingQueryManager.captureUserMessageCheckpoint()
    ↓
CheckpointManager.captureCheckpoint(uuid, description, sessionId)
    ↓
存储到 ~/.claude-replica/sessions/{session-id}/checkpoints/metadata.json
```

### 检查点恢复流程

```
用户双击 ESC
    ↓
InteractiveRunner.handleRewind()
    ↓
CheckpointManager.listCheckpoints()
    ↓
UI.showRewindMenu(checkpoints)
    ↓
用户选择检查点
    ↓
CheckpointManager.restoreCheckpoint(checkpointId, queryInstance)
    ↓
queryInstance.rewindFiles(checkpointId)
    ↓
SDK 恢复文件到检查点状态
    ↓
UI.displaySuccess()
```

## 错误处理

### 1. 环境变量未设置

在 Application 初始化时检查:

```typescript
if (config.enableFileCheckpointing &&
    !process.env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING) {
  console.warn('Warning: File checkpointing enabled but environment variable not set');
  console.warn('Set CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1 to enable SDK checkpointing');
}
```

### 2. CheckpointManager 未初始化

在 `handleRewind()` 中:

```typescript
if (!this.checkpointManager) {
  this.ui?.displayWarning('Checkpoint feature not enabled');
  return;
}
```

### 3. 无可用检查点

```typescript
if (checkpoints.length === 0) {
  this.ui?.displayWarning('No checkpoints available');
  return;
}
```

### 4. Query 实例不存在

```typescript
const queryInstance = this.streamingQueryManager?.getQueryInstance();

if (!queryInstance) {
  throw new Error('No active query session. Cannot restore checkpoint.');
}
```

### 5. SDK 检查点数据不存在

在 `CheckpointManager.restoreCheckpoint()` 中:

```typescript
try {
  await queryInstance.rewindFiles(checkpointId);
} catch (error) {
  if (error.message.includes('No file checkpoint found')) {
    throw new Error(
      'Checkpoint data not found in SDK. ' +
      'This may happen if the session was not properly completed or ' +
      'CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING was not set.'
    );
  }
  throw error;
}
```

### 6. 检查点恢复失败

在 `InteractiveRunner.handleRewind()` 中:

```typescript
catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  this.ui.displayError(`Restore failed: ${errorMessage}`);
  await this.logger.error('Checkpoint restore failed', error);
}
```

## UI/UX 设计

### 1. 保持现有 rewind 菜单

继续使用 `TerminalInteractiveUI.showRewindMenu()` 方法,用户体验完全一致:

- 显示时间戳 (相对时间)
- 显示描述 (用户消息预览)
- 按时间倒序排列 (最新的在前)
- 数字选择 (1-N)
- 输入 0 取消

### 2. 检查点描述智能提取

从用户消息中提取前 80 字符作为描述:

- 纯文本消息: 直接截取前 80 字符
- 多内容块消息: 提取第一个文本块的前 80 字符
- 无法提取时: 使用时间戳 "Checkpoint at 10:30:45"

### 3. 检查点数量限制

CheckpointManager 自动管理:

```typescript
captureCheckpoint(uuid: string, description: string, sessionId: string): void {
  const checkpoint: CheckpointMetadata = { id: uuid, timestamp: new Date(), description, sessionId };

  // 添加到列表顶部 (最新的在前)
  this.checkpoints.unshift(checkpoint);

  // 超出限制时删除最旧的
  if (this.checkpoints.length > this.maxCheckpoints) {
    this.checkpoints.pop();
  }

  // 持久化
  this.saveCheckpoints().catch(err => {
    console.error('Failed to save checkpoints:', err);
  });
}
```

## 测试策略

### 1. 单元测试

**文件**: `tests/checkpoint/CheckpointManager.test.ts` (新建)

测试用例:
- 捕获检查点元数据
- 检查点数量限制 (保留 10 个)
- 检查点列表排序 (最新的在前)
- 检查点持久化和加载
- 检查点恢复 (mock SDK rewindFiles)

### 2. 集成测试

**文件**: `tests/integration/checkpoint-flow.test.ts` (新建)

测试场景:
1. 启动会话 → 发送消息 → 验证检查点被捕获
2. 多轮对话 → 验证多个检查点被创建
3. 恢复检查点 → 验证 SDK rewindFiles 被正确调用
4. 会话恢复 → 验证检查点元数据加载

### 3. 现有测试修改

删除 RewindManager 相关测试:
- `tests/rewind/RewindManager.test.ts` (删除)

更新相关集成测试,移除 rewindManager 引用。

## 实现优先级

### Phase 1: 核心功能 (P0)

1. 创建 `CheckpointManager` 类 (`src/checkpoint/CheckpointManager.ts`)
2. 修改 `StreamingQueryManager` 捕获用户消息 UUID
3. 修改 `SDKQueryExecutor` 添加 `extraArgs` 配置
4. 修改 `InteractiveRunner.handleRewind()` 使用新系统
5. 修改 `main.ts` 和 `RunnerFactory.ts` 传递 `checkpointManager`
6. 移除 `RewindManager` 及其引用

### Phase 2: 错误处理和配置 (P1)

7. 添加环境变量检查和警告
8. 在 `ConfigManager` 中支持检查点配置
9. 实现完善的错误处理和用户提示
10. 添加检查点描述智能提取

### Phase 3: 测试和文档 (P2)

11. 编写 `CheckpointManager` 单元测试
12. 编写集成测试
13. 更新 API 文档
14. 添加用户指南和配置说明

## 关键文件修改总结

| 文件路径 | 修改类型 | 关键修改点 |
|---------|---------|-----------|
| `src/checkpoint/CheckpointManager.ts` | **新建** | 核心类,管理检查点元数据和 SDK 交互 |
| `src/checkpoint/index.ts` | **新建** | 导出 CheckpointManager |
| `src/sdk/StreamingQueryManager.ts` | **修改** | 添加 `captureUserMessageCheckpoint()` 和 `extractCheckpointDescription()` 方法 |
| `src/sdk/SDKQueryExecutor.ts` | **修改** | 在 `mapToSDKOptions()` 中自动添加 `extraArgs: { 'replay-user-messages': null }` |
| `src/runners/InteractiveRunner.ts` | **修改** | 重构 `handleRewind()` 方法,替换 `rewindManager` 为 `checkpointManager` |
| `src/main.ts` | **修改** | 移除 RewindManager 初始化,添加环境变量检查 |
| `src/runners/RunnerFactory.ts` | **修改** | 替换 `rewindManager` 参数为 `checkpointManager` |
| `src/config/SDKConfigLoader.ts` | **修改** | 添加 `enableFileCheckpointing` 和 `checkpointKeepCount` 配置选项 |
| `src/rewind/RewindManager.ts` | **删除** | 完全移除 |
| `src/rewind/index.ts` | **删除** | 完全移除 |
| `tests/checkpoint/CheckpointManager.test.ts` | **新建** | 单元测试 |
| `tests/integration/checkpoint-flow.test.ts` | **新建** | 集成测试 |
| `tests/rewind/RewindManager.test.ts` | **删除** | 删除旧测试 |

## 验证方案

### 端到端测试流程

1. **设置环境**:
   ```bash
   export CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1
   ```

2. **启动交互模式**:
   ```bash
   npm start
   ```

3. **创建测试文件**:
   用户输入: "Create a file utils.ts with add and subtract functions"

4. **验证检查点创建**:
   - 检查 `~/.claude-replica/sessions/{session-id}/checkpoints/metadata.json` 是否存在
   - 验证包含一个检查点记录

5. **修改文件**:
   用户输入: "Add multiply and divide functions to utils.ts"

6. **打开检查点菜单**:
   - 双击 ESC (300ms内)
   - 验证显示 2 个检查点

7. **恢复到第一个检查点**:
   - 选择编号 1
   - 验证 utils.ts 文件恢复到只有 add 和 subtract 函数

8. **验证 UI 提示**:
   - 成功恢复后显示绿色成功消息
   - 失败时显示红色错误消息

### 故障场景测试

1. **环境变量未设置**:
   - 启动时应显示警告信息

2. **无检查点时双击 ESC**:
   - 显示 "No checkpoints available"

3. **在非活跃会话中尝试恢复**:
   - 显示 "No active query session" 错误

## 配置示例

### 环境变量

```bash
# 启用 SDK 文件检查点
export CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1
```

### 配置文件

`.claude-replica/settings.json`:

```json
{
  "enableFileCheckpointing": true,
  "checkpointKeepCount": 10
}
```

### 用户级配置

`~/.claude-replica/settings.json`:

```json
{
  "enableFileCheckpointing": true,
  "checkpointKeepCount": 20
}
```

## 迁移说明

### 现有用户影响

1. **旧快照数据**: 不会自动迁移。旧的 RewindManager 快照仍然保留在 `workingDir/.claude/snapshots/` 中,但不再通过 UI 访问。

2. **功能切换**: 升级后,检查点功能会自动启用 (如果设置了环境变量)。用户体验保持一致 (双击 ESC)。

3. **向后兼容**: 不支持。这是新功能,不是 breaking change。

### 发布说明

在版本发布说明中包含:

```markdown
## 检查点功能升级

文件回退功能现在由 Claude Agent SDK 提供支持,提供更可靠的文件恢复能力。

### 新特性
- 基于 SDK 的文件检查点,自动跟踪 Write/Edit/NotebookEdit 操作
- 每个会话保留 10 个检查点 (可配置)
- 与现有 UI 完全兼容 (双击 ESC 触发)

### 配置
需要设置环境变量:
```bash
export CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1
```

### 注意事项
- 旧的快照数据不会自动迁移
- 旧快照仍保留在 `workingDir/.claude/snapshots/` 中,可手动访问
```

## 后续优化 (可选)

以下功能可以在后续版本中考虑:

1. **命令行接口**: 添加 `/checkpoint` 命令用于手动创建检查点
2. **检查点标签**: 允许用户为检查点添加自定义标签
3. **差异预览**: 在恢复前显示文件差异
4. **跨会话恢复**: 支持从其他会话恢复检查点 (需要 SDK 支持)
5. **导出/导入**: 支持导出和导入检查点数据

## 总结

本方案将现有的 RewindManager 完全替换为基于 Claude Agent SDK 的文件检查点功能。主要优势:

1. **原生 SDK 支持**: 利用 SDK 内置的文件跟踪能力,更可靠
2. **自动化**: 每个用户消息自动创建检查点,无需手动触发
3. **会话集成**: 检查点与会话绑定,生命周期一致
4. **用户体验一致**: 保持双击 ESC 的触发方式,UI 无变化
5. **配置灵活**: 支持环境变量和配置文件两种方式

实现后,用户可以在交互模式下自由地回退文件到任意检查点,支持探索不同的实现方案,极大提升开发效率。
