type ExpectTrue<T extends true> = T;
type IsExact<T, U> = (<G>() => G extends T ? 'yes' : 'no') extends (
  <G>() => G extends U ? 'yes' : 'no'
)
  ? true
  : false;

import type { InteractiveUIConfig } from '../../src/ui/contracts/interactive/InteractiveUIInterface';

export type ConfigAssertions = [
  ExpectTrue<IsExact<InteractiveUIConfig['input'], NodeJS.ReadableStream | undefined>>,
  ExpectTrue<IsExact<InteractiveUIConfig['output'], NodeJS.WritableStream | undefined>>,
  ExpectTrue<IsExact<InteractiveUIConfig['enableColors'], boolean | undefined>>
];

describe('InteractiveUIConfig', () => {
  it('should compile config contracts', () => {
    expect(true).toBe(true);
  });
});
