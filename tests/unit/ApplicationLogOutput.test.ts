process.env.DOTENV_QUIET = 'true';

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

import type { OutputInterface } from '../../src/ui/OutputInterface';
import type { ParserInterface } from '../../src/ui/ParserInterface';
import type { UIFactory } from '../../src/ui/factories/UIFactory';
import { Application } from '../../src/main';

const EXPECTED_SINGLE_CALL_COUNT = parseInt(
  process.env.APP_OUTPUT_SINGLE_CALL_COUNT || '1',
  10
);
const EXPECTED_DOUBLE_CALL_COUNT = parseInt(
  process.env.APP_OUTPUT_DOUBLE_CALL_COUNT || '2',
  10
);
const EXPECTED_TRIPLE_CALL_COUNT = parseInt(
  process.env.APP_OUTPUT_TRIPLE_CALL_COUNT || '3',
  10
);
const SESSION_TIME_MS = parseInt(process.env.APP_SESSION_TIME_MS || '0', 10);
const MCP_SERVER_COUNT = parseInt(process.env.APP_MCP_SERVER_COUNT || '1', 10);
const MCP_TRANSPORT_STDIO_COUNT = parseInt(
  process.env.APP_MCP_TRANSPORT_STDIO_COUNT || '1',
  10
);
const MCP_TRANSPORT_SSE_COUNT = parseInt(
  process.env.APP_MCP_TRANSPORT_SSE_COUNT || '0',
  10
);
const MCP_TRANSPORT_HTTP_COUNT = parseInt(
  process.env.APP_MCP_TRANSPORT_HTTP_COUNT || '0',
  10
);
const MCP_ERROR_COUNT = parseInt(process.env.APP_MCP_ERROR_COUNT || '1', 10);
const MCP_ERROR_LINE = parseInt(process.env.APP_MCP_ERROR_LINE || '1', 10);
const MCP_ERROR_COLUMN = parseInt(process.env.APP_MCP_ERROR_COLUMN || '2', 10);

class StubOutput implements OutputInterface {
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
  success = jest.fn();
  section = jest.fn();
  blankLine = jest.fn();
}

class StubUIFactory implements UIFactory {
  private readonly parser: ParserInterface;
  private readonly output: OutputInterface;

  constructor(parser: ParserInterface, output: OutputInterface) {
    this.parser = parser;
    this.output = output;
  }

  createParser(): ParserInterface {
    return this.parser;
  }

  createOutput(): OutputInterface {
    return this.output;
  }
}

const createApp = (output: OutputInterface): Application => {
  const parser: ParserInterface = {
    parse: () => ({ help: false, version: false, debug: false }),
    getHelpText: () => 'help',
    getVersionText: () => 'version',
  };

  return new Application(new StubUIFactory(parser, output));
};

describe('Application log output', () => {
  it('prints command help using output.info', () => {
    const output = new StubOutput();
    const app = createApp(output);

    (app as any).showCommandHelp();

    expect(output.info).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL_COUNT);
    expect(output.info).toHaveBeenCalledWith(expect.stringContaining('/help'));
  });

  it('prints empty sessions message using output.info', async () => {
    const output = new StubOutput();
    const app = createApp(output);
    (app as any).sessionManager = {
      listSessions: jest.fn().mockResolvedValue([]),
    };

    await (app as any).showSessions();

    expect(output.info).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL_COUNT);
    expect(output.info).toHaveBeenCalledWith('No saved sessions');
  });

  it('prints session list using output.section and blankLine', async () => {
    const output = new StubOutput();
    const app = createApp(output);
    const session = {
      id: 'session-123',
      expired: false,
      lastAccessedAt: new Date(SESSION_TIME_MS),
    };
    (app as any).sessionManager = {
      listSessions: jest.fn().mockResolvedValue([session]),
    };

    await (app as any).showSessions();

    expect(output.blankLine).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL_COUNT);
    expect(output.section).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL_COUNT);
    expect(output.section).toHaveBeenCalledWith(expect.stringContaining('Session list:'));
    expect(output.section).toHaveBeenCalledWith(expect.stringContaining(session.id));
  });

  it('prints config using output.section and blankLine', async () => {
    const output = new StubOutput();
    const app = createApp(output);
    (app as any).configManager = {
      loadProjectConfig: jest.fn().mockResolvedValue({ foo: 'bar' }),
    };

    await (app as any).showConfig();

    expect(output.blankLine).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL_COUNT);
    expect(output.section).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL_COUNT);
    expect(output.section).toHaveBeenCalledWith(
      'Current configuration:\n{\n  "foo": "bar"\n}'
    );
  });

  it('prints permission settings using output.section and blankLine', () => {
    const output = new StubOutput();
    const app = createApp(output);
    (app as any).permissionManager = {
      getConfig: jest.fn().mockReturnValue({
        mode: 'default',
        allowedTools: ['Read'],
        disallowedTools: [],
        allowDangerouslySkipPermissions: false,
      }),
    };

    (app as any).showPermissions();

    expect(output.blankLine).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL_COUNT);
    expect(output.section).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL_COUNT);
    expect(output.section).toHaveBeenCalledWith(expect.stringContaining('Permission settings:'));
    expect(output.section).toHaveBeenCalledWith(expect.stringContaining('Mode: default'));
    expect(output.section).toHaveBeenCalledWith(expect.stringContaining('Allowed tools: Read'));
  });

  it('prints resume warning using output.info when not interactive', async () => {
    const output = new StubOutput();
    const app = createApp(output);

    await (app as any).handleResumeCommand();

    expect(output.info).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL_COUNT);
    expect(output.info).toHaveBeenCalledWith(
      'Warning: /resume command is only available in interactive mode'
    );
  });

  it('prints MCP command help using output.info', () => {
    const output = new StubOutput();
    const app = createApp(output);

    (app as any).showMCPCommandHelp('unknown');

    expect(output.info).toHaveBeenCalledTimes(EXPECTED_DOUBLE_CALL_COUNT);
    expect(output.info).toHaveBeenCalledWith('Unknown MCP subcommand: unknown');
    expect(output.info).toHaveBeenCalledWith(expect.stringContaining('MCP commands:'));
  });

  it('prints empty MCP config message using output.info', async () => {
    const output = new StubOutput();
    const app = createApp(output);
    (app as any).mcpService = {
      listServerConfig: jest.fn().mockResolvedValue({
        servers: [],
        configPath: '/tmp/mcp.json',
      }),
    };

    await (app as any).showMCPConfig();

    expect(output.info).toHaveBeenCalledTimes(EXPECTED_TRIPLE_CALL_COUNT);
    expect(output.info).toHaveBeenCalledWith(
      'No MCP servers configured at /tmp/mcp.json'
    );
  });

  it('prints MCP config update using output.success and info', async () => {
    const output = new StubOutput();
    const app = createApp(output);
    (app as any).mcpService = {
      editConfig: jest.fn().mockResolvedValue({
        configPath: '/tmp/mcp.json',
      }),
    };

    await (app as any).editMCPConfig();

    expect(output.success).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL_COUNT);
    expect(output.success).toHaveBeenCalledWith(
      'MCP configuration updated: /tmp/mcp.json'
    );
    expect(output.info).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL_COUNT);
  });

  it('prints MCP validation success using output.success and info', async () => {
    const output = new StubOutput();
    const app = createApp(output);
    (app as any).mcpService = {
      validateConfig: jest.fn().mockResolvedValue({
        valid: true,
        serverCount: MCP_SERVER_COUNT,
        transportCounts: {
          stdio: MCP_TRANSPORT_STDIO_COUNT,
          sse: MCP_TRANSPORT_SSE_COUNT,
          http: MCP_TRANSPORT_HTTP_COUNT,
        },
      }),
    };

    await (app as any).validateMCPConfig();

    expect(output.success).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL_COUNT);
    expect(output.info).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL_COUNT);
  });

  it('prints MCP validation errors using output.info', async () => {
    const output = new StubOutput();
    const app = createApp(output);
    (app as any).mcpService = {
      validateConfig: jest.fn().mockResolvedValue({
        valid: false,
        errors: [
          {
            message: 'Invalid config',
            path: '/servers/0',
            line: MCP_ERROR_LINE,
            column: MCP_ERROR_COLUMN,
          },
        ],
        configPath: '/tmp/mcp.json',
      }),
    };

    await (app as any).validateMCPConfig();

    expect(output.info).toHaveBeenCalledWith(
      `MCP configuration is invalid. Errors: ${MCP_ERROR_COUNT}, Path: /tmp/mcp.json`
    );
    expect(output.info).toHaveBeenCalledWith(
      `- Invalid config (path: /servers/0, line: ${MCP_ERROR_LINE}, column: ${MCP_ERROR_COLUMN})`
    );
  });
});
