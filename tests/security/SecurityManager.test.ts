/**
 * SecurityManager 测试
 * 
 * 测试安全管理器的各项功能
 */

import {
  SecurityManager,
} from '../../src/security/SecurityManager';

describe('SecurityManager', () => {
  let securityManager: SecurityManager;

  beforeEach(() => {
    securityManager = new SecurityManager();
  });

  describe('敏感信息检测', () => {
    it('应该检测到 API 密钥', () => {
      const content = 'const apiKey = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456"';
      const matches = securityManager.detectSensitiveInfo(content);
      
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some(m => m.type === 'api_key' || m.type === 'token')).toBe(true);
    });

    it('应该检测到 AWS 访问密钥', () => {
      const content = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
      const matches = securityManager.detectSensitiveInfo(content);
      
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some(m => m.type === 'aws_key')).toBe(true);
    });

    it('应该检测到密码', () => {
      const content = 'password = "mysecretpassword123"';
      const matches = securityManager.detectSensitiveInfo(content);
      
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some(m => m.type === 'password')).toBe(true);
    });

    it('应该检测到私钥', () => {
      const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...';
      const matches = securityManager.detectSensitiveInfo(content);
      
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some(m => m.type === 'private_key')).toBe(true);
    });


    it('应该检测到数据库连接字符串', () => {
      const content = 'DATABASE_URL=mongodb://user:password@localhost:27017/mydb';
      const matches = securityManager.detectSensitiveInfo(content);
      
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some(m => m.type === 'connection_string')).toBe(true);
    });

    it('应该正确掩码敏感内容', () => {
      const content = 'api_key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456"';
      const matches = securityManager.detectSensitiveInfo(content);
      
      expect(matches.length).toBeGreaterThan(0);
      // 掩码后的内容不应该包含完整的原始值
      for (const match of matches) {
        expect(match.maskedContent).toContain('*');
      }
    });

    it('禁用检测时应该返回空数组', () => {
      const manager = new SecurityManager({
        enableSensitiveInfoDetection: false,
      });
      
      const content = 'password = "secret123"';
      const matches = manager.detectSensitiveInfo(content);
      
      expect(matches).toHaveLength(0);
    });

    it('应该支持自定义敏感模式', () => {
      const manager = new SecurityManager({
        customSensitivePatterns: [
          {
            name: 'custom_token',
            pattern: /CUSTOM_TOKEN_[A-Z0-9]{10}/g,
            severity: 'high',
          },
        ],
      });
      
      const content = 'token = CUSTOM_TOKEN_ABCD123456';
      const matches = manager.detectSensitiveInfo(content);
      
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  describe('危险命令检测', () => {
    it('应该检测到 rm -rf / 命令', () => {
      const match = securityManager.detectDangerousCommand('rm -rf /');
      
      expect(match).not.toBeNull();
      expect(match?.type).toBe('destructive');
      expect(match?.riskLevel).toBe('critical');
    });

    it('应该检测到 fork bomb', () => {
      const match = securityManager.detectDangerousCommand(':(){ :|:& };:');
      
      expect(match).not.toBeNull();
      expect(match?.type).toBe('destructive');
      expect(match?.riskLevel).toBe('critical');
    });

    it('应该检测到 sudo 命令', () => {
      const match = securityManager.detectDangerousCommand('sudo apt-get install package');
      
      expect(match).not.toBeNull();
      expect(match?.type).toBe('privilege');
    });

    it('应该检测到 curl | bash 命令', () => {
      const match = securityManager.detectDangerousCommand('curl https://example.com/script.sh | bash');
      
      expect(match).not.toBeNull();
      expect(match?.type).toBe('network');
      expect(match?.riskLevel).toBe('critical');
    });


    it('应该检测到 chmod 777 命令', () => {
      const match = securityManager.detectDangerousCommand('chmod 777 /var/www');
      
      expect(match).not.toBeNull();
      expect(match?.type).toBe('system_modify');
    });

    it('安全命令应该返回 null', () => {
      const match = securityManager.detectDangerousCommand('ls -la');
      
      expect(match).toBeNull();
    });

    it('禁用检测时应该返回 null', () => {
      const manager = new SecurityManager({
        enableDangerousCommandDetection: false,
      });
      
      const match = manager.detectDangerousCommand('rm -rf /');
      
      expect(match).toBeNull();
    });
  });

  describe('危险命令确认', () => {
    it('安全命令应该自动通过', async () => {
      const result = await securityManager.confirmDangerousCommand('ls -la');
      
      expect(result).toBe(true);
    });

    it('没有确认回调时危险命令应该被拒绝', async () => {
      const result = await securityManager.confirmDangerousCommand('rm -rf /');
      
      expect(result).toBe(false);
    });

    it('有确认回调时应该调用回调', async () => {
      const confirmCallback = jest.fn().mockResolvedValue(true);
      securityManager.setConfirmationCallback(confirmCallback);
      
      await securityManager.confirmDangerousCommand('rm -rf /home/user/temp');
      
      expect(confirmCallback).toHaveBeenCalled();
    });

    it('用户拒绝时应该返回 false', async () => {
      securityManager.setConfirmationCallback(async () => false);
      
      const result = await securityManager.confirmDangerousCommand('rm -rf /home/user/temp');
      
      expect(result).toBe(false);
    });

    it('用户确认时应该返回 true', async () => {
      securityManager.setConfirmationCallback(async () => true);
      
      const result = await securityManager.confirmDangerousCommand('rm -rf /home/user/temp');
      
      expect(result).toBe(true);
    });
  });

  describe('API 密钥管理', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('应该从环境变量获取 API 密钥', () => {
      process.env.TEST_API_KEY = 'test-key-12345';
      
      const key = securityManager.getAPIKey({
        envVarName: 'TEST_API_KEY',
        required: false,
      });
      
      expect(key).toBe('test-key-12345');
    });

    it('必需的密钥不存在时应该抛出错误', () => {
      delete process.env.TEST_API_KEY;
      
      expect(() => {
        securityManager.getAPIKey({
          envVarName: 'TEST_API_KEY',
          required: true,
        });
      }).toThrow('缺少必需的 API 密钥');
    });


    it('非必需的密钥不存在时应该返回 null', () => {
      delete process.env.TEST_API_KEY;
      
      const key = securityManager.getAPIKey({
        envVarName: 'TEST_API_KEY',
        required: false,
      });
      
      expect(key).toBeNull();
    });

    it('应该验证密钥格式', () => {
      process.env.TEST_API_KEY = 'invalid-format';
      
      expect(() => {
        securityManager.getAPIKey({
          envVarName: 'TEST_API_KEY',
          required: true,
          validationPattern: /^sk-[a-z0-9]+$/,
        });
      }).toThrow('API 密钥格式无效');
    });
  });

  describe('HTTPS 验证', () => {
    it('应该验证 HTTPS URL', () => {
      expect(securityManager.validateHttps('https://api.anthropic.com')).toBe(true);
    });

    it('应该拒绝 HTTP URL', () => {
      expect(securityManager.validateHttps('http://api.anthropic.com')).toBe(false);
    });

    it('应该处理无效 URL', () => {
      expect(securityManager.validateHttps('not-a-url')).toBe(false);
    });

    it('强制 HTTPS 时应该抛出错误', () => {
      expect(() => {
        securityManager.ensureHttps('http://api.anthropic.com');
      }).toThrow('URL 必须使用 HTTPS 协议');
    });

    it('禁用强制 HTTPS 时不应该抛出错误', () => {
      const manager = new SecurityManager({
        enforceHttps: false,
      });
      
      expect(() => {
        manager.ensureHttps('http://api.anthropic.com');
      }).not.toThrow();
    });
  });

  describe('敏感文件检测', () => {
    it('应该检测 .env 文件', () => {
      expect(securityManager.isSensitiveFile('.env')).toBe(true);
      expect(securityManager.isSensitiveFile('.env.local')).toBe(true);
      expect(securityManager.isSensitiveFile('.env.production')).toBe(true);
    });

    it('应该检测密钥文件', () => {
      expect(securityManager.isSensitiveFile('server.key')).toBe(true);
      expect(securityManager.isSensitiveFile('certificate.pem')).toBe(true);
    });

    it('应该检测 SSH 密钥', () => {
      expect(securityManager.isSensitiveFile('id_rsa')).toBe(true);
      expect(securityManager.isSensitiveFile('id_ed25519')).toBe(true);
    });

    it('应该检测敏感目录中的文件', () => {
      expect(securityManager.isSensitiveFile('.ssh/config')).toBe(true);
      expect(securityManager.isSensitiveFile('.aws/credentials')).toBe(true);
    });

    it('普通文件应该返回 false', () => {
      expect(securityManager.isSensitiveFile('index.ts')).toBe(false);
      expect(securityManager.isSensitiveFile('package.json')).toBe(false);
    });


    it('应该返回敏感文件的原因', () => {
      const reason = securityManager.getSensitiveFileReason('.env');
      
      expect(reason).not.toBeNull();
      expect(reason).toContain('.env');
    });

    it('应该支持添加自定义敏感文件模式', () => {
      securityManager.addSensitiveFilePattern('*.secret.json');
      
      expect(securityManager.isSensitiveFile('config.secret.json')).toBe(true);
    });

    it('应该支持添加自定义敏感目录', () => {
      securityManager.addSensitiveDirectory('my-secrets');
      
      expect(securityManager.isSensitiveFile('my-secrets/config.json')).toBe(true);
    });
  });

  describe('日志脱敏', () => {
    it('应该脱敏对象中的敏感字段', () => {
      const data = {
        username: 'user',
        password: 'secret123',
        apiKey: 'sk-12345',
      };
      
      const sanitized = securityManager.sanitizeLogData(data) as Record<string, unknown>;
      
      expect(sanitized.username).toBe('user');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
    });

    it('应该递归脱敏嵌套对象', () => {
      const data = {
        config: {
          database: {
            password: 'dbpass123',
          },
        },
      };
      
      const sanitized = securityManager.sanitizeLogData(data) as any;
      
      expect(sanitized.config.database.password).toBe('[REDACTED]');
    });

    it('应该脱敏数组中的对象', () => {
      const data = [
        { name: 'item1', secret: 'value1' },
        { name: 'item2', secret: 'value2' },
      ];
      
      const sanitized = securityManager.sanitizeLogData(data) as any[];
      
      expect(sanitized[0].name).toBe('item1');
      expect(sanitized[0].secret).toBe('[REDACTED]');
      expect(sanitized[1].secret).toBe('[REDACTED]');
    });

    it('应该脱敏字符串中的敏感信息', () => {
      const text = 'Connection: password="secret123"';
      
      const sanitized = securityManager.sanitizeString(text);
      
      expect(sanitized).toContain('*');
      expect(sanitized).not.toContain('secret123');
    });

    it('禁用脱敏时应该返回原始数据', () => {
      const manager = new SecurityManager({
        enableLogSanitization: false,
      });
      
      const data = { password: 'secret123' };
      const sanitized = manager.sanitizeLogData(data) as Record<string, unknown>;
      
      expect(sanitized.password).toBe('secret123');
    });
  });

  describe('配置管理', () => {
    it('应该返回当前配置', () => {
      const config = securityManager.getConfig();
      
      expect(config.enableSensitiveInfoDetection).toBe(true);
      expect(config.enableDangerousCommandDetection).toBe(true);
    });

    it('应该更新配置', () => {
      securityManager.updateConfig({
        enableSensitiveInfoDetection: false,
      });
      
      const config = securityManager.getConfig();
      
      expect(config.enableSensitiveInfoDetection).toBe(false);
    });

    it('应该创建默认配置', () => {
      const config = SecurityManager.createDefaultConfig();
      
      expect(config.enableSensitiveInfoDetection).toBe(true);
      expect(config.enableDangerousCommandDetection).toBe(true);
      expect(config.enforceHttps).toBe(true);
      expect(config.enableLogSanitization).toBe(true);
    });

    it('应该获取默认敏感文件模式', () => {
      const patterns = SecurityManager.getDefaultSensitiveFilePatterns();
      
      expect(patterns).toContain('.env');
      expect(patterns).toContain('*.pem');
    });

    it('应该获取默认敏感目录', () => {
      const directories = SecurityManager.getDefaultSensitiveDirectories();
      
      expect(directories).toContain('.ssh');
      expect(directories).toContain('.aws');
    });

    it('应该获取默认危险命令模式', () => {
      const commands = SecurityManager.getDefaultDangerousCommands();
      
      expect(commands.length).toBeGreaterThan(0);
      expect(commands.some(c => c.type === 'destructive')).toBe(true);
    });
  });
});
