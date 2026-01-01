/**
 * 断言匹配器
 *
 * 提供多种输出验证方式，支持精确匹配、包含匹配、正则匹配、
 * JSON 匹配和 JSON Schema 验证
 *
 * @module AssertionMatcher
 */

import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { diffLines, diffChars } from 'diff';
import { ANSIParser } from './ANSIParser';
import { AssertionOptions, AssertionResult } from './types';

/**
 * 断言匹配器类
 *
 * 提供灵活的输出验证功能，支持多种匹配类型和选项
 */
export class AssertionMatcher {
  private ansiParser: ANSIParser;
  private ajv: Ajv;
  private schemaCache: Map<string, ValidateFunction>;

  constructor() {
    this.ansiParser = new ANSIParser();
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);
    this.schemaCache = new Map();
  }

  /**
   * 执行断言验证
   *
   * @param actual - 实际输出
   * @param options - 断言选项
   * @returns 断言结果
   */
  assert(actual: string, options: AssertionOptions): AssertionResult {
    // 预处理实际值
    let processedActual = actual;

    if (options.stripAnsi) {
      processedActual = this.ansiParser.strip(processedActual);
    }

    if (options.ignoreWhitespace) {
      processedActual = this.normalizeWhitespace(processedActual);
    }

    // 根据匹配类型执行断言
    switch (options.type) {
      case 'exact':
        return this.exactMatch(processedActual, options.expected as string, options);
      case 'contains':
        return this.containsMatch(processedActual, options.expected as string, options);
      case 'regex':
        return this.regexMatch(processedActual, options.expected as RegExp, options);
      case 'json':
        return this.jsonMatch(processedActual, options.expected as object, options);
      case 'jsonSchema':
        return this.jsonSchemaMatch(processedActual, options.expected as object, options);
      default:
        return {
          passed: false,
          actual: processedActual,
          expected: options.expected,
          message: `未知的匹配类型: ${options.type}`,
        };
    }
  }

  /**
   * 精确匹配
   *
   * @param actual - 实际输出
   * @param expected - 预期输出
   * @param options - 断言选项
   * @returns 断言结果
   */
  exactMatch(actual: string, expected: string, options?: Partial<AssertionOptions>): AssertionResult {
    let processedActual = actual;
    let processedExpected = expected;

    // 处理大小写
    if (options?.ignoreCase) {
      processedActual = processedActual.toLowerCase();
      processedExpected = processedExpected.toLowerCase();
    }

    // 处理空白
    if (options?.ignoreWhitespace) {
      processedActual = this.normalizeWhitespace(processedActual);
      processedExpected = this.normalizeWhitespace(processedExpected);
    }

    const passed = processedActual === processedExpected;

    return {
      passed,
      actual,
      expected,
      diff: passed ? undefined : this.generateDiff(actual, expected),
      message: passed ? undefined : '精确匹配失败：实际输出与预期不符',
    };
  }

  /**
   * 包含匹配
   *
   * @param actual - 实际输出
   * @param expected - 预期包含的子串
   * @param options - 断言选项
   * @returns 断言结果
   */
  containsMatch(actual: string, expected: string, options?: Partial<AssertionOptions>): AssertionResult {
    let processedActual = actual;
    let processedExpected = expected;

    // 处理大小写
    if (options?.ignoreCase) {
      processedActual = processedActual.toLowerCase();
      processedExpected = processedExpected.toLowerCase();
    }

    const passed = processedActual.includes(processedExpected);

    return {
      passed,
      actual,
      expected,
      message: passed ? undefined : `包含匹配失败：未找到预期子串 "${expected}"`,
    };
  }

  /**
   * 正则匹配
   *
   * @param actual - 实际输出
   * @param pattern - 正则表达式
   * @param options - 断言选项
   * @returns 断言结果
   */
  regexMatch(actual: string, pattern: RegExp, options?: Partial<AssertionOptions>): AssertionResult {
    let processedActual = actual;
    let processedPattern = pattern;

    // 处理大小写
    if (options?.ignoreCase && !pattern.flags.includes('i')) {
      processedPattern = new RegExp(pattern.source, pattern.flags + 'i');
    }

    const passed = processedPattern.test(processedActual);
    const match = processedActual.match(processedPattern);

    return {
      passed,
      actual,
      expected: pattern.toString(),
      message: passed
        ? undefined
        : `正则匹配失败：实际输出不匹配模式 ${pattern.toString()}`,
      diff: match ? `匹配内容: ${match[0]}` : undefined,
    };
  }

  /**
   * JSON 匹配
   *
   * @param actual - 实际输出（JSON 字符串）
   * @param expected - 预期 JSON 对象
   * @param options - 断言选项
   * @returns 断言结果
   */
  jsonMatch(actual: string, expected: object, _options?: Partial<AssertionOptions>): AssertionResult {
    let parsedActual: unknown;

    try {
      parsedActual = JSON.parse(actual);
    } catch (error) {
      return {
        passed: false,
        actual,
        expected,
        message: `JSON 解析失败: ${(error as Error).message}`,
      };
    }

    const passed = this.deepEqual(parsedActual, expected);

    return {
      passed,
      actual,
      expected,
      diff: passed
        ? undefined
        : this.generateDiff(
            JSON.stringify(parsedActual, null, 2),
            JSON.stringify(expected, null, 2)
          ),
      message: passed ? undefined : 'JSON 匹配失败：实际 JSON 与预期不符',
    };
  }

  /**
   * JSON Schema 验证
   *
   * @param actual - 实际输出（JSON 字符串）
   * @param schema - JSON Schema
   * @param options - 断言选项
   * @returns 断言结果
   */
  jsonSchemaMatch(actual: string, schema: object, _options?: Partial<AssertionOptions>): AssertionResult {
    let parsedActual: unknown;

    try {
      parsedActual = JSON.parse(actual);
    } catch (error) {
      return {
        passed: false,
        actual,
        expected: schema,
        message: `JSON 解析失败: ${(error as Error).message}`,
      };
    }

    // 获取或编译 schema 验证函数
    const schemaKey = JSON.stringify(schema);
    let validate = this.schemaCache.get(schemaKey);

    if (!validate) {
      try {
        validate = this.ajv.compile(schema);
        this.schemaCache.set(schemaKey, validate);
      } catch (error) {
        return {
          passed: false,
          actual,
          expected: schema,
          message: `JSON Schema 编译失败: ${(error as Error).message}`,
        };
      }
    }

    const passed = validate(parsedActual) as boolean;

    return {
      passed,
      actual,
      expected: schema,
      message: passed
        ? undefined
        : `JSON Schema 验证失败: ${this.formatAjvErrors(validate.errors)}`,
    };
  }

  /**
   * 生成差异输出
   *
   * @param actual - 实际输出
   * @param expected - 预期输出
   * @returns 差异字符串
   */
  generateDiff(actual: string, expected: string): string {
    const lines: string[] = [];
    const diff = diffLines(expected, actual);

    diff.forEach((part) => {
      const prefix = part.added ? '+' : part.removed ? '-' : ' ';
      const content = part.value.replace(/\n$/, '');
      content.split('\n').forEach((line) => {
        lines.push(`${prefix} ${line}`);
      });
    });

    return lines.join('\n');
  }

  /**
   * 生成字符级差异输出
   *
   * @param actual - 实际输出
   * @param expected - 预期输出
   * @returns 差异字符串
   */
  generateCharDiff(actual: string, expected: string): string {
    const diff = diffChars(expected, actual);
    let result = '';

    diff.forEach((part) => {
      if (part.added) {
        result += `[+${part.value}]`;
      } else if (part.removed) {
        result += `[-${part.value}]`;
      } else {
        result += part.value;
      }
    });

    return result;
  }

  /**
   * 规范化空白字符
   *
   * @param text - 输入文本
   * @returns 规范化后的文本
   */
  private normalizeWhitespace(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
  }

  /**
   * 深度比较两个值
   *
   * @param a - 第一个值
   * @param b - 第二个值
   * @returns 是否相等
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;

    if (typeof a !== typeof b) return false;

    if (a === null || b === null) return a === b;

    if (typeof a !== 'object') return false;

    if (Array.isArray(a) !== Array.isArray(b)) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => this.deepEqual(item, b[index]));
    }

    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);

    if (keysA.length !== keysB.length) return false;

    return keysA.every((key) =>
      this.deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    );
  }

  /**
   * 格式化 Ajv 错误信息
   *
   * @param errors - Ajv 错误数组
   * @returns 格式化的错误信息
   */
  private formatAjvErrors(errors: Ajv['errors']): string {
    if (!errors || errors.length === 0) {
      return '未知错误';
    }

    return errors
      .map((err) => {
        const path = err.instancePath || '/';
        return `${path}: ${err.message}`;
      })
      .join('; ');
  }
}

/**
 * 创建 AssertionMatcher 实例的工厂函数
 *
 * @returns 新的 AssertionMatcher 实例
 */
export function createAssertionMatcher(): AssertionMatcher {
  return new AssertionMatcher();
}
