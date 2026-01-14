# userConfig参数移除计划

## 目标
从应用中完全移除userConfig概念，所有配置统一通过ConfigManager管理，简化会话管理。

## 方案概述
- **选型**: 激进方案 - 完全移除userConfig
- **核心变更**:
  - SessionContext接口移除userConfig字段
  - MessageRouter不依赖userConfig，直接使用ConfigManager
  - 移除所有向后兼容逻辑
- **配置管理**: 所有配置统一从ConfigManager获取merged配置

## 实施步骤

### 阶段1: 修改SessionManager (核心文件)
**目标文件**: `/Users/wuwenjun/conductor/workspaces/claude-replica/bordeaux/src/core/SessionManager.ts`

1. **修改SessionContext接口** (第95-100行)
   - 从接口中移除`userConfig: UserConfig`字段

2. **更新createSession方法** (第255-279行)
   - 移除`userConfig: UserConfig = {}`参数
   - 从context对象中移除userConfig赋值

3. **更新forkSession方法** (第517-523行)
   - 移除对userConfig的深拷贝操作
   - 简化context对象结构

4. **简化loadSessionInternal** (第377-388行)
   - 直接初始化context，不加载userConfig字段
   - 如果会话文件包含userConfig，让其保留（不处理）

### 阶段2: 修改MessageRouter (配置获取)
**目标文件**: `/Users/wuwenjun/conductor/workspaces/claude-replica/bordeaux/src/core/MessageRouter.ts`

1. **更新getEnabledToolNames方法** (第423-474行)
   - 直接从`session.context`获取`projectConfig`
   - **直接使用projectConfig，不需要合并userConfig**
   - 示例：`const mergedConfig = projectConfig` （替换原有合并逻辑）

2. **更新buildQueryOptions方法** (第641-689行)
   - 直接使用`session.context.projectConfig`
   - 不需要调用`this.configManager.mergeConfigs()`
   - **所有配置都通过projectConfig传递**

3. **核心原则**
   - MessageRouter只依赖session.context中的projectConfig
   - 不需要ConfigManager参与配置合并
   - 配置统一在main.ts或创建会话的地方合并

### 阶段3: 修改main.ts (调用点更新)
**目标文件**: `/Users/wuwenjun/conductor/workspaces/claude-replica/bordeaux/src/main.ts`

1. **更新getOrCreateSession方法** (第362-369行)
   - 移除userConfig加载和传递
   - 直接调用`createSession(workingDir, projectConfig)`

2. **更新临时会话创建** (第333-346行)
   - 从tempSession.context中移除userConfig字段

3. **简化配置传递** (第366-368行)
   - **不需要合并配置**，直接传递projectConfig给createSession
   - `createSession(workingDir, projectConfig)` 而非 `createSession(workingDir, projectConfig, userConfig)`
   - MessageRouter直接使用projectConfig，**不存在合并逻辑**

4. **移除Config相关代码** (第145-152行, 第505-511行)
   - 不再需要单独显示或处理userConfig
   - showConfig方法：直接使用ConfigManager获取merged配置

### 阶段4: 更新测试文件
**目标文件列表**:
- `/Users/wuwenjun/conductor/workspaces/claude-replica/bordeaux/tests/unit/core/SessionManager.test.ts`
- `/Users/wuwenjun/conductor/workspaces/claude-replica/bordeaux/tests/unit/core/MessageRouter.test.ts`
- `/Users/wuwenjun/conductor/workspaces/claude-replica/bordeaux/tests/unit/main.test.ts`

**修改内容**:
- 移除所有createSession调用中的userConfig参数
- 更新预期结果，不再检查userConfig字段
- 验证MessageRouter直接使用ConfigManager获取配置

## 核心技术决策

### 1. 配置获取模式
```typescript
// MessageRouter中的实现
const { projectConfig } = session.context;
// 直接使用projectConfig，无任何合并
const mergedConfig = projectConfig; // 替换原有合并逻辑
```

### 2. 配置管理原则
- **完全移除userConfig概念，不进行任何合并**
- MessageRouter只使用session.context中的projectConfig
- 会话中只持久化projectConfig
- main.ts直接传递projectConfig给createSession

### 3. 配置传递流程
```
main.ts → createSession(workingDir, projectConfig)
                ↓
MessageRouter.getEnabledToolNames(projectConfig) → 直接使用projectConfig
```

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 配置在会话中静态 | 低 | 合并逻辑在创建会话前完成，符合预期 |
| 现有会话失效 | 无 | 不再处理旧会话，删除后重新创建 |
| 代码复杂性 | 无 | 移除userConfig逻辑，MessageRouter代码更简单 |

## 验证策略

### 1. 单元测试
- [ ] SessionManager.createSession不再接受userConfig参数
- [ ] SessionManager.forkSession不复制userConfig
- [ ] MessageRouter.getEnabledToolNames直接使用projectConfig（无合并）
- [ ] MessageRouter.buildQueryOptions直接使用projectConfig（无合并）

### 2. 功能测试
- [ ] 直接传递projectConfig → 会话中使用projectConfig
- [ ] 修改配置文件 → 重新创建会话使用新配置
- [ ] 权限模式切换正常
- [ ] 工具权限检查正确（基于projectConfig）

### 3. 配置传递验证
- [ ] main.ts直接传递projectConfig，无合并逻辑
- [ ] MessageRouter直接使用projectConfig，无mergeConfigs()调用
- [ ] 不存在任何userConfig引用

### 3. 回归测试
- [ ] 基本会话功能正常
- [ ] 交互模式工作正常
- [ ] 非交互模式工作正常

## 关键文件清单

**核心修改文件**:
1. `src/core/SessionManager.ts` - 移除userConfig字段
2. `src/core/MessageRouter.ts` - 直接使用ConfigManager
3. `src/main.ts` - 移除userConfig加载逻辑

**测试文件**:
4. `tests/unit/core/SessionManager.test.ts`
5. `tests/unit/core/MessageRouter.test.ts`
6. `tests/unit/main.test.ts`

## 预期收益

1. **简化架构**: 移除userConfig概念，统一通过projectConfig管理
2. **消除冗余**: 会话中不持久化userConfig数据
3. **消除复杂性**: 移除所有配置合并逻辑，代码更简洁
4. **代码简化**: MessageRouter直接使用projectConfig，无任何合并

## 注意事项

- 无需处理向后兼容，旧会话直接删除
- **完全移除配置合并逻辑**，不使用mergeConfigs()
- 确保MessageRouter中不存在任何mergeConfigs()调用
- 确保所有userConfig参数传递都被移除
- 确保所有userConfig相关代码都被清理