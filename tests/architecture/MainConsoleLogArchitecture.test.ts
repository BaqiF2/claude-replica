import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const MAIN_PATH = path.join(__dirname, '../../src/main.ts');
const MAIN_ENCODING = 'utf-8';
const EXPECTED_CONSOLE_LOG_COUNT = parseInt(
  process.env.MAIN_CONSOLE_LOG_COUNT || '0',
  10
);

const sourceText = fs.readFileSync(MAIN_PATH, MAIN_ENCODING);
const sourceFile = ts.createSourceFile(MAIN_PATH, sourceText, ts.ScriptTarget.Latest, true);

const getConsoleLogCount = (): number => {
  let count = 0;

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'console') {
        if (node.name.text === 'log') {
          count += 1;
        }
      }
    }
    node.forEachChild(visit);
  };

  sourceFile.forEachChild(visit);

  return count;
};

describe('main.ts console log usage', () => {
  it('does not call console.log directly', () => {
    expect(getConsoleLogCount()).toBe(EXPECTED_CONSOLE_LOG_COUNT);
  });
});
