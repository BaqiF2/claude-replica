import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';
import { TerminalInteractiveUI } from '../../src/ui/TerminalInteractiveUI';
import type { InteractiveUICallbacks } from '../../src/ui/InteractiveUIInterface';

const TEST_DELAY_MS = parseInt(process.env.TERMINAL_UI_TEST_DELAY_MS || '10', 10);
const DOUBLE_ESC_DELAY_MS = parseInt(process.env.TERMINAL_UI_DOUBLE_ESC_DELAY_MS || '50', 10);
const ESC_DOUBLE_PRESS_WINDOW_MS = parseInt(
  process.env.TERMINAL_UI_ESC_DOUBLE_PRESS_WINDOW_MS || '300',
  10
);
const ESC_KEY = '\x1b';

const createMockInput = (): Readable & { push: (data: string | null) => boolean } => {
  const input = new Readable({
    read() {},
  });
  return input as Readable & { push: (data: string | null) => boolean };
};

const createMockOutput = (): Writable & { getOutput: () => string } => {
  let buffer = '';
  const output = new Writable({
    write(chunk, _encoding, callback) {
      buffer += chunk.toString();
      callback();
    },
  }) as Writable & { getOutput: () => string };

  output.getOutput = () => buffer;
  return output;
};

const createCallbacks = (
  overrides: Partial<InteractiveUICallbacks> = {}
): InteractiveUICallbacks => ({
  onMessage: async () => {},
  onInterrupt: () => {},
  onRewind: async () => {},
  ...overrides,
});

describe('TerminalInteractiveUI', () => {
  it('should not extend EventEmitter', () => {
    const ui = new TerminalInteractiveUI(createCallbacks());
    expect(ui).not.toBeInstanceOf(EventEmitter);
  });

  it('should accept callbacks in constructor', () => {
    expect(() => {
      const ui = new TerminalInteractiveUI(createCallbacks(), {});
      void ui;
    }).not.toThrow();
  });

  it('should render ansi colors when enabled', () => {
    const output = createMockOutput();
    const ui = new TerminalInteractiveUI(createCallbacks(), {
      output,
      enableColors: true,
    });

    ui.displayMessage('color-test', 'user');

    expect(output.getOutput()).toMatch(/\x1b\[/);
  });

  it('should write prompt output using readline', async () => {
    const input = createMockInput();
    const output = createMockOutput();
    const ui = new TerminalInteractiveUI(createCallbacks(), {
      input,
      output,
      enableColors: false,
    });

    const startPromise = ui.start();
    await new Promise((resolve) => setTimeout(resolve, TEST_DELAY_MS));
    ui.stop();
    await startPromise;

    expect(output.getOutput()).toContain('> ');
  });

  it('should toggle raw mode when stdin is tty', async () => {
    const output = createMockOutput();
    const setRawMode = jest.fn();
    const originalStdinDescriptor = Object.getOwnPropertyDescriptor(process, 'stdin');
    const mockStdin = createMockInput() as NodeJS.ReadStream & {
      setRawMode: (mode: boolean) => void;
      isTTY: boolean;
    };
    mockStdin.setRawMode = setRawMode;
    mockStdin.isTTY = true;

    try {
      Object.defineProperty(process, 'stdin', {
        configurable: true,
        enumerable: true,
        get: () => mockStdin,
      });

      const ui = new TerminalInteractiveUI(createCallbacks(), {
        input: process.stdin,
        output,
        enableColors: false,
      });

      const startPromise = ui.start();
      await new Promise((resolve) => setTimeout(resolve, TEST_DELAY_MS));
      ui.stop();
      await startPromise;

      expect(setRawMode).toHaveBeenCalledWith(true);
      expect(setRawMode).toHaveBeenCalledWith(false);
    } finally {
      if (originalStdinDescriptor) {
        Object.defineProperty(process, 'stdin', originalStdinDescriptor);
      }
    }
  });

  it('should call onMessage when user submits input', async () => {
    const input = createMockInput();
    const output = createMockOutput();
    const onMessage = jest.fn().mockResolvedValue(undefined);
    const ui = new TerminalInteractiveUI(createCallbacks({ onMessage }), {
      input,
      output,
      enableColors: false,
    });

    const startPromise = ui.start();
    await new Promise((resolve) => setTimeout(resolve, TEST_DELAY_MS));

    input.emit('data', Buffer.from('hello\n'));
    await new Promise((resolve) => setTimeout(resolve, TEST_DELAY_MS));

    ui.stop();
    await startPromise;

    expect(onMessage).toHaveBeenCalledWith('hello');
  });

  it('should display help information when user submits /help command', async () => {
    const input = createMockInput();
    const output = createMockOutput();
    const ui = new TerminalInteractiveUI(createCallbacks(), {
      input,
      output,
      enableColors: false,
    });

    const startPromise = ui.start();
    await new Promise((resolve) => setTimeout(resolve, TEST_DELAY_MS));

    input.emit('data', Buffer.from('/help\n'));
    await new Promise((resolve) => setTimeout(resolve, TEST_DELAY_MS));

    ui.stop();
    await startPromise;

    // Verify that help information is displayed
    expect(output.getOutput()).toContain('Available commands:');
    expect(output.getOutput()).toContain('/help');
    expect(output.getOutput()).toContain('/sessions');
    expect(output.getOutput()).toContain('/config');
    expect(output.getOutput()).toContain('/permissions');
    expect(output.getOutput()).toContain('/mcp');
  });

  it('should call onInterrupt when user presses esc', async () => {
    const output = createMockOutput();
    const onInterrupt = jest.fn();
    const ui = new TerminalInteractiveUI(createCallbacks({ onInterrupt }), {
      input: process.stdin,
      output,
      enableColors: false,
    });

    const startPromise = ui.start();
    await new Promise((resolve) => setTimeout(resolve, TEST_DELAY_MS));

    process.stdin.emit('data', Buffer.from(ESC_KEY));
    await new Promise((resolve) =>
      setTimeout(resolve, ESC_DOUBLE_PRESS_WINDOW_MS + TEST_DELAY_MS)
    );

    ui.stop();
    await startPromise;

    expect(onInterrupt).toHaveBeenCalled();
  });

  it('should call onRewind when user presses esc twice', async () => {
    const output = createMockOutput();
    const onRewind = jest.fn().mockResolvedValue(undefined);
    const ui = new TerminalInteractiveUI(createCallbacks({ onRewind }), {
      input: process.stdin,
      output,
      enableColors: false,
    });

    const startPromise = ui.start();
    await new Promise((resolve) => setTimeout(resolve, TEST_DELAY_MS));

    process.stdin.emit('data', Buffer.from(ESC_KEY));
    await new Promise((resolve) => setTimeout(resolve, DOUBLE_ESC_DELAY_MS));
    process.stdin.emit('data', Buffer.from(ESC_KEY));
    await new Promise((resolve) => setTimeout(resolve, TEST_DELAY_MS));

    ui.stop();
    await startPromise;

    expect(onRewind).toHaveBeenCalled();
  });

  it('should call onPermissionModeChange when user presses shift+tab', async () => {
    const output = createMockOutput();
    const onPermissionModeChange = jest.fn().mockResolvedValue(undefined);
    const ui = new TerminalInteractiveUI(createCallbacks({ onPermissionModeChange }), {
      input: process.stdin,
      output,
      enableColors: false,
    });

    const startPromise = ui.start();
    await new Promise((resolve) => setTimeout(resolve, TEST_DELAY_MS));

    process.stdin.emit('data', Buffer.from('\x1b[Z'));
    await new Promise((resolve) => setTimeout(resolve, TEST_DELAY_MS));

    ui.stop();
    await startPromise;

    expect(onPermissionModeChange).toHaveBeenCalledWith('acceptEdits');
  });

  it('should call onQueueMessage when processing input', async () => {
    const input = createMockInput();
    const output = createMockOutput();
    const onQueueMessage = jest.fn();
    const ui = new TerminalInteractiveUI(createCallbacks({ onQueueMessage }), {
      input,
      output,
      enableColors: false,
    });

    ui.setProcessingState(true);
    const startPromise = ui.start();
    await new Promise((resolve) => setTimeout(resolve, TEST_DELAY_MS));

    input.emit('data', Buffer.from('queued\n'));
    await new Promise((resolve) => setTimeout(resolve, TEST_DELAY_MS));

    ui.stop();
    await startPromise;

    expect(onQueueMessage).toHaveBeenCalledWith('queued');
  });
});
