import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const OPTIONS_INTERFACE_PATH = path.join(
  __dirname,
  '../../src/ui/contracts/core/OptionsInterface.ts'
);
const OPTIONS_INTERFACE_ENCODING = 'utf-8';
const EXPECTED_REQUIRED_PROPERTY_COUNT = parseInt(
  process.env.OPTIONS_INTERFACE_REQUIRED_PROPERTY_COUNT || '3',
  10
);
const EXPECTED_IMPORT_COUNT = parseInt(
  process.env.OPTIONS_INTERFACE_IMPORT_COUNT || '0',
  10
);
const EXPECTED_INDEX_SIGNATURE_COUNT = parseInt(
  process.env.OPTIONS_INTERFACE_INDEX_SIGNATURE_COUNT || '1',
  10
);

const sourceText = fs.readFileSync(OPTIONS_INTERFACE_PATH, OPTIONS_INTERFACE_ENCODING);
const sourceFile = ts.createSourceFile(
  OPTIONS_INTERFACE_PATH,
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

const getIndexSignatures = (
  iface: ts.InterfaceDeclaration
): ts.IndexSignatureDeclaration[] => {
  return iface.members.filter(ts.isIndexSignatureDeclaration);
};

const assertBooleanKeywordType = (node: ts.TypeNode | undefined): void => {
  expect(node).toBeDefined();
  if (!node) {
    return;
  }
  expect(node.kind).toBe(ts.SyntaxKind.BooleanKeyword);
};

const assertUnknownKeywordType = (node: ts.TypeNode | undefined): void => {
  expect(node).toBeDefined();
  if (!node) {
    return;
  }
  expect(node.kind).toBe(ts.SyntaxKind.UnknownKeyword);
};

describe('OptionsInterface', () => {
  const optionsInterface = getInterfaceDeclaration('OptionsInterface');

  it('defines required boolean flags', () => {
    const requiredProperties = ['help', 'version', 'debug'];
    expect(requiredProperties).toHaveLength(EXPECTED_REQUIRED_PROPERTY_COUNT);

    requiredProperties.forEach((propertyName) => {
      const property = getPropertySignature(optionsInterface, propertyName);
      expect(property.questionToken).toBeUndefined();
      assertBooleanKeywordType(property.type);
    });
  });

  it('supports index signature for extensions', () => {
    const indexSignatures = getIndexSignatures(optionsInterface);
    expect(indexSignatures).toHaveLength(EXPECTED_INDEX_SIGNATURE_COUNT);

    const indexSignature = indexSignatures[0];
    expect(indexSignature.parameters).toHaveLength(1);
    const indexParam = indexSignature.parameters[0];
    expect(indexParam).toBeDefined();
    if (!indexParam) {
      return;
    }
    const indexParamType = indexParam.type;
    expect(indexParamType).toBeDefined();
    if (!indexParamType) {
      return;
    }
    expect(indexParamType.kind).toBe(ts.SyntaxKind.StringKeyword);
    assertUnknownKeywordType(indexSignature.type);
  });

  it('has no imports', () => {
    const importDeclarations = sourceFile.statements.filter(ts.isImportDeclaration);
    expect(importDeclarations).toHaveLength(EXPECTED_IMPORT_COUNT);
  });
});
