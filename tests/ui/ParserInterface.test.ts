import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const PARSER_INTERFACE_PATH = path.join(__dirname, '../../src/ui/contracts/core/ParserInterface.ts');
const PARSER_INTERFACE_ENCODING = 'utf-8';
const EXPECTED_PARSE_PARAM_COUNT = parseInt(
  process.env.PARSER_INTERFACE_PARSE_PARAM_COUNT || '1',
  10
);
const EXPECTED_NO_PARAM_COUNT = parseInt(
  process.env.PARSER_INTERFACE_NO_PARAM_COUNT || '0',
  10
);

const sourceText = fs.readFileSync(PARSER_INTERFACE_PATH, PARSER_INTERFACE_ENCODING);
const sourceFile = ts.createSourceFile(
  PARSER_INTERFACE_PATH,
  sourceText,
  ts.ScriptTarget.Latest,
  true
);

const getInterfaceDeclaration = (name: string): ts.InterfaceDeclaration => {
  let found: ts.InterfaceDeclaration | undefined;
  sourceFile.forEachChild((node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === name) {
      found = node;
    }
  });

  if (!found) {
    throw new Error(`Interface not found: ${name}`);
  }

  return found;
};

const getMethodSignature = (
  iface: ts.InterfaceDeclaration,
  name: string
): ts.MethodSignature => {
  const method = iface.members.find((member) => {
    if (!ts.isMethodSignature(member)) {
      return false;
    }
    if (!member.name || !ts.isIdentifier(member.name)) {
      return false;
    }
    return member.name.text === name;
  });

  if (!method || !ts.isMethodSignature(method)) {
    throw new Error(`Method not found: ${name}`);
  }

  return method;
};

const assertStringKeywordType = (node: ts.TypeNode | undefined): void => {
  expect(node).toBeDefined();
  if (!node) {
    return;
  }
  expect(node.kind).toBe(ts.SyntaxKind.StringKeyword);
};

const assertOptionsInterfaceType = (node: ts.TypeNode | undefined): void => {
  expect(node).toBeDefined();
  if (!node) {
    return;
  }
  expect(ts.isTypeReferenceNode(node)).toBe(true);
  if (!ts.isTypeReferenceNode(node)) {
    return;
  }
  expect(node.typeName.getText(sourceFile)).toBe('OptionsInterface');
};

describe('ParserInterface', () => {
  const parserInterface = getInterfaceDeclaration('ParserInterface');

  it('includes required methods', () => {
    expect(getMethodSignature(parserInterface, 'parse')).toBeDefined();
    expect(getMethodSignature(parserInterface, 'getHelpText')).toBeDefined();
    expect(getMethodSignature(parserInterface, 'getVersionText')).toBeDefined();
  });

  it('defines parse(args: string[]): OptionsInterface', () => {
    const parseMethod = getMethodSignature(parserInterface, 'parse');
    expect(parseMethod.parameters).toHaveLength(EXPECTED_PARSE_PARAM_COUNT);

    const firstParam = parseMethod.parameters[0];
    expect(firstParam).toBeDefined();
    if (!firstParam) {
      return;
    }

    const paramType = firstParam.type;
    expect(paramType).toBeDefined();
    if (!paramType) {
      return;
    }
    expect(ts.isArrayTypeNode(paramType)).toBe(true);
    if (!ts.isArrayTypeNode(paramType)) {
      return;
    }
    assertStringKeywordType(paramType.elementType);

    assertOptionsInterfaceType(parseMethod.type);
  });

  it('defines getHelpText(): string', () => {
    const helpMethod = getMethodSignature(parserInterface, 'getHelpText');
    expect(helpMethod.parameters).toHaveLength(EXPECTED_NO_PARAM_COUNT);
    assertStringKeywordType(helpMethod.type);
  });

  it('defines getVersionText(): string', () => {
    const versionMethod = getMethodSignature(parserInterface, 'getVersionText');
    expect(versionMethod.parameters).toHaveLength(EXPECTED_NO_PARAM_COUNT);
    assertStringKeywordType(versionMethod.type);
  });

  it('has no external imports', () => {
    const importSpecifiers = sourceFile.statements
      .filter(ts.isImportDeclaration)
      .map((statement) => statement.moduleSpecifier)
      .filter(ts.isStringLiteral)
      .map((literal) => literal.text);

    const nonRelativeImports = importSpecifiers.filter((specifier) => {
      return !specifier.startsWith('.');
    });

    expect(nonRelativeImports).toEqual([]);
  });
});
