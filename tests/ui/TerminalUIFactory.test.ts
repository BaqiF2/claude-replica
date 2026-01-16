import fs from 'fs';
import path from 'path';
import ts from 'typescript';

import { TerminalOutput } from '../../src/ui/TerminalOutput';
import { TerminalParser } from '../../src/ui/TerminalParser';
import { TerminalUIFactory } from '../../src/ui/factories/TerminalUIFactory';

const TERMINAL_UI_FACTORY_PATH = path.join(
  __dirname,
  '../../src/ui/factories/TerminalUIFactory.ts'
);
const TERMINAL_UI_FACTORY_ENCODING = 'utf-8';
const EXPECTED_IMPORT_COUNT = parseInt(
  process.env.TERMINAL_UI_FACTORY_IMPORT_COUNT || '3',
  10
);

const sourceText = fs.readFileSync(
  TERMINAL_UI_FACTORY_PATH,
  TERMINAL_UI_FACTORY_ENCODING
);
const sourceFile = ts.createSourceFile(
  TERMINAL_UI_FACTORY_PATH,
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

describe('TerminalUIFactory', () => {
  it('creates TerminalParser instances', () => {
    const factory = new TerminalUIFactory();
    const parser = factory.createParser();

    expect(parser).toBeInstanceOf(TerminalParser);
  });

  it('creates TerminalOutput instances', () => {
    const factory = new TerminalUIFactory();
    const output = factory.createOutput();

    expect(output).toBeInstanceOf(TerminalOutput);
  });

  it('depends only on UIFactory, TerminalParser, and TerminalOutput', () => {
    const importSpecifiers = getImportSpecifiers();
    expect(importSpecifiers).toHaveLength(EXPECTED_IMPORT_COUNT);
    expect(importSpecifiers).toEqual(
      ['../TerminalOutput', '../TerminalParser', './UIFactory'].sort()
    );
  });
});
