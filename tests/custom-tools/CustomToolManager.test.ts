/**
 * Test purpose: verify CustomToolManager registration, validation, and MCP server creation.
 *
 * Core targets:
 * - CustomToolManager: tool registration, validation, MCP server creation, and name lookups.
 */

import { z } from 'zod';

jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  createSdkMcpServer: jest.fn((config) => config),
  tool: jest.fn((name, description, schema, handler) => ({
    name,
    description,
    schema,
    handler,
  })),
}));

import { createSdkMcpServer, tool as sdkTool } from '@anthropic-ai/claude-agent-sdk';
import { CustomToolManager } from '../../src/custom-tools/CustomToolManager';
import type { ToolDefinition } from '../../src/custom-tools/types';

const SERVER_PREFIX = process.env.TEST_CUSTOM_TOOL_SERVER_PREFIX ?? 'custom';
const SERVER_VERSION = process.env.TEST_CUSTOM_TOOL_SERVER_VERSION ?? '2.0.0';
const MODULE_SEPARATOR = process.env.CUSTOM_TOOL_MODULE_SEPARATOR ?? '-';
const MODULE_NAME = process.env.TEST_CUSTOM_TOOL_MODULE_NAME ?? 'math/basic';
const TOOL_NAME = process.env.TEST_CUSTOM_TOOL_NAME ?? 'alpha';
const TOOL_NAME_SECOND = process.env.TEST_CUSTOM_TOOL_NAME_SECOND ?? 'bravo';
const TOOL_DESCRIPTION = process.env.TEST_CUSTOM_TOOL_DESCRIPTION ?? 'Test tool';
const TOOL_RESULT_TEXT = process.env.TEST_CUSTOM_TOOL_RESULT_TEXT ?? 'ok';
const INVALID_TOOL_NAME = process.env.TEST_CUSTOM_TOOL_INVALID_NAME ?? '1bad';
const INVALID_MODULE_NAME = process.env.TEST_CUSTOM_TOOL_INVALID_MODULE ?? 'bad module';
const INVALID_DESCRIPTION = process.env.TEST_CUSTOM_TOOL_INVALID_DESCRIPTION ?? '';
const INVALID_AUTHOR_VALUE = parseInt(
  process.env.TEST_CUSTOM_TOOL_INVALID_AUTHOR_VALUE || '123',
  10
);
const FIRST_CALL_INDEX = parseInt(process.env.TEST_CUSTOM_TOOL_FIRST_CALL_INDEX || '0', 10);
const FIRST_CALL_ARGS_INDEX = parseInt(
  process.env.TEST_CUSTOM_TOOL_FIRST_CALL_ARGS_INDEX || '0',
  10
);
const EMPTY_TOOL_COUNT = parseInt(process.env.TEST_CUSTOM_TOOL_EMPTY_COUNT || '0', 10);
const SINGLE_TOOL_COUNT = parseInt(process.env.TEST_CUSTOM_TOOL_SINGLE_COUNT || '1', 10);

const NORMALIZED_MODULE = MODULE_NAME.replace(/\//g, MODULE_SEPARATOR);
const EXPECTED_SERVER_NAME = SERVER_PREFIX
  ? `${SERVER_PREFIX}${MODULE_SEPARATOR}${NORMALIZED_MODULE}`
  : NORMALIZED_MODULE;

const createTool = (
  name: string,
  moduleName: string,
  schema = z.object({ value: z.string() })
): ToolDefinition => ({
  name,
  description: TOOL_DESCRIPTION,
  module: moduleName,
  schema,
  handler: async () => ({
    content: [{ type: 'text', text: TOOL_RESULT_TEXT }],
  }),
});

type MockMcpServerArgs = {
  tools: unknown[];
};

describe('CustomToolManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers tools and returns tool names', () => {
    const manager = new CustomToolManager({
      serverNamePrefix: SERVER_PREFIX,
      serverVersion: SERVER_VERSION,
    });
    const toolDefinition = createTool(TOOL_NAME, MODULE_NAME);

    const result = manager.registerTool(toolDefinition);

    expect(result.valid).toBe(true);
    expect(manager.getToolNames()).toEqual([TOOL_NAME]);
    expect(manager.getToolNamesByModule(MODULE_NAME)).toEqual([TOOL_NAME]);
  });

  it('rejects invalid tool definitions during registration', () => {
    const manager = new CustomToolManager({
      serverNamePrefix: SERVER_PREFIX,
      serverVersion: SERVER_VERSION,
    });
    const invalidTool = {
      name: INVALID_TOOL_NAME,
      description: INVALID_DESCRIPTION,
      module: INVALID_MODULE_NAME,
      schema: null,
      handler: 'not-a-function',
    } as unknown as ToolDefinition;

    const result = manager.registerTool(invalidTool);

    expect(result.valid).toBe(false);
    const fields = result.errors.map((error) => error.field);
    expect(fields).toEqual(
      expect.arrayContaining(['name', 'description', 'module', 'schema', 'handler'])
    );
    expect(manager.getToolNames()).toHaveLength(EMPTY_TOOL_COUNT);
  });

  it('builds MCP server configs for registered modules', () => {
    const manager = new CustomToolManager({
      serverNamePrefix: SERVER_PREFIX,
      serverVersion: SERVER_VERSION,
    });
    const schema = z.object({ value: z.string() });
    const toolDefinition = createTool(TOOL_NAME, MODULE_NAME, schema);

    manager.registerTool(toolDefinition);

    const serverConfig = manager.createMcpServer(MODULE_NAME);

    expect(serverConfig).not.toBeNull();
    expect(createSdkMcpServer).toHaveBeenCalledWith({
      name: EXPECTED_SERVER_NAME,
      version: SERVER_VERSION,
      tools: expect.any(Array),
    });
    expect(sdkTool).toHaveBeenCalledWith(
      TOOL_NAME,
      TOOL_DESCRIPTION,
      schema.shape,
      expect.any(Function)
    );
    const createSdkMcpServerMock = createSdkMcpServer as jest.MockedFunction<
      typeof createSdkMcpServer
    >;
    const serverArgs = createSdkMcpServerMock.mock.calls[FIRST_CALL_INDEX]?.[
      FIRST_CALL_ARGS_INDEX
    ] as MockMcpServerArgs | undefined;
    expect(serverArgs?.tools).toHaveLength(SINGLE_TOOL_COUNT);
  });

  it('returns null when creating MCP server for empty module', () => {
    const manager = new CustomToolManager({
      serverNamePrefix: SERVER_PREFIX,
      serverVersion: SERVER_VERSION,
    });

    const serverConfig = manager.createMcpServer(MODULE_NAME);

    expect(serverConfig).toBeNull();
    expect(createSdkMcpServer).not.toHaveBeenCalled();
  });

  it('validates tool definitions directly', () => {
    const manager = new CustomToolManager({
      serverNamePrefix: SERVER_PREFIX,
      serverVersion: SERVER_VERSION,
    });

    const validTool = createTool(TOOL_NAME_SECOND, MODULE_NAME);
    const validResult = manager.validateToolDefinition(validTool);

    expect(validResult.valid).toBe(true);
    expect(validResult.errors).toHaveLength(EMPTY_TOOL_COUNT);

    const invalidTool = {
      name: INVALID_TOOL_NAME,
      description: INVALID_DESCRIPTION,
      module: INVALID_MODULE_NAME,
      schema: null,
      handler: 'nope',
      dangerous: 'false',
      metadata: { author: INVALID_AUTHOR_VALUE },
    } as unknown as ToolDefinition;

    const invalidResult = manager.validateToolDefinition(invalidTool);

    expect(invalidResult.valid).toBe(false);
    const invalidFields = invalidResult.errors.map((error) => error.field);
    expect(invalidFields).toEqual(
      expect.arrayContaining([
        'name',
        'description',
        'module',
        'schema',
        'handler',
        'dangerous',
        'metadata.author',
      ])
    );
  });
});
