jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: jest.fn(),
}));

import { SDKQueryExecutor, SDKQueryOptions } from '../../src/sdk/SDKQueryExecutor';

describe('SDKQueryExecutor checkpoint options', () => {
  let executor: SDKQueryExecutor;

  beforeEach(() => {
    executor = new SDKQueryExecutor();
  });

  it('adds replay-user-messages when file checkpointing is enabled', () => {
    const options: SDKQueryOptions = {
      prompt: 'Hello',
      enableFileCheckpointing: true,
    };

    const sdkOptions = executor.mapToSDKOptions(options);

    expect(sdkOptions.enableFileCheckpointing).toBe(true);
    expect(sdkOptions.extraArgs).toEqual({ 'replay-user-messages': null });
  });

  it('merges replay-user-messages with existing extraArgs', () => {
    const options: SDKQueryOptions = {
      prompt: 'Hello',
      enableFileCheckpointing: true,
      extraArgs: { 'custom-flag': 'value' },
    };

    const sdkOptions = executor.mapToSDKOptions(options);

    expect(sdkOptions.extraArgs).toEqual({
      'custom-flag': 'value',
      'replay-user-messages': null,
    });
  });
});
