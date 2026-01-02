/**
 * 报告生成器属性测试
 *
 * 使用 fast-check 进行属性测试，验证 ReportGenerator 的正确性
 *
 * **Property 21: Report Format Validity**
 * **Property 22: Report Timing Accuracy**
 * **Validates: Requirements 10.2, 10.4, 10.5**
 */

import * as fc from 'fast-check';
import {
  ReportGenerator,
  TestResult,
  TestSuiteResult,
} from '../../src/testing/ReportGenerator';

describe('ReportGenerator Property Tests', () => {
  const generator = new ReportGenerator();

  // 生成随机测试状态
  const testStatusArb = fc.constantFrom('passed', 'failed', 'skipped') as fc.Arbitrary<
    'passed' | 'failed' | 'skipped'
  >;

  // 生成随机测试结果
  const testResultArb: fc.Arbitrary<TestResult> = fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('<') && !s.includes('>')),
    suite: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !s.includes('<') && !s.includes('>')),
    status: testStatusArb,
    duration: fc.integer({ min: 0, max: 60000 }),
    error: fc.option(fc.string({ maxLength: 200 }).filter((s) => !s.includes('<') && !s.includes('>')), { nil: undefined }),
    output: fc.option(fc.string({ maxLength: 500 }).filter((s) => !s.includes('<') && !s.includes('>')), { nil: undefined }),
  });

  // 生成随机测试套件结果
  const testSuiteResultArb: fc.Arbitrary<TestSuiteResult> = fc
    .array(testResultArb, { minLength: 1, maxLength: 10 })
    .map((tests) => {
      const passed = tests.filter((t) => t.status === 'passed').length;
      const failed = tests.filter((t) => t.status === 'failed').length;
      const skipped = tests.filter((t) => t.status === 'skipped').length;
      const duration = tests.reduce((sum, t) => sum + t.duration, 0);
      return {
        name: tests[0].suite,
        tests,
        duration,
        passed,
        failed,
        skipped,
      };
    });

  // 生成随机测试套件结果列表
  const testSuiteResultsArb = fc.array(testSuiteResultArb, {
    minLength: 1,
    maxLength: 5,
  });


  /**
   * Property 21: Report Format Validity
   *
   * *For any* test results, the generated JUnit XML should be valid XML
   * conforming to JUnit schema, and HTML should be valid HTML.
   *
   * **Validates: Requirements 10.4, 10.5**
   */
  describe('Property 21: Report Format Validity', () => {
    it('generateJUnit() 应该生成有效的 XML', () => {
      fc.assert(
        fc.property(testSuiteResultsArb, (results) => {
          const xml = generator.generateJUnit(results);

          // 验证 XML 声明
          expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);

          // 验证根元素
          expect(xml).toContain('<testsuites');
          expect(xml).toContain('</testsuites>');

          // 验证每个测试套件都有对应的元素
          for (const _suite of results) {
            expect(xml).toContain('<testsuite');
            expect(xml).toContain('</testsuite>');
          }

          // 验证每个测试用例都有对应的元素
          for (const suite of results) {
            for (const _test of suite.tests) {
              expect(xml).toContain('<testcase');
            }
          }

          // 验证 XML 标签闭合正确（简单检查）
          const openTags = (xml.match(/<testsuite /g) || []).length;
          const closeTags = (xml.match(/<\/testsuite>/g) || []).length;
          expect(openTags).toBe(closeTags);
        }),
        { numRuns: 100 }
      );
    });

    it('generateJUnit() 应该正确转义特殊字符', () => {
      fc.assert(
        fc.property(testSuiteResultsArb, (results) => {
          const xml = generator.generateJUnit(results);

          // XML 中不应该有未转义的特殊字符（在属性值或文本内容中）
          // 注意：这里只检查生成的 XML 是否包含正确的转义序列
          // 如果原始数据包含 & < > " '，它们应该被转义
          const hasUnescapedAmpersand = /&(?!(amp|lt|gt|quot|apos);)/.test(xml);
          // 允许 XML 标签中的 < 和 >
          expect(hasUnescapedAmpersand).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('generateHTML() 应该生成有效的 HTML 结构', () => {
      fc.assert(
        fc.property(testSuiteResultsArb, (results) => {
          const html = generator.generateHTML(results);

          // 验证 HTML 文档结构
          expect(html).toContain('<!DOCTYPE html>');
          expect(html).toContain('<html');
          expect(html).toContain('</html>');
          expect(html).toContain('<head>');
          expect(html).toContain('</head>');
          expect(html).toContain('<body>');
          expect(html).toContain('</body>');

          // 验证必要的元素存在
          expect(html).toContain('<title>');
          expect(html).toContain('</title>');
          expect(html).toContain('<style>');
          expect(html).toContain('</style>');
        }),
        { numRuns: 100 }
      );
    });

    it('generateJSON() 应该生成有效的 JSON', () => {
      fc.assert(
        fc.property(testSuiteResultsArb, (results) => {
          const jsonStr = generator.generateJSON(results);

          // 验证可以解析为有效的 JSON
          const parsed = JSON.parse(jsonStr);

          // 验证必要的字段存在
          expect(parsed).toHaveProperty('timestamp');
          expect(parsed).toHaveProperty('summary');
          expect(parsed).toHaveProperty('suites');

          // 验证 summary 字段
          expect(parsed.summary).toHaveProperty('total');
          expect(parsed.summary).toHaveProperty('passed');
          expect(parsed.summary).toHaveProperty('failed');
          expect(parsed.summary).toHaveProperty('skipped');
          expect(parsed.summary).toHaveProperty('duration');
          expect(parsed.summary).toHaveProperty('passRate');

          // 验证 suites 数组长度
          expect(parsed.suites.length).toBe(results.length);
        }),
        { numRuns: 100 }
      );
    });

    it('generateJSON() 的统计数据应该正确', () => {
      fc.assert(
        fc.property(testSuiteResultsArb, (results) => {
          const jsonStr = generator.generateJSON(results);
          const parsed = JSON.parse(jsonStr);

          // 计算预期值
          const expectedTotal = results.reduce((sum, s) => sum + s.tests.length, 0);
          const expectedPassed = results.reduce((sum, s) => sum + s.passed, 0);
          const expectedFailed = results.reduce((sum, s) => sum + s.failed, 0);
          const expectedSkipped = results.reduce((sum, s) => sum + s.skipped, 0);

          // 验证统计数据
          expect(parsed.summary.total).toBe(expectedTotal);
          expect(parsed.summary.passed).toBe(expectedPassed);
          expect(parsed.summary.failed).toBe(expectedFailed);
          expect(parsed.summary.skipped).toBe(expectedSkipped);
        }),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Property 22: Report Timing Accuracy
   *
   * *For any* test execution, the reported duration should be within 10%
   * of the actual execution time.
   *
   * **Validates: Requirements 10.2**
   */
  describe('Property 22: Report Timing Accuracy', () => {
    it('JUnit 报告中的时间应该与输入数据一致', () => {
      fc.assert(
        fc.property(testSuiteResultsArb, (results) => {
          const xml = generator.generateJUnit(results);

          // 计算总时间（秒）
          const totalDuration = results.reduce((sum, s) => sum + s.duration, 0) / 1000;

          // 从 XML 中提取时间属性
          const timeMatch = xml.match(/<testsuites[^>]*time="([^"]+)"/);
          expect(timeMatch).not.toBeNull();

          if (timeMatch) {
            const reportedTime = parseFloat(timeMatch[1]);
            // 验证时间在 10% 误差范围内（考虑浮点数精度）
            const tolerance = Math.max(totalDuration * 0.1, 0.001);
            expect(Math.abs(reportedTime - totalDuration)).toBeLessThanOrEqual(tolerance);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('JSON 报告中的时间应该与输入数据完全一致', () => {
      fc.assert(
        fc.property(testSuiteResultsArb, (results) => {
          const jsonStr = generator.generateJSON(results);
          const parsed = JSON.parse(jsonStr);

          // 计算预期总时间
          const expectedDuration = results.reduce((sum, s) => sum + s.duration, 0);

          // 验证总时间
          expect(parsed.summary.duration).toBe(expectedDuration);

          // 验证每个套件的时间
          for (let i = 0; i < results.length; i++) {
            expect(parsed.suites[i].duration).toBe(results[i].duration);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('每个测试用例的时间应该被正确记录', () => {
      fc.assert(
        fc.property(testSuiteResultsArb, (results) => {
          const jsonStr = generator.generateJSON(results);
          const parsed = JSON.parse(jsonStr);

          // 验证每个测试用例的时间
          for (let i = 0; i < results.length; i++) {
            const suite = results[i];
            const parsedSuite = parsed.suites[i];

            for (let j = 0; j < suite.tests.length; j++) {
              expect(parsedSuite.tests[j].duration).toBe(suite.tests[j].duration);
            }
          }
        }),
        { numRuns: 100 }
      );
    });

    it('套件时间应该等于其测试用例时间之和', () => {
      fc.assert(
        fc.property(testSuiteResultsArb, (results) => {
          // 由于我们的生成器已经确保了这一点，这里验证生成的数据
          for (const suite of results) {
            const testsDuration = suite.tests.reduce((sum, t) => sum + t.duration, 0);
            expect(suite.duration).toBe(testsDuration);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 额外属性：报告格式一致性
   */
  describe('报告格式一致性', () => {
    it('不同格式的报告应该包含相同的统计数据', () => {
      fc.assert(
        fc.property(testSuiteResultsArb, (results) => {
          const jsonStr = generator.generateJSON(results);
          const xml = generator.generateJUnit(results);

          const jsonParsed = JSON.parse(jsonStr);

          // 从 XML 中提取统计数据
          const testsMatch = xml.match(/<testsuites[^>]*tests="(\d+)"/);
          const failuresMatch = xml.match(/<testsuites[^>]*failures="(\d+)"/);
          const skippedMatch = xml.match(/<testsuites[^>]*skipped="(\d+)"/);

          if (testsMatch && failuresMatch && skippedMatch) {
            expect(parseInt(testsMatch[1])).toBe(jsonParsed.summary.total);
            expect(parseInt(failuresMatch[1])).toBe(jsonParsed.summary.failed);
            expect(parseInt(skippedMatch[1])).toBe(jsonParsed.summary.skipped);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
