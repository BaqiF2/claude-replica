# MCP重构规格说明 - 最终计划

## 项目背景

根据官方文档 https://platform.claude.com/docs/zh-CN/agent-sdk/mcp 重构 Claude Replica 项目的 MCP 相关功能。

---

## 用户需求决策（已确认）

### 1. 配置源策略
✅ **仅使用 .mcp.json** - 只从项目根目录的 .mcp.json 加载配置，移除 settings.json 中的 mcpServers 支持

### 2. 配置添加方式
✅ **手动编辑** - 提供 `/mcp edit` 命令直接打开 .mcp.json 文件进行编辑

### 3. 状态监控需求
✅ **基础信息** - 服务器名称、传输类型、配置详情
✅ **健康检查** - 轻量级配置验证（不真正连接服务器）

### 4. 架构模式
✅ **Service层模式** - 创建 MCPService 作为中间层

### 5. 健康检查实现
✅ **轻量级验证** - 仅验证配置的有效性

### 6. 旧代码移除策略
✅ 移除 settings.json 中的 mcpServers 支持
✅ 移除 MCPManager 的不必要方法
✅ 移除旧的 /mcp 命令实现

---

## 详细实现方案

### 一、架构设计

**分层结构**: UI层（Application）→ MCPService → MCPManager

**数据流**:
```
.mcp.json → MCPManager.loadFromProjectRoot()
          → MCPService (业务逻辑封装)
          → Application (/mcp 命令处理)
          → 终端展示
```

### 二、关键组件设计

#### 1. MCPService（新增）

**文件**: `src/mcp/MCPService.ts`

**职责**:
- 封装MCP配置管理业务逻辑
- 提供UI层友好的接口
- 调用MCPManager进行底层配置操作

**核心接口**:
- `listServerConfig(workingDir)`: 列出所有MCP服务器配置信息
- `editConfig(workingDir)`: 打开 .mcp.json 文件进行编辑
- `validateConfig(workingDir)`: 验证MCP配置有效性

#### 2. MCPManager（重构）

**保留的7个核心方法**:
- `loadServersFromConfig()` - 从配置文件加载
- `getServersConfig()` - 获取所有配置
- `getServersInfo()` - 获取详细信息
- `validateConfig()` - 验证单个配置
- `expandEnvironmentVariables()` - 展开环境变量
- `getExpandedServersConfig()` - 获取展开后的配置
- `getTransportType()` - 获取传输类型

**新增的2个方法**:
- `loadFromProjectRoot(workingDir)` - 从项目根目录自动查找配置
- `getConfigPath(workingDir)` - 获取配置文件路径

**移除的9个方法**:
- `tryLoadFromPaths()` - 多路径加载（改为单一配置源）
- `addServer()` / `removeServer()` - 运行时修改（改为文件编辑）
- `merge()` - 配置合并（不再需要）
- `saveToFile()` - 文件保存（通过编辑器完成）
- `filterByTransport()` - 工具方法（未使用）
- `clear()` - 运行时清空（不需要）
- `fromJSON()` / `toJSON()` - 静态工具（价值低）

### 三、/mcp 命令实现

**命令结构**:
```
/mcp              - 显示所有MCP服务器配置（默认）
/mcp list         - 同上
/mcp edit         - 打开 .mcp.json 编辑
/mcp validate     - 验证当前配置
```

**UI展示格式**:
```
MCP Servers (2 configured):

filesystem [stdio]
  Command: npx -y @modelcontextprotocol/server-filesystem
  Args: /path/to/workspace

database [sse]
  URL: https://api.example.com/mcp/sse

Use '/mcp edit' to modify configuration
Use '/mcp validate' to check configuration validity
```

---

## 需要修改的文件清单

### 新增文件（1个）
- `src/mcp/MCPService.ts` - MCP配置管理业务逻辑层

### 修改文件（3个）

#### 1. `src/mcp/MCPManager.ts`
- 移除9个方法
- 新增2个方法（loadFromProjectRoot, getConfigPath）
- 更新文件头文档

#### 2. `src/main.ts` (Application类)
- 添加 MCPService 导入
- 添加 mcpService 私有字段
- 初始化 MCPService
- 重构 loadMCPServers()
- 重构 /mcp 命令处理
- 新增三个方法（showMCPConfig, editMCPConfig, validateMCPConfig）

#### 3. `src/config/SDKConfigLoader.ts`
- 移除 mergeConfigs 中的 mcpServers 合并逻辑
- 添加旧配置检测和警告

---

## 实施步骤

### 阶段一：基础重构和Service层实现
1. 重构 MCPManager.ts（移除9个方法，新增2个）
2. 创建 MCPService.ts（配置管理接口）
3. 修改 SDKConfigLoader.ts 移除mcpServers合并
4. 修改 main.ts 初始化逻辑和 /mcp 命令处理

### 阶段二：命令实现
5. 实现 /mcp 命令（list, edit, validate子命令）
6. 实现 MCPService.editConfig()
7. 实现完整的UI展示逻辑

### 阶段三：测试和验证
8. 编写单元测试（MCPService, MCPManager）
9. 编写集成测试（/mcp 命令）
10. 执行端到端功能验证

---

## 验证方式

### 功能验证
1. **配置加载**: 启动应用，检查 .mcp.json 是否正确加载
2. **配置编辑**: 执行 `/mcp edit`，验证编辑器打开并保存生效
3. **配置验证**: 执行 `/mcp validate`，验证错误检测和提示
4. **配置显示**: 执行 `/mcp` 或 `/mcp list`，验证配置信息完整性
5. **旧配置警告**: 验证 settings.json 中的 mcpServers 触发警告

### 性能验证
- 配置加载时间 < 100ms
- 配置验证时间 < 50ms
- UI渲染响应及时

### 兼容性验证
- 各种MCP传输类型（stdio/sse/http）正确识别
- 环境变量展开正确

---

## 风险点和缓解措施

| 风险 | 缓解措施 |
|------|----------|
| settings.json中已配置mcpServers | 启动时检测并警告，提示迁移到.mcp.json |
| EDITOR环境变量未设置 | 提供默认编辑器列表（code/vim/nano/vi），依次尝试 |
| 配置文件格式错误 | 详细的错误提示，指导用户修复 |
| 项目根目录无法确定 | 使用当前工作目录作为回退方案 |

---

## 关键文件路径

**最关键的3个文件**:
1. `src/mcp/MCPService.ts` - [新增] 配置管理业务逻辑层
2. `src/mcp/MCPManager.ts` - [重构] 配置加载核心
3. `src/main.ts` - [修改] Application集成和命令处理

---

## 预期成果

### 用户体验改进
✅ 简化的配置管理（单一配置源）
✅ 便捷的配置编辑（/mcp edit）
✅ 清晰的配置展示
✅ 实时的配置验证

### 代码质量提升
✅ 清晰的分层架构（UI → Service → Manager）
✅ 减少代码复杂度（移除9个未使用方法）
✅ 更好的可测试性（Service层独立测试）
✅ 符合官方SDK最佳实践

### 可维护性增强
✅ 单一配置源易于管理
✅ 分层设计便于扩展（未来GUI支持）
✅ 配置与运行时解耦，启动时动态加载