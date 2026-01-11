# 实施计划：MCP重构

## 概述

重构 Claude Replica 的 MCP 功能，采用单一配置源（.mcp.json），实现分层架构（UI → MCPService → MCPManager），简化配置管理流程。

## 任务

- [x] 1. 移除旧的配置支持和未使用代码
  - 清理 settings.json 中的 mcpServers 配置合并逻辑
  - 从 MCPManager 中移除 9 个未使用的方法
  - _Requirements: settings.json中的mcpServers配置支持, MCPManager的运行时配置修改功能, MCPManager精简和重构_

- [x] 2. 实现 MCPManager 的项目根目录配置加载
  - 新增 `loadFromProjectRoot(workingDir)` 方法，向上查找 .git 目录
  - 新增 `getConfigPath(workingDir)` 方法，返回 .mcp.json 路径
  - 更新 `loadServersFromConfig()` 以支持单一配置源
  - _Requirements: MCP配置单一源管理, MCPManager精简和重构_

- [x] 3. 创建 MCPService 业务逻辑层
  - 在 src/mcp/ 目录创建 MCPService.ts 文件
  - 实现 `listServerConfig(workingDir)` - 获取服务器配置列表
  - 实现 `editConfig(workingDir)` - 打开编辑器修改 .mcp.json
  - 实现 `validateConfig(workingDir)` - 验证配置文件有效性
  - 添加文件头文档，说明 MCPService 的职责和方法
  - _Requirements: MCPService业务逻辑层, MCP配置编辑命令, MCP配置验证命令_

- [x] 4. 集成 MCPService 到 Application 类
  - 在 src/main.ts 中导入 MCPService
  - 添加 `private mcpService: MCPService` 字段
  - 在构造函数中初始化 MCPService 实例
  - 重构 `loadMCPServers()` 方法，使用 MCPManager.loadFromProjectRoot()
  - _Requirements: MCP配置单一源管理, MCPService业务逻辑层_

- [x] 5. 实现 /mcp 命令的子命令路由
  - 在 src/main.ts 的 `handleInteractiveCommand()` 方法中解析 /mcp 命令
  - 支持 `/mcp` 和 `/mcp list` - 调用 showMCPConfig()
  - 支持 `/mcp edit` - 调用 editMCPConfig()
  - 支持 `/mcp validate` - 调用 validateMCPConfig()
  - 处理未知子命令，提示帮助信息
  - _Requirements: MCP配置编辑命令, MCP配置验证命令, MCP服务器配置显示_

- [x] 6. 实现 showMCPConfig() 方法
  - 在 src/main.ts 中新增 `private async showMCPConfig()` 方法
  - 调用 MCPService.listServerConfig(workingDir)
  - 格式化输出：服务器名称、传输类型、配置详情
  - 如果配置为空，显示提示信息并建议使用 `/mcp edit`
  - 在输出末尾提示 `/mcp edit` 和 `/mcp validate` 命令
  - _Requirements: MCP服务器配置显示_

- [x] 7. 实现 editMCPConfig() 方法
  - 在 src/main.ts 中新增 `private async editMCPConfig()` 方法
  - 调用 MCPService.editConfig(workingDir)
  - 检测 EDITOR 环境变量，如果存在则使用
  - 如果 EDITOR 未设置，依次尝试默认编辑器列表（code, vim, nano, vi）
  - 如果 .mcp.json 不存在，创建默认的空配置文件 `{ "mcpServers": {} }`
  - 使用 child_process.spawn() 启动编辑器进程
  - 等待编辑器进程退出后返回控制权
  - 提示用户配置已更新，建议重新加载应用
  - _Requirements: MCP配置编辑命令_

- [x] 8. 实现 validateMCPConfig() 方法
  - 在 src/main.ts 中新增 `private async validateMCPConfig()` 方法
  - 调用 MCPService.validateConfig(workingDir)
  - 捕获 JSON 语法错误，显示行号和位置
  - 捕获配置结构错误，显示不符合规范的字段
  - 验证成功时显示服务器数量和传输类型统计
  - 验证失败时显示所有错误详情
  - _Requirements: MCP配置验证命令_

- [x] 9. 更新 MCPManager.ts 的文件头文档
  - 说明 MCPManager 的职责：配置加载、验证、环境变量展开
  - 列出保留的 7 个核心方法及其作用
  - 列出新增的 2 个方法及其作用
  - 说明移除的 9 个方法及移除原因
  - _Requirements: MCPManager精简和重构_

- [x] 10. 添加旧配置迁移检测和警告
  - 在 src/config/SDKConfigLoader.ts 的 `mergeConfigs()` 方法中检测 settings.json 的 mcpServers 字段
  - 如果存在，输出警告日志：建议迁移到 .mcp.json
  - 提供迁移步骤的详细说明
  - _Requirements: MCP配置单一源管理_

- [X] 11. 编写 MCPService 单元测试
  - 测试 `listServerConfig()` - 验证配置列表获取
  - 测试 `validateConfig()` - 验证语法错误和结构错误检测
  - 测试 `editConfig()` - 验证编辑器启动逻辑
  - 使用 mock MCPManager 依赖
  - _Requirements: MCPService业务逻辑层_

- [x] 12. 编写 MCPManager 单元测试
  - 测试 `loadFromProjectRoot()` - 验证项目根目录查找逻辑
  - 测试 `getConfigPath()` - 验证路径拼接
  - 测试配置文件缺失场景 - 验证返回空列表
  - 测试环境变量展开功能
  - _Requirements: MCPManager精简和重构_

- [x] 13. 编写 /mcp 命令集成测试
  - 使用 node-pty 模拟终端交互
  - 测试 `/mcp list` 输出格式
  - 测试 `/mcp validate` 错误检测
  - 测试 `/mcp edit` 编辑器启动（mock child_process.spawn）
  - _Requirements: MCP配置编辑命令, MCP配置验证命令, MCP服务器配置显示_

- [ ] 14. 执行端到端功能验证
  - 手动测试：启动应用，验证 .mcp.json 加载
  - 手动测试：执行 `/mcp edit`，修改配置并保存
  - 手动测试：执行 `/mcp validate`，验证错误检测
  - 手动测试：执行 `/mcp`，验证配置信息显示
  - 手动测试：验证旧 settings.json 中的 mcpServers 警告提示
  - _Requirements: 所有需求_

- [x] 15. 更新相关文档
  - 更新 CLAUDE.md 中的 MCP 集成章节
  - 更新 MCP 配置示例和最佳实践
  - 添加 /mcp 命令使用说明
  - 添加配置迁移指南（settings.json → .mcp.json）
  - _Requirements: MCP配置单一源管理_
