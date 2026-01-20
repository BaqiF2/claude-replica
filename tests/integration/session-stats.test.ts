/**
 * Session stats integration tests
 *
 * 验证 SDK 响应到 UI /stats 输出的完整数据流与缓存统计累加
 */

import { Readable, Writable } from 'stream';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// 模拟 SDK 模块
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: jest.fn(),
}));

import { query } from '@anthropic-ai/claude-agent-sdk';
import { SDKQueryExecutor } from '../../src/sdk/SDKQueryExecutor';
import { SessionManager } from '../../src/core/SessionManager';
import { TerminalInteractiveUI } from '../../src/ui/TerminalInteractiveUI';
import type { InteractiveUICallbacks } from '../../src/ui/contracts/interactive/InteractiveUIInterface';

const TEST_DELAY_MS = parseInt(process.env.TERMINAL_UI_TEST_DELAY_MS || '10', 10);

const mockedQuery = query as jest.MockedFunction<any>;

const createMockInput = (): Readable & { push: (data: string | null) => boolean } => {
  const input = new Readable({
    read() {},
  });
  return input as Readable & { push: (data: string | null) => boolean };
};

const createMockOutput = (): Writable & { getOutput: () => string } => {
  let buffer = '';
  const output = new Writable({
    write(chunk, _encoding, callback) {
      buffer += chunk.toString();
      callback();
    },
  }) as Writable & { getOutput: () => string };

  output.getOutput = () => buffer;
  return output;
};

const createCallbacks = (
  overrides: Partial<InteractiveUICallbacks> = {}
): InteractiveUICallbacks => ({
  onMessage: async () => {},
  onInterrupt: () => {},
  onRewind: async () => {},
  ...overrides,
});

async function* createMockSDKResponse(
  textContent: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  },
  sessionId: string = 'test-sdk-session'
): AsyncGenerator<any, void, unknown> {
  yield {
    type: 'assistant',
    uuid: 'msg-uuid-1',
    session_id: sessionId,
    message: {
      content: [{ type: 'text', text: textContent }],
    },
    parent_tool_use_id: null,
  };

  yield {
    type: 'result',
    subtype: 'success',
    uuid: 'result-uuid',
    session_id: sessionId,
    duration_ms: 1000,
    duration_api_ms: 800,
    is_error: false,
    num_turns: 1,
    result: textContent,
    total_cost_usd: 0.01,
    usage: {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens,
      cache_read_input_tokens: usage.cache_read_input_tokens,
    },
  };
}

describe('Session stats integration', () => {
  let tempDir: string;
  let sessionManager: SessionManager;
  let sdkExecutor: SDKQueryExecutor;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-stats-'));
    sessionManager = new SessionManager(path.join(tempDir, 'sessions'));
    sdkExecutor = new SDKQueryExecutor();
    mockedQuery.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should aggregate cache stats across turns and display /stats output', async () => {
    const session = await sessionManager.createSession(tempDir);

    mockedQuery
      .mockReturnValueOnce(
        createMockSDKResponse('Reply 1', {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 20,
          cache_read_input_tokens: 10,
        })
      )
      .mockReturnValueOnce(
        createMockSDKResponse('Reply 2', {
          input_tokens: 100,
          output_tokens: 70,
          cache_creation_input_tokens: 5,
          cache_read_input_tokens: 30,
        })
      );

    const result1 = await sdkExecutor.execute({ prompt: 'Hello' });
    const result2 = await sdkExecutor.execute({ prompt: 'Next' });

    await sessionManager.addMessage(session, {
      role: 'assistant',
      content: result1.response,
      usage: result1.usage!,
    });
    await sessionManager.addMessage(session, {
      role: 'assistant',
      content: result2.response,
      usage: result2.usage!,
    });

    await sessionManager.saveSession(session);

    const runner = {
      getSessionStatsData: async () => sessionManager.calculateSessionStats(session),
    };

    const input = createMockInput();
    const output = createMockOutput();
    const ui = new TerminalInteractiveUI(createCallbacks({ getRunner: () => runner as any }), {
      input,
      output,
      enableColors: false,
    });

    const startPromise = ui.start();
    await new Promise((resolve) => setTimeout(resolve, TEST_DELAY_MS));

    input.emit('data', Buffer.from('/stats\n'));
    await new Promise((resolve) => setTimeout(resolve, TEST_DELAY_MS));

    ui.stop();
    await startPromise;

    const outputText = output.getOutput();
    expect(outputText).toContain('Session token statistics');
    expect(outputText).toContain('input_tokens: 200');
    expect(outputText).toContain('output_tokens: 120');
    expect(outputText).toContain('cache_creation_input_tokens: 25');
    expect(outputText).toContain('cache_read_input_tokens: 40');
    expect(outputText).toContain(
      'cache_read/(input+cache_read+cache_creation) = 15.1%'
    );
  });
});
