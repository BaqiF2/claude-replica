# Session 维度 Token 统计功能设计

## 概述

为 Claude Replica 应用新增 session 维度的 token 统计功能，按 SDK 最佳实践追踪缓存 token 使用情况，并在 UI 层显示缓存命中率。

## 需求分析

### 必须输出的字段
- `input_tokens`: 基础输入 token 数量
- `output_tokens`: 响应中生成的 token 数量
- `cache_creation_input_tokens`: 用于创建缓存条目的 token 数量
- `cache_read_input_tokens`: 从缓存读取的 token 数量

### UI 显示要求
- 缓存命中率计算：`cache_read_input_tokens / input_tokens`
- 显示时机：仅在 `/stats` 命令时显示
- 显示格式：`/stats` 直接显示详细信息（不需要 `-v` 选项）

### SDK 最佳实践
- **相同 ID = 相同使用情况**：所有具有相同 id 字段的消息报告相同的使用情况，需按消息 ID 去重
- **每步骤收费一次**：只对每个唯一消息 ID 计费一次
- **结果消息包含累积使用情况**：最终 result 消息包含对话中所有步骤的总累积使用情况

## 现状分析

### 现有数据结构 (`src/core/SessionManager.ts`)

```typescript
// 当前 UsageStats 接口 - 缺少缓存字段
export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  totalCostUsd?: number;
  durationMs?: number;
}

// 当前 SessionStats 接口 - 缺少缓存统计
export interface SessionStats {
  messageCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  lastMessagePreview: string;
}
```

### SDK 返回的 usage 数据 (根据官方文档)

```typescript
{
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  service_tier?: string;
  total_cost_usd?: number;  // 仅在 result 消息中
}
```

### 数据流路径

1. `SDKQueryExecutor.executeStreaming()` 接收 SDK 消息
2. `StreamingQueryManager.handleSDKMessage()` 处理消息
3. `SDKQueryResult` 返回 usage 数据
4. 当前 **未传递** 缓存相关字段

## 实现方案

### 1. 扩展数据接口

#### 1.1 `src/core/SessionManager.ts` - 扩展 UsageStats

```typescript
export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  /** 缓存创建 token 数量 */
  cacheCreationInputTokens: number;
  /** 缓存读取 token 数量 */
  cacheReadInputTokens: number;
  totalCostUsd?: number;
  durationMs?: number;
}
```

#### 1.2 `src/core/SessionManager.ts` - 扩展 SessionStats

```typescript
export interface SessionStats {
  messageCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  /** 累计缓存创建 token */
  totalCacheCreationInputTokens: number;
  /** 累计缓存读取 token */
  totalCacheReadInputTokens: number;
  totalCostUsd: number;
  lastMessagePreview: string;
}
```

### 2. 修改数据流

#### 2.1 `src/sdk/SDKQueryExecutor.ts` - 扩展 SDKQueryResult

```typescript
export interface SDKQueryResult {
  response: string;
  totalCostUsd?: number;
  durationMs?: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;  // 新增
    cacheReadInputTokens: number;      // 新增
  };
  isError: boolean;
  errorMessage?: string;
  sessionId?: string;
}
```

修改 `executeStreaming()` 方法中的 result 消息处理逻辑，从 SDK 响应中提取缓存字段。

#### 2.2 `src/core/SessionManager.ts` - 更新 calculateStats()

```typescript
private calculateStats(session: Session): SessionStats {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreationInputTokens = 0;
  let totalCacheReadInputTokens = 0;
  let totalCostUsd = 0;

  // 使用 Set 记录已处理的消息 ID，避免重复计数
  // SDK 最佳实践：相同 ID 的消息报告相同的使用情况
  const processedMessageIds = new Set<string>();

  for (const message of session.messages) {
    // 按消息 ID 去重
    if (processedMessageIds.has(message.id)) {
      continue;
    }
    processedMessageIds.add(message.id);

    if (message.usage) {
      totalInputTokens += message.usage.inputTokens || 0;
      totalOutputTokens += message.usage.outputTokens || 0;
      totalCacheCreationInputTokens += message.usage.cacheCreationInputTokens || 0;
      totalCacheReadInputTokens += message.usage.cacheReadInputTokens || 0;
      totalCostUsd += message.usage.totalCostUsd || 0;
    }
  }

  return {
    messageCount: session.messages.length,
    totalInputTokens,
    totalOutputTokens,
    totalCacheCreationInputTokens,
    totalCacheReadInputTokens,
    totalCostUsd,
    lastMessagePreview: this.extractLastMessagePreview(session),
  };
}
```

### 3. UI 层实现

#### 3.1 新增 `/stats` 命令

在 `src/ui/TerminalInteractiveUI.ts` 中添加 `/stats` 命令处理：

```typescript
private async handleSlashCommand(command: string): Promise<void> {
  const parts = command.slice(1).split(/\s+/);
  const cmdName = parts[0].toLowerCase();

  switch (cmdName) {
    // ... 现有命令
    case 'stats':
      await this.showSessionStats();
      break;
    // ...
  }
}

private async showSessionStats(): Promise<void> {
  const runner = this.callbacks.getRunner?.();
  if (!runner) {
    this.displayError('Runner not available');
    return;
  }

  const stats = await runner.getSessionStatsData();
  this.displaySessionStats(stats);
}

private displaySessionStats(stats: SessionStats): void {
  this.writeLine('');
  this.writeLine(this.colorize('═══ Session Statistics ═══', 'bold'));

  // Token 统计
  this.writeLine(`  Input tokens:  ${this.formatTokenCount(stats.totalInputTokens)}`);
  this.writeLine(`  Output tokens: ${this.formatTokenCount(stats.totalOutputTokens)}`);

  // 缓存统计
  this.writeLine(`  Cache creation: ${this.formatTokenCount(stats.totalCacheCreationInputTokens)}`);
  this.writeLine(`  Cache read:     ${this.formatTokenCount(stats.totalCacheReadInputTokens)}`);

  const cacheHitRate = stats.totalInputTokens > 0
    ? (stats.totalCacheReadInputTokens / stats.totalInputTokens * 100).toFixed(1)
    : '0.0';
  this.writeLine(`  Cache hit rate: ${stats.totalCacheReadInputTokens}/${stats.totalInputTokens} = ${cacheHitRate}%`);

  // 其他统计
  this.writeLine(`  Messages: ${stats.messageCount}`);
  if (stats.totalCostUsd > 0) {
    this.writeLine(`  Total cost: $${stats.totalCostUsd.toFixed(4)}`);
  }
  this.writeLine('');
}
```

#### 3.2 扩展 Runner 接口

在 `src/ui/InteractiveUIInterface.ts` 中添加方法声明：

```typescript
export interface InteractiveUIRunner {
  // ... 现有方法
  getSessionStatsData(): Promise<SessionStats>;
}
```

在 `src/runners/InteractiveRunner.ts` 中实现：

```typescript
public async getSessionStatsData(): Promise<SessionStats> {
  const activeSession = this.streamingQueryManager?.getActiveSession();
  if (!activeSession?.session) {
    return {
      messageCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheCreationInputTokens: 0,
      totalCacheReadInputTokens: 0,
      totalCostUsd: 0,
      lastMessagePreview: '',
    };
  }

  return this.sessionManager.calculateSessionStats(activeSession.session);
}
```

### 4. 帮助文档更新

更新 `/help` 命令输出：

```typescript
private showCommandHelp(): void {
  const helpText = `
Available commands:
  /help           - Show this help information
  /stats          - Show session token statistics (including cache breakdown)
  /sessions       - List all sessions
  ...
`.trim();
```

## 关键文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `src/core/SessionManager.ts` | 扩展 UsageStats 和 SessionStats 接口，更新 calculateStats()（按消息 ID 去重） |
| `src/sdk/SDKQueryExecutor.ts` | 扩展 SDKQueryResult，从 SDK 响应提取缓存字段 |
| `src/ui/InteractiveUIInterface.ts` | 添加 getSessionStatsData() 方法声明 |
| `src/runners/InteractiveRunner.ts` | 实现 getSessionStatsData() 方法 |
| `src/ui/TerminalInteractiveUI.ts` | 添加 /stats 命令和显示逻辑 |

## 验证方案

1. **单元测试**
   - `SessionManager.calculateStats()` 正确累加缓存字段（按消息 ID 去重）
   - `SDKQueryExecutor` 正确解析 SDK 响应中的缓存字段

2. **集成测试**
   - `/stats` 命令正确显示详细统计数据
   - 缓存命中率计算正确

3. **手动验证**
   - 启动应用，发送几条消息
   - 执行 `/stats` 查看详细统计
   - 验证缓存命中率显示格式：`cache_read/input_tokens = X%`

## 注意事项

1. **向后兼容**：新增字段使用可选类型或默认值 0，保证旧会话数据可正常加载
2. **消息 ID 去重**：相同 ID 的消息共享相同使用数据，`calculateStats()` 需按消息 ID 去重避免重复计数
3. **结果消息累积使用情况**：SDK 的 result 消息包含对话中所有步骤的总累积使用情况
4. **不添加计费**：仅统计 token 数量，不计算费用（除非 SDK 已返回）
