/**
 * MCPManager 测试
 *
 * 验证 MCP 管理器在单一 .mcp.json 配置下的行为，包括项目根查找、路径计算和环境变量展开。
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { MCPManager, McpSSEServerConfig } from '../../src/mcp/MCPManager';

describe('MCPManager', () => {
  let tempDir: string;
  let mcpManager: MCPManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-mcp-'));
    mcpManager = new MCPManager();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should resolve .mcp.json path from the repository root', async () => {
    await fs.mkdir(path.join(tempDir, '.git'));
    const nested = path.join(tempDir, 'workspace', 'subproject');
    await fs.mkdir(nested, { recursive: true });

    const configPath = await mcpManager.getConfigPath(nested);
    expect(configPath).toBe(path.join(tempDir, '.mcp.json'));
  });

  it('should load servers from the project root configuration', async () => {
    await fs.mkdir(path.join(tempDir, '.git'));
    const configPath = path.join(tempDir, '.mcp.json');
    await fs.writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          filesystem: {
            command: 'echo',
            args: ['hello'],
          },
        },
      })
    );

    const nested = path.join(tempDir, 'workspace');
    await fs.mkdir(nested, { recursive: true });
    await mcpManager.loadFromProjectRoot(nested);

    expect(mcpManager.getServersInfo()).toHaveLength(1);
    expect(mcpManager.getServersInfo()[0].name).toBe('filesystem');
  });

  it('returns an empty server list when the .mcp.json file is missing', async () => {
    await fs.mkdir(path.join(tempDir, '.git'));
    const nested = path.join(tempDir, 'workspace');
    await fs.mkdir(nested, { recursive: true });

    await expect(mcpManager.loadFromProjectRoot(nested)).resolves.not.toThrow();
    expect(mcpManager.getServersInfo()).toHaveLength(0);
    expect(mcpManager.getServersInfo()).toEqual([]);
  });

  it('should expand environment variables in server configs', () => {
    const originalHost = process.env.MCP_TEST_HOST;
    const originalToken = process.env.MCP_TEST_TOKEN;

    process.env.MCP_TEST_HOST = 'api.example.com';
    process.env.MCP_TEST_TOKEN = 'token-value';

    const config: McpSSEServerConfig = {
      type: 'sse',
      url: 'https://${MCP_TEST_HOST}/stream',
      headers: {
        Authorization: 'Bearer ${MCP_TEST_TOKEN}',
      },
    };

    const expanded = mcpManager.expandEnvironmentVariables(config) as McpSSEServerConfig;
    expect(expanded.url).toBe('https://api.example.com/stream');
    expect(expanded.headers?.Authorization).toBe('Bearer token-value');

    if (originalHost === undefined) {
      delete process.env.MCP_TEST_HOST;
    } else {
      process.env.MCP_TEST_HOST = originalHost;
    }

    if (originalToken === undefined) {
      delete process.env.MCP_TEST_TOKEN;
    } else {
      process.env.MCP_TEST_TOKEN = originalToken;
    }
  });
});
