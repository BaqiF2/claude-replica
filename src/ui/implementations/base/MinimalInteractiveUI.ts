/**
 * File: Minimal Interactive UI Example
 *
 * Purpose:
 * - Demonstrates the simplest possible InteractiveUI implementation
 * - Only implements the two required methods (start/stop)
 * - All other methods use default implementations from BaseInteractiveUI
 *
 * Core Class:
 * - MinimalInteractiveUI: Minimal working example
 *
 * Use Cases:
 * - Headless/CI environments
 * - Quick prototyping
 * - Testing
 * - Learning UI implementation basics
 *
 * Usage:
 * ```typescript
 * const ui = new MinimalInteractiveUI(callbacks, config);
 * await ui.start();
 * // ... UI runs until stop() is called
 * ui.stop();
 * ```
 */

import { BaseInteractiveUI } from './BaseInteractiveUI';

/**
 * Minimal Interactive UI Implementation
 *
 * This is the simplest possible UI implementation.
 * It only implements start() and stop(), relying on BaseInteractiveUI defaults for everything else.
 *
 * In start(), it waits for the stop flag to be set.
 * In a real implementation, you would:
 * - Start listening for user input (WebSocket, stdin, HTTP, etc.)
 * - Call callbacks.onMessage() when receiving user input
 * - Handle UI rendering and interaction
 */
export class MinimalInteractiveUI extends BaseInteractiveUI {
  private running = false;
  private stopPromise: Promise<void> | null = null;
  private resolveStop: (() => void) | null = null;

  /**
   * Start the UI loop.
   *
   * This minimal implementation just sets a running flag and waits for stop().
   * A real implementation would:
   * - Initialize UI components
   * - Start listening for user input
   * - Setup event handlers
   */
  async start(): Promise<void> {
    this.running = true;
    this.stopPromise = new Promise((resolve) => {
      this.resolveStop = resolve;
    });

    console.log('Minimal UI started (waiting for stop signal)');

    // Wait until stop() is called
    await this.stopPromise;
  }

  /**
   * Stop the UI loop.
   *
   * This minimal implementation just clears the running flag.
   * A real implementation would:
   * - Cleanup UI components
   * - Close connections
   * - Remove event listeners
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    console.log('Minimal UI stopped');

    // Resolve the stop promise to unblock start()
    if (this.resolveStop) {
      this.resolveStop();
      this.resolveStop = null;
    }
  }

  /**
   * Check if UI is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }
}
