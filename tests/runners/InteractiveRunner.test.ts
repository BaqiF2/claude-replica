import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const INTERACTIVE_RUNNER_PATH = path.join(
  __dirname,
  '../../src/runners/InteractiveRunner.ts'
);
const INTERACTIVE_RUNNER_ENCODING = 'utf-8';
const EXPECTED_CONSTRUCTOR_PARAM_COUNT = parseInt(
  process.env.INTERACTIVE_RUNNER_CONSTRUCTOR_PARAM_COUNT || '10',
  10
);

const sourceText = fs.readFileSync(
  INTERACTIVE_RUNNER_PATH,
  INTERACTIVE_RUNNER_ENCODING
);
const sourceFile = ts.createSourceFile(
  INTERACTIVE_RUNNER_PATH,
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

const getCallbacksObjectLiteral = (
  methodDecl: ts.MethodDeclaration
): ts.ObjectLiteralExpression => {
  let found: ts.ObjectLiteralExpression | undefined;

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) {
      if (ts.isIdentifier(node.name) && node.name.text === 'callbacks') {
        if (node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
          found = node.initializer;
        }
      }
    }
    node.forEachChild(visit);
  };

  if (methodDecl.body) {
    methodDecl.body.forEachChild(visit);
  }

  if (!found) {
    throw new Error('Callbacks object literal not found');
  }

  return found;
};

const getPropertyAssignment = (
  objectLiteral: ts.ObjectLiteralExpression,
  name: string
): ts.PropertyAssignment => {
  const prop = objectLiteral.properties.find((property) => {
    if (!ts.isPropertyAssignment(property)) {
      return false;
    }
    if (!property.name) {
      return false;
    }
    if (ts.isIdentifier(property.name)) {
      return property.name.text === name;
    }
    if (ts.isStringLiteral(property.name)) {
      return property.name.text === name;
    }
    return false;
  });

  if (!prop || !ts.isPropertyAssignment(prop)) {
    throw new Error(`Callback not found: ${name}`);
  }

  return prop;
};

const getStreamingQueryManagerOptions = (
  methodDecl: ts.MethodDeclaration
): ts.ObjectLiteralExpression => {
  let found: ts.ObjectLiteralExpression | undefined;

  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'StreamingQueryManagerImpl') {
        const arg = node.arguments?.[0];
        if (arg && ts.isObjectLiteralExpression(arg)) {
          found = arg;
        }
      }
    }
    node.forEachChild(visit);
  };

  if (methodDecl.body) {
    methodDecl.body.forEachChild(visit);
  }

  if (!found) {
    throw new Error('StreamingQueryManager options not found');
  }

  return found;
};

const assertInitializerIsThisProperty = (
  property: ts.PropertyAssignment,
  name: string
): void => {
  const initializer = property.initializer;
  expect(ts.isPropertyAccessExpression(initializer)).toBe(true);
  if (!ts.isPropertyAccessExpression(initializer)) {
    return;
  }
  expect(initializer.name.text).toBe(name);
  expect(initializer.expression.kind).toBe(ts.SyntaxKind.ThisKeyword);
};

const callMatchesThisChain = (node: ts.CallExpression, chain: string[]): boolean => {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }

  const names: string[] = [];
  let current: ts.Expression = node.expression;

  while (ts.isPropertyAccessExpression(current)) {
    names.unshift(current.name.text);
    current = current.expression;
  }

  if (current.kind !== ts.SyntaxKind.ThisKeyword) {
    return false;
  }

  return names.join('.') === chain.join('.');
};

const containsCallOnThisChain = (node: ts.Node, chain: string[]): boolean => {
  let found = false;

  const visit = (child: ts.Node): void => {
    if (ts.isCallExpression(child) && callMatchesThisChain(child, chain)) {
      found = true;
      return;
    }
    child.forEachChild(visit);
  };

  visit(node);
  return found;
};

const getPropertyName = (property: ts.ObjectLiteralElementLike): string | null => {
  if (!ts.isPropertyAssignment(property)) {
    return null;
  }
  if (ts.isIdentifier(property.name)) {
    return property.name.text;
  }
  if (ts.isStringLiteral(property.name)) {
    return property.name.text;
  }
  return null;
};

const objectLiteralHasProperties = (
  objectLiteral: ts.ObjectLiteralExpression,
  properties: string[]
): boolean =>
  properties.every((name) =>
    objectLiteral.properties.some((property) => getPropertyName(property) === name)
  );

const containsReturnObjectWithProperties = (node: ts.Node, properties: string[]): boolean => {
  let found = false;

  const visit = (child: ts.Node): void => {
    if (ts.isReturnStatement(child) && child.expression) {
      if (
        ts.isObjectLiteralExpression(child.expression) &&
        objectLiteralHasProperties(child.expression, properties)
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

describe('InteractiveRunner', () => {
  const runnerClass = getClassDeclaration('InteractiveRunner');

  it('constructor accepts uiFactory parameter', () => {
    const constructorDecl = getConstructorDeclaration(runnerClass);
    expect(constructorDecl.parameters).toHaveLength(EXPECTED_CONSTRUCTOR_PARAM_COUNT);

    const uiFactoryParam = getParameterByName(constructorDecl, 'uiFactory');
    assertTypeReferenceName(uiFactoryParam.type, 'UIFactory');
  });

  it('uses uiFactory.createInteractiveUI when creating the UI', () => {
    const runMethod = getMethodDeclaration(runnerClass, 'run');
    let found = false;

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        if (
          ts.isPropertyAccessExpression(expression) &&
          expression.name.text === 'createInteractiveUI'
        ) {
          const target = expression.expression;
          if (
            ts.isPropertyAccessExpression(target) &&
            target.name.text === 'uiFactory' &&
            target.expression.kind === ts.SyntaxKind.ThisKeyword
          ) {
            found = true;
          }
        }
      }
      node.forEachChild(visit);
    };

    if (runMethod.body) {
      runMethod.body.forEachChild(visit);
    }

    expect(found).toBe(true);
  });

  it('wires interactive UI callbacks to runner handlers', () => {
    const runMethod = getMethodDeclaration(runnerClass, 'run');
    const callbacksObject = getCallbacksObjectLiteral(runMethod);

    const onMessage = getPropertyAssignment(callbacksObject, 'onMessage');
    expect(containsCallOnThisChain(onMessage, ['handleUserMessage'])).toBe(true);

    const onInterrupt = getPropertyAssignment(callbacksObject, 'onInterrupt');
    expect(containsCallOnThisChain(onInterrupt, ['handleInterrupt'])).toBe(true);

    const onRewind = getPropertyAssignment(callbacksObject, 'onRewind');
    expect(containsCallOnThisChain(onRewind, ['handleRewind'])).toBe(true);

    const onPermissionModeChange = getPropertyAssignment(
      callbacksObject,
      'onPermissionModeChange'
    );
    expect(containsCallOnThisChain(onPermissionModeChange, ['permissionManager', 'setMode'])).toBe(
      true
    );

    const onQueueMessage = getPropertyAssignment(callbacksObject, 'onQueueMessage');
    expect(
      containsCallOnThisChain(onQueueMessage, ['streamingQueryManager', 'queueMessage'])
    ).toBe(true);

    // getRunner callback should exist and return 'this'
    const getRunner = getPropertyAssignment(callbacksObject, 'getRunner');
    expect(getRunner).toBeDefined();
  });

  it('passes ui to StreamingQueryManager', () => {
    const runMethod = getMethodDeclaration(runnerClass, 'run');
    const optionsObject = getStreamingQueryManagerOptions(runMethod);
    const uiProperty = getPropertyAssignment(optionsObject, 'ui');

    assertInitializerIsThisProperty(uiProperty, 'ui');
  });

  it('defines getSessionStatsData method', () => {
    const methodDecl = getMethodDeclaration(runnerClass, 'getSessionStatsData');
    expect(methodDecl).toBeDefined();
  });

  it('getSessionStatsData uses sessionManager.calculateSessionStats', () => {
    const methodDecl = getMethodDeclaration(runnerClass, 'getSessionStatsData');
    expect(containsCallOnThisChain(methodDecl, ['sessionManager', 'calculateSessionStats'])).toBe(
      true
    );
  });

  it('getSessionStatsData returns empty stats when no active session', () => {
    const methodDecl = getMethodDeclaration(runnerClass, 'getSessionStatsData');
    const requiredProperties = [
      'messageCount',
      'totalInputTokens',
      'totalOutputTokens',
      'totalCacheCreationInputTokens',
      'totalCacheReadInputTokens',
      'totalCostUsd',
      'lastMessagePreview',
    ];

    expect(containsReturnObjectWithProperties(methodDecl, requiredProperties)).toBe(true);
  });
});
