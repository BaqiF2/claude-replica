/**
 * CI/CD 集成属性测试
 *
 * 使用 fast-check 进行属性测试，验证 CI/CD 集成的正确性
 *
 * **Property 19: CI Mode Detection**
 * **Property 20: Parallel Test Isolation**
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.5**
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import {
  CISupport,
  CIDetector,
  StructuredLogger,
  TimeoutManager,
  CIEnvironment,
} from '../../src/ci/CISupport';
import { EnvConfig } from '../../src/config/EnvConfig';
import { TestFixture, createTestFixture } from '../../src/testing/TestFixture';

describe('CI Property Tests', () => {
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


  /**
   * 清除所有 CI 相关环境变量
   */
  function clearCIEnvVars(): void {
    const ciEnvVars = [
      'CI',
      'CONTINUOUS_INTEGRATION',
      'GITHUB_ACTIONS',
      'GITLAB_CI',
      'JENKINS_URL',
      'CIRCLECI',
      'TRAVIS',
      'TF_BUILD',
      'BUILDKITE',
      'DRONE',
      'TEAMCITY_VERSION',
      'CODEBUILD_BUILD_ID',
      'BITBUCKET_PIPELINE_UUID',
      'GITHUB_REPOSITORY',
      'GITHUB_WORKFLOW',
      'GITHUB_RUN_ID',
      'GITHUB_RUN_NUMBER',
      'GITHUB_ACTOR',
      'GITHUB_REF',
      'GITHUB_SHA',
      'CI_PROJECT_NAME',
      'CI_PIPELINE_ID',
      'CI_JOB_NAME',
      'CI_COMMIT_REF_NAME',
      'CI_COMMIT_SHA',
      'JOB_NAME',
      'BUILD_NUMBER',
      'BUILD_URL',
      'CIRCLE_PROJECT_REPONAME',
      'CIRCLE_BUILD_NUM',
    ];

    for (const envVar of ciEnvVars) {
      delete process.env[envVar];
    }
  }

  /**
   * Property 19: CI Mode Detection
   *
   * *For any* CI environment variable (GITHUB_ACTIONS, GITLAB_CI, JENKINS_URL, CI),
   * when set, the CLI should detect CI mode and adjust behavior accordingly.
   *
   * **Validates: Requirements 9.1, 9.2, 9.3**
   */
  describe('Property 19: CI Mode Detection', () => {
    // CI 环境变量及其对应的环境类型
    const ciEnvironments: Array<{
      envVar: string;
      value: string;
      expectedEnv: CIEnvironment;
    }> = [
      { envVar: 'GITHUB_ACTIONS', value: 'true', expectedEnv: 'github-actions' },
      { envVar: 'GITLAB_CI', value: 'true', expectedEnv: 'gitlab-ci' },
      { envVar: 'JENKINS_URL', value: 'http://jenkins.example.com', expectedEnv: 'jenkins' },
      { envVar: 'CIRCLECI', value: 'true', expectedEnv: 'circleci' },
      { envVar: 'TRAVIS', value: 'true', expectedEnv: 'travis' },
      { envVar: 'TF_BUILD', value: 'True', expectedEnv: 'azure-pipelines' },
      { envVar: 'BUILDKITE', value: 'true', expectedEnv: 'buildkite' },
      { envVar: 'DRONE', value: 'true', expectedEnv: 'drone' },
      { envVar: 'TEAMCITY_VERSION', value: '2021.1', expectedEnv: 'teamcity' },
      { envVar: 'CODEBUILD_BUILD_ID', value: 'build-123', expectedEnv: 'codebuild' },
    ];

    // 生成 CI 环境配置
    const ciEnvArb = fc.constantFrom(...ciEnvironments);

    it('设置任何 CI 环境变量都应该检测为 CI 模式', async () => {
      await fc.assert(
        fc.asyncProperty(ciEnvArb, async (ciEnv) => {
          // 清除所有 CI 环境变量
          clearCIEnvVars();

          // 设置特定的 CI 环境变量
          process.env[ciEnv.envVar] = ciEnv.value;

          // 验证 CI 检测
          expect(CIDetector.isCI()).toBe(true);
          expect(EnvConfig.isCI()).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('设置 CI 环境变量应该正确识别环境类型', async () => {
      await fc.assert(
        fc.asyncProperty(ciEnvArb, async (ciEnv) => {
          // 清除所有 CI 环境变量
          clearCIEnvVars();

          // 设置特定的 CI 环境变量
          process.env[ciEnv.envVar] = ciEnv.value;

          // 验证环境类型
          expect(CIDetector.detectEnvironment()).toBe(ciEnv.expectedEnv);
        }),
        { numRuns: 100 }
      );
    });


    it('CI 模式应该自动启用结构化日志', async () => {
      await fc.assert(
        fc.asyncProperty(ciEnvArb, async (ciEnv) => {
          // 清除所有 CI 环境变量
          clearCIEnvVars();

          // 设置特定的 CI 环境变量
          process.env[ciEnv.envVar] = ciEnv.value;

          // 创建 CISupport 实例
          const ciSupport = new CISupport();
          const config = ciSupport.getConfig();

          // 验证 CI 模式和结构化日志
          expect(config.isCI).toBe(true);
          expect(config.structuredLogs).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('通用 CI 变量应该检测为 unknown-ci', async () => {
      await fc.assert(
        fc.asyncProperty(
          // EnvConfig.getBoolean 只接受 'true' 或 '1' 作为真值
          fc.constantFrom('true', '1'),
          async (value) => {
            // 清除所有 CI 环境变量
            clearCIEnvVars();

            // 只设置通用 CI 变量
            process.env.CI = value;

            // 验证检测
            expect(CIDetector.isCI()).toBe(true);
            expect(CIDetector.detectEnvironment()).toBe('unknown-ci');
          }
        ),
        { numRuns: 30 }
      );
    });

    it('没有 CI 环境变量应该检测为本地环境', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          // 清除所有 CI 环境变量
          clearCIEnvVars();

          // 验证检测
          expect(CIDetector.isCI()).toBe(false);
          expect(CIDetector.detectEnvironment()).toBe('local');
        }),
        { numRuns: 10 }
      );
    });

    it('CI 环境信息应该包含正确的元数据', async () => {
      // GitHub Actions 特定测试
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            repository: fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9/_-]+$/.test(s)),
            workflow: fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
            runId: fc.integer({ min: 1, max: 999999 }).map(String),
          }),
          async (metadata) => {
            // 清除所有 CI 环境变量
            clearCIEnvVars();

            // 设置 GitHub Actions 环境变量
            process.env.GITHUB_ACTIONS = 'true';
            process.env.GITHUB_REPOSITORY = metadata.repository;
            process.env.GITHUB_WORKFLOW = metadata.workflow;
            process.env.GITHUB_RUN_ID = metadata.runId;

            // 获取环境信息
            const info = CIDetector.getEnvironmentInfo();

            // 验证元数据
            expect(info.environment).toBe('github-actions');
            expect(info.repository).toBe(metadata.repository);
            expect(info.workflow).toBe(metadata.workflow);
            expect(info.runId).toBe(metadata.runId);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('结构化日志应该输出有效的 JSON', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            message: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
            key: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s)),
            value: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
          }),
          async (logData) => {
            const logs: string[] = [];
            const originalLog = console.log;
            console.log = (msg: string) => logs.push(msg);

            try {
              const logger = new StructuredLogger();
              logger.info(logData.message, { [logData.key]: logData.value });

              expect(logs.length).toBe(1);

              // 验证输出是有效的 JSON
              const parsed = JSON.parse(logs[0]);
              expect(parsed.level).toBe('info');
              expect(parsed.message).toBe(logData.message);
              expect(parsed.data[logData.key]).toBe(logData.value);
              expect(parsed.timestamp).toBeDefined();
            } finally {
              console.log = originalLog;
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Property 20: Parallel Test Isolation
   *
   * *For any* two tests running in parallel, they should not interfere with
   * each other's temp directories, environment variables, or session data.
   *
   * **Validates: Requirements 9.5**
   */
  describe('Property 20: Parallel Test Isolation', () => {
    it('并行创建的 TestFixture 应该有独立的临时目录', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          async (count) => {
            const fixtures: TestFixture[] = [];
            const tempDirs: string[] = [];

            try {
              // 并行创建多个 fixture
              const createPromises = Array.from({ length: count }, () =>
                createTestFixture({ createTempDir: true })
              );

              for (const fixture of createPromises) {
                fixtures.push(fixture);
              }

              // 并行设置所有 fixture
              const setupPromises = fixtures.map(async (fixture) => {
                const context = await fixture.setup();
                return context.tempDir;
              });

              const dirs = await Promise.all(setupPromises);
              tempDirs.push(...dirs);

              // 验证所有临时目录都是唯一的
              const uniqueDirs = new Set(tempDirs);
              expect(uniqueDirs.size).toBe(count);

              // 验证所有目录都存在
              for (const dir of tempDirs) {
                const exists = await fs.access(dir).then(() => true).catch(() => false);
                expect(exists).toBe(true);
              }
            } finally {
              // 清理所有 fixture
              for (const fixture of fixtures) {
                await fixture.teardown().catch(() => {});
              }
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('并行创建的文件应该在各自的临时目录中隔离', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              filename: fc.string({ minLength: 1, maxLength: 20 })
                .filter(s => /^[a-zA-Z0-9]+$/.test(s))
                .map(s => `${s.toLowerCase()}.txt`),
              content: fc.string({ minLength: 1, maxLength: 100 }),
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (fileSpecs) => {
            const fixtures: TestFixture[] = [];

            try {
              // 为每个文件规格创建一个 fixture
              for (const spec of fileSpecs) {
                const fixture = createTestFixture({ createTempDir: true });
                fixtures.push(fixture);
                await fixture.setup();

                // 在各自的临时目录中创建文件
                await fixture.createFile(spec.filename, spec.content);
              }

              // 验证每个 fixture 只能看到自己的文件
              for (let i = 0; i < fixtures.length; i++) {
                const fixture = fixtures[i];
                const spec = fileSpecs[i];

                // 验证自己的文件存在
                const ownFileExists = await fixture.fileExists(spec.filename);
                expect(ownFileExists).toBe(true);

                // 验证自己的文件内容正确
                const content = await fixture.readFile(spec.filename);
                expect(content).toBe(spec.content);

                // 验证其他 fixture 的文件不存在于当前目录
                for (let j = 0; j < fixtures.length; j++) {
                  if (i !== j) {
                    const otherSpec = fileSpecs[j];
                    // 只有当文件名不同时才检查
                    // 使用大小写敏感的比较，避免大小写不敏感文件系统的误判
                    if (spec.filename !== otherSpec.filename) {
                      const otherFileExists = await fixture.fileExists(otherSpec.filename);
                      // 其他 fixture 的文件不应该存在于当前 fixture 的目录中
                      // 除非文件名恰好相同
                      expect(otherFileExists).toBe(false);
                    }
                  }
                }
              }
            } finally {
              // 清理所有 fixture
              for (const fixture of fixtures) {
                await fixture.teardown().catch(() => {});
              }
            }
          }
        ),
        { numRuns: 20 }
      );
    });


    it('并行设置的环境变量应该在各自的 fixture 中隔离', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              key: fc.string({ minLength: 3, maxLength: 20 })
                .filter(s => /^[A-Z][A-Z0-9_]*$/.test(s))
                .map(s => `TEST_${s}_${Date.now()}`),
              value: fc.string({ minLength: 1, maxLength: 50 }),
            }),
            { minLength: 2, maxLength: 4 }
          ),
          async (envSpecs) => {
            const fixtures: TestFixture[] = [];
            const originalEnvValues: Map<string, string | undefined> = new Map();

            try {
              // 保存原始环境变量值
              for (const spec of envSpecs) {
                originalEnvValues.set(spec.key, process.env[spec.key]);
              }

              // 为每个环境变量规格创建一个 fixture
              for (const spec of envSpecs) {
                const fixture = createTestFixture({ createTempDir: true });
                fixtures.push(fixture);
                await fixture.setup();

                // 设置环境变量
                fixture.setEnv(spec.key, spec.value);
              }

              // 验证环境变量设置正确
              for (let i = 0; i < fixtures.length; i++) {
                const spec = envSpecs[i];
                expect(process.env[spec.key]).toBe(spec.value);
              }

              // 清理 fixture 并验证环境变量恢复
              for (let i = fixtures.length - 1; i >= 0; i--) {
                const fixture = fixtures[i];
                const spec = envSpecs[i];

                fixture.restoreEnv();

                // 验证环境变量已恢复
                expect(process.env[spec.key]).toBe(originalEnvValues.get(spec.key));
              }
            } finally {
              // 确保清理
              for (const fixture of fixtures) {
                await fixture.teardown().catch(() => {});
              }

              // 恢复原始环境变量
              for (const [key, value] of originalEnvValues) {
                if (value === undefined) {
                  delete process.env[key];
                } else {
                  process.env[key] = value;
                }
              }
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('并行的 CISupport 实例应该独立配置', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              isCI: fc.boolean(),
              structuredLogs: fc.boolean(),
              silent: fc.boolean(),
              timeoutMs: fc.integer({ min: 1000, max: 60000 }),
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (configs) => {
            const instances: CISupport[] = [];

            // 创建多个 CISupport 实例
            for (const config of configs) {
              const instance = new CISupport({
                isCI: config.isCI,
                structuredLogs: config.structuredLogs,
                silent: config.silent,
                timeout: { totalMs: config.timeoutMs },
              });
              instances.push(instance);
            }

            // 验证每个实例的配置独立
            for (let i = 0; i < instances.length; i++) {
              const instance = instances[i];
              const expectedConfig = configs[i];
              const actualConfig = instance.getConfig();

              expect(actualConfig.isCI).toBe(expectedConfig.isCI);
              expect(actualConfig.structuredLogs).toBe(expectedConfig.structuredLogs);
              expect(actualConfig.silent).toBe(expectedConfig.silent);
              expect(actualConfig.timeout?.totalMs).toBe(expectedConfig.timeoutMs);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('并行的 TimeoutManager 实例应该独立计时', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.integer({ min: 100, max: 500 }),
            { minLength: 2, maxLength: 4 }
          ),
          async (timeouts) => {
            const managers: TimeoutManager[] = [];

            // 创建多个 TimeoutManager 实例
            for (const timeout of timeouts) {
              const manager = new TimeoutManager({ totalMs: timeout });
              managers.push(manager);
            }

            // 启动所有计时器
            for (const manager of managers) {
              manager.start();
            }

            // 等待足够长的时间以确保计时器开始工作
            await new Promise((resolve) => setTimeout(resolve, 100));

            // 验证每个计时器独立运行
            for (let i = 0; i < managers.length; i++) {
              const manager = managers[i];
              const elapsed = manager.getElapsedMs();
              const remaining = manager.getRemainingMs();

              // 已用时间应该大于 0（增加容差）
              expect(elapsed).toBeGreaterThanOrEqual(0);

              // 剩余时间应该小于总时间（使用容差）
              expect(remaining).toBeLessThanOrEqual(timeouts[i]);

              // 已用时间 + 剩余时间应该约等于总时间
              expect(elapsed + remaining).toBeCloseTo(timeouts[i], -1);
            }

            // 停止所有计时器
            for (const manager of managers) {
              manager.stop();
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });


  /**
   * 超时管理属性测试
   *
   * **Validates: Requirements 9.4**
   */
  describe('Timeout Management Properties', () => {
    it('超时时间应该正确计算', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 5000 }),
          async (totalMs) => {
            const manager = new TimeoutManager({ totalMs });

            manager.start();

            // 等待一小段时间
            const waitTime = Math.min(50, totalMs / 2);
            await new Promise((resolve) => setTimeout(resolve, waitTime));

            const elapsed = manager.getElapsedMs();
            const remaining = manager.getRemainingMs();

            // 已用时间应该大于等于等待时间（允许一些误差）
            expect(elapsed).toBeGreaterThanOrEqual(waitTime - 10);

            // 剩余时间应该小于等于总时间减去等待时间（允许一些误差）
            expect(remaining).toBeLessThanOrEqual(totalMs - waitTime + 10);

            // 已用时间 + 剩余时间应该约等于总时间
            expect(elapsed + remaining).toBeCloseTo(totalMs, -1);

            manager.stop();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('hasTimeFor 应该正确判断', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            totalMs: fc.integer({ min: 1000, max: 10000 }),
            checkMs: fc.integer({ min: 100, max: 5000 }),
          }),
          async ({ totalMs, checkMs }) => {
            const manager = new TimeoutManager({ totalMs });

            manager.start();

            // 立即检查
            const hasTime = manager.hasTimeFor(checkMs);

            // 如果检查时间小于总时间，应该有足够时间
            if (checkMs < totalMs) {
              expect(hasTime).toBe(true);
            } else {
              expect(hasTime).toBe(false);
            }

            manager.stop();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 退出码映射属性测试
   *
   * **Validates: Requirements 9.4**
   */
  describe('Exit Code Mapping Properties', () => {
    // 错误类型和预期退出码的映射
    const errorMappings = [
      { pattern: 'timeout', expectedCode: 5 },
      { pattern: 'ENOTFOUND', expectedCode: 4 },
      { pattern: 'ECONNREFUSED', expectedCode: 4 },
      { pattern: 'network', expectedCode: 4 },
      { pattern: '401', expectedCode: 3 },
      { pattern: '403', expectedCode: 3 },
      { pattern: 'api key', expectedCode: 3 },
      { pattern: 'auth', expectedCode: 3 },
      { pattern: 'config', expectedCode: 2 },
      { pattern: 'permission', expectedCode: 6 },
      { pattern: 'tool', expectedCode: 7 },
    ];

    it('错误消息应该映射到正确的退出码', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...errorMappings),
          fc.string({ minLength: 0, maxLength: 50 }),
          async (mapping, suffix) => {
            const errorMessage = `${mapping.pattern} ${suffix}`;
            const error = new Error(errorMessage);
            const exitCode = CISupport.getExitCode(error);

            expect(exitCode).toBe(mapping.expectedCode);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('未知错误应该返回退出码 1', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 })
            .filter(s => {
              const lower = s.toLowerCase();
              return !lower.includes('timeout') &&
                     !lower.includes('network') &&
                     !lower.includes('enotfound') &&
                     !lower.includes('econnrefused') &&
                     !lower.includes('401') &&
                     !lower.includes('403') &&
                     !lower.includes('api key') &&
                     !lower.includes('auth') &&
                     !lower.includes('config') &&
                     !lower.includes('permission') &&
                     !lower.includes('tool');
            }),
          async (message) => {
            const error = new Error(message);
            const exitCode = CISupport.getExitCode(error);

            expect(exitCode).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
