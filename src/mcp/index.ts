/**
 * 文件功能：MCP 模块统一导出，聚合 MCP 配置管理与业务服务相关的公共接口
 *
 * 核心导出：
 * - MCPManager: MCP 配置加载与验证管理器
 * - MCPService: MCP 配置业务逻辑服务
 *
 * 核心作用：
 * - MCPManager: 负责配置读取、验证、环境变量展开
 * - MCPService: 负责配置列表查询、编辑与校验流程
 */

export {
  MCPManager,
  McpStdioServerConfig,
  McpSSEServerConfig,
  McpHttpServerConfig,
  McpServerConfig,
  MCPServerConfigMap,
  ConfigValidationResult,
  ServerInfo,
  MCPManagerOptions,
} from './MCPManager';

export {
  MCPService,
  MCPServiceOptions,
  MCPConfigListResult,
  MCPConfigEditResult,
  MCPConfigValidationError,
  MCPConfigValidationResult,
} from './MCPService';
