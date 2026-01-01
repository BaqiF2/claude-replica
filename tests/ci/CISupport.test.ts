/**
 * CI/CD 支持模块测试
 *
 * 测试 CI 环境检测、结构化日志、超时管理等功能
 * **验证: 需求 21.1, 21.2, 21.3, 21.4, 21.6**
 */

import {
  CISupport,
  CIDetector,
  StructuredLogger,
  TimeoutManager,
  TimeoutError,
  APIKeyManager,
  ExitCodes,
} from '../../src/ci/CISupport';

describe('CIDetector', () => {
  // 保存原始环境变量
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // 清除所有 CI 相关环境变量
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

  afterEach(() => {
    // 恢复原始环境变量
    process.env = { ...originalEnv };
  });

  describe('isCI', () => {
    it('在本地环境中应该返回 false', () => {
      expect(CIDetector.isCI()).toBe(false);
    });

    it('当 CI=true 时应该返回 true', () => {
      process.env.CI = 'true';
      expect(CIDetector.isCI()).toBe(true);
    });

    it('当 CI=1 时应该返回 true', () => {
      process.env.CI = '1';
      expect(CIDetector.isCI()).toBe(true);
    });

    it('当 CONTINUOUS_INTEGRATION=true 时应该返回 true', () => {
      process.env.CONTINUOUS_INTEGRATION = 'true';
      expect(CIDetector.isCI()).toBe(true);
    });

    it('当 GITHUB_ACTIONS 存在时应该返回 true', () => {
      process.env.GITHUB_ACTIONS = 'true';
      expect(CIDetector.isCI()).toBe(true);
    });

    it('当 GITLAB_CI 存在时应该返回 true', () => {
      process.env.GITLAB_CI = 'true';
      expect(CIDetector.isCI()).toBe(true);
    });

    it('当 JENKINS_URL 存在时应该返回 true', () => {
      process.env.JENKINS_URL = 'http://jenkins.example.com';
      expect(CIDetector.isCI()).toBe(true);
    });
  });

  describe('detectEnvironment', () => {
    it('在本地环境中应该返回 local', () => {
      expect(CIDetector.detectEnvironment()).toBe('local');
    });

    it('应该检测 GitHub Actions', () => {
      process.env.GITHUB_ACTIONS = 'true';
      expect(CIDetector.detectEnvironment()).toBe('github-actions');
    });

    it('应该检测 GitLab CI', () => {
      process.env.GITLAB_CI = 'true';
      expect(CIDetector.detectEnvironment()).toBe('gitlab-ci');
    });

    it('应该检测 Jenkins', () => {
      process.env.JENKINS_URL = 'http://jenkins.example.com';
      expect(CIDetector.detectEnvironment()).toBe('jenkins');
    });

    it('应该检测 CircleCI', () => {
      process.env.CIRCLECI = 'true';
      expect(CIDetector.detectEnvironment()).toBe('circleci');
    });

    it('应该检测 Travis CI', () => {
      process.env.TRAVIS = 'true';
      expect(CIDetector.detectEnvironment()).toBe('travis');
    });

    it('应该检测 Azure Pipelines', () => {
      process.env.TF_BUILD = 'true';
      expect(CIDetector.detectEnvironment()).toBe('azure-pipelines');
    });

    it('应该检测 Bitbucket Pipelines', () => {
      process.env.BITBUCKET_PIPELINE_UUID = 'test-uuid';
      expect(CIDetector.detectEnvironment()).toBe('bitbucket-pipelines');
    });

    it('应该检测 TeamCity', () => {
      process.env.TEAMCITY_VERSION = '2023.1';
      expect(CIDetector.detectEnvironment()).toBe('teamcity');
    });

    it('应该检测 Buildkite', () => {
      process.env.BUILDKITE = 'true';
      expect(CIDetector.detectEnvironment()).toBe('buildkite');
    });

    it('应该检测 AWS CodeBuild', () => {
      process.env.CODEBUILD_BUILD_ID = 'test-build-id';
      expect(CIDetector.detectEnvironment()).toBe('codebuild');
    });

    it('应该检测 Drone', () => {
      process.env.DRONE = 'true';
      expect(CIDetector.detectEnvironment()).toBe('drone');
    });

    it('当只有 CI=true 时应该返回 unknown-ci', () => {
      process.env.CI = 'true';
      expect(CIDetector.detectEnvironment()).toBe('unknown-ci');
    });
  });

  describe('getEnvironmentInfo', () => {
    it('应该返回 GitHub Actions 的详细信息', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_REPOSITORY = 'owner/repo';
      process.env.GITHUB_WORKFLOW = 'CI';
      process.env.GITHUB_RUN_ID = '12345';
      process.env.GITHUB_RUN_NUMBER = '42';
      process.env.GITHUB_ACTOR = 'testuser';
      process.env.GITHUB_REF = 'refs/heads/main';
      process.env.GITHUB_SHA = 'abc123';

      const info = CIDetector.getEnvironmentInfo();

      expect(info.environment).toBe('github-actions');
      expect(info.repository).toBe('owner/repo');
      expect(info.workflow).toBe('CI');
      expect(info.runId).toBe('12345');
      expect(info.runNumber).toBe('42');
      expect(info.actor).toBe('testuser');
      expect(info.ref).toBe('refs/heads/main');
      expect(info.sha).toBe('abc123');
    });

    it('应该返回 GitLab CI 的详细信息', () => {
      process.env.GITLAB_CI = 'true';
      process.env.CI_PROJECT_NAME = 'test-project';
      process.env.CI_PIPELINE_ID = '12345';
      process.env.CI_JOB_NAME = 'test-job';
      process.env.CI_COMMIT_REF_NAME = 'main';
      process.env.CI_COMMIT_SHA = 'abc123';

      const info = CIDetector.getEnvironmentInfo();

      expect(info.environment).toBe('gitlab-ci');
      expect(info.project).toBe('test-project');
      expect(info.pipeline).toBe('12345');
      expect(info.job).toBe('test-job');
      expect(info.ref).toBe('main');
      expect(info.sha).toBe('abc123');
    });
  });
});

describe('APIKeyManager', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_API_KEY;
    delete process.env.CLAUDE_REPLICA_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('getAPIKey', () => {
    it('没有设置环境变量时应该返回 undefined', () => {
      expect(APIKeyManager.getAPIKey()).toBeUndefined();
    });

    it('应该从 ANTHROPIC_API_KEY 获取密钥', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-12345';
      expect(APIKeyManager.getAPIKey()).toBe('sk-ant-test-key-12345');
    });

    it('应该从 CLAUDE_API_KEY 获取密钥', () => {
      process.env.CLAUDE_API_KEY = 'sk-ant-test-key-67890';
      expect(APIKeyManager.getAPIKey()).toBe('sk-ant-test-key-67890');
    });

    it('应该从 CLAUDE_REPLICA_API_KEY 获取密钥', () => {
      process.env.CLAUDE_REPLICA_API_KEY = 'sk-ant-test-key-abcde';
      expect(APIKeyManager.getAPIKey()).toBe('sk-ant-test-key-abcde');
    });

    it('ANTHROPIC_API_KEY 应该优先于其他环境变量', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-primary';
      process.env.CLAUDE_API_KEY = 'sk-ant-secondary';
      expect(APIKeyManager.getAPIKey()).toBe('sk-ant-primary');
    });
  });

  describe('hasAPIKey', () => {
    it('没有设置环境变量时应该返回 false', () => {
      expect(APIKeyManager.hasAPIKey()).toBe(false);
    });

    it('设置了环境变量时应该返回 true', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
      expect(APIKeyManager.hasAPIKey()).toBe(true);
    });
  });

  describe('validateAPIKey', () => {
    it('有效的 API 密钥应该返回 true', () => {
      expect(APIKeyManager.validateAPIKey('sk-ant-api03-abcdefghijklmnop')).toBe(true);
    });

    it('无效的 API 密钥应该返回 false', () => {
      expect(APIKeyManager.validateAPIKey('invalid-key')).toBe(false);
      expect(APIKeyManager.validateAPIKey('sk-ant-')).toBe(false);
      expect(APIKeyManager.validateAPIKey('')).toBe(false);
    });
  });

  describe('getAPIKeySource', () => {
    it('没有设置环境变量时应该返回 undefined', () => {
      expect(APIKeyManager.getAPIKeySource()).toBeUndefined();
    });

    it('应该返回正确的环境变量名称', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      expect(APIKeyManager.getAPIKeySource()).toBe('ANTHROPIC_API_KEY');
    });
  });

  describe('maskAPIKey', () => {
    it('应该正确脱敏 API 密钥', () => {
      const masked = APIKeyManager.maskAPIKey('sk-ant-api03-abcdefghijklmnop');
      expect(masked).toBe('sk-ant-...mnop');
      expect(masked).not.toContain('abcdefghijkl');
    });

    it('短密钥应该完全脱敏', () => {
      expect(APIKeyManager.maskAPIKey('short')).toBe('****');
    });
  });
});

describe('StructuredLogger', () => {
  let consoleSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('应该输出结构化的 JSON 日志', () => {
    const logger = new StructuredLogger();
    logger.info('测试消息', { key: 'value' });

    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);

    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('测试消息');
    expect(parsed.data).toEqual({ key: 'value' });
    expect(parsed.timestamp).toBeDefined();
  });

  it('应该使用 console.error 输出错误日志', () => {
    const logger = new StructuredLogger();
    logger.error('错误消息');

    expect(consoleErrorSpy).toHaveBeenCalled();
    const output = consoleErrorSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);

    expect(parsed.level).toBe('error');
    expect(parsed.message).toBe('错误消息');
  });

  it('应该使用 console.warn 输出警告日志', () => {
    const logger = new StructuredLogger();
    logger.warn('警告消息');

    expect(consoleWarnSpy).toHaveBeenCalled();
    const output = consoleWarnSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);

    expect(parsed.level).toBe('warn');
    expect(parsed.message).toBe('警告消息');
  });

  it('静默模式下不应该输出日志', () => {
    const logger = new StructuredLogger({ silent: true });
    logger.info('测试消息');
    logger.error('错误消息');
    logger.warn('警告消息');

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('应该包含会话 ID', () => {
    const logger = new StructuredLogger({ sessionId: 'test-session-123' });
    logger.info('测试消息');

    const output = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);

    expect(parsed.sessionId).toBe('test-session-123');
  });

  it('logStart 应该记录执行开始', () => {
    const logger = new StructuredLogger();
    logger.logStart('测试查询', { model: 'claude-3' });

    const output = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);

    expect(parsed.stage).toBe('start');
    expect(parsed.data.prompt).toBe('测试查询');
    expect(parsed.data.model).toBe('claude-3');
  });

  it('logComplete 应该记录执行完成', () => {
    const logger = new StructuredLogger();
    logger.logComplete({ success: true, duration: 1000 });

    const output = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);

    expect(parsed.stage).toBe('complete');
    expect(parsed.data.success).toBe(true);
    expect(parsed.data.duration).toBe(1000);
  });

  it('logError 应该记录错误', () => {
    const logger = new StructuredLogger();
    const error = new Error('测试错误');
    logger.logError(error);

    const output = consoleErrorSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);

    expect(parsed.stage).toBe('error');
    expect(parsed.data.message).toBe('测试错误');
    expect(parsed.data.stack).toBeDefined();
  });
});

describe('TimeoutManager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('应该在超时后触发回调', () => {
    const onTimeout = jest.fn();
    const manager = new TimeoutManager({ totalMs: 5000 });

    manager.start(onTimeout);
    expect(onTimeout).not.toHaveBeenCalled();

    jest.advanceTimersByTime(5000);
    expect(onTimeout).toHaveBeenCalled();
    expect(manager.hasTimedOut()).toBe(true);
  });

  it('停止后不应该触发超时', () => {
    const onTimeout = jest.fn();
    const manager = new TimeoutManager({ totalMs: 5000 });

    manager.start(onTimeout);
    manager.stop();

    jest.advanceTimersByTime(10000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('应该正确计算已用时间', () => {
    const manager = new TimeoutManager({ totalMs: 10000 });
    manager.start();

    jest.advanceTimersByTime(3000);
    expect(manager.getElapsedMs()).toBeGreaterThanOrEqual(3000);
  });

  it('应该正确计算剩余时间', () => {
    const manager = new TimeoutManager({ totalMs: 10000 });
    manager.start();

    jest.advanceTimersByTime(3000);
    expect(manager.getRemainingMs()).toBeLessThanOrEqual(7000);
  });

  it('hasTimeFor 应该正确判断是否有足够时间', () => {
    const manager = new TimeoutManager({ totalMs: 10000 });
    manager.start();

    expect(manager.hasTimeFor(5000)).toBe(true);
    
    jest.advanceTimersByTime(8000);
    expect(manager.hasTimeFor(5000)).toBe(false);
  });

  describe('withTimeout', () => {
    beforeEach(() => {
      jest.useRealTimers();
    });

    it('应该在 Promise 完成前返回结果', async () => {
      const manager = new TimeoutManager({ totalMs: 10000, queryMs: 5000 });
      manager.start();

      const result = await manager.withTimeout(
        Promise.resolve('success'),
        1000
      );

      expect(result).toBe('success');
    });

    it('应该在超时时抛出 TimeoutError', async () => {
      const manager = new TimeoutManager({ totalMs: 10000, queryMs: 100 });
      manager.start();

      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve('slow'), 500);
      });

      await expect(manager.withTimeout(slowPromise, 50)).rejects.toThrow(TimeoutError);
    });
  });
});

describe('CISupport', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('应该正确检测非 CI 环境', () => {
    const support = new CISupport();
    expect(support.isCI()).toBe(false);
    expect(support.getEnvironment()).toBe('local');
  });

  it('应该正确检测 CI 环境', () => {
    process.env.GITHUB_ACTIONS = 'true';
    const support = new CISupport();
    expect(support.isCI()).toBe(true);
    expect(support.getEnvironment()).toBe('github-actions');
  });

  it('应该获取 API 密钥', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-12345678901234567890';
    const support = new CISupport();
    expect(support.hasAPIKey()).toBe(true);
    expect(support.getAPIKey()).toBe('sk-ant-test-key-12345678901234567890');
  });

  it('validate 应该检测缺少的 API 密钥', () => {
    const support = new CISupport();
    const result = support.validate();
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('未找到 API 密钥。请设置 ANTHROPIC_API_KEY 环境变量。');
  });

  it('validate 应该检测无效的 API 密钥格式', () => {
    process.env.ANTHROPIC_API_KEY = 'invalid-key';
    const support = new CISupport();
    const result = support.validate();
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('API 密钥格式无效。');
  });

  it('validate 应该通过有效配置', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-abcdefghijklmnop';
    const support = new CISupport();
    const result = support.validate();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('getSummary 应该返回环境摘要', () => {
    process.env.GITHUB_ACTIONS = 'true';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const support = new CISupport();
    const summary = support.getSummary();

    expect(summary.isCI).toBe(true);
    expect(summary.environment).toBe('github-actions');
    expect(summary.hasAPIKey).toBe(true);
    expect(summary.apiKeySource).toBe('ANTHROPIC_API_KEY');
  });

  describe('getExitCode', () => {
    it('应该为超时错误返回 TIMEOUT_ERROR', () => {
      expect(CISupport.getExitCode(new TimeoutError('timeout'))).toBe(ExitCodes.TIMEOUT_ERROR);
      expect(CISupport.getExitCode('operation timeout')).toBe(ExitCodes.TIMEOUT_ERROR);
    });

    it('应该为网络错误返回 NETWORK_ERROR', () => {
      expect(CISupport.getExitCode(new Error('ENOTFOUND'))).toBe(ExitCodes.NETWORK_ERROR);
      expect(CISupport.getExitCode(new Error('ECONNREFUSED'))).toBe(ExitCodes.NETWORK_ERROR);
    });

    it('应该为认证错误返回 AUTH_ERROR', () => {
      expect(CISupport.getExitCode(new Error('401 Unauthorized'))).toBe(ExitCodes.AUTH_ERROR);
      expect(CISupport.getExitCode(new Error('403 Forbidden'))).toBe(ExitCodes.AUTH_ERROR);
      expect(CISupport.getExitCode(new Error('Invalid API key'))).toBe(ExitCodes.AUTH_ERROR);
    });

    it('应该为配置错误返回 CONFIG_ERROR', () => {
      expect(CISupport.getExitCode(new Error('config error'))).toBe(ExitCodes.CONFIG_ERROR);
    });

    it('应该为权限错误返回 PERMISSION_ERROR', () => {
      expect(CISupport.getExitCode(new Error('permission denied'))).toBe(ExitCodes.PERMISSION_ERROR);
    });

    it('应该为工具错误返回 TOOL_ERROR', () => {
      expect(CISupport.getExitCode(new Error('tool execution failed'))).toBe(ExitCodes.TOOL_ERROR);
    });

    it('应该为未知错误返回 ERROR', () => {
      expect(CISupport.getExitCode(new Error('unknown error'))).toBe(ExitCodes.ERROR);
    });
  });
});

describe('ExitCodes', () => {
  it('应该定义所有退出码', () => {
    expect(ExitCodes.SUCCESS).toBe(0);
    expect(ExitCodes.ERROR).toBe(1);
    expect(ExitCodes.NETWORK_ERROR).toBe(2);
    expect(ExitCodes.AUTH_ERROR).toBe(3);
    expect(ExitCodes.TIMEOUT_ERROR).toBe(4);
    expect(ExitCodes.CONFIG_ERROR).toBe(5);
    expect(ExitCodes.PERMISSION_ERROR).toBe(6);
    expect(ExitCodes.TOOL_ERROR).toBe(7);
  });
});
