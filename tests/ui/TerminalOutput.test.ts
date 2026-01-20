import fs from 'fs';
import path from 'path';
import ts from 'typescript';

import { TerminalOutput } from '../../src/ui/TerminalOutput';

const TERMINAL_OUTPUT_PATH = path.join(__dirname, '../../src/ui/TerminalOutput.ts');
const TERMINAL_OUTPUT_ENCODING = 'utf-8';
const EXPECTED_IMPORT_COUNT = parseInt(
  process.env.TERMINAL_OUTPUT_IMPORT_COUNT || '1',
  10
);
const EXPECTED_SINGLE_CALL_COUNT = parseInt(
  process.env.TERMINAL_OUTPUT_SINGLE_CALL_COUNT || '1',
  10
);
const EXPECTED_DEFAULT_BLANK_LINE_COUNT = parseInt(
  process.env.CLAUDE_DEFAULT_BLANK_LINE_COUNT || '1',
  10
);
const EXPECTED_CUSTOM_BLANK_LINE_COUNT = parseInt(
  process.env.TERMINAL_OUTPUT_CUSTOM_BLANK_LINE_COUNT || '3',
  10
);
const SECTION_SUFFIX = process.env.TERMINAL_OUTPUT_SECTION_SUFFIX || '\n';
const SECTION_TITLE = process.env.TERMINAL_OUTPUT_SECTION_TITLE || 'Section Title';
const MESSAGE_TEXT = process.env.TERMINAL_OUTPUT_MESSAGE_TEXT || 'Message';

const sourceText = fs.readFileSync(TERMINAL_OUTPUT_PATH, TERMINAL_OUTPUT_ENCODING);
const sourceFile = ts.createSourceFile(
  TERMINAL_OUTPUT_PATH,
  sourceText,
  ts.ScriptTarget.Latest,
  true
);

const getImportSpecifiers = (): string[] => {
  return sourceFile.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => statement.moduleSpecifier)
    .filter(ts.isStringLiteral)
    .map((literal) => literal.text)
    .sort();
};

describe('TerminalOutput', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('delegates info() to console.log', () => {
    const output = new TerminalOutput();
    output.info(MESSAGE_TEXT);

    expect(logSpy).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL_COUNT);
    expect(logSpy).toHaveBeenCalledWith(MESSAGE_TEXT);
  });

  it('delegates warn() to console.warn', () => {
    const output = new TerminalOutput();
    output.warn(MESSAGE_TEXT);

    expect(warnSpy).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL_COUNT);
    expect(warnSpy).toHaveBeenCalledWith(MESSAGE_TEXT);
  });

  it('delegates error() to console.error', () => {
    const output = new TerminalOutput();
    output.error(MESSAGE_TEXT);

    expect(errorSpy).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL_COUNT);
    expect(errorSpy).toHaveBeenCalledWith(MESSAGE_TEXT);
  });

  it('delegates success() to console.log', () => {
    const output = new TerminalOutput();
    output.success(MESSAGE_TEXT);

    expect(logSpy).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL_COUNT);
    expect(logSpy).toHaveBeenCalledWith(MESSAGE_TEXT);
  });

  it('outputs section title followed by newline', () => {
    const output = new TerminalOutput();
    output.section(SECTION_TITLE);

    expect(logSpy).toHaveBeenCalledTimes(EXPECTED_SINGLE_CALL_COUNT);
    expect(logSpy).toHaveBeenCalledWith(`${SECTION_TITLE}${SECTION_SUFFIX}`);
  });

  it('outputs default blank lines when count is omitted', () => {
    const output = new TerminalOutput();
    output.blankLine();

    expect(logSpy).toHaveBeenCalledTimes(EXPECTED_DEFAULT_BLANK_LINE_COUNT);
    logSpy.mock.calls.forEach((call) => {
      expect(call[0]).toBe('');
    });
  });

  it('outputs specified number of blank lines', () => {
    const output = new TerminalOutput();
    output.blankLine(EXPECTED_CUSTOM_BLANK_LINE_COUNT);

    expect(logSpy).toHaveBeenCalledTimes(EXPECTED_CUSTOM_BLANK_LINE_COUNT);
    logSpy.mock.calls.forEach((call) => {
      expect(call[0]).toBe('');
    });
  });

  it('depends only on OutputInterface', () => {
    const importSpecifiers = getImportSpecifiers();
    expect(importSpecifiers).toHaveLength(EXPECTED_IMPORT_COUNT);
    expect(importSpecifiers).toEqual(['./contracts/core/OutputInterface'].sort());
  });
});
