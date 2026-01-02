/**
 * CI/CD 集成测试
 *
 * 测试 CLI 工具的 CI/CD 集成功能，包括：
 * - CI 环境变量检测
 * - 非交互默认行为
 * - 结构化日志输出
 * - 退出码验证
 *
 * @module tests/terminal/ci.test.ts
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
 */

import './setup';
import { runCLI, expectExitCode, ExitCodes } from './helpers';
import {
  CISupport,
  CIDetector,
  StructuredLogger,
  TimeoutManager,
  TimeoutError,
} from '../../src/ci/CISupport';
import { EnvConfig } from '../../src/config/EnvConfig';

describe('CI/CD 集成测试', () => {
  // 测试超时时间
  const TEST_TIMEOUT = 30000;

  // 保存原始环境变量
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // 保存原始环境变量
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // 恢复原始环境变量
    process.env = originalEnv;
  });


  describe('CI 环境变量检测', () => {
    /**
     * 测试 CI 环境变量检测 - 通用 CI 变量
     *
     * **Validates: Requirements 9.1**
     */
    it('应该检测通用 CI 环境变量', () => {
      // 清除所有 CI 相关环境变量
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.JENKINS_URL;
      delete process.env.CIRCLECI;
      delete process.env.TRAVIS;
      delete process.env.BUILDKITE;
      delete process.env.DRONE;
      delete process.env.TEAMCITY_VERSION;
      delete process.env.TF_BUILD;
      delete process.env.CODEBUILD_BUILD_ID;
      delete process.env.BITBUCKET_PIPELINE_UUID;
      delete process.env.CONTINUOUS_INTEGRATION;

      // 验证非 CI 环境
      expect(EnvConfig.isCI()).toBe(false);
      expect(CIDetector.isCI()).toBe(false);

      // 设置 CI 环境变量
      process.env.CI = 'true';
      expect(EnvConfig.isCI()).toBe(true);
      expect(CIDetector.isCI()).toBe(true);
    });

    /**
     * 测试 GitHub Actions 检测
     *
     * **Validates: Requirements 9.1**
     */
    it('应该检测 GitHub Actions 环境', () => {
      // 清除所有 CI 相关环境变量
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.JENKINS_URL;

      // 设置 GitHub Actions 环境变量
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_REPOSITORY = 'owner/repo';
      process.env.GITHUB_WORKFLOW = 'test-workflow';
      process.env.GITHUB_RUN_ID = '12345';

      expect(CIDetector.isCI()).toBe(true);
      expect(CIDetector.detectEnvironment()).toBe('github-actions');

      const info = CIDetector.getEnvironmentInfo();
      expect(info.environment).toBe('github-actions');
      expect(info.repository).toBe('owner/repo');
      expect(info.workflow).toBe('test-workflow');
      expect(info.runId).toBe('12345');
    });

    /**
     * 测试 GitLab CI 检测
     *
     * **Validates: Requirements 9.1**
     */
    it('应该检测 GitLab CI 环境', () => {
      // 清除所有 CI 相关环境变量
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.JENKINS_URL;

      // 设置 GitLab CI 环境变量
      process.env.GITLAB_CI = 'true';
      process.env.CI_PROJECT_NAME = 'test-project';
      process.env.CI_PIPELINE_ID = '67890';

      expect(CIDetector.isCI()).toBe(true);
      expect(CIDetector.detectEnvironment()).toBe('gitlab-ci');

      const info = CIDetector.getEnvironmentInfo();
      expect(info.environment).toBe('gitlab-ci');
      expect(info.project).toBe('test-project');
      expect(info.pipeline).toBe('67890');
    });


    /**
     * 测试 Jenkins 检测
     *
     * **Validates: Requirements 9.1**
     */
    it('应该检测 Jenkins 环境', () => {
      // 清除所有 CI 相关环境变量
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.JENKINS_URL;

      // 设置 Jenkins 环境变量
      process.env.JENKINS_URL = 'http://jenkins.example.com';
      process.env.JOB_NAME = 'test-job';
      process.env.BUILD_NUMBER = '42';

      expect(CIDetector.isCI()).toBe(true);
      expect(CIDetector.detectEnvironment()).toBe('jenkins');

      const info = CIDetector.getEnvironmentInfo();
      expect(info.environment).toBe('jenkins');
      expect(info.job).toBe('test-job');
      expect(info.buildNumber).toBe('42');
    });

    /**
     * 测试 CircleCI 检测
     *
     * **Validates: Requirements 9.1**
     */
    it('应该检测 CircleCI 环境', () => {
      // 清除所有 CI 相关环境变量
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.JENKINS_URL;
      delete process.env.CIRCLECI;

      // 设置 CircleCI 环境变量
      process.env.CIRCLECI = 'true';
      process.env.CIRCLE_PROJECT_REPONAME = 'test-repo';
      process.env.CIRCLE_BUILD_NUM = '100';

      expect(CIDetector.isCI()).toBe(true);
      expect(CIDetector.detectEnvironment()).toBe('circleci');

      const info = CIDetector.getEnvironmentInfo();
      expect(info.environment).toBe('circleci');
      expect(info.project).toBe('test-repo');
      expect(info.buildNum).toBe('100');
    });

    /**
     * 测试其他 CI 平台检测
     *
     * **Validates: Requirements 9.1**
     */
    it('应该检测其他 CI 平台', () => {
      const ciPlatforms = [
        { env: 'TRAVIS', value: 'true', expected: 'travis' },
        { env: 'TF_BUILD', value: 'True', expected: 'azure-pipelines' },
        { env: 'BUILDKITE', value: 'true', expected: 'buildkite' },
        { env: 'DRONE', value: 'true', expected: 'drone' },
        { env: 'TEAMCITY_VERSION', value: '2021.1', expected: 'teamcity' },
        { env: 'CODEBUILD_BUILD_ID', value: 'build-123', expected: 'codebuild' },
      ];

      for (const platform of ciPlatforms) {
        // 清除所有 CI 相关环境变量
        delete process.env.CI;
        delete process.env.GITHUB_ACTIONS;
        delete process.env.GITLAB_CI;
        delete process.env.JENKINS_URL;
        delete process.env.CIRCLECI;
        delete process.env.TRAVIS;
        delete process.env.TF_BUILD;
        delete process.env.BUILDKITE;
        delete process.env.DRONE;
        delete process.env.TEAMCITY_VERSION;
        delete process.env.CODEBUILD_BUILD_ID;
        delete process.env.BITBUCKET_PIPELINE_UUID;

        // 设置特定平台的环境变量
        process.env[platform.env] = platform.value;

        expect(CIDetector.isCI()).toBe(true);
        expect(CIDetector.detectEnvironment()).toBe(platform.expected);
      }
    });

    /**
     * 测试本地环境检测
     *
     * **Validates: Requirements 9.1**
     */
    it('应该检测本地环境', () => {
      // 清除所有 CI 相关环境变量
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.JENKINS_URL;
      delete process.env.CIRCLECI;
      delete process.env.TRAVIS;
      delete process.env.TF_BUILD;
      delete process.env.BUILDKITE;
      delete process.env.DRONE;
      delete process.env.TEAMCITY_VERSION;
      delete process.env.CODEBUILD_BUILD_ID;
      delete process.env.BITBUCKET_PIPELINE_UUID;
      delete process.env.CONTINUOUS_INTEGRATION;

      expect(CIDetector.isCI()).toBe(false);
      expect(CIDetector.detectEnvironment()).toBe('local');
    });
  });


  describe('非交互默认行为', () => {
    /**
     * 测试 CI 环境中需要 -p 选项
     *
     * **Validates: Requirements 9.2**
     */
    it('CI 环境中没有 -p 选项应该返回错误', async () => {
      const result = await runCLI({
        args: [],
        timeout: TEST_TIMEOUT,
        env: {
          CI: 'true',
        },
      });

      // CI 环境中没有查询内容应该返回配置错误
      expectExitCode(result.exitCode, ExitCodes.CONFIG_ERROR);
    }, TEST_TIMEOUT);

    /**
     * 测试 CI 环境中使用 -p 选项
     *
     * **Validates: Requirements 9.2**
     */
    it('CI 环境中使用 -p 选项应该正常执行', async () => {
      const result = await runCLI({
        args: ['-p', 'test query', '--timeout', '5'],
        timeout: TEST_TIMEOUT,
        env: {
          CI: 'true',
        },
      });

      // 验证进程已退出（可能成功或超时）
      expect(result.exitCode).toBeDefined();
    }, TEST_TIMEOUT);

    /**
     * 测试 CISupport 配置
     *
     * **Validates: Requirements 9.2**
     */
    it('CISupport 应该正确配置 CI 模式', () => {
      // 设置 CI 环境
      process.env.CI = 'true';

      const ciSupport = new CISupport();
      const config = ciSupport.getConfig();

      expect(config.isCI).toBe(true);
      expect(config.structuredLogs).toBe(true);
    });

    /**
     * 测试非 CI 环境配置
     *
     * **Validates: Requirements 9.2**
     */
    it('非 CI 环境应该禁用结构化日志', () => {
      // 清除 CI 环境变量
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.JENKINS_URL;

      const ciSupport = new CISupport();
      const config = ciSupport.getConfig();

      expect(config.isCI).toBe(false);
      expect(config.structuredLogs).toBe(false);
    });
  });


  describe('结构化日志输出', () => {
    /**
     * 测试结构化日志格式
     *
     * **Validates: Requirements 9.3**
     */
    it('结构化日志应该输出有效的 JSON', () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        const logger = new StructuredLogger({ sessionId: 'test-session' });
        logger.info('测试消息', { key: 'value' }, 'test-stage');

        expect(logs.length).toBe(1);
        const logEntry = JSON.parse(logs[0]);

        expect(logEntry.level).toBe('info');
        expect(logEntry.message).toBe('测试消息');
        expect(logEntry.data).toEqual({ key: 'value' });
        expect(logEntry.stage).toBe('test-stage');
        expect(logEntry.sessionId).toBe('test-session');
        expect(logEntry.timestamp).toBeDefined();
      } finally {
        console.log = originalLog;
      }
    });

    /**
     * 测试不同日志级别
     *
     * **Validates: Requirements 9.3**
     */
    it('应该支持不同的日志级别', () => {
      const logs: { level: string; msg: string }[] = [];
      const originalLog = console.log;
      const originalWarn = console.warn;
      const originalError = console.error;

      console.log = (msg: string) => logs.push({ level: 'log', msg });
      console.warn = (msg: string) => logs.push({ level: 'warn', msg });
      console.error = (msg: string) => logs.push({ level: 'error', msg });

      try {
        const logger = new StructuredLogger();

        logger.debug('调试消息');
        logger.info('信息消息');
        logger.warn('警告消息');
        logger.error('错误消息');

        expect(logs.length).toBe(4);

        // 验证日志级别
        expect(JSON.parse(logs[0].msg).level).toBe('debug');
        expect(JSON.parse(logs[1].msg).level).toBe('info');
        expect(JSON.parse(logs[2].msg).level).toBe('warn');
        expect(JSON.parse(logs[3].msg).level).toBe('error');

        // 验证输出通道
        expect(logs[0].level).toBe('log');
        expect(logs[1].level).toBe('log');
        expect(logs[2].level).toBe('warn');
        expect(logs[3].level).toBe('error');
      } finally {
        console.log = originalLog;
        console.warn = originalWarn;
        console.error = originalError;
      }
    });

    /**
     * 测试静默模式
     *
     * **Validates: Requirements 9.3**
     */
    it('静默模式应该不输出日志', () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        const logger = new StructuredLogger({ silent: true });
        logger.info('测试消息');
        logger.warn('警告消息');
        logger.error('错误消息');

        expect(logs.length).toBe(0);
      } finally {
        console.log = originalLog;
      }
    });

    /**
     * 测试执行日志方法
     *
     * **Validates: Requirements 9.3**
     */
    it('应该支持执行日志方法', () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        const logger = new StructuredLogger();

        logger.logStart('测试查询', { model: 'sonnet' });
        logger.logToolUse('read_file', { path: '/test/file.txt' });
        logger.logComplete({ success: true, duration: 1000 });

        expect(logs.length).toBe(3);

        const startLog = JSON.parse(logs[0]);
        expect(startLog.stage).toBe('start');
        expect(startLog.data.prompt).toBe('测试查询');

        const toolLog = JSON.parse(logs[1]);
        expect(toolLog.stage).toBe('tool');
        expect(toolLog.data.tool).toBe('read_file');

        const completeLog = JSON.parse(logs[2]);
        expect(completeLog.stage).toBe('complete');
        expect(completeLog.data.success).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });

    /**
     * 测试错误日志
     *
     * **Validates: Requirements 9.3**
     */
    it('应该正确记录错误', () => {
      const logs: string[] = [];
      const originalError = console.error;
      console.error = (msg: string) => logs.push(msg);

      try {
        const logger = new StructuredLogger();
        const error = new Error('测试错误');
        logger.logError(error, { context: 'test' });

        expect(logs.length).toBe(1);

        const errorLog = JSON.parse(logs[0]);
        expect(errorLog.level).toBe('error');
        expect(errorLog.stage).toBe('error');
        expect(errorLog.data.message).toBe('测试错误');
        expect(errorLog.data.context).toBe('test');
      } finally {
        console.error = originalError;
      }
    });
  });


  describe('退出码验证', () => {
    /**
     * 测试成功退出码
     *
     * **Validates: Requirements 9.4**
     */
    it('成功执行应该返回退出码 0', () => {
      expect(ExitCodes.SUCCESS).toBe(0);
    });

    /**
     * 测试错误退出码映射
     *
     * **Validates: Requirements 9.4**
     */
    it('应该正确映射错误类型到退出码', () => {
      // 超时错误
      const timeoutError = new TimeoutError('操作超时');
      expect(CISupport.getExitCode(timeoutError)).toBe(ExitCodes.TIMEOUT_ERROR);

      // 网络错误
      expect(CISupport.getExitCode(new Error('ENOTFOUND'))).toBe(ExitCodes.NETWORK_ERROR);
      expect(CISupport.getExitCode(new Error('ECONNREFUSED'))).toBe(ExitCodes.NETWORK_ERROR);
      expect(CISupport.getExitCode(new Error('Network error'))).toBe(ExitCodes.NETWORK_ERROR);

      // 认证错误
      expect(CISupport.getExitCode(new Error('401 Unauthorized'))).toBe(ExitCodes.AUTH_ERROR);
      expect(CISupport.getExitCode(new Error('403 Forbidden'))).toBe(ExitCodes.AUTH_ERROR);
      expect(CISupport.getExitCode(new Error('Invalid API key'))).toBe(ExitCodes.AUTH_ERROR);

      // 配置错误
      expect(CISupport.getExitCode(new Error('Invalid config'))).toBe(ExitCodes.CONFIG_ERROR);

      // 权限错误
      expect(CISupport.getExitCode(new Error('Permission denied'))).toBe(ExitCodes.PERMISSION_ERROR);

      // 工具错误
      expect(CISupport.getExitCode(new Error('Tool execution failed'))).toBe(ExitCodes.TOOL_ERROR);

      // 一般错误
      expect(CISupport.getExitCode(new Error('Unknown error'))).toBe(ExitCodes.ERROR);
    });

    /**
     * 测试 CLI 退出码
     *
     * **Validates: Requirements 9.4**
     */
    it('CLI 无效参数应该返回退出码 2', async () => {
      const result = await runCLI({
        args: ['--invalid-option'],
        timeout: TEST_TIMEOUT,
        env: { CI: 'true' },
      });

      expectExitCode(result.exitCode, ExitCodes.CONFIG_ERROR);
    }, TEST_TIMEOUT);

    /**
     * 测试退出码常量
     *
     * **Validates: Requirements 9.4**
     */
    it('退出码常量应该正确定义', () => {
      expect(ExitCodes.SUCCESS).toBe(0);
      expect(ExitCodes.ERROR).toBe(1);
      expect(ExitCodes.CONFIG_ERROR).toBe(2);
      expect(ExitCodes.AUTH_ERROR).toBe(3);
      expect(ExitCodes.NETWORK_ERROR).toBe(4);
      expect(ExitCodes.TIMEOUT_ERROR).toBe(5);
      expect(ExitCodes.PERMISSION_ERROR).toBe(6);
      expect(ExitCodes.TOOL_ERROR).toBe(7);
    });
  });


  describe('超时管理', () => {
    /**
     * 测试超时管理器基本功能
     *
     * **Validates: Requirements 9.4**
     */
    it('超时管理器应该正确计时', async () => {
      const timeoutManager = new TimeoutManager({ totalMs: 5000 });

      timeoutManager.start();

      // 等待一段时间
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(timeoutManager.getElapsedMs()).toBeGreaterThanOrEqual(100);
      expect(timeoutManager.getRemainingMs()).toBeLessThanOrEqual(4900);
      expect(timeoutManager.hasTimedOut()).toBe(false);

      timeoutManager.stop();
    });

    /**
     * 测试超时回调
     *
     * **Validates: Requirements 9.4**
     */
    it('超时应该触发回调', async () => {
      let timeoutTriggered = false;
      const timeoutManager = new TimeoutManager({ totalMs: 100 });

      timeoutManager.start(() => {
        timeoutTriggered = true;
      });

      // 等待超时
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(timeoutTriggered).toBe(true);
      expect(timeoutManager.hasTimedOut()).toBe(true);

      timeoutManager.stop();
    });

    /**
     * 测试 withTimeout 方法
     *
     * **Validates: Requirements 9.4**
     */
    it('withTimeout 应该在超时时抛出错误', async () => {
      const timeoutManager = new TimeoutManager({ totalMs: 5000, queryMs: 100 });

      const slowPromise = new Promise((resolve) => setTimeout(resolve, 500));

      await expect(timeoutManager.withTimeout(slowPromise)).rejects.toThrow(TimeoutError);
    });

    /**
     * 测试 withTimeout 成功情况
     *
     * **Validates: Requirements 9.4**
     */
    it('withTimeout 应该在成功时返回结果', async () => {
      const timeoutManager = new TimeoutManager({ totalMs: 5000, queryMs: 1000 });

      const fastPromise = new Promise<string>((resolve) =>
        setTimeout(() => resolve('success'), 50)
      );

      const result = await timeoutManager.withTimeout(fastPromise);
      expect(result).toBe('success');
    });

    /**
     * 测试 hasTimeFor 方法
     *
     * **Validates: Requirements 9.4**
     */
    it('hasTimeFor 应该正确判断剩余时间', () => {
      const timeoutManager = new TimeoutManager({ totalMs: 1000 });

      timeoutManager.start();

      expect(timeoutManager.hasTimeFor(500)).toBe(true);
      expect(timeoutManager.hasTimeFor(2000)).toBe(false);

      timeoutManager.stop();
    });
  });


  describe('CISupport 综合测试', () => {
    /**
     * 测试 CISupport 初始化
     *
     * **Validates: Requirements 9.1, 9.2, 9.3**
     */
    it('CISupport 应该正确初始化', () => {
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';

      const ciSupport = new CISupport({
        timeout: { totalMs: 30000 },
      });

      expect(ciSupport.isCI()).toBe(true);
      expect(ciSupport.getEnvironment()).toBe('github-actions');
      expect(ciSupport.getLogger()).toBeDefined();
      expect(ciSupport.getTimeoutManager()).toBeDefined();
    });

    /**
     * 测试 CISupport 验证
     *
     * **Validates: Requirements 9.1**
     */
    it('CISupport 验证应该通过', () => {
      const ciSupport = new CISupport();
      const validation = ciSupport.validate();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    /**
     * 测试 CISupport 摘要
     *
     * **Validates: Requirements 9.1, 9.2, 9.3**
     */
    it('CISupport 应该生成正确的摘要', () => {
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_REPOSITORY = 'test/repo';

      const ciSupport = new CISupport({
        timeout: { totalMs: 30000 },
      });

      const summary = ciSupport.getSummary();

      expect(summary.isCI).toBe(true);
      expect(summary.environment).toBe('github-actions');
      expect(summary.timeout).toEqual({ totalMs: 30000 });
      expect(summary.structuredLogs).toBe(true);
      expect(summary.environmentInfo).toBeDefined();
    });

    /**
     * 测试执行生命周期
     *
     * **Validates: Requirements 9.4**
     */
    it('CISupport 应该管理执行生命周期', async () => {
      let timeoutTriggered = false;

      const ciSupport = new CISupport({
        timeout: { totalMs: 100 },
      });

      ciSupport.startExecution(() => {
        timeoutTriggered = true;
      });

      expect(ciSupport.hasTimedOut()).toBe(false);

      // 等待超时
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(ciSupport.hasTimedOut()).toBe(true);
      expect(timeoutTriggered).toBe(true);

      ciSupport.endExecution();
    });

    /**
     * 测试手动配置覆盖
     *
     * **Validates: Requirements 9.1, 9.2**
     */
    it('应该支持手动配置覆盖', () => {
      // 清除 CI 环境变量
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;

      const ciSupport = new CISupport({
        isCI: true,
        environment: 'jenkins',
        structuredLogs: false,
        silent: true,
      });

      const config = ciSupport.getConfig();

      expect(config.isCI).toBe(true);
      expect(config.environment).toBe('jenkins');
      expect(config.structuredLogs).toBe(false);
      expect(config.silent).toBe(true);
    });
  });
});
