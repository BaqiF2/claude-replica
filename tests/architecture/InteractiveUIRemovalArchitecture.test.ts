import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const INTERACTIVE_UI_PATH = path.join(__dirname, '../../src/ui/InteractiveUI.ts');
const TERMINAL_UI_PATH = path.join(__dirname, '../../src/ui/TerminalInteractiveUI.ts');
const TERMINAL_UI_ENCODING = 'utf-8';

const terminalSourceText = fs.readFileSync(TERMINAL_UI_PATH, TERMINAL_UI_ENCODING);
const terminalSourceFile = ts.createSourceFile(
  TERMINAL_UI_PATH,
  terminalSourceText,
  ts.ScriptTarget.Latest,
  true
);

const getImportSpecifiers = (): string[] => {
  return terminalSourceFile.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => statement.moduleSpecifier)
    .filter(ts.isStringLiteral)
    .map((literal) => literal.text);
};

describe('InteractiveUI removal', () => {
  it('removes InteractiveUI.ts from src/ui', () => {
    expect(fs.existsSync(INTERACTIVE_UI_PATH)).toBe(false);
  });

  it('does not import InteractiveUI in TerminalInteractiveUI', () => {
    const importSpecifiers = getImportSpecifiers();
    expect(importSpecifiers).not.toContain('./InteractiveUI');
  });
});
