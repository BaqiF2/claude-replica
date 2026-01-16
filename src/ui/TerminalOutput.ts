/**
 * File: Terminal Output Implementation
 *
 * Core Class:
 * - TerminalOutput: Terminal environment implementation of OutputInterface
 *
 * Responsibilities:
 * - Delegate output to console methods
 * - Provide section and blank line helpers
 */

import type { OutputInterface, OutputOptions } from './OutputInterface';

const DEFAULT_BLANK_LINE_COUNT = parseInt(
  process.env.CLAUDE_DEFAULT_BLANK_LINE_COUNT || '1',
  10
);

/**
 * Terminal Output
 *
 * Delegates output operations to the standard console methods.
 */
export class TerminalOutput implements OutputInterface {
  info(message: string, _options?: OutputOptions): void {
    console.log(message);
  }

  warn(message: string, _options?: OutputOptions): void {
    console.warn(message);
  }

  error(message: string, _options?: OutputOptions): void {
    console.error(message);
  }

  success(message: string, _options?: OutputOptions): void {
    console.log(message);
  }

  section(title: string, _options?: OutputOptions): void {
    console.log(`${title}\n`);
  }

  blankLine(count?: number): void {
    const lineCount = count ?? DEFAULT_BLANK_LINE_COUNT;

    for (let i = 0; i < lineCount; i += 1) {
      console.log('');
    }
  }
}
