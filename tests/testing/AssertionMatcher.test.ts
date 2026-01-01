/**
 * 断言匹配器单元测试
 *
 * 测试 AssertionMatcher 类的核心功能
 * 包括各种匹配类型、ANSI 处理选项、差异输出生成等
 *
 * _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
 */

import { AssertionMatcher, createAssertionMatcher } from '../../src/testing/AssertionMatcher';

describe('AssertionMatcher', () => {
  let matcher: AssertionMatcher;

  beforeEach(() => {
    matcher = new AssertionMatcher();
  });

  describe('exactMatch()', () => {
    it('应该在字符串完全相等时返回 passed: true', () => {
      const result = matcher.exactMatch('Hello World', 'Hello World');
      expect(result.passed).toBe(true);
      expect(result.diff).toBeUndefined();
    });

    it('应该在字符串不等时返回 passed: false', () => {
      const result = matcher.exactMatch('Hello', 'World');
      expect(result.passed).toBe(false);
      expect(result.diff).toBeDefined();
    });

    it('应该处理空字符串', () => {
      expect(matcher.exactMatch('', '').passed).toBe(true);
      expect(matcher.exactMatch('', 'text').passed).toBe(false);
      expect(matcher.exactMatch('text', '').passed).toBe(false);
    });

    it('应该支持 ignoreCase 选项', () => {
      const result = matcher.exactMatch('HELLO', 'hello', { ignoreCase: true });
      expect(result.passed).toBe(true);
    });

    it('应该支持 ignoreWhitespace 选项', () => {
      const result = matcher.exactMatch('Hello  World', 'Hello World', { ignoreWhitespace: true });
      expect(result.passed).toBe(true);
    });

    it('应该处理多行文本', () => {
      const actual = 'Line 1\nLine 2\nLine 3';
      const expected = 'Line 1\nLine 2\nLine 3';
      expect(matcher.exactMatch(actual, expected).passed).toBe(true);
    });

    it('应该检测多行文本差异', () => {
      const actual = 'Line 1\nLine 2\nLine 3';
      const expected = 'Line 1\nLine X\nLine 3';
      const result = matcher.exactMatch(actual, expected);
      expect(result.passed).toBe(false);
      expect(result.diff).toContain('Line 2');
      expect(result.diff).toContain('Line X');
    });
  });

  describe('containsMatch()', () => {
    it('应该在包含子串时返回 passed: true', () => {
      const result = matcher.containsMatch('Hello World', 'World');
      expect(result.passed).toBe(true);
    });

    it('应该在不包含子串时返回 passed: false', () => {
      const result = matcher.containsMatch('Hello World', 'Foo');
      expect(result.passed).toBe(false);
      expect(result.message).toContain('未找到预期子串');
    });

    it('应该处理空字符串', () => {
      expect(matcher.containsMatch('Hello', '').passed).toBe(true);
      expect(matcher.containsMatch('', 'text').passed).toBe(false);
    });

    it('应该支持 ignoreCase 选项', () => {
      const result = matcher.containsMatch('Hello World', 'WORLD', { ignoreCase: true });
      expect(result.passed).toBe(true);
    });

    it('应该匹配多行文本中的子串', () => {
      const actual = 'Line 1\nLine 2\nLine 3';
      expect(matcher.containsMatch(actual, 'Line 2').passed).toBe(true);
    });
  });

  describe('regexMatch()', () => {
    it('应该在匹配正则时返回 passed: true', () => {
      const result = matcher.regexMatch('Hello World', /World/);
      expect(result.passed).toBe(true);
    });

    it('应该在不匹配正则时返回 passed: false', () => {
      const result = matcher.regexMatch('Hello World', /Foo/);
      expect(result.passed).toBe(false);
    });

    it('应该支持复杂正则表达式', () => {
      expect(matcher.regexMatch('user@example.com', /\w+@\w+\.\w+/).passed).toBe(true);
      expect(matcher.regexMatch('Error: 404', /Error: \d+/).passed).toBe(true);
    });

    it('应该支持 ignoreCase 选项', () => {
      const result = matcher.regexMatch('Hello World', /world/, { ignoreCase: true });
      expect(result.passed).toBe(true);
    });

    it('应该处理带标志的正则', () => {
      expect(matcher.regexMatch('Hello\nWorld', /hello.*world/is).passed).toBe(true);
    });

    it('应该匹配多行文本', () => {
      const actual = 'Line 1\nLine 2\nLine 3';
      expect(matcher.regexMatch(actual, /Line \d/g).passed).toBe(true);
    });
  });

  describe('jsonMatch()', () => {
    it('应该在 JSON 对象相等时返回 passed: true', () => {
      const actual = '{"name": "test", "value": 123}';
      const expected = { name: 'test', value: 123 };
      const result = matcher.jsonMatch(actual, expected);
      expect(result.passed).toBe(true);
    });

    it('应该在 JSON 对象不等时返回 passed: false', () => {
      const actual = '{"name": "test", "value": 123}';
      const expected = { name: 'test', value: 456 };
      const result = matcher.jsonMatch(actual, expected);
      expect(result.passed).toBe(false);
      expect(result.diff).toBeDefined();
    });

    it('应该处理无效 JSON', () => {
      const result = matcher.jsonMatch('not json', { key: 'value' });
      expect(result.passed).toBe(false);
      expect(result.message).toContain('JSON 解析失败');
    });

    it('应该处理嵌套对象', () => {
      const actual = '{"user": {"name": "test", "age": 25}}';
      const expected = { user: { name: 'test', age: 25 } };
      expect(matcher.jsonMatch(actual, expected).passed).toBe(true);
    });

    it('应该处理数组', () => {
      const actual = '[1, 2, 3]';
      const expected = [1, 2, 3];
      expect(matcher.jsonMatch(actual, expected).passed).toBe(true);
    });

    it('应该检测数组差异', () => {
      const actual = '[1, 2, 3]';
      const expected = [1, 2, 4];
      expect(matcher.jsonMatch(actual, expected).passed).toBe(false);
    });

    it('应该处理 null 值', () => {
      const actual = '{"value": null}';
      const expected = { value: null };
      expect(matcher.jsonMatch(actual, expected).passed).toBe(true);
    });

    it('应该处理布尔值', () => {
      const actual = '{"active": true, "deleted": false}';
      const expected = { active: true, deleted: false };
      expect(matcher.jsonMatch(actual, expected).passed).toBe(true);
    });
  });

  describe('jsonSchemaMatch()', () => {
    const simpleSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer', minimum: 0 },
      },
      required: ['name', 'age'],
    };

    it('应该在符合 schema 时返回 passed: true', () => {
      const actual = '{"name": "test", "age": 25}';
      const result = matcher.jsonSchemaMatch(actual, simpleSchema);
      expect(result.passed).toBe(true);
    });

    it('应该在不符合 schema 时返回 passed: false', () => {
      const actual = '{"name": 123, "age": "invalid"}';
      const result = matcher.jsonSchemaMatch(actual, simpleSchema);
      expect(result.passed).toBe(false);
      expect(result.message).toContain('JSON Schema 验证失败');
    });

    it('应该检测缺少必需字段', () => {
      const actual = '{"name": "test"}';
      const result = matcher.jsonSchemaMatch(actual, simpleSchema);
      expect(result.passed).toBe(false);
    });

    it('应该处理无效 JSON', () => {
      const result = matcher.jsonSchemaMatch('not json', simpleSchema);
      expect(result.passed).toBe(false);
      expect(result.message).toContain('JSON 解析失败');
    });

    it('应该支持复杂 schema', () => {
      const complexSchema = {
        type: 'object',
        properties: {
          users: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                email: { type: 'string', format: 'email' },
              },
              required: ['id'],
            },
          },
        },
      };

      const validJson = '{"users": [{"id": 1, "email": "test@example.com"}]}';
      expect(matcher.jsonSchemaMatch(validJson, complexSchema).passed).toBe(true);

      const invalidJson = '{"users": [{"email": "test@example.com"}]}';
      expect(matcher.jsonSchemaMatch(invalidJson, complexSchema).passed).toBe(false);
    });

    it('应该验证数值范围', () => {
      const rangeSchema = {
        type: 'object',
        properties: {
          score: { type: 'number', minimum: 0, maximum: 100 },
        },
      };

      expect(matcher.jsonSchemaMatch('{"score": 50}', rangeSchema).passed).toBe(true);
      expect(matcher.jsonSchemaMatch('{"score": -1}', rangeSchema).passed).toBe(false);
      expect(matcher.jsonSchemaMatch('{"score": 101}', rangeSchema).passed).toBe(false);
    });
  });

  describe('assert()', () => {
    it('应该根据类型分发到正确的匹配方法', () => {
      // exact
      expect(
        matcher.assert('test', { type: 'exact', expected: 'test' }).passed
      ).toBe(true);

      // contains
      expect(
        matcher.assert('hello world', { type: 'contains', expected: 'world' }).passed
      ).toBe(true);

      // regex
      expect(
        matcher.assert('test123', { type: 'regex', expected: /\d+/ }).passed
      ).toBe(true);

      // json
      expect(
        matcher.assert('{"key": "value"}', { type: 'json', expected: { key: 'value' } }).passed
      ).toBe(true);

      // jsonSchema
      expect(
        matcher.assert('{"name": "test"}', {
          type: 'jsonSchema',
          expected: { type: 'object', properties: { name: { type: 'string' } } },
        }).passed
      ).toBe(true);
    });

    it('应该支持 stripAnsi 选项', () => {
      const withAnsi = '\x1b[31mHello\x1b[0m';
      const result = matcher.assert(withAnsi, {
        type: 'exact',
        expected: 'Hello',
        stripAnsi: true,
      });
      expect(result.passed).toBe(true);
    });

    it('应该支持 ignoreWhitespace 选项', () => {
      const result = matcher.assert('Hello   World', {
        type: 'exact',
        expected: 'Hello World',
        ignoreWhitespace: true,
      });
      expect(result.passed).toBe(true);
    });

    it('应该处理未知匹配类型', () => {
      const result = matcher.assert('test', {
        type: 'unknown' as 'exact',
        expected: 'test',
      });
      expect(result.passed).toBe(false);
      expect(result.message).toContain('未知的匹配类型');
    });
  });

  describe('ANSI 处理', () => {
    it('stripAnsi: true 应该去除 ANSI 后比较', () => {
      const withAnsi = '\x1b[1;31mError:\x1b[0m Something went wrong';
      const result = matcher.assert(withAnsi, {
        type: 'exact',
        expected: 'Error: Something went wrong',
        stripAnsi: true,
      });
      expect(result.passed).toBe(true);
    });

    it('stripAnsi: false 应该保留 ANSI 比较', () => {
      const withAnsi = '\x1b[31mRed\x1b[0m';
      const result = matcher.assert(withAnsi, {
        type: 'exact',
        expected: 'Red',
        stripAnsi: false,
      });
      expect(result.passed).toBe(false);
    });

    it('stripAnsi 应该影响 contains 匹配', () => {
      const withAnsi = '\x1b[32mSuccess:\x1b[0m Operation completed';
      expect(
        matcher.assert(withAnsi, {
          type: 'contains',
          expected: 'Success:',
          stripAnsi: true,
        }).passed
      ).toBe(true);
    });

    it('stripAnsi 应该影响 regex 匹配', () => {
      const withAnsi = '\x1b[33mWarning:\x1b[0m Code 123';
      expect(
        matcher.assert(withAnsi, {
          type: 'regex',
          expected: /Warning:.*\d+/,
          stripAnsi: true,
        }).passed
      ).toBe(true);
    });
  });

  describe('差异输出生成', () => {
    it('generateDiff 应该生成行级差异', () => {
      const actual = 'Line 1\nLine 2\nLine 3';
      const expected = 'Line 1\nLine X\nLine 3';
      const diff = matcher.generateDiff(actual, expected);

      expect(diff).toContain('Line 2');
      expect(diff).toContain('Line X');
    });

    it('generateDiff 应该标记添加和删除', () => {
      const actual = 'Added line\nSame line';
      const expected = 'Same line';
      const diff = matcher.generateDiff(actual, expected);

      expect(diff).toContain('+');
    });

    it('generateCharDiff 应该生成字符级差异', () => {
      const actual = 'Hello World';
      const expected = 'Hello Warld';
      const diff = matcher.generateCharDiff(actual, expected);

      expect(diff).toContain('[+o]');
      expect(diff).toContain('[-a]');
    });

    it('exactMatch 失败时应该包含差异', () => {
      const result = matcher.exactMatch('actual', 'expected');
      expect(result.passed).toBe(false);
      expect(result.diff).toBeDefined();
    });

    it('jsonMatch 失败时应该包含差异', () => {
      const result = matcher.jsonMatch('{"a": 1}', { a: 2 });
      expect(result.passed).toBe(false);
      expect(result.diff).toBeDefined();
    });
  });

  describe('createAssertionMatcher()', () => {
    it('应该创建 AssertionMatcher 实例', () => {
      const instance = createAssertionMatcher();
      expect(instance).toBeInstanceOf(AssertionMatcher);
    });

    it('创建的实例应该正常工作', () => {
      const instance = createAssertionMatcher();
      expect(instance.exactMatch('test', 'test').passed).toBe(true);
    });
  });
});
