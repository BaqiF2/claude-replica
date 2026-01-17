/**
 * File: UI Factory Interface
 *
 * Core Interface:
 * - UIFactory: Factory interface for creating parser and output instances
 *
 * Responsibilities:
 * - Define contract for creating ParserInterface and OutputInterface
 * - Support dependency inversion for CLI parsing and output
 */

import type { OutputInterface } from '../OutputInterface';
import type { ParserInterface } from '../ParserInterface';
import type { PermissionUI } from '../../permissions/PermissionUI';
import type {
  InteractiveUICallbacks,
  InteractiveUIConfig,
  InteractiveUIInterface,
} from '../InteractiveUIInterface';

/**
 * UI Factory Interface
 *
 * Defines the contract for creating parser and output instances.
 */
export interface UIFactory {
  /**
   * Create a parser instance
   *
   * @returns ParserInterface instance
   */
  createParser(): ParserInterface;

  /**
   * Create an output instance
   *
   * @returns OutputInterface instance
   */
  createOutput(): OutputInterface;

  /**
   * Create a permission UI instance
   *
   * @param output Output stream (optional, defaults to process.stdout)
   * @param input Input stream (optional, defaults to process.stdin)
   * @returns PermissionUI instance
   */
  createPermissionUI(output?: NodeJS.WritableStream, input?: NodeJS.ReadableStream): PermissionUI;

  /**
   * Create an interactive UI instance
   *
   * @param callbacks Interactive UI callbacks
   * @param config Optional UI configuration
   * @returns InteractiveUIInterface instance
   */
  createInteractiveUI(
    callbacks: InteractiveUICallbacks,
    config?: InteractiveUIConfig
  ): InteractiveUIInterface;
}
