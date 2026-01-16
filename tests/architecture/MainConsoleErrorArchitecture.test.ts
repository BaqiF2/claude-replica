import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const MAIN_PATH = path.join(__dirname, '../../src/main.ts');
const MAIN_ENCODING = 'utf-8';
const EXPECTED_CONSOLE_ERROR_COUNT = parseInt(
  process.env.MAIN_CONSOLE_ERROR_COUNT || '0',
  10
);

const sourceText = fs.readFileSync(MAIN_PATH, MAIN_ENCODING);
const sourceFile = ts.createSourceFile(MAIN_PATH, sourceText, ts.ScriptTarget.Latest, true);

const getConsoleErrorCount = (): number => {
  let count = 0;

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'console') {
        if (node.name.text === 'error') {
          count += 1;
        }
      }
    }
    node.forEachChild(visit);
  };

  sourceFile.forEachChild(visit);

  return count;
};

describe('main.ts console error usage', () => {
  it('does not call console.error directly', () => {
    expect(getConsoleErrorCount()).toBe(EXPECTED_CONSOLE_ERROR_COUNT);
  });
});
