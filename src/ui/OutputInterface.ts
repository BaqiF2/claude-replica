/**
 * File: Output Interface
 *
 * Core Interface:
 * - OutputInterface: Abstract contract for CLI output
 *
 * Core Types:
 * - OutputOptions: Output formatting options
 *
 * Responsibilities:
 * - Provide standard output methods
 * - Support formatting options like color, timestamp, and indentation
 */

/**
 * Output formatting options
 */
export interface OutputOptions {
  color?: string;
  timestamp?: boolean;
  indent?: number;
}

/**
 * Output Interface
 *
 * Defines the standard contract for CLI output.
 */
export interface OutputInterface {
  /**
   * Output informational message
   *
   * @param message Message to output
   * @param options Output formatting options
   */
  info(message: string, options?: OutputOptions): void;

  /**
   * Output warning message
   *
   * @param message Message to output
   * @param options Output formatting options
   */
  warn(message: string, options?: OutputOptions): void;

  /**
   * Output error message
   *
   * @param message Message to output
   * @param options Output formatting options
   */
  error(message: string, options?: OutputOptions): void;

  /**
   * Output success message
   *
   * @param message Message to output
   * @param options Output formatting options
   */
  success(message: string, options?: OutputOptions): void;

  /**
   * Output section title
   *
   * @param title Section title
   * @param options Output formatting options
   */
  section(title: string, options?: OutputOptions): void;

  /**
   * Output blank lines
   *
   * @param count Number of blank lines
   */
  blankLine(count?: number): void;
}
