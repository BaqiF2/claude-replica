import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const MAIN_PATH = path.join(__dirname, '../../src/main.ts');
const RUNNER_FACTORY_PATH = path.join(__dirname, '../../src/runners/RunnerFactory.ts');
const INTERACTIVE_RUNNER_PATH = path.join(__dirname, '../../src/runners/InteractiveRunner.ts');

const readSourceFile = (filePath: string): ts.SourceFile => {
  const sourceText = fs.readFileSync(filePath, 'utf-8');
  return ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
};

const getClassDeclaration = (sourceFile: ts.SourceFile, name: string): ts.ClassDeclaration => {
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
  classDecl: ts.ClassDeclaration,
  name: string
): ts.MethodDeclaration => {
  const methodDecl = classDecl.members.find((member) => {
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

const containsThisPropertyAccess = (node: ts.Node, propertyName: string): boolean => {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (ts.isPropertyAccessExpression(child)) {
      if (
        child.expression.kind === ts.SyntaxKind.ThisKeyword &&
        child.name.text === propertyName
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

const findNewExpression = (
  methodDecl: ts.MethodDeclaration,
  className: string
): ts.NewExpression => {
  let found: ts.NewExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === className) {
        found = node;
      }
    }
    node.forEachChild(visit);
  };
  if (methodDecl.body) {
    methodDecl.body.forEachChild(visit);
  }
  if (!found) {
    throw new Error(`New ${className}() not found`);
  }
  return found;
};

const getConstructorDeclaration = (classDecl: ts.ClassDeclaration): ts.ConstructorDeclaration => {
  const constructorDecl = classDecl.members.find(ts.isConstructorDeclaration);
  if (!constructorDecl) {
    throw new Error('Constructor not found');
  }
  return constructorDecl;
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

const hasTypeReferenceName = (node: ts.TypeNode | undefined, expected: string): boolean => {
  if (!node) {
    return false;
  }
  if (ts.isTypeReferenceNode(node)) {
    return node.typeName.getText() === expected;
  }
  if (ts.isUnionTypeNode(node)) {
    return node.types.some(
      (typeNode) =>
        ts.isTypeReferenceNode(typeNode) && typeNode.typeName.getText() === expected
    );
  }
  return false;
};

describe('Checkpoint dependency injection', () => {
  it('Application constructs CheckpointManager and passes it to RunnerFactory', () => {
    const sourceFile = readSourceFile(MAIN_PATH);
    const appClass = getClassDeclaration(sourceFile, 'Application');
    const initializeMethod = getMethodDeclaration(appClass, 'initialize');
    const runnerFactoryInstantiation = findNewExpression(initializeMethod, 'RunnerFactory');

    expect(findNewExpression(initializeMethod, 'CheckpointManager')).toBeDefined();
    expect(containsThisPropertyAccess(runnerFactoryInstantiation, 'checkpointManager')).toBe(true);
  });

  it('RunnerFactory passes checkpointManager to InteractiveRunner', () => {
    const sourceFile = readSourceFile(RUNNER_FACTORY_PATH);
    const runnerFactoryClass = getClassDeclaration(sourceFile, 'RunnerFactory');
    const createRunnerMethod = getMethodDeclaration(runnerFactoryClass, 'createRunner');
    const interactiveRunnerInstantiation = findNewExpression(
      createRunnerMethod,
      'InteractiveRunner'
    );

    expect(containsThisPropertyAccess(interactiveRunnerInstantiation, 'checkpointManager')).toBe(
      true
    );
  });

  it('InteractiveRunner constructor accepts checkpointManager parameter', () => {
    const sourceFile = readSourceFile(INTERACTIVE_RUNNER_PATH);
    const runnerClass = getClassDeclaration(sourceFile, 'InteractiveRunner');
    const constructorDecl = getConstructorDeclaration(runnerClass);
    const checkpointParam = getParameterByName(constructorDecl, 'checkpointManager');

    expect(hasTypeReferenceName(checkpointParam.type, 'CheckpointManager')).toBe(true);
  });
});
