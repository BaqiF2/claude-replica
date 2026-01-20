import type { Session, SessionStats } from '../../../core/SessionManager';
import type { PermissionMode as PermissionModeType } from '../../../permissions/PermissionManager';
import type { ProjectConfig } from '../../../config';
import type {
  MCPConfigEditResult,
  MCPConfigListResult,
  MCPConfigValidationResult,
} from '../../../mcp/MCPService';

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
 * Todo item interface.
 */
export interface TodoItem {
  /** Task description (imperative form) */
  content: string;
  /** Task status */
  status: 'pending' | 'in_progress' | 'completed';
  /** Description when in progress (progressive form) */
  activeForm: string;
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
  getRunner?: () => InteractiveUIRunner;
}

/**
 * Runner API exposed to UI implementations.
 */
export interface InteractiveUIRunner {
  listSessionsData(): Promise<Session[]>;
  getConfigData(): Promise<ProjectConfig>;
  getPermissionsData(): { mode: string; allowDangerouslySkipPermissions: boolean };
  listRecentSessionsData(limit: number): Promise<Session[]>;
  getSessionStatsData(): Promise<SessionStats>;
  resumeSession(session: Session, forkSession: boolean): Promise<void>;
  getResumeSessionInfo(session: Session, forkSession: boolean): {
    hasValidSdkSession: boolean;
    forkIndicator: string;
    isFork: boolean;
    message: string;
  };
  getMCPConfigData(): Promise<MCPConfigListResult>;
  editMCPConfigData(): Promise<MCPConfigEditResult>;
  validateMCPConfigData(): Promise<MCPConfigValidationResult>;
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
 * Method Implementation Levels:
 * - REQUIRED (2): Must be implemented by all UI implementations
 * - CORE (11): Should be implemented for basic functionality
 * - OPTIONAL (10): Can return default values or null if not needed
 * - UTILITY (3): Helper methods, can use simple default implementations
 *
 * Core interfaces:
 * - Snapshot: Snapshot data structure.
 * - TodoItem: Todo item data structure.
 */

/**
 * Method implementation level classification
 */
export const InteractiveUIMethodLevels = {
  REQUIRED: ['start', 'stop'],
  CORE: [
    'displayMessage',
    'displayToolUse',
    'displayToolResult',
    'displayThinking',
    'displayComputing',
    'stopComputing',
    'clearProgress',
    'displayError',
    'displayWarning',
    'displaySuccess',
    'displayInfo',
  ],
  OPTIONAL: [
    'promptConfirmation',
    'showRewindMenu',
    'showSessionMenu',
    'showConfirmationMenu',
    'setInitialPermissionMode',
    'setPermissionMode',
    'displayPermissionStatus',
    'setProcessingState',
    'displayTodoList',
  ],
  UTILITY: ['formatRelativeTime', 'formatAbsoluteTime', 'formatStatsSummary'],
} as const;

/**
 * Interactive UI Interface
 *
 * Defines the complete contract for interactive UI implementations.
 * Methods are categorized by implementation priority (see InteractiveUIMethodLevels).
 */
export interface InteractiveUIInterface {
  /**
   * Start the UI loop.
   *
   * @level REQUIRED - Must be implemented by all UI implementations
   */
  start(): Promise<void>;

  /**
   * Stop the UI loop.
   *
   * @level REQUIRED - Must be implemented by all UI implementations
   */
  stop(): void;

  /**
   * Display a message from assistant or user.
   *
   * @level CORE - Should be implemented for basic functionality
   * @param message Message content
   * @param role Message role (user/assistant/system)
   */
  displayMessage(message: string, role: MessageRole): void;

  /**
   * Display a tool invocation.
   *
   * @level CORE - Should be implemented for basic functionality
   * @param tool Tool name
   * @param args Tool arguments
   */
  displayToolUse(tool: string, args: Record<string, unknown>): void;

  /**
   * Display a tool result.
   *
   * @level CORE - Should be implemented for basic functionality
   * @param tool Tool name
   * @param result Tool result content
   * @param isError Whether the result is an error
   */
  displayToolResult(tool: string, result: string, isError?: boolean): void;

  /**
   * Display thinking status (optional content).
   *
   * @level CORE - Should be implemented for basic functionality
   * @param content Optional thinking content
   */
  displayThinking(content?: string): void;

  /**
   * Display computing/processing status.
   *
   * @level CORE - Should be implemented for basic functionality
   */
  displayComputing(): void;

  /**
   * Stop displaying computing/processing status.
   *
   * @level CORE - Should be implemented for basic functionality
   */
  stopComputing(): void;

  /**
   * Clear progress indicators.
   *
   * @level CORE - Should be implemented for basic functionality
   */
  clearProgress(): void;

  /**
   * Display error message.
   *
   * @level CORE - Should be implemented for basic functionality
   * @param message Error message
   */
  displayError(message: string): void;

  /**
   * Display warning message.
   *
   * @level CORE - Should be implemented for basic functionality
   * @param message Warning message
   */
  displayWarning(message: string): void;

  /**
   * Display success message.
   *
   * @level CORE - Should be implemented for basic functionality
   * @param message Success message
   */
  displaySuccess(message: string): void;

  /**
   * Display informational message.
   *
   * @level CORE - Should be implemented for basic functionality
   * @param message Info message
   */
  displayInfo(message: string): void;

  /**
   * Prompt user for confirmation.
   *
   * @level OPTIONAL - Can return false if not implemented
   * @param message Confirmation prompt message
   * @returns User's confirmation decision
   */
  promptConfirmation(message: string): Promise<boolean>;

  /**
   * Show rewind menu for snapshot selection.
   *
   * @level OPTIONAL - Can return null if not implemented
   * @param snapshots Available snapshots
   * @returns Selected snapshot or null
   */
  showRewindMenu(snapshots: Snapshot[]): Promise<Snapshot | null>;

  /**
   * Show session selection menu.
   *
   * @level OPTIONAL - Can return null if not implemented
   * @param sessions Available sessions
   * @returns Selected session or null
   */
  showSessionMenu(sessions: Session[]): Promise<Session | null>;

  /**
   * Show confirmation menu with options.
   *
   * @level OPTIONAL - Can return false if not implemented
   * @param title Menu title
   * @param options Menu options
   * @param defaultKey Default option key
   * @returns User's confirmation decision
   */
  showConfirmationMenu(
    title: string,
    options: Array<{ key: string; label: string; description?: string }>,
    defaultKey?: string
  ): Promise<boolean>;

  /**
   * Set initial permission mode.
   *
   * @level OPTIONAL - No-op if not implemented
   * @param mode Permission mode
   */
  setInitialPermissionMode(mode: PermissionMode): void;

  /**
   * Set permission mode (runtime change).
   *
   * @level OPTIONAL - No-op if not implemented
   * @param mode Permission mode
   */
  setPermissionMode(mode: PermissionMode): void;

  /**
   * Display permission status.
   *
   * @level OPTIONAL - No-op if not implemented
   * @param mode Permission mode
   */
  displayPermissionStatus(mode: PermissionMode): void;

  /**
   * Set processing state.
   *
   * @level OPTIONAL - No-op if not implemented
   * @param processing Whether currently processing
   */
  setProcessingState(processing: boolean): void;

  /**
   * Display todo list with progress.
   *
   * @level OPTIONAL - No-op if not implemented
   * @param todos Todo items
   */
  displayTodoList(todos: TodoItem[]): void;

  /**
   * Format relative time display.
   *
   * @level UTILITY - Can return simple string if not implemented
   * @param date Date to format
   * @returns Formatted string
   */
  formatRelativeTime(date: Date): string;

  /**
   * Format absolute time display.
   *
   * @level UTILITY - Can return simple string if not implemented
   * @param date Date to format
   * @returns Formatted string
   */
  formatAbsoluteTime(date: Date): string;

  /**
   * Format stats summary display.
   *
   * @level UTILITY - Can return simple string if not implemented
   * @param stats Session statistics
   * @returns Formatted summary string
   */
  formatStatsSummary(stats?: SessionStats): string;
}
