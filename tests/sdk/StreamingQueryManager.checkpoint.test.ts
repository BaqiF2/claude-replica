import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { SDKMessage, Query } from '@anthropic-ai/claude-agent-sdk';
import { StreamingQueryManager } from '../../src/sdk/StreamingQueryManager';
import { MessageRouter } from '../../src/core/MessageRouter';
import { Session, SessionManager } from '../../src/core/SessionManager';
import { PermissionManager } from '../../src/permissions/PermissionManager';
import { ToolRegistry } from '../../src/tools/ToolRegistry';
import { MockPermissionUIFactory } from '../test-helpers/MockPermissionUI';
import type { CheckpointManager } from '../../src/checkpoint/CheckpointManager';
import type { SDKQueryExecutor, SDKQueryResult } from '../../src/sdk/SDKQueryExecutor';

const DESCRIPTION_LIMIT = parseInt(
  process.env.CLAUDE_CODE_CHECKPOINT_DESCRIPTION_MAX_LENGTH || '80',
  10
);

const createMockSession = (workingDirectory: string, sdkSessionId?: string): Session => ({
  id: 'test-session-id',
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

const createMockSDKResult = (): SDKQueryResult => ({
  response: 'ok',
  isError: false,
  sessionId: 'sdk-session-id',
});

describe('StreamingQueryManager checkpoint capture', () => {
  let tempDir: string;
  let manager: StreamingQueryManager;
  let mockSDKExecutor: jest.Mocked<SDKQueryExecutor>;
  let mockMessageRouter: MessageRouter;
  let sessionManager: SessionManager;
  let checkpointManager: jest.Mocked<CheckpointManager>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'streaming-checkpoint-'));

    mockSDKExecutor = {
      execute: jest.fn(),
      executeStreaming: jest.fn(),
      interrupt: jest.fn(),
      isRunning: jest.fn(),
      isInterrupted: jest.fn(),
      mapToSDKOptions: jest.fn(),
      processMessage: jest.fn(),
      extractTextFromAssistantMessage: jest.fn(),
    } as unknown as jest.Mocked<SDKQueryExecutor>;

    const permissionManager = new PermissionManager(
      { mode: 'default' },
      new MockPermissionUIFactory(),
      new ToolRegistry()
    );

    mockMessageRouter = new MessageRouter({ permissionManager });
    sessionManager = new SessionManager(path.join(tempDir, 'sessions'));

    jest.spyOn(mockMessageRouter, 'buildQueryOptions').mockResolvedValue({
      model: 'claude-sonnet-4-5-20250929',
      systemPrompt: 'Test system prompt',
      allowedTools: ['Read', 'Write'],
      cwd: tempDir,
      permissionMode: 'default',
      enableFileCheckpointing: true,
    });

    jest.spyOn(mockMessageRouter, 'buildStreamMessage').mockResolvedValue({
      contentBlocks: [{ type: 'text', text: 'Test message' }],
      processedText: 'Test message',
      images: [],
      errors: [],
    });

    checkpointManager = {
      captureCheckpoint: jest.fn(),
      listCheckpoints: jest.fn(),
      restoreCheckpoint: jest.fn(),
      initialize: jest.fn(),
    } as unknown as jest.Mocked<CheckpointManager>;

    manager = new StreamingQueryManager({
      messageRouter: mockMessageRouter,
      sdkExecutor: mockSDKExecutor,
      sessionManager,
      checkpointManager,
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('captures user message checkpoint with extracted description', () => {
    const session = createMockSession(tempDir, 'sdk-session-1');
    manager.startSession(session);

    const content = 'Line 1\nLine 2';
    const message: SDKMessage = {
      type: 'user',
      uuid: '00000000-0000-0000-0000-000000000001',
      session_id: 'sdk-session-1',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content,
      },
    };

    (manager as unknown as { handleSDKMessage: (msg: SDKMessage) => void }).handleSDKMessage(
      message
    );

    expect(checkpointManager.captureCheckpoint).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001',
      'Line 1 Line 2'.substring(0, DESCRIPTION_LIMIT),
      'sdk-session-1'
    );
  });

  it('extracts description from text blocks', () => {
    const message: SDKMessage = {
      type: 'user',
      uuid: '00000000-0000-0000-0000-000000000002',
      session_id: 'sdk-session-1',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: [
          { type: 'text', text: 'First block' },
          { type: 'text', text: 'Second block' },
        ],
      },
    };

    const description = (
      manager as unknown as { extractCheckpointDescription: (msg: SDKMessage) => string }
    ).extractCheckpointDescription(message);

    expect(description).toBe('First block');
  });

  it('returns null when tool result blocks are present', () => {
    const message: SDKMessage = {
      type: 'user',
      uuid: '00000000-0000-0000-0000-000000000003',
      session_id: 'sdk-session-1',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'ok' }],
      },
    };

    const description = (
      manager as unknown as { extractCheckpointDescription: (msg: SDKMessage) => string | null }
    ).extractCheckpointDescription(message);

    expect(description).toBeNull();
  });

  it('exposes query instance after execution starts', async () => {
    const session = createMockSession(tempDir, 'sdk-session-1');
    manager.startSession(session);

    const queryInstance = {
      rewindFiles: jest.fn(),
    } as unknown as Query;

    mockSDKExecutor.executeStreaming.mockImplementation(async (_generator, options) => {
      if (options?.onQueryCreated) {
        options.onQueryCreated(queryInstance);
      }
      return createMockSDKResult();
    });

    await manager.sendMessage('Hello');

    expect(manager.getQueryInstance()).toBe(queryInstance);
  });
});
