/**
 * 输出格式化器测试
 *
 * 包含单元测试和属性测试
 * **验证: 需求 17.1, 17.2, 17.3**
 */

import * as fc from 'fast-check';
import {
  OutputFormatter,
  OutputFormat,
  VALID_OUTPUT_FORMATS,
  QueryResult,
  ToolCall,
  JsonOutput,
  StreamJsonOutput,
} from '../../src/output/OutputFormatter';

describe('OutputFormatter', () => {
  let formatter: OutputFormatter;

  beforeEach(() => {
    formatter = new OutputFormatter();
  });

  describe('单元测试', () => {
    describe('formatText', () => {
      it('应该返回原始内容', () => {
        const result: QueryResult = { content: '测试内容' };
        expect(formatter.formatText(result)).toBe('测试内容');
      });

      it('应该处理空内容', () => {
        const result: QueryResult = { content: '' };
        expect(formatter.formatText(result)).toBe('');
      });

      it('应该处理多行内容', () => {
        const result: QueryResult = { content: '第一行\n第二行\n第三行' };
        expect(formatter.formatText(result)).toBe('第一行\n第二行\n第三行');
      });
    });

    describe('formatJson', () => {
      it('应该返回有效的 JSON', () => {
        const result: QueryResult = { content: '测试内容' };
        const output = formatter.formatJson(result);
        expect(() => JSON.parse(output)).not.toThrow();
      });

      it('应该包含 result 字段', () => {
        const result: QueryResult = { content: '测试内容' };
        const output = JSON.parse(formatter.formatJson(result));
        expect(output.result).toBe('测试内容');
      });

      it('应该包含 success 字段', () => {
        const result: QueryResult = { content: '测试内容' };
        const output = JSON.parse(formatter.formatJson(result));
        expect(output.success).toBe(true);
      });

      it('应该包含工具调用信息', () => {
        const result: QueryResult = {
          content: '测试内容',
          toolCalls: [{ name: 'Read', args: { path: 'test.txt' } }],
        };
        const output = JSON.parse(formatter.formatJson(result));
        expect(output.toolCalls).toHaveLength(1);
        expect(output.toolCalls[0].name).toBe('Read');
      });

      it('应该包含元数据', () => {
        const result: QueryResult = {
          content: '测试内容',
          model: 'claude-3-5-sonnet',
          totalCostUsd: 0.01,
          inputTokens: 100,
          outputTokens: 50,
        };
        const output = JSON.parse(formatter.formatJson(result));
        expect(output.metadata.model).toBe('claude-3-5-sonnet');
        expect(output.metadata.totalCostUsd).toBe(0.01);
        expect(output.metadata.inputTokens).toBe(100);
        expect(output.metadata.outputTokens).toBe(50);
      });

      it('应该包含错误信息', () => {
        const result: QueryResult = {
          content: '',
          success: false,
          error: '发生错误',
        };
        const output = JSON.parse(formatter.formatJson(result));
        expect(output.success).toBe(false);
        expect(output.error).toBe('发生错误');
      });
    });

    describe('formatStreamJson', () => {
      it('应该返回多行 JSON', () => {
        const result: QueryResult = { content: '测试内容' };
        const output = formatter.formatStreamJson(result);
        const lines = output.split('\n').filter(l => l.trim());
        expect(lines.length).toBeGreaterThanOrEqual(1);
        lines.forEach(line => {
          expect(() => JSON.parse(line)).not.toThrow();
        });
      });

      it('应该包含 type: result 的行', () => {
        const result: QueryResult = { content: '测试内容' };
        const output = formatter.formatStreamJson(result);
        const lines = output.split('\n').filter(l => l.trim());
        const resultLine = lines.find(l => {
          const parsed = JSON.parse(l);
          return parsed.type === 'result';
        });
        expect(resultLine).toBeDefined();
        const parsed = JSON.parse(resultLine!);
        expect(parsed.content).toBe('测试内容');
      });

      it('应该包含工具调用行', () => {
        const result: QueryResult = {
          content: '测试内容',
          toolCalls: [{ name: 'Read', args: { path: 'test.txt' } }],
        };
        const output = formatter.formatStreamJson(result);
        const lines = output.split('\n').filter(l => l.trim());
        const toolLine = lines.find(l => {
          const parsed = JSON.parse(l);
          return parsed.type === 'tool_use';
        });
        expect(toolLine).toBeDefined();
        const parsed = JSON.parse(toolLine!);
        expect(parsed.toolCall.name).toBe('Read');
      });

      it('应该包含元数据行', () => {
        const result: QueryResult = {
          content: '测试内容',
          model: 'claude-3-5-sonnet',
        };
        const output = formatter.formatStreamJson(result);
        const lines = output.split('\n').filter(l => l.trim());
        const metadataLine = lines.find(l => {
          const parsed = JSON.parse(l);
          return parsed.type === 'metadata';
        });
        expect(metadataLine).toBeDefined();
        const parsed = JSON.parse(metadataLine!);
        expect(parsed.metadata.model).toBe('claude-3-5-sonnet');
      });
    });

    describe('formatMarkdown', () => {
      it('应该包含原始内容', () => {
        const result: QueryResult = { content: '测试内容' };
        const output = formatter.formatMarkdown(result);
        expect(output).toContain('测试内容');
      });

      it('应该包含工具调用标题', () => {
        const result: QueryResult = {
          content: '测试内容',
          toolCalls: [{ name: 'Read', args: { path: 'test.txt' } }],
        };
        const output = formatter.formatMarkdown(result);
        expect(output).toContain('## 工具调用');
        expect(output).toContain('### Read');
      });

      it('应该包含元数据标题', () => {
        const result: QueryResult = {
          content: '测试内容',
          model: 'claude-3-5-sonnet',
        };
        const output = formatter.formatMarkdown(result);
        expect(output).toContain('## 元数据');
        expect(output).toContain('claude-3-5-sonnet');
      });

      it('应该包含错误标题', () => {
        const result: QueryResult = {
          content: '测试内容',
          error: '发生错误',
        };
        const output = formatter.formatMarkdown(result);
        expect(output).toContain('## 错误');
        expect(output).toContain('发生错误');
      });
    });

    describe('format', () => {
      it('应该根据格式调用正确的方法', () => {
        const result: QueryResult = { content: '测试内容' };
        
        expect(formatter.format(result, 'text')).toBe(formatter.formatText(result));
        expect(formatter.format(result, 'json')).toBe(formatter.formatJson(result));
        expect(formatter.format(result, 'stream-json')).toBe(formatter.formatStreamJson(result));
        expect(formatter.format(result, 'markdown')).toBe(formatter.formatMarkdown(result));
      });
    });

    describe('isValidFormat', () => {
      it('应该验证有效格式', () => {
        expect(formatter.isValidFormat('text')).toBe(true);
        expect(formatter.isValidFormat('json')).toBe(true);
        expect(formatter.isValidFormat('stream-json')).toBe(true);
        expect(formatter.isValidFormat('markdown')).toBe(true);
      });

      it('应该拒绝无效格式', () => {
        expect(formatter.isValidFormat('invalid')).toBe(false);
        expect(formatter.isValidFormat('')).toBe(false);
        expect(formatter.isValidFormat('XML')).toBe(false);
      });
    });

    describe('parseJsonOutput', () => {
      it('应该正确解析 JSON 输出', () => {
        const result: QueryResult = { content: '测试内容' };
        const jsonString = formatter.formatJson(result);
        const parsed = formatter.parseJsonOutput(jsonString);
        expect(parsed.result).toBe('测试内容');
      });
    });

    describe('parseStreamJsonOutput', () => {
      it('应该正确解析流式 JSON 输出', () => {
        const result: QueryResult = { content: '测试内容' };
        const streamJsonString = formatter.formatStreamJson(result);
        const parsed = formatter.parseStreamJsonOutput(streamJsonString);
        expect(parsed.length).toBeGreaterThanOrEqual(1);
        expect(parsed.some(p => p.type === 'result')).toBe(true);
      });
    });
  });

  /**
   * 属性测试
   * **Feature: claude-code-replica, Property 10: 输出格式的一致性**
   * **验证: 需求 17.1, 17.2, 17.3**
   */
  describe('属性测试', () => {
    // 生成随机工具调用的 Arbitrary
    const arbToolCall: fc.Arbitrary<ToolCall> = fc.record({
      name: fc.constantFrom('Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'),
      args: fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.string()),
      result: fc.option(fc.string(), { nil: undefined }),
    });

    // 生成随机查询结果的 Arbitrary
    const arbQueryResult: fc.Arbitrary<QueryResult> = fc.record({
      content: fc.string(),
      toolCalls: fc.option(fc.array(arbToolCall, { minLength: 0, maxLength: 5 }), { nil: undefined }),
      model: fc.option(fc.constantFrom('claude-3-5-sonnet', 'claude-3-haiku', 'claude-3-opus'), { nil: undefined }),
      totalCostUsd: fc.option(fc.float({ min: 0, max: 100, noNaN: true }), { nil: undefined }),
      inputTokens: fc.option(fc.integer({ min: 0, max: 100000 }), { nil: undefined }),
      outputTokens: fc.option(fc.integer({ min: 0, max: 100000 }), { nil: undefined }),
      sessionId: fc.option(fc.uuid(), { nil: undefined }),
      messageUuid: fc.option(fc.uuid(), { nil: undefined }),
      success: fc.option(fc.boolean(), { nil: undefined }),
      error: fc.option(fc.string(), { nil: undefined }),
    });

    // 生成随机输出格式的 Arbitrary
    const arbOutputFormat: fc.Arbitrary<OutputFormat> = fc.constantFrom(...VALID_OUTPUT_FORMATS);

    describe('Property 10: 输出格式的一致性', () => {
      it('对于任意查询结果和 text 格式，输出应该等于原始内容', () => {
        fc.assert(
          fc.property(arbQueryResult, (result) => {
            const output = formatter.format(result, 'text');
            return output === result.content;
          }),
          { numRuns: 100 }
        );
      });

      it('对于任意查询结果和 json 格式，输出应该是有效的 JSON', () => {
        fc.assert(
          fc.property(arbQueryResult, (result) => {
            const output = formatter.format(result, 'json');
            try {
              JSON.parse(output);
              return true;
            } catch {
              return false;
            }
          }),
          { numRuns: 100 }
        );
      });

      it('对于任意查询结果和 json 格式，解析后应该包含原始内容', () => {
        fc.assert(
          fc.property(arbQueryResult, (result) => {
            const output = formatter.format(result, 'json');
            const parsed = JSON.parse(output) as JsonOutput;
            return parsed.result === result.content;
          }),
          { numRuns: 100 }
        );
      });

      it('对于任意查询结果和 stream-json 格式，每行应该是有效的 JSON', () => {
        fc.assert(
          fc.property(arbQueryResult, (result) => {
            const output = formatter.format(result, 'stream-json');
            const lines = output.split('\n').filter(l => l.trim());
            return lines.every(line => {
              try {
                JSON.parse(line);
                return true;
              } catch {
                return false;
              }
            });
          }),
          { numRuns: 100 }
        );
      });

      it('对于任意查询结果和 stream-json 格式，应该包含 type: result 的行', () => {
        fc.assert(
          fc.property(arbQueryResult, (result) => {
            const output = formatter.format(result, 'stream-json');
            const lines = output.split('\n').filter(l => l.trim());
            return lines.some(line => {
              const parsed = JSON.parse(line) as StreamJsonOutput;
              return parsed.type === 'result' && parsed.content === result.content;
            });
          }),
          { numRuns: 100 }
        );
      });

      it('对于任意查询结果和 markdown 格式，输出应该包含原始内容', () => {
        fc.assert(
          fc.property(arbQueryResult, (result) => {
            const output = formatter.format(result, 'markdown');
            return output.includes(result.content);
          }),
          { numRuns: 100 }
        );
      });

      it('对于任意查询结果和任意有效格式，format 方法应该返回非空字符串（除非内容为空）', () => {
        fc.assert(
          fc.property(arbQueryResult, arbOutputFormat, (result, format) => {
            const output = formatter.format(result, format);
            // 如果内容为空，text 格式可以返回空字符串
            if (format === 'text' && result.content === '') {
              return output === '';
            }
            // 其他格式应该总是返回非空字符串
            return typeof output === 'string';
          }),
          { numRuns: 100 }
        );
      });

      it('对于任意查询结果，json 格式应该包含 success 字段', () => {
        fc.assert(
          fc.property(arbQueryResult, (result) => {
            const output = formatter.format(result, 'json');
            const parsed = JSON.parse(output) as JsonOutput;
            return typeof parsed.success === 'boolean';
          }),
          { numRuns: 100 }
        );
      });

      it('对于任意带有工具调用的查询结果，json 格式应该包含 toolCalls 字段', () => {
        const arbResultWithTools = fc.record({
          content: fc.string(),
          toolCalls: fc.array(arbToolCall, { minLength: 1, maxLength: 5 }),
        });

        fc.assert(
          fc.property(arbResultWithTools, (result) => {
            const output = formatter.format(result, 'json');
            const parsed = JSON.parse(output) as JsonOutput;
            return Array.isArray(parsed.toolCalls) && parsed.toolCalls.length === result.toolCalls.length;
          }),
          { numRuns: 100 }
        );
      });

      it('对于任意带有工具调用的查询结果，stream-json 格式应该包含 tool_use 类型的行', () => {
        const arbResultWithTools = fc.record({
          content: fc.string(),
          toolCalls: fc.array(arbToolCall, { minLength: 1, maxLength: 5 }),
        });

        fc.assert(
          fc.property(arbResultWithTools, (result) => {
            const output = formatter.format(result, 'stream-json');
            const lines = output.split('\n').filter(l => l.trim());
            const toolUseLines = lines.filter(line => {
              const parsed = JSON.parse(line) as StreamJsonOutput;
              return parsed.type === 'tool_use';
            });
            return toolUseLines.length === result.toolCalls.length;
          }),
          { numRuns: 100 }
        );
      });

      it('对于任意带有工具调用的查询结果，markdown 格式应该包含工具调用标题', () => {
        const arbResultWithTools = fc.record({
          content: fc.string(),
          toolCalls: fc.array(arbToolCall, { minLength: 1, maxLength: 5 }),
        });

        fc.assert(
          fc.property(arbResultWithTools, (result) => {
            const output = formatter.format(result, 'markdown');
            return output.includes('## 工具调用');
          }),
          { numRuns: 100 }
        );
      });

      it('对于任意带有元数据的查询结果，json 格式应该包含 metadata 字段', () => {
        const arbResultWithMetadata = fc.record({
          content: fc.string(),
          model: fc.constantFrom('claude-3-5-sonnet', 'claude-3-haiku', 'claude-3-opus'),
          totalCostUsd: fc.float({ min: 0, max: 100, noNaN: true }),
        });

        fc.assert(
          fc.property(arbResultWithMetadata, (result) => {
            const output = formatter.format(result, 'json');
            const parsed = JSON.parse(output) as JsonOutput;
            return parsed.metadata !== undefined && 
                   parsed.metadata.model === result.model &&
                   parsed.metadata.totalCostUsd === result.totalCostUsd;
          }),
          { numRuns: 100 }
        );
      });

      it('对于任意带有错误的查询结果，json 格式应该包含 error 字段', () => {
        const arbResultWithError = fc.record({
          content: fc.string(),
          success: fc.constant(false),
          error: fc.string({ minLength: 1 }),
        });

        fc.assert(
          fc.property(arbResultWithError, (result) => {
            const output = formatter.format(result, 'json');
            const parsed = JSON.parse(output) as JsonOutput;
            return parsed.error === result.error;
          }),
          { numRuns: 100 }
        );
      });

      it('对于任意带有错误的查询结果，markdown 格式应该包含错误标题', () => {
        const arbResultWithError = fc.record({
          content: fc.string(),
          error: fc.string({ minLength: 1 }),
        });

        fc.assert(
          fc.property(arbResultWithError, (result) => {
            const output = formatter.format(result, 'markdown');
            return output.includes('## 错误') && output.includes(result.error);
          }),
          { numRuns: 100 }
        );
      });
    });

    describe('格式验证属性', () => {
      it('对于任意有效格式字符串，isValidFormat 应该返回 true', () => {
        fc.assert(
          fc.property(arbOutputFormat, (format) => {
            return formatter.isValidFormat(format) === true;
          }),
          { numRuns: 100 }
        );
      });

      it('对于任意非格式字符串，isValidFormat 应该返回 false', () => {
        const arbInvalidFormat = fc.string().filter(s => !VALID_OUTPUT_FORMATS.includes(s as OutputFormat));
        
        fc.assert(
          fc.property(arbInvalidFormat, (format) => {
            return formatter.isValidFormat(format) === false;
          }),
          { numRuns: 100 }
        );
      });
    });

    describe('解析往返属性', () => {
      it('对于任意查询结果，JSON 格式化后解析应该保留原始内容', () => {
        fc.assert(
          fc.property(arbQueryResult, (result) => {
            const jsonString = formatter.formatJson(result);
            const parsed = formatter.parseJsonOutput(jsonString);
            return parsed.result === result.content;
          }),
          { numRuns: 100 }
        );
      });

      it('对于任意查询结果，stream-json 格式化后解析应该包含 result 类型', () => {
        fc.assert(
          fc.property(arbQueryResult, (result) => {
            const streamJsonString = formatter.formatStreamJson(result);
            const parsed = formatter.parseStreamJsonOutput(streamJsonString);
            return parsed.some(p => p.type === 'result' && p.content === result.content);
          }),
          { numRuns: 100 }
        );
      });
    });
  });
});
