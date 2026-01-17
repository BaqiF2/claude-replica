import type { InteractiveUICallbacks } from '../../src/ui/InteractiveUIInterface';
import type { PermissionMode } from '../../src/ui/InteractiveUIInterface';

type ExpectTrue<T extends true> = T;
type IsExact<T, U> = (<G>() => G extends T ? 'yes' : 'no') extends (
  <G>() => G extends U ? 'yes' : 'no'
)
  ? true
  : false;

export type RequiredCallbacksAssertions = [
  ExpectTrue<IsExact<InteractiveUICallbacks['onMessage'], (message: string) => Promise<void>>>,
  ExpectTrue<IsExact<InteractiveUICallbacks['onInterrupt'], () => void>>,
  ExpectTrue<IsExact<InteractiveUICallbacks['onRewind'], () => Promise<void>>>
];

export type OptionalCallbacksAssertions = [
  ExpectTrue<
    IsExact<
      InteractiveUICallbacks['onPermissionModeChange'],
      ((mode: PermissionMode) => void | Promise<void>) | undefined
    >
  >,
  ExpectTrue<
    IsExact<InteractiveUICallbacks['onQueueMessage'], ((message: string) => void) | undefined>
  >,
  ExpectTrue<IsExact<InteractiveUICallbacks['getRunner'], (() => any) | undefined>>
];

describe('InteractiveUICallbacks', () => {
  it('should compile required callback contracts', () => {
    expect(true).toBe(true);
  });
});
