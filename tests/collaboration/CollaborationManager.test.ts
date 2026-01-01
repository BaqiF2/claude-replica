/**
 * 协作管理器测试
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  CollaborationManager,
  ConfigTemplate,
} from '../../src/collaboration/CollaborationManager';

describe('CollaborationManager', () => {
  let tempDir: string;
  let manager: CollaborationManager;

  beforeEach(async () => {
    // 创建临时目录
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'collab-test-'));
    manager = new CollaborationManager(tempDir);

    // 创建项目配置目录
    await fs.mkdir(path.join(tempDir, '.claude-replica'), { recursive: true });
  });

  afterEach(async () => {
    // 清理临时目录
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('配置共享功能', () => {
    it('应该返回空配置当没有配置文件时', async () => {
      const config = await manager.getShareableConfig();
      expect(config).toEqual({});
    });

    it('应该正确加载共享配置', async () => {
      const testConfig = {
        model: 'claude-3-5-sonnet-latest',
        maxTurns: 10,
        permissionMode: 'default',
      };

      await fs.writeFile(
        path.join(tempDir, '.claude-replica', 'settings.json'),
        JSON.stringify(testConfig)
      );

      const config = await manager.getShareableConfig();
      expect(config.model).toBe('claude-3-5-sonnet-latest');
      expect(config.maxTurns).toBe(10);
    });


    it('应该保存共享配置', async () => {
      const testConfig = {
        model: 'claude-3-5-sonnet-latest',
        maxTurns: 15,
      };

      await manager.saveShareableConfig(testConfig);

      const content = await fs.readFile(
        path.join(tempDir, '.claude-replica', 'settings.json'),
        'utf-8'
      );
      const saved = JSON.parse(content);
      expect(saved.model).toBe('claude-3-5-sonnet-latest');
      expect(saved.maxTurns).toBe(15);
    });

    it('应该清理 MCP 服务器配置中的敏感信息', async () => {
      const testConfig = {
        mcpServers: {
          github: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: {
              GITHUB_TOKEN: 'ghp_actualtoken123456789012345678901234',
            },
          },
        },
      };

      await fs.writeFile(
        path.join(tempDir, '.claude-replica', 'settings.json'),
        JSON.stringify(testConfig)
      );

      const config = await manager.getShareableConfig();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mcpServers = config.mcpServers as any;
      const env = mcpServers.github.env as Record<string, string>;

      // 敏感值应该被替换为环境变量引用
      expect(env.GITHUB_TOKEN).toBe('${GITHUB_TOKEN}');
    });
  });

  describe('本地配置覆盖', () => {
    it('应该加载本地配置', async () => {
      const localConfig = {
        model: 'claude-3-opus-latest',
        maxBudgetUsd: 5.0,
      };

      await fs.writeFile(
        path.join(tempDir, '.claude-replica', 'settings.local.json'),
        JSON.stringify(localConfig)
      );

      const config = await manager.loadLocalConfig();
      expect(config.model).toBe('claude-3-opus-latest');
      expect(config.maxBudgetUsd).toBe(5.0);
    });

    it('应该保存本地配置', async () => {
      const localConfig = {
        model: 'claude-3-haiku-latest',
      };

      await manager.saveLocalConfig(localConfig);

      const content = await fs.readFile(
        path.join(tempDir, '.claude-replica', 'settings.local.json'),
        'utf-8'
      );
      const saved = JSON.parse(content);
      expect(saved.model).toBe('claude-3-haiku-latest');
    });


    it('应该正确合并共享配置和本地配置', async () => {
      // 创建共享配置
      const sharedConfig = {
        model: 'claude-3-5-sonnet-latest',
        maxTurns: 10,
        permissionMode: 'default',
      };
      await fs.writeFile(
        path.join(tempDir, '.claude-replica', 'settings.json'),
        JSON.stringify(sharedConfig)
      );

      // 创建本地配置
      const localConfig = {
        model: 'claude-3-opus-latest', // 覆盖
        maxBudgetUsd: 5.0, // 新增
      };
      await fs.writeFile(
        path.join(tempDir, '.claude-replica', 'settings.local.json'),
        JSON.stringify(localConfig)
      );

      const merged = await manager.getMergedConfig();
      expect(merged.model).toBe('claude-3-opus-latest'); // 本地覆盖
      expect(merged.maxTurns).toBe(10); // 保留共享
      expect(merged.maxBudgetUsd).toBe(5.0); // 新增本地
    });
  });

  describe('个人认证配置', () => {
    it('应该能够保存和加载认证配置', async () => {
      const authConfig = { customToken: 'test-token' };
      await manager.saveAuthConfig(authConfig);
      
      const loaded = await manager.loadAuthConfig();
      expect(loaded.customToken).toBe('test-token');
    });
  });

  describe('.gitignore 管理', () => {
    it('应该创建 .gitignore 文件并添加必要条目', async () => {
      await manager.ensureGitignore();

      const content = await fs.readFile(
        path.join(tempDir, '.gitignore'),
        'utf-8'
      );

      expect(content).toContain('.claude-replica/settings.local.json');
      expect(content).toContain('.claude-replica/auth.json');
      expect(content).toContain('.claude-replica/sessions/');
    });

    it('应该在现有 .gitignore 中追加条目', async () => {
      // 创建现有的 .gitignore
      await fs.writeFile(
        path.join(tempDir, '.gitignore'),
        'node_modules/\n.env\n'
      );

      await manager.ensureGitignore();

      const content = await fs.readFile(
        path.join(tempDir, '.gitignore'),
        'utf-8'
      );

      expect(content).toContain('node_modules/');
      expect(content).toContain('.claude-replica/settings.local.json');
    });

    it('应该正确识别敏感文件', () => {
      expect(manager.shouldIgnoreFile('settings.local.json')).toBe(true);
      expect(manager.shouldIgnoreFile('.env')).toBe(true);
      expect(manager.shouldIgnoreFile('private.key')).toBe(true);
      expect(manager.shouldIgnoreFile('settings.json')).toBe(false);
      expect(manager.shouldIgnoreFile('README.md')).toBe(false);
    });
  });


  describe('配置导出和导入', () => {
    it('应该导出配置模板', async () => {
      const testConfig = {
        model: 'claude-3-5-sonnet-latest',
        maxTurns: 10,
      };
      await fs.writeFile(
        path.join(tempDir, '.claude-replica', 'settings.json'),
        JSON.stringify(testConfig)
      );

      const template = await manager.exportConfigTemplate(
        'test-template',
        '测试模板'
      );

      expect(template.name).toBe('test-template');
      expect(template.description).toBe('测试模板');
      expect(template.version).toBe('1.0.0');
      expect(template.config.model).toBe('claude-3-5-sonnet-latest');
      expect(template.createdAt).toBeDefined();
    });

    it('应该导出配置模板到文件', async () => {
      const testConfig = {
        model: 'claude-3-5-sonnet-latest',
      };
      await fs.writeFile(
        path.join(tempDir, '.claude-replica', 'settings.json'),
        JSON.stringify(testConfig)
      );

      const outputPath = path.join(tempDir, 'template.json');
      await manager.exportConfigTemplateToFile(outputPath, 'my-template');

      const content = await fs.readFile(outputPath, 'utf-8');
      const template = JSON.parse(content) as ConfigTemplate;
      expect(template.name).toBe('my-template');
    });

    it('应该从文件导入配置模板', async () => {
      const template: ConfigTemplate = {
        name: 'imported-template',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        config: {
          model: 'claude-3-opus-latest',
          maxTurns: 20,
        },
      };

      const templatePath = path.join(tempDir, 'import-template.json');
      await fs.writeFile(templatePath, JSON.stringify(template));

      await manager.importConfigTemplateFromFile(templatePath);

      const config = await manager.getShareableConfig();
      expect(config.model).toBe('claude-3-opus-latest');
      expect(config.maxTurns).toBe(20);
    });

    it('应该在导入时合并配置而非覆盖', async () => {
      // 创建现有配置
      const existingConfig = {
        model: 'claude-3-5-sonnet-latest',
        maxBudgetUsd: 10.0,
      };
      await fs.writeFile(
        path.join(tempDir, '.claude-replica', 'settings.json'),
        JSON.stringify(existingConfig)
      );

      // 导入新模板
      const template: ConfigTemplate = {
        name: 'merge-template',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        config: {
          maxTurns: 15,
        },
      };

      await manager.importConfigTemplate(template, { overwrite: false });

      const config = await manager.getShareableConfig();
      expect(config.model).toBe('claude-3-5-sonnet-latest'); // 保留
      expect(config.maxBudgetUsd).toBe(10.0); // 保留
      expect(config.maxTurns).toBe(15); // 新增
    });
  });


  describe('配置验证', () => {
    it('应该验证有效的配置', async () => {
      const validConfig = {
        model: 'claude-3-5-sonnet-latest',
        permissionMode: 'default',
        maxTurns: 10,
      };
      await fs.writeFile(
        path.join(tempDir, '.claude-replica', 'settings.json'),
        JSON.stringify(validConfig)
      );

      const result = await manager.validateProjectConfig();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该检测无效的权限模式', async () => {
      const invalidConfig = {
        permissionMode: 'invalid-mode',
      };
      await fs.writeFile(
        path.join(tempDir, '.claude-replica', 'settings.json'),
        JSON.stringify(invalidConfig)
      );

      const result = await manager.validateProjectConfig();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'permissionMode')).toBe(true);
    });

    it('应该检测工具配置冲突', async () => {
      const conflictConfig = {
        allowedTools: ['Read', 'Write', 'Bash'],
        disallowedTools: ['Bash', 'Grep'],
      };
      await fs.writeFile(
        path.join(tempDir, '.claude-replica', 'settings.json'),
        JSON.stringify(conflictConfig)
      );

      const result = await manager.validateProjectConfig();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'conflict')).toBe(true);
    });

    it('应该警告 bypassPermissions 模式', async () => {
      const dangerousConfig = {
        permissionMode: 'bypassPermissions',
      };
      await fs.writeFile(
        path.join(tempDir, '.claude-replica', 'settings.json'),
        JSON.stringify(dangerousConfig)
      );

      const result = await manager.validateProjectConfig();
      expect(result.warnings.some((w) => w.path === 'permissionMode')).toBe(true);
    });

    it('应该验证 MCP 服务器配置', async () => {
      const invalidMcpConfig = {
        mcpServers: {
          invalid: {
            command: 123, // 应该是字符串
            args: 'not-array', // 应该是数组
          },
        },
      };
      await fs.writeFile(
        path.join(tempDir, '.claude-replica', 'settings.json'),
        JSON.stringify(invalidMcpConfig)
      );

      const result = await manager.validateProjectConfig();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.includes('mcpServers'))).toBe(true);
    });
  });

  describe('团队一致性检查', () => {
    it('应该检测配置差异', async () => {
      // 创建共享配置
      const sharedConfig = {
        model: 'claude-3-5-sonnet-latest',
        maxTurns: 10,
      };
      await fs.writeFile(
        path.join(tempDir, '.claude-replica', 'settings.json'),
        JSON.stringify(sharedConfig)
      );

      // 创建不同的本地配置
      const localConfig = {
        model: 'claude-3-opus-latest',
        maxTurns: 20,
      };
      await fs.writeFile(
        path.join(tempDir, '.claude-replica', 'settings.local.json'),
        JSON.stringify(localConfig)
      );

      const result = await manager.validateTeamConsistency();
      expect(result.consistent).toBe(false);
      expect(result.differences.length).toBeGreaterThan(0);
      expect(result.differences.some((d) => d.key === 'model')).toBe(true);
    });

    it('应该报告一致的配置', async () => {
      // 创建共享配置
      const sharedConfig = {
        model: 'claude-3-5-sonnet-latest',
      };
      await fs.writeFile(
        path.join(tempDir, '.claude-replica', 'settings.json'),
        JSON.stringify(sharedConfig)
      );

      // 本地配置为空
      const result = await manager.validateTeamConsistency();
      expect(result.consistent).toBe(true);
      expect(result.differences).toHaveLength(0);
    });
  });
});
