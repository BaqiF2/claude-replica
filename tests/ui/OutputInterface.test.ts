import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const OUTPUT_INTERFACE_PATH = path.join(__dirname, '../../src/ui/contracts/core/OutputInterface.ts');
const OUTPUT_INTERFACE_ENCODING = 'utf-8';
const EXPECTED_METHOD_COUNT = parseInt(
  process.env.OUTPUT_INTERFACE_METHOD_COUNT || '6',
  10
);
const EXPECTED_OPTIONS_PROPERTY_COUNT = parseInt(
  process.env.OUTPUT_OPTIONS_PROPERTY_COUNT || '3',
  10
);
const EXPECTED_IMPORT_COUNT = parseInt(
  process.env.OUTPUT_INTERFACE_IMPORT_COUNT || '0',
  10
);
const EXPECTED_MESSAGE_PARAM_COUNT = parseInt(
  process.env.OUTPUT_INTERFACE_MESSAGE_PARAM_COUNT || '2',
  10
);
const EXPECTED_BLANK_LINE_PARAM_COUNT = parseInt(
  process.env.OUTPUT_INTERFACE_BLANK_LINE_PARAM_COUNT || '1',
  10
);
const EXPECTED_INDEX_FIRST = parseInt(
  process.env.OUTPUT_INTERFACE_INDEX_FIRST || '0',
  10
);
const EXPECTED_INDEX_SECOND = parseInt(
  process.env.OUTPUT_INTERFACE_INDEX_SECOND || '1',
  10
);

const sourceText = fs.readFileSync(OUTPUT_INTERFACE_PATH, OUTPUT_INTERFACE_ENCODING);
const sourceFile = ts.createSourceFile(
  OUTPUT_INTERFACE_PATH,
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

const getPropertySignature = (
  iface: ts.InterfaceDeclaration,
  name: string
): ts.PropertySignature => {
  const member = iface.members.find((item) => {
    if (!ts.isPropertySignature(item)) {
      return false;
    }
    if (!item.name || !ts.isIdentifier(item.name)) {
      return false;
    }
    return item.name.text === name;
  });

  if (!member || !ts.isPropertySignature(member)) {
    throw new Error(`Property not found: ${name}`);
  }

  return member;
};

const assertVoidType = (node: ts.TypeNode | undefined): void => {
  expect(node).toBeDefined();
  if (!node) {
    return;
  }
  expect(node.kind).toBe(ts.SyntaxKind.VoidKeyword);
};

const assertStringType = (node: ts.TypeNode | undefined): void => {
  expect(node).toBeDefined();
  if (!node) {
    return;
  }
  expect(node.kind).toBe(ts.SyntaxKind.StringKeyword);
};

const assertBooleanType = (node: ts.TypeNode | undefined): void => {
  expect(node).toBeDefined();
  if (!node) {
    return;
  }
  expect(node.kind).toBe(ts.SyntaxKind.BooleanKeyword);
};

const assertNumberType = (node: ts.TypeNode | undefined): void => {
  expect(node).toBeDefined();
  if (!node) {
    return;
  }
  expect(node.kind).toBe(ts.SyntaxKind.NumberKeyword);
};

const assertOutputOptionsType = (node: ts.TypeNode | undefined): void => {
  expect(node).toBeDefined();
  if (!node) {
    return;
  }
  expect(ts.isTypeReferenceNode(node)).toBe(true);
  if (!ts.isTypeReferenceNode(node)) {
    return;
  }
  expect(node.typeName.getText(sourceFile)).toBe('OutputOptions');
};

describe('OutputInterface', () => {
  const outputInterface = getInterfaceDeclaration('OutputInterface');
  const outputOptionsInterface = getInterfaceDeclaration('OutputOptions');

  it('defines OutputOptions with expected properties', () => {
    const propertyNames = ['color', 'timestamp', 'indent'];
    expect(propertyNames).toHaveLength(EXPECTED_OPTIONS_PROPERTY_COUNT);

    const colorProperty = getPropertySignature(outputOptionsInterface, propertyNames[0]);
    expect(colorProperty.questionToken).toBeDefined();
    assertStringType(colorProperty.type);

    const timestampProperty = getPropertySignature(outputOptionsInterface, propertyNames[1]);
    expect(timestampProperty.questionToken).toBeDefined();
    assertBooleanType(timestampProperty.type);

    const indentProperty = getPropertySignature(outputOptionsInterface, propertyNames[2]);
    expect(indentProperty.questionToken).toBeDefined();
    assertNumberType(indentProperty.type);
  });

  it('includes required output methods', () => {
    const methodNames = ['info', 'warn', 'error', 'success', 'section', 'blankLine'];
    expect(methodNames).toHaveLength(EXPECTED_METHOD_COUNT);
    methodNames.forEach((methodName) => {
      expect(getMethodSignature(outputInterface, methodName)).toBeDefined();
    });
  });

  it('defines output methods with message and options parameters', () => {
    const messageMethods = ['info', 'warn', 'error', 'success', 'section'];
    messageMethods.forEach((methodName) => {
      const method = getMethodSignature(outputInterface, methodName);
      expect(method.parameters).toHaveLength(EXPECTED_MESSAGE_PARAM_COUNT);

      const messageParam = method.parameters[EXPECTED_INDEX_FIRST];
      expect(messageParam).toBeDefined();
      if (!messageParam) {
        return;
      }
      expect(messageParam.questionToken).toBeUndefined();
      assertStringType(messageParam.type);

      const optionsParam = method.parameters[EXPECTED_INDEX_SECOND];
      expect(optionsParam).toBeDefined();
      if (!optionsParam) {
        return;
      }
      expect(optionsParam.questionToken).toBeDefined();
      assertOutputOptionsType(optionsParam.type);

      assertVoidType(method.type);
    });
  });

  it('defines blankLine(count?: number): void', () => {
    const blankLineMethod = getMethodSignature(outputInterface, 'blankLine');
    expect(blankLineMethod.parameters).toHaveLength(EXPECTED_BLANK_LINE_PARAM_COUNT);

    const countParam = blankLineMethod.parameters[EXPECTED_INDEX_FIRST];
    expect(countParam).toBeDefined();
    if (!countParam) {
      return;
    }
    expect(countParam.questionToken).toBeDefined();
    assertNumberType(countParam.type);

    assertVoidType(blankLineMethod.type);
  });

  it('has no imports', () => {
    const importDeclarations = sourceFile.statements.filter(ts.isImportDeclaration);
    expect(importDeclarations).toHaveLength(EXPECTED_IMPORT_COUNT);
  });
});
