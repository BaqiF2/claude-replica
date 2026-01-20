/**
 * File: Terminal Parser Implementation
 *
 * Core Class:
 * - TerminalParser: Terminal environment implementation of ParserInterface
 *
 * Responsibilities:
 * - Delegate parsing to CLIParser
 * - Provide help text and version text from CLIParser
 */

import { CLIParser } from '../cli/CLIParser';
import type { ParserInterface } from './contracts/core/ParserInterface';

/**
 * Terminal Parser
 *
 * Delegates parsing and text generation to the existing CLIParser.
 */
export class TerminalParser implements ParserInterface {
  private readonly cliParser: CLIParser;

  constructor() {
    this.cliParser = new CLIParser();
  }

  parse(args: string[]): ReturnType<ParserInterface['parse']> {
    return this.cliParser.parse(args) as ReturnType<ParserInterface['parse']>;
  }

  getHelpText(): string {
    return this.cliParser.getHelpText();
  }

  getVersionText(): string {
    return this.cliParser.getVersionText();
  }
}
