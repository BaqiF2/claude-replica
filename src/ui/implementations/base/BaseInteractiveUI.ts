/**
 * File: Base Interactive UI Implementation
 *
 * Purpose:
 * - Provides minimal default implementations for InteractiveUIInterface
 * - Reduces boilerplate code for custom UI implementations
 *
 * Core Class:
 * - BaseInteractiveUI: Abstract base class with minimal defaults
 *
 * Usage:
 * ```typescript
 * export class MyCustomUI extends BaseInteractiveUI {
 *   async start() {
 *     // Implement UI startup logic
 *   }
 *
 *   stop() {
 *     // Implement UI cleanup logic
 *   }
 *
 *   // Override other methods as needed
 * }
 * ```
 */

import type {
  InteractiveUIInterface,
  InteractiveUICallbacks,
  InteractiveUIConfig,
  MessageRole,
  PermissionMode,
  Snapshot,
  TodoItem,
} from '../../contracts/interactive/InteractiveUIInterface';
import type { Session, SessionStats } from '../../../core/SessionManager';

/**
 * Base Interactive UI Implementation
 *
 * Provides minimal default implementations for all methods except start() and stop().
 * Subclasses must implement:
 * - start(): Initialize and start the UI loop
 * - stop(): Stop and cleanup the UI
 *
 * All other methods have safe default implementations (no-ops or basic console output).
 */
export abstract class BaseInteractiveUI implements InteractiveUIInterface {
  protected callbacks: InteractiveUICallbacks;
  protected config: InteractiveUIConfig;

  constructor(callbacks: InteractiveUICallbacks, config?: InteractiveUIConfig) {
    this.callbacks = callbacks;
    this.config = config || {};
  }

  // ============================================================
  // REQUIRED METHODS - Must be implemented by subclasses
  // ============================================================

  /**
   * Start the UI loop.
   * Must be implemented by subclasses.
   */
  abstract start(): Promise<void>;

  /**
   * Stop the UI loop.
   * Must be implemented by subclasses.
   */
  abstract stop(): void;

  // ============================================================
  // CORE METHODS - Basic console output implementations
  // ============================================================

  /**
   * Display a message (default: console output).
   */
  displayMessage(message: string, role: MessageRole): void {
    console.log(`[${role}] ${message}`);
  }

  /**
   * Display tool invocation (default: console output).
   */
  displayToolUse(tool: string, args: Record<string, unknown>): void {
    const argsPreview =
      Object.keys(args).length > 0 ? ` ${JSON.stringify(args).substring(0, 100)}...` : '';
    console.log(`Tool: ${tool}${argsPreview}`);
  }

  /**
   * Display tool result (default: console output).
   */
  displayToolResult(tool: string, result: string, isError?: boolean): void {
    const prefix = isError ? 'ERROR' : 'Result';
    const output = result.length > 200 ? result.substring(0, 200) + '...' : result;
    if (isError) {
      console.error(`${prefix} [${tool}]: ${output}`);
    } else {
      console.log(`${prefix} [${tool}]: ${output}`);
    }
  }

  /**
   * Display thinking status (default: no-op).
   */
  displayThinking(_content?: string): void {
    // No-op by default
  }

  /**
   * Display computing status (default: no-op).
   */
  displayComputing(): void {
    // No-op by default
  }

  /**
   * Stop computing status (default: no-op).
   */
  stopComputing(): void {
    // No-op by default
  }

  /**
   * Clear progress indicators (default: no-op).
   */
  clearProgress(): void {
    // No-op by default
  }

  /**
   * Display error message (default: console.error).
   */
  displayError(message: string): void {
    console.error(`Error: ${message}`);
  }

  /**
   * Display warning message (default: console.warn).
   */
  displayWarning(message: string): void {
    console.warn(`Warning: ${message}`);
  }

  /**
   * Display success message (default: console.log).
   */
  displaySuccess(message: string): void {
    console.log(`Success: ${message}`);
  }

  /**
   * Display info message (default: console.info).
   */
  displayInfo(message: string): void {
    console.info(`Info: ${message}`);
  }

  // ============================================================
  // OPTIONAL METHODS - Default implementations returning null/false
  // ============================================================

  /**
   * Prompt for confirmation (default: returns false).
   */
  async promptConfirmation(_message: string): Promise<boolean> {
    return false;
  }

  /**
   * Show rewind menu (default: returns null).
   */
  async showRewindMenu(_snapshots: Snapshot[]): Promise<Snapshot | null> {
    return null;
  }

  /**
   * Show session menu (default: returns null).
   */
  async showSessionMenu(_sessions: Session[]): Promise<Session | null> {
    return null;
  }

  /**
   * Show confirmation menu (default: returns false).
   */
  async showConfirmationMenu(
    _title: string,
    _options: Array<{ key: string; label: string; description?: string }>,
    _defaultKey?: string
  ): Promise<boolean> {
    return false;
  }

  /**
   * Set initial permission mode (default: no-op).
   */
  setInitialPermissionMode(_mode: PermissionMode): void {
    // No-op by default
  }

  /**
   * Set permission mode (default: no-op).
   */
  setPermissionMode(_mode: PermissionMode): void {
    // No-op by default
  }

  /**
   * Display permission status (default: no-op).
   */
  displayPermissionStatus(_mode: PermissionMode): void {
    // No-op by default
  }

  /**
   * Set processing state (default: no-op).
   */
  setProcessingState(_processing: boolean): void {
    // No-op by default
  }

  /**
   * Display todo list (default: simple console output).
   */
  displayTodoList(todos: TodoItem[]): void {
    console.log('Tasks:');
    todos.forEach((todo, index) => {
      const status = todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '>' : '·';
      console.log(`  ${status} ${index + 1}. ${todo.content}`);
    });
  }

  // ============================================================
  // UTILITY METHODS - Basic string formatting
  // ============================================================

  /**
   * Format relative time (default: ISO string).
   */
  formatRelativeTime(date: Date): string {
    return date.toISOString();
  }

  /**
   * Format absolute time (default: locale string).
   */
  formatAbsoluteTime(date: Date): string {
    return date.toLocaleString();
  }

  /**
   * Format stats summary (default: JSON string).
   */
  formatStatsSummary(stats?: SessionStats): string {
    if (!stats) return 'No stats available';
    return JSON.stringify(stats, null, 2);
  }
}
