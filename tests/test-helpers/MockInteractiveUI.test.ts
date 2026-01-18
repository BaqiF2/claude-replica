import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const MOCK_UI_PATH = path.join(__dirname, 'MockInteractiveUI.ts');
const MOCK_UI_ENCODING = 'utf-8';

const sourceText = fs.readFileSync(MOCK_UI_PATH, MOCK_UI_ENCODING);
const sourceFile = ts.createSourceFile(MOCK_UI_PATH, sourceText, ts.ScriptTarget.Latest, true);

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

const getMethodNames = (node: ts.ClassDeclaration): string[] => {
  const names: string[] = [];
  node.members.forEach((member) => {
    if (!ts.isMethodDeclaration(member)) {
      return;
    }
    if (!member.name || !ts.isIdentifier(member.name)) {
      return;
    }
    names.push(member.name.text);
  });
  return names;
};

const implementsInterface = (node: ts.ClassDeclaration, name: string): boolean => {
  const clauses = node.heritageClauses || [];
  return clauses.some((clause) => {
    if (clause.token !== ts.SyntaxKind.ImplementsKeyword) {
      return false;
    }
    return clause.types.some((type) => type.expression.getText(sourceFile) === name);
  });
};

describe('MockInteractiveUI', () => {
  const mockClass = getClassDeclaration('MockInteractiveUI');

  it('implements InteractiveUIInterface', () => {
    expect(implementsInterface(mockClass, 'InteractiveUIInterface')).toBe(true);
  });

  it('defines all InteractiveUIInterface methods', () => {
    const methodNames = getMethodNames(mockClass);
    [
      'start',
      'stop',
      'displayMessage',
      'displayToolUse',
      'displayToolResult',
      'displayThinking',
      'displayComputing',
      'stopComputing',
      'clearProgress',
      'displayError',
      'displayWarning',
      'displaySuccess',
      'displayInfo',
      'displayTodoList',
      'promptConfirmation',
      'showRewindMenu',
      'showSessionMenu',
      'showConfirmationMenu',
      'setInitialPermissionMode',
      'setPermissionMode',
      'displayPermissionStatus',
      'setProcessingState',
      'formatRelativeTime',
      'formatAbsoluteTime',
      'formatStatsSummary',
    ].forEach((name) => {
      expect(methodNames).toContain(name);
    });
  });
});
