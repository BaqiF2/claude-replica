import type { InteractiveUIInterface } from '../../src/ui/InteractiveUIInterface';
import type { MessageRole, PermissionMode, Snapshot, TodoItem } from '../../src/ui/InteractiveUIInterface';
import type { Session, SessionStats } from '../../src/core/SessionManager';

type ExpectTrue<T extends true> = T;
type IsExact<T, U> = (<G>() => G extends T ? 'yes' : 'no') extends (
  <G>() => G extends U ? 'yes' : 'no'
)
  ? true
  : false;

export type LifecycleAssertions = [
  ExpectTrue<IsExact<InteractiveUIInterface['start'], () => Promise<void>>>,
  ExpectTrue<IsExact<InteractiveUIInterface['stop'], () => void>>
];

export type MessageDisplayAssertions = [
  ExpectTrue<
    IsExact<InteractiveUIInterface['displayMessage'], (message: string, role: MessageRole) => void>
  >,
  ExpectTrue<
    IsExact<InteractiveUIInterface['displayToolUse'], (tool: string, args: Record<string, unknown>) => void>
  >,
  ExpectTrue<
    IsExact<
      InteractiveUIInterface['displayToolResult'],
      (tool: string, result: string, isError?: boolean) => void
    >
  >
];

export type ProgressDisplayAssertions = [
  ExpectTrue<IsExact<InteractiveUIInterface['displayThinking'], (content?: string) => void>>,
  ExpectTrue<IsExact<InteractiveUIInterface['displayComputing'], () => void>>,
  ExpectTrue<IsExact<InteractiveUIInterface['stopComputing'], () => void>>,
  ExpectTrue<IsExact<InteractiveUIInterface['clearProgress'], () => void>>
];

export type StatusNotificationAssertions = [
  ExpectTrue<IsExact<InteractiveUIInterface['displayError'], (message: string) => void>>,
  ExpectTrue<IsExact<InteractiveUIInterface['displayWarning'], (message: string) => void>>,
  ExpectTrue<IsExact<InteractiveUIInterface['displaySuccess'], (message: string) => void>>,
  ExpectTrue<IsExact<InteractiveUIInterface['displayInfo'], (message: string) => void>>
];

export type UserInteractionAssertions = [
  ExpectTrue<IsExact<InteractiveUIInterface['promptConfirmation'], (message: string) => Promise<boolean>>>,
  ExpectTrue<
    IsExact<InteractiveUIInterface['showRewindMenu'], (snapshots: Snapshot[]) => Promise<Snapshot | null>>
  >,
  ExpectTrue<
    IsExact<InteractiveUIInterface['showSessionMenu'], (sessions: Session[]) => Promise<Session | null>>
  >,
  ExpectTrue<
    IsExact<
      InteractiveUIInterface['showConfirmationMenu'],
      (
        title: string,
        options: Array<{ key: string; label: string; description?: string }>,
        defaultKey?: string
      ) => Promise<boolean>
    >
  >
];

export type PermissionModeAssertions = [
  ExpectTrue<IsExact<InteractiveUIInterface['setInitialPermissionMode'], (mode: PermissionMode) => void>>,
  ExpectTrue<IsExact<InteractiveUIInterface['setPermissionMode'], (mode: PermissionMode) => void>>,
  ExpectTrue<IsExact<InteractiveUIInterface['displayPermissionStatus'], (mode: PermissionMode) => void>>
];

export type ProcessingStateAssertions = [
  ExpectTrue<IsExact<InteractiveUIInterface['setProcessingState'], (processing: boolean) => void>>
];

export type ToolMethodAssertions = [
  ExpectTrue<IsExact<InteractiveUIInterface['formatRelativeTime'], (date: Date) => string>>,
  ExpectTrue<IsExact<InteractiveUIInterface['formatAbsoluteTime'], (date: Date) => string>>,
  ExpectTrue<IsExact<InteractiveUIInterface['formatStatsSummary'], (stats?: SessionStats) => string>>,
  ExpectTrue<IsExact<InteractiveUIInterface['displayTodoList'], (todos: TodoItem[]) => void>>
];

describe('InteractiveUIInterface', () => {
  it('should compile type contracts', () => {
    expect(true).toBe(true);
  });
});
