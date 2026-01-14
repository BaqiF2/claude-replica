/**
 * 文件功能：环境变量配置管理模块，统一管理项目中所有环境变量的读取和验证
 *
 * 核心方法：
 * - getEnvConfig(): 获取环境变量配置
 * - isDebugMode(): 检查是否启用调试模式
 */

/**
 * 环境变量配置接口
 */
export interface EnvConfiguration {
  /** 是否启用调试模式 */
  debugMode: boolean;
}

/**
 * 环境变量名称常量
 */
export const ENV_KEYS = {
  // 核心配置
  CLAUDE_REPLICA_DEBUG: 'CLAUDE_REPLICA_DEBUG',
} as const;

/**
 * 环境变量配置管理器
 *
 * 提供统一的环境变量读取接口，支持类型转换和默认值
 */
export class EnvConfig {
  /**
   * 获取字符串类型的环境变量
   *
   * @param key - 环境变量名称
   * @param defaultValue - 默认值
   * @returns 环境变量值或默认值
   */
  static getString(key: string, defaultValue?: string): string | undefined {
    return process.env[key] ?? defaultValue;
  }

  /**
   * 获取必需的字符串类型环境变量
   *
   * @param key - 环境变量名称
   * @throws 如果环境变量未设置
   * @returns 环境变量值
   */
  static getRequiredString(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }

  /**
   * 获取布尔类型的环境变量
   *
   * @param key - 环境变量名称
   * @param defaultValue - 默认值
   * @returns 布尔值
   */
  static getBoolean(key: string, defaultValue = false): boolean {
    const value = process.env[key];
    if (value === undefined) {
      return defaultValue;
    }
    return value === 'true' || value === '1';
  }

  /**
   * 获取数字类型的环境变量
   *
   * @param key - 环境变量名称
   * @param defaultValue - 默认值
   * @returns 数字值或默认值
   */
  static getNumber(key: string, defaultValue?: number): number | undefined {
    const value = process.env[key];
    if (value === undefined) {
      return defaultValue;
    }
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * 检查环境变量是否存在
   *
   * @param key - 环境变量名称
   * @returns 是否存在
   */
  static has(key: string): boolean {
    return process.env[key] !== undefined;
  }

  /**
   * 检查是否启用调试模式
   *
   * @returns 是否启用调试模式
   */
  static isDebugMode(): boolean {
    return this.getBoolean(ENV_KEYS.CLAUDE_REPLICA_DEBUG);
  }

  /**
   * 获取完整的环境配置
   *
   * @returns 环境配置对象
   */
  static getConfiguration(): EnvConfiguration {
    return {
      debugMode: this.isDebugMode(),
    };
  }

  /**
   * 验证必需的环境变量是否已设置
   *
   * @param keys - 需要验证的环境变量名称列表
   * @returns 验证结果，包含缺失的变量列表
   */
  static validate(keys: string[]): { valid: boolean; missing: string[] } {
    const missing = keys.filter((key) => !this.has(key));
    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * 打印当前环境配置（隐藏敏感信息）
   *
   * @returns 格式化的配置字符串
   */
  static printConfiguration(): string {
    const config = this.getConfiguration();
    const lines = ['环境配置:', `  调试模式: ${config.debugMode ? '启用' : '禁用'}`];
    return lines.join('\n');
  }
}
