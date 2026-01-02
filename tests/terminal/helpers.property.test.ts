/**
 * 终端测试辅助函数属性测试
 *
 * 使用 fast-check 进行属性测试，验证辅助函数的正确性
 *
 * **Property 7: JSON Output Validity**
 * **Property 8: Stream-JSON Line Validity**
 * **Property 9: Exit Code Correctness**
 * **Validates: Requirements 3.2, 3.3, 3.5, 3.6**
 */

import * as fc from 'fast-check';
import {
  expectValidJSON,
  expectValidStreamJSON,
  expectExitCode,
  ExitCodes,
} from './helpers';
import { TerminalTestError, TerminalTestErrorType } from '../../src/testing/types';

describe('Terminal Helpers Property Tests', () => {
  /**
   * Property 7: JSON Output Validity
   *
   * *For any* query executed with `--output-format json`, the output should
   * be parseable as valid JSON.
   *
   * 这里我们测试 expectValidJSON 函数的正确性：
   * - 对于任何有效的 JSON 字符串，应该成功解析
   * - 对于任何无效的 JSON 字符串，应该抛出错误
   *
   * **Validates: Requirements 3.2**
   */
  describe('Property 7: JSON Output Validity', () => {
    // 生成有效的 JSON 值
    const jsonValueArb = fc.oneof(
      fc.string(),
      fc.integer(),
      fc.double({ noNaN: true, noDefaultInfinity: true }),
      fc.boolean(),
      fc.constant(null)
    );

    // 生成有效的 JSON 对象
    const jsonObjectArb = fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
      jsonValueArb,
      { minKeys: 0, maxKeys: 10 }
    );

    // 生成有效的 JSON 数组
    const jsonArrayArb = fc.array(jsonValueArb, { minLength: 0, maxLength: 10 });

    // 生成任意有效的 JSON
    const validJsonArb = fc.oneof(jsonObjectArb, jsonArrayArb, jsonValueArb);

    it('对于任何有效的 JSON 字符串，expectValidJSON 应该成功解析', () => {
      fc.assert(
        fc.property(validJsonArb, (jsonValue) => {
          const jsonStr = JSON.stringify(jsonValue);
          const result = expectValidJSON(jsonStr);
          // 验证解析结果与原始值相等
          expect(JSON.stringify(result)).toBe(JSON.stringify(jsonValue));
        }),
        { numRuns: 100 }
      );
    });

    it('对于带有 ANSI 转义序列的有效 JSON，expectValidJSON 应该成功解析', () => {
      fc.assert(
        fc.property(jsonObjectArb, (jsonValue) => {
          const jsonStr = JSON.stringify(jsonValue);
          // 添加 ANSI 转义序列
          const withAnsi = `\x1b[32m${jsonStr}\x1b[0m`;
          const result = expectValidJSON(withAnsi);
          expect(JSON.stringify(result)).toBe(JSON.stringify(jsonValue));
        }),
        { numRuns: 100 }
      );
    });

    it('对于带有前后空白的有效 JSON，expectValidJSON 应该成功解析', () => {
      fc.assert(
        fc.property(
          jsonObjectArb,
          fc.string({ minLength: 0, maxLength: 5 }).map((s) => s.replace(/\S/g, ' ')),
          fc.string({ minLength: 0, maxLength: 5 }).map((s) => s.replace(/\S/g, ' ')),
          (jsonValue, prefix, suffix) => {
            const jsonStr = JSON.stringify(jsonValue);
            const withWhitespace = `${prefix}${jsonStr}${suffix}`;
            const result = expectValidJSON(withWhitespace);
            expect(JSON.stringify(result)).toBe(JSON.stringify(jsonValue));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('对于无效的 JSON 字符串，expectValidJSON 应该抛出 TerminalTestError', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => {
            try {
              JSON.parse(s.trim());
              return false; // 如果能解析，则过滤掉
            } catch {
              return true; // 保留无法解析的字符串
            }
          }),
          (invalidJson) => {
            expect(() => expectValidJSON(invalidJson)).toThrow(TerminalTestError);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('expectValidJSON 抛出的错误应该是 ASSERTION_FAILED 类型', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => {
            try {
              JSON.parse(s.trim());
              return false;
            } catch {
              return true;
            }
          }),
          (invalidJson) => {
            try {
              expectValidJSON(invalidJson);
              fail('应该抛出错误');
            } catch (error) {
              expect(error).toBeInstanceOf(TerminalTestError);
              expect((error as TerminalTestError).type).toBe(TerminalTestErrorType.ASSERTION_FAILED);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 8: Stream-JSON Line Validity
   *
   * *For any* query executed with `--output-format stream-json`, each non-empty
   * line of output should be parseable as valid JSON.
   *
   * 这里我们测试 expectValidStreamJSON 函数的正确性：
   * - 对于任何有效的 NDJSON（换行分隔 JSON），应该成功解析所有行
   * - 对于任何包含无效行的输出，应该抛出错误
   *
   * **Validates: Requirements 3.3**
   */
  describe('Property 8: Stream-JSON Line Validity', () => {
    // 生成有效的 JSON 对象（用于 stream-json 的每一行）
    const jsonLineArb = fc.record({
      type: fc.constantFrom('message', 'tool_use', 'result', 'error'),
      content: fc.string({ minLength: 0, maxLength: 50 }),
      timestamp: fc.date().map((d) => d.toISOString()),
    });

    // 生成有效的 NDJSON（多行 JSON）
    const validNdjsonArb = fc
      .array(jsonLineArb, { minLength: 1, maxLength: 10 })
      .map((lines) => lines.map((line) => JSON.stringify(line)).join('\n'));

    it('对于任何有效的 NDJSON，expectValidStreamJSON 应该成功解析所有行', () => {
      fc.assert(
        fc.property(validNdjsonArb, (ndjson) => {
          const result = expectValidStreamJSON(ndjson);
          // 验证解析的行数
          const expectedLines = ndjson.split('\n').filter((line) => line.trim().length > 0);
          expect(result.length).toBe(expectedLines.length);
        }),
        { numRuns: 100 }
      );
    });

    it('对于带有空行的有效 NDJSON，expectValidStreamJSON 应该忽略空行', () => {
      fc.assert(
        fc.property(
          fc.array(jsonLineArb, { minLength: 1, maxLength: 5 }),
          fc.array(fc.constantFrom('', '  ', '\t', '   '), { minLength: 0, maxLength: 3 }),
          (jsonLines, emptyLines) => {
            // 交错插入空行
            const lines: string[] = [];
            for (let i = 0; i < jsonLines.length; i++) {
              if (i < emptyLines.length) {
                lines.push(emptyLines[i]);
              }
              lines.push(JSON.stringify(jsonLines[i]));
            }
            const ndjson = lines.join('\n');

            const result = expectValidStreamJSON(ndjson);
            expect(result.length).toBe(jsonLines.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('对于带有 ANSI 转义序列的 NDJSON，expectValidStreamJSON 应该成功解析', () => {
      fc.assert(
        fc.property(
          fc.array(jsonLineArb, { minLength: 1, maxLength: 5 }),
          (jsonLines) => {
            // 添加 ANSI 转义序列
            const ndjson = jsonLines
              .map((line) => `\x1b[32m${JSON.stringify(line)}\x1b[0m`)
              .join('\n');

            const result = expectValidStreamJSON(ndjson);
            expect(result.length).toBe(jsonLines.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('对于包含无效 JSON 行的输出，expectValidStreamJSON 应该抛出错误', () => {
      fc.assert(
        fc.property(
          fc.array(jsonLineArb, { minLength: 1, maxLength: 3 }),
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => {
            try {
              JSON.parse(s.trim());
              return false;
            } catch {
              return true;
            }
          }),
          fc.integer({ min: 0, max: 3 }),
          (validLines, invalidLine, insertIndex) => {
            // 在有效行中插入无效行
            const lines = validLines.map((line) => JSON.stringify(line));
            const actualIndex = Math.min(insertIndex, lines.length);
            lines.splice(actualIndex, 0, invalidLine);
            const ndjson = lines.join('\n');

            expect(() => expectValidStreamJSON(ndjson)).toThrow(TerminalTestError);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('对于空输出，expectValidStreamJSON 应该抛出错误', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('', '  ', '\n', '\n\n', '  \n  '),
          (emptyOutput) => {
            expect(() => expectValidStreamJSON(emptyOutput)).toThrow(TerminalTestError);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('expectValidStreamJSON 返回的数组应该保持原始顺序', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              index: fc.integer({ min: 0, max: 1000 }),
              data: fc.string({ minLength: 1, maxLength: 20 }),
            }),
            { minLength: 2, maxLength: 10 }
          ),
          (jsonLines) => {
            const ndjson = jsonLines.map((line) => JSON.stringify(line)).join('\n');
            const result = expectValidStreamJSON<{ index: number; data: string }>(ndjson);

            // 验证顺序保持不变
            for (let i = 0; i < result.length; i++) {
              expect(result[i].index).toBe(jsonLines[i].index);
              expect(result[i].data).toBe(jsonLines[i].data);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 9: Exit Code Correctness
   *
   * *For any* CLI execution, the exit code should be 0 for success, and match
   * the appropriate error code (1-5) for different failure types.
   *
   * 这里我们测试 expectExitCode 函数的正确性：
   * - 当实际退出码与预期相等时，应该返回 true
   * - 当实际退出码与预期不等时，应该抛出错误
   *
   * **Validates: Requirements 3.5, 3.6**
   */
  describe('Property 9: Exit Code Correctness', () => {
    // 有效的退出码范围
    const validExitCodeArb = fc.integer({ min: 0, max: 255 });

    it('当实际退出码与预期相等时，expectExitCode 应该返回 true', () => {
      fc.assert(
        fc.property(validExitCodeArb, (exitCode) => {
          const result = expectExitCode(exitCode, exitCode);
          expect(result).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('当实际退出码与预期不等时，expectExitCode 应该抛出 TerminalTestError', () => {
      fc.assert(
        fc.property(validExitCodeArb, validExitCodeArb, (actual, expected) => {
          fc.pre(actual !== expected);
          expect(() => expectExitCode(actual, expected)).toThrow(TerminalTestError);
        }),
        { numRuns: 100 }
      );
    });

    it('expectExitCode 抛出的错误应该包含实际和预期退出码', () => {
      fc.assert(
        fc.property(validExitCodeArb, validExitCodeArb, (actual, expected) => {
          fc.pre(actual !== expected);
          try {
            expectExitCode(actual, expected);
            fail('应该抛出错误');
          } catch (error) {
            expect(error).toBeInstanceOf(TerminalTestError);
            const message = (error as TerminalTestError).message;
            expect(message).toContain(String(actual));
            expect(message).toContain(String(expected));
          }
        }),
        { numRuns: 100 }
      );
    });

    it('ExitCodes 常量应该包含所有标准退出码', () => {
      // 验证 ExitCodes 常量的正确性
      expect(ExitCodes.SUCCESS).toBe(0);
      expect(ExitCodes.ERROR).toBe(1);
      expect(ExitCodes.CONFIG_ERROR).toBe(2);
      expect(ExitCodes.AUTH_ERROR).toBe(3);
      expect(ExitCodes.NETWORK_ERROR).toBe(4);
      expect(ExitCodes.TIMEOUT_ERROR).toBe(5);
    });

    it('对于所有标准退出码，expectExitCode 应该正确验证', () => {
      const standardExitCodes = [
        ExitCodes.SUCCESS,
        ExitCodes.ERROR,
        ExitCodes.CONFIG_ERROR,
        ExitCodes.AUTH_ERROR,
        ExitCodes.NETWORK_ERROR,
        ExitCodes.TIMEOUT_ERROR,
      ];

      fc.assert(
        fc.property(fc.constantFrom(...standardExitCodes), (exitCode) => {
          // 相等时应该通过
          expect(expectExitCode(exitCode, exitCode)).toBe(true);

          // 不相等时应该失败
          const otherCode = (exitCode + 1) % 6;
          if (otherCode !== exitCode) {
            expect(() => expectExitCode(exitCode, otherCode)).toThrow(TerminalTestError);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('expectExitCode 应该正确处理边界值', () => {
      // 测试边界值
      expect(expectExitCode(0, 0)).toBe(true);
      expect(expectExitCode(255, 255)).toBe(true);
      expect(() => expectExitCode(0, 255)).toThrow(TerminalTestError);
      expect(() => expectExitCode(255, 0)).toThrow(TerminalTestError);
    });

    it('expectExitCode 抛出的错误类型应该是 ASSERTION_FAILED', () => {
      fc.assert(
        fc.property(validExitCodeArb, validExitCodeArb, (actual, expected) => {
          fc.pre(actual !== expected);
          try {
            expectExitCode(actual, expected);
            fail('应该抛出错误');
          } catch (error) {
            expect(error).toBeInstanceOf(TerminalTestError);
            expect((error as TerminalTestError).type).toBe(TerminalTestErrorType.ASSERTION_FAILED);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
