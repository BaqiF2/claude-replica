# 会话管理系统重构规格说明

**日期**: 2026-01-12
**项目**: Claude Replica
**任务**: 重构会话管理功能，专注于交互模式的会话持久化、恢复和分叉

---

## 1. 目标概述

重构现有会话管理系统，简化架构并聚焦于交互模式的核心功能：

1. **会话持久化**: 仅支持交互模式，自动管理最近 10 次会话
2. **会话恢复**: 通过 `/resume` Slash Command 实现交互式选择和恢复
3. **会话分叉**: 通过 `/fork` Slash Command 基于当前会话创建新分支

### 核心约束

- ✅ 只支持交互模式的会话管理
- ✅ 按创建时间自动清理，保留最近 10 次
- ✅ 使用 Claude Agent SDK 的原生会话管理功能
- ✅ 分层架构设计，UI 层与业务层分离
- ✅ 删除与需求不一致的现有功能代码

---

## 2. 架构设计

### 2.1 分层结构

```
┌────────────────────────────────────────────────────────┐
│                   InteractiveUI                         │
│                   (UI 交互层)                            │
│  - showSessionMenu(): 会话选择菜单                       │
│  - formatRelativeTime(): 时间格式化                      │
│  - formatStatsSummary(): 统计信息格式化                  │
└─────────────────┬──────────────────────────────────────┘
                  │ 调用
┌─────────────────▼──────────────────────────────────────┐
│                  Application                            │
│                  (控制/协调层)                           │
│  - handleResumeCommand(): 处理 /resume                  │
│  - handleForkCommand(): 处理 /fork                      │
│  - 会话切换和生命周期管理                                │
└─────────────────┬──────────────────────────────────────┘
                  │ 调用
┌─────────────────▼──────────────────────────────────────┐
│                 SessionManager                          │
│                 (业务逻辑层)                             │
│  - listRecentSessions(): 获取最近会话                    │
│  - forkSession(): 分叉会话                               │
│  - cleanOldSessions(): 清理旧会话                        │
│  - calculateStats(): 计算统计信息                        │
└────────────────────────────────────────────────────────┘
```

### 2.2 职责划分

| 层级 | 职责 | 不关心 |
|------|------|--------|
| **SessionManager** | 会话 CRUD、元数据管理、统计计算、文件系统操作 | UI 交互、命令解析 |
| **Application** | Slash Command 路由、会话切换、错误处理、用户提示 | UI 实现细节、存储格式 |
| **InteractiveUI** | 终端 UI 渲染、用户输入捕获、菜单交互 | 会话业务逻辑 |

---

## 3. 数据结构设计

### 3.1 扩展 Session 接口

```typescript
/**
 * 会话统计信息
 */
export interface SessionStats {
  messageCount: number;         // 消息总数
  totalInputTokens: number;     // 累计输入 token
  totalOutputTokens: number;    // 累计输出 token
  totalCostUsd: number;         // 累计成本（美元）
  lastMessagePreview?: string;  // 最后一条消息的前80字符
}

/**
 * 会话接口 (扩展)
 */
export interface Session {
  id: string;
  createdAt: Date;
  lastAccessedAt: Date;
  messages: Message[];
  context: SessionContext;
  expired: boolean;
  workingDirectory: string;
  sdkSessionId?: string;

  // 新增字段
  parentSessionId?: string;  // 分叉来源会话 ID
  stats?: SessionStats;      // 缓存的统计信息
}

/**
 * 会话元数据 (持久化格式)
 */
export interface SessionMetadata {
  id: string;
  createdAt: string;
  lastAccessedAt: string;
  workingDirectory: string;
  expired: boolean;
  sdkSessionId?: string;
  parentSessionId?: string;  // 新增
  stats?: SessionStats;      // 新增
}
```

### 3.2 会话菜单项接口

```typescript
export interface SessionMenuItem {
  index: number;               // 1-10
  sessionId: string;           // 完整 ID
  sessionIdPrefix: string;     // ID 前8位
  relativeTime: string;        // "2小时前"
  absoluteTime: string;        // "2026-01-12 14:30:15"
  messagePreview: string;      // 最后一条消息前80字符
  statsSummary: string;        // "5 条消息, 1.2k tokens, $0.0015"
  isForked: boolean;           // 是否为分叉会话
}
```

---

## 4. 核心功能实现

### 4.1 SessionManager 新增方法

#### listRecentSessions()

```typescript
/**
 * 获取最近 N 个会话
 *
 * @param limit - 限制数量，默认 10
 * @returns 按创建时间倒序排列的会话列表
 */
async listRecentSessions(limit: number = 10): Promise<Session[]>
```

**实现流程**:
1. 调用 `listSessions()` 获取所有会话
2. 按 `createdAt` 倒序排序（最新在前）
3. 返回前 `limit` 个会话

#### forkSession()

```typescript
/**
 * 分叉会话
 *
 * @param sourceSessionId - 源会话 ID
 * @returns 新创建的分叉会话
 * @throws 如果源会话不存在
 */
async forkSession(sourceSessionId: string): Promise<Session>
```

**实现流程**:
1. 使用 `loadSessionInternal()` 加载源会话（不更新访问时间）
2. 验证源会话存在，否则抛出错误
3. 创建新会话：
   - 生成新的会话 ID
   - 深拷贝 `messages` 数组
   - 深拷贝 `context` 对象
   - 拷贝 `stats` 对象
   - 设置 `parentSessionId = sourceSessionId`
   - **不复制** `sdkSessionId`（由 SDK 生成新的）
   - **不复制** `snapshots` 目录
4. 保存新会话到磁盘
5. 返回新会话对象

#### cleanOldSessions()

```typescript
/**
 * 清理旧会话，保留最近 N 个
 *
 * @param keepCount - 保留数量，默认 10
 */
async cleanOldSessions(keepCount: number = 10): Promise<void>
```

**实现流程**:
1. 获取所有会话（使用 `listSessions()`）
2. 按 `createdAt` 倒序排序
3. 遍历索引 >= `keepCount` 的会话，调用 `deleteSession()`

#### calculateStats()

```typescript
/**
 * 计算会话统计信息
 *
 * @param session - 会话对象
 * @returns 统计信息对象
 */
private calculateStats(session: Session): SessionStats
```

**实现逻辑**:
1. 初始化累加器：`totalInputTokens = 0`, `totalOutputTokens = 0`, `totalCostUsd = 0`
2. 遍历 `session.messages`：
   - 如果 `message.usage` 存在，累加 token 和成本
   - 记录最后一条用户或助手消息的内容（前80字符）
3. 返回 `SessionStats` 对象

#### 修改 saveSession()

在保存会话时自动计算并更新 `session.stats`：

```typescript
async saveSession(session: Session): Promise<void> {
  // 自动计算统计信息
  session.stats = this.calculateStats(session);

  // 构建元数据（包含 parentSessionId 和 stats）
  const metadata: SessionMetadata = {
    id: session.id,
    createdAt: session.createdAt.toISOString(),
    lastAccessedAt: session.lastAccessedAt.toISOString(),
    workingDirectory: session.workingDirectory,
    expired: session.expired,
    sdkSessionId: session.sdkSessionId,
    parentSessionId: session.parentSessionId,
    stats: session.stats,
  };

  // 保存 metadata.json, messages.json, context.json
  // ...
}
```

---

### 4.2 InteractiveUI 新增组件

#### showSessionMenu()

```typescript
/**
 * 显示会话选择菜单
 *
 * @param sessions - 会话列表
 * @returns 用户选中的会话，或 null（取消）
 */
async showSessionMenu(sessions: Session[]): Promise<Session | null>
```

**UI 展示格式**:

```
═══ 会话恢复菜单 ═══
选择要恢复的会话 (↑/↓ 选择, Enter 确认, Esc 取消):

  [1] a1b2c3d4 | 2小时前 (2026-01-12 14:30:15)
      修复了用户登录问题... (5 条消息, 1.2k tokens, $0.0015)

  🔀 [2] 9f8e7d6c | 5小时前 (2026-01-12 11:45:20)
      实现新的认证系统... (12 条消息, 3.5k tokens, $0.0042)

  ...

  [0] 取消

? 请选择 (0-10): _
```

**交互逻辑**:
- 参考 `showRewindMenu()` 的实现（lines 421-472）
- 支持 0-N 数字输入
- 支持 Esc 键取消
- 显示分叉标记 🔀（如果 `parentSessionId` 存在）
- 无效输入时提示并重新等待

#### 辅助方法

```typescript
/**
 * 格式化相对时间
 * @param date - 日期对象
 * @returns "2小时前", "3天前" 等
 */
private formatRelativeTime(date: Date): string

/**
 * 格式化绝对时间
 * @param date - 日期对象
 * @returns "2026-01-12 14:30:15"
 */
private formatAbsoluteTime(date: Date): string

/**
 * 格式化统计摘要
 * @param stats - 统计信息对象
 * @returns "(5 条消息, 1.2k tokens, $0.0015)"
 */
private formatStatsSummary(stats?: SessionStats): string
```

---

### 4.3 Application Slash Command 处理

#### 扩展 handleCommand()

在 `main.ts:398-432` 的 `switch` 语句中添加：

```typescript
case 'resume':
  await this.handleResumeCommand();
  break;
case 'fork':
  await this.handleForkCommand();
  break;
```

#### handleResumeCommand()

```typescript
/**
 * 处理 /resume 命令
 * 显示会话菜单并切换到选中的会话
 */
private async handleResumeCommand(): Promise<void>
```

**实现流程**:
1. 验证在交互模式中（`this.ui` 存在），否则显示警告
2. 获取最近 10 个会话：`const sessions = await this.sessionManager.listRecentSessions(10)`
3. 如果会话列表为空，显示 "没有可用的会话" 并返回
4. 调用 `const selected = await this.ui.showSessionMenu(sessions)`
5. 如果 `selected === null`（用户取消），返回
6. 加载选中的会话：`const loaded = await this.sessionManager.loadSession(selected.id)`
7. 切换会话：
   ```typescript
   this.streamingQueryManager.endSession();
   this.streamingQueryManager.startSession(loaded);
   ```
8. 显示成功提示：`"已恢复会话: ${sessionIdPrefix}... (${messageCount} 条消息)"`

#### handleForkCommand()

```typescript
/**
 * 处理 /fork 命令
 * 分叉当前会话并切换到新会话
 */
private async handleForkCommand(): Promise<void>
```

**实现流程**:
1. 验证在交互模式中
2. 获取当前活动会话：
   ```typescript
   const activeSession = this.streamingQueryManager.getActiveSession();
   const current = activeSession?.session;
   ```
3. 如果没有活动会话，显示 "当前没有活动会话，无法分叉" 并返回
4. 分叉会话：`const forked = await this.sessionManager.forkSession(current.id)`
5. 保存原会话：`await this.sessionManager.saveSession(current)`
6. 切换到新会话：
   ```typescript
   this.streamingQueryManager.endSession();
   this.streamingQueryManager.startSession(forked);
   ```
7. 显示成功提示：`"已分叉会话: ${forkedIdPrefix}... (来自 ${parentIdPrefix}...)"`

---

## 5. 非交互模式处理

### 5.1 修改 runNonInteractive()

**目标**: 完全移除非交互模式的会话持久化功能

**实现**:

```typescript
private async runNonInteractive(options: CLIOptions): Promise<number> {
  // 1. 获取 prompt
  const prompt = options.print || (await this.readStdin());

  // 2. 创建临时会话对象（仅用于查询，不持久化）
  const tempSession: Session = {
    id: `temp-${Date.now()}`,
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    messages: [],
    context: {
      workingDirectory: process.cwd(),
      projectConfig: this.projectConfig,
      userConfig: this.userConfig,
      activeAgents: [],
    },
    expired: false,
    workingDirectory: process.cwd(),
  };

  // 添加用户消息
  this.sessionManager.addMessage(tempSession, 'user', prompt);

  // 3. 执行查询
  const result = await this.executeQuery(prompt, tempSession, options);

  // 4. 输出结果（不保存会话）
  this.outputFormatter.format(result);

  return result.error ? 1 : 0;
}
```

**关键变更**:
- ❌ 删除 `const session = await this.getOrCreateSession(options);`
- ❌ 删除 `await this.sessionManager.saveSession(session);`
- ✅ 使用临时会话对象执行查询
- ✅ 查询完成后不持久化

---

## 6. CLI 参数调整

### 6.1 删除不一致的 CLI 参数

在 `src/cli/CLIParser.ts` 中删除：

```typescript
// CLIOptions 接口中删除:
resume?: string;
continue?: boolean;
forkSession?: boolean;

// parse() 方法中删除 case 分支:
case '--resume':
case '-c':
case '--continue':
case '--fork':
```

### 6.2 更新帮助文本

```typescript
基本选项:
  -p, --print <query>    非交互模式执行查询并退出
  -h, --help             显示帮助信息
  -v, --version          显示版本号

交互模式命令 (仅在交互模式中可用):
  /resume                恢复最近的会话 (交互菜单)
  /fork                  分叉当前会话
  /sessions              列出所有会话
  /config                显示当前配置
  /permissions           显示权限设置
  /mcp                   MCP 服务器管理
  /clear                 清屏
  /exit                  退出程序
```

---

## 7. 会话清理机制

### 7.1 启动时自动清理

在 `Application.initialize()` 中调用：

```typescript
async initialize(): Promise<void> {
  // 现有初始化代码...

  // 自动清理旧会话，保留最近 10 个
  const keepCount = parseInt(process.env.SESSION_KEEP_COUNT || '10', 10);
  await this.sessionManager.cleanOldSessions(keepCount);

  // 继续其他初始化...
}
```

### 7.2 环境变量配置

在 `.env` 文件中添加：

```bash
# 会话管理配置
SESSION_KEEP_COUNT=10  # 保留的会话数量
```

---

## 8. 边界情况处理

| 场景 | 处理方式 |
|------|---------|
| **会话列表为空** | `/resume` 显示 "没有可用的会话" 并返回 |
| **分叉时父会话已删除** | `forkSession()` 抛出错误，Application 捕获并显示友好提示 |
| **会话恢复时 sdkSessionId 失效** | SDK 自动创建新会话，`executeQuery()` 中更新 `session.sdkSessionId` |
| **用户在菜单中按 Esc** | `showSessionMenu()` 返回 `null`，命令处理返回不执行任何操作 |
| **旧会话缺少 stats 字段** | 首次 `loadSession()` 时自动计算，下次 `saveSession()` 时写入 |

---

## 9. 关键文件修改清单

### 9.1 需要修改的文件

| 文件路径 | 修改内容 |
|---------|---------|
| **src/core/SessionManager.ts** | 扩展接口、实现 `listRecentSessions()`, `forkSession()`, `cleanOldSessions()`, `calculateStats()`，修改 `saveSession()` |
| **src/main.ts** | 实现 `handleResumeCommand()`, `handleForkCommand()`，修改 `runNonInteractive()`，删除 CLI 参数处理代码 |
| **src/ui/InteractiveUI.ts** | 实现 `showSessionMenu()`, `formatRelativeTime()`, `formatAbsoluteTime()`, `formatStatsSummary()` |
| **src/cli/CLIParser.ts** | 删除 `resume`, `continue`, `forkSession` 参数，更新帮助文本 |

### 9.2 需要删除的代码

#### src/main.ts

```typescript
// 删除 getOrCreateSession() 中的代码:
if (options.resume) {
  const session = await this.sessionManager.loadSession(options.resume);
  // ...
}
if (options.continue) {
  const recentSession = await this.sessionManager.getRecentSession();
  // ...
}

// 删除 runNonInteractive() 中的代码:
const session = await this.getOrCreateSession(options);
await this.sessionManager.saveSession(session);
```

#### src/cli/CLIParser.ts

```typescript
// 删除 CLIOptions 字段:
resume?: string;
continue?: boolean;
forkSession?: boolean;

// 删除 parse() 中的 case:
case '--resume': /* ... */
case '-c':
case '--continue': /* ... */
case '--fork': /* ... */
```

---

## 10. 实施步骤

### 阶段 1: 基础架构（高优先级）

**任务**:
1. 扩展 `Session`, `SessionMetadata`, `SessionStats` 接口
2. 实现 `calculateStats()` 私有方法
3. 修改 `saveSession()` 集成统计计算
4. 实现 `listRecentSessions()`
5. 编写单元测试

**验收标准**:
- `saveSession()` 正确计算并保存 `stats`
- `listRecentSessions()` 返回正确排序的会话
- 向后兼容（旧会话缺少 `stats` 不报错）

---

### 阶段 2: 会话分叉（高优先级）

**任务**:
1. 实现 `SessionManager.forkSession()`
2. 实现 `Application.handleForkCommand()`
3. 在 `handleCommand()` 中注册 `/fork`
4. 编写单元测试和集成测试

**验收标准**:
- 分叉成功复制消息和上下文
- `parentSessionId` 正确设置
- 不复制 `sdkSessionId` 和 `snapshots`
- 切换到新会话成功

---

### 阶段 3: 会话恢复 UI（高优先级）

**任务**:
1. 实现 `InteractiveUI.showSessionMenu()`
2. 实现格式化辅助方法
3. 实现 `Application.handleResumeCommand()`
4. 在 `handleCommand()` 中注册 `/resume`
5. 编写终端交互测试

**验收标准**:
- 菜单正确显示编号、时间、预览、统计
- 支持数字输入和 Esc 取消
- 会话切换成功
- 分叉会话显示 🔀 标记

---

### 阶段 4: 清理机制（中优先级）

**任务**:
1. 实现 `cleanOldSessions()`
2. 在 `Application.initialize()` 中调用
3. 添加 `SESSION_KEEP_COUNT` 环境变量
4. 编写单元测试

**验收标准**:
- 启动时自动清理旧会话
- 保留最近 10 个（可配置）
- 不影响当前活动会话

---

### 阶段 5: 非交互模式重构（低优先级）

**任务**:
1. 修改 `runNonInteractive()` 使用临时会话
2. 删除 CLI 参数相关代码
3. 更新帮助文本和文档
4. 编写回归测试

**验收标准**:
- 非交互模式正常执行查询
- 不创建会话文件
- 所有现有测试通过

---

## 11. 测试策略

### 11.1 单元测试

**SessionManager**:
- `listRecentSessions()` 排序和限制
- `forkSession()` 数据复制完整性
- `cleanOldSessions()` 保留正确数量
- `calculateStats()` 统计计算准确性
- `saveSession()` 包含 `stats` 和 `parentSessionId`

**Application**:
- `handleResumeCommand()` 会话切换逻辑
- `handleForkCommand()` 分叉和切换逻辑

### 11.2 集成测试

- 完整 `/resume` 工作流（列表 → 选择 → 加载 → 切换）
- 完整 `/fork` 工作流（分叉 → 保存原会话 → 切换）
- 启动时自动清理机制

### 11.3 终端交互测试

- 会话菜单显示正确
- 用户输入验证（有效/无效编号）
- Esc 取消操作
- 分叉标记显示

---

## 12. 潜在风险和注意事项

### 12.1 向后兼容性

**风险**: 旧会话文件缺少 `stats` 和 `parentSessionId`

**缓解**:
- 使用可选字段（`stats?: SessionStats`）
- 首次加载时容错，下次保存时补充
- 不破坏现有会话数据

### 12.2 性能影响

**风险**: 每次 `saveSession()` 计算 `stats` 遍历所有消息

**评估**:
- O(n) 复杂度，n 通常 < 100 条消息
- 仅在保存时计算，不是热路径
- 未来可优化为增量更新

### 12.3 CLI 参数移除

**风险**: 用户依赖 `--resume`, `--continue` 参数

**缓解**:
- 在 CHANGELOG 明确说明破坏性变更
- 提供迁移指南：改用 `/resume` Slash Command
- 考虑保留参数并显示废弃警告（可选）

### 12.4 会话切换状态一致性

**风险**: `StreamingQueryManager` 和 `SessionManager` 状态不同步

**缓解**:
- 切换前调用 `endSession()` 确保清理
- 切换后调用 `startSession()` 确保初始化
- 保存原会话确保持久化

---

## 13. 验收标准

### 功能验收

- [ ] `/resume` 显示最近 10 个会话的交互菜单
- [ ] 菜单显示会话编号、ID 前缀、时间、预览、统计
- [ ] 用户可通过数字或箭头键选择会话
- [ ] 支持 Esc 取消操作
- [ ] 会话成功恢复并切换
- [ ] `/fork` 成功分叉当前会话
- [ ] 分叉包含完整消息历史和上下文
- [ ] `parentSessionId` 正确设置
- [ ] 不复制 `sdkSessionId` 和 `snapshots`
- [ ] 分叉后自动切换到新会话
- [ ] 启动时自动清理，保留最近 10 个会话
- [ ] 非交互模式不创建会话文件

### 测试验收

- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试通过
- [ ] 终端交互测试通过
- [ ] 向后兼容性测试通过（旧会话仍可加载）

### 文档验收

- [ ] README 更新会话管理说明
- [ ] CHANGELOG 记录破坏性变更
- [ ] CLI 帮助文本准确
- [ ] 代码注释完整（遵循文件头文档规范）

---

## 14. 参考资料

- **Claude Agent SDK 文档**: https://platform.claude.com/docs/zh-CN/agent-sdk/sessions
- **项目 CLAUDE.md**: `.claude/CLAUDE.md`
- **现有实现**:
  - `src/core/SessionManager.ts` (lines 1-500)
  - `src/main.ts` (lines 398-466)
  - `src/ui/InteractiveUI.ts` (lines 421-472, `showRewindMenu` 参考)

---

## 15. 总结

这是一个聚焦、清晰的重构任务，目标是简化会话管理，专注于交互模式的核心功能。通过分层架构设计和职责分离，确保代码可维护性和可扩展性。关键改进包括：

1. **更好的用户体验**: 交互式会话选择菜单，替代手动输入 ID
2. **更简洁的架构**: 移除非交互模式的会话管理，避免混淆
3. **完整的会话分叉**: 支持从任意点创建对话分支
4. **自动化清理**: 无需用户干预，自动维护会话数量
5. **丰富的元数据**: 统计信息缓存，提升列表展示体验

实施时建议按 5 个阶段逐步推进，每个阶段完成后充分测试，确保功能正确和向后兼容。
