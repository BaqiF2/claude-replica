# SelfSpec: SDK 文件检查点集成

## ADDED Requirements

### Requirement: SDK 文件检查点管理器
系统必须提供 CheckpointManager 类来管理基于 Claude Agent SDK 的文件检查点功能。

#### Scenario: 初始化检查点管理器
- **GIVEN** 一个会话目录和会话 ID
- **WHEN** CheckpointManager 被初始化时
- **THEN** 应当创建 checkpoints 子目录
- **AND** 应当从 metadata.json 加载现有检查点元数据
- **AND** 应当按时间戳倒序排列检查点列表

#### Scenario: 捕获用户消息检查点
- **GIVEN** 一个用户消息的 UUID、描述文本和 SDK 会话 ID
- **WHEN** captureCheckpoint() 被调用时
- **THEN** 应当创建新的检查点元数据记录
- **AND** 应当将检查点添加到列表顶部
- **AND** 应当将元数据持久化到 metadata.json
- **AND** 当检查点数量超过限制时,应当删除最旧的检查点

#### Scenario: 列出可用检查点
- **GIVEN** 已存储多个检查点元数据
- **WHEN** listCheckpoints() 被调用时
- **THEN** 应当返回按时间倒序排列的检查点数组
- **AND** 每个检查点应当包含 id、timestamp、description 和 sessionId

#### Scenario: 恢复文件到检查点状态
- **GIVEN** 一个有效的检查点 ID 和活跃的 Query 实例
- **WHEN** restoreCheckpoint() 被调用时
- **THEN** 应当调用 queryInstance.rewindFiles(checkpointId)
- **AND** 当检查点数据不存在时,应当抛出描述性错误
- **AND** 当 Query 实例无效时,应当拒绝恢复操作

---

### Requirement: 自动捕获用户消息检查点
系统必须在 StreamingQueryManager 中自动捕获每个用户消息作为检查点。

#### Scenario: 处理用户消息并捕获检查点
- **GIVEN** 启用了 checkpointManager
- **WHEN** 收到 type='user' 的 SDK 消息且包含 uuid
- **THEN** 应当提取用户消息内容作为描述
- **AND** 应当调用 checkpointManager.captureCheckpoint()
- **AND** 应当使用 uuid、description 和 sdkSessionId 作为参数

#### Scenario: 智能提取检查点描述
- **GIVEN** 一个用户消息对象
- **WHEN** 消息内容为字符串时
- **THEN** 应当截取前 80 字符并移除换行符
- **WHEN** 消息内容为多内容块数组时
- **THEN** 应当提取第一个文本块的前 80 字符
- **WHEN** 无法提取文本时
- **THEN** 应当使用时间戳格式 "Checkpoint at HH:MM:SS"

#### Scenario: 提供 Query 实例访问
- **GIVEN** StreamingQueryManager 持有活跃的 queryInstance
- **WHEN** getQueryInstance() 被调用时
- **THEN** 应当返回当前的 Query 实例对象
- **AND** 当无活跃会话时,应当返回 null

---

### Requirement: SDK 检查点配置集成
系统必须在 SDKQueryExecutor 中正确配置 SDK 的文件检查点选项。

#### Scenario: 启用文件检查点并配置 extraArgs
- **GIVEN** enableFileCheckpointing 配置项被设置为 true
- **WHEN** mapToSDKOptions() 映射配置时
- **THEN** 应当设置 sdkOptions.enableFileCheckpointing = true
- **AND** 应当在 extraArgs 中添加 'replay-user-messages': null
- **AND** 应当保留现有的其他 extraArgs 配置项

---

### Requirement: 交互式检查点恢复界面
系统必须在 InteractiveRunner 中提供用户友好的检查点恢复交互界面。

#### Scenario: 双击 ESC 触发检查点菜单
- **GIVEN** 用户在交互模式下双击 ESC (300ms 内)
- **WHEN** handleRewind() 被触发时
- **THEN** 应当检查 checkpointManager 是否已启用
- **AND** 应当获取检查点列表并转换为 UI 快照格式
- **AND** 应当调用 ui.showRewindMenu() 显示选择菜单

#### Scenario: 用户选择检查点并恢复
- **GIVEN** 用户从菜单中选择了一个检查点
- **WHEN** checkpointManager.restoreCheckpoint() 被调用时
- **THEN** 应当从 streamingQueryManager 获取 Query 实例
- **AND** 应当调用 SDK 的 rewindFiles() 方法
- **AND** 应当在成功时显示绿色成功消息
- **AND** 应当在失败时显示红色错误消息并记录日志

#### Scenario: 检查点功能未启用时的提示
- **GIVEN** checkpointManager 为 null
- **WHEN** 用户双击 ESC 时
- **THEN** 应当显示警告消息 "Checkpoint feature not enabled"
- **AND** 应当立即返回,不显示菜单

#### Scenario: 无可用检查点时的提示
- **GIVEN** checkpointManager 已启用但无检查点
- **WHEN** 用户双击 ESC 时
- **THEN** 应当显示警告消息 "No checkpoints available"
- **AND** 应当立即返回,不显示菜单

---

### Requirement: 检查点配置管理
系统必须支持通过环境变量和配置文件管理检查点功能。

#### Scenario: 加载检查点配置选项
- **GIVEN** ProjectConfig 接口定义
- **WHEN** 配置被加载时
- **THEN** 应当支持 enableFileCheckpointing 布尔选项 (默认 true)
- **AND** 应当支持 checkpointKeepCount 数字选项 (默认 10)

#### Scenario: 环境变量与配置不一致时的警告
- **GIVEN** config.enableFileCheckpointing = true
- **WHEN** 环境变量 CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING 未设置
- **THEN** 应当在控制台显示警告消息
- **AND** 应当提示用户设置环境变量 CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1

---

### Requirement: 依赖注入架构调整
系统必须在 Application、RunnerFactory 和 InteractiveRunner 中完成从 RewindManager 到 CheckpointManager 的依赖切换。

#### Scenario: Application 初始化 CheckpointManager
- **GIVEN** 环境变量 CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1
- **WHEN** Application 初始化时
- **THEN** 应当创建 CheckpointManager 实例 (会话开始后)
- **AND** 应当调用 checkCheckpointEnvironment() 验证配置
- **AND** 应当将 checkpointManager 传递给 RunnerFactory

#### Scenario: RunnerFactory 创建交互式运行器
- **GIVEN** checkpointManager 实例
- **WHEN** createInteractiveRunner() 被调用时
- **THEN** 应当将 checkpointManager 传递给 InteractiveRunner 构造函数
- **AND** 应当移除所有 rewindManager 相关引用

#### Scenario: InteractiveRunner 依赖 CheckpointManager
- **GIVEN** checkpointManager 作为构造函数参数
- **WHEN** InteractiveRunner 被实例化时
- **THEN** 应当存储 checkpointManager 引用
- **AND** 应当将 checkpointManager 传递给 StreamingQueryManager
- **AND** 应当在 handleRewind() 中使用 checkpointManager

---

## REMOVED Requirements

### Requirement: RewindManager 快照管理系统
**Reason**: 使用 Claude Agent SDK 的原生文件检查点功能替代自定义快照系统。

**Migration**:
- 删除 `src/rewind/RewindManager.ts` 和 `src/rewind/index.ts`
- 删除 `tests/rewind/RewindManager.test.ts`
- 从 `main.ts`、`RunnerFactory.ts`、`InteractiveRunner.ts` 中移除所有 RewindManager 导入和引用
- 旧快照数据保留在 `workingDir/.claude/snapshots/` 但不再通过 UI 访问

---

## MODIFIED Requirements

无修改现有需求。本规格完全新增功能并移除旧系统。

---

## RENAMED Requirements

无重命名需求。
