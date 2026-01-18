import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Query } from '@anthropic-ai/claude-agent-sdk';

const DEFAULT_CHECKPOINT_KEEP_COUNT = parseInt(
  process.env.CLAUDE_CODE_CHECKPOINT_KEEP_COUNT || '10',
  10
);

const SESSION_BASE_DIR =
  process.env.CLAUDE_REPLICA_SESSIONS_DIR || path.join(os.homedir(), '.claude-replica', 'sessions');

interface PersistedCheckpointMetadata {
  id: string;
  timestamp: string;
  description: string;
  sessionId: string;
}

export interface CheckpointMetadata {
  id: string;
  timestamp: Date;
  description: string;
  sessionId: string;
}

export interface CheckpointManagerOptions {
  sessionId?: string;
  sessionsDir?: string;
  checkpointKeepCount?: number;
}

export class CheckpointManager {
  private checkpoints: CheckpointMetadata[] = [];
  private readonly sessionsDir: string;
  private checkpointsDir: string | null = null;
  private metadataPath: string | null = null;
  private sessionId: string | null = null;
  private readonly maxCheckpoints: number;
  private initialized = false;

  constructor(options: CheckpointManagerOptions) {
    this.sessionsDir = options.sessionsDir || SESSION_BASE_DIR;
    this.sessionId = options.sessionId ?? null;
    this.updatePaths();
    this.maxCheckpoints = options.checkpointKeepCount ?? DEFAULT_CHECKPOINT_KEEP_COUNT;
  }

  setSessionId(sessionId: string): void {
    if (this.sessionId === sessionId) {
      return;
    }

    this.sessionId = sessionId;
    this.updatePaths();
    this.checkpoints = [];
    this.initialized = false;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const { checkpointsDir } = this.requirePaths();
    await fs.mkdir(checkpointsDir, { recursive: true });
    await this.loadCheckpoints();
    this.initialized = true;
  }

  async captureCheckpoint(
    uuid: string,
    description: string,
    sessionId: string
  ): Promise<CheckpointMetadata> {
    await this.initialize();

    const checkpoint: CheckpointMetadata = {
      id: uuid,
      timestamp: new Date(),
      description,
      sessionId,
    };

    this.checkpoints.unshift(checkpoint);
    this.pruneCheckpoints();

    try {
      await this.saveCheckpoints();
    } catch (error) {
      console.warn('[CheckpointManager] Failed to save checkpoints:', error);
    }

    return checkpoint;
  }

  listCheckpoints(options?: { sdkSessionId?: string }): CheckpointMetadata[] {
    if (!this.initialized) {
      throw new Error('CheckpointManager not initialized');
    }

    if (options?.sdkSessionId) {
      return this.checkpoints.filter((checkpoint) => checkpoint.sessionId === options.sdkSessionId);
    }

    return [...this.checkpoints];
  }

  async restoreCheckpoint(
    checkpointId: string,
    queryInstance: Query,
    sdkSessionId?: string
  ): Promise<void> {
    await this.initialize();

    const checkpoint = this.checkpoints.find((entry) => entry.id === checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    if (sdkSessionId && checkpoint.sessionId !== sdkSessionId) {
      throw new Error('Checkpoint does not match the active SDK session');
    }

    try {
      await queryInstance.rewindFiles(checkpointId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('No file checkpoint found')) {
        throw new Error(
          'Checkpoint data not found in SDK. ' +
            'This may happen if the session was not properly completed or ' +
            'CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING was not set.'
        );
      }
      throw error;
    }
  }

  private pruneCheckpoints(): void {
    while (this.checkpoints.length > this.maxCheckpoints) {
      this.checkpoints.pop();
    }
  }

  private async saveCheckpoints(): Promise<void> {
    const { checkpointsDir, metadataPath } = this.requirePaths();
    await fs.mkdir(checkpointsDir, { recursive: true });

    const payload = {
      checkpoints: this.checkpoints.map((checkpoint) => ({
        id: checkpoint.id,
        timestamp: checkpoint.timestamp.toISOString(),
        description: checkpoint.description,
        sessionId: checkpoint.sessionId,
      })),
    };

    await fs.writeFile(metadataPath, JSON.stringify(payload, null, 2), 'utf-8');
  }

  private async loadCheckpoints(): Promise<void> {
    this.checkpoints = [];

    try {
      const { metadataPath } = this.requirePaths();
      const content = await fs.readFile(metadataPath, 'utf-8');
      const parsed = JSON.parse(content) as { checkpoints?: PersistedCheckpointMetadata[] };
      if (!Array.isArray(parsed.checkpoints)) {
        return;
      }

      this.checkpoints = parsed.checkpoints.map((checkpoint) => ({
        id: checkpoint.id,
        timestamp: new Date(checkpoint.timestamp),
        description: checkpoint.description,
        sessionId: checkpoint.sessionId,
      }));

      this.checkpoints.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      const errorCode = (error as NodeJS.ErrnoException).code;
      if (errorCode !== 'ENOENT') {
        console.warn('[CheckpointManager] Failed to load checkpoints:', error);
      }
    }
  }

  private updatePaths(): void {
    if (!this.sessionId) {
      this.checkpointsDir = null;
      this.metadataPath = null;
      return;
    }

    this.checkpointsDir = path.join(this.sessionsDir, this.sessionId, 'checkpoints');
    this.metadataPath = path.join(this.checkpointsDir, 'metadata.json');
  }

  private requirePaths(): { checkpointsDir: string; metadataPath: string } {
    if (!this.checkpointsDir || !this.metadataPath) {
      throw new Error('CheckpointManager sessionId not set');
    }

    return {
      checkpointsDir: this.checkpointsDir,
      metadataPath: this.metadataPath,
    };
  }
}
