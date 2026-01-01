/**
 * SandboxManager 单元测试
 *
 * 测试沙箱管理器的核心功能
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  SandboxManager,
  SandboxSettings,
  SandboxViolation,
} from '../../src/sandbox/SandboxManager';

describe('SandboxManager', () => {
  let sandboxManager: SandboxManager;
  let tempDir: string;

  beforeEach(async () => {
    sandboxManager = new SandboxManager();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-test-'));
  });

  afterEach(async () => {
    // 清理临时目录
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  describe('构造函数和基本操作', () => {
    it('应该使用默认设置创建实例', () => {
      const manager = new SandboxManager();
      expect(manager.isEnabled()).toBe(false);
    });

    it('应该使用自定义设置创建实例', () => {
      const settings: SandboxSettings = {
        enabled: true,
        excludedCommands: ['rm -rf'],
      };
      const manager = new SandboxManager({ settings });
      expect(manager.isEnabled()).toBe(true);
    });

    it('应该能够启用和禁用沙箱', () => {
      sandboxManager.enable();
      expect(sandboxManager.isEnabled()).toBe(true);

      sandboxManager.disable();
      expect(sandboxManager.isEnabled()).toBe(false);
    });
  });

  describe('配置加载', () => {
    it('应该从配置文件加载沙箱设置', async () => {
      const configPath = path.join(tempDir, 'settings.json');
      const config = {
        sandbox: {
          enabled: true,
          excludedCommands: ['dangerous-cmd'],
          network: {
            blockedDomains: ['evil.com'],
          },
        },
      };
      await fs.writeFile(configPath, JSON.stringify(config));

      const settings = await sandboxManager.loadConfig(configPath);

      expect(settings.enabled).toBe(true);
      expect(settings.excludedCommands).toContain('dangerous-cmd');
      expect(settings.network?.blockedDomains).toContain('evil.com');
    });

    it('应该在配置文件不存在时返回默认设置', async () => {
      const configPath = path.join(tempDir, 'nonexistent.json');
      const settings = await sandboxManager.loadConfig(configPath);

      expect(settings.enabled).toBe(false);
    });

    it('应该从目录加载配置', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      await fs.mkdir(claudeDir, { recursive: true });

      const config = {
        sandbox: {
          enabled: true,
          excludedCommands: ['test-cmd'],
        },
      };
      await fs.writeFile(
        path.join(claudeDir, 'settings.json'),
        JSON.stringify(config)
      );

      const settings = await sandboxManager.loadFromDirectory(tempDir);

      expect(settings.enabled).toBe(true);
      expect(settings.excludedCommands).toContain('test-cmd');
    });
  });

  describe('命令检查', () => {
    beforeEach(() => {
      sandboxManager.enable();
    });

    it('沙箱禁用时应该允许所有命令', () => {
      sandboxManager.disable();
      const result = sandboxManager.checkCommand('rm -rf /');
      expect(result.allowed).toBe(true);
    });

    it('应该阻止默认危险命令', () => {
      const dangerousCommands = [
        'rm -rf /',
        'rm -rf /*',
        'dd if=/dev/zero',
        ':(){:|:&};:',
        'shutdown',
        'reboot',
      ];

      for (const cmd of dangerousCommands) {
        const result = sandboxManager.checkCommand(cmd);
        expect(result.allowed).toBe(false);
        expect(result.reason).toBeDefined();
      }
    });

    it('应该允许安全命令', () => {
      const safeCommands = ['ls -la', 'cat file.txt', 'npm install', 'git status'];

      for (const cmd of safeCommands) {
        const result = sandboxManager.checkCommand(cmd);
        expect(result.allowed).toBe(true);
      }
    });

    it('应该阻止用户配置的排除命令', () => {
      sandboxManager.addExcludedCommand('custom-dangerous');

      const result = sandboxManager.checkCommand('custom-dangerous arg1');
      expect(result.allowed).toBe(false);
      expect(result.matchedRule).toBe('custom-dangerous');
    });

    it('应该支持通配符匹配', () => {
      sandboxManager.addExcludedCommand('rm -rf *');

      const result = sandboxManager.checkCommand('rm -rf /home/user');
      expect(result.allowed).toBe(false);
    });

    it('应该能够移除排除命令', () => {
      sandboxManager.addExcludedCommand('test-cmd');
      sandboxManager.removeExcludedCommand('test-cmd');

      const result = sandboxManager.checkCommand('test-cmd');
      expect(result.allowed).toBe(true);
    });
  });

  describe('网络检查', () => {
    beforeEach(() => {
      sandboxManager.enable();
    });

    it('沙箱禁用时应该允许所有网络访问', () => {
      sandboxManager.disable();
      const result = sandboxManager.checkNetwork('localhost');
      expect(result.allowed).toBe(true);
    });

    it('应该阻止默认内网地址', () => {
      const internalAddresses = [
        'localhost',
        '127.0.0.1',
        '192.168.1.1',
        '10.0.0.1',
        '172.16.0.1',
      ];

      for (const addr of internalAddresses) {
        const result = sandboxManager.checkNetwork(addr);
        expect(result.allowed).toBe(false);
      }
    });

    it('应该允许外部域名', () => {
      const externalDomains = ['google.com', 'github.com', 'api.example.com'];

      for (const domain of externalDomains) {
        const result = sandboxManager.checkNetwork(domain);
        expect(result.allowed).toBe(true);
      }
    });

    it('应该阻止用户配置的域名', () => {
      sandboxManager.addBlockedDomain('blocked.com');

      const result = sandboxManager.checkNetwork('blocked.com');
      expect(result.allowed).toBe(false);
      expect(result.matchedRule).toBe('blocked.com');
    });

    it('应该支持域名白名单模式', () => {
      sandboxManager.addAllowedDomain('allowed.com');
      sandboxManager.addAllowedDomain('*.trusted.com');

      // 白名单中的域名应该被允许
      expect(sandboxManager.checkNetwork('allowed.com').allowed).toBe(true);
      expect(sandboxManager.checkNetwork('sub.trusted.com').allowed).toBe(true);

      // 不在白名单中的域名应该被阻止
      expect(sandboxManager.checkNetwork('other.com').allowed).toBe(false);
    });

    it('应该能够移除域名规则', () => {
      sandboxManager.addBlockedDomain('test.com');
      sandboxManager.removeBlockedDomain('test.com');

      const result = sandboxManager.checkNetwork('test.com');
      expect(result.allowed).toBe(true);
    });
  });

  describe('违规记录', () => {
    let violations: SandboxViolation[];

    beforeEach(() => {
      violations = [];
      sandboxManager = new SandboxManager({
        settings: { enabled: true },
        onViolation: (v) => {
          violations.push(v);
        },
      });
    });

    it('应该记录命令违规', () => {
      sandboxManager.checkCommand('rm -rf /');

      expect(violations.length).toBe(1);
      expect(violations[0].type).toBe('command');
      expect(violations[0].details.command).toBe('rm -rf /');
    });

    it('应该记录网络违规', () => {
      sandboxManager.checkNetwork('localhost');

      expect(violations.length).toBe(1);
      expect(violations[0].type).toBe('network');
      expect(violations[0].details.domain).toBe('localhost');
    });

    it('应该获取违规历史', () => {
      sandboxManager.checkCommand('rm -rf /');
      sandboxManager.checkNetwork('localhost');

      const history = sandboxManager.getViolationHistory();
      expect(history.length).toBe(2);
    });

    it('应该限制违规历史大小', () => {
      const manager = new SandboxManager({
        settings: { enabled: true },
        maxViolationHistory: 5,
      });

      // 触发 10 次违规
      for (let i = 0; i < 10; i++) {
        manager.checkCommand('rm -rf /');
      }

      const history = manager.getViolationHistory();
      expect(history.length).toBe(5);
    });

    it('应该能够清除违规历史', () => {
      sandboxManager.checkCommand('rm -rf /');
      sandboxManager.clearViolationHistory();

      const history = sandboxManager.getViolationHistory();
      expect(history.length).toBe(0);
    });
  });

  describe('违规忽略设置', () => {
    it('应该根据设置忽略网络违规', () => {
      sandboxManager = new SandboxManager({
        settings: {
          enabled: true,
          ignoreViolations: { network: true },
        },
      });

      const result = sandboxManager.checkNetwork('localhost');
      // 违规被忽略，所以允许
      expect(result.allowed).toBe(true);
    });

    it('应该根据设置忽略文件系统违规', () => {
      sandboxManager = new SandboxManager({
        settings: {
          enabled: true,
          ignoreViolations: { filesystem: true },
        },
      });

      // 文件系统违规目前没有直接的检查方法，但设置应该被保存
      const settings = sandboxManager.getSettings();
      expect(settings.ignoreViolations?.filesystem).toBe(true);
    });
  });

  describe('SDK Options 集成', () => {
    it('沙箱禁用时应该返回 undefined', () => {
      sandboxManager.disable();
      const options = sandboxManager.getSDKOptions();
      expect(options).toBeUndefined();
    });

    it('沙箱启用时应该返回完整配置', () => {
      sandboxManager.enable();
      sandboxManager.addExcludedCommand('custom-cmd');

      const options = sandboxManager.getSDKOptions();

      expect(options).toBeDefined();
      expect(options?.enabled).toBe(true);
      expect(options?.excludedCommands).toContain('custom-cmd');
      // 应该包含默认排除命令
      expect(options?.excludedCommands).toContain('rm -rf /');
    });
  });

  describe('设置更新', () => {
    it('应该能够更新部分设置', () => {
      sandboxManager.updateSettings({
        enabled: true,
        autoAllowBashIfSandboxed: true,
      });

      const settings = sandboxManager.getSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.autoAllowBashIfSandboxed).toBe(true);
    });

    it('应该能够更新网络设置', () => {
      sandboxManager.updateSettings({
        network: {
          blockedDomains: ['new-blocked.com'],
        },
      });

      const settings = sandboxManager.getSettings();
      expect(settings.network?.blockedDomains).toContain('new-blocked.com');
    });
  });

  describe('静态工厂方法', () => {
    it('应该创建默认设置', () => {
      const settings = SandboxManager.createDefaultSettings();

      expect(settings.enabled).toBe(false);
      expect(settings.excludedCommands).toEqual([]);
      expect(settings.network?.allowedDomains).toEqual([]);
      expect(settings.network?.blockedDomains).toEqual([]);
    });

    it('应该创建严格设置', () => {
      const settings = SandboxManager.createStrictSettings();

      expect(settings.enabled).toBe(true);
      expect(settings.excludedCommands).toContain('curl');
      expect(settings.excludedCommands).toContain('wget');
      expect(settings.excludedCommands).toContain('ssh');
    });
  });

  describe('获取所有排除命令', () => {
    it('应该返回默认和用户配置的排除命令', () => {
      sandboxManager.addExcludedCommand('user-cmd');

      const allExcluded = sandboxManager.getAllExcludedCommands();

      expect(allExcluded).toContain('rm -rf /');
      expect(allExcluded).toContain('user-cmd');
    });
  });
});
