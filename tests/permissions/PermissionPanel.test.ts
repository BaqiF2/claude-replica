/**
 * File: PermissionPanel unit tests
 *
 * Core Tests:
 * - PermissionPanel displays tool permission requests correctly
 * - PermissionPanel handles user input (y/n/Esc)
 * - PermissionPanel supports TTY and non-TTY modes
 */

import { PermissionPanel } from '../../src/permissions/PermissionUI';
import { ToolPermissionRequest } from '../../src/permissions/types';
import { Writable, Readable } from 'stream';

describe('PermissionPanel', () => {
  let mockOutput: Writable;
  let mockInput: Readable;
  let outputData: string[];

  beforeEach(() => {
    outputData = [];

    // Mock output stream
    mockOutput = new Writable({
      write(chunk: Buffer, _encoding: string, callback: () => void) {
        outputData.push(chunk.toString());
        callback();
      },
    });

    // Mock input stream
    mockInput = new Readable({
      read() {
        // No-op
      },
    });
  });

  afterEach(() => {
    mockInput.removeAllListeners();
  });

  describe('show()', () => {
    it('should display tool name and parameters', async () => {
      const panel = new PermissionPanel(mockOutput, mockInput);

      const request: ToolPermissionRequest = {
        toolName: 'Bash',
        toolUseID: 'test-001',
        input: {
          command: 'ls -la',
          description: 'List files',
        },
        timestamp: new Date(),
      };

      // Simulate user approving immediately
      setTimeout(() => {
        mockInput.push('y');
      }, 10);

      const result = await panel.show(request);

      expect(result.approved).toBe(true);

      const output = outputData.join('');
      expect(output).toContain('Bash');
      expect(output).toContain('command');
      expect(output).toContain('ls -la');
    });

    it('should return approved=true when user presses "y"', async () => {
      const panel = new PermissionPanel(mockOutput, mockInput);

      const request: ToolPermissionRequest = {
        toolName: 'Read',
        toolUseID: 'test-002',
        input: { file_path: '/tmp/test.txt' },
        timestamp: new Date(),
      };

      setTimeout(() => {
        mockInput.push('y');
      }, 10);

      const result = await panel.show(request);

      expect(result.approved).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return approved=false when user presses "n"', async () => {
      const panel = new PermissionPanel(mockOutput, mockInput);

      const request: ToolPermissionRequest = {
        toolName: 'Write',
        toolUseID: 'test-003',
        input: { file_path: '/tmp/test.txt', content: 'Hello' },
        timestamp: new Date(),
      };

      setTimeout(() => {
        mockInput.push('n');
      }, 10);

      const result = await panel.show(request);

      expect(result.approved).toBe(false);
      expect(result.reason).toContain('denied');
    });

    it('should return approved=false when user presses Esc', async () => {
      const panel = new PermissionPanel(mockOutput, mockInput);

      const request: ToolPermissionRequest = {
        toolName: 'Bash',
        toolUseID: 'test-004',
        input: { command: 'rm -rf /' },
        timestamp: new Date(),
      };

      setTimeout(() => {
        mockInput.push('\x1b'); // Esc key
      }, 10);

      const result = await panel.show(request);

      expect(result.approved).toBe(false);
      expect(result.reason).toContain('canceled');
    });

    it('should handle tools with no parameters', async () => {
      const panel = new PermissionPanel(mockOutput, mockInput);

      const request: ToolPermissionRequest = {
        toolName: 'SomeTool',
        toolUseID: 'test-005',
        input: {},
        timestamp: new Date(),
      };

      setTimeout(() => {
        mockInput.push('y');
      }, 10);

      const result = await panel.show(request);

      expect(result.approved).toBe(true);

      const output = outputData.join('');
      expect(output).toContain('SomeTool');
      expect(output).toContain('no parameters');
    });

    it('should truncate long parameter values', async () => {
      const panel = new PermissionPanel(mockOutput, mockInput);

      const longValue = 'a'.repeat(100);
      const request: ToolPermissionRequest = {
        toolName: 'Write',
        toolUseID: 'test-006',
        input: { content: longValue },
        timestamp: new Date(),
      };

      setTimeout(() => {
        mockInput.push('y');
      }, 10);

      await panel.show(request);

      const output = outputData.join('');
      expect(output).toContain('...');
      expect(output).not.toContain(longValue); // Full value should not be present
    });
  });

  describe('clear()', () => {
    it('should clear panel area using ANSI codes', () => {
      const panel = new PermissionPanel(mockOutput, mockInput);

      // Manually set panelLines to simulate drawn panel
      (panel as any).panelLines = 5;
      (panel as any).isTTY = true;

      panel.clear();

      const output = outputData.join('');
      // Should contain ANSI codes for moving cursor up and clearing lines
      expect(output).toContain('\x1b[1A'); // Move up
      expect(output).toContain('\x1b[2K'); // Clear line
    });

    it('should not clear if panelLines is 0', () => {
      const panel = new PermissionPanel(mockOutput, mockInput);

      panel.clear();

      expect(outputData.length).toBe(0);
    });
  });
});
