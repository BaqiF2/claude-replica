import type { Session, SessionStats } from '../core/SessionManager';
import type { PermissionMode as PermissionModeType } from '../permissions/PermissionManager';

/**
 * Snapshot interface for UI menus.
 */
export interface Snapshot {
  id: string;
  timestamp: Date;
  description: string;
  files: string[];
}

/**
 * Permission mode type.
 */
export type PermissionMode = PermissionModeType;

/**
 * Message role type.
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Selection menu item.
 */
export interface MenuItem {
  label: string;
  value: string;
  description?: string;
}

/**
 * Interactive UI callbacks contract.
 *
 * Responsibility boundaries between UI layer and Runner layer:
 *
 * UI Layer Responsibilities:
 * - Detect user input type (command vs message)
 * - Terminal UI: Parse slash commands and call runner methods directly via getRunner()
 * - Other UIs (Web/Desktop): Use UI-specific interactions (buttons, menus) to call runner methods
 * - All regular messages (non-commands) should call onMessage
 *
 * Runner Layer Responsibilities:
 * - Provide public methods for UI to call (showCommandHelp, showSessions, etc.)
 * - onMessage callback handles regular messages and skill commands
 * - Command routing logic is UI-specific, not in Runner layer
 */
export interface InteractiveUICallbacks {
  /** Handle regular user messages and skill commands */
  onMessage: (message: string) => Promise<void>;
  onInterrupt: () => void;
  onRewind: () => Promise<void>;
  onPermissionModeChange?: (mode: PermissionMode) => void | Promise<void>;
  onQueueMessage?: (message: string) => void;
  /** Get runner instance for UI to call public methods directly (e.g., showCommandHelp, showSessions) */
  getRunner?: () => any;
}

/**
 * Interactive UI configuration contract.
 */
export interface InteractiveUIConfig {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  enableColors?: boolean;
}

/**
 * Interactive UI options contract.
 */
export interface InteractiveUIOptions extends InteractiveUICallbacks, InteractiveUIConfig {}

/**
 * File: InteractiveUIInterface
 *
 * Purpose:
 * - Defines the lifecycle and display contract for interactive UI implementations.
 *
 * Core methods:
 * - start(): Start the UI loop.
 * - stop(): Stop the UI loop.
 * - displayMessage(): Display a message.
 * - displayToolUse(): Display a tool invocation.
 * - displayToolResult(): Display a tool result.
 * - displayThinking(): Display thinking status.
 * - displayComputing(): Display computing status.
 * - stopComputing(): Stop computing status.
 * - clearProgress(): Clear progress indicators.
 * - displayError(): Display error status.
 * - displayWarning(): Display warning status.
 * - displaySuccess(): Display success status.
 * - displayInfo(): Display info status.
 * - promptConfirmation(): Ask for user confirmation.
 * - showRewindMenu(): Show the rewind menu.
 * - showSessionMenu(): Show the session menu.
 * - showConfirmationMenu(): Show a confirmation menu.
 * - setInitialPermissionMode(): Set the initial permission mode.
 * - setPermissionMode(): Set the permission mode.
 * - displayPermissionStatus(): Display permission status.
 * - setProcessingState(): Set processing state.
 * - formatRelativeTime(): Format relative time.
 * - formatAbsoluteTime(): Format absolute time.
 * - formatStatsSummary(): Format stats summary.
 */
export interface InteractiveUIInterface {
  start(): Promise<void>;
  stop(): void;
  displayMessage(message: string, role: MessageRole): void;
  displayToolUse(tool: string, args: Record<string, unknown>): void;
  displayToolResult(tool: string, result: string, isError?: boolean): void;
  displayThinking(content?: string): void;
  displayComputing(): void;
  stopComputing(): void;
  clearProgress(): void;
  displayError(message: string): void;
  displayWarning(message: string): void;
  displaySuccess(message: string): void;
  displayInfo(message: string): void;
  promptConfirmation(message: string): Promise<boolean>;
  showRewindMenu(snapshots: Snapshot[]): Promise<Snapshot | null>;
  showSessionMenu(sessions: Session[]): Promise<Session | null>;
  showConfirmationMenu(
    title: string,
    options: Array<{ key: string; label: string; description?: string }>,
    defaultKey?: string
  ): Promise<boolean>;
  setInitialPermissionMode(mode: PermissionMode): void;
  setPermissionMode(mode: PermissionMode): void;
  displayPermissionStatus(mode: PermissionMode): void;
  setProcessingState(processing: boolean): void;
  formatRelativeTime(date: Date): string;
  formatAbsoluteTime(date: Date): string;
  formatStatsSummary(stats?: SessionStats): string;
}
