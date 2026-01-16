/**
 * File: Parser Interface
 *
 * Core Interface:
 * - ParserInterface: Abstract contract for parsing CLI arguments
 *
 * Responsibilities:
 * - Parse CLI arguments into OptionsInterface
 * - Provide help text
 * - Provide version text
 */

import type { OptionsInterface } from './OptionsInterface';

/**
 * Parser Interface
 *
 * Defines the standard contract for CLI argument parsing.
 */
export interface ParserInterface {
  /**
   * Parse CLI arguments
   *
   * @param args Raw CLI arguments
   * @returns Parsed options
   */
  parse(args: string[]): OptionsInterface;

  /**
   * Get CLI help text
   *
   * @returns Help text
   */
  getHelpText(): string;

  /**
   * Get CLI version text
   *
   * @returns Version text
   */
  getVersionText(): string;
}
