/**
 * Mock InteractiveUI for testing
 */

import { Session } from '../../src/core/SessionManager';
import { EventEmitter } from 'events';

export interface MockInteractiveUIOptions {
  sessions?: Session[];
  selectIndex?: number | null; // null means cancel
}

export class MockInteractiveUI {
  private options: MockInteractiveUIOptions;
  private eventEmitter: EventEmitter;

  constructor(options: MockInteractiveUIOptions = {}) {
    this.options = options;
    this.eventEmitter = new EventEmitter();
  }

  async showSessionMenu(sessions: Session[]): Promise<Session | null> {
    if (this.options.selectIndex === null) {
      return null;
    }

    if (this.options.selectIndex !== undefined) {
      return sessions[this.options.selectIndex] || null;
    }

    return sessions[0] || null;
  }

  on(event: string, callback: (...args: any[]) => void): void {
    this.eventEmitter.on(event, callback);
  }

  emit(event: string, ...args: any[]): boolean {
    return this.eventEmitter.emit(event, ...args);
  }

  setProcessingState(_processing: boolean): void {
    // Mock implementation
  }

  stopComputing(): void {
    // Mock implementation
  }

  displayComputing(): void {
    // Mock implementation
  }

  displayThinking(_content: string): void {
    // Mock implementation
  }

  displayToolUse(_name: string, _input: any): void {
    // Mock implementation
  }

  displayToolResult(_name: string, _content: any, _isError: boolean): void {
    // Mock implementation
  }

  displayMessage(_text: string, _role: 'user' | 'assistant'): void {
    // Mock implementation
  }

  displayError(_error: string): void {
    // Mock implementation
  }

  displayWarning(_warning: string): void {
    // Mock implementation
  }

  displaySuccess(_message: string): void {
    // Mock implementation
  }

  displayInfo(_message: string): void {
    // Mock implementation
  }

  start(): Promise<void> {
    return Promise.resolve();
  }

  stop(): void {
    // Mock implementation
  }

  setInitialPermissionMode(_mode: string): void {
    // Mock implementation
  }

  stopAndWait(): Promise<void> {
    return Promise.resolve();
  }
}
