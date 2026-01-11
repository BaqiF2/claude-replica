/**
 * MCPService 测试
 *
 * 覆盖 MCPService.listServerConfig/editConfig/validateConfig，确保目录查找、编辑器启动和配置校验符合预期。
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { spawn, SpawnOptions } from 'child_process';
import { MCPService } from '../../src/mcp/MCPService';
import {
  ConfigValidationResult,
  MCPManager,
  McpServerConfig,
} from '../../src/mcp/MCPManager';

type MockedMCPManager = jest.Mocked<MCPManager>;

const createMockManager = (): MockedMCPManager =>
  ({
    getConfigPath: jest.fn(),
    loadServersFromConfig: jest.fn().mockResolvedValue(undefined),
    getServersInfo: jest.fn().mockReturnValue([]),
    validateConfig: jest.fn().mockReturnValue({ valid: true, errors: [] }),
    getTransportType: jest.fn().mockReturnValue('stdio'),
  } as unknown as MockedMCPManager);

describe('MCPService', () => {
  let tempDir: string;
  let mockManager: MockedMCPManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-mcp-service-'));
    mockManager = createMockManager();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const createService = (options?: { spawnProcess?: typeof spawn }) =>
    new MCPService({ mcpManager: mockManager, ...options });

  describe('listServerConfig()', () => {
    it('returns empty list when .mcp.json is missing', async () => {
      const configPath = path.join(tempDir, '.mcp.json');
      mockManager.getConfigPath.mockResolvedValue(configPath);

      const service = createService();
      const result = await service.listServerConfig(tempDir);

      expect(mockManager.loadServersFromConfig).not.toHaveBeenCalled();
      expect(result.servers).toHaveLength(0);
      expect(result.configPath).toBe(configPath);
    });

    it('loads configured servers when .mcp.json exists', async () => {
      const configPath = path.join(tempDir, '.mcp.json');
      await fs.writeFile(
        configPath,
        JSON.stringify({
          mcpServers: {
            filesystem: {
              command: 'node',
              args: ['--version'],
            },
          },
        })
      );

      const expectedServers: Array<{
        name: string;
        type: 'stdio';
        config: McpServerConfig;
      }> = [
        {
          name: 'filesystem',
          type: 'stdio',
          config: { command: 'node', args: ['--version'] },
        },
      ];

      mockManager.getConfigPath.mockResolvedValue(configPath);
      mockManager.getServersInfo.mockReturnValue(expectedServers);

      const service = createService();
      const result = await service.listServerConfig(tempDir);

      expect(mockManager.loadServersFromConfig).toHaveBeenCalledWith(configPath);
      expect(result.servers).toBe(expectedServers);
      expect(result.configPath).toBe(configPath);
    });
  });

  describe('editConfig()', () => {
    it('falls back to the default editors when the configured one is unavailable', async () => {
      const configPath = path.join(tempDir, '.mcp.json');
      mockManager.getConfigPath.mockResolvedValue(configPath);

      const spawnMock = jest.fn().mockImplementation(
        (command: string, _args: string[], _options?: SpawnOptions) => {
          if (command === 'code') {
            const error = new Error('command not found') as NodeJS.ErrnoException;
            error.code = 'ENOENT';
            throw error;
          }

          const fakeChild = {
            on: (event: string, callback: (...args: unknown[]) => void) => {
              if (event === 'exit') {
                queueMicrotask(() => callback(0));
              }
            },
          } as unknown as ReturnType<typeof spawn>;

          return fakeChild;
        }
      );

      const originalEditor = process.env.EDITOR;
      delete process.env.EDITOR;

      try {
        const service = createService({ spawnProcess: spawnMock });
        const result = await service.editConfig(tempDir);

        expect(result.editor).toBe('vim');
        expect(spawnMock).toHaveBeenCalledTimes(2);
        expect(spawnMock.mock.calls[0][0]).toBe('code');
        expect(spawnMock.mock.calls[1][0]).toBe('vim');
        expect(spawnMock.mock.calls[1][1]).toContain(configPath);

        const content = await fs.readFile(configPath, 'utf-8');
        expect(content).toContain('"mcpServers": {}');
      } finally {
        if (originalEditor === undefined) {
          delete process.env.EDITOR;
        } else {
          process.env.EDITOR = originalEditor;
        }
      }
    });
  });

  describe('validateConfig()', () => {
    it('reports syntax errors with location details', async () => {
      const configPath = path.join(tempDir, '.mcp.json');
      await fs.writeFile(configPath, '{ "mcpServers": [ }', 'utf-8');
      mockManager.getConfigPath.mockResolvedValue(configPath);

      const service = createService();
      const result = await service.validateConfig(tempDir);

      expect(mockManager.validateConfig).not.toHaveBeenCalled();
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('Invalid JSON syntax');
      if (result.errors[0].line !== undefined) {
        expect(result.errors[0].line).toBeGreaterThanOrEqual(1);
      }
      if (result.errors[0].column !== undefined) {
        expect(result.errors[0].column).toBeGreaterThanOrEqual(1);
      }
    });

    it('reports structural errors when mcpServers is invalid', async () => {
      const configPath = path.join(tempDir, '.mcp.json');
      await fs.writeFile(configPath, JSON.stringify({ mcpServers: [] }), 'utf-8');
      mockManager.getConfigPath.mockResolvedValue(configPath);

      const service = createService();
      const result = await service.validateConfig(tempDir);

      expect(result.valid).toBe(false);
      expect(result.errors.some((error) => error.path === 'mcpServers')).toBe(true);
    });

    it('aggregates MCPManager validation errors with precise paths', async () => {
      const configPath = path.join(tempDir, '.mcp.json');
      await fs.writeFile(
        configPath,
        JSON.stringify({
          mcpServers: {
            app: {
              command: 'echo',
              args: 'not-an-array',
            },
          },
        }),
        'utf-8'
      );

      mockManager.getConfigPath.mockResolvedValue(configPath);
      const expectedResult: ConfigValidationResult = {
        valid: false,
        errors: ['args must be an array'],
      };
      mockManager.validateConfig.mockReturnValue(expectedResult);
      mockManager.getTransportType.mockReturnValue('stdio');

      const service = createService();
      const result = await service.validateConfig(tempDir);

      expect(mockManager.validateConfig).toHaveBeenCalled();
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((error) => error.path === 'mcpServers.app.args')
      ).toBe(true);
    });

    it('counts transports when the configuration is valid', async () => {
      const configPath = path.join(tempDir, '.mcp.json');
      await fs.writeFile(
        configPath,
        JSON.stringify({
          mcpServers: {
            runtime: {
              command: 'node',
              args: ['--help'],
            },
          },
        }),
        'utf-8'
      );

      mockManager.getConfigPath.mockResolvedValue(configPath);
      mockManager.validateConfig.mockReturnValue({ valid: true, errors: [] });
      mockManager.getTransportType.mockReturnValue('stdio');

      const service = createService();
      const result = await service.validateConfig(tempDir);

      expect(result.valid).toBe(true);
      expect(result.serverCount).toBe(1);
      expect(result.transportCounts.stdio).toBe(1);
    });
  });
});
