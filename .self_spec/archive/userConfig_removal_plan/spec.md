## MODIFIED Requirements（修改需求）

### Requirement: SessionManager - 移除userConfig字段和参数
SessionManager应当完全移除对userConfig的所有引用，所有配置统一通过projectConfig管理。

#### Scenario: SessionContext接口移除userConfig字段
- **GIVEN** 现有的SessionContext接口定义包含userConfig字段
- **WHEN** 开发者在SessionContext接口中移除userConfig: UserConfig字段定义
- **THEN** SessionContext接口不再包含userConfig字段
- **AND** 所有依赖SessionContext的代码不再访问userConfig属性

#### Scenario: createSession方法移除userConfig参数
- **GIVEN** createSession方法当前接受userConfig: UserConfig = {}参数
- **WHEN** 开发者移除createSession方法的userConfig参数
- **THEN** createSession方法签名变为createSession(workingDir: string, projectConfig: ProjectConfig)
- **AND** createSession实现中不再将userConfig赋值给context对象

#### Scenario: forkSession方法移除userConfig复制
- **GIVEN** forkSession方法当前对userConfig执行深拷贝操作
- **WHEN** 开发者从forkSession实现中移除userConfig的深拷贝逻辑
- **THEN** forkSession不再复制userConfig字段到新会话
- **AND** forkSession创建的子会话不包含userConfig数据

#### Scenario: loadSessionInternal方法简化
- **GIVEN** loadSessionInternal方法当前尝试加载userConfig字段
- **WHEN** 开发者修改loadSessionInternal直接初始化context，不处理userConfig
- **THEN** loadSessionInternal不读取或设置userConfig字段
- **AND** 旧会话文件中的userConfig字段被忽略（不报错也不处理）

### Requirement: MessageRouter - 直接使用projectConfig
MessageRouter应当直接从session.context获取projectConfig使用，不再执行配置合并操作。

#### Scenario: getEnabledToolNames方法直接使用projectConfig
- **GIVEN** getEnabledToolNames方法当前执行mergeConfigs(projectConfig, userConfig)合并操作
- **WHEN** 开发者修改方法直接使用session.context中的projectConfig
- **THEN** getEnabledToolNames不再调用mergeConfigs()方法
- **AND** 方法中使用const mergedConfig = projectConfig直接赋值

#### Scenario: buildQueryOptions方法直接使用projectConfig
- **GIVEN** buildQueryOptions方法当前合并projectConfig和userConfig后传递配置
- **WHEN** 开发者修改方法直接使用session.context.projectConfig
- **THEN** buildQueryOptions不再调用this.configManager.mergeConfigs()
- **AND** 所有配置都通过projectConfig传递，不存在userConfig引用

#### Scenario: MessageRouter移除配置合并依赖
- **GIVEN** MessageRouter当前依赖ConfigManager进行配置合并
- **WHEN** 开发者移除MessageRouter中所有mergeConfigs()调用
- **THEN** MessageRouter不再依赖ConfigManager进行配置处理
- **AND** MessageRouter只依赖session.context中的projectConfig数据

### Requirement: main.ts - 移除userConfig加载逻辑
main.ts应当移除所有userConfig加载和传递逻辑，直接传递projectConfig给createSession。

#### Scenario: getOrCreateSession方法移除userConfig参数
- **GIVEN** getOrCreateSession方法当前加载userConfig并传递给createSession
- **WHEN** 开发者修改方法直接传递projectConfig给createSession
- **THEN** getOrCreateSession不再调用loadUserConfig()方法
- **AND** 方法调用变为createSession(workingDir, projectConfig)

#### Scenario: 临时会话创建移除userConfig
- **GIVEN** 临时会话创建时设置tempSession.context.userConfig字段
- **WHEN** 开发者从临时会话创建逻辑中移除userConfig字段设置
- **THEN** 临时会话的context对象不包含userConfig字段
- **AND** 临时会话只包含workingDir和projectConfig

#### Scenario: showConfig方法简化
- **GIVEN** showConfig方法当前单独显示或处理userConfig配置
- **WHEN** 开发者修改方法直接使用ConfigManager获取merged配置
- **THEN** showConfig不再单独处理userConfig
- **AND** 配置显示逻辑简化为单一配置源

#### Scenario: 配置传递流程简化
- **GIVEN** main.ts当前执行配置合并逻辑后传递给createSession
- **WHEN** 开发者移除所有配置合并代码，直接传递projectConfig
- **THEN** createSession调用不再包含合并后的配置参数
- **AND** 配置传递流程简化为：main.ts → createSession(workingDir, projectConfig)

## REMOVED Requirements（移除需求）

### Requirement: userConfig概念完全移除
**Reason**（原因）：简化架构，消除冗余配置管理，统一通过projectConfig管理所有配置
**Migration**（迁移）：用户无需迁移，现有配置已通过ConfigManager合并到projectConfig中，会话重启后自动使用新配置

#### Scenario: 所有userConfig引用清理
- **GIVEN** 代码库中存在多处userConfig类型定义、参数和字段引用
- **WHEN** 开发者系统性地移除所有userConfig相关代码
- **THEN** 代码库中不再存在任何userConfig类型、参数或字段引用
- **AND** 所有配置访问统一通过projectConfig进行

#### Scenario: 配置合并逻辑移除
- **GIVEN** 代码中存在mergeConfigs(projectConfig, userConfig)等配置合并逻辑
- **WHEN** 开发者移除所有配置合并相关代码和调用
- **THEN** 代码中不再存在任何mergeConfigs()方法调用
- **AND** 配置获取统一通过projectConfig，无需合并操作

#### Scenario: UserConfig类型定义移除
- **GIVEN** 类型定义文件中存在UserConfig接口或类型定义
- **WHEN** 开发者从类型定义文件中移除UserConfig定义
- **THEN** 代码库中不再存在UserConfig类型定义
- **AND** 所有类型引用统一使用ProjectConfig类型

## RENAMED Requirements（重命名需求）
- FROM: `### Requirement: SessionManager配置管理`
- TO: `### Requirement: SessionManager - 移除userConfig字段和参数`
