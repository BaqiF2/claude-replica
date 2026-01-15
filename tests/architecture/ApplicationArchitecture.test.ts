import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const MAIN_PATH = path.join(__dirname, '../../src/main.ts');
const MAIN_ENCODING = 'utf-8';
const EXPECTED_CONSTRUCTOR_PARAM_COUNT = parseInt(
  process.env.MAIN_CONSTRUCTOR_PARAM_COUNT || '1',
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

const getConstructorDeclaration = (node: ts.ClassDeclaration): ts.ConstructorDeclaration => {
  const constructorDecl = node.members.find(ts.isConstructorDeclaration);
  if (!constructorDecl) {
    throw new Error('Constructor not found');
  }
  return constructorDecl;
};

const getPropertyDeclaration = (
  node: ts.ClassDeclaration,
  name: string
): ts.PropertyDeclaration => {
  const property = node.members.find((member) => {
    if (!ts.isPropertyDeclaration(member)) {
      return false;
    }
    if (!member.name || !ts.isIdentifier(member.name)) {
      return false;
    }
    return member.name.text === name;
  });

  if (!property || !ts.isPropertyDeclaration(property)) {
    throw new Error(`Property not found: ${name}`);
  }

  return property;
};

const getImportSpecifiers = (): string[] => {
  return sourceFile.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => statement.moduleSpecifier)
    .filter(ts.isStringLiteral)
    .map((literal) => literal.text);
};

const getImportedNames = (): string[] => {
  const names: string[] = [];
  sourceFile.statements
    .filter(ts.isImportDeclaration)
    .forEach((statement) => {
      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) {
        return;
      }
      bindings.elements.forEach((element) => {
        names.push(element.name.text);
      });
    });
  return names;
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

describe('Application architecture', () => {
  const applicationClass = getClassDeclaration('Application');

  it('does not import CLIParser or CLIOptions', () => {
    const importSpecifiers = getImportSpecifiers();
    const importedNames = getImportedNames();

    expect(importSpecifiers).not.toContain('./cli/CLIParser');
    expect(importedNames).not.toContain('CLIParser');
    expect(importedNames).not.toContain('CLIOptions');
  });

  it('constructor accepts UIFactory parameter', () => {
    const constructorDecl = getConstructorDeclaration(applicationClass);
    expect(constructorDecl.parameters).toHaveLength(EXPECTED_CONSTRUCTOR_PARAM_COUNT);

    const firstParam = constructorDecl.parameters[0];
    expect(firstParam).toBeDefined();
    if (!firstParam) {
      return;
    }
    assertTypeReferenceName(firstParam.type, 'UIFactory');
  });

  it('parser member uses ParserInterface type', () => {
    const parserProperty = getPropertyDeclaration(applicationClass, 'parser');
    assertTypeReferenceName(parserProperty.type, 'ParserInterface');
  });

  it('output member uses OutputInterface type', () => {
    const outputProperty = getPropertyDeclaration(applicationClass, 'output');
    assertTypeReferenceName(outputProperty.type, 'OutputInterface');
  });
});
