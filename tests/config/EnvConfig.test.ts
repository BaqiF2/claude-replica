/**
 * EnvConfig 单元测试
 *
 * 测试环境变量配置管理器的各项功能
 */

import { EnvConfig, ENV_KEYS } from '../../src/config';

describe('EnvConfig', () => {
  // 保存原始环境变量
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // 清理测试相关的环境变量
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_REPLICA_DEBUG;
    delete process.env.CI;
    delete process.env.CONTINUOUS_INTEGRATION;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITLAB_CI;
    delete process.env.JENKINS_URL;
    delete process.env.CIRCLECI;
    delete process.env.TRAVIS;
    delete process.env.TF_BUILD;
    delete process.env.BITBUCKET_PIPELINE_UUID;
    delete process.env.TEAMCITY_VERSION;
    delete process.env.BUILDKITE;
    delete process.env.CODEBUILD_BUILD_ID;
    delete process.env.DRONE;
  });

  afterAll(() => {
    // 恢复原始环境变量
    process.env = originalEnv;
  });

  describe('getString', () => {
    it('应该返回环境变量的值', () => {
      process.env.TEST_VAR = 'test-value';
      expect(EnvConfig.getString('TEST_VAR')).toBe('test-value');
      delete process.env.TEST_VAR;
    });

    it('当环境变量不存在时应该返回默认值', () => {
      expect(EnvConfig.getString('NON_EXISTENT', 'default')).toBe('default');
    });

    it('当环境变量不存在且无默认值时应该返回 undefined', () => {
      expect(EnvConfig.getString('NON_EXISTENT')).toBeUndefined();
    });
  });

  describe('getRequiredString', () => {
    it('应该返回环境变量的值', () => {
      process.env.REQUIRED_VAR = 'required-value';
      expect(EnvConfig.getRequiredString('REQUIRED_VAR')).toBe('required-value');
      delete process.env.REQUIRED_VAR;
    });

    it('当环境变量不存在时应该抛出错误', () => {
      expect(() => EnvConfig.getRequiredString('NON_EXISTENT')).toThrow(
        '必需的环境变量 NON_EXISTENT 未设置'
      );
    });
  });

  describe('getBoolean', () => {
    it('当值为 "true" 时应该返回 true', () => {
      process.env.BOOL_VAR = 'true';
      expect(EnvConfig.getBoolean('BOOL_VAR')).toBe(true);
      delete process.env.BOOL_VAR;
    });

    it('当值为 "1" 时应该返回 true', () => {
      process.env.BOOL_VAR = '1';
      expect(EnvConfig.getBoolean('BOOL_VAR')).toBe(true);
      delete process.env.BOOL_VAR;
    });

    it('当值为其他字符串时应该返回 false', () => {
      process.env.BOOL_VAR = 'false';
      expect(EnvConfig.getBoolean('BOOL_VAR')).toBe(false);
      delete process.env.BOOL_VAR;
    });

    it('当环境变量不存在时应该返回默认值', () => {
      expect(EnvConfig.getBoolean('NON_EXISTENT', true)).toBe(true);
      expect(EnvConfig.getBoolean('NON_EXISTENT', false)).toBe(false);
    });
  });

  describe('getNumber', () => {
    it('应该返回数字值', () => {
      process.env.NUM_VAR = '42';
      expect(EnvConfig.getNumber('NUM_VAR')).toBe(42);
      delete process.env.NUM_VAR;
    });

    it('当值不是有效数字时应该返回默认值', () => {
      process.env.NUM_VAR = 'not-a-number';
      expect(EnvConfig.getNumber('NUM_VAR', 10)).toBe(10);
      delete process.env.NUM_VAR;
    });

    it('当环境变量不存在时应该返回默认值', () => {
      expect(EnvConfig.getNumber('NON_EXISTENT', 100)).toBe(100);
    });
  });

  describe('has', () => {
    it('当环境变量存在时应该返回 true', () => {
      process.env.EXISTS_VAR = 'value';
      expect(EnvConfig.has('EXISTS_VAR')).toBe(true);
      delete process.env.EXISTS_VAR;
    });

    it('当环境变量不存在时应该返回 false', () => {
      expect(EnvConfig.has('NON_EXISTENT')).toBe(false);
    });
  });

  describe('isDebugMode', () => {
    it('当 CLAUDE_REPLICA_DEBUG=true 时应该返回 true', () => {
      process.env.CLAUDE_REPLICA_DEBUG = 'true';
      expect(EnvConfig.isDebugMode()).toBe(true);
    });

    it('当未设置时应该返回 false', () => {
      expect(EnvConfig.isDebugMode()).toBe(false);
    });
  });

  describe('isCI', () => {
    it('在本地环境中应该返回 false', () => {
      expect(EnvConfig.isCI()).toBe(false);
    });

    it('当 CI=true 时应该返回 true', () => {
      process.env.CI = 'true';
      expect(EnvConfig.isCI()).toBe(true);
    });

    it('当 GITHUB_ACTIONS 存在时应该返回 true', () => {
      process.env.GITHUB_ACTIONS = 'true';
      expect(EnvConfig.isCI()).toBe(true);
    });

    it('当 GITLAB_CI 存在时应该返回 true', () => {
      process.env.GITLAB_CI = 'true';
      expect(EnvConfig.isCI()).toBe(true);
    });
  });

  describe('detectCIEnvironment', () => {
    it('在本地环境中应该返回 undefined', () => {
      expect(EnvConfig.detectCIEnvironment()).toBeUndefined();
    });

    it('应该检测 GitHub Actions', () => {
      process.env.GITHUB_ACTIONS = 'true';
      expect(EnvConfig.detectCIEnvironment()).toBe('github-actions');
    });

    it('应该检测 GitLab CI', () => {
      process.env.GITLAB_CI = 'true';
      expect(EnvConfig.detectCIEnvironment()).toBe('gitlab-ci');
    });

    it('应该检测 Jenkins', () => {
      process.env.JENKINS_URL = 'https://jenkins.example.com';
      expect(EnvConfig.detectCIEnvironment()).toBe('jenkins');
    });

    it('当只有 CI=true 时应该返回 unknown-ci', () => {
      process.env.CI = 'true';
      expect(EnvConfig.detectCIEnvironment()).toBe('unknown-ci');
    });
  });

  describe('getCIEnvironmentInfo', () => {
    it('在本地环境中应该返回 undefined', () => {
      expect(EnvConfig.getCIEnvironmentInfo()).toBeUndefined();
    });

    it('应该返回 GitHub Actions 的详细信息', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_REPOSITORY = 'owner/repo';
      process.env.GITHUB_WORKFLOW = 'CI';
      process.env.GITHUB_RUN_ID = '123456';

      const info = EnvConfig.getCIEnvironmentInfo();

      expect(info?.platform).toBe('github-actions');
      expect(info?.repository).toBe('owner/repo');
      expect(info?.workflow).toBe('CI');
      expect(info?.runId).toBe('123456');
    });
  });

  describe('getConfiguration', () => {
    it('应该返回完整的配置对象', () => {
      process.env.CLAUDE_REPLICA_DEBUG = 'true';

      const config = EnvConfig.getConfiguration();

      expect(config.debugMode).toBe(true);
      expect(config.isCI).toBe(false);
    });
  });

  describe('validate', () => {
    it('当所有必需变量都存在时应该返回 valid: true', () => {
      process.env.VAR1 = 'value1';
      process.env.VAR2 = 'value2';

      const result = EnvConfig.validate(['VAR1', 'VAR2']);

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);

      delete process.env.VAR1;
      delete process.env.VAR2;
    });

    it('当有缺失变量时应该返回 valid: false 和缺失列表', () => {
      process.env.VAR1 = 'value1';

      const result = EnvConfig.validate(['VAR1', 'VAR2', 'VAR3']);

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('VAR2');
      expect(result.missing).toContain('VAR3');

      delete process.env.VAR1;
    });
  });

  describe('printConfiguration', () => {
    it('应该返回格式化的配置字符串', () => {
      process.env.CLAUDE_REPLICA_DEBUG = 'true';

      const output = EnvConfig.printConfiguration();

      expect(output).toContain('环境配置');
      expect(output).toContain('调试模式');
    });
  });

  describe('ENV_KEYS', () => {
    it('应该包含所有核心环境变量键', () => {
      expect(ENV_KEYS.CLAUDE_REPLICA_DEBUG).toBe('CLAUDE_REPLICA_DEBUG');
      expect(ENV_KEYS.CI).toBe('CI');
      expect(ENV_KEYS.GITHUB_ACTIONS).toBe('GITHUB_ACTIONS');
    });
  });
});
