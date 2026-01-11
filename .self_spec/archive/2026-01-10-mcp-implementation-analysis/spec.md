# MCP Configuration Field Correction Specification

**Change ID:** 2026-01-10-mcp-implementation-analysis
**Version:** 1.0

## ADDED Requirements

### Requirement: MCP Configuration Backward Compatibility
系统必须提供向后兼容性支持，允许现有用户使用旧的 `transport` 字段格式，同时引导他们迁移到新的 `type` 字段。

#### Scenario: Legacy transport field auto-conversion
- **GIVEN** 用户配置中使用了旧的 `transport` 字段（如 `{ "transport": "sse", "url": "..." }`）
- **WHEN** MCPManager 加载该配置时
- **THEN** 系统必须自动将 `transport` 字段转换为 `type` 字段
- **AND** 系统必须在控制台输出弃用警告，包含迁移指引

#### Scenario: Deprecation warning message format
- **GIVEN** 用户配置中使用了 `transport` 字段
- **WHEN** 配置被加载和规范化时
- **THEN** 警告消息必须包含 "DEPRECATED" 标识
- **AND** 警告消息必须说明应使用 "type" 替代 "transport"
- **AND** 警告消息必须说明该支持将在 v2.0 中移除

#### Scenario: New type field takes precedence
- **GIVEN** 用户配置中同时存在 `transport` 和 `type` 字段
- **WHEN** MCPManager 加载该配置时
- **THEN** 系统必须优先使用 `type` 字段的值
- **AND** 系统必须忽略 `transport` 字段

## MODIFIED Requirements

### Requirement: MCP SSE Server Configuration Interface
系统必须使用 `type` 字段来标识 SSE 类型的 MCP 服务器配置，以符合 Claude Agent SDK 官方规范。

#### Scenario: SSE server configuration with correct field
- **GIVEN** 用户提供 SSE MCP 服务器配置
- **WHEN** 配置格式为 `{ "type": "sse", "url": "https://api.example.com/mcp/sse" }`
- **THEN** 系统必须正确识别该配置为 SSE 类型服务器
- **AND** 系统必须成功创建 SSE 连接

#### Scenario: SSE server configuration with optional headers
- **GIVEN** 用户提供带 headers 的 SSE MCP 服务器配置
- **WHEN** 配置格式为 `{ "type": "sse", "url": "...", "headers": { "Authorization": "Bearer ${TOKEN}" } }`
- **THEN** 系统必须正确解析 headers 配置
- **AND** 系统必须展开环境变量引用

### Requirement: MCP HTTP Server Configuration Interface
系统必须使用 `type` 字段来标识 HTTP 类型的 MCP 服务器配置，以符合 Claude Agent SDK 官方规范。

#### Scenario: HTTP server configuration with correct field
- **GIVEN** 用户提供 HTTP MCP 服务器配置
- **WHEN** 配置格式为 `{ "type": "http", "url": "https://api.example.com/mcp" }`
- **THEN** 系统必须正确识别该配置为 HTTP 类型服务器
- **AND** 系统必须成功创建 HTTP 连接

#### Scenario: HTTP server configuration with optional headers
- **GIVEN** 用户提供带 headers 的 HTTP MCP 服务器配置
- **WHEN** 配置格式为 `{ "type": "http", "url": "...", "headers": { "X-API-Key": "${API_KEY}" } }`
- **THEN** 系统必须正确解析 headers 配置
- **AND** 系统必须展开环境变量引用

### Requirement: MCP Configuration Validation
系统必须正确验证 MCP 服务器配置，错误消息必须引用正确的字段名 `type`。

#### Scenario: Invalid type value validation
- **GIVEN** 用户提供的 MCP 配置包含无效的 `type` 值（如 `"type": "invalid"`）
- **WHEN** CollaborationManager 验证该配置时
- **THEN** 验证必须失败
- **AND** 错误消息必须指向 `mcpServers.{name}.type` 路径
- **AND** 错误消息必须说明 "Invalid type value: invalid"

#### Scenario: Missing type field for non-stdio server
- **GIVEN** 用户提供的 MCP 配置缺少 `type` 字段且包含 `url` 属性
- **WHEN** 系统验证该配置时
- **THEN** 验证必须失败
- **AND** 错误消息必须提示需要 `type` 字段

### Requirement: MCP Server Info Interface
ServerInfo 接口必须使用 `type` 字段来存储传输类型信息。

#### Scenario: ServerInfo stores transport type correctly
- **GIVEN** MCPManager 创建了一个 ServerInfo 对象
- **WHEN** 该对象表示 SSE 或 HTTP 服务器时
- **THEN** 传输类型必须存储在 `type` 字段中
- **AND** 不得存在 `transport` 字段

## REMOVED Requirements

*无需移除的需求*

## RENAMED Requirements

*无需重命名的需求*
