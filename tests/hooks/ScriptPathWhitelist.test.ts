/**
 * 文件功能：测试 Hook 脚本路径白名单验证功能
 *
 * 测试场景：
 * - 验证脚本路径在白名单内
 * - 使用默认白名单
 * - 白名单内和白名单外路径的处理
 * - 相对路径和绝对路径的转换
 *
 * _Requirements: Hook 脚本路径白名单_
 * _Scenarios: 验证脚本路径在白名单内, 使用默认白名单_
 * _TaskGroup: 6_
 */

import { HookManager, DEFAULT_SCRIPT_ALLOWED_PATHS } from '../../src/hooks/HookManager';
import * as path from 'path';

describe('ScriptPathWhitelist', () => {
  let hookManager: HookManager;
  const testCwd = '/project/root';

  beforeEach(() => {
    hookManager = new HookManager({
      workingDir: testCwd,
      debug: false,
    });
  });

  describe('DEFAULT_SCRIPT_ALLOWED_PATHS', () => {
    it('should have default whitelist paths defined', () => {
      expect(DEFAULT_SCRIPT_ALLOWED_PATHS).toBeDefined();
      expect(Array.isArray(DEFAULT_SCRIPT_ALLOWED_PATHS)).toBe(true);
      expect(DEFAULT_SCRIPT_ALLOWED_PATHS).toContain('./.claude/hooks');
      expect(DEFAULT_SCRIPT_ALLOWED_PATHS).toContain('./hooks');
    });
  });

  describe('validateScriptPath', () => {
    describe('with default whitelist', () => {
      it('should allow scripts in .claude/hooks directory', () => {
        const scriptPath = './.claude/hooks/my-hook.js';
        const result = hookManager.validateScriptPath(scriptPath, DEFAULT_SCRIPT_ALLOWED_PATHS, testCwd);
        expect(result.valid).toBe(true);
        expect(result.resolvedPath).toBe(path.join(testCwd, '.claude/hooks/my-hook.js'));
      });

      it('should allow scripts in hooks directory', () => {
        const scriptPath = './hooks/custom-hook.js';
        const result = hookManager.validateScriptPath(scriptPath, DEFAULT_SCRIPT_ALLOWED_PATHS, testCwd);
        expect(result.valid).toBe(true);
        expect(result.resolvedPath).toBe(path.join(testCwd, 'hooks/custom-hook.js'));
      });

      it('should reject scripts outside whitelist directories', () => {
        const scriptPath = './src/malicious.js';
        const result = hookManager.validateScriptPath(scriptPath, DEFAULT_SCRIPT_ALLOWED_PATHS, testCwd);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('not in allowed paths');
      });

      it('should reject scripts in parent directories', () => {
        const scriptPath = '../outside/hook.js';
        const result = hookManager.validateScriptPath(scriptPath, DEFAULT_SCRIPT_ALLOWED_PATHS, testCwd);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('not in allowed paths');
      });

      it('should reject absolute paths outside project', () => {
        const scriptPath = '/etc/malicious.js';
        const result = hookManager.validateScriptPath(scriptPath, DEFAULT_SCRIPT_ALLOWED_PATHS, testCwd);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('not in allowed paths');
      });
    });

    describe('with custom whitelist', () => {
      const customWhitelist = ['./custom-hooks', './.claude-replica/hooks'];

      it('should allow scripts in custom whitelist directories', () => {
        const scriptPath = './custom-hooks/my-hook.js';
        const result = hookManager.validateScriptPath(scriptPath, customWhitelist, testCwd);
        expect(result.valid).toBe(true);
      });

      it('should reject scripts not in custom whitelist', () => {
        const scriptPath = './hooks/hook.js';
        const result = hookManager.validateScriptPath(scriptPath, customWhitelist, testCwd);
        expect(result.valid).toBe(false);
      });
    });

    describe('path normalization', () => {
      it('should normalize relative paths correctly', () => {
        const scriptPath = './.claude/hooks/../hooks/hook.js';
        const result = hookManager.validateScriptPath(scriptPath, DEFAULT_SCRIPT_ALLOWED_PATHS, testCwd);
        expect(result.valid).toBe(true);
        expect(result.resolvedPath).toBe(path.join(testCwd, '.claude/hooks/hook.js'));
      });

      it('should handle absolute paths within allowed directories', () => {
        const absolutePath = path.join(testCwd, '.claude/hooks/hook.js');
        const result = hookManager.validateScriptPath(absolutePath, DEFAULT_SCRIPT_ALLOWED_PATHS, testCwd);
        expect(result.valid).toBe(true);
        expect(result.resolvedPath).toBe(absolutePath);
      });

      it('should handle nested subdirectories within allowed paths', () => {
        const scriptPath = './.claude/hooks/subdir/nested/hook.js';
        const result = hookManager.validateScriptPath(scriptPath, DEFAULT_SCRIPT_ALLOWED_PATHS, testCwd);
        expect(result.valid).toBe(true);
      });
    });

    describe('path traversal prevention', () => {
      it('should prevent path traversal attacks', () => {
        const scriptPath = './.claude/hooks/../../etc/passwd';
        const result = hookManager.validateScriptPath(scriptPath, DEFAULT_SCRIPT_ALLOWED_PATHS, testCwd);
        expect(result.valid).toBe(false);
      });

      it('should prevent encoded path traversal', () => {
        // Testing with actual path traversal, not URL encoding
        const scriptPath = './.claude/hooks/../../../etc/passwd';
        const result = hookManager.validateScriptPath(scriptPath, DEFAULT_SCRIPT_ALLOWED_PATHS, testCwd);
        expect(result.valid).toBe(false);
      });
    });

    describe('empty and edge cases', () => {
      it('should reject empty script path', () => {
        const result = hookManager.validateScriptPath('', DEFAULT_SCRIPT_ALLOWED_PATHS, testCwd);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('empty');
      });

      it('should reject with empty whitelist', () => {
        const scriptPath = './.claude/hooks/hook.js';
        const result = hookManager.validateScriptPath(scriptPath, [], testCwd);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('not in allowed paths');
      });

      it('should handle paths with special characters', () => {
        const scriptPath = './.claude/hooks/my-hook_v2.test.js';
        const result = hookManager.validateScriptPath(scriptPath, DEFAULT_SCRIPT_ALLOWED_PATHS, testCwd);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('executeScript with whitelist validation', () => {
    it('should reject script execution for paths outside whitelist', async () => {
      const scriptPath = './src/malicious.js';
      const context = {
        hook_event_name: 'PreToolUse' as const,
        cwd: testCwd,
      };

      const result = await hookManager.executeScript(
        scriptPath,
        context,
        'test-uuid',
        new AbortController().signal,
        DEFAULT_SCRIPT_ALLOWED_PATHS
      );

      expect(result.continue).toBe(true);
      expect(result.reason).toContain('not in allowed paths');
    });

    it('should allow script execution for paths within whitelist', async () => {
      // Note: This test verifies the path validation passes,
      // actual script execution would fail since file doesn't exist
      const scriptPath = './.claude/hooks/valid-hook.js';
      const context = {
        hook_event_name: 'PreToolUse' as const,
        cwd: testCwd,
      };

      const result = await hookManager.executeScript(
        scriptPath,
        context,
        'test-uuid',
        new AbortController().signal,
        DEFAULT_SCRIPT_ALLOWED_PATHS
      );

      // Script doesn't exist, but path validation should have passed
      // The error should be about file not found, not about whitelist
      expect(result.continue).toBe(true);
      // Should not contain whitelist error
      expect(result.reason || '').not.toContain('not in allowed paths');
    });
  });

  describe('getDefaultScriptAllowedPaths', () => {
    it('should return the default allowed paths', () => {
      const paths = hookManager.getDefaultScriptAllowedPaths();
      expect(paths).toEqual(DEFAULT_SCRIPT_ALLOWED_PATHS);
    });
  });
});
