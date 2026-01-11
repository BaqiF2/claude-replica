/**
 * MCPManager 测试
 *
 * **Feature: claude-code-replica, Property 5: MCP 工具调用的透明性**
 * **验证: 需求 12.3, 12.4**
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  MCPManager,
  McpStdioServerConfig,
  McpSSEServerConfig,
  McpHttpServerConfig,
  McpServerConfig,
  MCPServerConfigMap,
} from '../../src/mcp/MCPManager';

describe('MCPManager', () => {
  let mcpManager: MCPManager;
  let tempDir: string;

  beforeEach(async () => {
    // 创建临时目录用于测试
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
    mcpManager = new MCPManager({ debug: false });
  });

  afterEach(async () => {
    // 清理临时目录
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  describe('loadServersFromConfig', () => {
    it('应该从配置文件加载服务器', async () => {
      const configPath = path.join(tempDir, '.mcp.json');
      const config: MCPServerConfigMap = {
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
        },
      };

      await fs.writeFile(configPath, JSON.stringify(config));
      await mcpManager.loadServersFromConfig(configPath);

      expect(mcpManager.listServers()).toContain('github');
      expect(mcpManager.getServerCount()).toBe(1);
    });

    it('应该抛出错误当文件不存在时', async () => {
      const configPath = path.join(tempDir, 'nonexistent.json');

      await expect(mcpManager.loadServersFromConfig(configPath)).rejects.toThrow(
        'MCP configuration file does not exist'
      );
    });

    it('应该抛出错误当 JSON 格式无效时', async () => {
      const configPath = path.join(tempDir, '.mcp.json');
      await fs.writeFile(configPath, 'invalid json');

      await expect(mcpManager.loadServersFromConfig(configPath)).rejects.toThrow(
        'MCP configuration file format invalid'
      );
    });

    it('应该抛出错误当配置不是对象时', async () => {
      const configPath = path.join(tempDir, '.mcp.json');
      await fs.writeFile(configPath, JSON.stringify(['array']));

      await expect(mcpManager.loadServersFromConfig(configPath)).rejects.toThrow(
        'MCP configuration must be an object'
      );
    });

    it('严格模式下应该验证配置', async () => {
      const strictManager = new MCPManager({ strictMode: true });
      const configPath = path.join(tempDir, '.mcp.json');
      const invalidConfig = {
        server: {
          // 缺少 command 和 args
        },
      };

      await fs.writeFile(configPath, JSON.stringify(invalidConfig));

      await expect(strictManager.loadServersFromConfig(configPath)).rejects.toThrow(
        'MCP configuration validation failed:'
      );
    });
  });

  describe('tryLoadFromPaths', () => {
    it('应该从 .mcp.json 加载', async () => {
      const configPath = path.join(tempDir, '.mcp.json');
      await fs.writeFile(
        configPath,
        JSON.stringify({ server1: { command: 'cmd', args: [] } })
      );

      const result = await mcpManager.tryLoadFromPaths(tempDir);

      expect(result).toBe(true);
      expect(mcpManager.hasServer('server1')).toBe(true);
    });

    it('应该从 mcp.json 加载', async () => {
      const configPath = path.join(tempDir, 'mcp.json');
      await fs.writeFile(
        configPath,
        JSON.stringify({ server2: { command: 'cmd', args: [] } })
      );

      const result = await mcpManager.tryLoadFromPaths(tempDir);

      expect(result).toBe(true);
      expect(mcpManager.hasServer('server2')).toBe(true);
    });

    it('没有配置文件时应返回 false', async () => {
      const result = await mcpManager.tryLoadFromPaths(tempDir);
      expect(result).toBe(false);
    });
  });

  describe('addServer', () => {
    it('应该添加 stdio 服务器', () => {
      const config: McpStdioServerConfig = {
        command: 'npx',
        args: ['-y', 'some-server'],
      };

      mcpManager.addServer('test-server', config);

      expect(mcpManager.hasServer('test-server')).toBe(true);
      expect(mcpManager.getServerConfig('test-server')).toEqual(config);
    });

    it('应该添加 SSE 服务器', () => {
      const config: McpSSEServerConfig = {
        type: 'sse',
        url: 'https://example.com/sse',
      };

      mcpManager.addServer('sse-server', config);

      expect(mcpManager.hasServer('sse-server')).toBe(true);
      expect(mcpManager.getTransportType(config)).toBe('sse');
    });

    it('应该添加 HTTP 服务器', () => {
      const config: McpHttpServerConfig = {
        type: 'http',
        url: 'https://example.com/api',
      };

      mcpManager.addServer('http-server', config);

      expect(mcpManager.hasServer('http-server')).toBe(true);
      expect(mcpManager.getTransportType(config)).toBe('http');
    });

    it('应该抛出错误当名称为空时', () => {
      expect(() => {
        mcpManager.addServer('', { command: 'cmd', args: [] });
      }).toThrow('Server name must be a non-empty string');
    });

    it('严格模式下应该验证配置', () => {
      const strictManager = new MCPManager({ strictMode: true });

      expect(() => {
        strictManager.addServer('invalid', {} as McpServerConfig);
      }).toThrow(/Server "invalid" configuration invalid/);
    });
  });

  describe('removeServer', () => {
    beforeEach(() => {
      mcpManager.addServer('server1', { command: 'cmd1', args: [] });
      mcpManager.addServer('server2', { command: 'cmd2', args: [] });
    });

    it('应该移除存在的服务器', () => {
      const result = mcpManager.removeServer('server1');

      expect(result).toBe(true);
      expect(mcpManager.hasServer('server1')).toBe(false);
      expect(mcpManager.hasServer('server2')).toBe(true);
    });

    it('移除不存在的服务器应返回 false', () => {
      const result = mcpManager.removeServer('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('getServersConfig', () => {
    it('应该返回所有服务器配置的副本', () => {
      mcpManager.addServer('server1', { command: 'cmd1', args: [] });
      mcpManager.addServer('server2', { command: 'cmd2', args: [] });

      const config = mcpManager.getServersConfig();

      expect(Object.keys(config)).toHaveLength(2);
      expect(config.server1).toBeDefined();
      expect(config.server2).toBeDefined();

      // 验证是副本
      config.server3 = { command: 'cmd3', args: [] };
      expect(mcpManager.hasServer('server3')).toBe(false);
    });

    it('空配置应返回空对象', () => {
      const config = mcpManager.getServersConfig();
      expect(Object.keys(config)).toHaveLength(0);
    });
  });

  describe('listServers', () => {
    it('应该返回所有服务器名称', () => {
      mcpManager.addServer('alpha', { command: 'cmd', args: [] });
      mcpManager.addServer('beta', { command: 'cmd', args: [] });
      mcpManager.addServer('gamma', { command: 'cmd', args: [] });

      const servers = mcpManager.listServers();

      expect(servers).toContain('alpha');
      expect(servers).toContain('beta');
      expect(servers).toContain('gamma');
      expect(servers).toHaveLength(3);
    });

    it('空配置应返回空数组', () => {
      const servers = mcpManager.listServers();
      expect(servers).toHaveLength(0);
    });
  });

  describe('validateConfig', () => {
    describe('stdio 配置', () => {
      it('有效的 stdio 配置应通过验证', () => {
        const config: McpStdioServerConfig = {
          command: 'npx',
          args: ['-y', 'some-server'],
          env: { KEY: 'value' },
        };

        const result = mcpManager.validateConfig(config);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('缺少 command 应失败', () => {
        const config = { args: [] } as unknown as McpStdioServerConfig;

        const result = mcpManager.validateConfig(config);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('command'))).toBe(true);
      });

      it('空 command 应失败', () => {
        const config: McpStdioServerConfig = {
          command: '',
          args: [],
        };

        const result = mcpManager.validateConfig(config);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('command'))).toBe(true);
      });

      it('args 不是数组应失败', () => {
        const config = {
          command: 'cmd',
          args: 'not-array',
        } as unknown as McpStdioServerConfig;

        const result = mcpManager.validateConfig(config);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('args'))).toBe(true);
      });

      it('args 包含非字符串应失败', () => {
        const config = {
          command: 'cmd',
          args: ['valid', 123],
        } as unknown as McpStdioServerConfig;

        const result = mcpManager.validateConfig(config);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('args'))).toBe(true);
      });

      it('env 不是对象应失败', () => {
        const config = {
          command: 'cmd',
          args: [],
          env: 'not-object',
        } as unknown as McpStdioServerConfig;

        const result = mcpManager.validateConfig(config);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('env'))).toBe(true);
      });
    });

    describe('SSE 配置', () => {
      it('有效的 SSE 配置应通过验证', () => {
        const config: McpSSEServerConfig = {
          type: 'sse',
          url: 'https://example.com/sse',
          headers: { Authorization: 'Bearer token' },
        };

        const result = mcpManager.validateConfig(config);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('缺少 url 应失败', () => {
        const config = {
          type: 'sse',
        } as unknown as McpSSEServerConfig;

        const result = mcpManager.validateConfig(config);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('url'))).toBe(true);
      });

      it('无效的 url 应失败', () => {
        const config: McpSSEServerConfig = {
          type: 'sse',
          url: 'not-a-url',
        };

        const result = mcpManager.validateConfig(config);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('url'))).toBe(true);
      });

      it('包含环境变量的 url 应通过', () => {
        const config: McpSSEServerConfig = {
          type: 'sse',
          url: '${SSE_URL}',
        };

        const result = mcpManager.validateConfig(config);

        expect(result.valid).toBe(true);
      });
    });

    describe('HTTP 配置', () => {
      it('有效的 HTTP 配置应通过验证', () => {
        const config: McpHttpServerConfig = {
          type: 'http',
          url: 'https://example.com/api',
        };

        const result = mcpManager.validateConfig(config);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('缺少 url 应失败', () => {
        const config = {
          type: 'http',
        } as unknown as McpHttpServerConfig;

        const result = mcpManager.validateConfig(config);

        expect(result.valid).toBe(false);
      });
    });

    describe('无效配置', () => {
      it('空对象应失败', () => {
        const result = mcpManager.validateConfig({} as McpServerConfig);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('command') || e.includes('transport'))).toBe(true);
      });

      it('未知传输类型应失败', () => {
        const config = {
          type: 'unknown',
          url: 'https://example.com',
        } as unknown as McpServerConfig;

        const result = mcpManager.validateConfig(config);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Unknown') || e.includes('type'))).toBe(true);
      });

      it('null 应失败', () => {
        const result = mcpManager.validateConfig(null as unknown as McpServerConfig);

        expect(result.valid).toBe(false);
      });
    });
  });

  describe('向后兼容性：transport 字段支持', () => {
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it('应该自动转换 transport 字段为 type 字段（SSE）', () => {
      const configWithTransport = {
        transport: 'sse',
        url: 'https://example.com/sse',
      } as any;

      mcpManager.addServer('sse-legacy', configWithTransport);

      const retrieved = mcpManager.getServerConfig('sse-legacy') as any;
      expect(retrieved.type).toBe('sse');
      expect(retrieved.transport).toBeUndefined();
    });

    it('应该自动转换 transport 字段为 type 字段（HTTP）', () => {
      const configWithTransport = {
        transport: 'http',
        url: 'https://example.com/api',
      } as any;

      mcpManager.addServer('http-legacy', configWithTransport);

      const retrieved = mcpManager.getServerConfig('http-legacy') as any;
      expect(retrieved.type).toBe('http');
      expect(retrieved.transport).toBeUndefined();
    });

    it('使用 transport 字段时应该输出弃用警告', () => {
      const configWithTransport = {
        transport: 'sse',
        url: 'https://example.com/sse',
      } as any;

      mcpManager.addServer('legacy-server', configWithTransport);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('DEPRECATED')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('transport')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('type')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('v2.0')
      );
    });

    it('同时存在 type 和 transport 时应该优先使用 type', () => {
      const configWithBoth = {
        type: 'sse',
        transport: 'http',
        url: 'https://example.com',
      } as any;

      mcpManager.addServer('both-fields', configWithBoth);

      const retrieved = mcpManager.getServerConfig('both-fields') as any;
      expect(retrieved.type).toBe('sse');
      expect(retrieved.transport).toBeUndefined();
    });

    it('同时存在两个字段时应该输出警告', () => {
      const configWithBoth = {
        type: 'sse',
        transport: 'http',
        url: 'https://example.com',
      } as any;

      mcpManager.addServer('both-fields-2', configWithBoth);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('DEPRECATED')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('both')
      );
    });

    it('只有 type 字段时不应该输出警告', () => {
      const configWithType: McpSSEServerConfig = {
        type: 'sse',
        url: 'https://example.com/sse',
      };

      mcpManager.addServer('modern-server', configWithType);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('从配置文件加载时也应该支持 transport 字段', async () => {
      const configPath = path.join(tempDir, 'legacy.mcp.json');
      const config = {
        'legacy-sse': {
          transport: 'sse',
          url: 'https://example.com/sse',
        },
        'legacy-http': {
          transport: 'http',
          url: 'https://example.com/api',
        },
      };

      await fs.writeFile(configPath, JSON.stringify(config));
      await mcpManager.loadServersFromConfig(configPath);

      const sseConfig = mcpManager.getServerConfig('legacy-sse') as any;
      expect(sseConfig.type).toBe('sse');
      expect(sseConfig.transport).toBeUndefined();

      const httpConfig = mcpManager.getServerConfig('legacy-http') as any;
      expect(httpConfig.type).toBe('http');
      expect(httpConfig.transport).toBeUndefined();

      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('getTransportType', () => {
    it('应该识别 stdio 类型', () => {
      const config: McpStdioServerConfig = { command: 'cmd', args: [] };
      expect(mcpManager.getTransportType(config)).toBe('stdio');
    });

    it('应该识别 SSE 类型', () => {
      const config: McpSSEServerConfig = { type: 'sse', url: 'https://example.com' };
      expect(mcpManager.getTransportType(config)).toBe('sse');
    });

    it('应该识别 HTTP 类型', () => {
      const config: McpHttpServerConfig = { type: 'http', url: 'https://example.com' };
      expect(mcpManager.getTransportType(config)).toBe('http');
    });
  });

  describe('getServersInfo', () => {
    it('应该返回服务器详细信息', () => {
      mcpManager.addServer('stdio-server', { command: 'cmd', args: [] });
      mcpManager.addServer('sse-server', { type: 'sse', url: 'https://example.com' });

      const info = mcpManager.getServersInfo();

      expect(info).toHaveLength(2);

      const stdioInfo = info.find(i => i.name === 'stdio-server');
      expect(stdioInfo).toBeDefined();
      expect(stdioInfo!.type).toBe('stdio');

      const sseInfo = info.find(i => i.name === 'sse-server');
      expect(sseInfo).toBeDefined();
      expect(sseInfo!.type).toBe('sse');
    });
  });

  describe('expandEnvironmentVariables', () => {
    beforeEach(() => {
      process.env.TEST_TOKEN = 'test-token-value';
      process.env.TEST_URL = 'https://test.example.com';
    });

    afterEach(() => {
      delete process.env.TEST_TOKEN;
      delete process.env.TEST_URL;
    });

    it('应该展开 stdio 配置中的环境变量', () => {
      const config: McpStdioServerConfig = {
        command: 'cmd',
        args: ['--token', '${TEST_TOKEN}'],
        env: { TOKEN: '${TEST_TOKEN}' },
      };

      const expanded = mcpManager.expandEnvironmentVariables(config) as McpStdioServerConfig;

      expect(expanded.args[1]).toBe('test-token-value');
      expect(expanded.env!.TOKEN).toBe('test-token-value');
    });

    it('应该展开 SSE 配置中的环境变量', () => {
      const config: McpSSEServerConfig = {
        type: 'sse',
        url: '${TEST_URL}/sse',
        headers: { Authorization: 'Bearer ${TEST_TOKEN}' },
      };

      const expanded = mcpManager.expandEnvironmentVariables(config) as McpSSEServerConfig;

      expect(expanded.url).toBe('https://test.example.com/sse');
      expect(expanded.headers!.Authorization).toBe('Bearer test-token-value');
    });

    it('应该展开 HTTP 配置中的环境变量', () => {
      const config: McpHttpServerConfig = {
        type: 'http',
        url: '${TEST_URL}/api',
      };

      const expanded = mcpManager.expandEnvironmentVariables(config) as McpHttpServerConfig;

      expect(expanded.url).toBe('https://test.example.com/api');
    });

    it('未定义的环境变量应替换为空字符串', () => {
      const config: McpStdioServerConfig = {
        command: 'cmd',
        args: ['${UNDEFINED_VAR}'],
      };

      const expanded = mcpManager.expandEnvironmentVariables(config) as McpStdioServerConfig;

      expect(expanded.args[0]).toBe('');
    });
  });

  describe('clear', () => {
    it('应该清除所有配置', () => {
      mcpManager.addServer('server1', { command: 'cmd', args: [] });
      mcpManager.addServer('server2', { command: 'cmd', args: [] });

      mcpManager.clear();

      expect(mcpManager.getServerCount()).toBe(0);
      expect(mcpManager.listServers()).toHaveLength(0);
    });
  });

  describe('merge', () => {
    beforeEach(() => {
      mcpManager.addServer('existing', { command: 'old', args: [] });
    });

    it('应该合并新配置', () => {
      const other: MCPServerConfigMap = {
        new: { command: 'new', args: [] },
      };

      mcpManager.merge(other);

      expect(mcpManager.hasServer('existing')).toBe(true);
      expect(mcpManager.hasServer('new')).toBe(true);
    });

    it('默认应该覆盖已存在的配置', () => {
      const other: MCPServerConfigMap = {
        existing: { command: 'updated', args: ['new-arg'] },
      };

      mcpManager.merge(other);

      const config = mcpManager.getServerConfig('existing') as McpStdioServerConfig;
      expect(config.command).toBe('updated');
    });

    it('overwrite=false 时不应覆盖已存在的配置', () => {
      const other: MCPServerConfigMap = {
        existing: { command: 'updated', args: [] },
      };

      mcpManager.merge(other, false);

      const config = mcpManager.getServerConfig('existing') as McpStdioServerConfig;
      expect(config.command).toBe('old');
    });
  });

  describe('saveToFile', () => {
    it('应该保存配置到文件', async () => {
      mcpManager.addServer('server1', { command: 'cmd1', args: [] });
      mcpManager.addServer('server2', { type: 'sse', url: 'https://example.com' });

      const configPath = path.join(tempDir, 'saved.mcp.json');
      await mcpManager.saveToFile(configPath);

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.server1).toBeDefined();
      expect(parsed.server2).toBeDefined();
    });
  });

  describe('filterByTransport', () => {
    beforeEach(() => {
      mcpManager.addServer('stdio1', { command: 'cmd1', args: [] });
      mcpManager.addServer('stdio2', { command: 'cmd2', args: [] });
      mcpManager.addServer('sse1', { type: 'sse', url: 'https://example.com' });
      mcpManager.addServer('http1', { type: 'http', url: 'https://example.com' });
    });

    it('应该筛选 stdio 服务器', () => {
      const filtered = mcpManager.filterByTransport('stdio');

      expect(Object.keys(filtered)).toHaveLength(2);
      expect(filtered.stdio1).toBeDefined();
      expect(filtered.stdio2).toBeDefined();
    });

    it('应该筛选 SSE 服务器', () => {
      const filtered = mcpManager.filterByTransport('sse');

      expect(Object.keys(filtered)).toHaveLength(1);
      expect(filtered.sse1).toBeDefined();
    });

    it('应该筛选 HTTP 服务器', () => {
      const filtered = mcpManager.filterByTransport('http');

      expect(Object.keys(filtered)).toHaveLength(1);
      expect(filtered.http1).toBeDefined();
    });
  });

  describe('静态方法', () => {
    describe('validateServerConfig', () => {
      it('应该验证配置', () => {
        const result = MCPManager.validateServerConfig({
          command: 'cmd',
          args: [],
        });

        expect(result.valid).toBe(true);
      });
    });

    describe('fromJSON', () => {
      it('应该从 JSON 创建实例', () => {
        const json = JSON.stringify({
          server1: { command: 'cmd', args: [] },
        });

        const manager = MCPManager.fromJSON(json);

        expect(manager.hasServer('server1')).toBe(true);
      });
    });
  });

  describe('toJSON', () => {
    it('应该转换为 JSON 字符串', () => {
      mcpManager.addServer('server1', { command: 'cmd', args: [] });

      const json = mcpManager.toJSON();
      const parsed = JSON.parse(json);

      expect(parsed.server1).toBeDefined();
    });
  });


  /**
   * 属性 5: MCP 工具调用的透明性
   *
   * *对于任意*有效的 MCP 服务器配置，添加到管理器后应该能够被正确检索，
   * 且配置内容保持不变（透明性）。
   *
   * **验证: 需求 12.3, 12.4**
   */
  describe('Property 5: MCP 工具调用的透明性', () => {
    // 生成有效的服务器名称
    const arbServerName = fc.string({ minLength: 1, maxLength: 50 })
      .filter(s => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s));

    // 生成有效的命令
    const arbCommand = fc.constantFrom('npx', 'node', 'python', 'uvx', 'npm');

    // 生成有效的参数数组
    const arbArgs = fc.array(
      fc.string({ minLength: 1, maxLength: 30 }).filter(s => !s.includes('\0')),
      { minLength: 0, maxLength: 5 }
    );

    // 生成有效的环境变量
    const arbEnv = fc.option(
      fc.dictionary(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[A-Z_][A-Z0-9_]*$/.test(s)),
        fc.string({ minLength: 0, maxLength: 50 }),
        { minKeys: 0, maxKeys: 3 }
      ),
      { nil: undefined }
    );

    // 生成有效的 URL
    const arbUrl = fc.constantFrom(
      'https://example.com/api',
      'https://api.example.org/mcp',
      'http://localhost:3000',
      'https://mcp.service.io/sse'
    );

    // 生成有效的 headers
    const arbHeaders = fc.option(
      fc.dictionary(
        fc.constantFrom('Authorization', 'X-API-Key', 'Content-Type'),
        fc.string({ minLength: 1, maxLength: 50 }),
        { minKeys: 0, maxKeys: 2 }
      ),
      { nil: undefined }
    );

    // 生成 stdio 配置
    const arbStdioConfig = fc.record({
      command: arbCommand,
      args: arbArgs,
      env: arbEnv,
    }).map(({ command, args, env }) => {
      const config: McpStdioServerConfig = { command, args };
      if (env) config.env = env;
      return config;
    });

    // 生成 SSE 配置
    const arbSSEConfig = fc.record({
      url: arbUrl,
      headers: arbHeaders,
    }).map(({ url, headers }) => {
      const config: McpSSEServerConfig = { type: 'sse', url };
      if (headers) config.headers = headers;
      return config;
    });

    // 生成 HTTP 配置
    const arbHttpConfig = fc.record({
      url: arbUrl,
      headers: arbHeaders,
    }).map(({ url, headers }) => {
      const config: McpHttpServerConfig = { type: 'http', url };
      if (headers) config.headers = headers;
      return config;
    });

    // 生成任意有效配置
    const arbConfig = fc.oneof(arbStdioConfig, arbSSEConfig, arbHttpConfig);

    it('添加的配置应该能够被完整检索', () => {
      fc.assert(
        fc.property(
          arbServerName,
          arbConfig,
          (name, config) => {
            const manager = new MCPManager();

            manager.addServer(name, config);

            const retrieved = manager.getServerConfig(name);
            expect(retrieved).toEqual(config);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getServersConfig 应该返回所有配置的副本', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(arbServerName, arbConfig),
            { minLength: 1, maxLength: 5 }
          ).filter(arr => {
            // 确保名称唯一
            const names = arr.map(([name]) => name);
            return new Set(names).size === names.length;
          }),
          (servers) => {
            const manager = new MCPManager();

            for (const [name, config] of servers) {
              manager.addServer(name, config);
            }

            const allConfigs = manager.getServersConfig();

            // 验证数量
            expect(Object.keys(allConfigs)).toHaveLength(servers.length);

            // 验证每个配置
            for (const [name, config] of servers) {
              expect(allConfigs[name]).toEqual(config);
            }

            // 验证是副本（修改不影响原始）
            const firstName = servers[0][0];
            delete allConfigs[firstName];
            expect(manager.hasServer(firstName)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('listServers 应该返回所有服务器名称', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(arbServerName, arbConfig),
            { minLength: 0, maxLength: 5 }
          ).filter(arr => {
            const names = arr.map(([name]) => name);
            return new Set(names).size === names.length;
          }),
          (servers) => {
            const manager = new MCPManager();

            for (const [name, config] of servers) {
              manager.addServer(name, config);
            }

            const names = manager.listServers();

            expect(names).toHaveLength(servers.length);
            for (const [name] of servers) {
              expect(names).toContain(name);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('添加后移除应该使服务器不存在', () => {
      fc.assert(
        fc.property(
          arbServerName,
          arbConfig,
          (name, config) => {
            const manager = new MCPManager();

            manager.addServer(name, config);
            expect(manager.hasServer(name)).toBe(true);

            const removed = manager.removeServer(name);
            expect(removed).toBe(true);
            expect(manager.hasServer(name)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getTransportType 应该正确识别传输类型', () => {
      fc.assert(
        fc.property(
          arbConfig,
          (config) => {
            const manager = new MCPManager();
            const transport = manager.getTransportType(config);

            if ('command' in config) {
              expect(transport).toBe('stdio');
            } else if ('type' in config) {
              expect(transport).toBe(config.type);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('validateConfig 对有效配置应返回 valid=true', () => {
      fc.assert(
        fc.property(
          arbConfig,
          (config) => {
            const manager = new MCPManager();
            const result = manager.validateConfig(config);

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('配置的序列化和反序列化应该保持一致', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(arbServerName, arbConfig),
            { minLength: 1, maxLength: 5 }
          ).filter(arr => {
            const names = arr.map(([name]) => name);
            return new Set(names).size === names.length;
          }),
          (servers) => {
            const manager = new MCPManager();

            for (const [name, config] of servers) {
              manager.addServer(name, config);
            }

            // 序列化
            const json = manager.toJSON();

            // 反序列化
            const restored = MCPManager.fromJSON(json);

            // 验证
            expect(restored.listServers().sort()).toEqual(manager.listServers().sort());

            for (const [name, config] of servers) {
              expect(restored.getServerConfig(name)).toEqual(config);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('merge 应该正确合并配置', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(arbServerName, arbConfig),
            { minLength: 1, maxLength: 3 }
          ).filter(arr => {
            const names = arr.map(([name]) => name);
            return new Set(names).size === names.length;
          }),
          fc.array(
            fc.tuple(arbServerName, arbConfig),
            { minLength: 1, maxLength: 3 }
          ).filter(arr => {
            const names = arr.map(([name]) => name);
            return new Set(names).size === names.length;
          }),
          (servers1, servers2) => {
            const manager = new MCPManager();

            // 添加第一组
            for (const [name, config] of servers1) {
              manager.addServer(name, config);
            }

            // 合并第二组
            const other: MCPServerConfigMap = {};
            for (const [name, config] of servers2) {
              other[name] = config;
            }
            manager.merge(other);

            // 验证所有服务器都存在
            const allNames = new Set([
              ...servers1.map(([n]) => n),
              ...servers2.map(([n]) => n),
            ]);

            for (const name of allNames) {
              expect(manager.hasServer(name)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('filterByTransport 应该正确筛选', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(arbServerName, arbConfig),
            { minLength: 1, maxLength: 10 }
          ).filter(arr => {
            const names = arr.map(([name]) => name);
            return new Set(names).size === names.length;
          }),
          (servers) => {
            const manager = new MCPManager();

            for (const [name, config] of servers) {
              manager.addServer(name, config);
            }

            // 筛选每种类型
            const stdioServers = manager.filterByTransport('stdio');
            const sseServers = manager.filterByTransport('sse');
            const httpServers = manager.filterByTransport('http');

            // 验证总数
            const totalFiltered =
              Object.keys(stdioServers).length +
              Object.keys(sseServers).length +
              Object.keys(httpServers).length;

            expect(totalFiltered).toBe(servers.length);

            // 验证每个筛选结果的类型正确
            for (const config of Object.values(stdioServers)) {
              expect(manager.getTransportType(config)).toBe('stdio');
            }
            for (const config of Object.values(sseServers)) {
              expect(manager.getTransportType(config)).toBe('sse');
            }
            for (const config of Object.values(httpServers)) {
              expect(manager.getTransportType(config)).toBe('http');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('clear 后应该没有任何服务器', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(arbServerName, arbConfig),
            { minLength: 1, maxLength: 5 }
          ).filter(arr => {
            const names = arr.map(([name]) => name);
            return new Set(names).size === names.length;
          }),
          (servers) => {
            const manager = new MCPManager();

            for (const [name, config] of servers) {
              manager.addServer(name, config);
            }

            expect(manager.getServerCount()).toBe(servers.length);

            manager.clear();

            expect(manager.getServerCount()).toBe(0);
            expect(manager.listServers()).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getServersInfo 应该返回正确的信息', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(arbServerName, arbConfig),
            { minLength: 1, maxLength: 5 }
          ).filter(arr => {
            const names = arr.map(([name]) => name);
            return new Set(names).size === names.length;
          }),
          (servers) => {
            const manager = new MCPManager();

            for (const [name, config] of servers) {
              manager.addServer(name, config);
            }

            const info = manager.getServersInfo();

            expect(info).toHaveLength(servers.length);

            for (const [name, config] of servers) {
              const serverInfo = info.find(i => i.name === name);
              expect(serverInfo).toBeDefined();
              expect(serverInfo!.type).toBe(manager.getTransportType(config));
              expect(serverInfo!.config).toEqual(config);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
