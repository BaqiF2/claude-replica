import fs from 'fs';
import path from 'path';
import ts from 'typescript';

import { TerminalOutput } from '../../src/ui/TerminalOutput';
import { TerminalParser } from '../../src/ui/TerminalParser';
import { PermissionUIImpl } from '../../src/ui/PermissionUIImpl';
import { TerminalInteractiveUI } from '../../src/ui/TerminalInteractiveUI';
import { TerminalUIFactory } from '../../src/ui/factories/TerminalUIFactory';

const TERMINAL_UI_FACTORY_PATH = path.join(
  __dirname,
  '../../src/ui/factories/TerminalUIFactory.ts'
);
const TERMINAL_UI_FACTORY_ENCODING = 'utf-8';
const EXPECTED_IMPORT_COUNT = parseInt(
  process.env.TERMINAL_UI_FACTORY_IMPORT_COUNT || '6',
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

  it('creates PermissionUIImpl instances', () => {
    const factory = new TerminalUIFactory();
    const permissionUI = factory.createPermissionUI();

    expect(permissionUI).toBeInstanceOf(PermissionUIImpl);
  });

  it('creates TerminalInteractiveUI instances', () => {
    const factory = new TerminalUIFactory();
    const callbacks = {
      onMessage: jest.fn(),
      onCommand: jest.fn(),
      onInterrupt: jest.fn(),
      onRewind: jest.fn(),
    };

    const ui = factory.createInteractiveUI(callbacks);

    expect(ui).toBeInstanceOf(TerminalInteractiveUI);
  });

  it('depends only on UIFactory, TerminalParser, TerminalOutput, PermissionUIImpl, TerminalInteractiveUI, and PermissionUI', () => {
    const importSpecifiers = getImportSpecifiers();
    expect(importSpecifiers).toHaveLength(EXPECTED_IMPORT_COUNT);
    expect(importSpecifiers).toEqual(
      [
        '../PermissionUIImpl',
        '../TerminalInteractiveUI',
        '../TerminalOutput',
        '../TerminalParser',
        '../contracts/core/UIFactory',
        '../../permissions/PermissionUI',
      ].sort()
    );
  });
});
