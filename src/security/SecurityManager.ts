/**
 * 文件功能：安全管理模块，提供敏感信息检测、危险命令确认、日志脱敏等安全功能
 *
 * 核心类：
 * - SecurityManager: 安全管理器核心类
 *
 * 核心方法：
 * - detectSensitiveInfo(): 检测文本中的敏感信息
 * - sanitizeLogData(): 脱敏日志数据
 * - checkDangerousCommand(): 检查危险命令
 * - confirmOperation(): 确认危险操作
 * - validateEnvironment(): 验证环境安全性
 */

export type SensitiveInfoType =
  | 'api_key'
  | 'password'
  | 'token'
  | 'secret'
  | 'private_key'
  | 'credential'
  | 'connection_string'
  | 'aws_key'
  | 'ssh_key'
  | 'certificate';

/**
 * 敏感信息检测结果
 */
export interface SensitiveInfoMatch {
  /** 敏感信息类型 */
  type: SensitiveInfoType;
  /** 匹配的内容（已脱敏） */
  maskedContent: string;
  /** 原始内容的位置 */
  position: {
    start: number;
    end: number;
    line?: number;
    column?: number;
  };
  /** 严重程度 */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** 建议 */
  suggestion: string;
}

/**
 * 危险命令类型
 */
export type DangerousCommandType =
  | 'destructive' // 破坏性命令（如 rm -rf）
  | 'system_modify' // 系统修改命令
  | 'network' // 网络相关命令
  | 'privilege' // 权限提升命令
  | 'data_exposure'; // 数据暴露命令

/**
 * 危险命令检测结果
 */
export interface DangerousCommandMatch {
  /** 命令类型 */
  type: DangerousCommandType;
  /** 匹配的命令 */
  command: string;
  /** 危险等级 */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** 原因说明 */
  reason: string;
  /** 是否需要确认 */
  requiresConfirmation: boolean;
}

/**
 * 敏感文件配置
 */
export interface SensitiveFileConfig {
  /** 敏感文件模式列表 */
  patterns: string[];
  /** 敏感目录列表 */
  directories: string[];
  /** 自定义规则 */
  customRules?: Array<{
    pattern: string;
    reason: string;
  }>;
}

/**
 * 安全配置
 */
export interface SecurityConfig {
  /** 是否启用敏感信息检测 */
  enableSensitiveInfoDetection: boolean;
  /** 是否启用危险命令检测 */
  enableDangerousCommandDetection: boolean;
  /** 敏感文件配置 */
  sensitiveFiles: SensitiveFileConfig;
  /** 是否强制使用 HTTPS */
  enforceHttps: boolean;
  /** 是否启用日志脱敏 */
  enableLogSanitization: boolean;
  /** 自定义敏感信息模式 */
  customSensitivePatterns?: Array<{
    name: string;
    pattern: RegExp;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
}

/**
 * API 密钥配置
 */
export interface APIKeyConfig {
  /** 环境变量名称 */
  envVarName: string;
  /** 是否必需 */
  required: boolean;
  /** 验证模式 */
  validationPattern?: RegExp;
}

/**
 * 用户确认回调
 */
export type ConfirmationCallback = (message: string, details?: string) => Promise<boolean>;

/**
 * 安全警告回调
 */
export type WarningCallback = (
  message: string,
  severity: 'low' | 'medium' | 'high' | 'critical'
) => void;

/**
 * 默认敏感信息检测模式
 */
const DEFAULT_SENSITIVE_PATTERNS: Array<{
  type: SensitiveInfoType;
  pattern: RegExp;
  severity: 'low' | 'medium' | 'high' | 'critical';
  suggestion: string;
}> = [
  {
    type: 'api_key',
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi,
    severity: 'critical',
    suggestion: '请使用环境变量存储 API 密钥，不要硬编码在代码中',
  },
  {
    type: 'aws_key',
    pattern: /(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/g,
    severity: 'critical',
    suggestion: '检测到 AWS 访问密钥，请立即撤销并使用 IAM 角色或环境变量',
  },
  {
    type: 'password',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"]([^'"]{4,})['"]?/gi,
    severity: 'high',
    suggestion: '请使用环境变量或密钥管理服务存储密码',
  },
  {
    type: 'token',
    pattern: /(?:bearer|token|auth)\s*[:=]\s*['"]?([a-zA-Z0-9_.-]{20,})['"]?/gi,
    severity: 'high',
    suggestion: '请使用环境变量存储认证令牌',
  },
  {
    type: 'secret',
    pattern: /(?:secret|client_secret)\s*[:=]\s*['"]?([a-zA-Z0-9_-]{16,})['"]?/gi,
    severity: 'critical',
    suggestion: '请使用环境变量或密钥管理服务存储密钥',
  },
  {
    type: 'private_key',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    severity: 'critical',
    suggestion: '检测到私钥，请确保不要提交到版本控制',
  },
  {
    type: 'ssh_key',
    pattern: /ssh-(?:rsa|ed25519|ecdsa)\s+[A-Za-z0-9+/=]{40,}/g,
    severity: 'high',
    suggestion: '检测到 SSH 密钥，请确保这是公钥而非私钥',
  },
  {
    type: 'connection_string',
    pattern: /(?:mongodb|mysql|postgres|redis):\/\/[^:]+:[^@]+@[^\s]+/gi,
    severity: 'high',
    suggestion: '数据库连接字符串包含凭据，请使用环境变量',
  },
  {
    type: 'credential',
    pattern:
      /(?:username|user)\s*[:=]\s*['"]([^'"]+)['"]\s*[,;]?\s*(?:password|passwd|pwd)\s*[:=]\s*['"]([^'"]+)['"]/gi,
    severity: 'high',
    suggestion: '检测到用户名密码组合，请使用安全的凭据管理方式',
  },
];

/**
 * 默认危险命令模式
 */
const DEFAULT_DANGEROUS_COMMANDS: Array<{
  type: DangerousCommandType;
  pattern: RegExp;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
}> = [
  // 破坏性命令
  {
    type: 'destructive',
    pattern: /\brm\s+(-[rf]+\s+)*[/~]/i,
    riskLevel: 'critical',
    reason: '此命令可能删除重要文件或目录',
  },
  {
    type: 'destructive',
    pattern: /\brm\s+-rf\s+\//i,
    riskLevel: 'critical',
    reason: '此命令会删除根目录下的所有文件',
  },
  {
    type: 'destructive',
    pattern: /\bdd\s+if=.*of=\/dev\//i,
    riskLevel: 'critical',
    reason: '此命令可能覆盖磁盘数据',
  },
  {
    type: 'destructive',
    pattern: /\bmkfs\b/i,
    riskLevel: 'critical',
    reason: '此命令会格式化文件系统',
  },
  {
    type: 'destructive',
    pattern: />\s*\/dev\/sd[a-z]/i,
    riskLevel: 'critical',
    reason: '此命令可能覆盖磁盘数据',
  },
  // Fork bomb
  {
    type: 'destructive',
    pattern: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    riskLevel: 'critical',
    reason: '检测到 Fork bomb，会导致系统资源耗尽',
  },
  // 系统修改命令
  {
    type: 'system_modify',
    pattern: /\bchmod\s+777\b/i,
    riskLevel: 'high',
    reason: '设置 777 权限会使文件对所有用户可读写执行',
  },
  {
    type: 'system_modify',
    pattern: /\bchown\s+-R\s+root/i,
    riskLevel: 'high',
    reason: '递归更改所有者为 root 可能导致权限问题',
  },
  {
    type: 'system_modify',
    pattern: /\bsystemctl\s+(?:stop|disable|mask)\s+/i,
    riskLevel: 'medium',
    reason: '此命令会停止或禁用系统服务',
  },
  // 权限提升命令
  {
    type: 'privilege',
    pattern: /\bsudo\s+/i,
    riskLevel: 'medium',
    reason: '此命令需要管理员权限',
  },
  {
    type: 'privilege',
    pattern: /\bsu\s+-?\s*$/i,
    riskLevel: 'high',
    reason: '此命令会切换到 root 用户',
  },
  // 网络相关命令
  {
    type: 'network',
    pattern: /\bcurl\s+.*\|\s*(?:bash|sh)\b/i,
    riskLevel: 'critical',
    reason: '从网络下载并直接执行脚本非常危险',
  },
  {
    type: 'network',
    pattern: /\bwget\s+.*\|\s*(?:bash|sh)\b/i,
    riskLevel: 'critical',
    reason: '从网络下载并直接执行脚本非常危险',
  },
  {
    type: 'network',
    pattern: /\bnc\s+-[el]/i,
    riskLevel: 'high',
    reason: 'netcat 监听模式可能被用于后门',
  },
  // 数据暴露命令
  {
    type: 'data_exposure',
    pattern: /\bcat\s+.*(?:passwd|shadow|\.ssh)/i,
    riskLevel: 'high',
    reason: '此命令可能暴露敏感系统文件',
  },
  {
    type: 'data_exposure',
    pattern: /\benv\b|\bprintenv\b/i,
    riskLevel: 'low',
    reason: '此命令会显示环境变量，可能包含敏感信息',
  },
];

/**
 * 默认敏感文件模式
 */
const DEFAULT_SENSITIVE_FILE_PATTERNS: string[] = [
  // 环境配置文件
  '.env',
  '.env.*',
  '*.env',
  // 密钥文件
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  '*.jks',
  // SSH 相关
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  '*.ppk',
  // 配置文件
  '*credentials*',
  '*secrets*',
  '*.secret',
  // 数据库
  '*.sqlite',
  '*.db',
  // 历史文件
  '.bash_history',
  '.zsh_history',
  '.mysql_history',
  '.psql_history',
  // 其他
  '.htpasswd',
  '.netrc',
  '.npmrc',
  '.pypirc',
];

/**
 * 默认敏感目录
 */
const DEFAULT_SENSITIVE_DIRECTORIES: string[] = [
  '.ssh',
  '.gnupg',
  '.aws',
  '.azure',
  '.gcloud',
  '.kube',
  '.docker',
  'secrets',
  'credentials',
  'private',
];

/**
 * 日志脱敏关键字
 */
const LOG_SANITIZE_KEYS: string[] = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'api_key',
  'apikey',
  'api-key',
  'auth',
  'authorization',
  'bearer',
  'credential',
  'private_key',
  'privatekey',
  'access_key',
  'accesskey',
  'secret_key',
  'secretkey',
  'connection_string',
  'connectionstring',
];

/**
 * 安全管理器类
 *
 * 提供全面的安全功能，包括敏感信息检测、危险命令确认、
 * API 密钥管理、HTTPS 验证、敏感文件黑名单和日志脱敏
 */
export class SecurityManager {
  private config: SecurityConfig;
  private confirmationCallback?: ConfirmationCallback;
  private warningCallback?: WarningCallback;

  constructor(config?: Partial<SecurityConfig>) {
    this.config = {
      enableSensitiveInfoDetection: true,
      enableDangerousCommandDetection: true,
      sensitiveFiles: {
        patterns: [...DEFAULT_SENSITIVE_FILE_PATTERNS],
        directories: [...DEFAULT_SENSITIVE_DIRECTORIES],
      },
      enforceHttps: true,
      enableLogSanitization: true,
      ...config,
    };
  }

  /**
   * 检测文本中的敏感信息
   *
   * @param content 要检测的内容
   * @returns 检测到的敏感信息列表
   * **验证: 需求 26.1**
   */
  detectSensitiveInfo(content: string): SensitiveInfoMatch[] {
    if (!this.config.enableSensitiveInfoDetection) {
      return [];
    }

    const matches: SensitiveInfoMatch[] = [];
    const lines = content.split('\n');

    // 使用默认模式检测
    for (const patternDef of DEFAULT_SENSITIVE_PATTERNS) {
      const regex = new RegExp(patternDef.pattern.source, patternDef.pattern.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(content)) !== null) {
        const position = this.calculatePosition(content, match.index, lines);
        matches.push({
          type: patternDef.type,
          maskedContent: this.maskSensitiveContent(match[0]),
          position,
          severity: patternDef.severity,
          suggestion: patternDef.suggestion,
        });
      }
    }

    // 使用自定义模式检测
    if (this.config.customSensitivePatterns) {
      for (const customPattern of this.config.customSensitivePatterns) {
        const regex = new RegExp(customPattern.pattern.source, customPattern.pattern.flags);
        let match: RegExpExecArray | null;

        while ((match = regex.exec(content)) !== null) {
          const position = this.calculatePosition(content, match.index, lines);
          matches.push({
            type: 'credential',
            maskedContent: this.maskSensitiveContent(match[0]),
            position,
            severity: customPattern.severity,
            suggestion: `检测到自定义敏感模式: ${customPattern.name}`,
          });
        }
      }
    }

    return matches;
  }

  /**
   * 检测并警告敏感信息
   *
   * @param content 要检测的内容
   * @param context 上下文描述（如文件名）
   * @returns 是否检测到敏感信息
   * **验证: 需求 26.1**
   */
  async detectAndWarn(content: string, context?: string): Promise<boolean> {
    const matches = this.detectSensitiveInfo(content);

    if (matches.length === 0) {
      return false;
    }

    // 按严重程度排序
    matches.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    // 发出警告
    for (const match of matches) {
      const contextStr = context ? ` (在 ${context} 中)` : '';
      const message =
        `检测到敏感信息${contextStr}: ${match.type}\n` +
        `位置: 第 ${match.position.line || '?'} 行\n` +
        `内容: ${match.maskedContent}\n` +
        `建议: ${match.suggestion}`;

      if (this.warningCallback) {
        this.warningCallback(message, match.severity);
      } else {
        console.warn(`[Security Warning] ${message}`);
      }
    }

    return true;
  }

  /**
   * 检测危险命令
   *
   * @param command 要检测的命令
   * @returns 检测结果，如果不是危险命令则返回 null
   * **验证: 需求 26.2**
   */
  detectDangerousCommand(command: string): DangerousCommandMatch | null {
    if (!this.config.enableDangerousCommandDetection) {
      return null;
    }

    for (const patternDef of DEFAULT_DANGEROUS_COMMANDS) {
      if (patternDef.pattern.test(command)) {
        return {
          type: patternDef.type,
          command: command,
          riskLevel: patternDef.riskLevel,
          reason: patternDef.reason,
          requiresConfirmation: patternDef.riskLevel !== 'low',
        };
      }
    }

    return null;
  }

  /**
   * 检测并确认危险命令
   *
   * @param command 要执行的命令
   * @returns 是否允许执行
   * **验证: 需求 26.2**
   */
  async confirmDangerousCommand(command: string): Promise<boolean> {
    const match = this.detectDangerousCommand(command);

    if (!match) {
      return true; // Not a dangerous command, allow execution
    }

    if (!match.requiresConfirmation) {
      // Low risk command, warn but allow execution
      if (this.warningCallback) {
        this.warningCallback(`Low risk command: ${match.reason}`, 'low');
      }
      return true;
    }

    // Requires user confirmation
    if (!this.confirmationCallback) {
      // No confirmation callback, reject high risk commands by default
      console.warn(`[Security] Dangerous command blocked: ${match.reason}`);
      return false;
    }

    const message =
      `⚠️ Dangerous command detected\n\n` +
      `Command: ${command}\n` +
      `Risk level: ${match.riskLevel}\n` +
      `Reason: ${match.reason}\n\n` +
      `Are you sure you want to execute this command?`;

    return this.confirmationCallback(message, match.reason);
  }

  /**
   * 获取 API 密钥
   *
   * 从环境变量中安全地获取 API 密钥
   *
   * @param config API 密钥配置
   * @returns API 密钥或 null
   * **验证: 需求 26.3**
   */
  getAPIKey(config: APIKeyConfig): string | null {
    const value = process.env[config.envVarName];

    if (!value) {
      if (config.required) {
        throw new Error(
          `Missing required API key. Please set environment variable ${config.envVarName}`
        );
      }
      return null;
    }

    // 验证格式
    if (config.validationPattern && !config.validationPattern.test(value)) {
      throw new Error(
        `Invalid API key format. Please check the value of environment variable ${config.envVarName}`
      );
    }

    return value;
  }

  /**
   * 验证 URL 是否使用 HTTPS
   *
   * @param url 要验证的 URL
   * @returns 是否使用 HTTPS
   * **验证: 需求 26.4**
   */
  validateHttps(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * 确保 URL 使用 HTTPS
   *
   * @param url 要验证的 URL
   * @throws 如果 URL 不使用 HTTPS 且强制 HTTPS 已启用
   * **验证: 需求 26.4**
   */
  ensureHttps(url: string): void {
    if (!this.config.enforceHttps) {
      return;
    }

    if (!this.validateHttps(url)) {
      throw new Error(`Security error: URL must use HTTPS protocol. Received: ${url}`);
    }
  }

  /**
   * 检查文件是否在敏感文件黑名单中
   *
   * @param filePath 文件路径
   * @returns 是否为敏感文件
   * **验证: 需求 26.5**
   */
  isSensitiveFile(filePath: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const fileName = normalizedPath.split('/').pop() || '';
    const pathParts = normalizedPath.split('/');

    // 检查目录
    for (const dir of this.config.sensitiveFiles.directories) {
      if (pathParts.includes(dir)) {
        return true;
      }
    }

    // 检查文件模式
    for (const pattern of this.config.sensitiveFiles.patterns) {
      if (this.matchPattern(fileName, pattern)) {
        return true;
      }
    }

    // 检查自定义规则
    if (this.config.sensitiveFiles.customRules) {
      for (const rule of this.config.sensitiveFiles.customRules) {
        if (this.matchPattern(normalizedPath, rule.pattern)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 获取敏感文件的原因
   *
   * @param filePath 文件路径
   * @returns 敏感原因，如果不是敏感文件则返回 null
   * **验证: 需求 26.5**
   */
  getSensitiveFileReason(filePath: string): string | null {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const fileName = normalizedPath.split('/').pop() || '';
    const pathParts = normalizedPath.split('/');

    // 检查目录
    for (const dir of this.config.sensitiveFiles.directories) {
      if (pathParts.includes(dir)) {
        return `File is in sensitive directory "${dir}"`;
      }
    }

    // 检查文件模式
    for (const pattern of this.config.sensitiveFiles.patterns) {
      if (this.matchPattern(fileName, pattern)) {
        return `File matches sensitive pattern "${pattern}"`;
      }
    }

    // 检查自定义规则
    if (this.config.sensitiveFiles.customRules) {
      for (const rule of this.config.sensitiveFiles.customRules) {
        if (this.matchPattern(normalizedPath, rule.pattern)) {
          return rule.reason;
        }
      }
    }

    return null;
  }

  /**
   * 添加敏感文件模式
   *
   * @param pattern 文件模式
   * **验证: 需求 26.5**
   */
  addSensitiveFilePattern(pattern: string): void {
    if (!this.config.sensitiveFiles.patterns.includes(pattern)) {
      this.config.sensitiveFiles.patterns.push(pattern);
    }
  }

  /**
   * 添加敏感目录
   *
   * @param directory 目录名
   * **验证: 需求 26.5**
   */
  addSensitiveDirectory(directory: string): void {
    if (!this.config.sensitiveFiles.directories.includes(directory)) {
      this.config.sensitiveFiles.directories.push(directory);
    }
  }

  /**
   * 脱敏日志数据
   *
   * @param data 要脱敏的数据
   * @returns 脱敏后的数据
   * **验证: 需求 26.6**
   */
  sanitizeLogData(data: unknown): unknown {
    if (!this.config.enableLogSanitization) {
      return data;
    }

    return this.sanitizeValue(data);
  }

  /**
   * 脱敏字符串
   *
   * @param text 要脱敏的文本
   * @returns 脱敏后的文本
   * **验证: 需求 26.6**
   */
  sanitizeString(text: string): string {
    if (!this.config.enableLogSanitization) {
      return text;
    }

    let result = text;

    // 使用敏感信息模式进行脱敏
    for (const patternDef of DEFAULT_SENSITIVE_PATTERNS) {
      const regex = new RegExp(patternDef.pattern.source, patternDef.pattern.flags);
      result = result.replace(regex, (match) => this.maskSensitiveContent(match));
    }

    return result;
  }

  /**
   * 获取当前配置
   */
  getConfig(): Readonly<SecurityConfig> {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ==================== 私有方法 ====================

  /**
   * 计算位置信息
   */
  private calculatePosition(
    _content: string,
    index: number,
    lines: string[]
  ): SensitiveInfoMatch['position'] {
    let currentIndex = 0;
    let lineNumber = 1;
    let columnNumber = 1;

    for (const line of lines) {
      if (currentIndex + line.length >= index) {
        columnNumber = index - currentIndex + 1;
        break;
      }
      currentIndex += line.length + 1; // +1 for newline
      lineNumber++;
    }

    return {
      start: index,
      end: index,
      line: lineNumber,
      column: columnNumber,
    };
  }

  /**
   * 掩码敏感内容
   */
  private maskSensitiveContent(content: string): string {
    if (content.length <= 8) {
      return '*'.repeat(content.length);
    }

    // 保留前 4 个和后 4 个字符
    const prefix = content.substring(0, 4);
    const suffix = content.substring(content.length - 4);
    const masked = '*'.repeat(Math.min(content.length - 8, 20));

    return `${prefix}${masked}${suffix}`;
  }

  /**
   * 匹配文件模式
   */
  private matchPattern(fileName: string, pattern: string): boolean {
    // 转换 glob 模式为正则表达式
    const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(fileName);
  }

  /**
   * 递归脱敏值
   */
  private sanitizeValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue(item));
    }

    if (typeof value === 'object') {
      const sanitized: Record<string, unknown> = {};

      for (const [key, val] of Object.entries(value)) {
        // 检查键名是否包含敏感关键字
        const isSensitiveKey = LOG_SANITIZE_KEYS.some((sensitiveKey) =>
          key.toLowerCase().includes(sensitiveKey.toLowerCase())
        );

        if (isSensitiveKey && typeof val === 'string') {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitizeValue(val);
        }
      }

      return sanitized;
    }

    return value;
  }

  /**
   * 创建默认配置
   */
  static createDefaultConfig(): SecurityConfig {
    return {
      enableSensitiveInfoDetection: true,
      enableDangerousCommandDetection: true,
      sensitiveFiles: {
        patterns: [...DEFAULT_SENSITIVE_FILE_PATTERNS],
        directories: [...DEFAULT_SENSITIVE_DIRECTORIES],
      },
      enforceHttps: true,
      enableLogSanitization: true,
    };
  }

  /**
   * 获取默认敏感文件模式
   */
  static getDefaultSensitiveFilePatterns(): string[] {
    return [...DEFAULT_SENSITIVE_FILE_PATTERNS];
  }

  /**
   * 获取默认敏感目录
   */
  static getDefaultSensitiveDirectories(): string[] {
    return [...DEFAULT_SENSITIVE_DIRECTORIES];
  }

  /**
   * 获取默认危险命令模式
   */
  static getDefaultDangerousCommands(): Array<{
    type: DangerousCommandType;
    pattern: RegExp;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    reason: string;
  }> {
    return [...DEFAULT_DANGEROUS_COMMANDS];
  }
}
