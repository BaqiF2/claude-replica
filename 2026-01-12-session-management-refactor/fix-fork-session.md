# Fork会话分支功能修复计划

## 问题描述

### 用户反馈
- 执行`/fork`命令后，新会话创建成功，但无法从原会话分支
- 终端输出显示：`resume: no sessionId: undefined forkSession=false`
- 这表明forkSession标志和resume参数没有正确传递给SDK

### 根本原因分析

根据官方示例（https://platform.claude.com/docs/zh-CN/agent-sdk/sessions#），fork的正确流程应该是：

```typescript
// Fork the session to try a different approach
const forkedResponse = query({
  prompt: "Now let's redesign this as a GraphQL API instead",
  options: {
    resume: sessionId,
    forkSession: true,  // Creates a new session ID
    model: "claude-sonnet-4-5"
  }
})
```

**当前错误流程**：
1. 执行`/fork`命令 → 调用`sessionManager.saveSession(forkedSession)` ❌（太早！）
2. 设置forkSession标志
3. 用户发送消息 → SDK收到`resume: undefined, forkSession: false`

**正确流程应该是**：
1. 执行`/fork`命令 → 只创建内存中的forkedSession，**不保存**
2. 设置`forkSession: true`和`resume: 父sdkSessionId`
3. 用户发送消息 → SDK收到正确的参数
4. SDK返回新sessionId → 在`onSessionSave`回调中自动保存

## 修复方案：方案B（简化）

### 原则
- 最小修改：只修改2个文件
- 遵循SDK官方示例
- 不修改Session接口和持久化逻辑
- 使用临时变量存储fork参数

### 修改清单

#### 1. 修改 `src/main.ts` - handleForkCommand方法

**位置**：第626-664行

**关键修改**：
- ✅ 删除过早的`saveSession(forkedSession)`调用
- ✅ 获取父会话的sdkSessionId
- ✅ 调用`setForkSession(true)`
- ✅ 调用`setParentSdkSessionId(parentSdkSessionId)`

**完整修改代码**：

```typescript
private async handleForkCommand(): Promise<void> {
  // 验证是否在交互模式中
  if (!this.ui) {
    console.log('Warning: /fork command is only available in interactive mode');
    return;
  }

  // 获取当前活动会话
  const activeSession = this.streamingQueryManager?.getActiveSession();

  // 如果没有活动会话，显示提示并返回
  if (!activeSession || !activeSession.session) {
    console.log('No active session to fork');
    return;
  }

  try {
    // 获取父会话的SDK会话ID
    const parentSdkSessionId = activeSession.session.sdkSessionId;

    // 分叉当前会话（只创建内存中的会话对象，不保存）
    const forkedSession = await this.sessionManager.forkSession(activeSession.session.id);

    // 不要立即保存！只有在获得新的sdkSessionId后才保存
    // await this.sessionManager.saveSession(forkedSession); // ❌ 删除这行

    // 结束当前会话
    this.streamingQueryManager?.endSession();

    // 切换到新的分叉会话
    this.streamingQueryManager?.startSession(forkedSession);

    // 设置forkSession标志
    this.streamingQueryManager?.setForkSession(true);

    // 保存父SDK会话ID（用于resume参数）
    if (parentSdkSessionId) {
      this.streamingQueryManager?.setParentSdkSessionId(parentSdkSessionId);
    }

    // 显示成功消息
    console.log(
      `\nForked session: ${forkedSession.id} (from parent: ${forkedSession.parentSessionId}) 🔀`
    );
  } catch (error) {
    console.error(
      `Failed to fork session: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
```

**对比**：

| 修改前 | 修改后 |
|--------|--------|
| `await this.sessionManager.saveSession(forkedSession);` | 删除 |
| 无 | `const parentSdkSessionId = activeSession.session.sdkSessionId;` |
| 无 | `this.streamingQueryManager?.setForkSession(true);` |
| 无 | `if (parentSdkSessionId) { this.streamingQueryManager?.setParentSdkSessionId(parentSdkSessionId); }` |

#### 2. 修改 `src/sdk/StreamingQueryManager.ts`

##### 2.1 添加私有属性

**位置**：第266行（forkSession属性附近）

**修改内容**：

```typescript
private forkSession: boolean = false;
private parentSdkSessionIdForFork?: string;  // 新增：fork时的父SDK会话ID
```

##### 2.2 添加setParentSdkSessionId方法

**位置**：第345行（setForkSession方法后）

**修改内容**：

```typescript
setForkSession(fork: boolean): void {
  this.forkSession = fork;
}

// 新增：设置fork时的父SDK会话ID
setParentSdkSessionId(sessionId: string): void {
  this.parentSdkSessionIdForFork = sessionId;
}
```

##### 2.3 修改startExecution方法中的resume逻辑

**位置**：第620-630行

**修改内容**：

```typescript
// 修改resume逻辑：当forkSession为true时，使用父SDK会话ID作为resume
const resumeSessionId = this.forkSession && this.parentSdkSessionIdForFork
  ? this.parentSdkSessionIdForFork  // fork时使用父SDK会话ID
  : this.activeSession.session.sdkSessionId;  // 普通情况使用当前会话ID

const sdkOptions = {
  // ... 其他选项 ...
  resume: resumeSessionId,  // 传递正确的resume参数
  forkSession: this.forkSession,  // 传递forkSession标志
  // ... 其他选项 ...
};
```

**对比**：

| 修改前 | 修改后 |
|--------|--------|
| `resume: sessionId,` | `resume: resumeSessionId,` |
| 无 | `const resumeSessionId = this.forkSession && this.parentSdkSessionIdForFork ? this.parentSdkSessionIdForFork : this.activeSession.session.sdkSessionId;` |

##### 2.4 清理临时变量（可选）

**位置**：startExecution方法的最后（第669行后）

**修改内容**：

```typescript
// 恢复空闲状态
if (this.activeSession) {
  this.activeSession.state = 'idle';
}

// 清理临时变量
this.parentSdkSessionIdForFork = undefined;
```

## 工作流程对比

### 修改前（错误）

```
1. 用户执行 /fork
   ↓
2. [Main] handleForkCommand()
   - 创建 forkedSession
   - await saveSession(forkedSession)  ❌ 太早！
   ↓
3. [Main] setForkSession(true)
   ↓
4. 用户发送消息
   ↓
5. [StreamingQueryManager] startExecution()
   - resume: undefined  ❌ 错误！
   - forkSession: false  ❌ 错误！
   ↓
6. [SDK] 创建全新会话（不是fork）
```

### 修改后（正确）

```
1. 用户执行 /fork
   ↓
2. [Main] handleForkCommand()
   - 创建 forkedSession
   - 不保存！  ✅ 正确！
   ↓
3. [Main] setForkSession(true)
   ↓
4. [Main] setParentSdkSessionId('1996a8fb-5c50-4b07-b3f3-ee574428e33c')
   ↓
5. 用户发送消息
   ↓
6. [StreamingQueryManager] startExecution()
   - resume: '1996a8fb-5c50-4b07-b3f3-ee574428e33c'  ✅ 正确！
   - forkSession: true  ✅ 正确！
   ↓
7. [SDK] 返回init消息
   - session_id: 'a1b2c3d4-...'  ✅ 新ID
   ↓
8. [StreamingQueryManager] onSessionSave()
   - await saveSession(forkedSession)  ✅ 现在保存！
   ↓
9. [SessionManager] 保存会话
   - sdkSessionId: 'a1b2c3d4-...'  ✅ 新ID
   - parentSessionId: 'session-mkc28k1b-...'  ✅ 父ID
```

## 预期结果

### 终端输出对比

**修改前**：
```
New Query instance created:
              (resume: no) sessionId: undefined forkSession=false  ❌
```

**修改后**：
```
New Query instance created:
              (resume: yes) sessionId: 1996a8fb-5c50-4b07-b3f3-ee574428e33c forkSession=true  ✅
```

### 验证清单

- [ ] 执行`/fork`命令
- [ ] 检查控制台输出显示`forkSession=true`
- [ ] 检查控制台输出显示`resume=yes`和正确的sessionId
- [ ] 验证新会话能正确分支自原会话
- [ ] 验证新会话的消息历史包含原会话的内容
- [ ] 验证原会话保持不变

## 测试

### 运行现有测试

```bash
npm test tests/integration/fork-command.test.ts
npm test tests/integration/resume-command.test.ts
```

### 手动测试步骤

1. 启动交互模式：`npm run start`
2. 发送消息创建会话
3. 执行`/fork`命令
4. 发送消息到forked会话
5. 检查控制台输出确认fork参数正确

## 文件清单

| 文件 | 行数 | 修改类型 | 说明 |
|------|------|----------|------|
| `src/main.ts` | 647行 | 删除 | 删除过早的saveSession调用 |
| `src/main.ts` | 656-661行 | 新增 | 添加参数设置逻辑 |
| `src/sdk/StreamingQueryManager.ts` | 267行 | 新增 | 添加parentSdkSessionIdForFork属性 |
| `src/sdk/StreamingQueryManager.ts` | 348-351行 | 新增 | 添加setParentSdkSessionId方法 |
| `src/sdk/StreamingQueryManager.ts` | 626行 | 修改 | 修改resume逻辑 |
| `src/sdk/StreamingQueryManager.ts` | 669行 | 新增 | 清理临时变量 |

**总计**：2个文件，~15行新增，~3行删除，~1行修改

## 风险评估

- **低风险**：所有修改都是向后兼容的
- **临时变量**：`parentSdkSessionIdForFork`存储在内存中，进程重启后会丢失（可接受）
- **测试覆盖**：现有测试应该能捕获回归问题
- **无副作用**：不影响现有resume功能

## 优势

1. **最小修改**：只修改2个文件，总共~18行代码
2. **遵循官方**：完全按照SDK的fork流程
3. **逻辑清晰**：参数传递链短，易于理解
4. **无持久化**：不需要修改Session接口和磁盘格式
5. **可维护**：代码简洁，易于维护和调试

## 参考资源

- [Claude Agent SDK官方文档 - 会话管理](https://platform.claude.com/docs/zh-CN/agent-sdk/sessions#)
- 现有代码：`tests/integration/fork-command.test.ts`
- 现有代码：`tests/integration/resume-command.test.ts`
