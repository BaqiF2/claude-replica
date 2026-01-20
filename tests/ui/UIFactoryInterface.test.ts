import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const UI_FACTORY_INTERFACE_PATH = path.join(
  __dirname,
  '../../src/ui/contracts/core/UIFactory.ts'
);
const UI_FACTORY_INTERFACE_ENCODING = 'utf-8';
const EXPECTED_METHOD_COUNT = parseInt(
  process.env.UI_FACTORY_INTERFACE_METHOD_COUNT || '4',
  10
);
const EXPECTED_IMPORT_COUNT = parseInt(
  process.env.UI_FACTORY_INTERFACE_IMPORT_COUNT || '4',
  10
);

const sourceText = fs.readFileSync(
  UI_FACTORY_INTERFACE_PATH,
  UI_FACTORY_INTERFACE_ENCODING
);
const sourceFile = ts.createSourceFile(
  UI_FACTORY_INTERFACE_PATH,
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
  const member = iface.members.find((item) => {
    if (!ts.isMethodSignature(item)) {
      return false;
    }
    if (!item.name || !ts.isIdentifier(item.name)) {
      return false;
    }
    return item.name.text === name;
  });

  if (!member || !ts.isMethodSignature(member)) {
    throw new Error(`Method not found: ${name}`);
  }

  return member;
};

const assertTypeReference = (node: ts.TypeNode | undefined, name: string): void => {
  expect(node).toBeDefined();
  if (!node) {
    return;
  }
  expect(ts.isTypeReferenceNode(node)).toBe(true);
  if (!ts.isTypeReferenceNode(node)) {
    return;
  }
  expect(node.typeName.getText(sourceFile)).toBe(name);
};

describe('UIFactory', () => {
  const uiFactoryInterface = getInterfaceDeclaration('UIFactory');

  it('defines required factory methods', () => {
    const methodNames = [
      'createParser',
      'createOutput',
      'createPermissionUI',
      'createInteractiveUI',
    ];
    expect(methodNames).toHaveLength(EXPECTED_METHOD_COUNT);
    methodNames.forEach((methodName) => {
      expect(getMethodSignature(uiFactoryInterface, methodName)).toBeDefined();
    });
  });

  it('defines createParser(): ParserInterface', () => {
    const createParser = getMethodSignature(uiFactoryInterface, 'createParser');
    expect(createParser.parameters).toHaveLength(0);
    assertTypeReference(createParser.type, 'ParserInterface');
  });

  it('defines createOutput(): OutputInterface', () => {
    const createOutput = getMethodSignature(uiFactoryInterface, 'createOutput');
    expect(createOutput.parameters).toHaveLength(0);
    assertTypeReference(createOutput.type, 'OutputInterface');
  });

  it('defines createPermissionUI(): PermissionUI', () => {
    const createPermissionUI = getMethodSignature(uiFactoryInterface, 'createPermissionUI');
    expect(createPermissionUI.parameters).toHaveLength(2);
    assertTypeReference(createPermissionUI.type, 'PermissionUI');
  });

  it('imports only ParserInterface, OutputInterface, PermissionUI, and InteractiveUIInterface', () => {
    const importDeclarations = sourceFile.statements.filter(ts.isImportDeclaration);
    expect(importDeclarations).toHaveLength(EXPECTED_IMPORT_COUNT);

    const importedModules = importDeclarations
      .map((declaration) => declaration.moduleSpecifier)
      .filter(ts.isStringLiteral)
      .map((literal) => literal.text)
      .sort();

    expect(importedModules).toEqual(
      [
        './OutputInterface',
        './ParserInterface',
        '../interactive/InteractiveUIInterface',
        '../../../permissions/PermissionUI',
      ].sort()
    );
  });
});
