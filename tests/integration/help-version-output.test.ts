process.env.DOTENV_QUIET = 'true';

import { CLIParser } from '../../src/cli/CLIParser';

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

const EXPECTED_EXIT_CODE_SUCCESS = parseInt(
  process.env.EXPECTED_EXIT_CODE_SUCCESS || '0',
  10
);

describe('Help/version output integration', () => {
  let main: typeof import('../../src/main').main;

  beforeAll(async () => {
    ({ main } = await import('../../src/main'));
  });

  it('keeps --help output consistent with CLIParser', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const parser = new CLIParser();
    const expectedHelpText = parser.getHelpText();

    const exitCode = await main(['--help']);

    expect(exitCode).toBe(EXPECTED_EXIT_CODE_SUCCESS);
    expect(consoleSpy.mock.calls.some((call) => call[0] === expectedHelpText)).toBe(true);

    consoleSpy.mockRestore();
  });

  it('keeps --version output consistent with CLIParser', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const parser = new CLIParser();
    const expectedVersionText = parser.getVersionText();

    const exitCode = await main(['--version']);

    expect(exitCode).toBe(EXPECTED_EXIT_CODE_SUCCESS);
    expect(consoleSpy.mock.calls.some((call) => call[0] === expectedVersionText)).toBe(true);

    consoleSpy.mockRestore();
  });
});
