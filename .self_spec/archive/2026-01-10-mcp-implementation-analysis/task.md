# 实施计划：MCP 配置字段修正

## 概述

将 MCP SSE/HTTP 服务器配置中的 `transport` 字段修正为官方标准的 `type` 字段，同时实现向后兼容性支持，确保现有用户配置平滑迁移。

## 任务

### 阶段 1：核心类型定义修改

- [x] 1. 更新 MCPManager.ts 接口定义
  - 修改 `McpSSEServerConfig` 接口：`transport: 'sse'` → `type: 'sse'`
  - 修改 `McpHttpServerConfig` 接口：`transport: 'http'` → `type: 'http'`
  - 更新 `ServerInfo` 接口中的字段名
  - 更新 JSDoc 注释
  - _Requirements: MCP SSE Server Configuration Interface, MCP HTTP Server Configuration Interface, MCP Server Info Interface_

- [x] 2. 更新 SDKConfigLoader.ts 接口定义
  - 同步修改 MCP 相关接口定义以保持一致性
  - _Requirements: MCP SSE Server Configuration Interface, MCP HTTP Server Configuration Interface_

- [x] 3. 更新 CollaborationManager.ts 验证逻辑
  - 修改验证错误路径：`mcpServers.${name}.transport` → `mcpServers.${name}.type`
  - 修改错误消息：`Invalid transport type` → `Invalid type value`
  - _Requirements: MCP Configuration Validation_

### 阶段 2：向后兼容性实现

- [x] 4. 实现配置自动转换逻辑
  - 在 MCPManager 中添加 `normalizeConfig()` 方法
  - 检测 `transport` 字段并自动转换为 `type`
  - 处理同时存在两个字段的情况（优先使用 `type`）
  - _Requirements: MCP Configuration Backward Compatibility_

- [x] 5. 添加弃用警告机制
  - 使用 `console.warn()` 输出弃用警告
  - 警告内容包含：DEPRECATED 标识、迁移指引、v2.0 移除提示
  - _Requirements: MCP Configuration Backward Compatibility_

### 阶段 3：测试更新

- [x] 6. 更新 MCPManager.test.ts 测试用例
  - 更新所有测试配置中的 `transport` 为 `type`
  - 添加向后兼容转换测试
  - 添加弃用警告输出测试
  - 添加同时存在两字段时的优先级测试
  - _Requirements: MCP Configuration Backward Compatibility, MCP SSE Server Configuration Interface, MCP HTTP Server Configuration Interface_

- [x] 7. 运行测试验证
  - 执行 `npm run build` 验证编译通过
  - 执行 `npm test` 验证所有测试通过
  - _Requirements: 全部需求验证_

### 阶段 4：文档更新

- [x] 8. 更新 docs/zh/API.md 中文文档
  - 搜索替换所有 `"transport": "sse"` 为 `"type": "sse"`
  - 搜索替换所有 `"transport": "http"` 为 `"type": "http"`
  - 添加迁移说明
  - _Requirements: MCP SSE Server Configuration Interface, MCP HTTP Server Configuration Interface_

- [x] 9. 更新 docs/en/API.md 英文文档
  - 同步更新所有配置示例
  - 添加 migration note
  - _Requirements: MCP SSE Server Configuration Interface, MCP HTTP Server Configuration Interface_

### 阶段 5：最终验证

- [x] 10. 端到端功能验证
  - 使用新格式 `type` 字段测试 SSE 服务器连接
  - 使用新格式 `type` 字段测试 HTTP 服务器连接
  - 使用旧格式 `transport` 字段测试向后兼容性
  - 验证弃用警告正确输出
  - _Requirements: 全部需求验证_

- [x] 11. 代码质量检查
  - 执行 `npm run lint` 检查代码规范
  - 执行 `npm run format:check` 检查代码格式
  - _Requirements: 代码质量标准_
