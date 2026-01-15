import fs from 'fs';
import path from 'path';
import ts from 'typescript';

import { CLIParser } from '../../src/cli/CLIParser';
import { TerminalParser } from '../../src/ui/TerminalParser';

const TERMINAL_PARSER_PATH = path.join(__dirname, '../../src/ui/TerminalParser.ts');
const TERMINAL_PARSER_ENCODING = 'utf-8';
const EXPECTED_IMPORT_COUNT = parseInt(
  process.env.TERMINAL_PARSER_IMPORT_COUNT || '2',
  10
);
const EXPECTED_ARGS_SET_COUNT = parseInt(
  process.env.TERMINAL_PARSER_ARGS_SET_COUNT || '4',
  10
);

const sourceText = fs.readFileSync(TERMINAL_PARSER_PATH, TERMINAL_PARSER_ENCODING);
const sourceFile = ts.createSourceFile(
  TERMINAL_PARSER_PATH,
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

describe('TerminalParser', () => {
  const terminalParser = new TerminalParser();
  const cliParser = new CLIParser();

  it('delegates parse() to CLIParser', () => {
    const argsSets: string[][] = [
      ['--help'],
      ['-p', 'test query'],
      ['--model', 'haiku', '--output-format', 'json', '--verbose'],
      ['--allowed-tools', 'Read,Write', '--disallowed-tools', 'Bash', 'prompt'],
    ];

    expect(argsSets).toHaveLength(EXPECTED_ARGS_SET_COUNT);

    argsSets.forEach((args) => {
      expect(terminalParser.parse(args)).toEqual(cliParser.parse(args));
    });
  });

  it('delegates getHelpText() to CLIParser', () => {
    expect(terminalParser.getHelpText()).toBe(cliParser.getHelpText());
  });

  it('delegates getVersionText() to CLIParser', () => {
    expect(terminalParser.getVersionText()).toBe(cliParser.getVersionText());
  });

  it('depends only on ParserInterface and CLIParser', () => {
    const importSpecifiers = getImportSpecifiers();
    expect(importSpecifiers).toHaveLength(EXPECTED_IMPORT_COUNT);
    expect(importSpecifiers).toEqual(['../cli/CLIParser', './ParserInterface'].sort());
  });
});
