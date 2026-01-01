/**
 * 测试框架集成模块
 *
 * 提供测试框架检测、测试执行、输出解析、失败分析和覆盖率报告功能
 *
 * 支持的测试框架:
 * - Jest (JavaScript/TypeScript)
 * - Pytest (Python)
 * - JUnit (Java)
 * - Go Test (Go)
 *
 * @module TestFrameworkIntegration
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec, ExecException } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * 支持的测试框架类型
 */
export type TestFramework = 'jest' | 'pytest' | 'junit' | 'go-test' | 'unknown';

/**
 * 测试结果状态
 */
export type TestStatus = 'passed' | 'failed' | 'skipped' | 'error';

/**
 * 单个测试用例结果
 */
export interface TestCase {
  /** 测试名称 */
  name: string;
  /** 测试状态 */
  status: TestStatus;
  /** 执行时间(毫秒) */
  duration?: number;
  /** 错误信息 */
  errorMessage?: string;
  /** 错误堆栈 */
  stackTrace?: string;
  /** 测试文件路径 */
  filePath?: string;
  /** 测试行号 */
  lineNumber?: number;
}

/**
 * 测试套件结果
 */
export interface TestSuite {
  /** 套件名称 */
  name: string;
  /** 测试用例列表 */
  tests: TestCase[];
  /** 通过的测试数量 */
  passed: number;
  /** 失败的测试数量 */
  failed: number;
  /** 跳过的测试数量 */
  skipped: number;
  /** 总执行时间(毫秒) */
  duration: number;
}

/**
 * 测试执行结果
 */
export interface TestResult {
  /** 检测到的测试框架 */
  framework: TestFramework;
  /** 测试套件列表 */
  suites: TestSuite[];
  /** 总通过数 */
  totalPassed: number;
  /** 总失败数 */
  totalFailed: number;
  /** 总跳过数 */
  totalSkipped: number;
  /** 总执行时间(毫秒) */
  totalDuration: number;
  /** 是否全部通过 */
  success: boolean;
  /** 原始输出 */
  rawOutput: string;
  /** 覆盖率信息 */
  coverage?: CoverageReport;
}

/**
 * 覆盖率报告
 */
export interface CoverageReport {
  /** 行覆盖率百分比 */
  lines: number;
  /** 语句覆盖率百分比 */
  statements: number;
  /** 分支覆盖率百分比 */
  branches: number;
  /** 函数覆盖率百分比 */
  functions: number;
  /** 未覆盖的文件列表 */
  uncoveredFiles?: string[];
}

/**
 * 失败测试分析结果
 */
export interface FailureAnalysis {
  /** 失败的测试用例 */
  testCase: TestCase;
  /** 可能的失败原因 */
  possibleCauses: string[];
  /** 修复建议 */
  suggestions: string[];
  /** 相关代码片段 */
  relatedCode?: string;
}

/**
 * 测试生成建议
 */
export interface TestSuggestion {
  /** 建议的测试名称 */
  testName: string;
  /** 测试描述 */
  description: string;
  /** 测试类型 */
  testType: 'unit' | 'integration' | 'e2e';
  /** 目标文件 */
  targetFile: string;
  /** 目标函数/方法 */
  targetFunction?: string;
  /** 建议的测试代码模板 */
  codeTemplate?: string;
}

/**
 * 测试框架配置
 */
export interface TestFrameworkConfig {
  /** 测试命令 */
  command: string;
  /** 命令参数 */
  args: string[];
  /** 覆盖率命令参数 */
  coverageArgs?: string[];
  /** 配置文件路径 */
  configFile?: string;
  /** 测试文件模式 */
  testPattern?: string;
}

/**
 * 测试框架集成类
 *
 * 提供测试框架检测、执行、解析和分析功能
 */
export class TestFrameworkIntegration {
  private workingDirectory: string;
  private detectedFramework: TestFramework = 'unknown';
  private frameworkConfig: TestFrameworkConfig | null = null;

  constructor(workingDirectory: string = process.cwd()) {
    this.workingDirectory = workingDirectory;
  }

  /**
   * 检测项目使用的测试框架
   *
   * 通过检查配置文件和依赖来确定测试框架
   *
   * @returns 检测到的测试框架类型
   */
  async detectFramework(): Promise<TestFramework> {
    // 检查 Jest (JavaScript/TypeScript)
    if (await this.isJestProject()) {
      this.detectedFramework = 'jest';
      this.frameworkConfig = this.getJestConfig();
      return 'jest';
    }

    // 检查 Pytest (Python)
    if (await this.isPytestProject()) {
      this.detectedFramework = 'pytest';
      this.frameworkConfig = this.getPytestConfig();
      return 'pytest';
    }

    // 检查 JUnit (Java)
    if (await this.isJUnitProject()) {
      this.detectedFramework = 'junit';
      this.frameworkConfig = this.getJUnitConfig();
      return 'junit';
    }

    // 检查 Go Test
    if (await this.isGoTestProject()) {
      this.detectedFramework = 'go-test';
      this.frameworkConfig = this.getGoTestConfig();
      return 'go-test';
    }

    this.detectedFramework = 'unknown';
    return 'unknown';
  }

  /**
   * 获取当前检测到的测试框架
   */
  getDetectedFramework(): TestFramework {
    return this.detectedFramework;
  }

  /**
   * 获取测试框架配置
   */
  getFrameworkConfig(): TestFrameworkConfig | null {
    return this.frameworkConfig;
  }

  /**
   * 生成测试执行命令
   *
   * @param options 执行选项
   * @returns 完整的测试命令
   */
  generateTestCommand(
    options: {
      testPattern?: string;
      withCoverage?: boolean;
      verbose?: boolean;
      watch?: boolean;
    } = {}
  ): string {
    if (!this.frameworkConfig) {
      throw new Error('未检测到测试框架，请先调用 detectFramework()');
    }

    const { testPattern, withCoverage, verbose, watch } = options;
    let args = [...this.frameworkConfig.args];

    // 添加测试模式
    if (testPattern) {
      args = this.addTestPatternArgs(args, testPattern);
    }

    // 添加覆盖率参数
    if (withCoverage && this.frameworkConfig.coverageArgs) {
      args = [...args, ...this.frameworkConfig.coverageArgs];
    }

    // 添加详细输出参数
    if (verbose) {
      args = this.addVerboseArgs(args);
    }

    // 添加监视模式参数
    if (watch) {
      args = this.addWatchArgs(args);
    }

    return `${this.frameworkConfig.command} ${args.join(' ')}`.trim();
  }

  /**
   * 执行测试并返回结果
   *
   * @param options 执行选项
   * @returns 测试结果
   */
  async runTests(
    options: {
      testPattern?: string;
      withCoverage?: boolean;
      verbose?: boolean;
      timeout?: number;
    } = {}
  ): Promise<TestResult> {
    if (this.detectedFramework === 'unknown') {
      await this.detectFramework();
    }

    if (this.detectedFramework === 'unknown') {
      throw new Error('无法检测到支持的测试框架');
    }

    const command = this.generateTestCommand({
      ...options,
      watch: false, // 执行时不使用监视模式
    });

    const timeout = options.timeout || 300000; // 默认 5 分钟超时

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workingDirectory,
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB 缓冲区
      });

      const rawOutput = stdout + (stderr ? '\n' + stderr : '');
      return this.parseTestOutput(rawOutput, options.withCoverage);
    } catch (error) {
      const execError = error as ExecException & { stdout?: string; stderr?: string };
      const rawOutput = (execError.stdout || '') + '\n' + (execError.stderr || '');

      // 测试失败也会抛出错误，但我们仍然需要解析输出
      return this.parseTestOutput(rawOutput, options.withCoverage);
    }
  }

  /**
   * 解析测试输出
   *
   * @param output 原始测试输出
   * @param parseCoverage 是否解析覆盖率
   * @returns 解析后的测试结果
   */
  parseTestOutput(output: string, parseCoverage: boolean = false): TestResult {
    switch (this.detectedFramework) {
      case 'jest':
        return this.parseJestOutput(output, parseCoverage);
      case 'pytest':
        return this.parsePytestOutput(output, parseCoverage);
      case 'junit':
        return this.parseJUnitOutput(output, parseCoverage);
      case 'go-test':
        return this.parseGoTestOutput(output, parseCoverage);
      default:
        return this.createEmptyResult(output);
    }
  }

  /**
   * 分析失败的测试
   *
   * @param result 测试结果
   * @returns 失败分析列表
   */
  analyzeFailures(result: TestResult): FailureAnalysis[] {
    const analyses: FailureAnalysis[] = [];

    for (const suite of result.suites) {
      for (const test of suite.tests) {
        if (test.status === 'failed' || test.status === 'error') {
          analyses.push(this.analyzeTestFailure(test));
        }
      }
    }

    return analyses;
  }

  /**
   * 分析单个测试失败
   */
  private analyzeTestFailure(test: TestCase): FailureAnalysis {
    const possibleCauses: string[] = [];
    const suggestions: string[] = [];

    if (test.errorMessage) {
      // 分析断言错误
      if (this.isAssertionError(test.errorMessage)) {
        possibleCauses.push('断言失败：实际值与期望值不匹配');
        suggestions.push('检查测试中的期望值是否正确');
        suggestions.push('验证被测试的函数逻辑是否符合预期');
      }

      // 分析类型错误
      if (this.isTypeError(test.errorMessage)) {
        possibleCauses.push('类型错误：变量类型不匹配或未定义');
        suggestions.push('检查变量是否正确初始化');
        suggestions.push('确保函数参数类型正确');
      }

      // 分析引用错误
      if (this.isReferenceError(test.errorMessage)) {
        possibleCauses.push('引用错误：访问了未定义的变量或函数');
        suggestions.push('检查变量名拼写是否正确');
        suggestions.push('确保所需的模块已正确导入');
      }

      // 分析超时错误
      if (this.isTimeoutError(test.errorMessage)) {
        possibleCauses.push('测试超时：异步操作未在规定时间内完成');
        suggestions.push('增加测试超时时间');
        suggestions.push('检查异步操作是否正确处理');
        suggestions.push('确保 Promise 被正确 resolve 或 reject');
      }

      // 分析模块未找到错误
      if (this.isModuleNotFoundError(test.errorMessage)) {
        possibleCauses.push('模块未找到：导入的模块不存在');
        suggestions.push('检查模块路径是否正确');
        suggestions.push('确保依赖已正确安装');
      }

      // 分析网络错误
      if (this.isNetworkError(test.errorMessage)) {
        possibleCauses.push('网络错误：网络请求失败');
        suggestions.push('检查网络连接');
        suggestions.push('考虑使用 mock 替代真实网络请求');
      }
    }

    // 如果没有识别出具体原因，添加通用建议
    if (possibleCauses.length === 0) {
      possibleCauses.push('测试执行失败');
      suggestions.push('查看完整的错误堆栈信息');
      suggestions.push('检查测试环境配置');
    }

    return {
      testCase: test,
      possibleCauses,
      suggestions,
    };
  }

  /**
   * 生成测试建议
   *
   * 分析源代码文件，生成测试建议
   *
   * @param sourceFile 源代码文件路径
   * @returns 测试建议列表
   */
  async generateTestSuggestions(sourceFile: string): Promise<TestSuggestion[]> {
    const suggestions: TestSuggestion[] = [];
    const fullPath = path.resolve(this.workingDirectory, sourceFile);

    if (!fs.existsSync(fullPath)) {
      return suggestions;
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const extension = path.extname(sourceFile);

    switch (extension) {
      case '.ts':
      case '.tsx':
      case '.js':
      case '.jsx':
        return this.generateJavaScriptTestSuggestions(sourceFile, content);
      case '.py':
        return this.generatePythonTestSuggestions(sourceFile, content);
      case '.java':
        return this.generateJavaTestSuggestions(sourceFile, content);
      case '.go':
        return this.generateGoTestSuggestions(sourceFile, content);
      default:
        return suggestions;
    }
  }

  /**
   * 格式化覆盖率报告
   *
   * @param coverage 覆盖率数据
   * @returns 格式化的覆盖率报告字符串
   */
  formatCoverageReport(coverage: CoverageReport): string {
    const lines = [
      '📊 覆盖率报告',
      '─'.repeat(40),
      `行覆盖率:     ${this.formatPercentage(coverage.lines)}`,
      `语句覆盖率:   ${this.formatPercentage(coverage.statements)}`,
      `分支覆盖率:   ${this.formatPercentage(coverage.branches)}`,
      `函数覆盖率:   ${this.formatPercentage(coverage.functions)}`,
      '─'.repeat(40),
    ];

    if (coverage.uncoveredFiles && coverage.uncoveredFiles.length > 0) {
      lines.push('');
      lines.push('⚠️ 未覆盖的文件:');
      for (const file of coverage.uncoveredFiles.slice(0, 10)) {
        lines.push(`  - ${file}`);
      }
      if (coverage.uncoveredFiles.length > 10) {
        lines.push(`  ... 还有 ${coverage.uncoveredFiles.length - 10} 个文件`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 格式化测试结果摘要
   *
   * @param result 测试结果
   * @returns 格式化的摘要字符串
   */
  formatTestSummary(result: TestResult): string {
    const statusIcon = result.success ? '✅' : '❌';
    const lines = [
      `${statusIcon} 测试结果摘要 (${result.framework})`,
      '─'.repeat(40),
      `通过: ${result.totalPassed}`,
      `失败: ${result.totalFailed}`,
      `跳过: ${result.totalSkipped}`,
      `耗时: ${this.formatDuration(result.totalDuration)}`,
      '─'.repeat(40),
    ];

    if (result.totalFailed > 0) {
      lines.push('');
      lines.push('❌ 失败的测试:');
      for (const suite of result.suites) {
        for (const test of suite.tests) {
          if (test.status === 'failed' || test.status === 'error') {
            lines.push(`  - ${suite.name} > ${test.name}`);
            if (test.errorMessage) {
              const shortError = test.errorMessage.split('\n')[0].substring(0, 80);
              lines.push(`    ${shortError}`);
            }
          }
        }
      }
    }

    return lines.join('\n');
  }

  // ==================== 私有方法：框架检测 ====================

  private async isJestProject(): Promise<boolean> {
    // 检查 package.json 中的 jest 依赖
    const packageJsonPath = path.join(this.workingDirectory, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const deps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };
        if (deps.jest || deps['@jest/core']) {
          return true;
        }
      } catch {
        // 忽略解析错误
      }
    }

    // 检查 jest.config.js 或 jest.config.ts
    const jestConfigFiles = [
      'jest.config.js',
      'jest.config.ts',
      'jest.config.mjs',
      'jest.config.cjs',
    ];
    for (const configFile of jestConfigFiles) {
      if (fs.existsSync(path.join(this.workingDirectory, configFile))) {
        return true;
      }
    }

    return false;
  }

  private async isPytestProject(): Promise<boolean> {
    // 检查 pytest.ini 或 pyproject.toml
    const pytestFiles = ['pytest.ini', 'pyproject.toml', 'setup.cfg', 'conftest.py'];
    for (const file of pytestFiles) {
      const filePath = path.join(this.workingDirectory, file);
      if (fs.existsSync(filePath)) {
        if (file === 'pyproject.toml') {
          const content = fs.readFileSync(filePath, 'utf-8');
          if (content.includes('[tool.pytest]') || content.includes('pytest')) {
            return true;
          }
        } else if (file === 'conftest.py') {
          return true;
        } else {
          return true;
        }
      }
    }

    // 检查 requirements.txt 中的 pytest
    const requirementsPath = path.join(this.workingDirectory, 'requirements.txt');
    if (fs.existsSync(requirementsPath)) {
      const content = fs.readFileSync(requirementsPath, 'utf-8');
      if (content.includes('pytest')) {
        return true;
      }
    }

    return false;
  }

  private async isJUnitProject(): Promise<boolean> {
    // 检查 pom.xml (Maven)
    const pomPath = path.join(this.workingDirectory, 'pom.xml');
    if (fs.existsSync(pomPath)) {
      const content = fs.readFileSync(pomPath, 'utf-8');
      if (content.includes('junit')) {
        return true;
      }
    }

    // 检查 build.gradle (Gradle)
    const gradleFiles = ['build.gradle', 'build.gradle.kts'];
    for (const file of gradleFiles) {
      const filePath = path.join(this.workingDirectory, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.includes('junit') || content.includes('testImplementation')) {
          return true;
        }
      }
    }

    return false;
  }

  private async isGoTestProject(): Promise<boolean> {
    // 检查 go.mod
    const goModPath = path.join(this.workingDirectory, 'go.mod');
    if (fs.existsSync(goModPath)) {
      return true;
    }

    // 检查是否有 _test.go 文件
    try {
      const files = fs.readdirSync(this.workingDirectory);
      return files.some((f) => f.endsWith('_test.go'));
    } catch {
      return false;
    }
  }

  // ==================== 私有方法：框架配置 ====================

  private getJestConfig(): TestFrameworkConfig {
    return {
      command: 'npx jest',
      args: ['--json', '--outputFile=jest-results.json'],
      coverageArgs: ['--coverage', '--coverageReporters=json-summary'],
      configFile: this.findJestConfigFile(),
      testPattern: '**/*.test.{ts,tsx,js,jsx}',
    };
  }

  private getPytestConfig(): TestFrameworkConfig {
    return {
      command: 'pytest',
      args: ['--tb=short', '-v'],
      coverageArgs: ['--cov', '--cov-report=json'],
      configFile: this.findPytestConfigFile(),
      testPattern: '**/test_*.py',
    };
  }

  private getJUnitConfig(): TestFrameworkConfig {
    // 检测是 Maven 还是 Gradle
    const isMaven = fs.existsSync(path.join(this.workingDirectory, 'pom.xml'));
    const isGradle =
      fs.existsSync(path.join(this.workingDirectory, 'build.gradle')) ||
      fs.existsSync(path.join(this.workingDirectory, 'build.gradle.kts'));

    if (isMaven) {
      return {
        command: 'mvn',
        args: ['test', '-B'],
        coverageArgs: ['jacoco:report'],
        testPattern: '**/Test*.java',
      };
    } else if (isGradle) {
      return {
        command: './gradlew',
        args: ['test', '--info'],
        coverageArgs: ['jacocoTestReport'],
        testPattern: '**/Test*.java',
      };
    }

    return {
      command: 'mvn',
      args: ['test'],
      testPattern: '**/Test*.java',
    };
  }

  private getGoTestConfig(): TestFrameworkConfig {
    return {
      command: 'go',
      args: ['test', '-v', '-json', './...'],
      coverageArgs: ['-cover', '-coverprofile=coverage.out'],
      testPattern: '**/*_test.go',
    };
  }

  private findJestConfigFile(): string | undefined {
    const configFiles = ['jest.config.js', 'jest.config.ts', 'jest.config.mjs', 'jest.config.cjs'];
    for (const file of configFiles) {
      if (fs.existsSync(path.join(this.workingDirectory, file))) {
        return file;
      }
    }
    return undefined;
  }

  private findPytestConfigFile(): string | undefined {
    const configFiles = ['pytest.ini', 'pyproject.toml', 'setup.cfg'];
    for (const file of configFiles) {
      if (fs.existsSync(path.join(this.workingDirectory, file))) {
        return file;
      }
    }
    return undefined;
  }

  // ==================== 私有方法：命令参数处理 ====================

  private addTestPatternArgs(args: string[], pattern: string): string[] {
    switch (this.detectedFramework) {
      case 'jest':
        return [...args, '--testPathPattern', pattern];
      case 'pytest':
        return [...args, '-k', pattern];
      case 'junit':
        return [...args, `-Dtest=${pattern}`];
      case 'go-test':
        return [...args, '-run', pattern];
      default:
        return args;
    }
  }

  private addVerboseArgs(args: string[]): string[] {
    switch (this.detectedFramework) {
      case 'jest':
        return [...args, '--verbose'];
      case 'pytest':
        return [...args, '-vv'];
      case 'junit':
        return [...args, '-X'];
      case 'go-test':
        // Go test 已经有 -v 参数
        return args;
      default:
        return args;
    }
  }

  private addWatchArgs(args: string[]): string[] {
    switch (this.detectedFramework) {
      case 'jest':
        return [...args, '--watch'];
      case 'pytest':
        return [...args, '--looponfail'];
      default:
        return args;
    }
  }

  // ==================== 私有方法：输出解析 ====================

  private parseJestOutput(output: string, parseCoverage: boolean): TestResult {
    const result = this.createEmptyResult(output);
    result.framework = 'jest';

    // 尝试解析 JSON 输出
    try {
      const jsonMatch = output.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
      if (jsonMatch) {
        const json = JSON.parse(jsonMatch[0]);
        return this.parseJestJson(json, output, parseCoverage);
      }
    } catch {
      // 如果 JSON 解析失败，使用文本解析
    }

    // 文本解析 - 匹配 "Tests:" 行，支持不同顺序
    // 格式可能是: "Tests: X passed, Y failed" 或 "Tests: Y failed, X passed"
    const testsLine = output.match(/Tests:\s*(.+?)(?:\n|$)/i);
    if (testsLine) {
      const line = testsLine[1];
      const passedMatch = line.match(/(\d+)\s+passed/i);
      const failedMatch = line.match(/(\d+)\s+failed/i);
      const skippedMatch = line.match(/(\d+)\s+skipped/i);

      result.totalPassed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
      result.totalFailed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
      result.totalSkipped = skippedMatch ? parseInt(skippedMatch[1], 10) : 0;
    } else {
      // 回退到通用匹配
      const passedMatch = output.match(/(\d+)\s+pass(?:ed|ing)?/i);
      const failedMatch = output.match(/(\d+)\s+fail(?:ed|ing)?/i);
      const skippedMatch = output.match(/(\d+)\s+skip(?:ped)?/i);

      result.totalPassed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
      result.totalFailed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
      result.totalSkipped = skippedMatch ? parseInt(skippedMatch[1], 10) : 0;
    }

    const timeMatch = output.match(/Time:\s*([\d.]+)\s*s/i);
    result.totalDuration = timeMatch ? parseFloat(timeMatch[1]) * 1000 : 0;
    result.success = result.totalFailed === 0;

    // 解析失败的测试
    const failureBlocks = output.split(/●\s+/);
    for (const block of failureBlocks.slice(1)) {
      const testMatch = block.match(/^(.+?)\s*›\s*(.+?)(?:\n|$)/);
      if (testMatch) {
        const suiteName = testMatch[1].trim();
        const testName = testMatch[2].trim();

        let suite = result.suites.find((s) => s.name === suiteName);
        if (!suite) {
          suite = this.createEmptySuite(suiteName);
          result.suites.push(suite);
        }

        suite.tests.push({
          name: testName,
          status: 'failed',
          errorMessage: block.substring(testMatch[0].length).trim(),
        });
        suite.failed++;
      }
    }

    if (parseCoverage) {
      result.coverage = this.parseJestCoverage(output);
    }

    return result;
  }

  private parseJestJson(json: any, rawOutput: string, parseCoverage: boolean): TestResult {
    const result = this.createEmptyResult(rawOutput);
    result.framework = 'jest';

    result.totalPassed = json.numPassedTests || 0;
    result.totalFailed = json.numFailedTests || 0;
    result.totalSkipped = json.numPendingTests || 0;
    result.totalDuration =
      json.testResults?.reduce((sum: number, r: any) => sum + (r.endTime - r.startTime), 0) || 0;
    result.success = json.success || result.totalFailed === 0;

    // 解析测试套件
    if (json.testResults) {
      for (const testResult of json.testResults) {
        const suite: TestSuite = {
          name: testResult.name || 'Unknown Suite',
          tests: [],
          passed: 0,
          failed: 0,
          skipped: 0,
          duration: testResult.endTime - testResult.startTime,
        };

        if (testResult.assertionResults) {
          for (const assertion of testResult.assertionResults) {
            const status: TestStatus =
              assertion.status === 'passed'
                ? 'passed'
                : assertion.status === 'failed'
                  ? 'failed'
                  : assertion.status === 'pending'
                    ? 'skipped'
                    : 'error';

            suite.tests.push({
              name: assertion.title || assertion.fullName || 'Unknown Test',
              status,
              duration: assertion.duration,
              errorMessage: assertion.failureMessages?.join('\n'),
              filePath: testResult.name,
            });

            if (status === 'passed') suite.passed++;
            else if (status === 'failed') suite.failed++;
            else if (status === 'skipped') suite.skipped++;
          }
        }

        result.suites.push(suite);
      }
    }

    if (parseCoverage && json.coverageMap) {
      result.coverage = this.parseJestCoverageFromJson(json.coverageMap);
    }

    return result;
  }

  private parsePytestOutput(output: string, parseCoverage: boolean): TestResult {
    const result = this.createEmptyResult(output);
    result.framework = 'pytest';

    // 解析摘要行: "X passed, Y failed, Z skipped in N.NNs"
    const summaryMatch = output.match(
      /(\d+)\s+passed(?:,\s*(\d+)\s+failed)?(?:,\s*(\d+)\s+skipped)?.*?in\s+([\d.]+)s/i
    );

    if (summaryMatch) {
      result.totalPassed = parseInt(summaryMatch[1], 10) || 0;
      result.totalFailed = parseInt(summaryMatch[2], 10) || 0;
      result.totalSkipped = parseInt(summaryMatch[3], 10) || 0;
      result.totalDuration = parseFloat(summaryMatch[4]) * 1000;
    }

    result.success = result.totalFailed === 0;

    // 解析失败的测试
    const failureSection = output.match(/=+ FAILURES =+([\s\S]*?)(?:=+ short test summary|$)/);
    if (failureSection) {
      const failures = failureSection[1].split(/_{3,}\s+/);
      for (const failure of failures) {
        const testMatch = failure.match(/^(\S+)\s+_{3,}/);
        if (testMatch) {
          const fullName = testMatch[1];
          const parts = fullName.split('::');
          const suiteName = parts.slice(0, -1).join('::') || 'Unknown Suite';
          const testName = parts[parts.length - 1];

          let suite = result.suites.find((s) => s.name === suiteName);
          if (!suite) {
            suite = this.createEmptySuite(suiteName);
            result.suites.push(suite);
          }

          suite.tests.push({
            name: testName,
            status: 'failed',
            errorMessage: failure,
          });
          suite.failed++;
        }
      }
    }

    if (parseCoverage) {
      result.coverage = this.parsePytestCoverage(output);
    }

    return result;
  }

  private parseJUnitOutput(output: string, _parseCoverage: boolean): TestResult {
    const result = this.createEmptyResult(output);
    result.framework = 'junit';

    // Maven Surefire 输出格式
    // 注意: JUnit 覆盖率通常通过 JaCoCo 单独生成，此处暂不解析
    const testsRunMatch = output.match(/Tests run:\s*(\d+)/);
    const failuresMatch = output.match(/Failures:\s*(\d+)/);
    const errorsMatch = output.match(/Errors:\s*(\d+)/);
    const skippedMatch = output.match(/Skipped:\s*(\d+)/);
    const timeMatch = output.match(/Time elapsed:\s*([\d.]+)\s*s/);

    if (testsRunMatch) {
      const totalTests = parseInt(testsRunMatch[1], 10);
      const failures = failuresMatch ? parseInt(failuresMatch[1], 10) : 0;
      const errors = errorsMatch ? parseInt(errorsMatch[1], 10) : 0;
      const skipped = skippedMatch ? parseInt(skippedMatch[1], 10) : 0;

      result.totalFailed = failures + errors;
      result.totalSkipped = skipped;
      result.totalPassed = totalTests - result.totalFailed - result.totalSkipped;
      result.totalDuration = timeMatch ? parseFloat(timeMatch[1]) * 1000 : 0;
    }

    result.success = result.totalFailed === 0;

    // 解析失败的测试
    const failureBlocks = output.split(/\[ERROR\]\s+/);
    for (const block of failureBlocks) {
      const testMatch = block.match(/(\w+)\.(\w+):(\d+)/);
      if (testMatch) {
        const suiteName = testMatch[1];
        const testName = testMatch[2];
        const lineNumber = parseInt(testMatch[3], 10);

        let suite = result.suites.find((s) => s.name === suiteName);
        if (!suite) {
          suite = this.createEmptySuite(suiteName);
          result.suites.push(suite);
        }

        suite.tests.push({
          name: testName,
          status: 'failed',
          errorMessage: block,
          lineNumber,
        });
        suite.failed++;
      }
    }

    return result;
  }

  private parseGoTestOutput(output: string, parseCoverage: boolean): TestResult {
    const result = this.createEmptyResult(output);
    result.framework = 'go-test';

    // 尝试解析 JSON 输出
    const lines = output.split('\n');
    let hasJsonOutput = false;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('{')) {
        try {
          const json = JSON.parse(trimmedLine);
          hasJsonOutput = true;

          if (json.Action === 'pass' && json.Test) {
            result.totalPassed++;
            this.addGoTestToSuite(result, json.Package, json.Test, 'passed', json.Elapsed);
          } else if (json.Action === 'fail' && json.Test) {
            result.totalFailed++;
            this.addGoTestToSuite(
              result,
              json.Package,
              json.Test,
              'failed',
              json.Elapsed,
              json.Output
            );
          } else if (json.Action === 'skip' && json.Test) {
            result.totalSkipped++;
            this.addGoTestToSuite(result, json.Package, json.Test, 'skipped', json.Elapsed);
          }
        } catch {
          // 忽略非 JSON 行
        }
      }
    }

    // 如果没有 JSON 输出，使用文本解析
    if (!hasJsonOutput) {
      const passMatch = output.match(/PASS/g);
      const failMatch = output.match(/FAIL/g);

      result.totalPassed = passMatch ? passMatch.length : 0;
      result.totalFailed = failMatch ? failMatch.length : 0;
    }

    result.success = result.totalFailed === 0;

    // 解析覆盖率
    if (parseCoverage) {
      const coverageMatch = output.match(/coverage:\s*([\d.]+)%/);
      if (coverageMatch) {
        const coverage = parseFloat(coverageMatch[1]);
        result.coverage = {
          lines: coverage,
          statements: coverage,
          branches: 0,
          functions: 0,
        };
      }
    }

    return result;
  }

  private addGoTestToSuite(
    result: TestResult,
    packageName: string,
    testName: string,
    status: TestStatus,
    elapsed?: number,
    errorOutput?: string
  ): void {
    let suite = result.suites.find((s) => s.name === packageName);
    if (!suite) {
      suite = this.createEmptySuite(packageName);
      result.suites.push(suite);
    }

    suite.tests.push({
      name: testName,
      status,
      duration: elapsed ? elapsed * 1000 : undefined,
      errorMessage: errorOutput,
    });

    if (status === 'passed') suite.passed++;
    else if (status === 'failed') suite.failed++;
    else if (status === 'skipped') suite.skipped++;
  }

  // ==================== 私有方法：覆盖率解析 ====================

  private parseJestCoverage(output: string): CoverageReport | undefined {
    // 解析 Jest 文本覆盖率输出 - 支持多种格式
    // 格式1: "Lines : 85.5%"
    // 格式2: "% Lines | 85.5"
    // 格式3: 表格格式 "| 85.5 |"

    let lines = 0,
      statements = 0,
      branches = 0,
      functions = 0;
    let found = false;

    // 尝试匹配 "Lines : XX%" 格式
    const linesMatch = output.match(/Lines\s*:\s*([\d.]+)%/i);
    const stmtsMatch = output.match(/Stmts\s*:\s*([\d.]+)%/i);
    const branchMatch = output.match(/Branch(?:es)?\s*:\s*([\d.]+)%/i);
    const funcsMatch = output.match(/Funcs\s*:\s*([\d.]+)%/i);

    if (linesMatch || stmtsMatch || branchMatch || funcsMatch) {
      lines = linesMatch ? parseFloat(linesMatch[1]) : 0;
      statements = stmtsMatch ? parseFloat(stmtsMatch[1]) : 0;
      branches = branchMatch ? parseFloat(branchMatch[1]) : 0;
      functions = funcsMatch ? parseFloat(funcsMatch[1]) : 0;
      found = true;
    }

    // 尝试匹配表格格式 "| % Stmts | % Branch | % Funcs | % Lines |"
    // 然后匹配 "All files | XX | XX | XX | XX |"
    if (!found) {
      const tableMatch = output.match(
        /All\s+files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/i
      );
      if (tableMatch) {
        statements = parseFloat(tableMatch[1]);
        branches = parseFloat(tableMatch[2]);
        functions = parseFloat(tableMatch[3]);
        lines = parseFloat(tableMatch[4]);
        found = true;
      }
    }

    // 尝试匹配简化的表格格式
    if (!found) {
      const simpleTableMatch = output.match(
        /\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/
      );
      if (simpleTableMatch) {
        statements = parseFloat(simpleTableMatch[1]);
        branches = parseFloat(simpleTableMatch[2]);
        functions = parseFloat(simpleTableMatch[3]);
        lines = parseFloat(simpleTableMatch[4]);
        found = true;
      }
    }

    if (found) {
      return { lines, statements, branches, functions };
    }

    return undefined;
  }

  private parseJestCoverageFromJson(coverageMap: any): CoverageReport {
    let totalLines = 0;
    let coveredLines = 0;
    let totalStatements = 0;
    let coveredStatements = 0;
    let totalBranches = 0;
    let coveredBranches = 0;
    let totalFunctions = 0;
    let coveredFunctions = 0;
    const uncoveredFiles: string[] = [];

    for (const [file, coverage] of Object.entries(coverageMap)) {
      const cov = coverage as any;

      // 统计行覆盖率
      if (cov.l) {
        for (const [, count] of Object.entries(cov.l)) {
          totalLines++;
          if ((count as number) > 0) coveredLines++;
        }
      }

      // 统计语句覆盖率
      if (cov.s) {
        for (const [, count] of Object.entries(cov.s)) {
          totalStatements++;
          if ((count as number) > 0) coveredStatements++;
        }
      }

      // 统计分支覆盖率
      if (cov.b) {
        for (const [, counts] of Object.entries(cov.b)) {
          for (const count of counts as number[]) {
            totalBranches++;
            if (count > 0) coveredBranches++;
          }
        }
      }

      // 统计函数覆盖率
      if (cov.f) {
        for (const [, count] of Object.entries(cov.f)) {
          totalFunctions++;
          if ((count as number) > 0) coveredFunctions++;
        }
      }

      // 检查未覆盖的文件
      const fileCoverage = totalStatements > 0 ? coveredStatements / totalStatements : 0;
      if (fileCoverage < 0.5) {
        uncoveredFiles.push(file);
      }
    }

    return {
      lines: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0,
      statements: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0,
      branches: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0,
      functions: totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 0,
      uncoveredFiles,
    };
  }

  private parsePytestCoverage(output: string): CoverageReport | undefined {
    // 解析 pytest-cov 输出
    const totalMatch = output.match(/TOTAL\s+\d+\s+\d+\s+(\d+)%/);
    if (totalMatch) {
      const coverage = parseFloat(totalMatch[1]);
      return {
        lines: coverage,
        statements: coverage,
        branches: 0,
        functions: 0,
      };
    }
    return undefined;
  }

  // ==================== 私有方法：测试建议生成 ====================

  private generateJavaScriptTestSuggestions(sourceFile: string, content: string): TestSuggestion[] {
    const suggestions: TestSuggestion[] = [];

    // 匹配导出的函数
    const functionMatches = content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)\s*\(/g);
    for (const match of functionMatches) {
      suggestions.push({
        testName: `should test ${match[1]}`,
        description: `为函数 ${match[1]} 编写单元测试`,
        testType: 'unit',
        targetFile: sourceFile,
        targetFunction: match[1],
        codeTemplate: this.generateJestTestTemplate(match[1]),
      });
    }

    // 匹配导出的类
    const classMatches = content.matchAll(/export\s+class\s+(\w+)/g);
    for (const match of classMatches) {
      suggestions.push({
        testName: `should test ${match[1]} class`,
        description: `为类 ${match[1]} 编写单元测试`,
        testType: 'unit',
        targetFile: sourceFile,
        targetFunction: match[1],
        codeTemplate: this.generateJestClassTestTemplate(match[1]),
      });
    }

    // 匹配箭头函数导出
    const arrowFunctionMatches = content.matchAll(/export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(/g);
    for (const match of arrowFunctionMatches) {
      suggestions.push({
        testName: `should test ${match[1]}`,
        description: `为函数 ${match[1]} 编写单元测试`,
        testType: 'unit',
        targetFile: sourceFile,
        targetFunction: match[1],
        codeTemplate: this.generateJestTestTemplate(match[1]),
      });
    }

    return suggestions;
  }

  private generatePythonTestSuggestions(sourceFile: string, content: string): TestSuggestion[] {
    const suggestions: TestSuggestion[] = [];

    // 匹配函数定义
    const functionMatches = content.matchAll(/^def\s+(\w+)\s*\(/gm);
    for (const match of functionMatches) {
      if (!match[1].startsWith('_')) {
        suggestions.push({
          testName: `test_${match[1]}`,
          description: `为函数 ${match[1]} 编写单元测试`,
          testType: 'unit',
          targetFile: sourceFile,
          targetFunction: match[1],
          codeTemplate: this.generatePytestTestTemplate(match[1]),
        });
      }
    }

    // 匹配类定义
    const classMatches = content.matchAll(/^class\s+(\w+)/gm);
    for (const match of classMatches) {
      suggestions.push({
        testName: `Test${match[1]}`,
        description: `为类 ${match[1]} 编写单元测试`,
        testType: 'unit',
        targetFile: sourceFile,
        targetFunction: match[1],
        codeTemplate: this.generatePytestClassTestTemplate(match[1]),
      });
    }

    return suggestions;
  }

  private generateJavaTestSuggestions(sourceFile: string, content: string): TestSuggestion[] {
    const suggestions: TestSuggestion[] = [];

    // 匹配公共方法
    const methodMatches = content.matchAll(/public\s+(?:static\s+)?(?:\w+\s+)?(\w+)\s*\(/g);
    for (const match of methodMatches) {
      if (!['main', 'toString', 'equals', 'hashCode'].includes(match[1])) {
        suggestions.push({
          testName: `test${match[1].charAt(0).toUpperCase() + match[1].slice(1)}`,
          description: `为方法 ${match[1]} 编写单元测试`,
          testType: 'unit',
          targetFile: sourceFile,
          targetFunction: match[1],
          codeTemplate: this.generateJUnitTestTemplate(match[1]),
        });
      }
    }

    return suggestions;
  }

  private generateGoTestSuggestions(sourceFile: string, content: string): TestSuggestion[] {
    const suggestions: TestSuggestion[] = [];

    // 匹配导出的函数（首字母大写）
    const functionMatches = content.matchAll(/^func\s+([A-Z]\w*)\s*\(/gm);
    for (const match of functionMatches) {
      suggestions.push({
        testName: `Test${match[1]}`,
        description: `为函数 ${match[1]} 编写单元测试`,
        testType: 'unit',
        targetFile: sourceFile,
        targetFunction: match[1],
        codeTemplate: this.generateGoTestTemplate(match[1]),
      });
    }

    return suggestions;
  }

  // ==================== 私有方法：测试模板生成 ====================

  private generateJestTestTemplate(functionName: string): string {
    return `describe('${functionName}', () => {
  it('should work correctly', () => {
    // Arrange
    const input = /* 输入数据 */;
    const expected = /* 期望结果 */;

    // Act
    const result = ${functionName}(input);

    // Assert
    expect(result).toEqual(expected);
  });

  it('should handle edge cases', () => {
    // 测试边界情况
  });
});`;
  }

  private generateJestClassTestTemplate(className: string): string {
    return `describe('${className}', () => {
  let instance: ${className};

  beforeEach(() => {
    instance = new ${className}();
  });

  it('should create an instance', () => {
    expect(instance).toBeDefined();
  });

  // 添加更多测试用例
});`;
  }

  private generatePytestTestTemplate(functionName: string): string {
    return `def test_${functionName}():
    # Arrange
    input_data = None  # 输入数据
    expected = None  # 期望结果

    # Act
    result = ${functionName}(input_data)

    # Assert
    assert result == expected


def test_${functionName}_edge_case():
    # 测试边界情况
    pass`;
  }

  private generatePytestClassTestTemplate(className: string): string {
    return `class Test${className}:
    def setup_method(self):
        self.instance = ${className}()

    def test_creation(self):
        assert self.instance is not None

    # 添加更多测试用例`;
  }

  private generateJUnitTestTemplate(methodName: string): string {
    const capitalizedName = methodName.charAt(0).toUpperCase() + methodName.slice(1);
    return `@Test
public void test${capitalizedName}() {
    // Arrange
    // 准备测试数据

    // Act
    // 调用被测方法

    // Assert
    // 验证结果
}`;
  }

  private generateGoTestTemplate(functionName: string): string {
    return `func Test${functionName}(t *testing.T) {
    // Arrange
    // 准备测试数据

    // Act
    result := ${functionName}()

    // Assert
    if result != expected {
        t.Errorf("${functionName}() = %v, want %v", result, expected)
    }
}`;
  }

  // ==================== 私有方法：错误类型检测 ====================

  private isAssertionError(message: string): boolean {
    const patterns = [
      /expect.*to(Be|Equal|Match|Have|Contain)/i,
      /assert(Equal|True|False|Null|NotNull)/i,
      /expected.*but.*got/i,
      /AssertionError/i,
    ];
    return patterns.some((p) => p.test(message));
  }

  private isTypeError(message: string): boolean {
    return /TypeError|type.*error|is not a function|undefined is not/i.test(message);
  }

  private isReferenceError(message: string): boolean {
    return /ReferenceError|is not defined|NameError/i.test(message);
  }

  private isTimeoutError(message: string): boolean {
    return /timeout|exceeded.*time|async.*callback.*not.*invoked/i.test(message);
  }

  private isModuleNotFoundError(message: string): boolean {
    return /Cannot find module|ModuleNotFoundError|No module named/i.test(message);
  }

  private isNetworkError(message: string): boolean {
    return /ECONNREFUSED|ETIMEDOUT|network.*error|fetch.*failed/i.test(message);
  }

  // ==================== 私有方法：工具函数 ====================

  private createEmptyResult(rawOutput: string): TestResult {
    return {
      framework: 'unknown',
      suites: [],
      totalPassed: 0,
      totalFailed: 0,
      totalSkipped: 0,
      totalDuration: 0,
      success: true,
      rawOutput,
    };
  }

  private createEmptySuite(name: string): TestSuite {
    return {
      name,
      tests: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
    };
  }

  private formatPercentage(value: number): string {
    const bar = this.createProgressBar(value);
    const color = value >= 80 ? '🟢' : value >= 50 ? '🟡' : '🔴';
    return `${color} ${value.toFixed(1)}% ${bar}`;
  }

  private createProgressBar(percentage: number): string {
    const filled = Math.round(percentage / 5);
    const empty = 20 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms.toFixed(0)}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(2)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(0);
      return `${minutes}m ${seconds}s`;
    }
  }
}

// 导出默认实例工厂函数
export function createTestFrameworkIntegration(
  workingDirectory?: string
): TestFrameworkIntegration {
  return new TestFrameworkIntegration(workingDirectory);
}
