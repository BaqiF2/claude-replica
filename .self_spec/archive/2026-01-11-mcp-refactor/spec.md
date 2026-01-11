# MCP重构规格说明

## ADDED Requirements（新增需求）

### Requirement: MCP配置单一源管理
系统必须仅从项目根目录的 .mcp.json 文件加载 MCP 配置，不再支持从 settings.json 的 mcpServers 字段加载。

#### Scenario: 从项目根目录加载MCP配置
- **GIVEN** 项目根目录存在有效的 .mcp.json 文件
- **WHEN** 应用启动并初始化 MCP 配置
- **THEN** 系统应当成功加载 .mcp.json 中的所有 MCP 服务器配置
- **AND** 不尝试从 settings.json 加载 mcpServers 字段

#### Scenario: 处理缺失的 .mcp.json 文件
- **GIVEN** 项目根目录不存在 .mcp.json 文件
- **WHEN** 应用启动并初始化 MCP 配置
- **THEN** 系统应当返回空的 MCP 服务器列表
- **AND** 不抛出错误或警告

#### Scenario: 处理旧的 settings.json 中的 mcpServers 配置
- **GIVEN** settings.json 文件中存在 mcpServers 字段
- **WHEN** 应用启动并加载配置
- **THEN** 系统应当忽略 settings.json 中的 mcpServers 配置
- **AND** 在启动时输出警告信息，提示用户迁移到 .mcp.json

### Requirement: MCP配置编辑命令
系统必须提供 `/mcp edit` 命令，允许用户直接在编辑器中打开和修改 .mcp.json 配置文件。

#### Scenario: 使用默认编辑器打开配置文件
- **GIVEN** 用户执行 `/mcp edit` 命令
- **AND** 系统环境变量 EDITOR 已设置为有效编辑器
- **WHEN** 命令执行
- **THEN** 系统应当使用 EDITOR 指定的编辑器打开 .mcp.json 文件
- **AND** 编辑器进程退出后返回控制权给应用

#### Scenario: 使用回退编辑器列表
- **GIVEN** 用户执行 `/mcp edit` 命令
- **AND** 系统环境变量 EDITOR 未设置
- **WHEN** 命令执行
- **THEN** 系统应当依次尝试默认编辑器列表（code, vim, nano, vi）
- **AND** 使用第一个可用的编辑器打开 .mcp.json 文件

#### Scenario: 创建缺失的配置文件
- **GIVEN** 项目根目录不存在 .mcp.json 文件
- **AND** 用户执行 `/mcp edit` 命令
- **WHEN** 命令执行
- **THEN** 系统应当创建空的 .mcp.json 文件，包含默认的 JSON 结构 `{ "mcpServers": {} }`
- **AND** 在编辑器中打开新创建的文件

### Requirement: MCP配置验证命令
系统必须提供 `/mcp validate` 命令，验证当前 .mcp.json 配置文件的有效性，而不实际连接 MCP 服务器。

#### Scenario: 验证有效的配置文件
- **GIVEN** .mcp.json 文件包含有效的 MCP 配置
- **WHEN** 用户执行 `/mcp validate` 命令
- **THEN** 系统应当返回验证成功消息
- **AND** 显示配置的服务器数量和传输类型统计

#### Scenario: 检测配置语法错误
- **GIVEN** .mcp.json 文件包含无效的 JSON 语法
- **WHEN** 用户执行 `/mcp validate` 命令
- **THEN** 系统应当返回语法错误信息
- **AND** 指出错误的行号和位置

#### Scenario: 检测配置结构错误
- **GIVEN** .mcp.json 文件的 JSON 语法正确但结构不符合 MCP 规范
- **WHEN** 用户执行 `/mcp validate` 命令
- **THEN** 系统应当返回结构错误信息
- **AND** 指出不符合规范的字段和原因

### Requirement: MCP服务器配置显示
系统必须提供 `/mcp` 和 `/mcp list` 命令，显示所有已配置 MCP 服务器的静态配置信息。

#### Scenario: 显示所有服务器的配置信息
- **GIVEN** .mcp.json 中配置了多个 MCP 服务器
- **WHEN** 用户执行 `/mcp` 或 `/mcp list` 命令
- **THEN** 系统应当显示每个服务器的名称、传输类型和配置详情
- **AND** 使用清晰的格式化输出

#### Scenario: 显示空配置列表
- **GIVEN** .mcp.json 文件不存在或为空
- **WHEN** 用户执行 `/mcp` 命令
- **THEN** 系统应当显示"无已配置的 MCP 服务器"消息
- **AND** 提示使用 `/mcp edit` 添加配置

### Requirement: MCPService业务逻辑层
系统必须实现 MCPService 类，作为 UI 层和 MCPManager 之间的业务逻辑中间层。

#### Scenario: 获取服务器配置列表
- **GIVEN** .mcp.json 中配置了多个 MCP 服务器
- **WHEN** 调用 MCPService.listServerConfig(workingDir)
- **THEN** 系统应当返回所有服务器的配置信息
- **AND** 包括服务器名称、传输类型和配置详情

#### Scenario: 验证配置有效性
- **GIVEN** 用户通过编辑器修改了 .mcp.json 文件
- **WHEN** 调用 MCPService.validateConfig(workingDir)
- **THEN** 系统应当调用 MCPManager.validateConfig() 验证每个服务器配置
- **AND** 返回验证结果，包括错误的服务器名称和具体错误信息

#### Scenario: 打开配置文件编辑
- **GIVEN** 用户需要修改 MCP 配置
- **WHEN** 调用 MCPService.editConfig(workingDir)
- **THEN** 系统应当获取配置文件路径并启动编辑器
- **AND** 如果配置文件不存在，先创建默认配置

### Requirement: MCPManager精简和重构
系统必须精简 MCPManager 类，移除未使用的方法，新增项目根目录配置加载支持。

#### Scenario: 从项目根目录加载配置
- **GIVEN** 工作目录为 /project/subdir
- **WHEN** 调用 MCPManager.loadFromProjectRoot(workingDir)
- **THEN** 系统应当向上查找 .git 目录确定项目根目录
- **AND** 在项目根目录查找 .mcp.json 文件
- **AND** 返回加载的 MCP 服务器配置

#### Scenario: 获取配置文件路径
- **GIVEN** 项目根目录为 /project
- **WHEN** 调用 MCPManager.getConfigPath(workingDir)
- **THEN** 系统应当返回 /project/.mcp.json

#### Scenario: 移除运行时修改方法
- **GIVEN** MCPManager 类的重构版本
- **WHEN** 查看公开 API
- **THEN** 以下方法应当不存在：addServer(), removeServer(), merge(), saveToFile(), clear(), filterByTransport(), tryLoadFromPaths(), fromJSON(), toJSON()

## MODIFIED Requirements（修改需求）

无修改的需求（全新功能实现）

## REMOVED Requirements（移除需求）

### Requirement: settings.json中的mcpServers配置支持
**Reason**（原因）：简化配置管理，采用单一配置源（.mcp.json）
**Migration**（迁移）：
1. 将 settings.json 中的 `mcpServers` 字段内容复制到项目根目录的 `.mcp.json` 文件中
2. 从 settings.json 中删除 `mcpServers` 字段
3. 应用启动时会检测并警告旧配置，但不会自动迁移

### Requirement: MCPManager的运行时配置修改功能
**Reason**（原因）：通过文件编辑器直接修改配置文件更加直观和安全
**Migration**（迁移）：
1. 使用 `/mcp edit` 命令打开配置文件
2. 手动编辑 JSON 配置
3. 重新加载应用以应用更改

## RENAMED Requirements（重命名需求）

无重命名的需求
