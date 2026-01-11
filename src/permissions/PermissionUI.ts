/**
 * File: Permission UI interface and related types
 *
 * Core Interface:
 * - PermissionUI: UI layer interface for permission-related terminal interactions
 *
 * Core Types:
 * - QuestionInput: AskUserQuestion input format
 * - QuestionAnswers: User answers mapping (question -> answer)
 */

import { ToolPermissionRequest, PermissionUIResult } from './types';

/**
 * Question input for AskUserQuestion tool
 */
export interface QuestionInput {
  /** The question text */
  question: string;
  /** Short header label (max 12 chars) */
  header: string;
  /** Available options */
  options: Array<{
    /** Option label */
    label: string;
    /** Option description */
    description: string;
  }>;
  /** Whether to allow multiple selections */
  multiSelect: boolean;
}

/**
 * User answers mapping: question text -> selected answer(s)
 */
export type QuestionAnswers = Record<string, string>;

/**
 * Permission UI interface
 *
 * Responsibilities:
 * - Handle all permission-related terminal interactions
 * - Display permission request panels
 * - Show interactive menus for AskUserQuestion
 */
export interface PermissionUI {
  /**
   * Display tool permission request panel
   *
   * @param request Permission request information
   * @returns User's approval decision and optional reason
   */
  promptToolPermission(request: ToolPermissionRequest): Promise<PermissionUIResult>;

  /**
   * Display AskUserQuestion interactive menu
   *
   * @param questions List of questions to ask
   * @returns User answers mapping (question -> answer)
   */
  promptUserQuestions(questions: QuestionInput[]): Promise<QuestionAnswers>;
}

/**
 * Permission Panel Component
 *
 * Displays tool permission requests using ANSI control codes.
 * In TTY environments, uses terminal split-screen display.
 * In non-TTY environments, falls back to sequential display.
 */
export class PermissionPanel {
  private readonly output: NodeJS.WritableStream;
  private readonly input: NodeJS.ReadableStream;
  private readonly isTTY: boolean;
  private panelLines: number = 0;

  constructor(
    output: NodeJS.WritableStream = process.stdout,
    input: NodeJS.ReadableStream = process.stdin
  ) {
    this.output = output;
    this.input = input;
    this.isTTY = process.stdout.isTTY || false;
  }

  /**
   * Show permission request panel and wait for user input
   *
   * @param request Tool permission request
   * @returns User approval decision
   */
  async show(request: ToolPermissionRequest): Promise<PermissionUIResult> {
    if (this.isTTY) {
      return this.showTTYPanel(request);
    } else {
      return this.showSequentialPanel(request);
    }
  }

  /**
   * Show permission panel in TTY mode (split-screen display)
   */
  private async showTTYPanel(request: ToolPermissionRequest): Promise<PermissionUIResult> {
    // Draw panel
    this.drawSeparator();
    this.drawPanelContent(request);
    this.drawPrompt();

    // Wait for user input
    const result = await this.waitForUserInput();

    // Clear panel after user responds
    this.clear();

    return result;
  }

  /**
   * Show permission panel in non-TTY mode (sequential display)
   */
  private async showSequentialPanel(
    request: ToolPermissionRequest
  ): Promise<PermissionUIResult> {
    // Sequential display (no ANSI positioning)
    this.output.write('\n');
    this.output.write('═══════════════════════════════════════\n');
    this.output.write(`Tool Permission Request: ${request.toolName}\n`);
    this.output.write('───────────────────────────────────────\n');

    // Display parameters
    const paramEntries = Object.entries(request.input);
    if (paramEntries.length > 0) {
      const params = paramEntries
        .map(([key, value]) => {
          const displayValue =
            typeof value === 'string' && value.length > 50
              ? value.substring(0, 50) + '...'
              : JSON.stringify(value);
          return `  ${key}: ${displayValue}`;
        })
        .join('\n');
      this.output.write(params + '\n');
    } else {
      this.output.write('  (no parameters)\n');
    }

    this.output.write('═══════════════════════════════════════\n');
    this.output.write('Allow this tool? (y/n/Esc): ');

    const result = await this.waitForUserInput();
    this.output.write('\n');

    return result;
  }

  /**
   * Draw separator line
   */
  private drawSeparator(): void {
    const separator = '\x1b[90m' + '═'.repeat(50) + '\x1b[0m'; // Gray color
    this.output.write(separator + '\n');
    this.panelLines++;
  }

  /**
   * Draw panel content with tool information
   */
  private drawPanelContent(request: ToolPermissionRequest): void {
    // Tool name header
    const header = `\x1b[1m\x1b[33m⚠️  Tool Permission Request: ${request.toolName}\x1b[0m`; // Bold yellow
    this.output.write(header + '\n');
    this.panelLines++;

    // Separator
    const divider = '\x1b[90m' + '─'.repeat(50) + '\x1b[0m';
    this.output.write(divider + '\n');
    this.panelLines++;

    // Parameters
    const params = Object.entries(request.input);
    if (params.length > 0) {
      for (const [key, value] of params) {
        const displayValue =
          typeof value === 'string' && value.length > 50
            ? value.substring(0, 50) + '...'
            : JSON.stringify(value);

        const paramLine = `\x1b[36m  ${key}:\x1b[0m ${displayValue}`;
        this.output.write(paramLine + '\n');
        this.panelLines++;
      }
    } else {
      this.output.write('\x1b[90m  (no parameters)\x1b[0m\n');
      this.panelLines++;
    }

    // Bottom separator
    this.output.write(divider + '\n');
    this.panelLines++;
  }

  /**
   * Draw user prompt
   */
  private drawPrompt(): void {
    const prompt = '\x1b[33m?\x1b[0m Allow this tool? \x1b[90m(y/n/Esc)\x1b[0m ';
    this.output.write(prompt);
    this.panelLines++;
  }

  /**
   * Wait for user input (y/n/Esc)
   *
   * @returns User approval decision
   */
  private async waitForUserInput(): Promise<PermissionUIResult> {
    return new Promise((resolve) => {
      // Set raw mode if stdin is TTY
      const wasRawMode = this.input === process.stdin && process.stdin.isTTY;
      if (wasRawMode && !process.stdin.isRaw) {
        process.stdin.setRawMode(true);
      }

      const handleKey = (data: Buffer) => {
        const char = data.toString().toLowerCase();

        if (char === 'y' || char === '\r' || char === '\n') {
          // Approve
          this.output.write('\x1b[32mYes\x1b[0m\n'); // Green "Yes"
          this.cleanup(handleKey, wasRawMode);
          resolve({ approved: true });
        } else if (char === 'n') {
          // Deny
          this.output.write('\x1b[31mNo\x1b[0m\n'); // Red "No"
          this.cleanup(handleKey, wasRawMode);
          resolve({ approved: false, reason: 'User denied permission' });
        } else if (char === '\x1b') {
          // Escape - deny
          this.output.write('\x1b[31mCanceled\x1b[0m\n'); // Red "Canceled"
          this.cleanup(handleKey, wasRawMode);
          resolve({ approved: false, reason: 'User canceled (Esc)' });
        }
      };

      this.input.on('data', handleKey);
    });
  }

  /**
   * Cleanup input listener and restore terminal mode
   */
  private cleanup(listener: (data: Buffer) => void, wasRawMode: boolean): void {
    this.input.removeListener('data', listener);

    // Restore raw mode if needed
    if (wasRawMode && this.input === process.stdin && process.stdin.isTTY) {
      process.stdin.setRawMode(true); // Keep raw mode for main UI
    }
  }

  /**
   * Clear panel area
   */
  clear(): void {
    if (!this.isTTY || this.panelLines === 0) {
      return;
    }

    // Move cursor up and clear lines
    for (let i = 0; i < this.panelLines; i++) {
      this.output.write('\x1b[1A'); // Move cursor up one line
      this.output.write('\x1b[2K'); // Clear entire line
    }

    this.panelLines = 0;
  }
}

/**
 * Interactive Question Menu Component
 *
 * Displays interactive menus for AskUserQuestion tool.
 * Supports both single-select and multi-select modes.
 */
export class QuestionMenu {
  private readonly output: NodeJS.WritableStream;
  private readonly input: NodeJS.ReadableStream;
  private readonly isTTY: boolean;
  private menuLines: number = 0;
  private currentIndex: number = 0;
  private selectedIndices: Set<number> = new Set();

  constructor(
    output: NodeJS.WritableStream = process.stdout,
    input: NodeJS.ReadableStream = process.stdin
  ) {
    this.output = output;
    this.input = input;
    this.isTTY = process.stdout.isTTY || false;
  }

  /**
   * Show interactive menu and wait for user selection
   *
   * @param question Question configuration
   * @returns Selected answer(s)
   */
  async show(question: QuestionInput): Promise<string> {
    if (this.isTTY) {
      return this.showInteractiveMenu(question);
    } else {
      return this.showSequentialMenu(question);
    }
  }

  /**
   * Show interactive menu in TTY mode
   */
  private async showInteractiveMenu(question: QuestionInput): Promise<string> {
    // Reset state
    this.currentIndex = 0;
    this.selectedIndices.clear();

    // Initial render
    this.render(question);

    // Wait for selection
    const result = await this.waitForSelection(question);

    // Clear menu after selection
    this.clear();

    return result;
  }

  /**
   * Show menu in non-TTY mode (sequential display)
   */
  private async showSequentialMenu(question: QuestionInput): Promise<string> {
    this.output.write('\n');
    this.output.write(`${question.question}\n`);
    this.output.write('───────────────────────────────────────\n');

    question.options.forEach((option, index) => {
      this.output.write(`${index + 1}. ${option.label}\n`);
      if (option.description) {
        this.output.write(`   ${option.description}\n`);
      }
    });

    this.output.write('───────────────────────────────────────\n');
    this.output.write('Enter selection number(s): ');

    return new Promise((resolve) => {
      this.input.once('data', (data: Buffer) => {
        const input = data.toString().trim();
        const selectedIndex = parseInt(input, 10) - 1;

        if (selectedIndex >= 0 && selectedIndex < question.options.length) {
          resolve(question.options[selectedIndex].label);
        } else {
          resolve(question.options[0].label);
        }
      });
    });
  }

  /**
   * Render menu content
   *
   * @param question Question configuration
   */
  private render(question: QuestionInput): void {
    // Header
    const header = `\x1b[1m${question.question}\x1b[0m`;
    this.output.write(header + '\n');
    this.menuLines++;

    // Tag
    if (question.header) {
      const tag = `\x1b[36m[${question.header}]\x1b[0m`;
      this.output.write(tag + '\n');
      this.menuLines++;
    }

    // Separator
    const separator = '\x1b[90m' + '─'.repeat(50) + '\x1b[0m';
    this.output.write(separator + '\n');
    this.menuLines++;

    // Options
    question.options.forEach((option, index) => {
      const isSelected = index === this.currentIndex;
      const isChecked = this.selectedIndices.has(index);

      let line: string;

      if (question.multiSelect) {
        // Multi-select mode: [ ]/[✓]
        const checkbox = isChecked ? '\x1b[32m[✓]\x1b[0m' : '[ ]';
        const cursor = isSelected ? '\x1b[33m▶\x1b[0m ' : '  ';
        const label = isSelected ? `\x1b[1m${option.label}\x1b[0m` : option.label;
        line = `${cursor}${checkbox} ${label}`;
      } else {
        // Single-select mode: ▶
        const cursor = isSelected ? '\x1b[33m▶\x1b[0m ' : '  ';
        const label = isSelected ? `\x1b[1m${option.label}\x1b[0m` : option.label;
        line = `${cursor}${label}`;
      }

      this.output.write(line + '\n');
      this.menuLines++;

      // Description (if present)
      if (option.description) {
        const desc = isSelected
          ? `    \x1b[90m${option.description}\x1b[0m`
          : `    \x1b[90m${option.description}\x1b[0m`;
        this.output.write(desc + '\n');
        this.menuLines++;
      }
    });

    // Footer
    this.output.write(separator + '\n');
    this.menuLines++;

    const hint = question.multiSelect
      ? '\x1b[90m↑↓: Navigate | Space: Toggle | Enter: Confirm | Esc: Cancel\x1b[0m'
      : '\x1b[90m↑↓: Navigate | Enter: Confirm | Esc: Cancel\x1b[0m';
    this.output.write(hint + '\n');
    this.menuLines++;
  }

  /**
   * Wait for user keyboard selection
   *
   * @param question Question configuration
   * @returns Selected answer(s)
   */
  private async waitForSelection(question: QuestionInput): Promise<string> {
    return new Promise((resolve, reject) => {
      // Set raw mode if stdin is TTY
      const wasRawMode = this.input === process.stdin && process.stdin.isTTY;
      if (wasRawMode && !process.stdin.isRaw) {
        process.stdin.setRawMode(true);
      }

      const handleKey = (data: Buffer) => {
        const key = data.toString();

        // Up arrow: \x1b[A
        if (key === '\x1b[A') {
          if (this.currentIndex > 0) {
            this.currentIndex--;
            this.clearAndRender(question);
          }
        }
        // Down arrow: \x1b[B
        else if (key === '\x1b[B') {
          if (this.currentIndex < question.options.length - 1) {
            this.currentIndex++;
            this.clearAndRender(question);
          }
        }
        // Space: Toggle selection (multi-select only)
        else if (key === ' ' && question.multiSelect) {
          if (this.selectedIndices.has(this.currentIndex)) {
            this.selectedIndices.delete(this.currentIndex);
          } else {
            this.selectedIndices.add(this.currentIndex);
          }
          this.clearAndRender(question);
        }
        // Enter: Confirm selection
        else if (key === '\r' || key === '\n') {
          this.cleanup(handleKey, wasRawMode);

          if (question.multiSelect) {
            // Return all selected labels joined by comma
            if (this.selectedIndices.size === 0) {
              // If nothing selected, return current option
              resolve(question.options[this.currentIndex].label);
            } else {
              const selected = Array.from(this.selectedIndices)
                .sort((a, b) => a - b)
                .map((index) => question.options[index].label)
                .join(', ');
              resolve(selected);
            }
          } else {
            // Single select: return current option
            resolve(question.options[this.currentIndex].label);
          }
        }
        // Escape: Cancel
        else if (key === '\x1b') {
          this.cleanup(handleKey, wasRawMode);
          reject(new Error('User canceled selection'));
        }
      };

      this.input.on('data', handleKey);
    });
  }

  /**
   * Clear old menu and re-render
   *
   * @param question Question configuration
   */
  private clearAndRender(question: QuestionInput): void {
    this.clear();
    this.render(question);
  }

  /**
   * Calculate total line count for menu
   *
   * This method is exposed for testing and external utilities.
   *
   * @param question Question configuration
   * @returns Total line count
   */
  calculateLineCount(question: QuestionInput): number {
    let lines = 0;

    // Header
    lines += 1;

    // Tag
    if (question.header) {
      lines += 1;
    }

    // Separator
    lines += 1;

    // Options
    question.options.forEach((option) => {
      lines += 1; // Option line
      if (option.description) {
        lines += 1; // Description line
      }
    });

    // Footer separator + hint
    lines += 2;

    return lines;
  }

  /**
   * Clear menu display
   */
  clear(): void {
    if (!this.isTTY || this.menuLines === 0) {
      return;
    }

    // Move cursor up and clear lines
    for (let i = 0; i < this.menuLines; i++) {
      this.output.write('\x1b[1A'); // Move cursor up one line
      this.output.write('\x1b[2K'); // Clear entire line
    }

    this.menuLines = 0;
  }

  /**
   * Cleanup input listener and restore terminal mode
   */
  private cleanup(listener: (data: Buffer) => void, wasRawMode: boolean): void {
    this.input.removeListener('data', listener);

    // Restore raw mode if needed
    if (wasRawMode && this.input === process.stdin && process.stdin.isTTY) {
      process.stdin.setRawMode(true); // Keep raw mode for main UI
    }
  }
}
