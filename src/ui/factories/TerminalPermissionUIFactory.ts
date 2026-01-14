/**
 * File: Terminal Permission UI Factory Implementation
 *
 * Core Class:
 * - TerminalPermissionUIFactory: Factory for creating terminal-based PermissionUI instances
 *
 * Responsibilities:
 * - Create terminal-specific PermissionUI implementations
 * - Reuse existing PermissionUIImpl for terminal environments
 * - Provide default stream handling for terminal I/O
 */

import { PermissionUIFactory } from './PermissionUIFactory';
import { PermissionUIImpl } from '../PermissionUIImpl';
import { PermissionUI } from '../../permissions/PermissionUI';

/**
 * Terminal Permission UI Factory
 *
 * Creates terminal-based PermissionUI instances using PermissionUIImpl.
 * This factory handles the creation of UI components suitable for terminal/console environments,
 * supporting both TTY and non-TTY modes with appropriate fallbacks.
 */
export class TerminalPermissionUIFactory implements PermissionUIFactory {
  /**
   * Create a terminal PermissionUI instance
   *
   * @param output Output stream (optional, defaults to process.stdout)
   * @param input Input stream (optional, defaults to process.stdin)
   * @returns PermissionUIImpl instance configured for terminal use
   */
  createPermissionUI(
    output: NodeJS.WritableStream = process.stdout,
    input: NodeJS.ReadableStream = process.stdin
  ): PermissionUI {
    return new PermissionUIImpl(output, input);
  }
}
