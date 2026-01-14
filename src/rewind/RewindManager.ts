/**
 * 文件功能：回退管理器，负责捕获文件快照、恢复快照和管理快照历史
 *
 * 核心类：
 * - RewindManager: 回退管理器核心类
 *
 * 核心方法：
 * - initialize(): 初始化回退管理器
 * - createSnapshot(): 创建文件快照
 * - restoreSnapshot(): 恢复指定快照
 * - listSnapshots(): 列出所有快照
 * - deleteSnapshot(): 删除指定快照
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * 文件快照内容
 */
export interface FileSnapshot {
  /** 文件路径（相对于工作目录） */
  path: string;
  /** 文件内容 */
  content: string;
  /** 文件是否存在（用于处理新创建的文件） */
  exists: boolean;
}

/**
 * 快照接口
 */
export interface Snapshot {
  /** 快照 ID */
  id: string;
  /** 快照创建时间 */
  timestamp: Date;
  /** 快照描述 */
  description: string;
  /** 文件快照映射（路径 -> 内容） */
  files: Map<string, FileSnapshot>;
  /** 关联的消息 UUID（可选） */
  messageUuid?: string;
}

/**
 * 快照元数据（用于持久化）
 */
export interface SnapshotMetadata {
  id: string;
  timestamp: string;
  description: string;
  messageUuid?: string;
  filePaths: string[];
}

/**
 * 回退管理器配置
 */
export interface RewindManagerOptions {
  /** 工作目录 */
  workingDir: string;
  /** 快照存储目录（可选，默认为 workingDir/.claude/snapshots） */
  snapshotsDir?: string;
  /** 最大快照数量（默认 50） */
  maxSnapshots?: number;
  /** 是否启用调试模式 */
  debug?: boolean;
}

/**
 * 恢复结果
 */
export interface RestoreResult {
  /** 是否成功 */
  success: boolean;
  /** 恢复的文件列表 */
  restoredFiles: string[];
  /** 删除的文件列表（恢复时文件不存在于快照中） */
  deletedFiles: string[];
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 默认最大快照数量
 */
const DEFAULT_MAX_SNAPSHOTS = 50;

/**
 * 回退管理器
 *
 * 提供文件快照的捕获、恢复和管理功能
 */
export class RewindManager {
  /** 工作目录 */
  private readonly workingDir: string;
  /** 快照存储目录 */
  private readonly snapshotsDir: string;
  /** 最大快照数量 */
  private readonly maxSnapshots: number;
  /** 是否启用调试模式 */
  private readonly debug: boolean;
  /** 内存中的快照列表（按时间倒序） */
  private snapshots: Snapshot[] = [];
  /** 是否已初始化 */
  private initialized: boolean = false;

  constructor(options: RewindManagerOptions) {
    this.workingDir = options.workingDir;
    this.snapshotsDir =
      options.snapshotsDir || path.join(options.workingDir, '.claude', 'snapshots');
    this.maxSnapshots = options.maxSnapshots || DEFAULT_MAX_SNAPSHOTS;
    this.debug = options.debug || false;
  }

  /**
   * 生成唯一的快照 ID
   */
  private generateSnapshotId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = crypto.randomBytes(4).toString('hex');
    return `snap-${timestamp}-${randomPart}`;
  }

  /**
   * 获取快照目录路径
   */
  private getSnapshotDir(snapshotId: string): string {
    return path.join(this.snapshotsDir, snapshotId);
  }

  /**
   * 确保快照存储目录存在
   */
  private async ensureSnapshotsDir(): Promise<void> {
    await fs.mkdir(this.snapshotsDir, { recursive: true });
  }

  /**
   * 调试日志
   */
  private log(message: string, ...args: unknown[]): void {
    if (this.debug) {
      console.log(`[RewindManager] ${message}`, ...args);
    }
  }

  /**
   * 初始化回退管理器
   * 加载已存在的快照
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.ensureSnapshotsDir();
    await this.loadSnapshots();
    this.initialized = true;
  }

  /**
   * 从磁盘加载所有快照
   */
  private async loadSnapshots(): Promise<void> {
    this.snapshots = [];

    try {
      const entries = await fs.readdir(this.snapshotsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('snap-')) {
          const snapshot = await this.loadSnapshotFromDisk(entry.name);
          if (snapshot) {
            this.snapshots.push(snapshot);
          }
        }
      }

      // 按时间倒序排序（最新的在前）
      this.snapshots.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      this.log(`已加载 ${this.snapshots.length} 个快照`);
    } catch (error) {
      this.log('加载快照失败:', error);
    }
  }

  /**
   * 从磁盘加载单个快照
   */
  private async loadSnapshotFromDisk(snapshotId: string): Promise<Snapshot | null> {
    const snapshotDir = this.getSnapshotDir(snapshotId);

    try {
      // 加载元数据
      const metadataPath = path.join(snapshotDir, 'metadata.json');
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata: SnapshotMetadata = JSON.parse(metadataContent);

      // 加载文件内容
      const files = new Map<string, FileSnapshot>();
      for (const filePath of metadata.filePaths) {
        const fileSnapshotPath = path.join(snapshotDir, 'files', this.encodeFilePath(filePath));
        try {
          const fileContent = await fs.readFile(fileSnapshotPath, 'utf-8');
          const fileSnapshot: FileSnapshot = JSON.parse(fileContent);
          files.set(filePath, fileSnapshot);
        } catch {
          this.log(`无法加载文件快照: ${filePath}`);
        }
      }

      return {
        id: metadata.id,
        timestamp: new Date(metadata.timestamp),
        description: metadata.description,
        messageUuid: metadata.messageUuid,
        files,
      };
    } catch (error) {
      this.log(`无法加载快照 ${snapshotId}:`, error);
      return null;
    }
  }

  /**
   * 编码文件路径为安全的文件名
   */
  private encodeFilePath(filePath: string): string {
    return Buffer.from(filePath).toString('base64url') + '.json';
  }

  /**
   * 捕获文件快照
   *
   * @param description - 快照描述
   * @param filePaths - 要捕获的文件路径列表（相对于工作目录）
   * @param messageUuid - 关联的消息 UUID（可选）
   * @returns 创建的快照
   */
  async captureSnapshot(
    description: string,
    filePaths: string[],
    messageUuid?: string
  ): Promise<Snapshot> {
    await this.initialize();

    const snapshotId = this.generateSnapshotId();
    const snapshotDir = this.getSnapshotDir(snapshotId);
    const filesDir = path.join(snapshotDir, 'files');

    // 创建快照目录
    await fs.mkdir(filesDir, { recursive: true });

    // 捕获文件内容
    const files = new Map<string, FileSnapshot>();
    const capturedPaths: string[] = [];

    for (const filePath of filePaths) {
      const absolutePath = path.resolve(this.workingDir, filePath);
      let fileSnapshot: FileSnapshot;

      try {
        const content = await fs.readFile(absolutePath, 'utf-8');
        fileSnapshot = {
          path: filePath,
          content,
          exists: true,
        };
      } catch {
        // 文件不存在，记录为不存在状态
        fileSnapshot = {
          path: filePath,
          content: '',
          exists: false,
        };
      }

      files.set(filePath, fileSnapshot);
      capturedPaths.push(filePath);

      // 保存文件快照到磁盘
      const fileSnapshotPath = path.join(filesDir, this.encodeFilePath(filePath));
      await fs.writeFile(fileSnapshotPath, JSON.stringify(fileSnapshot, null, 2), 'utf-8');
    }

    // 创建快照对象
    const snapshot: Snapshot = {
      id: snapshotId,
      timestamp: new Date(),
      description,
      files,
      messageUuid,
    };

    // 保存元数据
    const metadata: SnapshotMetadata = {
      id: snapshotId,
      timestamp: snapshot.timestamp.toISOString(),
      description,
      messageUuid,
      filePaths: capturedPaths,
    };
    await fs.writeFile(
      path.join(snapshotDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );

    // 添加到内存列表
    this.snapshots.unshift(snapshot);

    // 清理超出限制的旧快照
    await this.pruneOldSnapshots();

    this.log(`已创建快照: ${snapshotId}, 包含 ${capturedPaths.length} 个文件`);

    return snapshot;
  }

  /**
   * 清理超出限制的旧快照
   */
  private async pruneOldSnapshots(): Promise<void> {
    while (this.snapshots.length > this.maxSnapshots) {
      const oldestSnapshot = this.snapshots.pop();
      if (oldestSnapshot) {
        await this.deleteSnapshotFromDisk(oldestSnapshot.id);
        this.log(`已删除旧快照: ${oldestSnapshot.id}`);
      }
    }
  }

  /**
   * 从磁盘删除快照
   */
  private async deleteSnapshotFromDisk(snapshotId: string): Promise<void> {
    const snapshotDir = this.getSnapshotDir(snapshotId);
    try {
      await fs.rm(snapshotDir, { recursive: true, force: true });
    } catch (error) {
      this.log(`删除快照失败 ${snapshotId}:`, error);
    }
  }

  /**
   * 恢复到指定快照
   *
   * @param snapshotId - 快照 ID
   * @returns 恢复结果
   */
  async restoreSnapshot(snapshotId: string): Promise<RestoreResult> {
    await this.initialize();

    const snapshot = this.snapshots.find((s) => s.id === snapshotId);
    if (!snapshot) {
      return {
        success: false,
        restoredFiles: [],
        deletedFiles: [],
        error: `Snapshot not found: ${snapshotId}`,
      };
    }

    const restoredFiles: string[] = [];
    const deletedFiles: string[] = [];
    const errors: string[] = [];

    for (const [filePath, fileSnapshot] of snapshot.files) {
      const absolutePath = path.resolve(this.workingDir, filePath);

      try {
        if (fileSnapshot.exists) {
          // 恢复文件内容
          const dir = path.dirname(absolutePath);
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(absolutePath, fileSnapshot.content, 'utf-8');
          restoredFiles.push(filePath);
        } else {
          // 文件在快照时不存在，删除当前文件（如果存在）
          try {
            await fs.unlink(absolutePath);
            deletedFiles.push(filePath);
          } catch {
            // 文件可能已经不存在，忽略
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to restore file ${filePath}: ${errorMsg}`);
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        restoredFiles,
        deletedFiles,
        error: errors.join('; '),
      };
    }

    this.log(
      `已恢复快照: ${snapshotId}, 恢复 ${restoredFiles.length} 个文件, 删除 ${deletedFiles.length} 个文件`
    );

    return {
      success: true,
      restoredFiles,
      deletedFiles,
    };
  }

  /**
   * 列出所有快照
   *
   * @returns 快照列表（按时间倒序）
   */
  async listSnapshots(): Promise<Snapshot[]> {
    await this.initialize();
    return [...this.snapshots];
  }

  /**
   * 删除快照
   *
   * @param snapshotId - 快照 ID
   * @returns 是否成功删除
   */
  async deleteSnapshot(snapshotId: string): Promise<boolean> {
    await this.initialize();

    const index = this.snapshots.findIndex((s) => s.id === snapshotId);
    if (index === -1) {
      return false;
    }

    this.snapshots.splice(index, 1);
    await this.deleteSnapshotFromDisk(snapshotId);

    this.log(`已删除快照: ${snapshotId}`);
    return true;
  }

  /**
   * 清除所有快照
   */
  async clearSnapshots(): Promise<void> {
    await this.initialize();

    for (const snapshot of this.snapshots) {
      await this.deleteSnapshotFromDisk(snapshot.id);
    }

    this.snapshots = [];
    this.log('已清除所有快照');
  }

  /**
   * 比较当前文件状态与快照
   *
   * @param snapshotId - 快照 ID
   * @returns 差异信息
   */
  async compareWithSnapshot(snapshotId: string): Promise<{
    modified: string[];
    added: string[];
    deleted: string[];
  } | null> {
    await this.initialize();

    const snapshot = this.snapshots.find((s) => s.id === snapshotId);
    if (!snapshot) {
      return null;
    }

    const modified: string[] = [];
    const added: string[] = [];
    const deleted: string[] = [];

    for (const [filePath, fileSnapshot] of snapshot.files) {
      const absolutePath = path.resolve(this.workingDir, filePath);

      try {
        const currentContent = await fs.readFile(absolutePath, 'utf-8');

        if (!fileSnapshot.exists) {
          // 快照时文件不存在，现在存在
          added.push(filePath);
        } else if (currentContent !== fileSnapshot.content) {
          // 文件内容已修改
          modified.push(filePath);
        }
      } catch {
        if (fileSnapshot.exists) {
          // 快照时文件存在，现在不存在
          deleted.push(filePath);
        }
      }
    }

    return { modified, added, deleted };
  }
}
