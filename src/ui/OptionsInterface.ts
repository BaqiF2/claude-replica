/**
 * File: Options Interface
 *
 * Core Interface:
 * - OptionsInterface: Generic options contract for parsed CLI arguments
 *
 * Responsibilities:
 * - Represent common CLI flags
 * - Allow extensions via index signature
 */

/**
 * Options Interface
 *
 * Defines the standard shape for parsed CLI options.
 */
export interface OptionsInterface {
  help: boolean;
  version: boolean;
  debug: boolean;
  [key: string]: unknown;
}
