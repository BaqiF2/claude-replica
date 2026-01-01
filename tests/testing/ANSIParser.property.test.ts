/**
 * ANSI 解析器属性测试
 *
 * 使用 fast-check 进行属性测试，验证 ANSIParser 的正确性
 *
 * **Property 3: ANSI Escape Sequence Parsing**
 * **Validates: Requirements 1.4**
 */

import * as fc from 'fast-check';
import { ANSIParser } from '../../src/testing/ANSIParser';

describe('ANSIParser Property Tests', () => {
  const parser = new ANSIParser();

  /**
   * Property 3: ANSI Escape Sequence Parsing
   *
   * *For any* string containing ANSI escape sequences, `ANSIParser.strip()`
   * should return a string with all escape sequences removed, and the
   * remaining text should be preserved exactly.
   *
   * **Validates: Requirements 1.4**
   */
  describe('Property 3: ANSI Escape Sequence Parsing', () => {
    // 生成随机 ANSI 转义序列
    const ansiEscapeArb = fc.oneof(
      // SGR 序列（样式/颜色）
      fc.array(fc.integer({ min: 0, max: 107 }), { minLength: 0, maxLength: 5 }).map((params) => {
        return `\x1b[${params.join(';')}m`;
      }),
      // 光标移动序列
      fc.integer({ min: 1, max: 100 }).map((n) => `\x1b[${n}A`), // 上移
      fc.integer({ min: 1, max: 100 }).map((n) => `\x1b[${n}B`), // 下移
      fc.integer({ min: 1, max: 100 }).map((n) => `\x1b[${n}C`), // 右移
      fc.integer({ min: 1, max: 100 }).map((n) => `\x1b[${n}D`), // 左移
      // 清屏序列
      fc.constant('\x1b[2J'),
      fc.constant('\x1b[K'),
      // 光标位置
      fc
        .tuple(fc.integer({ min: 1, max: 100 }), fc.integer({ min: 1, max: 100 }))
        .map(([row, col]) => `\x1b[${row};${col}H`)
    );

    // 生成不包含 ANSI 转义序列的纯文本
    const plainTextArb = fc.string().filter((s) => !parser.hasAnsi(s) && !s.includes('\x1b'));

    // 生成混合了 ANSI 序列和纯文本的字符串
    const mixedStringArb = fc
      .array(fc.oneof(plainTextArb, ansiEscapeArb), { minLength: 0, maxLength: 10 })
      .map((parts) => parts.join(''));

    it('strip() 应该移除所有 ANSI 转义序列', () => {
      fc.assert(
        fc.property(mixedStringArb, (input) => {
          const result = parser.strip(input);
          // 结果不应包含任何 ANSI 转义序列
          expect(parser.hasAnsi(result)).toBe(false);
          // 结果不应包含 ESC 字符
          expect(result.includes('\x1b')).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('strip() 应该保留原始文本内容', () => {
      fc.assert(
        fc.property(plainTextArb, (plainText) => {
          // 在纯文本周围添加 ANSI 序列
          const withAnsi = `\x1b[31m${plainText}\x1b[0m`;
          const result = parser.strip(withAnsi);
          // 结果应该等于原始纯文本
          expect(result).toBe(plainText);
        }),
        { numRuns: 100 }
      );
    });

    it('strip() 对纯文本应该是恒等操作', () => {
      fc.assert(
        fc.property(plainTextArb, (plainText) => {
          // 对不包含 ANSI 的文本，strip 应该返回相同的字符串
          const result = parser.strip(plainText);
          expect(result).toBe(plainText);
        }),
        { numRuns: 100 }
      );
    });

    it('strip() 应该是幂等的', () => {
      fc.assert(
        fc.property(mixedStringArb, (input) => {
          // strip(strip(x)) === strip(x)
          const once = parser.strip(input);
          const twice = parser.strip(once);
          expect(twice).toBe(once);
        }),
        { numRuns: 100 }
      );
    });

    it('parse() 后重组应该等于原始字符串', () => {
      fc.assert(
        fc.property(mixedStringArb, (input) => {
          const tokens = parser.parse(input);
          // 重组所有 token
          const reconstructed = tokens
            .map((token) => {
              if (token.type === 'text') {
                return token.content;
              } else {
                return token.raw || '';
              }
            })
            .join('');
          expect(reconstructed).toBe(input);
        }),
        { numRuns: 100 }
      );
    });

    it('parse() 的文本 token 连接应该等于 strip() 结果', () => {
      fc.assert(
        fc.property(mixedStringArb, (input) => {
          const tokens = parser.parse(input);
          // 只连接文本 token
          const textOnly = tokens
            .filter((token) => token.type === 'text')
            .map((token) => token.content)
            .join('');
          const stripped = parser.strip(input);
          expect(textOnly).toBe(stripped);
        }),
        { numRuns: 100 }
      );
    });

    it('extractText() 结果不应包含 ANSI 序列', () => {
      fc.assert(
        fc.property(mixedStringArb, (input) => {
          const result = parser.extractText(input);
          expect(parser.hasAnsi(result)).toBe(false);
          expect(result.includes('\x1b')).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('hasAnsi() 对纯文本应返回 false', () => {
      fc.assert(
        fc.property(plainTextArb, (plainText) => {
          expect(parser.hasAnsi(plainText)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('hasAnsi() 对包含 ANSI 的字符串应返回 true', () => {
      fc.assert(
        fc.property(ansiEscapeArb, plainTextArb, (ansi, text) => {
          const withAnsi = text + ansi;
          expect(parser.hasAnsi(withAnsi)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });
});
