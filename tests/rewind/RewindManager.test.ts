/**
 * RewindManager 属性测试
 *
 * **Feature: claude-code-replica, Property 6: 回退操作的可逆性**
 * **验证: 需求 15.3**
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  RewindManager,
  Snapshot,
} from '../../src/rewind/RewindManager';

describe('RewindManager', () => {
  let rewindManager: RewindManager;
  let tempDir: string;

  beforeEach(async () => {
    // 创建临时目录用于测试
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rewind-test-'));
    rewindManager = new RewindManager({
      workingDir: tempDir,
      maxSnapshots: 50,
      debug: false,
    });
  });

  afterEach(async () => {
    // 清理临时目录
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  describe('captureSnapshot', () => {
    it('应该捕获单个文件的快照', async () => {
      // 创建测试文件
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'Hello, World!', 'utf-8');

      const snapshot = await rewindManager.captureSnapshot(
        '测试快照',
        ['test.txt']
      );

      expect(snapshot.id).toMatch(/^snap-/);
      expect(snapshot.description).toBe('测试快照');
      expect(snapshot.files.size).toBe(1);
      expect(snapshot.files.get('test.txt')?.content).toBe('Hello, World!');
      expect(snapshot.files.get('test.txt')?.exists).toBe(true);
    });

    it('应该捕获多个文件的快照', async () => {
      // 创建测试文件
      await fs.writeFile(path.join(tempDir, 'file1.txt'), 'Content 1', 'utf-8');
      await fs.writeFile(path.join(tempDir, 'file2.txt'), 'Content 2', 'utf-8');

      const snapshot = await rewindManager.captureSnapshot(
        '多文件快照',
        ['file1.txt', 'file2.txt']
      );

      expect(snapshot.files.size).toBe(2);
      expect(snapshot.files.get('file1.txt')?.content).toBe('Content 1');
      expect(snapshot.files.get('file2.txt')?.content).toBe('Content 2');
    });

    it('应该处理不存在的文件', async () => {
      const snapshot = await rewindManager.captureSnapshot(
        '不存在的文件',
        ['nonexistent.txt']
      );

      expect(snapshot.files.size).toBe(1);
      expect(snapshot.files.get('nonexistent.txt')?.exists).toBe(false);
      expect(snapshot.files.get('nonexistent.txt')?.content).toBe('');
    });

    it('应该关联消息 UUID', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content', 'utf-8');

      const snapshot = await rewindManager.captureSnapshot(
        '带 UUID 的快照',
        ['test.txt'],
        'msg-123-456'
      );

      expect(snapshot.messageUuid).toBe('msg-123-456');
    });
  });

  describe('restoreSnapshot', () => {
    it('应该恢复文件到快照状态', async () => {
      // 创建并捕获原始状态
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'Original Content', 'utf-8');

      const snapshot = await rewindManager.captureSnapshot(
        '原始状态',
        ['test.txt']
      );

      // 修改文件
      await fs.writeFile(testFile, 'Modified Content', 'utf-8');

      // 恢复快照
      const result = await rewindManager.restoreSnapshot(snapshot.id);

      expect(result.success).toBe(true);
      expect(result.restoredFiles).toContain('test.txt');

      // 验证文件内容已恢复
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('Original Content');
    });

    it('应该删除快照时不存在的文件', async () => {
      // 捕获空状态（文件不存在）
      const snapshot = await rewindManager.captureSnapshot(
        '空状态',
        ['new-file.txt']
      );

      // 创建文件
      const testFile = path.join(tempDir, 'new-file.txt');
      await fs.writeFile(testFile, 'New Content', 'utf-8');

      // 恢复快照（应该删除文件）
      const result = await rewindManager.restoreSnapshot(snapshot.id);

      expect(result.success).toBe(true);
      expect(result.deletedFiles).toContain('new-file.txt');

      // 验证文件已删除
      await expect(fs.access(testFile)).rejects.toThrow();
    });

    it('不存在的快照应返回错误', async () => {
      const result = await rewindManager.restoreSnapshot('nonexistent-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('快照不存在');
    });
  });

  describe('listSnapshots', () => {
    it('应该列出所有快照', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content', 'utf-8');

      await rewindManager.captureSnapshot('快照 1', ['test.txt']);
      await rewindManager.captureSnapshot('快照 2', ['test.txt']);
      await rewindManager.captureSnapshot('快照 3', ['test.txt']);

      const snapshots = await rewindManager.listSnapshots();

      expect(snapshots).toHaveLength(3);
    });

    it('应该按时间倒序排列', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content', 'utf-8');

      const snap1 = await rewindManager.captureSnapshot('快照 1', ['test.txt']);
      const snap2 = await rewindManager.captureSnapshot('快照 2', ['test.txt']);
      const snap3 = await rewindManager.captureSnapshot('快照 3', ['test.txt']);

      const snapshots = await rewindManager.listSnapshots();

      // 最新的在前
      expect(snapshots[0].id).toBe(snap3.id);
      expect(snapshots[1].id).toBe(snap2.id);
      expect(snapshots[2].id).toBe(snap1.id);
    });

    it('空列表应返回空数组', async () => {
      const snapshots = await rewindManager.listSnapshots();
      expect(snapshots).toHaveLength(0);
    });
  });

  describe('maxSnapshots', () => {
    it('应该限制快照数量', async () => {
      const manager = new RewindManager({
        workingDir: tempDir,
        maxSnapshots: 3,
        debug: false,
      });

      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content', 'utf-8');

      // 创建 5 个快照
      for (let i = 0; i < 5; i++) {
        await manager.captureSnapshot(`快照 ${i}`, ['test.txt']);
      }

      const snapshots = await manager.listSnapshots();

      // 应该只保留最新的 3 个
      expect(snapshots).toHaveLength(3);
    });
  });

  describe('deleteSnapshot', () => {
    it('应该删除指定快照', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content', 'utf-8');

      const snapshot = await rewindManager.captureSnapshot('测试', ['test.txt']);
      const deleted = await rewindManager.deleteSnapshot(snapshot.id);

      expect(deleted).toBe(true);

      const snapshots = await rewindManager.listSnapshots();
      expect(snapshots).toHaveLength(0);
    });

    it('删除不存在的快照应返回 false', async () => {
      const deleted = await rewindManager.deleteSnapshot('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('clearSnapshots', () => {
    it('应该清除所有快照', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content', 'utf-8');

      await rewindManager.captureSnapshot('快照 1', ['test.txt']);
      await rewindManager.captureSnapshot('快照 2', ['test.txt']);

      await rewindManager.clearSnapshots();

      const snapshots = await rewindManager.listSnapshots();
      expect(snapshots).toHaveLength(0);
    });
  });

  describe('getSnapshotByMessageUuid', () => {
    it('应该根据消息 UUID 获取快照', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content', 'utf-8');

      await rewindManager.captureSnapshot('快照 1', ['test.txt'], 'uuid-1');
      await rewindManager.captureSnapshot('快照 2', ['test.txt'], 'uuid-2');

      const snapshot = await rewindManager.getSnapshotByMessageUuid('uuid-1');

      expect(snapshot).not.toBeNull();
      expect(snapshot?.messageUuid).toBe('uuid-1');
    });

    it('不存在的 UUID 应返回 null', async () => {
      const snapshot = await rewindManager.getSnapshotByMessageUuid('nonexistent');
      expect(snapshot).toBeNull();
    });
  });

  describe('compareWithSnapshot', () => {
    it('应该检测文件修改', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'Original', 'utf-8');

      const snapshot = await rewindManager.captureSnapshot('原始', ['test.txt']);

      // 修改文件
      await fs.writeFile(testFile, 'Modified', 'utf-8');

      const diff = await rewindManager.compareWithSnapshot(snapshot.id);

      expect(diff?.modified).toContain('test.txt');
      expect(diff?.added).toHaveLength(0);
      expect(diff?.deleted).toHaveLength(0);
    });

    it('应该检测新增文件', async () => {
      // 捕获空状态
      const snapshot = await rewindManager.captureSnapshot('空', ['new.txt']);

      // 创建文件
      await fs.writeFile(path.join(tempDir, 'new.txt'), 'content', 'utf-8');

      const diff = await rewindManager.compareWithSnapshot(snapshot.id);

      expect(diff?.added).toContain('new.txt');
    });

    it('应该检测删除的文件', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'content', 'utf-8');

      const snapshot = await rewindManager.captureSnapshot('有文件', ['test.txt']);

      // 删除文件
      await fs.unlink(testFile);

      const diff = await rewindManager.compareWithSnapshot(snapshot.id);

      expect(diff?.deleted).toContain('test.txt');
    });
  });


  describe('persistence', () => {
    it('应该持久化快照到磁盘', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content', 'utf-8');

      const snapshot = await rewindManager.captureSnapshot('持久化测试', ['test.txt']);

      // 创建新的管理器实例
      const newManager = new RewindManager({
        workingDir: tempDir,
        debug: false,
      });

      const loadedSnapshots = await newManager.listSnapshots();

      expect(loadedSnapshots).toHaveLength(1);
      expect(loadedSnapshots[0].id).toBe(snapshot.id);
      expect(loadedSnapshots[0].description).toBe('持久化测试');
    });
  });

  /**
   * 属性 6: 回退操作的可逆性
   *
   * *对于任意*文件修改序列，如果创建了快照，则回退到该快照应该恢复所有文件到快照时的状态。
   *
   * **验证: 需求 15.3**
   */
  describe('Property 6: 回退操作的可逆性', () => {
    // 生成有效的文件名（不包含特殊字符）
    const arbFileName = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,20}$/)
      .filter(s => s.length > 0 && s.length <= 20);

    // 生成文件内容
    const arbFileContent = fc.string({ minLength: 0, maxLength: 1000 })
      .filter(s => !s.includes('\0')); // 排除空字符

    // 生成文件扩展名
    const arbExtension = fc.constantFrom('.txt', '.md', '.json', '.ts', '.js');

    // 生成完整文件名
    const arbFullFileName = fc.tuple(arbFileName, arbExtension)
      .map(([name, ext]) => `${name}${ext}`);

    // 生成文件信息
    const arbFileInfo = fc.record({
      name: arbFullFileName,
      content: arbFileContent,
    });

    it('捕获快照后恢复应该还原文件内容', () => {
      return fc.assert(
        fc.asyncProperty(
          arbFileInfo,
          arbFileContent,
          async (fileInfo, newContent) => {
            // 创建新的临时目录
            const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbt-rewind-'));
            const manager = new RewindManager({
              workingDir: testDir,
              debug: false,
            });

            try {
              const filePath = path.join(testDir, fileInfo.name);

              // 1. 创建原始文件
              await fs.writeFile(filePath, fileInfo.content, 'utf-8');

              // 2. 捕获快照
              const snapshot = await manager.captureSnapshot(
                '原始状态',
                [fileInfo.name]
              );

              // 3. 修改文件
              await fs.writeFile(filePath, newContent, 'utf-8');

              // 4. 恢复快照
              const result = await manager.restoreSnapshot(snapshot.id);

              // 5. 验证恢复成功
              expect(result.success).toBe(true);

              // 6. 验证文件内容已恢复
              const restoredContent = await fs.readFile(filePath, 'utf-8');
              expect(restoredContent).toBe(fileInfo.content);
            } finally {
              // 清理
              await fs.rm(testDir, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('多个文件的快照恢复应该还原所有文件', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.array(arbFileInfo, { minLength: 1, maxLength: 5 }),
          async (files) => {
            // 确保文件名唯一
            const uniqueFiles = files.filter((f, i, arr) => 
              arr.findIndex(x => x.name === f.name) === i
            );
            
            if (uniqueFiles.length === 0) return;

            const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbt-rewind-multi-'));
            const manager = new RewindManager({
              workingDir: testDir,
              debug: false,
            });

            try {
              // 1. 创建所有原始文件
              for (const file of uniqueFiles) {
                await fs.writeFile(path.join(testDir, file.name), file.content, 'utf-8');
              }

              // 2. 捕获快照
              const snapshot = await manager.captureSnapshot(
                '多文件快照',
                uniqueFiles.map(f => f.name)
              );

              // 3. 修改所有文件
              for (const file of uniqueFiles) {
                await fs.writeFile(path.join(testDir, file.name), 'MODIFIED', 'utf-8');
              }

              // 4. 恢复快照
              const result = await manager.restoreSnapshot(snapshot.id);

              // 5. 验证恢复成功
              expect(result.success).toBe(true);

              // 6. 验证所有文件内容已恢复
              for (const file of uniqueFiles) {
                const restoredContent = await fs.readFile(path.join(testDir, file.name), 'utf-8');
                expect(restoredContent).toBe(file.content);
              }
            } finally {
              await fs.rm(testDir, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('恢复快照应该删除快照时不存在的文件', () => {
      return fc.assert(
        fc.asyncProperty(
          arbFileInfo,
          async (fileInfo) => {
            const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbt-rewind-delete-'));
            const manager = new RewindManager({
              workingDir: testDir,
              debug: false,
            });

            try {
              const filePath = path.join(testDir, fileInfo.name);

              // 1. 捕获空状态（文件不存在）
              const snapshot = await manager.captureSnapshot(
                '空状态',
                [fileInfo.name]
              );

              // 2. 创建文件
              await fs.writeFile(filePath, fileInfo.content, 'utf-8');

              // 验证文件存在
              await expect(fs.access(filePath)).resolves.toBeUndefined();

              // 3. 恢复快照
              const result = await manager.restoreSnapshot(snapshot.id);

              // 4. 验证恢复成功
              expect(result.success).toBe(true);

              // 5. 验证文件已删除
              await expect(fs.access(filePath)).rejects.toThrow();
            } finally {
              await fs.rm(testDir, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('连续多次快照和恢复应该保持一致性', () => {
      return fc.assert(
        fc.asyncProperty(
          arbFileInfo,
          fc.array(arbFileContent, { minLength: 2, maxLength: 5 }),
          async (fileInfo, contentSequence) => {
            const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbt-rewind-seq-'));
            const manager = new RewindManager({
              workingDir: testDir,
              debug: false,
            });

            try {
              const filePath = path.join(testDir, fileInfo.name);
              const snapshots: Snapshot[] = [];

              // 1. 创建初始文件
              await fs.writeFile(filePath, fileInfo.content, 'utf-8');
              snapshots.push(await manager.captureSnapshot('初始', [fileInfo.name]));

              // 2. 依次修改文件并创建快照
              for (const content of contentSequence) {
                await fs.writeFile(filePath, content, 'utf-8');
                snapshots.push(await manager.captureSnapshot('修改', [fileInfo.name]));
              }

              // 3. 随机选择一个快照恢复
              const randomIndex = Math.floor(Math.random() * snapshots.length);
              const targetSnapshot = snapshots[randomIndex];
              const expectedContent = randomIndex === 0 
                ? fileInfo.content 
                : contentSequence[randomIndex - 1];

              // 4. 恢复快照
              const result = await manager.restoreSnapshot(targetSnapshot.id);

              // 5. 验证恢复成功
              expect(result.success).toBe(true);

              // 6. 验证文件内容正确
              const restoredContent = await fs.readFile(filePath, 'utf-8');
              expect(restoredContent).toBe(expectedContent);
            } finally {
              await fs.rm(testDir, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('快照数量限制应该正确工作', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1, max: 20 }),
          async (maxSnapshots, numCreated) => {
            const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbt-rewind-limit-'));
            const manager = new RewindManager({
              workingDir: testDir,
              maxSnapshots,
              debug: false,
            });

            try {
              // 创建测试文件
              await fs.writeFile(path.join(testDir, 'test.txt'), 'content', 'utf-8');

              // 创建多个快照
              for (let i = 0; i < numCreated; i++) {
                await manager.captureSnapshot(`快照 ${i}`, ['test.txt']);
              }

              // 验证快照数量不超过限制
              const snapshots = await manager.listSnapshots();
              expect(snapshots.length).toBeLessThanOrEqual(maxSnapshots);
              expect(snapshots.length).toBe(Math.min(numCreated, maxSnapshots));
            } finally {
              await fs.rm(testDir, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('快照应该按时间倒序排列', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 10 }),
          async (numSnapshots) => {
            const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbt-rewind-order-'));
            const manager = new RewindManager({
              workingDir: testDir,
              debug: false,
            });

            try {
              await fs.writeFile(path.join(testDir, 'test.txt'), 'content', 'utf-8');

              // 创建多个快照
              for (let i = 0; i < numSnapshots; i++) {
                await manager.captureSnapshot(`快照 ${i}`, ['test.txt']);
              }

              // 获取快照列表
              const snapshots = await manager.listSnapshots();

              // 验证按时间倒序排列
              for (let i = 1; i < snapshots.length; i++) {
                expect(snapshots[i - 1].timestamp.getTime())
                  .toBeGreaterThanOrEqual(snapshots[i].timestamp.getTime());
              }
            } finally {
              await fs.rm(testDir, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
