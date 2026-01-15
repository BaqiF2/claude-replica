import { TerminalOutput } from '../../src/ui/TerminalOutput';

const SECTION_SUFFIX = process.env.TERMINAL_OUTPUT_SECTION_SUFFIX || '\n';
const INFO_MESSAGE = process.env.TERMINAL_OUTPUT_COMPAT_INFO_MESSAGE || 'Info message';
const WARN_MESSAGE = process.env.TERMINAL_OUTPUT_COMPAT_WARN_MESSAGE || 'Warn message';
const ERROR_MESSAGE = process.env.TERMINAL_OUTPUT_COMPAT_ERROR_MESSAGE || 'Error message';
const COLOR_MESSAGE =
  process.env.TERMINAL_OUTPUT_COMPAT_COLOR_MESSAGE || '\u001b[31mColor message\u001b[0m';
const SECTION_TITLE =
  process.env.TERMINAL_OUTPUT_COMPAT_SECTION_TITLE || 'Section Title';
const BLANK_LINE_COUNT = parseInt(
  process.env.TERMINAL_OUTPUT_COMPAT_BLANK_LINE_COUNT || '2',
  10
);

type ConsoleCapture = {
  logs: string[];
  warns: string[];
  errors: string[];
  restore: () => void;
};

const captureConsole = (): ConsoleCapture => {
  const logs: string[] = [];
  const warns: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = jest.fn((...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  });
  console.warn = jest.fn((...args: unknown[]) => {
    warns.push(args.map(String).join(' '));
  });
  console.error = jest.fn((...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });

  return {
    logs,
    warns,
    errors,
    restore: () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    },
  };
};

describe('TerminalOutput compatibility', () => {
  it('matches console output for messages, color, and newlines', () => {
    const output = new TerminalOutput();
    const capture = captureConsole();

    output.info(INFO_MESSAGE);
    output.warn(WARN_MESSAGE);
    output.error(ERROR_MESSAGE);
    output.success(COLOR_MESSAGE);
    output.section(SECTION_TITLE);
    output.blankLine(BLANK_LINE_COUNT);

    capture.restore();

    const expectedBlankLines = Array.from({ length: BLANK_LINE_COUNT }, () => '');
    const expectedLogs = [
      INFO_MESSAGE,
      COLOR_MESSAGE,
      `${SECTION_TITLE}${SECTION_SUFFIX}`,
      ...expectedBlankLines,
    ];

    expect(capture.logs).toEqual(expectedLogs);
    expect(capture.warns).toEqual([WARN_MESSAGE]);
    expect(capture.errors).toEqual([ERROR_MESSAGE]);
  });
});
