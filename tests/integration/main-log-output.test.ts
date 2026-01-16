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

import { TerminalUIFactory } from '../../src/ui/factories/TerminalUIFactory';
import { Application } from '../../src/main';

const EXPECTED_LOG_CALL_COUNT = parseInt(
  process.env.APP_LOG_OUTPUT_CALL_COUNT || '1',
  10
);

describe('main log output integration', () => {
  it('routes command help output through TerminalOutput', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const app = new Application(new TerminalUIFactory());

    (app as any).showCommandHelp();

    expect(consoleSpy).toHaveBeenCalledTimes(EXPECTED_LOG_CALL_COUNT);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('/help'));

    consoleSpy.mockRestore();
  });
});
