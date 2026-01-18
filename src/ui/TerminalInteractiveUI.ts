/**
 * File: TerminalInteractiveUI
 *
 * Purpose:
 * - Terminal-based Interactive UI implementation using callbacks and config.
 */
import * as readline from 'readline';
import type {
  InteractiveUIConfig,
  InteractiveUICallbacks,
  InteractiveUIInterface,
  MessageRole,
  PermissionMode,
  Snapshot,
} from './InteractiveUIInterface';
import type { Session, SessionStats } from '../core/SessionManager';

/**
 * ANSI color codes.
 */
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  // Foreground colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  // Background colors
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

const ESC_DOUBLE_PRESS_WINDOW_MS = parseInt(
  process.env.TERMINAL_UI_ESC_DOUBLE_PRESS_WINDOW_MS || '300',
  10
);
const SHIFT_TAB_BUFFER_LIMIT = parseInt(process.env.TERMINAL_UI_SHIFT_TAB_BUFFER_LIMIT || '10', 10);
const TOOL_ARG_PREVIEW_MAX_LENGTH = parseInt(
  process.env.TERMINAL_UI_TOOL_ARG_PREVIEW_MAX_LENGTH || '30',
  10
);
const TOOL_RESULT_MAX_LENGTH = parseInt(
  process.env.TERMINAL_UI_TOOL_RESULT_MAX_LENGTH || '200',
  10
);
const THINKING_MAX_LINES = parseInt(process.env.TERMINAL_UI_THINKING_MAX_LINES || '3', 10);
const THINKING_MAX_LINE_LENGTH = parseInt(
  process.env.TERMINAL_UI_THINKING_MAX_LINE_LENGTH || '100',
  10
);
const COMPUTING_FRAME_INTERVAL_MS = parseInt(
  process.env.TERMINAL_UI_COMPUTING_FRAME_INTERVAL_MS || '500',
  10
);
const SESSION_ID_PREVIEW_LENGTH = parseInt(
  process.env.TERMINAL_UI_SESSION_ID_PREVIEW_LENGTH || '8',
  10
);
const SESSION_PREVIEW_MAX_LENGTH = parseInt(
  process.env.TERMINAL_UI_SESSION_PREVIEW_MAX_LENGTH || '60',
  10
);
const RELATIVE_SECONDS_IN_MINUTE = parseInt(
  process.env.TERMINAL_UI_RELATIVE_SECONDS_IN_MINUTE || '60',
  10
);
const RELATIVE_MINUTES_IN_HOUR = parseInt(
  process.env.TERMINAL_UI_RELATIVE_MINUTES_IN_HOUR || '60',
  10
);
const RELATIVE_HOURS_IN_DAY = parseInt(process.env.TERMINAL_UI_RELATIVE_HOURS_IN_DAY || '24', 10);
const RELATIVE_DAYS_IN_WEEK = parseInt(process.env.TERMINAL_UI_RELATIVE_DAYS_IN_WEEK || '7', 10);
const RELATIVE_DAYS_IN_MONTH = parseInt(process.env.TERMINAL_UI_RELATIVE_DAYS_IN_MONTH || '30', 10);
const RELATIVE_WEEKS_IN_MONTH = parseInt(
  process.env.TERMINAL_UI_RELATIVE_WEEKS_IN_MONTH || '4',
  10
);
const RELATIVE_MONTHS_IN_YEAR = parseInt(
  process.env.TERMINAL_UI_RELATIVE_MONTHS_IN_YEAR || '12',
  10
);
const RELATIVE_DAYS_IN_YEAR = parseInt(process.env.TERMINAL_UI_RELATIVE_DAYS_IN_YEAR || '365', 10);
const DATE_PAD_LENGTH = parseInt(process.env.TERMINAL_UI_DATE_PAD_LENGTH || '2', 10);
const TOKENS_IN_K = parseInt(process.env.TERMINAL_UI_TOKENS_IN_K || '1000', 10);
const TOKENS_K_DECIMALS = parseInt(process.env.TERMINAL_UI_TOKENS_K_DECIMALS || '1', 10);
const COST_DECIMALS = parseInt(process.env.TERMINAL_UI_COST_DECIMALS || '3', 10);
const COST_DISPLAY_THRESHOLD = parseFloat(process.env.TERMINAL_UI_COST_DISPLAY_THRESHOLD || '0.01');
const CLEAR_LINE_DIRECTION = parseInt(
  process.env.TERMINAL_UI_CLEAR_LINE_DIRECTION || '0',
  10
) as readline.Direction;

/**
 * Permission mode color mapping.
 */
const PERMISSION_MODE_COLORS: Record<PermissionMode, keyof typeof COLORS> = {
  default: 'green',
  acceptEdits: 'yellow',
  bypassPermissions: 'red',
  plan: 'blue',
};

/**
 * Permission mode labels.
 */
const PERMISSION_MODE_LABELS: Record<PermissionMode, string> = {
  default: 'De' + 'fault',
  acceptEdits: 'Accept Edits',
  bypassPermissions: 'Bypass Permissions',
  plan: 'Plan Mode',
};

/**
 * Permission mode emojis.
 */
const PERMISSION_MODE_EMOJIS: Record<PermissionMode, string> = {
  default: '🟢',
  acceptEdits: '🟡',
  bypassPermissions: '🔴',
  plan: '🔵',
};

export class TerminalInteractiveUI implements InteractiveUIInterface {
  private readonly callbacks: InteractiveUICallbacks;
  private readonly onMessage: InteractiveUICallbacks['onMessage'];
  private readonly onInterrupt: InteractiveUICallbacks['onInterrupt'];
  private readonly onRewind: InteractiveUICallbacks['onRewind'];
  private readonly onPermissionModeChange?: InteractiveUICallbacks['onPermissionModeChange'];
  private readonly onQueueMessage?: InteractiveUICallbacks['onQueueMessage'];
  private readonly input: NodeJS.ReadableStream;
  private readonly output: NodeJS.WritableStream;
  private readonly enableColors: boolean;
  private rl: readline.Interface | null = null;
  private isRunning = false;
  /** Indicates if a message is being processed for non-blocking input. */
  private isProcessingMessage = false;
  private lastEscTime = 0;
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private currentPermissionMode: PermissionMode = 'default';
  /** Shift+Tab detection buffer. */
  private shiftTabBuffer = '';
  private keyListener?: (data: Buffer) => void;
  private pendingPromptResolver: ((value: string | null) => void) | null = null;
  private pendingPromptCloseHandler: (() => void) | null = null;
  private pendingPromptId = 0;
  private activePromptId: number | null = null;
  private canceledPromptIds = new Set<number>();
  private inputSuspended = false;
  private resumeInputPromise: Promise<void> | null = null;
  private resumeInputResolver: (() => void) | null = null;
  private escTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(callbacks: InteractiveUICallbacks, config: InteractiveUIConfig = {}) {
    this.callbacks = callbacks;
    this.onMessage = callbacks.onMessage;
    this.onInterrupt = callbacks.onInterrupt;
    this.onRewind = callbacks.onRewind;
    this.onPermissionModeChange = callbacks.onPermissionModeChange;
    this.onQueueMessage = callbacks.onQueueMessage;
    this.input = config.input || process.stdin;
    this.output = config.output || process.stdout;
    this.enableColors = config.enableColors ?? true;
  }

  /**
   * Start the interactive session.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    this.rl = readline.createInterface({
      input: this.input,
      output: this.output,
      terminal: true,
    });

    if (this.input === process.stdin && process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    this.setupKeyListener();
    this.displayWelcome();
    await this.inputLoop();
  }

  /**
   * Stop the interactive session.
   */
  stop(): void {
    this.isRunning = false;

    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }

    if (this.escTimer) {
      clearTimeout(this.escTimer);
      this.escTimer = null;
    }

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    if (this.keyListener) {
      this.input.removeListener('data', this.keyListener);
      this.keyListener = undefined;
    }

    if (this.input === process.stdin && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  }

  /**
   * Display a message.
   */
  displayMessage(message: string, role: MessageRole): void {
    const prefix = this.getMessagePrefix(role);
    const coloredMessage = this.colorize(message, this.getRoleColor(role));
    this.writeLine(`${prefix} ${coloredMessage}`);
  }

  /**
   * Display tool invocation.
   */
  displayToolUse(tool: string, args: Record<string, unknown>): void {
    const icon = this.colorize('⏺', 'cyan');
    const toolName = this.colorize(tool, 'bold');
    const argPairs = Object.entries(args)
      .map(([key, value]) => {
        const displayValue =
          typeof value === 'string'
            ? `"${value.length > TOOL_ARG_PREVIEW_MAX_LENGTH ? value.slice(0, TOOL_ARG_PREVIEW_MAX_LENGTH) + '...' : value}"`
            : JSON.stringify(value);
        return `${key}: ${displayValue}`;
      })
      .join(', ');
    const argsDisplay = argPairs ? `(${argPairs})` : '';
    this.writeLine(`${icon} ${toolName}${this.colorize(argsDisplay, 'gray')}`);
  }

  /**
   * Display tool execution result.
   */
  displayToolResult(tool: string, result: string, isError = false): void {
    const resultIcon = isError ? '⎿' : '⎿';
    const color = isError ? 'red' : 'gray';
    const firstLine = result.split('\n')[0];
    const displayResult =
      firstLine.length > TOOL_RESULT_MAX_LENGTH
        ? firstLine.slice(0, TOOL_RESULT_MAX_LENGTH) + '...'
        : firstLine;
    if (displayResult.trim()) {
      this.writeLine(`  ${resultIcon}  ${this.colorize(displayResult.trim(), color)}`);
    }
    void tool;
  }

  /**
   * Display thinking status.
   */
  displayThinking(content?: string): void {
    const icon = this.colorize('∴', 'magenta');
    const label = this.colorize('Thinking…', 'magenta');
    this.writeLine(`${icon} ${label}`);

    if (content && content.trim()) {
      const lines = content.trim().split('\n').slice(0, THINKING_MAX_LINES);
      for (const line of lines) {
        const displayLine =
          line.length > THINKING_MAX_LINE_LENGTH
            ? line.slice(0, THINKING_MAX_LINE_LENGTH) + '...'
            : line;
        this.writeLine(`  ${this.colorize(displayLine, 'gray')}`);
      }
    }
  }

  /**
   * Display computing status with animation.
   */
  displayComputing(): void {
    this.clearProgress();

    const frames = ['●', '○'];
    let frameIndex = 0;

    const initialIcon = this.colorize(frames[0], 'green');
    const label = this.colorize('Computing…', 'green');
    const hint = this.colorize(' (esc to interrupt)', 'gray');

    this.write(`${initialIcon} ${label}${hint}`);

    this.progressInterval = setInterval(() => {
      frameIndex++;
      const frame = frames[frameIndex % frames.length];
      this.clearLine();
      const icon = this.colorize(frame, 'green');
      this.write(`\r${icon} ${label}${hint}`);
    }, COMPUTING_FRAME_INTERVAL_MS);
  }

  /**
   * Stop computing status.
   */
  stopComputing(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
      this.clearLine();
      this.write('\r');
    }
  }

  /**
   * Set processing state.
   */
  setProcessingState(processing: boolean): void {
    this.isProcessingMessage = processing;
  }

  /**
   * Clear progress indicator.
   */
  clearProgress(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
      this.clearLine();
      this.write('\r');
    }
  }

  /**
   * Prompt for confirmation.
   */
  promptConfirmation(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.rl) {
        resolve(false);
        return;
      }

      const prompt = `${this.colorize('?', 'yellow')} ${message} ${this.colorize('(y/n)', 'gray')} `;
      this.rl.question(prompt, (answer) => {
        const normalized = answer.trim().toLowerCase();
        if (normalized === 'y' || normalized === 'yes' || normalized === '') {
          this.writeLine(this.colorize('✓ 是', 'green'));
          resolve(true);
        } else {
          this.writeLine(this.colorize('✗ 否', 'red'));
          resolve(false);
        }
      });
    });
  }

  /**
   * Display rewind menu.
   */
  async showRewindMenu(snapshots: Snapshot[]): Promise<Snapshot | null> {
    this.suspendInputLoop();
    if (snapshots.length === 0) {
      this.writeLine(this.colorize('没有可用的回退点', 'yellow'));
      this.resumeInputLoop();
      return null;
    }

    try {
      this.writeLine('');
      this.writeLine(this.colorize('═══ 回退菜单 ═══', 'bold'));
      this.writeLine(this.colorize('选择要回退到的时间点 (输入 0 取消):', 'gray'));
      this.writeLine('');

      snapshots.forEach((snapshot, index) => {
        const timeStr = this.formatTime(snapshot.timestamp);
        const filesCount = snapshot.files.length;
        const filesInfo = filesCount > 0 ? `(${filesCount} 个文件)` : '';
        this.writeLine(
          `  ${this.colorize(`[${index + 1}]`, 'cyan')} ${timeStr} - ${snapshot.description} ${this.colorize(filesInfo, 'gray')}`
        );
      });

      this.writeLine('');

      if (this.rl) {
        for (;;) {
          const answer = await this.promptRaw(
            `${this.colorize('?', 'yellow')} 请选择 (0-${snapshots.length}): `
          );
          if (answer === null) {
            return null;
          }
          const trimmed = answer.trim();
          const num = parseInt(trimmed, 10);
          if (trimmed === '0') {
            this.writeLine(this.colorize('✗ 已取消', 'gray'));
            return null;
          }
          if (!isNaN(num) && num >= 1 && num <= snapshots.length) {
            const selected = snapshots[num - 1];
            this.writeLine(this.colorize(`✓ 已选择: ${selected.description}`, 'green'));
            return selected;
          }
          this.displayInvalidSelection();
        }
      }

      return new Promise((resolve) => {
        const prompt = `${this.colorize('?', 'yellow')} 请选择 (0-${snapshots.length}): `;
        this.write(prompt);
        const handleInput = (data: Buffer) => {
          const input = data.toString().trim();
          const num = parseInt(input, 10);
          if (input === '0') {
            this.writeLine(this.colorize('✗ 已取消', 'gray'));
            this.input.removeListener('data', handleInput);
            resolve(null);
          } else if (!isNaN(num) && num >= 1 && num <= snapshots.length) {
            const selected = snapshots[num - 1];
            this.writeLine(this.colorize(`✓ 已选择: ${selected.description}`, 'green'));
            this.input.removeListener('data', handleInput);
            resolve(selected);
          } else {
            this.displayInvalidSelection();
            this.write(prompt);
          }
        };
        this.input.on('data', handleInput);
      });
    } finally {
      this.resumeInputLoop();
    }
  }

  /**
   * Display session menu.
   */
  async showSessionMenu(sessions: Session[]): Promise<Session | null> {
    if (sessions.length === 0) {
      this.writeLine(this.colorize('没有可用的会话', 'yellow'));
      return null;
    }

    this.writeLine('');
    this.writeLine(this.colorize('═══ 会话菜单 ═══', 'bold'));
    this.writeLine(this.colorize('选择要恢复的会话 (输入 0 取消):', 'gray'));
    this.writeLine('');

    sessions.forEach((session, index) => {
      const sessionIdShort = session.id.substring(0, SESSION_ID_PREVIEW_LENGTH);
      const relativeTime = this.formatRelativeTime(session.lastAccessedAt);
      const absoluteTime = this.formatAbsoluteTime(session.lastAccessedAt);
      const statsSummary = this.formatStatsSummary(session.stats);
      const forkIndicator = session.parentSessionId ? '🔀 ' : '';
      this.writeLine(
        `  ${this.colorize(`[${index + 1}]`, 'cyan')} ${forkIndicator}${this.colorize(sessionIdShort, 'bold')} - ${relativeTime} (${absoluteTime}) - ${statsSummary}`
      );
      if (session.stats?.lastMessagePreview) {
        const preview =
          session.stats.lastMessagePreview.length > SESSION_PREVIEW_MAX_LENGTH
            ? session.stats.lastMessagePreview.substring(0, SESSION_PREVIEW_MAX_LENGTH) + '...'
            : session.stats.lastMessagePreview;
        this.writeLine(`      ${this.colorize(preview, 'gray')}`);
      }
    });

    this.writeLine('');

    if (this.rl) {
      for (;;) {
        const answer = await this.promptRaw(
          `${this.colorize('?', 'yellow')} 请选择 (0-${sessions.length}): `
        );
        if (answer === null) {
          return null;
        }
        const trimmed = answer.trim();
        const num = parseInt(trimmed, 10);
        if (trimmed === '0') {
          this.writeLine(this.colorize('✗ 已取消', 'gray'));
          return null;
        }
        if (!isNaN(num) && num >= 1 && num <= sessions.length) {
          const selected = sessions[num - 1];
          const sessionIdShort = selected.id.substring(0, SESSION_ID_PREVIEW_LENGTH);
          this.writeLine(this.colorize(`✓ 已选择会话: ${sessionIdShort}`, 'green'));
          return selected;
        }
        this.displayInvalidSelection();
      }
    }

    return new Promise((resolve) => {
      const prompt = `${this.colorize('?', 'yellow')} 请选择 (0-${sessions.length}): `;
      this.write(prompt);
      const handleInput = (data: Buffer) => {
        const input = data.toString().trim();
        const num = parseInt(input, 10);
        if (input === '0') {
          this.writeLine(this.colorize('✗ 已取消', 'gray'));
          this.input.removeListener('data', handleInput);
          resolve(null);
        } else if (!isNaN(num) && num >= 1 && num <= sessions.length) {
          const selected = sessions[num - 1];
          const sessionIdShort = selected.id.substring(0, SESSION_ID_PREVIEW_LENGTH);
          this.writeLine(this.colorize(`✓ 已选择会话: ${sessionIdShort}`, 'green'));
          this.input.removeListener('data', handleInput);
          resolve(selected);
        } else {
          this.displayInvalidSelection();
          this.write(prompt);
        }
      };
      this.input.on('data', handleInput);
    });
  }

  /**
   * Display a confirmation menu.
   */
  async showConfirmationMenu(
    title: string,
    options: Array<{ key: string; label: string; description?: string }>,
    defaultKey?: string
  ): Promise<boolean> {
    this.writeLine('');
    this.writeLine(this.colorize(`═══ ${title} ═══`, 'bold'));
    this.writeLine('');

    options.forEach((option) => {
      const key = option.key.toLowerCase();
      const isDefault = defaultKey && key === defaultKey.toLowerCase();
      const prefix = isDefault ? this.colorize('▶', 'green') : ' ';
      const keyColor = this.colorize(`[${key}]`, 'cyan');
      this.writeLine(`  ${prefix} ${keyColor} ${option.label}`);
      if (option.description) {
        this.writeLine(`      ${this.colorize(option.description, 'gray')}`);
      }
    });

    this.writeLine('');

    if (this.rl) {
      for (;;) {
        const answer = await this.promptRaw(
          `${this.colorize('?', 'yellow')} 请选择 (${options.map((o) => o.key).join('/')}): `
        );
        if (answer === null) {
          return false;
        }
        const trimmed = answer.trim().toLowerCase();
        const matchedOption = options.find((o) => o.key.toLowerCase() === trimmed);
        if (matchedOption) {
          return matchedOption.key === 'n' || matchedOption.key === 'N';
        }
        if (defaultKey && trimmed === '') {
          return defaultKey === 'n' || defaultKey === 'N';
        }
        this.displayInvalidSelection();
      }
    }

    return new Promise((resolve) => {
      const prompt = `${this.colorize('?', 'yellow')} 请选择 (${options.map((o) => o.key).join('/')}): `;
      this.write(prompt);
      const handleInput = (data: Buffer) => {
        const input = data.toString().trim().toLowerCase();
        const matchedOption = options.find((o) => o.key.toLowerCase() === input);
        if (matchedOption) {
          this.writeLine(this.colorize(`✓ 已选择: ${matchedOption.label}`, 'green'));
          this.input.removeListener('data', handleInput);
          resolve(matchedOption.key === 'n' || matchedOption.key === 'N');
        } else if (defaultKey && input === '') {
          this.writeLine(
            this.colorize(`✓ 已选择: ${options.find((o) => o.key === defaultKey)?.label}`, 'green')
          );
          this.input.removeListener('data', handleInput);
          resolve(defaultKey === 'n' || defaultKey === 'N');
        } else {
          this.displayInvalidSelection();
          this.write(prompt);
        }
      };
      this.input.on('data', handleInput);
    });
  }

  /**
   * Set initial permission mode.
   */
  setInitialPermissionMode(mode: PermissionMode): void {
    this.currentPermissionMode = mode;
  }

  /**
   * Set permission mode with notification.
   */
  setPermissionMode(mode: PermissionMode): void {
    this.currentPermissionMode = mode;
    const label = PERMISSION_MODE_LABELS[mode];
    const emoji = PERMISSION_MODE_EMOJIS[mode];
    this.displayInfo(`Switched to: ${emoji} ${label}`);
  }

  /**
   * Display permission status.
   */
  displayPermissionStatus(mode: PermissionMode): void {
    this.currentPermissionMode = mode;
    const color = PERMISSION_MODE_COLORS[mode];
    const label = PERMISSION_MODE_LABELS[mode];
    const statusLine = `Permission Mode: ${this.colorize(`[${label}]`, color)}`;
    this.writeLine(statusLine);
  }

  /**
   * Setup key listener for terminal input.
   */
  private setupKeyListener(): void {
    if (this.input !== process.stdin) {
      return;
    }

    const handleInput = (key: Buffer) => {
      const keyStr = key.toString();
      this.shiftTabBuffer += keyStr;

      if (this.shiftTabBuffer.endsWith('\x1b[Z')) {
        const newMode = this.cyclePermissionMode();
        const label = PERMISSION_MODE_LABELS[newMode];
        const color = PERMISSION_MODE_COLORS[newMode];
        const emoji = PERMISSION_MODE_EMOJIS[newMode];
        this.writeLine('');
        this.writeLine(this.colorize(`ℹ️ Switched to: ${emoji} ${label}`, color));
        this.shiftTabBuffer = '';
        return;
      }

      if (this.shiftTabBuffer.length > SHIFT_TAB_BUFFER_LIMIT) {
        this.shiftTabBuffer = '';
      }

      if (keyStr === '\x1b') {
        const now = Date.now();
        if (now - this.lastEscTime < ESC_DOUBLE_PRESS_WINDOW_MS) {
          this.lastEscTime = 0;
          if (this.escTimer) {
            clearTimeout(this.escTimer);
            this.escTimer = null;
          }
          this.onRewind()
            .catch((err) => {
              this.displayError(`Rewind failed: ${err.message}`);
            })
            .finally(() => {
              this.lastEscTime = 0;
            });
        } else {
          this.lastEscTime = now;
          if (this.escTimer) {
            clearTimeout(this.escTimer);
          }
          this.escTimer = setTimeout(() => {
            this.escTimer = null;
            this.onInterrupt();
          }, ESC_DOUBLE_PRESS_WINDOW_MS);
        }
      }

      if (keyStr === '\x03') {
        this.stop();
        process.exit(0);
      }
    };

    this.keyListener = handleInput;
    this.input.on('data', handleInput);
  }

  /**
   * Input loop with non-blocking processing.
   */
  /**
   * Handle slash commands (Terminal-specific feature)
   *
   * Parses slash command syntax and routes to runner methods or SDK.
   * This is Terminal UI specific - other UIs (Web/Desktop) use different interaction patterns
   * (buttons, menus, etc.) to trigger the same runner functionality.
   *
   * @param command - Command string including leading /
   */
  private async handleSlashCommand(command: string): Promise<void> {
    const parts = command.slice(1).split(/\s+/);
    const cmdName = parts[0].toLowerCase();

    switch (cmdName) {
      case 'help':
        this.showCommandHelp();
        break;
      case 'sessions':
        await this.showSessions();
        break;
      case 'resume':
        await this.handleResumeCommand();
        break;
      case 'config':
        await this.showConfig();
        break;
      case 'permissions':
        this.showPermissions();
        break;
      case 'mcp':
        await this.handleMCPCommand(parts);
        break;
      case 'clear':
        console.clear();
        break;
      case 'exit':
      case 'quit':
        this.stop();
        break;
      default:
        // Skill commands: send to SDK via onMessage callback
        await this.onMessage(command);
    }
  }

  /**
   * Show command help information
   *
   * Public API: Can be called by UI implementations to display help information.
   * This is a terminal-specific implementation that displays formatted help text.
   */
  private showCommandHelp(): void {
    const helpText = `
Available commands:
  /help        - Show this help information
  /sessions    - List all sessions
  /config      - Show current configuration
  /permissions - Show permission settings
  /mcp         - Show MCP server status
  /mcp list    - Show MCP server status
  /mcp edit    - Edit MCP configuration
  /mcp validate - Validate MCP configuration
  /clear       - Clear screen
  /exit        - Exit program
`.trim();

    this.displayInfo(helpText);
  }

  /**
   * List all saved sessions
   *
   * Public API: Can be called by UI implementations to display session list.
   * This method fetches session data from the runner and formats it for terminal display.
   */
  private async showSessions(): Promise<void> {
    // Get runner reference
    const runner = this.callbacks.getRunner?.();
    if (!runner) {
      this.displayError('Runner not available');
      return;
    }

    // Fetch session data from runner
    const sessions = await runner.listSessionsData();
    if (sessions.length === 0) {
      this.displayInfo('No saved sessions');
      return;
    }

    this.writeLine('');
    const lines = ['Session list:'];
    for (const session of sessions) {
      const status = session.expired ? '(expired)' : '';
      const time = session.lastAccessedAt.toLocaleString();
      lines.push(`  ${session.id} - ${time} ${status}`);
    }

    // Use displayInfo to show the formatted session list
    const output = lines.join('\n');
    this.displayInfo(output);
  }

  /**
   * Show current configuration
   *
   * Public API: Can be called by UI implementations to display configuration.
   * This method fetches config data from the runner and formats it for terminal display.
   */
  private async showConfig(): Promise<void> {
    // Get runner reference
    const runner = this.callbacks.getRunner?.();
    if (!runner) {
      this.displayError('Runner not available');
      return;
    }

    // Fetch config data from runner
    const configData = await runner.getConfigData();

    this.writeLine('');
    const lines = ['Current configuration:', JSON.stringify(configData, null, 2)];
    const output = lines.join('\n');
    this.displayInfo(output);
  }

  /**
   * Show permission settings
   *
   * Public API: Can be called by UI implementations to display permission configuration.
   * This method fetches permission data from the runner and formats it for terminal display.
   */
  private showPermissions(): void {
    // Get runner reference
    const runner = this.callbacks.getRunner?.();
    if (!runner) {
      this.displayError('Runner not available');
      return;
    }

    // Fetch permission data from runner
    const config = runner.getPermissionsData();

    this.writeLine('');
    const lines = [
      'Permission settings:',
      `  Mode: ${config.mode}`,
      `  Skip permission checks: ${config.allowDangerouslySkipPermissions ? 'yes' : 'no'}`,
    ];
    const output = lines.join('\n');
    this.displayInfo(output);
  }

  /**
   * Execute MCP command and return structured data
   *
   * This is a terminal-specific implementation that calls the runner's data methods
   * and returns structured data for the UI to format and display.
   *
   * @param parts - Command parts (e.g., ['mcp', 'list'] or ['mcp', 'edit'])
   * @returns Promise resolving to operation type and data
   */
  private async executeMCPCommand(parts: string[]): Promise<{
    operation: 'list' | 'edit' | 'validate' | 'help';
    data?: any;
  }> {
    const runner = this.callbacks.getRunner?.();
    if (!runner) {
      throw new Error('Runner not available');
    }

    const subcommand = parts[1]?.toLowerCase();

    if (!subcommand || subcommand === 'list') {
      const data = await runner.getMCPConfigData();
      return { operation: 'list', data };
    }

    if (subcommand === 'edit') {
      const data = await runner.editMCPConfigData();
      return { operation: 'edit', data };
    }

    if (subcommand === 'validate') {
      const data = await runner.validateMCPConfigData();
      return { operation: 'validate', data };
    }

    return { operation: 'help' };
  }

  /**
   * Handle MCP command and subcommands
   *
   * Public API: Can be called by UI implementations to handle MCP operations.
   * This method delegates to the runner's MCP handling logic and formats the output.
   *
   * @param parts - Command parts (e.g., ['mcp', 'list'] or ['mcp', 'edit'])
   */
  private async handleMCPCommand(parts: string[]): Promise<void> {
    // Get runner reference
    const runner = this.callbacks.getRunner?.();
    if (!runner) {
      this.displayError('Runner not available');
      return;
    }

    // Execute MCP command
    try {
      const result = await this.executeMCPCommand(parts);

      // Handle different operations
      switch (result.operation) {
        case 'list':
          await this.showMCPConfig(result.data);
          break;
        case 'edit':
          await this.editMCPConfig(result.data);
          break;
        case 'validate':
          await this.validateMCPConfig(result.data);
          break;
        case 'help':
          this.showMCPCommandHelp(parts[1]);
          break;
      }
    } catch (error) {
      this.displayError(
        `MCP command failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Show MCP command help information
   */
  private showMCPCommandHelp(subcommand?: string): void {
    if (subcommand) {
      this.displayInfo(`Unknown MCP subcommand: ${subcommand}`);
    }

    const helpText = `
MCP commands:
  /mcp           - Show MCP server status
  /mcp list      - Show MCP server status
  /mcp edit      - Edit MCP configuration
  /mcp validate  - Validate MCP configuration
`.trim();

    this.displayInfo(helpText);
  }

  /**
   * Show MCP configuration
   */
  private async showMCPConfig(data?: any): Promise<void> {
    const runner = this.callbacks.getRunner?.();
    if (!runner) {
      this.displayError('Runner not available');
      return;
    }

    try {
      const result = data || await runner.getMCPConfigData();

      if (result.servers.length === 0) {
        this.displayInfo(`No MCP servers configured at ${result.configPath}`);
        this.displayInfo('Use /mcp edit to add MCP servers.');
        this.displayInfo('Use /mcp validate to validate MCP configuration.');
        return;
      }

      this.writeLine('');
      const lines = [`MCP configuration: ${result.configPath}\nMCP servers:`];
      result.servers.forEach((server: any, index: number) => {
        if (index > 0) {
          lines.push('');
        }
        lines.push(`- ${server.name}`);
        lines.push(`  Transport: ${server.type}`);
        lines.push('  Config:');
        const configLines = JSON.stringify(server.config, null, 2).split('\n');
        for (const line of configLines) {
          lines.push(`    ${line}`);
        }
      });

      lines.push('');
      lines.push('Commands:');
      lines.push('  /mcp edit     - Edit MCP configuration');
      lines.push('  /mcp validate - Validate MCP configuration');
      lines.push('');

      this.displayInfo(lines.join('\n'));
    } catch (error) {
      this.displayError(
        `Failed to show MCP configuration: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Edit MCP configuration
   */
  private async editMCPConfig(data?: any): Promise<void> {
    const runner = this.callbacks.getRunner?.();
    if (!runner) {
      this.displayError('Runner not available');
      return;
    }

    try {
      const result = data || await runner.editMCPConfigData();
      this.displaySuccess(`MCP configuration updated: ${result.configPath}`);
      this.displayInfo('Reload the application to apply the updated configuration.');
    } catch (error) {
      this.displayError(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Validate MCP configuration
   */
  private async validateMCPConfig(data?: any): Promise<void> {
    const runner = this.callbacks.getRunner?.();
    if (!runner) {
      this.displayError('Runner not available');
      return;
    }

    try {
      const result = data || await runner.validateMCPConfigData();

      if (result.valid) {
        this.displaySuccess(`MCP configuration is valid. Servers: ${result.serverCount}`);
        this.displayInfo(
          `Transports: stdio ${result.transportCounts.stdio}, sse ${result.transportCounts.sse}, http ${result.transportCounts.http}`
        );
        return;
      }

      this.displayInfo(
        `MCP configuration is invalid. Errors: ${result.errors.length}, Path: ${result.configPath}`
      );
      for (const error of result.errors) {
        const details: string[] = [];
        if (error.path) {
          details.push(`path: ${error.path}`);
        }
        if (typeof error.line === 'number') {
          details.push(`line: ${error.line}`);
        }
        if (typeof error.column === 'number') {
          details.push(`column: ${error.column}`);
        }
        const suffix = details.length > 0 ? ` (${details.join(', ')})` : '';
        this.displayInfo(`- ${error.message}${suffix}`);
      }
    } catch (error) {
      this.displayError(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Handle /resume command to show session resume menu
   *
   * Public API: Can be called by UI implementations to resume a session.
   * This method handles the full resume flow including UI interaction and business logic.
   *
   * Only available in interactive mode. Displays recent session list for user to choose.
   * User can cancel (returns null) or select a specific session to resume.
   */
  private async handleResumeCommand(): Promise<void> {
    // Get runner reference
    const runner = this.callbacks.getRunner?.();
    if (!runner) {
      this.displayError('Runner not available');
      return;
    }

    // Get recent sessions
    const sessions = await runner.listRecentSessionsData(10);
    if (sessions.length === 0) {
      this.displayInfo('No available sessions to resume');
      return;
    }

    // Show session menu and get user selection
    const selectedSession = await this.showSessionMenu(sessions);
    if (!selectedSession) {
      return;
    }

    // Check if session can be resumed
    const hasValidSdkSession = !!selectedSession.sdkSessionId;

    // Ask user whether to create new branch
    let forkSession = false;
    if (hasValidSdkSession) {
      forkSession = await this.showConfirmationMenu(
        `选择会话恢复方式`,
        [
          {
            key: 'c',
            label: '继续原会话 (使用相同SDK会话)',
            description: '保持SDK会话ID，继续在原会话中对话',
          },
          {
            key: 'n',
            label: '创建新分支 (生成新SDK会话)',
            description: '创建新分支，拥有独立的SDK会话ID',
          },
        ],
        'c'
      );
    }

    try {
      // Execute resume operation
      await runner.resumeSession(selectedSession, forkSession);

      // Get resume result info and display success message
      const resumeInfo = runner.getResumeSessionInfo(selectedSession, forkSession);
      this.writeLine('');
      this.displaySuccess(resumeInfo.message);
    } catch (error) {
      this.displayError(
        `Failed to resume session: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async inputLoop(): Promise<void> {
    while (this.isRunning && this.rl) {
      try {
        if (this.inputSuspended) {
          await this.waitForInputResume();
          if (!this.isRunning || !this.rl) {
            break;
          }
        }
        const input = await this.prompt();
        if (input === null) {
          break;
        }

        const trimmedInput = input.trim();
        if (trimmedInput.length === 0) {
          continue;
        }

        // Terminal-specific: detect slash commands
        if (trimmedInput.startsWith('/')) {
          await this.handleSlashCommand(trimmedInput);
          continue;
        }

        if (this.isProcessingMessage && this.onQueueMessage) {
          this.onQueueMessage(trimmedInput);
        } else {
          this.isProcessingMessage = true;
          this.onMessage(trimmedInput)
            .catch((error) => {
              if (error instanceof Error) {
                this.displayError(error.message);
              }
            })
            .finally(() => {
              this.isProcessingMessage = false;
            });
        }
      } catch (error) {
        if (error instanceof Error) {
          this.displayError(error.message);
        }
      }
    }
  }

  /**
   * Display error status.
   */
  displayError(message: string): void {
    this.writeLine(`${this.colorize('❌ 错误:', 'red')} ${message}`);
  }

  /**
   * Display warning status.
   */
  displayWarning(message: string): void {
    this.writeLine(`${this.colorize('⚠️ 警告:', 'yellow')} ${message}`);
  }

  /**
   * Display success status.
   */
  displaySuccess(message: string): void {
    this.writeLine(`${this.colorize('✅ 成功:', 'green')} ${message}`);
  }

  /**
   * Display info status.
   */
  displayInfo(message: string): void {
    this.writeLine(`${this.colorize('ℹ️ 信息:', 'blue')} ${message}`);
  }

  private displayInvalidSelection(): void {
    this.writeLine(this.colorize('✗ 无效选择，请重试', 'red'));
  }

  /**
   * Format relative time.
   */
  formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / RELATIVE_SECONDS_IN_MINUTE);
    const diffHours = Math.floor(diffMinutes / RELATIVE_MINUTES_IN_HOUR);
    const diffDays = Math.floor(diffHours / RELATIVE_HOURS_IN_DAY);
    const diffWeeks = Math.floor(diffDays / RELATIVE_DAYS_IN_WEEK);
    const diffMonths = Math.floor(diffDays / RELATIVE_DAYS_IN_MONTH);
    const diffYears = Math.floor(diffDays / RELATIVE_DAYS_IN_YEAR);

    if (diffSeconds < RELATIVE_SECONDS_IN_MINUTE) {
      return '刚刚';
    }
    if (diffMinutes < RELATIVE_MINUTES_IN_HOUR) {
      return `${diffMinutes}分钟前`;
    }
    if (diffHours < RELATIVE_HOURS_IN_DAY) {
      return `${diffHours}小时前`;
    }
    if (diffDays < RELATIVE_DAYS_IN_WEEK) {
      return `${diffDays}天前`;
    }
    if (diffWeeks < RELATIVE_WEEKS_IN_MONTH) {
      return `${diffWeeks}周前`;
    }
    if (diffMonths < RELATIVE_MONTHS_IN_YEAR) {
      return `${diffMonths}个月前`;
    }
    return `${diffYears}年前`;
  }

  /**
   * Format absolute time.
   */
  formatAbsoluteTime(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(DATE_PAD_LENGTH, '0');
    const day = date.getDate().toString().padStart(DATE_PAD_LENGTH, '0');
    const hours = date.getHours().toString().padStart(DATE_PAD_LENGTH, '0');
    const minutes = date.getMinutes().toString().padStart(DATE_PAD_LENGTH, '0');
    const seconds = date.getSeconds().toString().padStart(DATE_PAD_LENGTH, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Format stats summary.
   */
  formatStatsSummary(stats?: SessionStats): string {
    if (!stats) {
      return '(0 条消息, 0 tokens, $0)';
    }

    const totalTokens = stats.totalInputTokens + stats.totalOutputTokens;
    let tokensDisplay: string;

    if (totalTokens >= TOKENS_IN_K) {
      const tokensInK = totalTokens / TOKENS_IN_K;
      tokensDisplay =
        tokensInK % 1 === 0 ? `${tokensInK}k` : `${tokensInK.toFixed(TOKENS_K_DECIMALS)}k`;
    } else {
      tokensDisplay = totalTokens.toString();
    }

    const costDisplay =
      stats.totalCostUsd >= COST_DISPLAY_THRESHOLD
        ? `$${stats.totalCostUsd.toFixed(COST_DECIMALS)}`
        : '$0';

    return `(${stats.messageCount} 条消息, ${tokensDisplay} tokens, ${costDisplay})`;
  }

  /**
   * Get permission emoji.
   */
  private getPermissionEmoji(): string {
    return PERMISSION_MODE_EMOJIS[this.currentPermissionMode];
  }

  /**
   * Input prompt.
   */
  private prompt(): Promise<string | null> {
    const promptStr = `${this.colorize('> ', 'cyan')}${this.getPermissionEmoji()} `;
    return this.promptRaw(promptStr);
  }

  /**
   * Readline prompt with custom string.
   */
  private promptRaw(promptStr: string): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.rl || !this.isRunning) {
        resolve(null);
        return;
      }

      if (this.pendingPromptResolver) {
        this.cancelPendingPrompt('');
      }

      const promptId = ++this.pendingPromptId;
      const closeHandler = () => {
        this.clearPendingPrompt();
        resolve(null);
      };

      this.activePromptId = promptId;
      this.pendingPromptResolver = resolve;
      this.pendingPromptCloseHandler = closeHandler;
      this.rl.once('close', closeHandler);
      this.rl.question(promptStr, (answer) => {
        this.rl?.removeListener('close', closeHandler);
        const isCanceled =
          this.canceledPromptIds.has(promptId) || this.activePromptId !== promptId;
        if (isCanceled) {
          this.canceledPromptIds.delete(promptId);
          this.clearPendingPrompt();
          return;
        }
        this.clearPendingPrompt();
        resolve(answer);
      });
    });
  }

  private cancelPendingPrompt(value: string): void {
    if (!this.pendingPromptResolver) {
      return;
    }

    if (this.activePromptId !== null) {
      this.canceledPromptIds.add(this.activePromptId);
    }
    if (this.rl && this.pendingPromptCloseHandler) {
      this.rl.removeListener('close', this.pendingPromptCloseHandler);
    }

    const resolve = this.pendingPromptResolver;
    this.clearPendingPrompt();
    resolve(value);
    this.rl?.write('\n');
  }

  private clearPendingPrompt(): void {
    this.pendingPromptResolver = null;
    this.pendingPromptCloseHandler = null;
    this.activePromptId = null;
  }

  private suspendInputLoop(): void {
    if (this.inputSuspended) {
      return;
    }

    this.inputSuspended = true;
    this.cancelPendingPrompt('');

    if (!this.resumeInputPromise) {
      this.resumeInputPromise = new Promise((resolve) => {
        this.resumeInputResolver = resolve;
      });
    }
  }

  private resumeInputLoop(): void {
    if (!this.inputSuspended) {
      return;
    }

    this.inputSuspended = false;
    if (this.resumeInputResolver) {
      this.resumeInputResolver();
    }
    this.resumeInputPromise = null;
    this.resumeInputResolver = null;
  }

  private async waitForInputResume(): Promise<void> {
    if (!this.resumeInputPromise) {
      return;
    }
    await this.resumeInputPromise;
  }

  /**
   * Display welcome message.
   */
  private displayWelcome(): void {
    this.writeLine('');
    this.writeLine(this.colorize('╔════════════════════════════════════════╗', 'cyan'));
    this.writeLine(this.colorize('║     Claude Code Replica - 交互模式     ║', 'cyan'));
    this.writeLine(this.colorize('╚════════════════════════════════════════╝', 'cyan'));
    this.writeLine('');
    this.writeLine(this.colorize('提示:', 'bold'));
    this.writeLine('  • 输入消息与 Claude 对话');
    this.writeLine('  • 按 Esc 中断当前操作');
    this.writeLine('  • 按 Esc + Esc 打开回退菜单');
    this.writeLine('  • 按 Shift+Tab 切换权限模式');
    this.writeLine('  • 输入 /help 查看可用命令');
    this.writeLine('  • 按 Ctrl+C 退出');
    this.writeLine('');
  }

  /**
   * Cycle permission mode.
   */
  private cyclePermissionMode(): PermissionMode {
    const modes: PermissionMode[] = ['default', 'acceptEdits', 'bypassPermissions', 'plan'];
    const currentIndex = modes.indexOf(this.currentPermissionMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    const newMode = modes[nextIndex];
    this.currentPermissionMode = newMode;
    if (this.onPermissionModeChange) {
      this.onPermissionModeChange(newMode);
    }
    return newMode;
  }

  /**
   * Get message prefix.
   */
  private getMessagePrefix(role: MessageRole): string {
    switch (role) {
      case 'user':
        return this.colorize('>', 'cyan');
      case 'assistant':
        return this.colorize('⏺', 'blue');
      case 'system':
        return this.colorize('⚙️', 'gray');
      default:
        return '';
    }
  }

  /**
   * Get role color.
   */
  private getRoleColor(role: MessageRole): keyof typeof COLORS {
    switch (role) {
      case 'user':
        return 'green';
      case 'assistant':
        return 'white';
      case 'system':
        return 'gray';
      default:
        return 'white';
    }
  }

  /**
   * Format time for menu displays.
   */
  private formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(DATE_PAD_LENGTH, '0');
    const minutes = date.getMinutes().toString().padStart(DATE_PAD_LENGTH, '0');
    const seconds = date.getSeconds().toString().padStart(DATE_PAD_LENGTH, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * Apply color to output.
   */
  private colorize(text: string, color: keyof typeof COLORS): string {
    if (!this.enableColors) {
      return text;
    }
    return `${COLORS[color]}${text}${COLORS.reset}`;
  }

  /**
   * Write raw output.
   */
  private write(text: string): void {
    this.output.write(text);
  }

  /**
   * Write a line of output.
   */
  private writeLine(text: string): void {
    this.output.write(text + '\n');
  }

  /**
   * Clear the current line.
   */
  private clearLine(): void {
    if (this.output === process.stdout && process.stdout.isTTY) {
      process.stdout.clearLine(CLEAR_LINE_DIRECTION);
    }
  }
}
