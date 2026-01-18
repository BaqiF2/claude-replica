jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: jest.fn(),
}));

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { SDKQueryExecutor } from '../../src/sdk/SDKQueryExecutor';
import { StreamingQueryManager } from '../../src/sdk/StreamingQueryManager';
import { MessageRouter } from '../../src/core/MessageRouter';
import { SessionManager } from '../../src/core/SessionManager';
import { PermissionManager } from '../../src/permissions/PermissionManager';
import { ToolRegistry } from '../../src/tools/ToolRegistry';
import { MockPermissionUIFactory } from '../test-helpers/MockPermissionUI';
import { CheckpointManager } from '../../src/checkpoint/CheckpointManager';

const TEMP_DIR_PREFIX = process.env.CHECKPOINT_E2E_TEMP_DIR_PREFIX || 'checkpoint-e2e-';
const CHECKPOINT_KEEP_COUNT = parseInt(process.env.CHECKPOINT_E2E_KEEP_COUNT || '10', 10);
const EXPECTED_CHECKPOINT_COUNT = parseInt(
  process.env.CHECKPOINT_E2E_EXPECTED_COUNT || '1',
  10
);
const CHECKPOINT_INDEX = parseInt(process.env.CHECKPOINT_E2E_INDEX || '0', 10);
const FILE_ENCODING = (process.env.CHECKPOINT_E2E_FILE_ENCODING || 'utf-8') as BufferEncoding;
const SAMPLE_FILE_NAME = process.env.CHECKPOINT_E2E_FILE_NAME || 'sample.txt';
const ORIGINAL_CONTENT = process.env.CHECKPOINT_E2E_ORIGINAL_CONTENT || 'original content';
const UPDATED_CONTENT = process.env.CHECKPOINT_E2E_UPDATED_CONTENT || 'updated content';
const SDK_SESSION_ID = process.env.CHECKPOINT_E2E_SDK_SESSION_ID || 'sdk-session-1';
const USER_MESSAGE_UUID = process.env.CHECKPOINT_E2E_USER_MESSAGE_UUID || 'checkpoint-uuid-1';
const ASSISTANT_MESSAGE_UUID =
  process.env.CHECKPOINT_E2E_ASSISTANT_MESSAGE_UUID || 'assistant-uuid-1';
const RESULT_MESSAGE_UUID = process.env.CHECKPOINT_E2E_RESULT_UUID || 'result-uuid-1';
const ASSISTANT_RESPONSE_TEXT = process.env.CHECKPOINT_E2E_ASSISTANT_RESPONSE || 'done';
const SYSTEM_PROMPT = process.env.CHECKPOINT_E2E_SYSTEM_PROMPT || 'Test system prompt';
const MODEL_NAME = process.env.CHECKPOINT_E2E_MODEL || 'claude-sonnet-4-5-20250929';
const RESULT_DURATION_MS = parseInt(process.env.CHECKPOINT_E2E_DURATION_MS || '1000', 10);
const RESULT_API_DURATION_MS = parseInt(
  process.env.CHECKPOINT_E2E_DURATION_API_MS || '800',
  10
);
const RESULT_NUM_TURNS = parseInt(process.env.CHECKPOINT_E2E_NUM_TURNS || '1', 10);
const RESULT_TOTAL_COST_USD = parseInt(process.env.CHECKPOINT_E2E_TOTAL_COST_USD || '1', 10);
const RESULT_INPUT_TOKENS = parseInt(process.env.CHECKPOINT_E2E_INPUT_TOKENS || '100', 10);
const RESULT_OUTPUT_TOKENS = parseInt(process.env.CHECKPOINT_E2E_OUTPUT_TOKENS || '50', 10);

const mockedQuery = query as jest.MockedFunction<any>;

type CheckpointSnapshotStore = Map<string, string>;

type MockQueryGenerator = AsyncGenerator<any, void, unknown> & {
  rewindFiles: (checkpointId: string) => Promise<void>;
};

const createMockCheckpointQuery = (
  prompt: AsyncGenerator<any, void, unknown>,
  filePath: string,
  snapshotStore: CheckpointSnapshotStore
): MockQueryGenerator => {
  const generator = (async function* () {
    const firstMessage = await prompt.next();
    if (firstMessage.done || !firstMessage.value) {
      return;
    }

    const snapshot = await fs.readFile(filePath, FILE_ENCODING);
    snapshotStore.set(USER_MESSAGE_UUID, snapshot);

    yield {
      type: 'user',
      uuid: USER_MESSAGE_UUID,
      session_id: SDK_SESSION_ID,
      parent_tool_use_id: null,
      message: firstMessage.value.message,
    };

    yield {
      type: 'assistant',
      uuid: ASSISTANT_MESSAGE_UUID,
      session_id: SDK_SESSION_ID,
      parent_tool_use_id: null,
      message: {
        content: [{ type: 'text', text: ASSISTANT_RESPONSE_TEXT }],
      },
    };

    yield {
      type: 'result',
      subtype: 'success',
      uuid: RESULT_MESSAGE_UUID,
      session_id: SDK_SESSION_ID,
      duration_ms: RESULT_DURATION_MS,
      duration_api_ms: RESULT_API_DURATION_MS,
      is_error: false,
      num_turns: RESULT_NUM_TURNS,
      result: ASSISTANT_RESPONSE_TEXT,
      total_cost_usd: RESULT_TOTAL_COST_USD,
      usage: {
        input_tokens: RESULT_INPUT_TOKENS,
        output_tokens: RESULT_OUTPUT_TOKENS,
      },
    };
  })();

  const queryGenerator = generator as MockQueryGenerator;
  queryGenerator.rewindFiles = async (checkpointId: string): Promise<void> => {
    const snapshot = snapshotStore.get(checkpointId);
    if (!snapshot) {
      throw new Error('No file checkpoint found');
    }
    await fs.writeFile(filePath, snapshot, FILE_ENCODING);
  };

  return queryGenerator;
};

describe('checkpoint end-to-end flow', () => {
  let tempDir: string;
  let sessionsDir: string;
  let sdkExecutor: SDKQueryExecutor;
  let streamingQueryManager: StreamingQueryManager;
  let messageRouter: MessageRouter;
  let sessionManager: SessionManager;
  let checkpointManager: CheckpointManager;
  let filePath: string;
  let snapshotStore: CheckpointSnapshotStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_DIR_PREFIX));
    sessionsDir = path.join(tempDir, 'sessions');
    filePath = path.join(tempDir, SAMPLE_FILE_NAME);
    snapshotStore = new Map();

    await fs.writeFile(filePath, ORIGINAL_CONTENT, FILE_ENCODING);

    sdkExecutor = new SDKQueryExecutor();
    sessionManager = new SessionManager(sessionsDir);

    const toolRegistry = new ToolRegistry();
    const permissionManager = new PermissionManager(
      { mode: 'default' },
      new MockPermissionUIFactory(),
      toolRegistry
    );

    messageRouter = new MessageRouter({
      toolRegistry,
      permissionManager,
    });
    messageRouter.setWorkingDirectory(tempDir);

    jest.spyOn(messageRouter, 'buildQueryOptions').mockResolvedValue({
      model: MODEL_NAME,
      systemPrompt: SYSTEM_PROMPT,
      allowedTools: ['Read', 'Write'],
      cwd: tempDir,
      permissionMode: 'default',
      enableFileCheckpointing: true,
    });

    checkpointManager = new CheckpointManager({
      sessionsDir,
      checkpointKeepCount: CHECKPOINT_KEEP_COUNT,
    });

    streamingQueryManager = new StreamingQueryManager({
      messageRouter,
      sdkExecutor,
      sessionManager,
      checkpointManager,
    });

    mockedQuery.mockImplementation((args: { prompt: AsyncGenerator<any, void, unknown> }) =>
      createMockCheckpointQuery(args.prompt, filePath, snapshotStore)
    );
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('captures and restores file checkpoints end-to-end', async () => {
    const session = await sessionManager.createSession(tempDir);

    checkpointManager.setSessionId(session.id);
    await checkpointManager.initialize();

    streamingQueryManager.startSession(session);

    const sendResult = await streamingQueryManager.sendMessage('Update file');
    expect(sendResult.success).toBe(true);

    const sdkResult = await streamingQueryManager.waitForResult();
    expect(sdkResult?.isError).toBe(false);

    const checkpoints = checkpointManager.listCheckpoints();
    expect(checkpoints).toHaveLength(EXPECTED_CHECKPOINT_COUNT);
    const checkpoint = checkpoints[CHECKPOINT_INDEX];

    await fs.writeFile(filePath, UPDATED_CONTENT, FILE_ENCODING);

    const queryInstance = streamingQueryManager.getQueryInstance();
    expect(queryInstance).not.toBeNull();

    await checkpointManager.restoreCheckpoint(checkpoint.id, queryInstance!);

    const restoredContent = await fs.readFile(filePath, FILE_ENCODING);
    expect(restoredContent).toBe(ORIGINAL_CONTENT);

    const metadataPath = path.join(
      sessionsDir,
      session.id,
      'checkpoints',
      'metadata.json'
    );
    const metadataRaw = await fs.readFile(metadataPath, FILE_ENCODING);
    const metadata = JSON.parse(metadataRaw) as {
      checkpoints: Array<{ id: string }>;
    };

    expect(metadata.checkpoints[CHECKPOINT_INDEX].id).toBe(checkpoint.id);
  });
});
