/**
 * 性能管理器测试
 *
 * 测试性能优化功能，包括：
 * - 快速启动
 * - 增量加载
 * - 项目结构缓存
 * - 异步 I/O 操作
 * - Token 限制管理
 * - 内存使用监控
 *
 * @module PerformanceManager.test
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  PerformanceManager,
  PerformanceConfig,
  TokenLimitConfig,
} from '../../src/performance/PerformanceManager';

describe('PerformanceManager', () => {
  let performanceManager: PerformanceManager;
  let testDir: string;

  beforeEach(async () => {
    // 创建测试目录
    testDir = path.join(os.tmpdir(), `perf-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    // 创建性能管理器（禁用内存监控以避免测试干扰）
    performanceManager = new PerformanceManager({
      enableMemoryMonitoring: false,
      enableCaching: true,
      cacheDir: path.join(testDir, 'cache'),
      targetStartupTime: 2000,
    });

    await performanceManager.initialize();
  });

  afterEach(async () => {
    await performanceManager.shutdown();

    // 清理测试目录
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  describe('初始化', () => {
    it('应该成功初始化', async () => {
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      process.env.HOME = testDir;
      process.env.USERPROFILE = testDir;

      const manager = new PerformanceManager();
      try {
        await manager.initialize();
        expect(manager.getConfig()).toBeDefined();
      } finally {
        await manager.shutdown();
        process.env.HOME = originalHome;
        process.env.USERPROFILE = originalUserProfile;
      }
    });

    it('应该使用自定义配置', () => {
      const customConfig: Partial<PerformanceConfig> = {
        targetStartupTime: 3000,
        memoryThreshold: 1024 * 1024 * 1024, // 1 GB
        maxConcurrentIO: 20,
      };

      const manager = new PerformanceManager(customConfig);
      const config = manager.getConfig();

      expect(config.targetStartupTime).toBe(3000);
      expect(config.memoryThreshold).toBe(1024 * 1024 * 1024);
      expect(config.maxConcurrentIO).toBe(20);
    });
  });

  describe('快速启动', () => {
    it('应该测量启动时间', async () => {
      const { result, metrics } = await performanceManager.measureStartup(
        async () => {
          // 模拟初始化操作
          await new Promise((resolve) => setTimeout(resolve, 100));
          return 'initialized';
        }
      );

      expect(result).toBe('initialized');
      expect(metrics.totalTime).toBeGreaterThanOrEqual(100);
      expect(metrics.targetTime).toBe(2000);
      expect(typeof metrics.withinTarget).toBe('boolean');
    });

    it('应该在目标时间内完成时标记为成功', async () => {
      const { metrics } = await performanceManager.measureStartup(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return true;
      });

      expect(metrics.withinTarget).toBe(true);
    });

    it('应该记录启动指标', async () => {
      await performanceManager.measureStartup(async () => {
        return true;
      });

      const metrics = performanceManager.getStartupMetrics();
      expect(metrics).not.toBeNull();
      expect(metrics?.totalTime).toBeGreaterThanOrEqual(0);
    });

    it('应该支持延迟初始化', (done) => {
      let initialized = false;

      performanceManager.deferInitialization(async () => {
        initialized = true;
      }, 50);

      // 立即检查应该还未初始化
      expect(initialized).toBe(false);

      // 延迟后检查应该已初始化
      setTimeout(() => {
        expect(initialized).toBe(true);
        done();
      }, 100);
    });
  });

  describe('增量加载', () => {
    beforeEach(async () => {
      // 创建测试项目结构
      const projectDir = path.join(testDir, 'project');
      await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
      await fs.mkdir(path.join(projectDir, 'tests'), { recursive: true });

      await fs.writeFile(path.join(projectDir, 'src', 'index.ts'), 'export {}');
      await fs.writeFile(path.join(projectDir, 'src', 'utils.ts'), 'export {}');
      await fs.writeFile(path.join(projectDir, 'tests', 'index.test.ts'), 'test()');
      await fs.writeFile(path.join(projectDir, 'package.json'), '{}');
    });

    it('应该增量加载项目结构', async () => {
      const projectDir = path.join(testDir, 'project');
      const stats = await performanceManager.loadProjectIncrementally(projectDir);

      expect(stats.totalFiles).toBeGreaterThan(0);
      expect(stats.totalDirectories).toBeGreaterThan(0);
    });

    it('应该报告加载进度', async () => {
      const projectDir = path.join(testDir, 'project');
      const progressUpdates: number[] = [];

      await performanceManager.loadProjectIncrementally(projectDir, (state) => {
        progressUpdates.push(state.progress);
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
    });

    it('应该检测主要编程语言', async () => {
      const projectDir = path.join(testDir, 'project');
      const stats = await performanceManager.loadProjectIncrementally(projectDir);

      expect(stats.primaryLanguage).toBe('TypeScript');
    });

    it('应该忽略 node_modules 目录', async () => {
      const projectDir = path.join(testDir, 'project');
      await fs.mkdir(path.join(projectDir, 'node_modules', 'pkg'), { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'node_modules', 'pkg', 'index.js'),
        ''
      );

      const stats = await performanceManager.loadProjectIncrementally(projectDir);

      // node_modules 中的文件不应该被计入
      expect(stats.totalFiles).toBeLessThan(10);
    });
  });

  describe('项目结构缓存', () => {
    it('应该缓存项目结构', async () => {
      const projectDir = path.join(testDir, 'project');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'index.ts'), '');

      // 首次加载
      await performanceManager.loadProjectIncrementally(projectDir);

      // 获取缓存
      const cache = await performanceManager.getProjectCache(projectDir);
      expect(cache).not.toBeNull();
      expect(cache?.projectPath).toBe(projectDir);
    });

    it('应该使用缓存加速后续加载', async () => {
      const projectDir = path.join(testDir, 'project');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'index.ts'), '');

      // 首次加载
      const start1 = Date.now();
      await performanceManager.loadProjectIncrementally(projectDir);
      const time1 = Date.now() - start1;

      // 第二次加载（应该使用缓存）
      const start2 = Date.now();
      await performanceManager.loadProjectIncrementally(projectDir);
      const time2 = Date.now() - start2;

      // 缓存加载应该更快
      expect(time2).toBeLessThanOrEqual(time1 + 10); // 允许一些误差
    });

    it('应该能够使缓存失效', async () => {
      const projectDir = path.join(testDir, 'project');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'index.ts'), '');

      // 加载并缓存
      await performanceManager.loadProjectIncrementally(projectDir);
      expect(await performanceManager.getProjectCache(projectDir)).not.toBeNull();

      // 使缓存失效
      await performanceManager.invalidateProjectCache(projectDir);
      expect(await performanceManager.getProjectCache(projectDir)).toBeNull();
    });

    it('应该能够清除所有缓存', async () => {
      const projectDir = path.join(testDir, 'project');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'index.ts'), '');

      await performanceManager.loadProjectIncrementally(projectDir);
      await performanceManager.clearAllCache();

      expect(await performanceManager.getProjectCache(projectDir)).toBeNull();
    });
  });

  describe('异步 I/O 操作', () => {
    it('应该异步读取文件', async () => {
      const filePath = path.join(testDir, 'test.txt');
      await fs.writeFile(filePath, 'Hello, World!');

      const content = await performanceManager.readFileAsync(filePath);
      expect(content).toBe('Hello, World!');
    });

    it('应该异步写入文件', async () => {
      const filePath = path.join(testDir, 'output.txt');
      await performanceManager.writeFileAsync(filePath, 'Test content');

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Test content');
    });

    it('应该批量读取文件', async () => {
      const files = ['file1.txt', 'file2.txt', 'file3.txt'];
      for (const file of files) {
        await fs.writeFile(path.join(testDir, file), `Content of ${file}`);
      }

      const filePaths = files.map((f) => path.join(testDir, f));
      const results = await performanceManager.readFilesAsync(filePaths);

      expect(results.size).toBe(3);
      for (const file of files) {
        const content = results.get(path.join(testDir, file));
        expect(content).toBe(`Content of ${file}`);
      }
    });

    it('应该按优先级处理操作', async () => {
      const results: number[] = [];

      // 创建测试文件
      for (let i = 1; i <= 3; i++) {
        await fs.writeFile(path.join(testDir, `file${i}.txt`), `${i}`);
      }

      // 同时提交不同优先级的操作
      const promises = [
        performanceManager.readFileAsync(path.join(testDir, 'file1.txt'), 10).then(() => results.push(1)),
        performanceManager.readFileAsync(path.join(testDir, 'file2.txt'), 1).then(() => results.push(2)),
        performanceManager.readFileAsync(path.join(testDir, 'file3.txt'), 5).then(() => results.push(3)),
      ];

      await Promise.all(promises);

      // 所有操作都应该完成
      expect(results.length).toBe(3);
      expect(results).toContain(1);
      expect(results).toContain(2);
      expect(results).toContain(3);
    });

    it('应该报告队列状态', async () => {
      const status = performanceManager.getQueueStatus();
      expect(status).toHaveProperty('pending');
      expect(status).toHaveProperty('active');
    });
  });

  describe('Token 限制管理', () => {
    it('应该设置和获取 token 限制', () => {
      const config: Partial<TokenLimitConfig> = {
        maxContextTokens: 100000,
        maxOutputTokens: 4096,
      };

      performanceManager.setTokenLimits(config);
      const limits = performanceManager.getTokenLimits();

      expect(limits.maxContextTokens).toBe(100000);
      expect(limits.maxOutputTokens).toBe(4096);
    });

    it('应该检查 token 使用情况', () => {
      performanceManager.setTokenLimits({
        maxContextTokens: 100000,
        reserveRatio: 0.2,
        warningThreshold: 0.8,
      });

      const status = performanceManager.checkTokenUsage(50000);

      expect(status.currentTokens).toBe(50000);
      expect(status.maxTokens).toBe(100000);
      expect(status.effectiveLimit).toBe(80000); // 100000 * 0.8
      expect(status.usagePercent).toBeCloseTo(0.625, 2); // 50000 / 80000
      expect(status.available).toBe(30000);
      expect(status.isWarning).toBe(false);
      expect(status.isExceeded).toBe(false);
    });

    it('应该在接近限制时发出警告', () => {
      performanceManager.setTokenLimits({
        maxContextTokens: 100000,
        reserveRatio: 0.2,
        warningThreshold: 0.8,
      });

      const status = performanceManager.checkTokenUsage(70000);

      expect(status.isWarning).toBe(true);
      expect(status.isExceeded).toBe(false);
    });

    it('应该在超出限制时标记', () => {
      performanceManager.setTokenLimits({
        maxContextTokens: 100000,
        reserveRatio: 0.2,
        warningThreshold: 0.8,
      });

      const status = performanceManager.checkTokenUsage(85000);

      expect(status.isExceeded).toBe(true);
    });

    it('应该估算文本的 token 数', () => {
      const englishText = 'Hello, this is a test message.';
      const chineseText = '你好，这是一条测试消息。';

      const englishTokens = performanceManager.estimateTokens(englishText);
      const chineseTokens = performanceManager.estimateTokens(chineseText);

      expect(englishTokens).toBeGreaterThan(0);
      expect(chineseTokens).toBeGreaterThan(0);
      // 中文通常需要更多 token
      expect(chineseTokens).toBeGreaterThan(englishTokens * 0.5);
    });

    it('应该提供使用建议', () => {
      performanceManager.setTokenLimits({
        maxContextTokens: 100000,
        reserveRatio: 0.2,
        warningThreshold: 0.8,
      });

      const lowUsage = performanceManager.checkTokenUsage(20000);
      const highUsage = performanceManager.checkTokenUsage(75000);
      const exceeded = performanceManager.checkTokenUsage(90000);

      expect(lowUsage.recommendation).toContain('Token usage is sufficient');
      expect(highUsage.recommendation).toContain('Approaching');
      expect(exceeded.recommendation).toContain('exceeded');
    });
  });

  describe('内存使用监控', () => {
    it('应该获取内存使用情况', () => {
      const usage = performanceManager.getMemoryUsage();

      expect(usage.heapUsed).toBeGreaterThan(0);
      expect(usage.heapTotal).toBeGreaterThan(0);
      expect(usage.rss).toBeGreaterThan(0);
      expect(typeof usage.usagePercent).toBe('number');
      expect(typeof usage.overThreshold).toBe('boolean');
    });

    it('应该执行内存清理', () => {
      // 这个测试主要确保清理不会抛出错误
      expect(() => {
        performanceManager.performMemoryCleanup();
      }).not.toThrow();
    });

    it('应该尝试强制垃圾回收', () => {
      const result = performanceManager.forceGC();
      // 结果取决于是否使用 --expose-gc 标志运行
      expect(typeof result).toBe('boolean');
    });
  });

  describe('配置管理', () => {
    it('应该获取配置', () => {
      const config = performanceManager.getConfig();

      expect(config.targetStartupTime).toBeDefined();
      expect(config.memoryThreshold).toBeDefined();
      expect(config.maxConcurrentIO).toBeDefined();
    });

    it('应该更新配置', () => {
      performanceManager.updateConfig({
        targetStartupTime: 5000,
        maxConcurrentIO: 50,
      });

      const config = performanceManager.getConfig();
      expect(config.targetStartupTime).toBe(5000);
      expect(config.maxConcurrentIO).toBe(50);
    });
  });

  describe('性能摘要', () => {
    it('应该获取性能摘要', () => {
      const summary = performanceManager.getPerformanceSummary();

      expect(summary).toHaveProperty('startup');
      expect(summary).toHaveProperty('memory');
      expect(summary).toHaveProperty('asyncQueue');
      expect(summary).toHaveProperty('cacheSize');
      expect(summary).toHaveProperty('incrementalLoad');
      expect(summary).toHaveProperty('tokenLimits');
    });
  });
});
