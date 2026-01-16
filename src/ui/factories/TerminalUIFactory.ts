/**
 * File: Terminal UI Factory Implementation
 *
 * Core Class:
 * - TerminalUIFactory: Factory for creating terminal parser and output instances
 *
 * Responsibilities:
 * - Create terminal-specific ParserInterface and OutputInterface implementations
 * - Provide default terminal UI components without extra factory layers
 */

import { TerminalOutput } from '../TerminalOutput';
import { TerminalParser } from '../TerminalParser';
import { UIFactory } from './UIFactory';

/**
 * Terminal UI Factory
 *
 * Creates terminal-based parser and output instances.
 */
export class TerminalUIFactory implements UIFactory {
  createParser(): TerminalParser {
    return new TerminalParser();
  }

  createOutput(): TerminalOutput {
    return new TerminalOutput();
  }
}
