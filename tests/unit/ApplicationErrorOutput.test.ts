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
import type { PermissionUI } from '../../src/permissions/PermissionUI';
import type {
  InteractiveUICallbacks,
  InteractiveUIConfig,
  InteractiveUIInterface,
} from '../../src/ui/InteractiveUIInterface';
import type { MessageRole, PermissionMode, Snapshot, TodoItem } from '../../src/ui/InteractiveUIInterface';
import type { Session, SessionStats } from '../../src/core/SessionManager';
import { CLIParseError } from '../../src/cli/CLIParser';
import { Application } from '../../src/main';

const EXPECTED_CONFIG_ERROR_EXIT_CODE = parseInt(
  process.env.EXIT_CODE_CONFIG_ERROR || '2',
  10
);
const EXPECTED_GENERAL_ERROR_EXIT_CODE = parseInt(
  process.env.EXIT_CODE_GENERAL_ERROR || '1',
  10
);
const EXPECTED_ERROR_CALL_COUNT = parseInt(
  process.env.APP_OUTPUT_ERROR_CALL_COUNT || '1',
  10
);

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

  createPermissionUI(): PermissionUI {
    return {
      promptToolPermission: async () => ({ approved: true }),
      promptUserQuestions: async () => ({}),
    };
  }

  createInteractiveUI(
    _callbacks: InteractiveUICallbacks,
    _config?: InteractiveUIConfig
  ): InteractiveUIInterface {
    return {
      start: async () => undefined,
      stop: () => undefined,
      displayMessage: (_message: string, _role: MessageRole) => undefined,
      displayToolUse: (_tool: string, _args: Record<string, unknown>) => undefined,
      displayToolResult: (_tool: string, _result: string, _isError?: boolean) => undefined,
      displayThinking: (_content?: string) => undefined,
      displayComputing: () => undefined,
      stopComputing: () => undefined,
      clearProgress: () => undefined,
      displayError: (_message: string) => undefined,
      displayWarning: (_message: string) => undefined,
      displaySuccess: (_message: string) => undefined,
      displayInfo: (_message: string) => undefined,
      displayTodoList: (_todos: TodoItem[]) => undefined,
      promptConfirmation: async (_message: string) => false,
      showRewindMenu: async (_snapshots: Snapshot[]) => null,
      showSessionMenu: async (_sessions: Session[]) => null,
      showConfirmationMenu: async (
        _title: string,
        _options: Array<{ key: string; label: string; description?: string }>,
        _defaultKey?: string
      ) => false,
      setInitialPermissionMode: (_mode: PermissionMode) => undefined,
      setPermissionMode: (_mode: PermissionMode) => undefined,
      displayPermissionStatus: (_mode: PermissionMode) => undefined,
      setProcessingState: (_processing: boolean) => undefined,
      formatRelativeTime: (_date: Date) => '',
      formatAbsoluteTime: (_date: Date) => '',
      formatStatsSummary: (_stats?: SessionStats) => '',
    };
  }
}

describe('Application error output', () => {
  it('formats CLI parse errors like console.error did', async () => {
    const errorMessage = 'invalid option';
    const parser: ParserInterface = {
      parse: () => {
        throw new CLIParseError(errorMessage);
      },
      getHelpText: () => 'help',
      getVersionText: () => 'version',
    };
    const output = new StubOutput();
    const app = new Application(new StubUIFactory(parser, output));

    const exitCode = await app.run(['--unknown-option']);

    expect(exitCode).toBe(EXPECTED_CONFIG_ERROR_EXIT_CODE);
    expect(output.error).toHaveBeenCalledTimes(EXPECTED_ERROR_CALL_COUNT);
    expect(output.error).toHaveBeenCalledWith(`Argument error: ${errorMessage}`);
  });

  it('formats unexpected errors like console.error did', async () => {
    const errorMessage = 'unexpected';
    const parser: ParserInterface = {
      parse: () => {
        throw new Error(errorMessage);
      },
      getHelpText: () => 'help',
      getVersionText: () => 'version',
    };
    const output = new StubOutput();
    const app = new Application(new StubUIFactory(parser, output));

    const exitCode = await app.run(['--anything']);

    expect(exitCode).toBe(EXPECTED_GENERAL_ERROR_EXIT_CODE);
    expect(output.error).toHaveBeenCalledTimes(EXPECTED_ERROR_CALL_COUNT);
    expect(output.error).toHaveBeenCalledWith(`Error: ${errorMessage}`);
  });
});
