/**
 * 环境变量配置管理器
 *
 * 统一管理项目中所有环境变量的读取和验证
 * 支持从 .env 文件和系统环境变量中加载配置
 *
 * @module EnvConfig
 */

/**
 * 环境变量配置接口
 */
export interface EnvConfiguration {
  /** 是否启用调试模式 */
  debugMode: boolean;
  /** 是否在 CI 环境中运行 */
  isCI: boolean;
  /** CI 环境类型 */
  ciEnvironment?: string;
}

/**
 * CI 环境信息接口
 */
export interface CIEnvironmentInfo {
  /** CI 平台名称 */
  platform: string;
  /** 仓库名称 */
  repository?: string;
  /** 工作流/流水线名称 */
  workflow?: string;
  /** 运行 ID */
  runId?: string;
  /** 运行编号 */
  runNumber?: string;
  /** 触发者 */
  actor?: string;
  /** Git 引用 */
  ref?: string;
  /** Git SHA */
  sha?: string;
}

/**
 * 环境变量名称常量
 */
export const ENV_KEYS = {
  // 核心配置
  CLAUDE_REPLICA_DEBUG: 'CLAUDE_REPLICA_DEBUG',

  // 通用 CI 标识
  CI: 'CI',
  CONTINUOUS_INTEGRATION: 'CONTINUOUS_INTEGRATION',

  // GitHub Actions
  GITHUB_ACTIONS: 'GITHUB_ACTIONS',
  GITHUB_REPOSITORY: 'GITHUB_REPOSITORY',
  GITHUB_WORKFLOW: 'GITHUB_WORKFLOW',
  GITHUB_RUN_ID: 'GITHUB_RUN_ID',
  GITHUB_RUN_NUMBER: 'GITHUB_RUN_NUMBER',
  GITHUB_ACTOR: 'GITHUB_ACTOR',
  GITHUB_REF: 'GITHUB_REF',
  GITHUB_SHA: 'GITHUB_SHA',

  // GitLab CI
  GITLAB_CI: 'GITLAB_CI',
  CI_PROJECT_NAME: 'CI_PROJECT_NAME',
  CI_PIPELINE_ID: 'CI_PIPELINE_ID',
  CI_JOB_NAME: 'CI_JOB_NAME',
  CI_COMMIT_REF_NAME: 'CI_COMMIT_REF_NAME',
  CI_COMMIT_SHA: 'CI_COMMIT_SHA',

  // Jenkins
  JENKINS_URL: 'JENKINS_URL',
  JOB_NAME: 'JOB_NAME',
  BUILD_NUMBER: 'BUILD_NUMBER',
  BUILD_URL: 'BUILD_URL',

  // CircleCI
  CIRCLECI: 'CIRCLECI',
  CIRCLE_PROJECT_REPONAME: 'CIRCLE_PROJECT_REPONAME',
  CIRCLE_BUILD_NUM: 'CIRCLE_BUILD_NUM',

  // 其他 CI 平台
  TRAVIS: 'TRAVIS',
  TF_BUILD: 'TF_BUILD',
  BITBUCKET_PIPELINE_UUID: 'BITBUCKET_PIPELINE_UUID',
  TEAMCITY_VERSION: 'TEAMCITY_VERSION',
  BUILDKITE: 'BUILDKITE',
  CODEBUILD_BUILD_ID: 'CODEBUILD_BUILD_ID',
  DRONE: 'DRONE',

  // MCP 相关
  GITHUB_TOKEN: 'GITHUB_TOKEN',
  DATABASE_URL: 'DATABASE_URL',
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
      throw new Error(`必需的环境变量 ${key} 未设置`);
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
   * 检查是否在 CI 环境中运行
   *
   * @returns 是否在 CI 环境中
   */
  static isCI(): boolean {
    return (
      this.getBoolean(ENV_KEYS.CI) ||
      this.getBoolean(ENV_KEYS.CONTINUOUS_INTEGRATION) ||
      this.has(ENV_KEYS.GITHUB_ACTIONS) ||
      this.has(ENV_KEYS.GITLAB_CI) ||
      this.has(ENV_KEYS.JENKINS_URL) ||
      this.has(ENV_KEYS.CIRCLECI) ||
      this.has(ENV_KEYS.TRAVIS) ||
      this.has(ENV_KEYS.TF_BUILD) ||
      this.has(ENV_KEYS.BITBUCKET_PIPELINE_UUID) ||
      this.has(ENV_KEYS.TEAMCITY_VERSION) ||
      this.has(ENV_KEYS.BUILDKITE) ||
      this.has(ENV_KEYS.CODEBUILD_BUILD_ID) ||
      this.has(ENV_KEYS.DRONE)
    );
  }

  /**
   * 检测 CI 环境类型
   *
   * @returns CI 环境名称
   */
  static detectCIEnvironment(): string | undefined {
    if (this.has(ENV_KEYS.GITHUB_ACTIONS)) return 'github-actions';
    if (this.has(ENV_KEYS.GITLAB_CI)) return 'gitlab-ci';
    if (this.has(ENV_KEYS.JENKINS_URL)) return 'jenkins';
    if (this.has(ENV_KEYS.CIRCLECI)) return 'circleci';
    if (this.has(ENV_KEYS.TRAVIS)) return 'travis';
    if (this.has(ENV_KEYS.TF_BUILD)) return 'azure-pipelines';
    if (this.has(ENV_KEYS.BITBUCKET_PIPELINE_UUID)) return 'bitbucket-pipelines';
    if (this.has(ENV_KEYS.TEAMCITY_VERSION)) return 'teamcity';
    if (this.has(ENV_KEYS.BUILDKITE)) return 'buildkite';
    if (this.has(ENV_KEYS.CODEBUILD_BUILD_ID)) return 'codebuild';
    if (this.has(ENV_KEYS.DRONE)) return 'drone';
    if (this.isCI()) return 'unknown-ci';
    return undefined;
  }

  /**
   * 获取 CI 环境详细信息
   *
   * @returns CI 环境信息对象
   */
  static getCIEnvironmentInfo(): CIEnvironmentInfo | undefined {
    const platform = this.detectCIEnvironment();
    if (!platform) return undefined;

    const info: CIEnvironmentInfo = { platform };

    switch (platform) {
      case 'github-actions':
        info.repository = this.getString(ENV_KEYS.GITHUB_REPOSITORY);
        info.workflow = this.getString(ENV_KEYS.GITHUB_WORKFLOW);
        info.runId = this.getString(ENV_KEYS.GITHUB_RUN_ID);
        info.runNumber = this.getString(ENV_KEYS.GITHUB_RUN_NUMBER);
        info.actor = this.getString(ENV_KEYS.GITHUB_ACTOR);
        info.ref = this.getString(ENV_KEYS.GITHUB_REF);
        info.sha = this.getString(ENV_KEYS.GITHUB_SHA);
        break;

      case 'gitlab-ci':
        info.repository = this.getString(ENV_KEYS.CI_PROJECT_NAME);
        info.workflow = this.getString(ENV_KEYS.CI_PIPELINE_ID);
        info.ref = this.getString(ENV_KEYS.CI_COMMIT_REF_NAME);
        info.sha = this.getString(ENV_KEYS.CI_COMMIT_SHA);
        break;

      case 'jenkins':
        info.workflow = this.getString(ENV_KEYS.JOB_NAME);
        info.runNumber = this.getString(ENV_KEYS.BUILD_NUMBER);
        break;

      case 'circleci':
        info.repository = this.getString(ENV_KEYS.CIRCLE_PROJECT_REPONAME);
        info.runNumber = this.getString(ENV_KEYS.CIRCLE_BUILD_NUM);
        break;
    }

    return info;
  }

  /**
   * 获取完整的环境配置
   *
   * @returns 环境配置对象
   */
  static getConfiguration(): EnvConfiguration {
    return {
      debugMode: this.isDebugMode(),
      isCI: this.isCI(),
      ciEnvironment: this.detectCIEnvironment(),
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
    const lines = [
      '环境配置:',
      `  调试模式: ${config.debugMode ? '启用' : '禁用'}`,
      `  CI 环境: ${config.isCI ? `是 (${config.ciEnvironment})` : '否'}`,
    ];
    return lines.join('\n');
  }
}
