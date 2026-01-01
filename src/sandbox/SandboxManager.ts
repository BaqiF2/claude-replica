/**
 * 沙箱管理器
 *
 * 负责管理沙箱配置、命令排除列表检查、网络沙箱设置和违规检测
 * 提供安全的执行环境，限制危险操作
 *
 * **验证: 需求 26.2, 26.5**
 *
 * @module SandboxManager
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  SandboxSettings,
  NetworkSandboxSettings,
  SandboxIgnoreViolations,
} from '../config/SDKConfigLoader';

// 重新导出类型
export { SandboxSettings, NetworkSandboxSettings, SandboxIgnoreViolations };

/**
 * 沙箱违规类型
 */
export type ViolationType = 'command' | 'network' | 'filesystem';

/**
 * 沙箱违规记录
 */
export interface SandboxViolation {
  /** 违规类型 */
  type: ViolationType;
  /** 违规描述 */
  description: string;
  /** 违规详情 */
  details: Record<string, unknown>;
  /** 时间戳 */
  timestamp: Date;
  /** 是否被忽略 */
  ignored: boolean;
}

/**
 * 命令检查结果
 */
export interface CommandCheckResult {
  /** 是否允许执行 */
  allowed: boolean;
  /** 拒绝原因（如果不允许） */
  reason?: string;
  /** 匹配的排除规则（如果有） */
  matchedRule?: string;
}

/**
 * 网络检查结果
 */
export interface NetworkCheckResult {
  /** 是否允许访问 */
  allowed: boolean;
  /** 拒绝原因（如果不允许） */
  reason?: string;
  /** 匹配的规则（如果有） */
  matchedRule?: string;
}

/**
 * 沙箱管理器配置
 */
export interface SandboxManagerConfig {
  /** 沙箱设置 */
  settings?: SandboxSettings;
  /** 违规处理回调 */
  onViolation?: (violation: SandboxViolation) => void | Promise<void>;
  /** 最大违规记录数 */
  maxViolationHistory?: number;
}

/**
 * 默认排除的危险命令列表
 */
const DEFAULT_EXCLUDED_COMMANDS: string[] = [
  // 系统破坏性命令
  'rm -rf /',
  'rm -rf /*',
  'rm -rf ~',
  'rm -rf ~/*',
  'rm -rf .',
  'rm -rf ./*',
  // 磁盘操作
  'dd if=/dev/zero',
  'dd if=/dev/random',
  'mkfs',
  'fdisk',
  'parted',
  // Fork bomb
  ':(){:|:&};:',
  ':(){ :|:& };:',
  // 权限提升
  'chmod -R 777 /',
  'chown -R',
  // 网络攻击
  'nc -l',
  'ncat -l',
  // 系统关机
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'init 0',
  'init 6',
  // 历史清除
  'history -c',
  // 环境变量破坏
  'unset PATH',
  'export PATH=',
];

/**
 * 默认阻止的网络域名
 */
const DEFAULT_BLOCKED_DOMAINS: string[] = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  // 内网地址
  '10.*',
  '172.16.*',
  '172.17.*',
  '172.18.*',
  '172.19.*',
  '172.20.*',
  '172.21.*',
  '172.22.*',
  '172.23.*',
  '172.24.*',
  '172.25.*',
  '172.26.*',
  '172.27.*',
  '172.28.*',
  '172.29.*',
  '172.30.*',
  '172.31.*',
  '192.168.*',
];

/**
 * 沙箱管理器
 *
 * 提供沙箱环境的配置和管理功能
 */
export class SandboxManager {
  /** 沙箱设置 */
  private settings: SandboxSettings;
  /** 违规处理回调 */
  private onViolation?: (violation: SandboxViolation) => void | Promise<void>;
  /** 违规历史记录 */
  private violationHistory: SandboxViolation[] = [];
  /** 最大违规记录数 */
  private readonly maxViolationHistory: number;

  constructor(config: SandboxManagerConfig = {}) {
    this.settings = config.settings || { enabled: false };
    this.onViolation = config.onViolation;
    this.maxViolationHistory = config.maxViolationHistory || 100;
  }

  /**
   * 从配置文件加载沙箱设置
   *
   * @param configPath - 配置文件路径
   * @returns 加载的沙箱设置
   */
  async loadConfig(configPath: string): Promise<SandboxSettings> {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);

      if (config.sandbox) {
        this.settings = this.validateAndNormalizeSettings(config.sandbox);
      }

      return this.settings;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // 配置文件不存在，使用默认设置
        return this.settings;
      }
      throw new Error(`加载沙箱配置失败: ${(error as Error).message}`);
    }
  }

  /**
   * 从目录加载沙箱配置
   *
   * @param directory - 项目目录
   * @returns 加载的沙箱设置
   */
  async loadFromDirectory(directory: string): Promise<SandboxSettings> {
    // 尝试多个可能的配置文件位置
    const possiblePaths = [
      path.join(directory, '.claude', 'settings.json'),
      path.join(directory, '.claude-replica', 'settings.json'),
      path.join(directory, 'sandbox.json'),
    ];

    for (const configPath of possiblePaths) {
      try {
        await fs.access(configPath);
        return this.loadConfig(configPath);
      } catch {
        // 文件不存在，继续尝试下一个
      }
    }

    // 没有找到配置文件，返回当前设置
    return this.settings;
  }

  /**
   * 验证并规范化沙箱设置
   *
   * @param settings - 原始设置
   * @returns 规范化后的设置
   */
  private validateAndNormalizeSettings(settings: SandboxSettings): SandboxSettings {
    return {
      enabled: settings.enabled ?? false,
      autoAllowBashIfSandboxed: settings.autoAllowBashIfSandboxed ?? false,
      excludedCommands: settings.excludedCommands || [],
      allowUnsandboxedCommands: settings.allowUnsandboxedCommands ?? false,
      network: this.normalizeNetworkSettings(settings.network),
      ignoreViolations: settings.ignoreViolations || {},
      enableWeakerNestedSandbox: settings.enableWeakerNestedSandbox ?? false,
    };
  }

  /**
   * 规范化网络设置
   */
  private normalizeNetworkSettings(network?: NetworkSandboxSettings): NetworkSandboxSettings {
    return {
      allowedDomains: network?.allowedDomains || [],
      blockedDomains: network?.blockedDomains || [],
    };
  }

  /**
   * 检查命令是否被排除（不允许执行）
   *
   * @param command - 要检查的命令
   * @returns 检查结果
   */
  checkCommand(command: string): CommandCheckResult {
    // 如果沙箱未启用，允许所有命令
    if (!this.settings.enabled) {
      return { allowed: true };
    }

    // 规范化命令（去除多余空格）
    const normalizedCommand = command.trim().replace(/\s+/g, ' ');

    // 检查用户配置的排除列表
    const userExcluded = this.settings.excludedCommands || [];
    for (const pattern of userExcluded) {
      if (this.matchCommandPattern(normalizedCommand, pattern)) {
        const violation = this.recordViolation('command', `命令被排除: ${command}`, {
          command,
          matchedPattern: pattern,
        });

        return {
          allowed: this.shouldIgnoreViolation(violation),
          reason: `命令匹配排除规则: ${pattern}`,
          matchedRule: pattern,
        };
      }
    }

    // 检查默认排除列表
    for (const pattern of DEFAULT_EXCLUDED_COMMANDS) {
      if (this.matchCommandPattern(normalizedCommand, pattern)) {
        const violation = this.recordViolation('command', `危险命令被阻止: ${command}`, {
          command,
          matchedPattern: pattern,
          isDefaultRule: true,
        });

        return {
          allowed: this.shouldIgnoreViolation(violation),
          reason: `命令匹配默认安全规则: ${pattern}`,
          matchedRule: pattern,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * 匹配命令模式
   *
   * @param command - 命令
   * @param pattern - 模式
   * @returns 是否匹配
   */
  private matchCommandPattern(command: string, pattern: string): boolean {
    // 精确匹配
    if (command === pattern) {
      return true;
    }

    // 前缀匹配（命令以模式开头）
    if (command.startsWith(pattern + ' ') || command.startsWith(pattern + '\t')) {
      return true;
    }

    // 包含匹配（命令包含模式）
    if (command.includes(pattern)) {
      return true;
    }

    // 通配符匹配
    if (pattern.includes('*')) {
      const regexPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(command);
    }

    return false;
  }

  /**
   * 检查网络访问是否被允许
   *
   * @param domain - 域名或 IP 地址
   * @returns 检查结果
   */
  checkNetwork(domain: string): NetworkCheckResult {
    // 如果沙箱未启用，允许所有网络访问
    if (!this.settings.enabled) {
      return { allowed: true };
    }

    const networkSettings = this.settings.network || {};

    // 检查白名单（如果设置了白名单，只允许白名单中的域名）
    if (networkSettings.allowedDomains && networkSettings.allowedDomains.length > 0) {
      const isAllowed = networkSettings.allowedDomains.some((pattern) =>
        this.matchDomainPattern(domain, pattern)
      );

      if (!isAllowed) {
        const violation = this.recordViolation('network', `域名不在白名单中: ${domain}`, {
          domain,
          allowedDomains: networkSettings.allowedDomains,
        });

        return {
          allowed: this.shouldIgnoreViolation(violation),
          reason: '域名不在允许列表中',
        };
      }

      return { allowed: true };
    }

    // 检查用户配置的黑名单
    if (networkSettings.blockedDomains) {
      for (const pattern of networkSettings.blockedDomains) {
        if (this.matchDomainPattern(domain, pattern)) {
          const violation = this.recordViolation('network', `域名被阻止: ${domain}`, {
            domain,
            matchedPattern: pattern,
          });

          return {
            allowed: this.shouldIgnoreViolation(violation),
            reason: `域名匹配阻止规则: ${pattern}`,
            matchedRule: pattern,
          };
        }
      }
    }

    // 检查默认阻止列表
    for (const pattern of DEFAULT_BLOCKED_DOMAINS) {
      if (this.matchDomainPattern(domain, pattern)) {
        const violation = this.recordViolation('network', `内网地址被阻止: ${domain}`, {
          domain,
          matchedPattern: pattern,
          isDefaultRule: true,
        });

        return {
          allowed: this.shouldIgnoreViolation(violation),
          reason: `域名匹配默认安全规则: ${pattern}`,
          matchedRule: pattern,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * 匹配域名模式
   *
   * @param domain - 域名
   * @param pattern - 模式
   * @returns 是否匹配
   */
  private matchDomainPattern(domain: string, pattern: string): boolean {
    // 精确匹配
    if (domain === pattern) {
      return true;
    }

    // 通配符匹配
    if (pattern.includes('*')) {
      const regexPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(domain);
    }

    // 子域名匹配（如 *.example.com 匹配 sub.example.com）
    if (pattern.startsWith('*.')) {
      const baseDomain = pattern.slice(2);
      return domain === baseDomain || domain.endsWith('.' + baseDomain);
    }

    return false;
  }

  /**
   * 记录违规
   *
   * @param type - 违规类型
   * @param description - 描述
   * @param details - 详情
   * @returns 违规记录
   */
  private recordViolation(
    type: ViolationType,
    description: string,
    details: Record<string, unknown>
  ): SandboxViolation {
    const violation: SandboxViolation = {
      type,
      description,
      details,
      timestamp: new Date(),
      ignored: this.shouldIgnoreViolationType(type),
    };

    // 添加到历史记录
    this.violationHistory.push(violation);

    // 限制历史记录大小
    if (this.violationHistory.length > this.maxViolationHistory) {
      this.violationHistory.shift();
    }

    // 触发回调
    if (this.onViolation) {
      Promise.resolve(this.onViolation(violation)).catch((error) => {
        console.error('违规处理回调执行失败:', error);
      });
    }

    return violation;
  }

  /**
   * 检查是否应该忽略违规类型
   *
   * @param type - 违规类型
   * @returns 是否忽略
   */
  private shouldIgnoreViolationType(type: ViolationType): boolean {
    const ignoreSettings = this.settings.ignoreViolations || {};

    switch (type) {
      case 'network':
        return ignoreSettings.network === true;
      case 'filesystem':
        return ignoreSettings.filesystem === true;
      case 'command':
        // 命令违规默认不忽略
        return false;
      default:
        return false;
    }
  }

  /**
   * 检查是否应该忽略特定违规
   *
   * @param violation - 违规记录
   * @returns 是否忽略（允许操作继续）
   */
  private shouldIgnoreViolation(violation: SandboxViolation): boolean {
    return violation.ignored;
  }

  /**
   * 获取 SDK Options 格式的沙箱配置
   *
   * @returns SDK 沙箱配置
   */
  getSDKOptions(): SandboxSettings | undefined {
    if (!this.settings.enabled) {
      return undefined;
    }

    return {
      ...this.settings,
      // 合并默认排除命令和用户配置
      excludedCommands: [...DEFAULT_EXCLUDED_COMMANDS, ...(this.settings.excludedCommands || [])],
    };
  }

  /**
   * 启用沙箱
   */
  enable(): void {
    this.settings.enabled = true;
  }

  /**
   * 禁用沙箱
   */
  disable(): void {
    this.settings.enabled = false;
  }

  /**
   * 检查沙箱是否启用
   */
  isEnabled(): boolean {
    return this.settings.enabled === true;
  }

  /**
   * 获取当前设置
   */
  getSettings(): Readonly<SandboxSettings> {
    return { ...this.settings };
  }

  /**
   * 更新设置
   *
   * @param settings - 新设置（部分）
   */
  updateSettings(settings: Partial<SandboxSettings>): void {
    this.settings = {
      ...this.settings,
      ...settings,
      network: {
        ...this.settings.network,
        ...settings.network,
      },
      ignoreViolations: {
        ...this.settings.ignoreViolations,
        ...settings.ignoreViolations,
      },
    };
  }

  /**
   * 添加排除命令
   *
   * @param command - 命令或命令模式
   */
  addExcludedCommand(command: string): void {
    if (!this.settings.excludedCommands) {
      this.settings.excludedCommands = [];
    }
    if (!this.settings.excludedCommands.includes(command)) {
      this.settings.excludedCommands.push(command);
    }
  }

  /**
   * 移除排除命令
   *
   * @param command - 命令或命令模式
   */
  removeExcludedCommand(command: string): void {
    if (this.settings.excludedCommands) {
      this.settings.excludedCommands = this.settings.excludedCommands.filter((c) => c !== command);
    }
  }

  /**
   * 获取所有排除命令（包括默认）
   */
  getAllExcludedCommands(): string[] {
    return [...DEFAULT_EXCLUDED_COMMANDS, ...(this.settings.excludedCommands || [])];
  }

  /**
   * 添加允许的域名
   *
   * @param domain - 域名或域名模式
   */
  addAllowedDomain(domain: string): void {
    if (!this.settings.network) {
      this.settings.network = {};
    }
    if (!this.settings.network.allowedDomains) {
      this.settings.network.allowedDomains = [];
    }
    if (!this.settings.network.allowedDomains.includes(domain)) {
      this.settings.network.allowedDomains.push(domain);
    }
  }

  /**
   * 移除允许的域名
   *
   * @param domain - 域名或域名模式
   */
  removeAllowedDomain(domain: string): void {
    if (this.settings.network?.allowedDomains) {
      this.settings.network.allowedDomains = this.settings.network.allowedDomains.filter(
        (d) => d !== domain
      );
    }
  }

  /**
   * 添加阻止的域名
   *
   * @param domain - 域名或域名模式
   */
  addBlockedDomain(domain: string): void {
    if (!this.settings.network) {
      this.settings.network = {};
    }
    if (!this.settings.network.blockedDomains) {
      this.settings.network.blockedDomains = [];
    }
    if (!this.settings.network.blockedDomains.includes(domain)) {
      this.settings.network.blockedDomains.push(domain);
    }
  }

  /**
   * 移除阻止的域名
   *
   * @param domain - 域名或域名模式
   */
  removeBlockedDomain(domain: string): void {
    if (this.settings.network?.blockedDomains) {
      this.settings.network.blockedDomains = this.settings.network.blockedDomains.filter(
        (d) => d !== domain
      );
    }
  }

  /**
   * 获取违规历史
   *
   * @param limit - 返回的最大记录数
   * @returns 违规记录数组
   */
  getViolationHistory(limit?: number): SandboxViolation[] {
    if (limit && limit > 0) {
      return this.violationHistory.slice(-limit);
    }
    return [...this.violationHistory];
  }

  /**
   * 清除违规历史
   */
  clearViolationHistory(): void {
    this.violationHistory = [];
  }

  /**
   * 设置违规处理回调
   *
   * @param callback - 回调函数
   */
  setViolationCallback(callback: (violation: SandboxViolation) => void | Promise<void>): void {
    this.onViolation = callback;
  }

  /**
   * 创建默认沙箱设置
   */
  static createDefaultSettings(): SandboxSettings {
    return {
      enabled: false,
      autoAllowBashIfSandboxed: false,
      excludedCommands: [],
      allowUnsandboxedCommands: false,
      network: {
        allowedDomains: [],
        blockedDomains: [],
      },
      ignoreViolations: {
        network: false,
        filesystem: false,
      },
      enableWeakerNestedSandbox: false,
    };
  }

  /**
   * 创建严格沙箱设置
   */
  static createStrictSettings(): SandboxSettings {
    return {
      enabled: true,
      autoAllowBashIfSandboxed: false,
      excludedCommands: [
        // 额外的严格限制
        'curl',
        'wget',
        'ssh',
        'scp',
        'rsync',
        'ftp',
        'telnet',
        'nc',
        'ncat',
        'netcat',
      ],
      allowUnsandboxedCommands: false,
      network: {
        allowedDomains: [],
        blockedDomains: [...DEFAULT_BLOCKED_DOMAINS],
      },
      ignoreViolations: {
        network: false,
        filesystem: false,
      },
      enableWeakerNestedSandbox: false,
    };
  }
}
