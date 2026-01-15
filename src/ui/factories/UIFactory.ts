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
}
