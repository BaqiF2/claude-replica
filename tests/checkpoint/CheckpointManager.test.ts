import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { CheckpointManager, CheckpointMetadata } from '../../src/checkpoint/CheckpointManager';

describe('CheckpointManager', () => {
  let tempDir: string;
  let manager: CheckpointManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkpoint-test-'));
    manager = new CheckpointManager({
      sessionId: 'session-123',
      sessionsDir: tempDir,
      checkpointKeepCount: 2,
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('initializes and loads persisted checkpoints', async () => {
    const checkpointDir = path.join(tempDir, 'session-123', 'checkpoints');
    await fs.mkdir(checkpointDir, { recursive: true });

    const persisted: CheckpointMetadata[] = [
      {
        id: 'msg-1',
        timestamp: new Date('2026-01-18T10:00:00Z'),
        description: 'First checkpoint',
        sessionId: 'sdk-session-1',
      },
      {
        id: 'msg-2',
        timestamp: new Date('2026-01-18T11:00:00Z'),
        description: 'Second checkpoint',
        sessionId: 'sdk-session-1',
      },
    ];

    await fs.writeFile(
      path.join(checkpointDir, 'metadata.json'),
      JSON.stringify(
        {
          checkpoints: persisted.map((checkpoint) => ({
            ...checkpoint,
            timestamp: checkpoint.timestamp.toISOString(),
          })),
        },
        null,
        2
      ),
      'utf-8'
    );

    await manager.initialize();
    const checkpoints = manager.listCheckpoints();

    expect(checkpoints).toHaveLength(2);
    expect(checkpoints[0].id).toBe('msg-2');
    expect(checkpoints[0].timestamp).toBeInstanceOf(Date);
  });

  it('captures checkpoints and enforces keep count', async () => {
    await manager.captureCheckpoint('msg-1', 'First', 'sdk-session-1');
    await manager.captureCheckpoint('msg-2', 'Second', 'sdk-session-1');
    await manager.captureCheckpoint('msg-3', 'Third', 'sdk-session-1');

    const checkpoints = manager.listCheckpoints();

    expect(checkpoints).toHaveLength(2);
    expect(checkpoints[0].id).toBe('msg-3');
    expect(checkpoints[1].id).toBe('msg-2');

    const metadataPath = path.join(
      tempDir,
      'session-123',
      'checkpoints',
      'metadata.json'
    );
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8')) as {
      checkpoints: Array<{ id: string }>;
    };

    expect(metadata.checkpoints).toHaveLength(2);
  });

  it('restores checkpoint via query instance', async () => {
    await manager.captureCheckpoint('msg-1', 'Checkpoint', 'sdk-session-1');
    const query = {
      rewindFiles: jest.fn().mockResolvedValue(undefined),
    } as unknown as Query;

    await manager.restoreCheckpoint('msg-1', query);

    expect(query.rewindFiles).toHaveBeenCalledWith('msg-1');
  });

  it('throws when restoring unknown checkpoint', async () => {
    const query = {
      rewindFiles: jest.fn().mockResolvedValue(undefined),
    } as unknown as Query;

    await expect(manager.restoreCheckpoint('missing', query)).rejects.toThrow(
      'Checkpoint not found: missing'
    );
  });

  it('wraps SDK missing checkpoint errors', async () => {
    await manager.captureCheckpoint('msg-1', 'Checkpoint', 'sdk-session-1');
    const query = {
      rewindFiles: jest.fn().mockRejectedValue(new Error('No file checkpoint found')),
    } as unknown as Query;

    await expect(manager.restoreCheckpoint('msg-1', query)).rejects.toThrow(
      'Checkpoint data not found in SDK.'
    );
  });
});
