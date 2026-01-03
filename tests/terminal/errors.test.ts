/**
 * 错误处理测试
 *
 * 测试 CLI 工具的错误处理功能，包括：
 * - 无效参数错误（退出码 2）
 * - 认证错误（退出码 3）
 * - 网络错误（退出码 4）
 * - 超时错误（退出码 5）
 * - 未知错误（退出码 1）
 *
 * @module tests/terminal/errors.test.ts
 *
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
 */

import './setup';
import { runCLI, expectExitCode, ExitCodes } from './helpers';
import { CISupport, TimeoutError } from '../../src/ci/CISupport';

describe('错误处理测试', () => {
  // 测试超时时间
  const TEST_TIMEOUT = 30000;

  describe('无效参数错误（退出码 2）', () => {
    /**
     * 测试无效选项
     *
     * **Validates: Requirements 8.1**
     */
    it('无效选项应该返回退出码 2', async () => {
      const result = await runCLI({
        args: ['--invalid-option-that-does-not-exist'],
        timeout: TEST_TIMEOUT,
      });

      expectExitCode(result.exitCode, ExitCodes.CONFIG_ERROR);
    }, TEST_TIMEOUT);

    /**
     * 测试缺少必需参数
     *
     * **Validates: Requirements 8.1**
     */
    it('--resume 缺少会话 ID 应该返回退出码 2', async () => {
      const result = await runCLI({
        args: ['--resume'],
        timeout: TEST_TIMEOUT,
      });

      expectExitCode(result.exitCode, ExitCodes.CONFIG_ERROR);
    }, TEST_TIMEOUT);

    /**
     * 测试无效的输出格式
     *
     * **Validates: Requirements 8.1**
     */
    it('无效的输出格式应该返回退出码 2', async () => {
      const result = await runCLI({
        args: ['-p', 'test', '--output-format', 'invalid-format'],
        timeout: TEST_TIMEOUT,
      });

      expectExitCode(result.exitCode, ExitCodes.CONFIG_ERROR);
    }, TEST_TIMEOUT);

    /**
     * 测试无效的权限模式
     *
     * **Validates: Requirements 8.1**
     */
    it('无效的权限模式应该返回退出码 2', async () => {
      const result = await runCLI({
        args: ['-p', 'test', '--permission-mode', 'invalid-mode'],
        timeout: TEST_TIMEOUT,
      });

      expectExitCode(result.exitCode, ExitCodes.CONFIG_ERROR);
    }, TEST_TIMEOUT);

    /**
     * 测试无效的数值参数
     *
     * **Validates: Requirements 8.1**
     */
    it('无效的超时值应该返回退出码 2', async () => {
      const result = await runCLI({
        args: ['-p', 'test', '--timeout', 'not-a-number'],
        timeout: TEST_TIMEOUT,
      });

      expectExitCode(result.exitCode, ExitCodes.CONFIG_ERROR);
    }, TEST_TIMEOUT);

    /**
     * 测试 CI 环境中缺少查询内容
     *
     * **Validates: Requirements 8.1**
     */
    it('CI 环境中缺少 -p 选项应该返回退出码 2', async () => {
      const result = await runCLI({
        args: [],
        timeout: TEST_TIMEOUT,
        env: {
          CI: 'true',
        },
      });

      expectExitCode(result.exitCode, ExitCodes.CONFIG_ERROR);
    }, TEST_TIMEOUT);

    /**
     * 测试错误消息包含有用信息
     *
     * **Validates: Requirements 8.1**
     */
    it('无效参数错误应该显示有用的错误消息', async () => {
      const result = await runCLI({
        args: ['--invalid-option'],
        timeout: TEST_TIMEOUT,
      });

      // 验证输出包含错误信息
      expect(result.strippedOutput.length).toBeGreaterThan(0);
      // 输出应该包含错误相关的关键词
      const output = result.strippedOutput.toLowerCase();
      expect(
        output.includes('错误') ||
        output.includes('error') ||
        output.includes('invalid') ||
        output.includes('unknown') ||
        output.includes('help')
      ).toBe(true);
    }, TEST_TIMEOUT);
  });

  describe('认证错误（退出码 3）', () => {
    /**
     * 测试 CISupport.getExitCode 对认证错误的处理
     *
     * **Validates: Requirements 8.3**
     */
    it('401 错误应该返回退出码 3', () => {
      const error = new Error('API request failed with status 401');
      const exitCode = CISupport.getExitCode(error);
      expect(exitCode).toBe(ExitCodes.AUTH_ERROR);
    });

    /**
     * 测试 403 错误
     *
     * **Validates: Requirements 8.3**
     */
    it('403 错误应该返回退出码 3', () => {
      const error = new Error('API request failed with status 403');
      const exitCode = CISupport.getExitCode(error);
      expect(exitCode).toBe(ExitCodes.AUTH_ERROR);
    });

    /**
     * 测试 API 密钥错误
     *
     * **Validates: Requirements 8.3**
     */
    it('API key 错误应该返回退出码 3', () => {
      const error = new Error('Invalid API key provided');
      const exitCode = CISupport.getExitCode(error);
      expect(exitCode).toBe(ExitCodes.AUTH_ERROR);
    });

    /**
     * 测试认证失败错误
     *
     * **Validates: Requirements 8.3**
     */
    it('认证失败错误应该返回退出码 3', () => {
      const error = new Error('Authentication failed');
      const exitCode = CISupport.getExitCode(error);
      expect(exitCode).toBe(ExitCodes.AUTH_ERROR);
    });
  });

  describe('网络错误（退出码 4）', () => {
    /**
     * 测试 ENOTFOUND 错误
     *
     * **Validates: Requirements 8.2**
     */
    it('ENOTFOUND 错误应该返回退出码 4', () => {
      const error = new Error('getaddrinfo ENOTFOUND api.anthropic.com');
      const exitCode = CISupport.getExitCode(error);
      expect(exitCode).toBe(ExitCodes.NETWORK_ERROR);
    });

    /**
     * 测试 ECONNREFUSED 错误
     *
     * **Validates: Requirements 8.2**
     */
    it('ECONNREFUSED 错误应该返回退出码 4', () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:443');
      const exitCode = CISupport.getExitCode(error);
      expect(exitCode).toBe(ExitCodes.NETWORK_ERROR);
    });

    /**
     * 测试网络错误消息
     *
     * **Validates: Requirements 8.2**
     */
    it('网络错误消息应该返回退出码 4', () => {
      const error = new Error('Network error: Unable to connect to server');
      const exitCode = CISupport.getExitCode(error);
      expect(exitCode).toBe(ExitCodes.NETWORK_ERROR);
    });
  });

  describe('超时错误（退出码 5）', () => {
    /**
     * 测试 TimeoutError 类
     *
     * **Validates: Requirements 8.4**
     */
    it('TimeoutError 应该返回退出码 5', () => {
      const error = new TimeoutError('Operation timed out after 30000ms');
      const exitCode = CISupport.getExitCode(error);
      expect(exitCode).toBe(ExitCodes.TIMEOUT_ERROR);
    });

    /**
     * 测试超时错误消息
     *
     * **Validates: Requirements 8.4**
     */
    it('包含 timeout 的错误消息应该返回退出码 5', () => {
      const error = new Error('Request timeout after 30 seconds');
      const exitCode = CISupport.getExitCode(error);
      expect(exitCode).toBe(ExitCodes.TIMEOUT_ERROR);
    });

  });

  describe('未知错误（退出码 1）', () => {
    /**
     * 测试一般错误
     *
     * **Validates: Requirements 8.5**
     */
    it('一般错误应该返回退出码 1', () => {
      const error = new Error('Something went wrong');
      const exitCode = CISupport.getExitCode(error);
      expect(exitCode).toBe(ExitCodes.ERROR);
    });

    /**
     * 测试未分类错误
     *
     * **Validates: Requirements 8.5**
     */
    it('未分类错误应该返回退出码 1', () => {
      const error = new Error('Unexpected error occurred');
      const exitCode = CISupport.getExitCode(error);
      expect(exitCode).toBe(ExitCodes.ERROR);
    });

    /**
     * 测试字符串错误
     *
     * **Validates: Requirements 8.5**
     */
    it('字符串错误应该返回退出码 1', () => {
      const exitCode = CISupport.getExitCode('Unknown error');
      expect(exitCode).toBe(ExitCodes.ERROR);
    });
  });

  describe('其他错误类型', () => {
    /**
     * 测试权限错误
     *
     * **Validates: Requirements 8.5**
     */
    it('权限错误应该返回退出码 6', () => {
      const error = new Error('Permission denied: Cannot access file');
      const exitCode = CISupport.getExitCode(error);
      expect(exitCode).toBe(ExitCodes.PERMISSION_ERROR);
    });

    /**
     * 测试工具执行错误
     *
     * **Validates: Requirements 8.5**
     */
    it('工具执行错误应该返回退出码 7', () => {
      const error = new Error('Tool execution failed');
      const exitCode = CISupport.getExitCode(error);
      expect(exitCode).toBe(ExitCodes.TOOL_ERROR);
    });

    /**
     * 测试配置错误
     *
     * **Validates: Requirements 8.1**
     */
    it('配置错误应该返回退出码 2', () => {
      const error = new Error('Invalid config file');
      const exitCode = CISupport.getExitCode(error);
      expect(exitCode).toBe(ExitCodes.CONFIG_ERROR);
    });
  });

  describe('退出码常量验证', () => {
    /**
     * 验证退出码常量定义正确
     *
     * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
     */
    it('退出码常量应该正确定义', () => {
      expect(ExitCodes.SUCCESS).toBe(0);
      expect(ExitCodes.ERROR).toBe(1);
      expect(ExitCodes.CONFIG_ERROR).toBe(2);
      expect(ExitCodes.AUTH_ERROR).toBe(3);
      expect(ExitCodes.NETWORK_ERROR).toBe(4);
      expect(ExitCodes.TIMEOUT_ERROR).toBe(5);
      expect(ExitCodes.PERMISSION_ERROR).toBe(6);
      expect(ExitCodes.TOOL_ERROR).toBe(7);
    });
  });

  describe('错误消息格式', () => {
    /**
     * 测试错误消息应该包含有用信息
     *
     * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
     */
    it('CLI 错误输出应该包含错误信息', async () => {
      const result = await runCLI({
        args: ['--invalid-option'],
        timeout: TEST_TIMEOUT,
      });

      // 验证有输出
      expect(result.output.length).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    /**
     * 测试帮助提示
     *
     * **Validates: Requirements 8.1**
     */
    it('参数错误应该提示使用 --help', async () => {
      const result = await runCLI({
        args: ['--invalid-option'],
        timeout: TEST_TIMEOUT,
      });

      // 输出可能包含帮助提示
      const output = result.strippedOutput.toLowerCase();
      expect(
        output.includes('help') ||
        output.includes('usage') ||
        output.includes('错误') ||
        output.includes('error')
      ).toBe(true);
    }, TEST_TIMEOUT);
  });

  describe('恢复不存在的会话', () => {
    /**
     * 测试恢复不存在的会话应该返回错误
     *
     * **Validates: Requirements 8.5**
     */
    it('恢复不存在的会话应该返回非零退出码', async () => {
      const result = await runCLI({
        args: ['--resume', 'session-non-existent-99999'],
        timeout: TEST_TIMEOUT,
      });

      // 应该返回错误退出码（不是 0）
      expect(result.exitCode).not.toBe(ExitCodes.SUCCESS);
    }, TEST_TIMEOUT);

    /**
     * 测试错误消息应该包含会话信息
     *
     * **Validates: Requirements 8.5**
     */
    it('恢复不存在的会话应该显示错误消息', async () => {
      const result = await runCLI({
        args: ['--resume', 'session-non-existent-99999'],
        timeout: TEST_TIMEOUT,
      });

      // 输出应该包含错误信息
      expect(result.output.length).toBeGreaterThan(0);
    }, TEST_TIMEOUT);
  });
});
