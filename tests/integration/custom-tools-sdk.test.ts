/**
 * 自定义工具与 SDK 集成测试
 *
 * 验证自定义工具与 SDK 的协作流程，包括：
 * - MCP 自定义工具被 SDK 调用
 * - 工具返回结果格式正确
 * - 流式输入与自定义工具兼容
 * - 权限控制对 MCP 工具生效
 *
 * @module tests/integration/custom-tools-sdk
 */

// 模拟 SDK 模块
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: jest.fn(),
  createSdkMcpServer: jest.fn().mockImplementation((config) => config),
  tool: jest.fn().mockImplementation((name, description, schema, handler) => ({
    name,
    description,
    schema,
    handler,
  })),
}));

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { CanUseTool as SDKCanUseTool } from '@anthropic-ai/claude-agent-sdk';
import { CustomToolManager } from '../../src/custom-tools/CustomToolManager';
import { calculatorTool } from '../../src/custom-tools/math/calculator';
import { PermissionManager } from '../../src/permissions/PermissionManager';
import { SDKQueryExecutor, StreamMessage } from '../../src/sdk/SDKQueryExecutor';
import { ToolRegistry } from '../../src/tools/ToolRegistry';

const mockedQuery = query as jest.MockedFunction<any>;

const TEST_MODEL = 'claude-sonnet-4-5-20250929';
const TEST_MODULE_NAME = 'math/calculators';
const TEST_MESSAGE_TEXT = 'Use the calculator tool';
const TEST_EXPRESSION = '1 + 1';
const TEST_SESSION_ID = 'custom-tools-session';
const TEST_MESSAGE_UUID = 'custom-tools-uuid';

const createMessageGenerator = (): AsyncGenerator<StreamMessage, void, unknown> =>
  (async function* () {
    yield {
      type: 'user',
      message: {
        role: 'user',
        content: TEST_MESSAGE_TEXT,
      },
    };
  })();

const createCustomToolServers = () => {
  const manager = new CustomToolManager();
  const registration = manager.registerModule(TEST_MODULE_NAME, [calculatorTool]);
  if (!registration.valid) {
    throw new Error('Custom tool registration failed');
  }

  const servers = manager.createMcpServers();
  const serverNames = Object.keys(servers);
  if (serverNames.length === 0) {
    throw new Error('Missing custom MCP servers');
  }

  return {
    servers,
    serverName: serverNames[0],
  };
};

describe('自定义工具与 SDK 集成测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应支持 SDK 调用自定义工具并返回正确格式', async () => {
    const { servers, serverName } = createCustomToolServers();
    const mcpToolName = `mcp__${serverName}__${calculatorTool.name}`;
    const mcpModuleName = `mcp__${serverName}`;

    const permissionManager = new PermissionManager(
      {
        mode: 'default',
        allowedTools: [mcpModuleName],
      },
      new ToolRegistry()
    );

    const sdkExecutor = new SDKQueryExecutor();
    sdkExecutor.setCustomMcpServers(servers);

    let toolResult: unknown;
    let capturedPromptText = '';
    let canUseToolResult: boolean | undefined;

    mockedQuery.mockImplementation(({ prompt, options }: { prompt: AsyncGenerator<any>; options: any }) => {
      return (async function* () {
        const promptEntry = await prompt.next();
        if (!promptEntry.done) {
          const content = promptEntry.value?.message?.content;
          if (typeof content === 'string') {
            capturedPromptText = content;
          }
        }

        const mcpServers = options.mcpServers || {};
        const serverConfig = mcpServers[serverName];
        const toolEntry = serverConfig?.tools?.find(
          (tool: { name: string }) => tool.name === calculatorTool.name
        );

        if (options.canUseTool) {
          canUseToolResult = await options.canUseTool({
            tool: mcpToolName,
            args: { expression: TEST_EXPRESSION },
            context: { sessionId: TEST_SESSION_ID, messageUuid: TEST_MESSAGE_UUID },
          });
        }

        if (toolEntry && canUseToolResult !== false) {
          toolResult = await toolEntry.handler({ expression: TEST_EXPRESSION }, {});
        }

        const responseText =
          (toolResult as { content?: Array<{ text?: string }> })?.content?.[0]?.text ?? '';

        yield {
          type: 'assistant',
          session_id: TEST_SESSION_ID,
          message: {
            content: [{ type: 'text', text: responseText }],
          },
        };

        yield {
          type: 'result',
          subtype: 'success',
          session_id: TEST_SESSION_ID,
          result: responseText,
          total_cost_usd: 0,
          duration_ms: 1,
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      })();
    });

    const result = await sdkExecutor.executeStreaming(createMessageGenerator(), {
      model: TEST_MODEL,
      canUseTool: permissionManager.createCanUseToolHandler() as unknown as SDKCanUseTool,
    });

    expect(result.isError).toBe(false);
    expect(capturedPromptText).toBe(TEST_MESSAGE_TEXT);
    expect(canUseToolResult).toBe(true);
    expect(toolResult).toBeDefined();
    expect(toolResult).toEqual({
      content: [{ type: 'text', text: '2' }],
    });
  });

  it('应在权限禁止时阻止 MCP 工具执行', async () => {
    const { servers, serverName } = createCustomToolServers();
    const mcpToolName = `mcp__${serverName}__${calculatorTool.name}`;
    const mcpModuleName = `mcp__${serverName}`;

    const permissionManager = new PermissionManager(
      {
        mode: 'default',
        disallowedTools: [mcpModuleName],
      },
      new ToolRegistry()
    );

    const sdkExecutor = new SDKQueryExecutor();
    sdkExecutor.setCustomMcpServers(servers);

    let toolResult: unknown;
    let canUseToolResult: boolean | undefined;

    mockedQuery.mockImplementation(({ options }: { options: any }) => {
      return (async function* () {
        if (options.canUseTool) {
          canUseToolResult = await options.canUseTool({
            tool: mcpToolName,
            args: { expression: TEST_EXPRESSION },
            context: { sessionId: TEST_SESSION_ID, messageUuid: TEST_MESSAGE_UUID },
          });
        }

        yield {
          type: 'assistant',
          session_id: TEST_SESSION_ID,
          message: {
            content: [{ type: 'text', text: 'Denied' }],
          },
        };

        yield {
          type: 'result',
          subtype: 'success',
          session_id: TEST_SESSION_ID,
          result: 'Denied',
          total_cost_usd: 0,
          duration_ms: 1,
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      })();
    });

    await sdkExecutor.executeStreaming(createMessageGenerator(), {
      model: TEST_MODEL,
      canUseTool: permissionManager.createCanUseToolHandler() as unknown as SDKCanUseTool,
    });

    expect(canUseToolResult).toBe(false);
    expect(toolResult).toBeUndefined();
  });
});
