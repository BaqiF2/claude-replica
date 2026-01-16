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

const EXPECTED_CONFIG_ERROR_EXIT_CODE = parseInt(
  process.env.EXIT_CODE_CONFIG_ERROR || '2',
  10
);
const EXPECTED_ERROR_CALL_COUNT = parseInt(
  process.env.MAIN_ERROR_CALL_COUNT || '1',
  10
);

describe('main error output integration', () => {
  let main: typeof import('../../src/main').main;

  beforeAll(async () => {
    ({ main } = await import('../../src/main'));
  });

  it('prints CLI parse error in expected format', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const exitCode = await main(['--unknown-option']);

    expect(exitCode).toBe(EXPECTED_CONFIG_ERROR_EXIT_CODE);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(EXPECTED_ERROR_CALL_COUNT);
    expect(
      consoleErrorSpy.mock.calls.some((call) =>
        String(call[0]).includes('Argument error:')
      )
    ).toBe(true);

    consoleErrorSpy.mockRestore();
  });
});
