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
import { PermissionUIImpl } from '../PermissionUIImpl';
import { TerminalInteractiveUI } from '../TerminalInteractiveUI';
import type { PermissionUI } from '../../permissions/PermissionUI';
import { UIFactory } from '../contracts/core/UIFactory';

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

  createPermissionUI(
    output: NodeJS.WritableStream = process.stdout,
    input: NodeJS.ReadableStream = process.stdin
  ): PermissionUI {
    return new PermissionUIImpl(output, input);
  }

  createInteractiveUI(
    callbacks: ConstructorParameters<typeof TerminalInteractiveUI>[0],
    config?: ConstructorParameters<typeof TerminalInteractiveUI>[1]
  ): TerminalInteractiveUI {
    return new TerminalInteractiveUI(callbacks, config);
  }
}
