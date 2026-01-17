import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const UI_INDEX_PATH = path.join(__dirname, '../../src/ui/index.ts');
const UI_INDEX_ENCODING = 'utf-8';

const sourceText = fs.readFileSync(UI_INDEX_PATH, UI_INDEX_ENCODING);
const sourceFile = ts.createSourceFile(UI_INDEX_PATH, sourceText, ts.ScriptTarget.Latest, true);

const getExportedNames = (): string[] => {
  const names: string[] = [];
  sourceFile.statements
    .filter(ts.isExportDeclaration)
    .forEach((statement) => {
      const exportClause = statement.exportClause;
      if (!exportClause || !ts.isNamedExports(exportClause)) {
        return;
      }
      exportClause.elements.forEach((element) => {
        names.push(element.name.text);
      });
    });

  return names;
};

describe('ui index exports', () => {
  it('exports new interactive UI interfaces and classes', () => {
    const exportedNames = getExportedNames();
    expect(exportedNames).toContain('InteractiveUIInterface');
    expect(exportedNames).toContain('InteractiveUICallbacks');
    expect(exportedNames).toContain('InteractiveUIConfig');
    expect(exportedNames).toContain('TerminalInteractiveUI');
  });
});
