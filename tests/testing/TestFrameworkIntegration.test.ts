/**
 * 测试框架集成模块测试
 * 
 * 测试 TestFrameworkIntegration 类的核心功能
 */

import * as fs from 'fs';
import {
  TestFrameworkIntegration,
  createTestFrameworkIntegration,
  TestResult,
  CoverageReport,
} from '../../src/testing/TestFrameworkIntegration';

// 模拟 fs 模块
jest.mock('fs');
jest.mock('child_process');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('TestFrameworkIntegration', () => {
  let integration: TestFrameworkIntegration;
  const testDir = '/test/project';

  beforeEach(() => {
    jest.clearAllMocks();
    integration = new TestFrameworkIntegration(testDir);
  });

  describe('detectFramework', () => {
    it('应该检测到 Jest 项目（通过 package.json）', async () => {
      mockFs.existsSync.mockImplementation((filePath: fs.PathLike) => {
        const p = filePath.toString();
        return p.includes('package.json');
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        devDependencies: { jest: '^29.0.0' }
      }));

      const framework = await integration.detectFramework();
      expect(framework).toBe('jest');
    });

    it('应该检测到 Jest 项目（通过配置文件）', async () => {
      mockFs.existsSync.mockImplementation((filePath: fs.PathLike) => {
        const p = filePath.toString();
        return p.includes('jest.config.js');
      });

      const framework = await integration.detectFramework();
      expect(framework).toBe('jest');
    });

    it('应该检测到 Pytest 项目', async () => {
      mockFs.existsSync.mockImplementation((filePath: fs.PathLike) => {
        const p = filePath.toString();
        return p.includes('pytest.ini') || p.includes('conftest.py');
      });

      const framework = await integration.detectFramework();
      expect(framework).toBe('pytest');
    });

    it('应该检测到 JUnit 项目（Maven）', async () => {
      mockFs.existsSync.mockImplementation((filePath: fs.PathLike) => {
        const p = filePath.toString();
        return p.includes('pom.xml');
      });
      mockFs.readFileSync.mockReturnValue('<dependency>junit</dependency>');

      const framework = await integration.detectFramework();
      expect(framework).toBe('junit');
    });

    it('应该检测到 Go Test 项目', async () => {
      mockFs.existsSync.mockImplementation((filePath: fs.PathLike) => {
        const p = filePath.toString();
        return p.includes('go.mod');
      });

      const framework = await integration.detectFramework();
      expect(framework).toBe('go-test');
    });

    it('应该返回 unknown 当没有检测到框架时', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const framework = await integration.detectFramework();
      expect(framework).toBe('unknown');
    });
  });

  describe('generateTestCommand', () => {
    beforeEach(async () => {
      // 设置为 Jest 项目
      mockFs.existsSync.mockImplementation((filePath: fs.PathLike) => {
        const p = filePath.toString();
        return p.includes('package.json');
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        devDependencies: { jest: '^29.0.0' }
      }));
      await integration.detectFramework();
    });

    it('应该生成基本的测试命令', () => {
      const command = integration.generateTestCommand();
      expect(command).toContain('npx jest');
    });

    it('应该添加测试模式参数', () => {
      const command = integration.generateTestCommand({ testPattern: 'user' });
      expect(command).toContain('--testPathPattern');
      expect(command).toContain('user');
    });

    it('应该添加覆盖率参数', () => {
      const command = integration.generateTestCommand({ withCoverage: true });
      expect(command).toContain('--coverage');
    });

    it('应该添加详细输出参数', () => {
      const command = integration.generateTestCommand({ verbose: true });
      expect(command).toContain('--verbose');
    });

    it('应该添加监视模式参数', () => {
      const command = integration.generateTestCommand({ watch: true });
      expect(command).toContain('--watch');
    });

    it('应该在未检测到框架时抛出错误', () => {
      const newIntegration = new TestFrameworkIntegration(testDir);
      expect(() => newIntegration.generateTestCommand()).toThrow('未检测到测试框架');
    });
  });

  describe('parseTestOutput', () => {
    describe('Jest 输出解析', () => {
      beforeEach(async () => {
        mockFs.existsSync.mockImplementation((filePath: fs.PathLike) => {
          const p = filePath.toString();
          return p.includes('package.json');
        });
        mockFs.readFileSync.mockReturnValue(JSON.stringify({
          devDependencies: { jest: '^29.0.0' }
        }));
        await integration.detectFramework();
      });

      it('应该解析 Jest 文本输出', () => {
        const output = `
          Test Suites: 2 passed, 2 total
          Tests:       5 passed, 5 total
          Snapshots:   0 total
          Time:        2.5 s
        `;

        const result = integration.parseTestOutput(output);
        expect(result.framework).toBe('jest');
        expect(result.totalPassed).toBe(5);
        expect(result.success).toBe(true);
      });

      it('应该解析 Jest 失败输出', () => {
        const output = `
          Test Suites: 1 failed, 1 passed, 2 total
          Tests:       2 failed, 3 passed, 5 total
          Time:        3.0 s

          ● TestSuite › should fail
            expect(received).toBe(expected)
        `;

        const result = integration.parseTestOutput(output);
        expect(result.totalFailed).toBe(2);
        expect(result.totalPassed).toBe(3);
        expect(result.success).toBe(false);
      });

      it('应该解析 Jest JSON 输出', () => {
        const jsonOutput = JSON.stringify({
          numTotalTests: 10,
          numPassedTests: 8,
          numFailedTests: 2,
          numPendingTests: 0,
          success: false,
          testResults: [
            {
              name: 'test/example.test.ts',
              startTime: 1000,
              endTime: 2000,
              assertionResults: [
                { title: 'test 1', status: 'passed', duration: 100 },
                { title: 'test 2', status: 'failed', duration: 200, failureMessages: ['Error'] },
              ]
            }
          ]
        });

        const result = integration.parseTestOutput(jsonOutput);
        expect(result.totalPassed).toBe(8);
        expect(result.totalFailed).toBe(2);
        expect(result.suites.length).toBe(1);
      });

      it('应该解析 Jest 覆盖率输出', () => {
        const output = `
          ----------|---------|----------|---------|---------|
          File      | % Stmts | % Branch | % Funcs | % Lines |
          ----------|---------|----------|---------|---------|
          All files |   85.5  |   70.2   |   90.0  |   82.3  |
          ----------|---------|----------|---------|---------|
          
          Tests: 5 passed, 5 total
          Time: 2.5 s
        `;

        const result = integration.parseTestOutput(output, true);
        expect(result.coverage).toBeDefined();
        expect(result.coverage?.statements).toBeCloseTo(85.5, 1);
        expect(result.coverage?.branches).toBeCloseTo(70.2, 1);
      });
    });

    describe('Pytest 输出解析', () => {
      beforeEach(async () => {
        mockFs.existsSync.mockImplementation((filePath: fs.PathLike) => {
          const p = filePath.toString();
          return p.includes('pytest.ini');
        });
        await integration.detectFramework();
      });

      it('应该解析 Pytest 输出', () => {
        const output = `
          ============================= test session starts ==============================
          collected 10 items
          
          test_example.py::test_one PASSED
          test_example.py::test_two PASSED
          
          ============================== 8 passed, 2 failed in 1.23s ==============================
        `;

        const result = integration.parseTestOutput(output);
        expect(result.framework).toBe('pytest');
        expect(result.totalPassed).toBe(8);
        expect(result.totalFailed).toBe(2);
      });
    });

    describe('Go Test 输出解析', () => {
      beforeEach(async () => {
        mockFs.existsSync.mockImplementation((filePath: fs.PathLike) => {
          const p = filePath.toString();
          return p.includes('go.mod');
        });
        await integration.detectFramework();
      });

      it('应该解析 Go Test JSON 输出', () => {
        const output = `
          {"Action":"pass","Package":"example","Test":"TestOne","Elapsed":0.5}
          {"Action":"pass","Package":"example","Test":"TestTwo","Elapsed":0.3}
          {"Action":"fail","Package":"example","Test":"TestThree","Elapsed":0.2}
        `;

        const result = integration.parseTestOutput(output);
        expect(result.framework).toBe('go-test');
        expect(result.totalPassed).toBe(2);
        expect(result.totalFailed).toBe(1);
      });

      it('应该解析 Go Test 覆盖率', () => {
        const output = `
          PASS
          coverage: 75.5% of statements
        `;

        const result = integration.parseTestOutput(output, true);
        expect(result.coverage?.lines).toBeCloseTo(75.5, 1);
      });
    });
  });

  describe('analyzeFailures', () => {
    it('应该分析断言错误', () => {
      const result: TestResult = {
        framework: 'jest',
        suites: [{
          name: 'TestSuite',
          tests: [{
            name: 'should fail',
            status: 'failed',
            errorMessage: 'expect(received).toBe(expected)\n\nExpected: 1\nReceived: 2',
          }],
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
        }],
        totalPassed: 0,
        totalFailed: 1,
        totalSkipped: 0,
        totalDuration: 100,
        success: false,
        rawOutput: '',
      };

      const analyses = integration.analyzeFailures(result);
      expect(analyses.length).toBe(1);
      expect(analyses[0].possibleCauses).toContain('断言失败：实际值与期望值不匹配');
      expect(analyses[0].suggestions.length).toBeGreaterThan(0);
    });

    it('应该分析超时错误', () => {
      const result: TestResult = {
        framework: 'jest',
        suites: [{
          name: 'TestSuite',
          tests: [{
            name: 'should timeout',
            status: 'failed',
            errorMessage: 'Timeout - Async callback was not invoked within 5000ms',
          }],
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 5000,
        }],
        totalPassed: 0,
        totalFailed: 1,
        totalSkipped: 0,
        totalDuration: 5000,
        success: false,
        rawOutput: '',
      };

      const analyses = integration.analyzeFailures(result);
      expect(analyses[0].possibleCauses).toContain('测试超时：异步操作未在规定时间内完成');
    });

    it('应该分析模块未找到错误', () => {
      const result: TestResult = {
        framework: 'jest',
        suites: [{
          name: 'TestSuite',
          tests: [{
            name: 'should find module',
            status: 'failed',
            errorMessage: "Cannot find module './missing-module'",
          }],
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
        }],
        totalPassed: 0,
        totalFailed: 1,
        totalSkipped: 0,
        totalDuration: 100,
        success: false,
        rawOutput: '',
      };

      const analyses = integration.analyzeFailures(result);
      expect(analyses[0].possibleCauses).toContain('模块未找到：导入的模块不存在');
    });
  });

  describe('formatCoverageReport', () => {
    it('应该格式化覆盖率报告', () => {
      const coverage: CoverageReport = {
        lines: 85.5,
        statements: 82.3,
        branches: 70.2,
        functions: 90.0,
      };

      const report = integration.formatCoverageReport(coverage);
      expect(report).toContain('覆盖率报告');
      expect(report).toContain('85.5%');
      expect(report).toContain('82.3%');
      expect(report).toContain('70.2%');
      expect(report).toContain('90.0%');
    });

    it('应该显示未覆盖的文件', () => {
      const coverage: CoverageReport = {
        lines: 50,
        statements: 50,
        branches: 50,
        functions: 50,
        uncoveredFiles: ['src/uncovered1.ts', 'src/uncovered2.ts'],
      };

      const report = integration.formatCoverageReport(coverage);
      expect(report).toContain('未覆盖的文件');
      expect(report).toContain('src/uncovered1.ts');
    });
  });

  describe('formatTestSummary', () => {
    it('应该格式化成功的测试摘要', () => {
      const result: TestResult = {
        framework: 'jest',
        suites: [],
        totalPassed: 10,
        totalFailed: 0,
        totalSkipped: 2,
        totalDuration: 5000,
        success: true,
        rawOutput: '',
      };

      const summary = integration.formatTestSummary(result);
      expect(summary).toContain('✅');
      expect(summary).toContain('通过: 10');
      expect(summary).toContain('失败: 0');
      expect(summary).toContain('跳过: 2');
    });

    it('应该格式化失败的测试摘要', () => {
      const result: TestResult = {
        framework: 'jest',
        suites: [{
          name: 'TestSuite',
          tests: [{
            name: 'failing test',
            status: 'failed',
            errorMessage: 'Test failed',
          }],
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 100,
        }],
        totalPassed: 5,
        totalFailed: 1,
        totalSkipped: 0,
        totalDuration: 3000,
        success: false,
        rawOutput: '',
      };

      const summary = integration.formatTestSummary(result);
      expect(summary).toContain('❌');
      expect(summary).toContain('失败的测试');
      expect(summary).toContain('failing test');
    });
  });

  describe('generateTestSuggestions', () => {
    it('应该为 TypeScript 文件生成测试建议', async () => {
      const sourceFile = 'src/utils.ts';
      const content = `
        export function add(a: number, b: number): number {
          return a + b;
        }
        
        export class Calculator {
          multiply(a: number, b: number): number {
            return a * b;
          }
        }
        
        export const subtract = (a: number, b: number) => a - b;
      `;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(content);

      const suggestions = await integration.generateTestSuggestions(sourceFile);
      
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.targetFunction === 'add')).toBe(true);
      expect(suggestions.some(s => s.targetFunction === 'Calculator')).toBe(true);
      expect(suggestions.some(s => s.targetFunction === 'subtract')).toBe(true);
    });

    it('应该为不存在的文件返回空建议', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const suggestions = await integration.generateTestSuggestions('nonexistent.ts');
      expect(suggestions).toEqual([]);
    });
  });

  describe('createTestFrameworkIntegration', () => {
    it('应该创建 TestFrameworkIntegration 实例', () => {
      const instance = createTestFrameworkIntegration('/some/path');
      expect(instance).toBeInstanceOf(TestFrameworkIntegration);
    });

    it('应该使用默认工作目录', () => {
      const instance = createTestFrameworkIntegration();
      expect(instance).toBeInstanceOf(TestFrameworkIntegration);
    });
  });
});
