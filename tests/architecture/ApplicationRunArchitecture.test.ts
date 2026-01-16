import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const MAIN_PATH = path.join(__dirname, '../../src/main.ts');
const MAIN_ENCODING = 'utf-8';
const EXPECTED_OPTIONS_DECLARATION_COUNT = parseInt(
  process.env.APP_RUN_OPTIONS_DECLARATION_COUNT || '1',
  10
);
const EXPECTED_PARSER_PARSE_CALL_COUNT = parseInt(
  process.env.APP_RUN_PARSER_PARSE_CALL_COUNT || '1',
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

const isThisParserParseCall = (initializer: ts.Expression | undefined): boolean => {
  if (!initializer || !ts.isCallExpression(initializer)) {
    return false;
  }
  const callTarget = initializer.expression;
  if (!ts.isPropertyAccessExpression(callTarget)) {
    return false;
  }
  if (callTarget.name.text !== 'parse') {
    return false;
  }
  const receiver = callTarget.expression;
  if (!ts.isPropertyAccessExpression(receiver)) {
    return false;
  }
  if (receiver.name.text !== 'parser') {
    return false;
  }
  return receiver.expression.kind === ts.SyntaxKind.ThisKeyword;
};

const getRunOptionsDeclarations = (methodDecl: ts.MethodDeclaration): ts.VariableDeclaration[] => {
  const declarations: ts.VariableDeclaration[] = [];
  const methodBody = methodDecl.body;
  if (!methodBody) {
    return declarations;
  }

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.name.text === 'options') {
        declarations.push(node);
      }
    }
    node.forEachChild(visit);
  };

  methodBody.forEachChild(visit);

  return declarations;
};

const getParserParseCalls = (methodDecl: ts.MethodDeclaration): ts.CallExpression[] => {
  const calls: ts.CallExpression[] = [];
  const methodBody = methodDecl.body;
  if (!methodBody) {
    return calls;
  }

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isThisParserParseCall(node)) {
      calls.push(node);
    }
    node.forEachChild(visit);
  };

  methodBody.forEachChild(visit);

  return calls;
};

describe('Application.run architecture', () => {
  const applicationClass = getClassDeclaration('Application');
  const runMethod = getMethodDeclaration(applicationClass, 'run');

  it('stores parser.parse result in OptionsInterface', () => {
    const declarations = getRunOptionsDeclarations(runMethod);
    expect(declarations).toHaveLength(EXPECTED_OPTIONS_DECLARATION_COUNT);

    declarations.forEach((declaration) => {
      assertTypeReferenceName(declaration.type, 'OptionsInterface');
      expect(isThisParserParseCall(declaration.initializer)).toBe(true);
    });
  });

  it('invokes parser.parse via this.parser', () => {
    const parseCalls = getParserParseCalls(runMethod);
    expect(parseCalls).toHaveLength(EXPECTED_PARSER_PARSE_CALL_COUNT);
  });
});
