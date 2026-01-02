/**
 * 报告生成器
 * 负责生成测试报告，支持多种格式输出
 */

import * as fs from 'fs';
import * as path from 'path';
import { AssertionResult } from './types';

/**
 * 测试结果
 */
export interface TestResult {
  /** 测试名称 */
  name: string;
  /** 测试套件名称 */
  suite: string;
  /** 测试状态 */
  status: 'passed' | 'failed' | 'skipped';
  /** 执行时间（毫秒） */
  duration: number;
  /** 错误信息 */
  error?: string;
  /** 输出内容 */
  output?: string;
  /** 断言结果 */
  assertions?: AssertionResult[];
}

/**
 * 测试套件结果
 */
export interface TestSuiteResult {
  /** 套件名称 */
  name: string;
  /** 测试结果列表 */
  tests: TestResult[];
  /** 总执行时间（毫秒） */
  duration: number;
  /** 通过数量 */
  passed: number;
  /** 失败数量 */
  failed: number;
  /** 跳过数量 */
  skipped: number;
}

/**
 * 报告选项
 */
export interface ReportOptions {
  /** 输出格式 */
  format: 'junit' | 'html' | 'json' | 'console';
  /** 输出路径 */
  outputPath?: string;
  /** 是否包含输出 */
  includeOutput?: boolean;
  /** 是否包含堆栈 */
  includeStack?: boolean;
}


/**
 * 报告生成器类
 */
export class ReportGenerator {
  /**
   * 生成报告
   * @param results 测试套件结果列表
   * @param options 报告选项
   * @returns 生成的报告内容
   */
  async generate(
    results: TestSuiteResult[],
    options: ReportOptions
  ): Promise<string> {
    let content: string;

    switch (options.format) {
      case 'junit':
        content = this.generateJUnit(results);
        break;
      case 'html':
        content = this.generateHTML(results, options);
        break;
      case 'json':
        content = this.generateJSON(results, options);
        break;
      case 'console':
        this.printConsole(results, options);
        return '';
      default:
        throw new Error(`不支持的报告格式: ${options.format}`);
    }

    // 如果指定了输出路径，写入文件
    if (options.outputPath) {
      const dir = path.dirname(options.outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(options.outputPath, content, 'utf-8');
    }

    return content;
  }

  /**
   * 生成 JUnit XML 格式报告
   * @param results 测试套件结果列表
   * @returns JUnit XML 字符串
   */
  generateJUnit(results: TestSuiteResult[]): string {
    const totalTests = results.reduce((sum, s) => sum + s.tests.length, 0);
    const totalFailures = results.reduce((sum, s) => sum + s.failed, 0);
    const totalSkipped = results.reduce((sum, s) => sum + s.skipped, 0);
    const totalTime = results.reduce((sum, s) => sum + s.duration, 0) / 1000;

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<testsuites tests="${totalTests}" failures="${totalFailures}" skipped="${totalSkipped}" time="${totalTime.toFixed(3)}">\n`;

    for (const suite of results) {
      const suiteTime = suite.duration / 1000;
      xml += `  <testsuite name="${this.escapeXml(suite.name)}" tests="${suite.tests.length}" failures="${suite.failed}" skipped="${suite.skipped}" time="${suiteTime.toFixed(3)}">\n`;

      for (const test of suite.tests) {
        const testTime = test.duration / 1000;
        xml += `    <testcase name="${this.escapeXml(test.name)}" classname="${this.escapeXml(suite.name)}" time="${testTime.toFixed(3)}"`;

        if (test.status === 'passed') {
          xml += ' />\n';
        } else if (test.status === 'skipped') {
          xml += '>\n';
          xml += '      <skipped />\n';
          xml += '    </testcase>\n';
        } else if (test.status === 'failed') {
          xml += '>\n';
          xml += `      <failure message="${this.escapeXml(test.error || 'Test failed')}">${this.escapeXml(test.error || '')}</failure>\n`;
          if (test.output) {
            xml += `      <system-out>${this.escapeXml(test.output)}</system-out>\n`;
          }
          xml += '    </testcase>\n';
        }
      }

      xml += '  </testsuite>\n';
    }

    xml += '</testsuites>';
    return xml;
  }


  /**
   * 生成 HTML 格式报告
   * @param results 测试套件结果列表
   * @param options 报告选项
   * @returns HTML 字符串
   */
  generateHTML(results: TestSuiteResult[], options?: ReportOptions): string {
    const totalTests = results.reduce((sum, s) => sum + s.tests.length, 0);
    const totalPassed = results.reduce((sum, s) => sum + s.passed, 0);
    const totalFailed = results.reduce((sum, s) => sum + s.failed, 0);
    const totalSkipped = results.reduce((sum, s) => sum + s.skipped, 0);
    const totalTime = results.reduce((sum, s) => sum + s.duration, 0);
    const passRate =
      totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : '0.0';

    let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>测试报告</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; padding: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { background: #fff; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header h1 { color: #333; margin-bottom: 10px; }
    .summary { display: flex; gap: 20px; flex-wrap: wrap; }
    .stat { padding: 10px 20px; border-radius: 4px; color: #fff; }
    .stat-total { background: #6c757d; }
    .stat-passed { background: #28a745; }
    .stat-failed { background: #dc3545; }
    .stat-skipped { background: #ffc107; color: #333; }
    .stat-time { background: #17a2b8; }
    .suite { background: #fff; border-radius: 8px; margin-bottom: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden; }
    .suite-header { padding: 15px 20px; background: #f8f9fa; border-bottom: 1px solid #dee2e6; cursor: pointer; }
    .suite-header h2 { font-size: 1.1em; color: #333; }
    .suite-stats { font-size: 0.9em; color: #666; margin-top: 5px; }
    .test-list { padding: 0; }
    .test { padding: 12px 20px; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 10px; }
    .test:last-child { border-bottom: none; }
    .test-status { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .test-status.passed { background: #28a745; }
    .test-status.failed { background: #dc3545; }
    .test-status.skipped { background: #ffc107; }
    .test-name { flex: 1; color: #333; }
    .test-duration { color: #666; font-size: 0.9em; }
    .test-error { background: #fff5f5; padding: 10px 20px; border-left: 3px solid #dc3545; margin: 0 20px 10px; font-family: monospace; font-size: 0.85em; white-space: pre-wrap; color: #dc3545; }
    .test-output { background: #f8f9fa; padding: 10px 20px; margin: 0 20px 10px; font-family: monospace; font-size: 0.85em; white-space: pre-wrap; color: #666; max-height: 200px; overflow-y: auto; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>测试报告</h1>
      <p>生成时间: ${new Date().toLocaleString('zh-CN')}</p>
      <div class="summary">
        <div class="stat stat-total">总计: ${totalTests}</div>
        <div class="stat stat-passed">通过: ${totalPassed}</div>
        <div class="stat stat-failed">失败: ${totalFailed}</div>
        <div class="stat stat-skipped">跳过: ${totalSkipped}</div>
        <div class="stat stat-time">耗时: ${this.formatDuration(totalTime)}</div>
        <div class="stat stat-total">通过率: ${passRate}%</div>
      </div>
    </div>
`;

    for (const suite of results) {
      html += `    <div class="suite">
      <div class="suite-header">
        <h2>${this.escapeHtml(suite.name)}</h2>
        <div class="suite-stats">
          ${suite.tests.length} 个测试 | 
          ${suite.passed} 通过 | 
          ${suite.failed} 失败 | 
          ${suite.skipped} 跳过 | 
          耗时 ${this.formatDuration(suite.duration)}
        </div>
      </div>
      <div class="test-list">
`;

      for (const test of suite.tests) {
        html += `        <div class="test">
          <div class="test-status ${test.status}"></div>
          <div class="test-name">${this.escapeHtml(test.name)}</div>
          <div class="test-duration">${this.formatDuration(test.duration)}</div>
        </div>
`;
        if (test.status === 'failed' && test.error) {
          html += `        <div class="test-error">${this.escapeHtml(test.error)}</div>\n`;
        }
        if (options?.includeOutput && test.output) {
          html += `        <div class="test-output">${this.escapeHtml(test.output)}</div>\n`;
        }
      }

      html += `      </div>
    </div>
`;
    }

    html += `  </div>
</body>
</html>`;

    return html;
  }


  /**
   * 生成 JSON 格式报告
   * @param results 测试套件结果列表
   * @param options 报告选项
   * @returns JSON 字符串
   */
  generateJSON(results: TestSuiteResult[], options?: ReportOptions): string {
    const totalTests = results.reduce((sum, s) => sum + s.tests.length, 0);
    const totalPassed = results.reduce((sum, s) => sum + s.passed, 0);
    const totalFailed = results.reduce((sum, s) => sum + s.failed, 0);
    const totalSkipped = results.reduce((sum, s) => sum + s.skipped, 0);
    const totalDuration = results.reduce((sum, s) => sum + s.duration, 0);

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: totalTests,
        passed: totalPassed,
        failed: totalFailed,
        skipped: totalSkipped,
        duration: totalDuration,
        passRate:
          totalTests > 0
            ? Number(((totalPassed / totalTests) * 100).toFixed(2))
            : 0,
      },
      suites: results.map((suite) => ({
        name: suite.name,
        duration: suite.duration,
        passed: suite.passed,
        failed: suite.failed,
        skipped: suite.skipped,
        tests: suite.tests.map((test) => {
          const testResult: Record<string, unknown> = {
            name: test.name,
            status: test.status,
            duration: test.duration,
          };
          if (test.error) {
            testResult.error = test.error;
          }
          if (options?.includeOutput && test.output) {
            testResult.output = test.output;
          }
          if (test.assertions && test.assertions.length > 0) {
            testResult.assertions = test.assertions;
          }
          return testResult;
        }),
      })),
    };

    return JSON.stringify(report, null, 2);
  }

  /**
   * 输出到控制台
   * @param results 测试套件结果列表
   * @param options 报告选项
   */
  printConsole(results: TestSuiteResult[], options?: ReportOptions): void {
    const totalTests = results.reduce((sum, s) => sum + s.tests.length, 0);
    const totalPassed = results.reduce((sum, s) => sum + s.passed, 0);
    const totalFailed = results.reduce((sum, s) => sum + s.failed, 0);
    const totalSkipped = results.reduce((sum, s) => sum + s.skipped, 0);
    const totalDuration = results.reduce((sum, s) => sum + s.duration, 0);

    // 颜色代码
    const colors = {
      reset: '\x1b[0m',
      bold: '\x1b[1m',
      green: '\x1b[32m',
      red: '\x1b[31m',
      yellow: '\x1b[33m',
      cyan: '\x1b[36m',
      gray: '\x1b[90m',
    };

    console.log('\n' + colors.bold + '═══════════════════════════════════════════════════════════════' + colors.reset);
    console.log(colors.bold + '                         测试报告' + colors.reset);
    console.log(colors.bold + '═══════════════════════════════════════════════════════════════' + colors.reset + '\n');

    for (const suite of results) {
      console.log(colors.bold + `📦 ${suite.name}` + colors.reset);
      console.log(colors.gray + `   ${suite.tests.length} 个测试 | 耗时 ${this.formatDuration(suite.duration)}` + colors.reset);
      console.log('');

      for (const test of suite.tests) {
        let statusIcon: string;
        let statusColor: string;

        switch (test.status) {
          case 'passed':
            statusIcon = '✓';
            statusColor = colors.green;
            break;
          case 'failed':
            statusIcon = '✗';
            statusColor = colors.red;
            break;
          case 'skipped':
            statusIcon = '○';
            statusColor = colors.yellow;
            break;
        }

        console.log(`   ${statusColor}${statusIcon}${colors.reset} ${test.name} ${colors.gray}(${this.formatDuration(test.duration)})${colors.reset}`);

        if (test.status === 'failed' && test.error) {
          console.log(colors.red + `     └─ ${test.error}` + colors.reset);
        }

        if (options?.includeOutput && test.output) {
          const outputLines = test.output.split('\n').slice(0, 5);
          for (const line of outputLines) {
            console.log(colors.gray + `     │ ${line}` + colors.reset);
          }
          if (test.output.split('\n').length > 5) {
            console.log(colors.gray + '     │ ...' + colors.reset);
          }
        }
      }
      console.log('');
    }

    // 汇总
    console.log(colors.bold + '───────────────────────────────────────────────────────────────' + colors.reset);
    console.log(colors.bold + '汇总:' + colors.reset);
    console.log(`  总计: ${totalTests}`);
    console.log(`  ${colors.green}通过: ${totalPassed}${colors.reset}`);
    console.log(`  ${colors.red}失败: ${totalFailed}${colors.reset}`);
    console.log(`  ${colors.yellow}跳过: ${totalSkipped}${colors.reset}`);
    console.log(`  ${colors.cyan}耗时: ${this.formatDuration(totalDuration)}${colors.reset}`);

    const passRate = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : '0.0';
    const rateColor = totalFailed > 0 ? colors.red : colors.green;
    console.log(`  ${rateColor}通过率: ${passRate}%${colors.reset}`);
    console.log(colors.bold + '═══════════════════════════════════════════════════════════════' + colors.reset + '\n');
  }


  /**
   * 转义 XML 特殊字符
   * @param str 原始字符串
   * @returns 转义后的字符串
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * 转义 HTML 特殊字符
   * @param str 原始字符串
   * @returns 转义后的字符串
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * 格式化持续时间
   * @param ms 毫秒数
   * @returns 格式化的时间字符串
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(2)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(1);
      return `${minutes}m ${seconds}s`;
    }
  }
}

/**
 * 创建报告生成器实例
 * @returns ReportGenerator 实例
 */
export function createReportGenerator(): ReportGenerator {
  return new ReportGenerator();
}
