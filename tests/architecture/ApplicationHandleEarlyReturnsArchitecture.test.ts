import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const MAIN_PATH = path.join(__dirname, '../../src/main.ts');
const MAIN_ENCODING = 'utf-8';
const EXPECTED_INFO_CALL_COUNT = parseInt(
  process.env.APP_EARLY_RETURNS_INFO_CALL_COUNT || '1',
  10
);
const EXPECTED_SUCCESS_CALL_COUNT = parseInt(
  process.env.APP_EARLY_RETURNS_SUCCESS_CALL_COUNT || '1',
  10
);

const sourceText = fs.readFileSync(MAIN_PATH, MAIN_ENCODING);
const sourceFile = ts.createSourceFile(MAIN_PATH, sourceText, ts.ScriptTarget.Latest, true);

const getClassDeclaration = (name: string): ts.ClassDeclaration => {
  let found: ts.ClassDeclaration | undefined;
  sourceFile.forEachChild((node) => {
    if (ts.isClassDeclaration(node) && node.name?.text === name) {
      found = node;
    }
  });

  if (!found) {
    throw new Error(`Class not found: ${name}`);
  }

  return found;
};

const getMethodDeclaration = (
  node: ts.ClassDeclaration,
  name: string
): ts.MethodDeclaration => {
  const methodDecl = node.members.find((member) => {
    if (!ts.isMethodDeclaration(member)) {
      return false;
    }
    if (!member.name || !ts.isIdentifier(member.name)) {
      return false;
    }
    return member.name.text === name;
  });

  if (!methodDecl || !ts.isMethodDeclaration(methodDecl)) {
    throw new Error(`Method not found: ${name}`);
  }

  return methodDecl;
};

const assertTypeReferenceName = (node: ts.TypeNode | undefined, expected: string): void => {
  expect(node).toBeDefined();
  if (!node) {
    return;
  }
  expect(ts.isTypeReferenceNode(node)).toBe(true);
  if (!ts.isTypeReferenceNode(node)) {
    return;
  }
  expect(node.typeName.getText(sourceFile)).toBe(expected);
};

const getOutputCallCounts = (
  methodDecl: ts.MethodDeclaration
): { info: number; success: number } => {
  let infoCount = 0;
  let successCount = 0;
  const methodBody = methodDecl.body;
  if (!methodBody) {
    return { info: infoCount, success: successCount };
  }

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callTarget = node.expression;
      if (ts.isPropertyAccessExpression(callTarget)) {
        const propertyName = callTarget.name.text;
        const receiver = callTarget.expression;
        if (
          ts.isPropertyAccessExpression(receiver) &&
          receiver.name.text === 'output' &&
          receiver.expression.kind === ts.SyntaxKind.ThisKeyword
        ) {
          if (propertyName === 'info') {
            infoCount += 1;
          }
          if (propertyName === 'success') {
            successCount += 1;
          }
        }
      }
    }
    node.forEachChild(visit);
  };

  methodBody.forEachChild(visit);

  return { info: infoCount, success: successCount };
};

describe('Application.handleEarlyReturns architecture', () => {
  const applicationClass = getClassDeclaration('Application');
  const handleEarlyReturns = getMethodDeclaration(applicationClass, 'handleEarlyReturns');

  it('uses OptionsInterface for parameter type', () => {
    const [optionsParam] = handleEarlyReturns.parameters;
    assertTypeReferenceName(optionsParam?.type, 'OptionsInterface');
  });

  it('routes help and version output through OutputInterface', () => {
    const { info, success } = getOutputCallCounts(handleEarlyReturns);
    expect(info).toBe(EXPECTED_INFO_CALL_COUNT);
    expect(success).toBe(EXPECTED_SUCCESS_CALL_COUNT);
  });
});
