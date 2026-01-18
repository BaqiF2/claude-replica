jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: jest.fn(),
}));

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Session } from '../../src/core/SessionManager';
import type { SessionManager } from '../../src/core/SessionManager';
import type { OutputInterface } from '../../src/ui/OutputInterface';
import type { MessageRouter } from '../../src/core/MessageRouter';
import type { SDKQueryExecutor } from '../../src/sdk';
import type { PermissionManager } from '../../src/permissions/PermissionManager';
import type { MCPService } from '../../src/mcp/MCPService';
import type { ConfigManager } from '../../src/config';
import type { UIFactory } from '../../src/ui/factories/UIFactory';
import type { Logger } from '../../src/logging/Logger';
import type { InteractiveUIInterface, Snapshot as UISnapshot } from '../../src/ui/InteractiveUIInterface';
import type { CheckpointManager, CheckpointMetadata } from '../../src/checkpoint/CheckpointManager';
import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { InteractiveRunner } from '../../src/runners/InteractiveRunner';

const createSession = (workingDirectory: string, sdkSessionId?: string): Session => ({
  id: 'session-1',
  createdAt: new Date(),
  lastAccessedAt: new Date(),
  messages: [],
  context: {
    workingDirectory,
    projectConfig: {},
    activeAgents: [],
  },
  expired: false,
  workingDirectory,
  sdkSessionId,
});

const createRunner = (
  checkpointManager: CheckpointManager | null,
  ui: InteractiveUIInterface,
  streamingQueryManager?: {
    getQueryInstance: () => Query | null;
    getActiveSession?: () => { session: Session } | null;
  }
): InteractiveRunner => {
  const output: OutputInterface = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
    section: jest.fn(),
    blankLine: jest.fn(),
  };

  const runner = new InteractiveRunner(
    output,
    {} as SessionManager,
    {} as MessageRouter,
    {} as SDKQueryExecutor,
    {} as PermissionManager,
    {} as MCPService,
    checkpointManager,
    {} as ConfigManager,
    {} as UIFactory,
    {
      info: jest.fn().mockResolvedValue(undefined),
      debug: jest.fn().mockResolvedValue(undefined),
      warn: jest.fn().mockResolvedValue(undefined),
      error: jest.fn().mockResolvedValue(undefined),
    } as unknown as Logger
  );

  (runner as unknown as { ui: InteractiveUIInterface | null }).ui = ui;
  if (streamingQueryManager) {
    (runner as unknown as { streamingQueryManager: { getQueryInstance: () => Query | null } })
      .streamingQueryManager = streamingQueryManager;
  }

  return runner;
};

describe('InteractiveRunner checkpoint restore', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interactive-checkpoint-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('shows warning when checkpoint feature is not enabled', async () => {
    const ui = {
      displayWarning: jest.fn(),
    } as unknown as InteractiveUIInterface;
    const runner = createRunner(null, ui);

    await (runner as unknown as { handleRewind: (session: Session) => Promise<void> }).handleRewind(
      createSession(tempDir)
    );

    expect(ui.displayWarning).toHaveBeenCalledWith('Checkpoint feature not enabled');
  });

  it('shows warning when no checkpoints are available', async () => {
    const checkpointManager = {
      initialize: jest.fn().mockResolvedValue(undefined),
      listCheckpoints: jest.fn().mockReturnValue([]),
    } as unknown as CheckpointManager;
    const ui = {
      displayWarning: jest.fn(),
    } as unknown as InteractiveUIInterface;
    const runner = createRunner(checkpointManager, ui, {
      getQueryInstance: () => null,
      getActiveSession: () => ({ session: createSession(tempDir, 'sdk-session-1') }),
    });

    await (runner as unknown as { handleRewind: (session: Session) => Promise<void> }).handleRewind(
      createSession(tempDir)
    );

    expect(checkpointManager.listCheckpoints).toHaveBeenCalledWith({
      sdkSessionId: 'sdk-session-1',
    });
    expect(ui.displayWarning).toHaveBeenCalledWith('No checkpoints available');
  });

  it('restores selected checkpoint and shows success', async () => {
    const checkpoints: CheckpointMetadata[] = [
      {
        id: 'checkpoint-1',
        timestamp: new Date(),
        description: 'First checkpoint',
        sessionId: 'sdk-session-1',
      },
    ];
    const checkpointManager = {
      initialize: jest.fn().mockResolvedValue(undefined),
      listCheckpoints: jest.fn().mockReturnValue(checkpoints),
      restoreCheckpoint: jest.fn().mockResolvedValue(undefined),
    } as unknown as CheckpointManager;
    const selectedSnapshot: UISnapshot = {
      id: 'checkpoint-1',
      timestamp: checkpoints[0].timestamp,
      description: checkpoints[0].description,
      files: [],
    };
    const ui = {
      showRewindMenu: jest.fn().mockResolvedValue(selectedSnapshot),
      displaySuccess: jest.fn(),
      displayError: jest.fn(),
      displayWarning: jest.fn(),
    } as unknown as InteractiveUIInterface;
    const queryInstance = { rewindFiles: jest.fn() } as unknown as Query;
    const runner = createRunner(checkpointManager, ui, {
      getQueryInstance: () => queryInstance,
      getActiveSession: () => ({ session: createSession(tempDir, 'sdk-session-1') }),
    });

    await (runner as unknown as { handleRewind: (session: Session) => Promise<void> }).handleRewind(
      createSession(tempDir)
    );

    expect(ui.showRewindMenu).toHaveBeenCalledWith([
      {
        id: 'checkpoint-1',
        timestamp: checkpoints[0].timestamp,
        description: checkpoints[0].description,
        files: [],
      },
    ]);
    expect(checkpointManager.restoreCheckpoint).toHaveBeenCalledWith(
      'checkpoint-1',
      queryInstance,
      'sdk-session-1'
    );
    expect(ui.displaySuccess).toHaveBeenCalledWith('Restored to checkpoint: First checkpoint');
  });
});
