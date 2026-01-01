/**
 * 断言匹配器属性测试
 *
 * 使用 fast-check 进行属性测试，验证 AssertionMatcher 的正确性
 *
 * **Property 10: Assertion Matching Correctness**
 * **Property 11: JSON Schema Validation**
 * **Property 12: ANSI Comparison Modes**
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
 */

import * as fc from 'fast-check';
import { AssertionMatcher } from '../../src/testing/AssertionMatcher';
import { ANSIParser } from '../../src/testing/ANSIParser';

describe('AssertionMatcher Property Tests', () => {
  const matcher = new AssertionMatcher();
  const ansiParser = new ANSIParser();

  /**
   * Property 10: Assertion Matching Correctness
   *
   * *For any* actual string and expected pattern, `AssertionMatcher.assert()`
   * should return `passed: true` if and only if the actual string matches
   * the expected pattern according to the specified match type.
   *
   * **Validates: Requirements 4.1, 4.2, 4.4**
   */
  describe('Property 10: Assertion Matching Correctness', () => {
    // 生成非空字符串
    const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 100 });

    it('exactMatch 应该在字符串相等时返回 passed: true', () => {
      fc.assert(
        fc.property(nonEmptyStringArb, (str) => {
          const result = matcher.exactMatch(str, str);
          expect(result.passed).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('exactMatch 应该在字符串不等时返回 passed: false', () => {
      fc.assert(
        fc.property(
          nonEmptyStringArb,
          nonEmptyStringArb.filter((s) => s.length > 0),
          (str1, str2) => {
            // 确保两个字符串不同
            fc.pre(str1 !== str2);
            const result = matcher.exactMatch(str1, str2);
            expect(result.passed).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('containsMatch 应该在包含子串时返回 passed: true', () => {
      fc.assert(
        fc.property(
          nonEmptyStringArb,
          nonEmptyStringArb,
          nonEmptyStringArb,
          (prefix, substring, suffix) => {
            const fullString = prefix + substring + suffix;
            const result = matcher.containsMatch(fullString, substring);
            expect(result.passed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('containsMatch 应该在不包含子串时返回 passed: false', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }), (str) => {
          // 使用一个不可能出现在随机字符串中的特殊标记
          const impossibleSubstring = '<<<IMPOSSIBLE_MARKER_12345>>>';
          fc.pre(!str.includes(impossibleSubstring));
          const result = matcher.containsMatch(str, impossibleSubstring);
          expect(result.passed).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('regexMatch 应该在匹配时返回 passed: true', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !/[.*+?^${}()|[\]\\]/.test(s)),
          (str) => {
            // 使用字符串本身作为正则表达式（转义特殊字符）
            const escapedStr = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(escapedStr);
            const result = matcher.regexMatch(str, pattern);
            expect(result.passed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('assert() 方法应该根据类型正确分发', () => {
      fc.assert(
        fc.property(nonEmptyStringArb, (str) => {
          // 测试 exact 类型
          const exactResult = matcher.assert(str, {
            type: 'exact',
            expected: str,
          });
          expect(exactResult.passed).toBe(true);

          // 测试 contains 类型
          const containsResult = matcher.assert(str, {
            type: 'contains',
            expected: str,
          });
          expect(containsResult.passed).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('ignoreCase 选项应该正确工作', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => /[a-zA-Z]/.test(s)),
          (str) => {
            const upper = str.toUpperCase();
            const lower = str.toLowerCase();

            // 不忽略大小写时，不同大小写应该不匹配
            if (upper !== lower) {
              const resultWithoutIgnore = matcher.exactMatch(upper, lower);
              expect(resultWithoutIgnore.passed).toBe(false);
            }

            // 忽略大小写时，应该匹配
            const resultWithIgnore = matcher.exactMatch(upper, lower, { ignoreCase: true });
            expect(resultWithIgnore.passed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 11: JSON Schema Validation
   *
   * *For any* JSON string and JSON Schema, `jsonSchemaMatch()` should return
   * `passed: true` if and only if the JSON conforms to the schema.
   *
   * **Validates: Requirements 4.3**
   */
  describe('Property 11: JSON Schema Validation', () => {
    // 生成简单的 JSON 对象
    const simpleJsonObjectArb = fc.record({
      name: fc.string({ minLength: 1, maxLength: 20 }),
      age: fc.integer({ min: 0, max: 150 }),
      active: fc.boolean(),
    });

    // 对应的 JSON Schema
    const simpleSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer', minimum: 0 },
        active: { type: 'boolean' },
      },
      required: ['name', 'age', 'active'],
    };

    it('符合 schema 的 JSON 应该验证通过', () => {
      fc.assert(
        fc.property(simpleJsonObjectArb, (obj) => {
          const jsonStr = JSON.stringify(obj);
          const result = matcher.jsonSchemaMatch(jsonStr, simpleSchema);
          expect(result.passed).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('不符合 schema 的 JSON 应该验证失败', () => {
      fc.assert(
        fc.property(
          fc.record({
            name: fc.integer(), // 错误类型：应该是 string
            age: fc.string(), // 错误类型：应该是 integer
            active: fc.string(), // 错误类型：应该是 boolean
          }),
          (obj) => {
            const jsonStr = JSON.stringify(obj);
            const result = matcher.jsonSchemaMatch(jsonStr, simpleSchema);
            expect(result.passed).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('无效的 JSON 字符串应该验证失败', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => {
            try {
              JSON.parse(s);
              return false; // 如果能解析，则过滤掉
            } catch {
              return true; // 保留无法解析的字符串
            }
          }),
          (invalidJson) => {
            const result = matcher.jsonSchemaMatch(invalidJson, simpleSchema);
            expect(result.passed).toBe(false);
            expect(result.message).toContain('JSON 解析失败');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('jsonMatch 应该正确比较 JSON 对象', () => {
      fc.assert(
        fc.property(simpleJsonObjectArb, (obj) => {
          const jsonStr = JSON.stringify(obj);
          const result = matcher.jsonMatch(jsonStr, obj);
          expect(result.passed).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('jsonMatch 应该检测 JSON 差异', () => {
      fc.assert(
        fc.property(simpleJsonObjectArb, simpleJsonObjectArb, (obj1, obj2) => {
          // 确保两个对象不同
          fc.pre(JSON.stringify(obj1) !== JSON.stringify(obj2));
          const jsonStr = JSON.stringify(obj1);
          const result = matcher.jsonMatch(jsonStr, obj2);
          expect(result.passed).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 12: ANSI Comparison Modes
   *
   * *For any* string with ANSI codes, when `stripAnsi: true`, the assertion
   * should compare stripped versions; when `stripAnsi: false`, it should
   * compare raw versions.
   *
   * **Validates: Requirements 4.5**
   */
  describe('Property 12: ANSI Comparison Modes', () => {
    // 生成 ANSI 转义序列
    const ansiEscapeArb = fc
      .array(fc.integer({ min: 0, max: 107 }), { minLength: 0, maxLength: 3 })
      .map((params) => `\x1b[${params.join(';')}m`);

    // 生成不包含 ANSI 的纯文本
    const plainTextArb = fc
      .string({ minLength: 1, maxLength: 50 })
      .filter((s) => !ansiParser.hasAnsi(s) && !s.includes('\x1b'));

    it('stripAnsi: true 时应该比较去除 ANSI 后的内容', () => {
      fc.assert(
        fc.property(plainTextArb, ansiEscapeArb, (text, ansi) => {
          const withAnsi = ansi + text + '\x1b[0m';
          const result = matcher.assert(withAnsi, {
            type: 'exact',
            expected: text,
            stripAnsi: true,
          });
          expect(result.passed).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('stripAnsi: false 时应该比较原始内容', () => {
      fc.assert(
        fc.property(plainTextArb, ansiEscapeArb, (text, ansi) => {
          const withAnsi = ansi + text + '\x1b[0m';
          // 不去除 ANSI 时，带 ANSI 的字符串不应该等于纯文本
          const result = matcher.assert(withAnsi, {
            type: 'exact',
            expected: text,
            stripAnsi: false,
          });
          // 带 ANSI 的字符串不应该等于纯文本（因为总是有 \x1b[0m 后缀）
          expect(result.passed).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('stripAnsi 应该影响 contains 匹配', () => {
      fc.assert(
        fc.property(plainTextArb, ansiEscapeArb, (text, ansi) => {
          fc.pre(text.length > 0);
          const withAnsi = ansi + text + '\x1b[0m';

          // 使用 stripAnsi: true 时，应该能找到纯文本
          const resultWithStrip = matcher.assert(withAnsi, {
            type: 'contains',
            expected: text,
            stripAnsi: true,
          });
          expect(resultWithStrip.passed).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('stripAnsi 应该影响 regex 匹配', () => {
      fc.assert(
        fc.property(
          plainTextArb.filter((s) => s.length > 0 && !/[.*+?^${}()|[\]\\]/.test(s)),
          ansiEscapeArb,
          (text, ansi) => {
            const withAnsi = ansi + text + '\x1b[0m';
            const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(escapedText);

            // 使用 stripAnsi: true 时，应该能匹配纯文本模式
            const resultWithStrip = matcher.assert(withAnsi, {
              type: 'regex',
              expected: pattern,
              stripAnsi: true,
            });
            expect(resultWithStrip.passed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
