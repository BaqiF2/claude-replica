/**
 * 报告生成器单元测试
 *
 * 测试 ReportGenerator 的各种格式输出功能
 *
 * _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ReportGenerator,
  createReportGenerator,
  TestResult,
  TestSuiteResult,
} from '../../src/testing/ReportGenerator';

describe('ReportGenerator', () => {
  let generator: ReportGenerator;
  let tempDir: string;

  // 测试数据
  const createTestResult = (
    name: string,
    status: 'passed' | 'failed' | 'skipped',
    duration: number,
    options?: { error?: string; output?: string }
  ): TestResult => ({
    name,
    suite: 'TestSuite',
    status,
    duration,
    error: options?.error,
    output: options?.output,
  });

  const createTestSuite = (
    name: string,
    tests: TestResult[]
  ): TestSuiteResult => ({
    name,
    tests,
    duration: tests.reduce((sum, t) => sum + t.duration, 0),
    passed: tests.filter((t) => t.status === 'passed').length,
    failed: tests.filter((t) => t.status === 'failed').length,
    skipped: tests.filter((t) => t.status === 'skipped').length,
  });

  beforeEach(() => {
    generator = createReportGenerator();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-test-'));
  });

  afterEach(() => {
    // 清理临时目录
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });


  describe('createReportGenerator', () => {
    it('应该创建 ReportGenerator 实例', () => {
      const gen = createReportGenerator();
      expect(gen).toBeInstanceOf(ReportGenerator);
    });
  });

  describe('generateJUnit', () => {
    it('应该生成有效的 JUnit XML 格式', () => {
      const tests = [
        createTestResult('test1', 'passed', 100),
        createTestResult('test2', 'failed', 200, { error: 'Test failed' }),
        createTestResult('test3', 'skipped', 50),
      ];
      const suite = createTestSuite('MySuite', tests);

      const xml = generator.generateJUnit([suite]);

      // 验证 XML 声明
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');

      // 验证根元素属性
      expect(xml).toContain('<testsuites');
      expect(xml).toContain('tests="3"');
      expect(xml).toContain('failures="1"');
      expect(xml).toContain('skipped="1"');

      // 验证测试套件
      expect(xml).toContain('<testsuite name="MySuite"');
      expect(xml).toContain('</testsuite>');

      // 验证测试用例
      expect(xml).toContain('<testcase name="test1"');
      expect(xml).toContain('<testcase name="test2"');
      expect(xml).toContain('<testcase name="test3"');

      // 验证失败信息
      expect(xml).toContain('<failure');
      expect(xml).toContain('Test failed');

      // 验证跳过标记
      expect(xml).toContain('<skipped />');
    });

    it('应该正确计算执行时间（秒）', () => {
      const tests = [
        createTestResult('test1', 'passed', 1500), // 1.5秒
        createTestResult('test2', 'passed', 2500), // 2.5秒
      ];
      const suite = createTestSuite('TimeSuite', tests);

      const xml = generator.generateJUnit([suite]);

      // 总时间应该是 4 秒
      expect(xml).toContain('time="4.000"');
    });

    it('应该转义 XML 特殊字符', () => {
      const tests = [
        createTestResult('test with <special> & "chars"', 'failed', 100, {
          error: 'Error with <xml> & "quotes"',
        }),
      ];
      const suite = createTestSuite('Suite with <special>', tests);

      const xml = generator.generateJUnit([suite]);

      // 验证特殊字符被转义
      expect(xml).toContain('&lt;special&gt;');
      expect(xml).toContain('&amp;');
      expect(xml).toContain('&quot;');
    });

    it('应该处理空测试套件', () => {
      const xml = generator.generateJUnit([]);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<testsuites');
      expect(xml).toContain('tests="0"');
      expect(xml).toContain('</testsuites>');
    });

    it('应该包含失败测试的输出', () => {
      const tests = [
        createTestResult('test1', 'failed', 100, {
          error: 'Assertion failed',
          output: 'Some debug output',
        }),
      ];
      const suite = createTestSuite('OutputSuite', tests);

      const xml = generator.generateJUnit([suite]);

      expect(xml).toContain('<system-out>');
      expect(xml).toContain('Some debug output');
      expect(xml).toContain('</system-out>');
    });
  });


  describe('generateHTML', () => {
    it('应该生成有效的 HTML 文档', () => {
      const tests = [
        createTestResult('test1', 'passed', 100),
        createTestResult('test2', 'failed', 200, { error: 'Test failed' }),
      ];
      const suite = createTestSuite('HTMLSuite', tests);

      const html = generator.generateHTML([suite]);

      // 验证 HTML 结构
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
      expect(html).toContain('<head>');
      expect(html).toContain('</head>');
      expect(html).toContain('<body>');
      expect(html).toContain('</body>');
    });

    it('应该包含测试统计信息', () => {
      const tests = [
        createTestResult('test1', 'passed', 100),
        createTestResult('test2', 'passed', 100),
        createTestResult('test3', 'failed', 100),
        createTestResult('test4', 'skipped', 100),
      ];
      const suite = createTestSuite('StatsSuite', tests);

      const html = generator.generateHTML([suite]);

      // 验证统计信息
      expect(html).toContain('总计: 4');
      expect(html).toContain('通过: 2');
      expect(html).toContain('失败: 1');
      expect(html).toContain('跳过: 1');
    });

    it('应该包含测试套件名称', () => {
      const tests = [createTestResult('test1', 'passed', 100)];
      const suite = createTestSuite('MyTestSuite', tests);

      const html = generator.generateHTML([suite]);

      expect(html).toContain('MyTestSuite');
    });

    it('应该显示失败测试的错误信息', () => {
      const tests = [
        createTestResult('failingTest', 'failed', 100, {
          error: 'Expected true but got false',
        }),
      ];
      const suite = createTestSuite('ErrorSuite', tests);

      const html = generator.generateHTML([suite]);

      expect(html).toContain('Expected true but got false');
      expect(html).toContain('test-error');
    });

    it('应该转义 HTML 特殊字符', () => {
      const tests = [
        createTestResult('test <script>alert(1)</script>', 'passed', 100),
      ];
      const suite = createTestSuite('XSS Suite', tests);

      const html = generator.generateHTML([suite]);

      // 验证脚本标签被转义
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<script>alert');
    });

    it('应该包含 CSS 样式', () => {
      const tests = [createTestResult('test1', 'passed', 100)];
      const suite = createTestSuite('StyleSuite', tests);

      const html = generator.generateHTML([suite]);

      expect(html).toContain('<style>');
      expect(html).toContain('</style>');
      expect(html).toContain('.test-status');
    });

    it('当 includeOutput 为 true 时应该包含输出', () => {
      const tests = [
        createTestResult('test1', 'passed', 100, {
          output: 'Test output content',
        }),
      ];
      const suite = createTestSuite('OutputSuite', tests);

      const html = generator.generateHTML([suite], { format: 'html', includeOutput: true });

      expect(html).toContain('Test output content');
      expect(html).toContain('test-output');
    });
  });


  describe('generateJSON', () => {
    it('应该生成有效的 JSON', () => {
      const tests = [
        createTestResult('test1', 'passed', 100),
        createTestResult('test2', 'failed', 200, { error: 'Error message' }),
      ];
      const suite = createTestSuite('JSONSuite', tests);

      const jsonStr = generator.generateJSON([suite]);
      const parsed = JSON.parse(jsonStr);

      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('suites');
    });

    it('应该包含正确的统计摘要', () => {
      const tests = [
        createTestResult('test1', 'passed', 100),
        createTestResult('test2', 'passed', 150),
        createTestResult('test3', 'failed', 200),
        createTestResult('test4', 'skipped', 50),
      ];
      const suite = createTestSuite('SummarySuite', tests);

      const jsonStr = generator.generateJSON([suite]);
      const parsed = JSON.parse(jsonStr);

      expect(parsed.summary.total).toBe(4);
      expect(parsed.summary.passed).toBe(2);
      expect(parsed.summary.failed).toBe(1);
      expect(parsed.summary.skipped).toBe(1);
      expect(parsed.summary.duration).toBe(500);
      expect(parsed.summary.passRate).toBe(50);
    });

    it('应该包含测试套件详情', () => {
      const tests = [
        createTestResult('test1', 'passed', 100),
        createTestResult('test2', 'failed', 200, { error: 'Test error' }),
      ];
      const suite = createTestSuite('DetailSuite', tests);

      const jsonStr = generator.generateJSON([suite]);
      const parsed = JSON.parse(jsonStr);

      expect(parsed.suites).toHaveLength(1);
      expect(parsed.suites[0].name).toBe('DetailSuite');
      expect(parsed.suites[0].tests).toHaveLength(2);
      expect(parsed.suites[0].tests[0].name).toBe('test1');
      expect(parsed.suites[0].tests[0].status).toBe('passed');
      expect(parsed.suites[0].tests[1].error).toBe('Test error');
    });

    it('应该包含 ISO 格式的时间戳', () => {
      const tests = [createTestResult('test1', 'passed', 100)];
      const suite = createTestSuite('TimestampSuite', tests);

      const jsonStr = generator.generateJSON([suite]);
      const parsed = JSON.parse(jsonStr);

      // 验证时间戳是有效的 ISO 格式
      const timestamp = new Date(parsed.timestamp);
      expect(timestamp.toISOString()).toBe(parsed.timestamp);
    });

    it('当 includeOutput 为 true 时应该包含输出', () => {
      const tests = [
        createTestResult('test1', 'passed', 100, {
          output: 'Debug output',
        }),
      ];
      const suite = createTestSuite('OutputSuite', tests);

      const jsonStr = generator.generateJSON([suite], { format: 'json', includeOutput: true });
      const parsed = JSON.parse(jsonStr);

      expect(parsed.suites[0].tests[0].output).toBe('Debug output');
    });

    it('当 includeOutput 为 false 时不应该包含输出', () => {
      const tests = [
        createTestResult('test1', 'passed', 100, {
          output: 'Debug output',
        }),
      ];
      const suite = createTestSuite('NoOutputSuite', tests);

      const jsonStr = generator.generateJSON([suite], { format: 'json', includeOutput: false });
      const parsed = JSON.parse(jsonStr);

      expect(parsed.suites[0].tests[0].output).toBeUndefined();
    });
  });


  describe('printConsole', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('应该输出测试结果到控制台', () => {
      const tests = [
        createTestResult('test1', 'passed', 100),
        createTestResult('test2', 'failed', 200, { error: 'Error' }),
      ];
      const suite = createTestSuite('ConsoleSuite', tests);

      generator.printConsole([suite]);

      // 验证控制台被调用
      expect(consoleSpy).toHaveBeenCalled();

      // 获取所有输出
      const output = consoleSpy.mock.calls.map((call) => call[0]).join('\n');

      // 验证包含测试套件名称
      expect(output).toContain('ConsoleSuite');

      // 验证包含测试名称
      expect(output).toContain('test1');
      expect(output).toContain('test2');
    });

    it('应该显示统计摘要', () => {
      const tests = [
        createTestResult('test1', 'passed', 100),
        createTestResult('test2', 'failed', 200),
      ];
      const suite = createTestSuite('SummarySuite', tests);

      generator.printConsole([suite]);

      const output = consoleSpy.mock.calls.map((call) => call[0]).join('\n');

      expect(output).toContain('总计: 2');
      expect(output).toContain('通过: 1');
      expect(output).toContain('失败: 1');
    });
  });

  describe('generate', () => {
    it('应该根据格式生成对应的报告', async () => {
      const tests = [createTestResult('test1', 'passed', 100)];
      const suite = createTestSuite('GenerateSuite', tests);

      // 测试 JUnit 格式
      const junit = await generator.generate([suite], { format: 'junit' });
      expect(junit).toContain('<?xml');

      // 测试 HTML 格式
      const html = await generator.generate([suite], { format: 'html' });
      expect(html).toContain('<!DOCTYPE html>');

      // 测试 JSON 格式
      const json = await generator.generate([suite], { format: 'json' });
      expect(JSON.parse(json)).toHaveProperty('summary');
    });

    it('应该将报告写入指定路径', async () => {
      const tests = [createTestResult('test1', 'passed', 100)];
      const suite = createTestSuite('FileSuite', tests);
      const outputPath = path.join(tempDir, 'report.xml');

      await generator.generate([suite], {
        format: 'junit',
        outputPath,
      });

      expect(fs.existsSync(outputPath)).toBe(true);
      const content = fs.readFileSync(outputPath, 'utf-8');
      expect(content).toContain('<?xml');
    });

    it('应该创建不存在的目录', async () => {
      const tests = [createTestResult('test1', 'passed', 100)];
      const suite = createTestSuite('DirSuite', tests);
      const outputPath = path.join(tempDir, 'nested', 'dir', 'report.json');

      await generator.generate([suite], {
        format: 'json',
        outputPath,
      });

      expect(fs.existsSync(outputPath)).toBe(true);
    });

    it('console 格式应该返回空字符串', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const tests = [createTestResult('test1', 'passed', 100)];
      const suite = createTestSuite('ConsoleSuite', tests);

      const result = await generator.generate([suite], { format: 'console' });

      expect(result).toBe('');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('应该抛出不支持格式的错误', async () => {
      const tests = [createTestResult('test1', 'passed', 100)];
      const suite = createTestSuite('ErrorSuite', tests);

      await expect(
        generator.generate([suite], { format: 'invalid' as any })
      ).rejects.toThrow('不支持的报告格式');
    });
  });

  describe('执行时间记录', () => {
    it('应该正确记录毫秒级时间', () => {
      const tests = [
        createTestResult('fast', 'passed', 5),
        createTestResult('medium', 'passed', 500),
        createTestResult('slow', 'passed', 5000),
      ];
      const suite = createTestSuite('TimingSuite', tests);

      const jsonStr = generator.generateJSON([suite]);
      const parsed = JSON.parse(jsonStr);

      expect(parsed.suites[0].tests[0].duration).toBe(5);
      expect(parsed.suites[0].tests[1].duration).toBe(500);
      expect(parsed.suites[0].tests[2].duration).toBe(5000);
      expect(parsed.summary.duration).toBe(5505);
    });

    it('应该在 JUnit 中将毫秒转换为秒', () => {
      const tests = [createTestResult('test', 'passed', 1234)];
      const suite = createTestSuite('TimeSuite', tests);

      const xml = generator.generateJUnit([suite]);

      // 1234ms = 1.234s
      expect(xml).toContain('time="1.234"');
    });
  });

  describe('多测试套件', () => {
    it('应该正确处理多个测试套件', () => {
      const suite1 = createTestSuite('Suite1', [
        createTestResult('test1', 'passed', 100),
      ]);
      const suite2 = createTestSuite('Suite2', [
        createTestResult('test2', 'failed', 200, { error: 'Error' }),
      ]);

      const jsonStr = generator.generateJSON([suite1, suite2]);
      const parsed = JSON.parse(jsonStr);

      expect(parsed.suites).toHaveLength(2);
      expect(parsed.summary.total).toBe(2);
      expect(parsed.summary.passed).toBe(1);
      expect(parsed.summary.failed).toBe(1);
    });

    it('JUnit 应该包含多个 testsuite 元素', () => {
      const suite1 = createTestSuite('Suite1', [
        createTestResult('test1', 'passed', 100),
      ]);
      const suite2 = createTestSuite('Suite2', [
        createTestResult('test2', 'passed', 100),
      ]);

      const xml = generator.generateJUnit([suite1, suite2]);

      const suiteMatches = xml.match(/<testsuite /g);
      expect(suiteMatches).toHaveLength(2);
    });
  });
});
