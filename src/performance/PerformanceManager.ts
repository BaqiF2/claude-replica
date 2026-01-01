/**
 * 性能管理器
 *
 * 负责应用程序的性能优化，包括：
 * - 快速启动（2 秒内初始化）
 * - 增量加载大型项目
 * - 项目结构缓存
 * - 异步 I/O 操作
 * - Token 限制管理
 * - 内存使用监控和清理
 *
 * @module PerformanceManager
 * **验证: 需求 22.1, 22.2, 22.3, 22.4, 22.5, 22.6**
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * 启动性能指标
 */
export interface StartupMetrics {
  /** 总启动时间（毫秒） */
  totalTime: number;
  /** 配置加载时间（毫秒） */
  configLoadTime: number;
  /** 扩展加载时间（毫秒） */
  extensionLoadTime: number;
  /** 缓存加载时间（毫秒） */
  cacheLoadTime: number;
  /** 是否在目标时间内完成 */
  withinTarget: boolean;
  /** 目标时间（毫秒） */
  targetTime: number;
}

/**
 * 内存使用信息
 */
export interface MemoryUsage {
  /** 堆内存使用量（字节） */
  heapUsed: number;
  /** 堆内存总量（字节） */
  heapTotal: number;
  /** 外部内存使用量（字节） */
  external: number;
  /** RSS（常驻集大小，字节） */
  rss: number;
  /** 使用百分比 */
  usagePercent: number;
  /** 是否超过阈值 */
  overThreshold: boolean;
}

/**
 * 项目结构缓存条目
 */
export interface ProjectCacheEntry {
  /** 项目路径 */
  projectPath: string;
  /** 文件列表 */
  files: string[];
  /** 目录结构 */
  directories: string[];
  /** 文件统计 */
  stats: ProjectStats;
  /** 缓存时间戳 */
  timestamp: number;
  /** 缓存版本 */
  version: string;
  /** 文件哈希（用于验证） */
  hash: string;
}

/**
 * 项目统计信息
 */
export interface ProjectStats {
  /** 文件总数 */
  totalFiles: number;
  /** 目录总数 */
  totalDirectories: number;
  /** 代码文件数 */
  codeFiles: number;
  /** 总大小（字节） */
  totalSize: number;
  /** 主要语言 */
  primaryLanguage: string;
  /** 语言分布 */
  languageDistribution: Record<string, number>;
}

/**
 * 增量加载状态
 */
export interface IncrementalLoadState {
  /** 是否正在加载 */
  loading: boolean;
  /** 已加载的文件数 */
  loadedFiles: number;
  /** 总文件数 */
  totalFiles: number;
  /** 加载进度（0-100） */
  progress: number;
  /** 当前加载的目录 */
  currentDirectory: string;
  /** 已加载的目录列表 */
  loadedDirectories: string[];
  /** 待加载的目录列表 */
  pendingDirectories: string[];
}

/**
 * 异步操作队列项
 */
interface AsyncQueueItem<T> {
  /** 操作函数 */
  operation: () => Promise<T>;
  /** 优先级（数字越小优先级越高） */
  priority: number;
  /** 解析函数 */
  resolve: (value: T) => void;
  /** 拒绝函数 */
  reject: (error: Error) => void;
  /** 创建时间 */
  createdAt: number;
}

/**
 * 性能管理器配置
 */
export interface PerformanceConfig {
  /** 目标启动时间（毫秒） */
  targetStartupTime: number;
  /** 内存阈值（字节） */
  memoryThreshold: number;
  /** 内存检查间隔（毫秒） */
  memoryCheckInterval: number;
  /** 缓存目录 */
  cacheDir: string;
  /** 缓存过期时间（毫秒） */
  cacheExpiry: number;
  /** 最大并发 I/O 操作数 */
  maxConcurrentIO: number;
  /** 增量加载批次大小 */
  incrementalBatchSize: number;
  /** 是否启用内存监控 */
  enableMemoryMonitoring: boolean;
  /** 是否启用缓存 */
  enableCaching: boolean;
  /** 忽略的目录模式 */
  ignoredPatterns: string[];
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: PerformanceConfig = {
  targetStartupTime: 2000, // 2 秒
  memoryThreshold: 512 * 1024 * 1024, // 512 MB
  memoryCheckInterval: 30000, // 30 秒
  cacheDir: path.join(os.homedir(), '.claude-replica', 'cache'),
  cacheExpiry: 24 * 60 * 60 * 1000, // 24 小时
  maxConcurrentIO: 10,
  incrementalBatchSize: 100,
  enableMemoryMonitoring: true,
  enableCaching: true,
  ignoredPatterns: [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.cache',
    '__pycache__',
    '.venv',
    'venv',
    '.idea',
    '.vscode',
    'coverage',
    '.next',
    '.nuxt',
  ],
};

/**
 * 缓存版本号
 */
const CACHE_VERSION = '1.0.0';

/**
 * 性能管理器类
 *
 * 提供应用程序性能优化功能
 */
export class PerformanceManager {
  private readonly config: PerformanceConfig;
  private projectCache: Map<string, ProjectCacheEntry> = new Map();
  private memoryMonitorInterval: NodeJS.Timeout | null = null;
  private asyncQueue: AsyncQueueItem<unknown>[] = [];
  private activeOperations = 0;
  private incrementalState: IncrementalLoadState | null = null;
  private startupMetrics: StartupMetrics | null = null;
  private initialized = false;

  constructor(config: Partial<PerformanceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 初始化性能管理器
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const startTime = Date.now();

    // 确保缓存目录存在
    if (this.config.enableCaching) {
      await fs.mkdir(this.config.cacheDir, { recursive: true });
    }

    // 启动内存监控
    if (this.config.enableMemoryMonitoring) {
      this.startMemoryMonitoring();
    }

    this.initialized = true;

    // 记录初始化时间
    const initTime = Date.now() - startTime;
    console.debug(`[PerformanceManager] 初始化完成，耗时 ${initTime}ms`);
  }

  /**
   * 关闭性能管理器
   */
  async shutdown(): Promise<void> {
    // 停止内存监控
    this.stopMemoryMonitoring();

    // 保存缓存
    if (this.config.enableCaching) {
      await this.saveCacheToDisk();
    }

    this.initialized = false;
  }

  // ==================== 快速启动相关方法 ====================

  /**
   * 测量启动性能
   *
   * 用于测量应用程序启动时间，确保在目标时间内完成
   *
   * @param initFunction - 初始化函数
   * @returns 启动性能指标
   */
  async measureStartup<T>(
    initFunction: () => Promise<T>
  ): Promise<{ result: T; metrics: StartupMetrics }> {
    const startTime = Date.now();
    const metrics: StartupMetrics = {
      totalTime: 0,
      configLoadTime: 0,
      extensionLoadTime: 0,
      cacheLoadTime: 0,
      withinTarget: false,
      targetTime: this.config.targetStartupTime,
    };

    try {
      const result = await initFunction();
      metrics.totalTime = Date.now() - startTime;
      metrics.withinTarget = metrics.totalTime <= this.config.targetStartupTime;
      this.startupMetrics = metrics;

      if (!metrics.withinTarget) {
        console.warn(
          `[PerformanceManager] 启动时间 ${metrics.totalTime}ms 超过目标 ${this.config.targetStartupTime}ms`
        );
      }

      return { result, metrics };
    } catch (error) {
      metrics.totalTime = Date.now() - startTime;
      this.startupMetrics = metrics;
      throw error;
    }
  }

  /**
   * 延迟初始化包装器
   *
   * 将非关键初始化延迟到启动后执行
   *
   * @param initFunction - 初始化函数
   * @param delayMs - 延迟时间（毫秒）
   */
  deferInitialization(initFunction: () => Promise<void>, delayMs: number = 100): void {
    setTimeout(async () => {
      try {
        await initFunction();
      } catch (error) {
        console.error('[PerformanceManager] 延迟初始化失败:', error);
      }
    }, delayMs);
  }

  /**
   * 获取启动性能指标
   */
  getStartupMetrics(): StartupMetrics | null {
    return this.startupMetrics;
  }

  // ==================== 增量加载相关方法 ====================

  /**
   * 增量加载项目结构
   *
   * 分批加载大型项目，避免阻塞主线程
   *
   * @param projectPath - 项目路径
   * @param onProgress - 进度回调
   * @returns 项目统计信息
   */
  async loadProjectIncrementally(
    projectPath: string,
    onProgress?: (state: IncrementalLoadState) => void
  ): Promise<ProjectStats> {
    // 检查缓存
    const cached = await this.getProjectCache(projectPath);
    if (cached && !this.isCacheExpired(cached)) {
      return cached.stats;
    }

    // 初始化增量加载状态
    this.incrementalState = {
      loading: true,
      loadedFiles: 0,
      totalFiles: 0,
      progress: 0,
      currentDirectory: projectPath,
      loadedDirectories: [],
      pendingDirectories: [projectPath],
    };

    const files: string[] = [];
    const directories: string[] = [];
    const languageDistribution: Record<string, number> = {};
    let totalSize = 0;

    try {
      // 分批处理目录
      while (this.incrementalState.pendingDirectories.length > 0) {
        const batch = this.incrementalState.pendingDirectories.splice(
          0,
          this.config.incrementalBatchSize
        );

        await Promise.all(
          batch.map(async (dir) => {
            try {
              const entries = await fs.readdir(dir, { withFileTypes: true });

              for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                // 检查是否应该忽略
                if (this.shouldIgnore(entry.name)) {
                  continue;
                }

                if (entry.isDirectory()) {
                  directories.push(fullPath);
                  this.incrementalState!.pendingDirectories.push(fullPath);
                } else if (entry.isFile()) {
                  files.push(fullPath);
                  this.incrementalState!.loadedFiles++;

                  // 统计语言分布
                  const ext = path.extname(entry.name).toLowerCase();
                  if (ext) {
                    languageDistribution[ext] = (languageDistribution[ext] || 0) + 1;
                  }

                  // 获取文件大小（异步）
                  try {
                    const stat = await fs.stat(fullPath);
                    totalSize += stat.size;
                  } catch {
                    // 忽略无法访问的文件
                  }
                }
              }

              this.incrementalState!.loadedDirectories.push(dir);
            } catch {
              // 忽略无法访问的目录
            }
          })
        );

        // 更新进度
        this.incrementalState.totalFiles = files.length;
        this.incrementalState.progress = Math.min(
          100,
          Math.floor(
            (this.incrementalState.loadedDirectories.length /
              (this.incrementalState.loadedDirectories.length +
                this.incrementalState.pendingDirectories.length)) *
              100
          )
        );

        // 回调进度
        if (onProgress) {
          onProgress({ ...this.incrementalState });
        }

        // 让出主线程
        await this.yieldToMainThread();
      }

      // 确定主要语言
      const primaryLanguage = this.determinePrimaryLanguage(languageDistribution);

      // 构建统计信息
      const stats: ProjectStats = {
        totalFiles: files.length,
        totalDirectories: directories.length,
        codeFiles: this.countCodeFiles(languageDistribution),
        totalSize,
        primaryLanguage,
        languageDistribution,
      };

      // 更新缓存
      await this.setProjectCache(projectPath, files, directories, stats);

      return stats;
    } finally {
      this.incrementalState!.loading = false;
      this.incrementalState = null;
    }
  }

  /**
   * 获取增量加载状态
   */
  getIncrementalLoadState(): IncrementalLoadState | null {
    return this.incrementalState ? { ...this.incrementalState } : null;
  }

  /**
   * 检查是否应该忽略该路径
   */
  private shouldIgnore(name: string): boolean {
    return this.config.ignoredPatterns.some(
      (pattern) => name === pattern || name.startsWith(pattern + '/')
    );
  }

  /**
   * 确定主要编程语言
   */
  private determinePrimaryLanguage(distribution: Record<string, number>): string {
    const languageMap: Record<string, string> = {
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.py': 'Python',
      '.java': 'Java',
      '.go': 'Go',
      '.rs': 'Rust',
      '.cpp': 'C++',
      '.c': 'C',
      '.cs': 'C#',
      '.rb': 'Ruby',
      '.php': 'PHP',
      '.swift': 'Swift',
      '.kt': 'Kotlin',
    };

    let maxCount = 0;
    let primaryExt = '';

    for (const [ext, count] of Object.entries(distribution)) {
      if (languageMap[ext] && count > maxCount) {
        maxCount = count;
        primaryExt = ext;
      }
    }

    return languageMap[primaryExt] || 'Unknown';
  }

  /**
   * 统计代码文件数量
   */
  private countCodeFiles(distribution: Record<string, number>): number {
    const codeExtensions = [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.py',
      '.java',
      '.go',
      '.rs',
      '.cpp',
      '.c',
      '.cs',
      '.rb',
      '.php',
      '.swift',
      '.kt',
      '.vue',
      '.svelte',
      '.html',
      '.css',
      '.scss',
      '.less',
      '.sql',
    ];

    return codeExtensions.reduce((sum, ext) => sum + (distribution[ext] || 0), 0);
  }

  /**
   * 让出主线程
   */
  private yieldToMainThread(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
  }

  // ==================== 项目结构缓存相关方法 ====================

  /**
   * 获取项目缓存
   *
   * @param projectPath - 项目路径
   * @returns 缓存条目或 null
   */
  async getProjectCache(projectPath: string): Promise<ProjectCacheEntry | null> {
    // 先检查内存缓存
    const memoryCache = this.projectCache.get(projectPath);
    if (memoryCache) {
      return memoryCache;
    }

    // 检查磁盘缓存
    if (!this.config.enableCaching) {
      return null;
    }

    try {
      const cacheFile = this.getCacheFilePath(projectPath);
      const content = await fs.readFile(cacheFile, 'utf-8');
      const cache = JSON.parse(content) as ProjectCacheEntry;

      // 验证缓存版本
      if (cache.version !== CACHE_VERSION) {
        return null;
      }

      // 存入内存缓存
      this.projectCache.set(projectPath, cache);
      return cache;
    } catch {
      return null;
    }
  }

  /**
   * 设置项目缓存
   *
   * @param projectPath - 项目路径
   * @param files - 文件列表
   * @param directories - 目录列表
   * @param stats - 项目统计
   */
  async setProjectCache(
    projectPath: string,
    files: string[],
    directories: string[],
    stats: ProjectStats
  ): Promise<void> {
    const cache: ProjectCacheEntry = {
      projectPath,
      files,
      directories,
      stats,
      timestamp: Date.now(),
      version: CACHE_VERSION,
      hash: this.computeHash(files),
    };

    // 存入内存缓存
    this.projectCache.set(projectPath, cache);

    // 存入磁盘缓存
    if (this.config.enableCaching) {
      try {
        const cacheFile = this.getCacheFilePath(projectPath);
        await fs.mkdir(path.dirname(cacheFile), { recursive: true });
        await fs.writeFile(cacheFile, JSON.stringify(cache), 'utf-8');
      } catch (error) {
        console.warn('[PerformanceManager] 保存缓存失败:', error);
      }
    }
  }

  /**
   * 使项目缓存失效
   *
   * @param projectPath - 项目路径
   */
  async invalidateProjectCache(projectPath: string): Promise<void> {
    // 从内存缓存移除
    this.projectCache.delete(projectPath);

    // 从磁盘缓存移除
    if (this.config.enableCaching) {
      try {
        const cacheFile = this.getCacheFilePath(projectPath);
        await fs.unlink(cacheFile);
      } catch {
        // 忽略删除失败
      }
    }
  }

  /**
   * 清除所有缓存
   */
  async clearAllCache(): Promise<void> {
    // 清除内存缓存
    this.projectCache.clear();

    // 清除磁盘缓存
    if (this.config.enableCaching) {
      try {
        const files = await fs.readdir(this.config.cacheDir);
        await Promise.all(
          files.map((file) => fs.unlink(path.join(this.config.cacheDir, file)).catch(() => {}))
        );
      } catch {
        // 忽略清除失败
      }
    }
  }

  /**
   * 检查缓存是否过期
   */
  private isCacheExpired(cache: ProjectCacheEntry): boolean {
    return Date.now() - cache.timestamp > this.config.cacheExpiry;
  }

  /**
   * 获取缓存文件路径
   */
  private getCacheFilePath(projectPath: string): string {
    const hash = this.simpleHash(projectPath);
    return path.join(this.config.cacheDir, `project-${hash}.json`);
  }

  /**
   * 计算文件列表哈希
   */
  private computeHash(files: string[]): string {
    return this.simpleHash(files.sort().join('|'));
  }

  /**
   * 简单哈希函数
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转换为 32 位整数
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * 保存缓存到磁盘
   */
  private async saveCacheToDisk(): Promise<void> {
    if (!this.config.enableCaching) return;

    for (const [projectPath, cache] of this.projectCache.entries()) {
      try {
        const cacheFile = this.getCacheFilePath(projectPath);
        await fs.writeFile(cacheFile, JSON.stringify(cache), 'utf-8');
      } catch {
        // 忽略保存失败
      }
    }
  }

  // ==================== 异步 I/O 操作相关方法 ====================

  /**
   * 异步读取文件（带队列管理）
   *
   * @param filePath - 文件路径
   * @param priority - 优先级（数字越小优先级越高）
   * @returns 文件内容
   */
  async readFileAsync(filePath: string, priority: number = 5): Promise<string> {
    return this.enqueueOperation(() => fs.readFile(filePath, 'utf-8'), priority);
  }

  /**
   * 异步写入文件（带队列管理）
   *
   * @param filePath - 文件路径
   * @param content - 文件内容
   * @param priority - 优先级
   */
  async writeFileAsync(filePath: string, content: string, priority: number = 5): Promise<void> {
    return this.enqueueOperation(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
    }, priority);
  }

  /**
   * 批量读取文件
   *
   * @param filePaths - 文件路径列表
   * @returns 文件内容映射
   */
  async readFilesAsync(filePaths: string[]): Promise<Map<string, string | Error>> {
    const results = new Map<string, string | Error>();

    await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          const content = await this.readFileAsync(filePath);
          results.set(filePath, content);
        } catch (error) {
          results.set(filePath, error as Error);
        }
      })
    );

    return results;
  }

  /**
   * 将操作加入队列
   */
  private enqueueOperation<T>(operation: () => Promise<T>, priority: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const item: AsyncQueueItem<T> = {
        operation,
        priority,
        resolve: resolve as (value: unknown) => void,
        reject,
        createdAt: Date.now(),
      };

      // 按优先级插入队列
      const insertIndex = this.asyncQueue.findIndex((q) => q.priority > priority);
      if (insertIndex === -1) {
        this.asyncQueue.push(item as AsyncQueueItem<unknown>);
      } else {
        this.asyncQueue.splice(insertIndex, 0, item as AsyncQueueItem<unknown>);
      }

      // 处理队列
      this.processQueue();
    });
  }

  /**
   * 处理异步操作队列
   */
  private async processQueue(): Promise<void> {
    while (this.asyncQueue.length > 0 && this.activeOperations < this.config.maxConcurrentIO) {
      const item = this.asyncQueue.shift();
      if (!item) break;

      this.activeOperations++;

      try {
        const result = await item.operation();
        item.resolve(result);
      } catch (error) {
        item.reject(error as Error);
      } finally {
        this.activeOperations--;
        // 继续处理队列
        if (this.asyncQueue.length > 0) {
          setImmediate(() => this.processQueue());
        }
      }
    }
  }

  /**
   * 获取队列状态
   */
  getQueueStatus(): { pending: number; active: number } {
    return {
      pending: this.asyncQueue.length,
      active: this.activeOperations,
    };
  }

  // ==================== Token 限制管理相关方法 ====================

  /**
   * Token 限制配置
   */
  private tokenLimits: TokenLimitConfig = {
    maxContextTokens: 200000, // Claude 3.5 Sonnet 上下文窗口
    maxOutputTokens: 8192, // 最大输出 token
    reserveRatio: 0.2, // 预留比例
    warningThreshold: 0.8, // 警告阈值
  };

  /**
   * 设置 token 限制
   *
   * @param config - Token 限制配置
   */
  setTokenLimits(config: Partial<TokenLimitConfig>): void {
    this.tokenLimits = { ...this.tokenLimits, ...config };
  }

  /**
   * 获取 token 限制
   */
  getTokenLimits(): TokenLimitConfig {
    return { ...this.tokenLimits };
  }

  /**
   * 检查 token 使用情况
   *
   * @param currentTokens - 当前使用的 token 数
   * @returns Token 使用状态
   */
  checkTokenUsage(currentTokens: number): TokenUsageStatus {
    const effectiveLimit = this.tokenLimits.maxContextTokens * (1 - this.tokenLimits.reserveRatio);
    const usagePercent = currentTokens / effectiveLimit;

    return {
      currentTokens,
      maxTokens: this.tokenLimits.maxContextTokens,
      effectiveLimit,
      usagePercent,
      available: Math.max(0, effectiveLimit - currentTokens),
      isWarning: usagePercent >= this.tokenLimits.warningThreshold,
      isExceeded: currentTokens >= effectiveLimit,
      recommendation: this.getTokenRecommendation(usagePercent),
    };
  }

  /**
   * 获取 token 使用建议
   */
  private getTokenRecommendation(usagePercent: number): string {
    if (usagePercent >= 1) {
      return '已超出 token 限制，需要压缩上下文或开始新会话';
    } else if (usagePercent >= 0.9) {
      return '接近 token 限制，建议压缩历史消息';
    } else if (usagePercent >= 0.8) {
      return 'Token 使用较高，考虑移除不必要的上下文';
    } else if (usagePercent >= 0.6) {
      return 'Token 使用正常';
    } else {
      return 'Token 使用充足';
    }
  }

  /**
   * 估算文本的 token 数
   *
   * 使用简单的字符计数方法进行估算
   *
   * @param text - 要估算的文本
   * @returns 估算的 token 数
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    // 简单估算：平均每 4 个字符约 1 个 token
    // 中文字符通常每个字符约 1-2 个 token
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars * 1.5 + otherChars * 0.25);
  }

  // ==================== 内存使用监控相关方法 ====================

  /**
   * 获取当前内存使用情况
   */
  getMemoryUsage(): MemoryUsage {
    const usage = process.memoryUsage();
    const usagePercent = usage.heapUsed / this.config.memoryThreshold;

    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      usagePercent,
      overThreshold: usage.heapUsed >= this.config.memoryThreshold,
    };
  }

  /**
   * 启动内存监控
   */
  private startMemoryMonitoring(): void {
    if (this.memoryMonitorInterval) return;

    this.memoryMonitorInterval = setInterval(() => {
      const usage = this.getMemoryUsage();

      if (usage.overThreshold) {
        console.warn(
          `[PerformanceManager] 内存使用超过阈值: ${this.formatBytes(usage.heapUsed)} / ${this.formatBytes(this.config.memoryThreshold)}`
        );
        this.performMemoryCleanup();
      }
    }, this.config.memoryCheckInterval);
  }

  /**
   * 停止内存监控
   */
  private stopMemoryMonitoring(): void {
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
      this.memoryMonitorInterval = null;
    }
  }

  /**
   * 执行内存清理
   */
  performMemoryCleanup(): void {
    // 清理过期的项目缓存
    const now = Date.now();
    for (const [projectPath, cache] of this.projectCache.entries()) {
      if (this.isCacheExpired(cache)) {
        this.projectCache.delete(projectPath);
      }
    }

    // 清理旧的异步操作队列项
    const maxAge = 60000; // 1 分钟
    this.asyncQueue = this.asyncQueue.filter((item) => now - item.createdAt < maxAge);

    // 建议垃圾回收（如果可用）
    if (global.gc) {
      global.gc();
    }

    console.debug('[PerformanceManager] 内存清理完成');
  }

  /**
   * 强制垃圾回收（如果可用）
   */
  forceGC(): boolean {
    if (global.gc) {
      global.gc();
      return true;
    }
    return false;
  }

  /**
   * 格式化字节数
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let value = bytes;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    return `${value.toFixed(2)} ${units[unitIndex]}`;
  }

  // ==================== 配置和状态方法 ====================

  /**
   * 获取配置
   */
  getConfig(): PerformanceConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<PerformanceConfig>): void {
    Object.assign(this.config, config);

    // 如果内存监控配置改变，重新启动监控
    if ('enableMemoryMonitoring' in config) {
      this.stopMemoryMonitoring();
      if (config.enableMemoryMonitoring) {
        this.startMemoryMonitoring();
      }
    }
  }

  /**
   * 获取性能摘要
   */
  getPerformanceSummary(): PerformanceSummary {
    const memory = this.getMemoryUsage();
    const queue = this.getQueueStatus();

    return {
      startup: this.startupMetrics,
      memory,
      asyncQueue: queue,
      cacheSize: this.projectCache.size,
      incrementalLoad: this.incrementalState,
      tokenLimits: this.tokenLimits,
    };
  }
}

/**
 * Token 限制配置
 */
export interface TokenLimitConfig {
  /** 最大上下文 token 数 */
  maxContextTokens: number;
  /** 最大输出 token 数 */
  maxOutputTokens: number;
  /** 预留比例 */
  reserveRatio: number;
  /** 警告阈值 */
  warningThreshold: number;
}

/**
 * Token 使用状态
 */
export interface TokenUsageStatus {
  /** 当前使用的 token 数 */
  currentTokens: number;
  /** 最大 token 数 */
  maxTokens: number;
  /** 有效限制（扣除预留后） */
  effectiveLimit: number;
  /** 使用百分比 */
  usagePercent: number;
  /** 可用 token 数 */
  available: number;
  /** 是否达到警告阈值 */
  isWarning: boolean;
  /** 是否超出限制 */
  isExceeded: boolean;
  /** 建议 */
  recommendation: string;
}

/**
 * 性能摘要
 */
export interface PerformanceSummary {
  /** 启动指标 */
  startup: StartupMetrics | null;
  /** 内存使用 */
  memory: MemoryUsage;
  /** 异步队列状态 */
  asyncQueue: { pending: number; active: number };
  /** 缓存大小 */
  cacheSize: number;
  /** 增量加载状态 */
  incrementalLoad: IncrementalLoadState | null;
  /** Token 限制配置 */
  tokenLimits: TokenLimitConfig;
}
