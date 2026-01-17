import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const RUNNER_FACTORY_PATH = path.join(__dirname, '../../src/runners/RunnerFactory.ts');
const RUNNER_FACTORY_ENCODING = 'utf-8';
const EXPECTED_CONSTRUCTOR_PARAM_COUNT = parseInt(
  process.env.RUNNER_FACTORY_CONSTRUCTOR_PARAM_COUNT || '11',
  10
);

const sourceText = fs.readFileSync(RUNNER_FACTORY_PATH, RUNNER_FACTORY_ENCODING);
const sourceFile = ts.createSourceFile(
  RUNNER_FACTORY_PATH,
  sourceText,
  ts.ScriptTarget.Latest,
  true
);

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

const containsThisUiFactoryArgument = (node: ts.Node): boolean => {
  let found = false;

  const visit = (child: ts.Node): void => {
    if (ts.isPropertyAccessExpression(child)) {
      if (
        child.expression.kind === ts.SyntaxKind.ThisKeyword &&
        child.name.text === 'uiFactory'
      ) {
        found = true;
        return;
      }
    }
    child.forEachChild(visit);
  };

  visit(node);
  return found;
};

const getInteractiveRunnerInstantiation = (
  methodDecl: ts.MethodDeclaration
): ts.NewExpression => {
  let found: ts.NewExpression | undefined;

  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'InteractiveRunner') {
        found = node;
      }
    }
    node.forEachChild(visit);
  };

  if (methodDecl.body) {
    methodDecl.body.forEachChild(visit);
  }

  if (!found) {
    throw new Error('InteractiveRunner instantiation not found');
  }

  return found;
};

const getParameterByName = (
  constructorDecl: ts.ConstructorDeclaration,
  name: string
): ts.ParameterDeclaration => {
  const param = constructorDecl.parameters.find((parameter) => {
    if (!parameter.name || !ts.isIdentifier(parameter.name)) {
      return false;
    }
    return parameter.name.text === name;
  });

  if (!param) {
    throw new Error(`Parameter not found: ${name}`);
  }

  return param;
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

describe('RunnerFactory', () => {
  const runnerFactoryClass = getClassDeclaration('RunnerFactory');

  it('constructor accepts uiFactory parameter', () => {
    const constructorDecl = getConstructorDeclaration(runnerFactoryClass);
    expect(constructorDecl.parameters).toHaveLength(EXPECTED_CONSTRUCTOR_PARAM_COUNT);

    const uiFactoryParam = getParameterByName(constructorDecl, 'uiFactory');
    assertTypeReferenceName(uiFactoryParam.type, 'UIFactory');
  });

  it('passes uiFactory when creating InteractiveRunner', () => {
    const createRunnerMethod = getMethodDeclaration(runnerFactoryClass, 'createRunner');
    const interactiveRunnerInstantiation = getInteractiveRunnerInstantiation(createRunnerMethod);
    const args = interactiveRunnerInstantiation.arguments || [];

    expect(args.length).toBeGreaterThan(0);
    expect(containsThisUiFactoryArgument(interactiveRunnerInstantiation)).toBe(true);
  });
});
