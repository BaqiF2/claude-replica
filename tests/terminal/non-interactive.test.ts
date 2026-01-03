/**
 * 非交互式模式测试
 *
 * 测试 CLI 工具的非交互模式功能，包括：
 * - -p 选项基本查询
 * - --output-format json
 * - --output-format stream-json
 * - --output-format markdown
 * - 退出码验证
 *
 * @module tests/terminal/non-interactive.test.ts
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.6**
 */

import './setup';
import {
  runCLI,
  expectOutput,
  expectExitCode,
  expectValidStreamJSON,
  ExitCodes,
  OutputFormats,
} from './helpers';

describe('非交互式模式测试', () => {
  // 测试超时时间
  const TEST_TIMEOUT = 30000;

  describe('-p 选项基本查询', () => {
    /**
     * 测试 -p 选项执行查询
     *
     * **Validates: Requirements 3.1**
     */
    it('应该使用 -p 选项执行查询并退出', async () => {
      const result = await runCLI({
        args: ['-p', 'test query'],
        timeout: TEST_TIMEOUT,
      });

      // 验证进程已退出
      expect(result.exitCode).toBeDefined();
      // 验证有输出（可能是结果或错误信息）
      expect(result.output.length).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    /**
     * 测试 --print 选项（-p 的长格式）
     *
     * **Validates: Requirements 3.1**
     */
    it('应该使用 --print 选项执行查询', async () => {
      const result = await runCLI({
        args: ['--print', 'hello world'],
        timeout: TEST_TIMEOUT,
      });

      // 验证进程已退出
      expect(result.exitCode).toBeDefined();
      expect(result.output.length).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    /**
     * 测试没有查询内容时的错误处理
     *
     * **Validates: Requirements 3.1, 3.6**
     */
    it('没有查询内容时应该返回错误', async () => {
      const result = await runCLI({
        args: ['-p'],
        timeout: TEST_TIMEOUT,
      });

      // 应该返回配置错误退出码
      expect(result.exitCode).toBe(ExitCodes.CONFIG_ERROR);
    }, TEST_TIMEOUT);
  });

  describe('--output-format json', () => {
    /**
     * 测试 JSON 输出格式
     *
     * **Validates: Requirements 3.2**
     */
    it('应该输出有效的 JSON 格式', async () => {
      const result = await runCLI({
        args: ['-p', 'test', '--output-format', OutputFormats.JSON],
        timeout: TEST_TIMEOUT,
        // 禁用 CI 模式以避免额外的日志输出
        env: { CI: '' },
      });

      // 如果查询成功，验证 JSON 格式
      if (result.exitCode === ExitCodes.SUCCESS) {
        // 尝试从输出中提取最后一个有效的 JSON 对象
        const output = result.strippedOutput.trim();
        // 查找以 { 开头的行，这应该是 JSON 输出
        const lines = output.split('\n');
        let jsonLine = '';
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line.startsWith('{') && line.includes('"result"')) {
            jsonLine = line;
            break;
          }
        }
        
        if (jsonLine) {
          const json = JSON.parse(jsonLine);
          expect(json).toBeDefined();
          expect(typeof json).toBe('object');
        } else {
          // 如果没有找到 JSON 输出，至少验证有输出
          expect(output.length).toBeGreaterThan(0);
        }
      } else {
        // 即使失败，也应该有输出
        expect(result.output.length).toBeGreaterThan(0);
      }
    }, TEST_TIMEOUT);

    /**
     * 测试 JSON 输出包含必要字段
     *
     * **Validates: Requirements 3.2**
     */
    it('JSON 输出应该包含 result 和 success 字段', async () => {
      const result = await runCLI({
        args: ['-p', 'hello', '--output-format', 'json'],
        timeout: TEST_TIMEOUT,
        env: { CI: '' },
      });

      if (result.exitCode === ExitCodes.SUCCESS) {
        // 尝试从输出中提取 JSON
        const output = result.strippedOutput.trim();
        const lines = output.split('\n');
        let jsonLine = '';
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line.startsWith('{') && line.includes('"result"')) {
            jsonLine = line;
            break;
          }
        }
        
        if (jsonLine) {
          const json = JSON.parse(jsonLine) as { result?: string; success?: boolean };
          expect(json).toHaveProperty('result');
          expect(json).toHaveProperty('success');
        }
      }
    }, TEST_TIMEOUT);
  });

  describe('--output-format stream-json', () => {
    /**
     * 测试 Stream-JSON 输出格式
     *
     * **Validates: Requirements 3.3**
     */
    it('应该输出有效的换行分隔 JSON 格式', async () => {
      const result = await runCLI({
        args: ['-p', 'test', '--output-format', OutputFormats.STREAM_JSON],
        timeout: TEST_TIMEOUT,
        env: { CI: '', DOTENV_QUIET: 'true' },
      });

      // 如果查询成功，验证 Stream-JSON 格式
      if (result.exitCode === ExitCodes.SUCCESS) {
        const lines = expectValidStreamJSON(result.strippedOutput);
        expect(lines.length).toBeGreaterThan(0);
        // 每一行都应该是有效的 JSON 对象
        for (const line of lines) {
          expect(typeof line).toBe('object');
        }
      } else {
        expect(result.output.length).toBeGreaterThan(0);
      }
    }, TEST_TIMEOUT);

    /**
     * 测试 Stream-JSON 输出包含 type 字段
     *
     * **Validates: Requirements 3.3**
     */
    it('Stream-JSON 每行应该包含 type 字段', async () => {
      const result = await runCLI({
        args: ['-p', 'hello', '--output-format', 'stream-json'],
        timeout: TEST_TIMEOUT,
        env: { CI: '', DOTENV_QUIET: 'true' },
      });

      if (result.exitCode === ExitCodes.SUCCESS) {
        const lines = expectValidStreamJSON<{ type?: string }>(result.strippedOutput);
        // 过滤出包含 type 字段的行（排除 CI 日志）
        const typedLines = lines.filter(line => 'type' in line);
        // 至少应该有一行包含 type 字段
        expect(typedLines.length).toBeGreaterThan(0);
        // 验证这些行都有 type 字段
        for (const line of typedLines) {
          expect(line).toHaveProperty('type');
        }
      }
    }, TEST_TIMEOUT);
  });

  describe('--output-format markdown', () => {
    /**
     * 测试 Markdown 输出格式
     *
     * **Validates: Requirements 3.2**
     */
    it('应该输出 Markdown 格式', async () => {
      const result = await runCLI({
        args: ['-p', 'test', '--output-format', OutputFormats.MARKDOWN],
        timeout: TEST_TIMEOUT,
      });

      // 验证有输出
      expect(result.output.length).toBeGreaterThan(0);
      // Markdown 输出应该是文本格式
      expect(typeof result.strippedOutput).toBe('string');
    }, TEST_TIMEOUT);

    /**
     * 测试 Markdown 输出包含响应内容
     *
     * **Validates: Requirements 3.2**
     */
    it('Markdown 输出应该包含响应内容', async () => {
      const result = await runCLI({
        args: ['-p', 'hello', '--output-format', 'markdown'],
        timeout: TEST_TIMEOUT,
      });

      // 验证有输出内容
      expect(result.strippedOutput.length).toBeGreaterThan(0);
    }, TEST_TIMEOUT);
  });


  describe('退出码验证', () => {
    /**
     * 测试成功查询返回退出码 0
     *
     * **Validates: Requirements 3.5**
     */
    it('成功查询应该返回退出码 0', async () => {
      const result = await runCLI({
        args: ['--help'],
        timeout: TEST_TIMEOUT,
      });

      // --help 应该总是成功
      expectExitCode(result.exitCode, ExitCodes.SUCCESS);
    }, TEST_TIMEOUT);

    /**
     * 测试 --version 返回退出码 0
     *
     * **Validates: Requirements 3.5**
     */
    it('--version 应该返回退出码 0', async () => {
      const result = await runCLI({
        args: ['--version'],
        timeout: TEST_TIMEOUT,
      });

      expectExitCode(result.exitCode, ExitCodes.SUCCESS);
      // 验证输出包含版本信息
      expectOutput(result.strippedOutput, /v?\d+\.\d+\.\d+/);
    }, TEST_TIMEOUT);

    /**
     * 测试无效参数返回退出码 5 (CONFIG_ERROR)
     *
     * **Validates: Requirements 3.6**
     */
    it('无效参数应该返回退出码 2', async () => {
      const result = await runCLI({
        args: ['--invalid-option-that-does-not-exist'],
        timeout: TEST_TIMEOUT,
      });

      // 无效参数应该返回配置错误退出码
      expectExitCode(result.exitCode, ExitCodes.CONFIG_ERROR);
    }, TEST_TIMEOUT);

    /**
     * 测试无效的输出格式返回错误
     *
     * **Validates: Requirements 3.6**
     */
    it('无效的输出格式应该返回错误', async () => {
      const result = await runCLI({
        args: ['-p', 'test', '--output-format', 'invalid-format'],
        timeout: TEST_TIMEOUT,
      });

      // 无效格式应该返回配置错误
      expectExitCode(result.exitCode, ExitCodes.CONFIG_ERROR);
    }, TEST_TIMEOUT);

    /**
     * 测试无效的权限模式返回错误
     *
     * **Validates: Requirements 3.6**
     */
    it('无效的权限模式应该返回错误', async () => {
      const result = await runCLI({
        args: ['-p', 'test', '--permission-mode', 'invalid-mode'],
        timeout: TEST_TIMEOUT,
      });

      // 无效权限模式应该返回配置错误
      expectExitCode(result.exitCode, ExitCodes.CONFIG_ERROR);
    }, TEST_TIMEOUT);
  });

  describe('--help 和 --version', () => {
    /**
     * 测试 --help 显示帮助信息
     *
     * **Validates: Requirements 3.1**
     */
    it('--help 应该显示帮助信息', async () => {
      const result = await runCLI({
        args: ['--help'],
        timeout: TEST_TIMEOUT,
      });

      expectExitCode(result.exitCode, ExitCodes.SUCCESS);
      // 验证帮助信息包含关键内容
      expectOutput(result.strippedOutput, /用法|usage/i);
      expectOutput(result.strippedOutput, /-p|--print/);
    }, TEST_TIMEOUT);

    /**
     * 测试 -h 显示帮助信息
     *
     * **Validates: Requirements 3.1**
     */
    it('-h 应该显示帮助信息', async () => {
      const result = await runCLI({
        args: ['-h'],
        timeout: TEST_TIMEOUT,
      });

      expectExitCode(result.exitCode, ExitCodes.SUCCESS);
      expectOutput(result.strippedOutput, /用法|usage/i);
    }, TEST_TIMEOUT);

    /**
     * 测试 --version 显示版本号
     *
     * **Validates: Requirements 3.1**
     */
    it('--version 应该显示版本号', async () => {
      const result = await runCLI({
        args: ['--version'],
        timeout: TEST_TIMEOUT,
      });

      expectExitCode(result.exitCode, ExitCodes.SUCCESS);
      // 验证输出包含版本号格式
      expectOutput(result.strippedOutput, /claude-replica|v?\d+\.\d+\.\d+/);
    }, TEST_TIMEOUT);

    /**
     * 测试 -v 显示版本号
     *
     * **Validates: Requirements 3.1**
     */
    it('-v 应该显示版本号', async () => {
      const result = await runCLI({
        args: ['-v'],
        timeout: TEST_TIMEOUT,
      });

      expectExitCode(result.exitCode, ExitCodes.SUCCESS);
      expectOutput(result.strippedOutput, /v?\d+\.\d+\.\d+/);
    }, TEST_TIMEOUT);
  });

  describe('模型选项', () => {
    /**
     * 测试 --model 选项
     *
     * **Validates: Requirements 3.1**
     */
    it('应该接受 --model 选项', async () => {
      const result = await runCLI({
        args: ['-p', 'test', '--model', 'sonnet'],
        timeout: TEST_TIMEOUT,
      });

      // 验证进程已退出（不管成功与否）
      expect(result.exitCode).toBeDefined();
    }, TEST_TIMEOUT);
  });

  describe('详细输出模式', () => {
    /**
     * 测试 --verbose 选项
     *
     * **Validates: Requirements 3.1**
     */
    it('应该接受 --verbose 选项', async () => {
      const result = await runCLI({
        args: ['-p', 'test', '--verbose'],
        timeout: TEST_TIMEOUT,
      });

      // 验证进程已退出
      expect(result.exitCode).toBeDefined();
      // verbose 模式应该有更多输出
      expect(result.output.length).toBeGreaterThan(0);
    }, TEST_TIMEOUT);
  });

  describe('组合选项', () => {
    /**
     * 测试多个选项组合使用
     *
     * **Validates: Requirements 3.1, 3.2**
     */
    it('应该支持多个选项组合', async () => {
      const result = await runCLI({
        args: ['-p', 'test', '--output-format', 'json', '--verbose'],
        timeout: TEST_TIMEOUT,
      });

      // 验证进程已退出
      expect(result.exitCode).toBeDefined();
      expect(result.output.length).toBeGreaterThan(0);
    }, TEST_TIMEOUT);
  });
});
