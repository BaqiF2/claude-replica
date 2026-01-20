import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const UI_FACTORY_INTERFACE_PATH = path.join(
  __dirname,
  '../../../src/ui/contracts/core/UIFactory.ts'
);
const UI_FACTORY_INTERFACE_ENCODING = 'utf-8';

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

describe('UIFactory', () => {
  it('defines createInteractiveUI method', () => {
    const uiFactoryInterface = getInterfaceDeclaration('UIFactory');
    expect(getMethodSignature(uiFactoryInterface, 'createInteractiveUI')).toBeDefined();
  });
});
