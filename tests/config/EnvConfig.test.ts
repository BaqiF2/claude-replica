/**
 * 文件功能：EnvConfig 模块的单元测试
 */

import { EnvConfig, ENV_KEYS } from '../../src/config/EnvConfig';

describe('EnvConfig', () => {
  beforeEach(() => {
    // 清理环境变量
    delete process.env.CLAUDE_REPLICA_DEBUG;
    delete process.env.VAR1;
    delete process.env.VAR2;
    delete process.env.VAR3;
  });

  describe('getString', () => {
    it('应该返回环境变量值', () => {
      process.env.TEST_VAR = 'test_value';
      expect(EnvConfig.getString('TEST_VAR')).toBe('test_value');
    });

    it('当环境变量不存在时应该返回 undefined', () => {
      expect(EnvConfig.getString('NON_EXISTENT')).toBeUndefined();
    });

    it('应该返回默认值', () => {
      expect(EnvConfig.getString('NON_EXISTENT', 'default')).toBe('default');
    });
  });

  describe('getRequiredString', () => {
    it('应该返回环境变量值', () => {
      process.env.REQUIRED_VAR = 'required_value';
      expect(EnvConfig.getRequiredString('REQUIRED_VAR')).toBe('required_value');
    });

    it('当环境变量不存在时应该抛出错误', () => {
      expect(() => EnvConfig.getRequiredString('NON_EXISTENT')).toThrow();
    });
  });

  describe('getBoolean', () => {
    it('应该返回布尔值 true', () => {
      process.env.BOOL_VAR = 'true';
      expect(EnvConfig.getBoolean('BOOL_VAR')).toBe(true);
    });

    it('应该返回布尔值 false', () => {
      expect(EnvConfig.getBoolean('NON_EXISTENT', false)).toBe(false);
    });

    it('应该正确处理 "1"', () => {
      process.env.BOOL_VAR = '1';
      expect(EnvConfig.getBoolean('BOOL_VAR')).toBe(true);
    });
  });

  describe('getNumber', () => {
    it('应该返回数字值', () => {
      process.env.NUM_VAR = '123';
      expect(EnvConfig.getNumber('NUM_VAR')).toBe(123);
    });

    it('应该返回默认值', () => {
      expect(EnvConfig.getNumber('NON_EXISTENT', 42)).toBe(42);
    });

    it('应该返回 NaN 当值无效时', () => {
      process.env.INVALID_NUM = 'abc';
      expect(EnvConfig.getNumber('INVALID_NUM', 42)).toBe(42);
    });
  });

  describe('has', () => {
    it('当环境变量存在时应该返回 true', () => {
      process.env.EXISTS = 'value';
      expect(EnvConfig.has('EXISTS')).toBe(true);
    });

    it('当环境变量不存在时应该返回 false', () => {
      expect(EnvConfig.has('NON_EXISTENT')).toBe(false);
    });
  });

  describe('isDebugMode', () => {
    it('当 CLAUDE_REPLICA_DEBUG=true 时应该返回 true', () => {
      process.env.CLAUDE_REPLICA_DEBUG = 'true';
      expect(EnvConfig.isDebugMode()).toBe(true);
    });

    it('当未设置时应该返回 false', () => {
      expect(EnvConfig.isDebugMode()).toBe(false);
    });
  });

  describe('getConfiguration', () => {
    it('应该返回完整的配置对象', () => {
      process.env.CLAUDE_REPLICA_DEBUG = 'true';

      const config = EnvConfig.getConfiguration();

      expect(config.debugMode).toBe(true);
    });
  });

  describe('validate', () => {
    it('当所有必需变量都存在时应该返回 valid: true', () => {
      process.env.VAR1 = 'value1';
      process.env.VAR2 = 'value2';

      const result = EnvConfig.validate(['VAR1', 'VAR2']);

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);

      delete process.env.VAR1;
      delete process.env.VAR2;
    });

    it('当有缺失变量时应该返回 valid: false 和缺失列表', () => {
      process.env.VAR1 = 'value1';

      const result = EnvConfig.validate(['VAR1', 'VAR2', 'VAR3']);

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('VAR2');
      expect(result.missing).toContain('VAR3');

      delete process.env.VAR1;
    });
  });

  describe('printConfiguration', () => {
    it('应该返回格式化的配置字符串', () => {
      process.env.CLAUDE_REPLICA_DEBUG = 'true';

      const output = EnvConfig.printConfiguration();

      expect(output).toContain('环境配置');
      expect(output).toContain('调试模式');
    });
  });

  describe('ENV_KEYS', () => {
    it('应该包含所有核心环境变量键', () => {
      expect(ENV_KEYS.CLAUDE_REPLICA_DEBUG).toBe('CLAUDE_REPLICA_DEBUG');
    });
  });
});
