import { CLIParser } from '../../src/cli/CLIParser';
import { TerminalParser } from '../../src/ui/TerminalParser';

const EXPECTED_SCENARIO_COUNT = parseInt(
  process.env.TERMINAL_PARSER_COMPAT_SCENARIO_COUNT || '2',
  10
);

describe('TerminalParser compatibility', () => {
  it('matches CLIParser outputs for representative argument sets', () => {
    const scenarios: Array<{ args: string[]; label: string }> = [
      {
        label: 'model-permission-output',
        args: [
          '--model',
          'sonnet',
          '--permission-mode',
          'acceptEdits',
          '--output-format',
          'markdown',
        ],
      },
      {
        label: 'tool-lists-and-prompt',
        args: ['--allowed-tools', 'Read,Write', '--disallowed-tools', 'Bash', 'hello'],
      },
    ];

    expect(scenarios).toHaveLength(EXPECTED_SCENARIO_COUNT);

    scenarios.forEach((scenario) => {
      const cliParser = new CLIParser();
      const terminalParser = new TerminalParser();

      expect(terminalParser.parse(scenario.args)).toEqual(cliParser.parse(scenario.args));
      expect(terminalParser.getHelpText()).toBe(cliParser.getHelpText());
      expect(terminalParser.getVersionText()).toBe(cliParser.getVersionText());
    });
  });
});
