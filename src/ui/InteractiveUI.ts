/**
 * 文件功能：交互式 UI 组件，负责处理用户交互、消息显示、进度指示和回退功能
 *
 * 核心类：
 * - InteractiveUI: 交互式 UI 核心类
 *
 * 核心方法：
 * - start(): 启动交互式 UI
 * - stop(): 停止交互式 UI
 * - displayMessage(): 显示消息到终端
 * - promptConfirmation(): 提示用户确认
 * - showRewindMenu(): 显示回退菜单
 * - showSessionMenu(): 显示会话菜单
 */

import * as readline from 'readline';
import { EventEmitter } from 'events';
import { Session, SessionStats } from '../core/SessionManager';

/**
 * 快照接口（用于回退功能）
 */
export interface Snapshot {
  id: string;
  timestamp: Date;
  description: string;
  files: string[];
}

/**
 * 权限模式类型
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

/**
 * 交互式 UI 选项
 */
export interface InteractiveUIOptions {
  /** 消息处理回调 */
  onMessage: (message: string) => Promise<void>;
  /** 命令处理回调 - 处理以 / 开头的命令 */
  onCommand: (command: string) => Promise<void>;
  /** 中断回调 */
  onInterrupt: () => void;
  /** 回退回调 */
  onRewind: () => Promise<void>;
  /** 权限模式变更回调 */
  onPermissionModeChange?: (mode: PermissionMode) => void | Promise<void>;
  /** 消息队列回调 - 当正在处理消息时，新消息通过此回调进入队列 */
  onQueueMessage?: (message: string) => void;
  /** 输入流（默认 stdin） */
  input?: NodeJS.ReadableStream;
  /** 输出流（默认 stdout） */
  output?: NodeJS.WritableStream;
  /** 是否启用颜色输出 */
  enableColors?: boolean;
}

/**
 * 消息角色类型
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * 选择菜单项
 */
export interface MenuItem {
  label: string;
  value: string;
  description?: string;
}

/**
 * ANSI 颜色代码
 */
const Colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  // 前景色
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // 背景色
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

/**
 * 权限模式颜色映射
 */
const PermissionModeColors: Record<PermissionMode, keyof typeof Colors> = {
  default: 'green',
  acceptEdits: 'yellow',
  bypassPermissions: 'red',
  plan: 'blue',
};

/**
 * 权限模式显示名称映射
 */
const PermissionModeLabels: Record<PermissionMode, string> = {
  default: 'De' + 'fault',
  acceptEdits: 'Accept Edits',
  bypassPermissions: 'Bypass Permissions',
  plan: 'Plan Mode',
};

/**
 * 权限模式 emoji 映射
 */
const PermissionModeEmojis: Record<PermissionMode, string> = {
  default: '🟢',
  acceptEdits: '🟡',
  bypassPermissions: '🔴',
  plan: '🔵',
};

/**
 * 交互式 UI 类
 *
 * 提供完整的终端交互功能：
 * - 启动和停止交互式会话
 * - 显示用户和助手消息
 * - 显示工具调用信息
 * - 显示进度指示器
 * - 请求用户确认
 * - 显示回退菜单
 * - Esc 键中断功能
 * - Esc + Esc 打开回退菜单
 * - Shift+Tab 切换权限模式
 */
export class InteractiveUI extends EventEmitter {
  private readonly onMessage: (message: string) => Promise<void>;
  private readonly onCommand: (command: string) => Promise<void>;
  private readonly onInterrupt: () => void;
  private readonly onRewind: () => Promise<void>;
  private readonly onPermissionModeChange?: (mode: PermissionMode) => void | Promise<void>;
  private readonly onQueueMessage?: (message: string) => void;
  private readonly input: NodeJS.ReadableStream;
  private readonly output: NodeJS.WritableStream;
  private readonly enableColors: boolean;

  private rl: readline.Interface | null = null;
  private isRunning = false;
  /** 标识是否正在处理消息（用于非阻塞输入） */
  private isProcessingMessage = false;
  private lastEscTime = 0;
  private progressInterval: NodeJS.Timeout | null = null;
  private currentPermissionMode: PermissionMode = 'default';

  /** Esc 双击检测时间窗口（毫秒） */
  private static readonly ESC_DOUBLE_PRESS_WINDOW = 300;

  /** Shift+Tab 键序列检测缓冲区 */
  private shiftTabBuffer: string = '';

  constructor(options: InteractiveUIOptions) {
    super();
    this.onMessage = options.onMessage;
    this.onCommand = options.onCommand;
    this.onInterrupt = options.onInterrupt;
    this.onRewind = options.onRewind;
    this.onPermissionModeChange = options.onPermissionModeChange;
    this.onQueueMessage = options.onQueueMessage;
    this.input = options.input || process.stdin;
    this.output = options.output || process.stdout;
    this.enableColors = options.enableColors ?? true;
  }

  /**
   * 启动交互式会话
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // 创建 readline 接口
    this.rl = readline.createInterface({
      input: this.input,
      output: this.output,
      terminal: true,
    });

    // 检查当前输入流是否为标准输入流，检查标准输入是否连接到一个 TTY（终端）设备，如果上述条件都满足，则启用原始模式。
    // 设置原始模式以捕获 Esc 键
    if (this.input === process.stdin && process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    // 监听按键事件
    this.setupKeyListener();

    // 显示欢迎信息
    this.displayWelcome();

    // 开始输入循环
    await this.inputLoop();
  }

  /**
   * 停止交互式会话
   */
  stop(): void {
    this.isRunning = false;

    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    // 恢复终端模式
    if (this.input === process.stdin && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    this.emit('stop');
  }

  /**
   * 显示消息
   *
   * @param message - 消息内容
   * @param role - 消息角色
   */
  displayMessage(message: string, role: MessageRole): void {
    const prefix = this.getMessagePrefix(role);
    const coloredMessage = this.colorize(message, this.getRoleColor(role));

    this.writeLine(`${prefix} ${coloredMessage}`);
  }

  /**
   * 显示工具调用信息
   *
   * Claude Code 风格：⏺ ToolName(key: value, ...)
   *
   * @param tool - 工具名称
   * @param args - 工具参数
   */
  displayToolUse(tool: string, args: Record<string, unknown>): void {
    const icon = this.colorize('⏺', 'cyan');
    const toolName = this.colorize(tool, 'bold');

    // 格式化参数为简洁的 key: value 形式
    const argPairs = Object.entries(args)
      .map(([key, value]) => {
        const displayValue =
          typeof value === 'string'
            ? `"${value.length > 30 ? value.slice(0, 30) + '...' : value}"`
            : JSON.stringify(value);
        return `${key}: ${displayValue}`;
      })
      .join(', ');

    const argsDisplay = argPairs ? `(${argPairs})` : '';
    this.writeLine(`${icon} ${toolName}${this.colorize(argsDisplay, 'gray')}`);
  }

  /**
   * 显示工具执行结果
   *
   * Claude Code 风格：  ⎿  结果摘要
   *
   * @param tool - 工具名称（用于日志，不显示）
   * @param result - 执行结果（截取前 200 字符）
   * @param isError - 是否为错误结果
   */
  displayToolResult(tool: string, result: string, isError = false): void {
    const resultIcon = isError ? '⎿' : '⎿';
    const color = isError ? 'red' : 'gray';

    // 截取结果显示（简洁摘要）
    const maxLength = 200;
    const firstLine = result.split('\n')[0];
    const displayResult =
      firstLine.length > maxLength ? firstLine.slice(0, maxLength) + '...' : firstLine;

    if (displayResult.trim()) {
      this.writeLine(`  ${resultIcon}  ${this.colorize(displayResult.trim(), color)}`);
    }

    // 记录完整结果供调试（不显示）
    void tool; // 避免未使用警告
  }

  /**
   * 显示 Thinking 状态
   *
   * Claude Code 风格：∴ Thinking…
   * 可选显示思考内容摘要
   *
   * @param content - 可选的思考内容摘要
   */
  displayThinking(content?: string): void {
    const icon = this.colorize('∴', 'magenta');
    const label = this.colorize('Thinking…', 'magenta');

    this.writeLine(`${icon} ${label}`);

    if (content && content.trim()) {
      // 显示思考内容摘要（缩进，最多 3 行）
      const lines = content.trim().split('\n').slice(0, 3);
      for (const line of lines) {
        const displayLine = line.length > 100 ? line.slice(0, 100) + '...' : line;
        this.writeLine(`  ${this.colorize(displayLine, 'gray')}`);
      }
    }
  }

  /**
   * 显示 Computing 状态（带动画）
   *
   * Claude Code 风格：● Computing… (esc to interrupt)
   * 表示 agent 正在处理用户请求
   */
  displayComputing(): void {
    // 清除之前的进度
    this.clearProgress();

    const frames = ['●', '○'];
    let frameIndex = 0;

    // 首先显示初始状态
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
    }, 500);
  }

  /**
   * 停止 Computing 状态显示
   */
  stopComputing(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
      this.clearLine();
      this.write('\r'); // 清除 Computing 文本
    }
  }

  /**
   * 设置消息处理状态
   *
   * 供外部（如 Application）在使用 StreamingQueryManager 时同步状态
   *
   * @param processing - 是否正在处理消息
   */
  setProcessingState(processing: boolean): void {
    this.isProcessingMessage = processing;
  }

  /**
   * 清除进度指示器
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
   * 请求用户确认
   *
   * @param message - 确认消息
   * @returns 用户是否确认
   */
  async promptConfirmation(message: string): Promise<boolean> {
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
   * 显示回退菜单
   *
   * @param snapshots - 可用的快照列表
   * @returns 选中的快照，如果取消则返回 null
   */
  async showRewindMenu(snapshots: Snapshot[]): Promise<Snapshot | null> {
    if (snapshots.length === 0) {
      this.writeLine(this.colorize('没有可用的回退点', 'yellow'));
      return null;
    }

    this.writeLine('');
    this.writeLine(this.colorize('═══ 回退菜单 ═══', 'bold'));
    this.writeLine(this.colorize('选择要回退到的时间点 (输入 0 取消):', 'gray'));
    this.writeLine('');

    // 显示快照列表
    snapshots.forEach((snapshot, index) => {
      const timeStr = this.formatTime(snapshot.timestamp);
      const filesCount = snapshot.files.length;
      const filesInfo = filesCount > 0 ? `(${filesCount} 个文件)` : '';

      this.writeLine(
        `  ${this.colorize(`[${index + 1}]`, 'cyan')} ${timeStr} - ${snapshot.description} ${this.colorize(filesInfo, 'gray')}`
      );
    });

    this.writeLine('');

    // 使用 readline（生产环境）或 raw listener（测试环境）
    if (this.rl) {
      // 生产环境：使用 readline 统一输入处理
      while (true) {
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
        } else if (!isNaN(num) && num >= 1 && num <= snapshots.length) {
          const selected = snapshots[num - 1];
          this.writeLine(this.colorize(`✓ 已选择: ${selected.description}`, 'green'));
          return selected;
        } else {
          this.writeLine(this.colorize('✗ 无效选择，请重试', 'red'));
        }
      }
    } else {
      // 测试环境：使用 raw listener（回退到旧实现）
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
            this.writeLine(this.colorize('✗ 无效选择，请重试', 'red'));
            this.write(prompt);
          }
        };

        this.input.on('data', handleInput);
      });
    }
  }

  /**
   * 显示会话菜单
   *
   * @param sessions - 可用的会话列表
   * @returns 选中的会话，如果取消则返回 null
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

    // 显示会话列表
    sessions.forEach((session, index) => {
      const sessionIdShort = session.id.substring(0, 8);
      const relativeTime = this.formatRelativeTime(session.lastAccessedAt);
      const absoluteTime = this.formatAbsoluteTime(session.lastAccessedAt);
      const statsSummary = this.formatStatsSummary(session.stats);
      const forkIndicator = session.parentSessionId ? '🔀 ' : '';

      this.writeLine(
        `  ${this.colorize(`[${index + 1}]`, 'cyan')} ${forkIndicator}${this.colorize(sessionIdShort, 'bold')} - ${relativeTime} (${absoluteTime}) - ${statsSummary}`
      );

      // 显示消息预览
      if (session.stats?.lastMessagePreview) {
        const preview =
          session.stats.lastMessagePreview.length > 60
            ? session.stats.lastMessagePreview.substring(0, 60) + '...'
            : session.stats.lastMessagePreview;
        this.writeLine(`      ${this.colorize(preview, 'gray')}`);
      }
    });

    this.writeLine('');

    // 使用 readline（生产环境）或 raw listener（测试环境）
    if (this.rl) {
      // 生产环境：使用 readline 统一输入处理
      while (true) {
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
        } else if (!isNaN(num) && num >= 1 && num <= sessions.length) {
          const selected = sessions[num - 1];
          const sessionIdShort = selected.id.substring(0, 8);
          this.writeLine(this.colorize(`✓ 已选择会话: ${sessionIdShort}`, 'green'));
          return selected;
        } else {
          this.writeLine(this.colorize('✗ 无效选择，请重试', 'red'));
        }
      }
    } else {
      // 测试环境：使用 raw listener（回退到旧实现）
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
            const sessionIdShort = selected.id.substring(0, 8);
            this.writeLine(this.colorize(`✓ 已选择会话: ${sessionIdShort}`, 'green'));
            this.input.removeListener('data', handleInput);
            resolve(selected);
          } else {
            this.writeLine(this.colorize('✗ 无效选择，请重试', 'red'));
            this.write(prompt);
          }
        };

        this.input.on('data', handleInput);
      });
    }
  }

  /**
   * 显示确认菜单
   *
   * @param title - 菜单标题
   * @param options - 选项列表
   * @param defaultKey - 默认选择的键
   * @returns 选择的键
   */
  async showConfirmationMenu(
    title: string,
    options: Array<{ key: string; label: string; description?: string }>,
    defaultKey?: string
  ): Promise<boolean> {
    this.writeLine('');
    this.writeLine(this.colorize(`═══ ${title} ═══`, 'bold'));
    this.writeLine('');

    // 显示选项
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

    // 使用 readline（生产环境）或 raw listener（测试环境）
    if (this.rl) {
      while (true) {
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
        } else if (defaultKey && trimmed === '') {
          return defaultKey === 'n' || defaultKey === 'N';
        } else {
          this.writeLine(this.colorize('✗ 无效选择，请重试', 'red'));
        }
      }
    } else {
      // 测试环境：使用 raw listener
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
              this.colorize(
                `✓ 已选择: ${options.find((o) => o.key === defaultKey)?.label}`,
                'green'
              )
            );
            this.input.removeListener('data', handleInput);
            resolve(defaultKey === 'n' || defaultKey === 'N');
          } else {
            this.writeLine(this.colorize('✗ 无效选择，请重试', 'red'));
            this.write(prompt);
          }
        };

        this.input.on('data', handleInput);
      });
    }
  }

  /**
   * 设置初始权限模式
   *
   * @param mode - 初始权限模式
   */
  setInitialPermissionMode(mode: PermissionMode): void {
    this.currentPermissionMode = mode;
  }

  /**
   * 运行时设置权限模式（带通知）
   *
   * @param mode - 新的权限模式
   */
  setPermissionMode(mode: PermissionMode): void {
    this.currentPermissionMode = mode;

    // 显示切换通知
    const label = PermissionModeLabels[mode];
    const emoji = PermissionModeEmojis[mode];
    this.displayInfo(`Switched to: ${emoji} ${label}`);
  }

  /**
   * 设置按键监听器
   */
  private setupKeyListener(): void {
    if (this.input !== process.stdin) {
      return;
    }

    this.input.on('data', (key: Buffer) => {
      const keyStr = key.toString();

      // 累积键序列以检测 Shift+Tab
      this.shiftTabBuffer += keyStr;

      // 检测 Shift+Tab 键序列 (\x1b[Z)
      if (this.shiftTabBuffer.endsWith('\x1b[Z')) {
        const newMode = this.cyclePermissionMode();
        const label = PermissionModeLabels[newMode];
        const color = PermissionModeColors[newMode];
        const emoji = PermissionModeEmojis[newMode];

        // 显示模式切换通知
        this.writeLine('');
        this.writeLine(this.colorize(`ℹ️ Switched to: ${emoji} ${label}`, color));

        // 重置缓冲区
        this.shiftTabBuffer = '';
        return;
      }

      // 如果缓冲区过长，清空它
      if (this.shiftTabBuffer.length > 10) {
        this.shiftTabBuffer = '';
      }

      // 检测 Esc 键
      if (keyStr === '\x1b') {
        const now = Date.now();

        if (now - this.lastEscTime < InteractiveUI.ESC_DOUBLE_PRESS_WINDOW) {
          // 双击 Esc - 打开回退菜单
          this.lastEscTime = 0;
          this.emit('rewind');
          this.onRewind().catch((err) => {
            this.displayError(`Rewind failed: ${err.message}`);
          });
        } else {
          // 单击 Esc - 中断当前操作
          this.lastEscTime = now;
          this.emit('interrupt');
          this.onInterrupt();
        }
      }

      // Ctrl+C 退出
      if (keyStr === '\x03') {
        this.stop();
        process.exit(0);
      }
    });
  }

  /**
   * 输入循环
   *
   * 支持非阻塞消息处理：当正在处理消息时，新输入通过 onQueueMessage 回调进入队列
   */
  private async inputLoop(): Promise<void> {
    while (this.isRunning && this.rl) {
      try {
        const input = await this.prompt();

        if (input === null) {
          // EOF 或关闭
          break;
        }

        const trimmedInput = input.trim();

        if (trimmedInput.length === 0) {
          // 空输入，直接继续等待
          continue;
        }

        // 处理特殊命令（命令总是立即处理，不进入队列）
        if (trimmedInput.startsWith('/')) {
          await this.onCommand(trimmedInput);
          continue;
        }

        // 非阻塞消息处理
        if (this.isProcessingMessage && this.onQueueMessage) {
          // 正在处理中，新消息加入队列
          this.onQueueMessage(trimmedInput);
        } else {
          // 开始处理新消息（非阻塞调用）
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
   * 获取权限模式对应的 emoji
   */
  private getPermissionEmoji(): string {
    return PermissionModeEmojis[this.currentPermissionMode];
  }

  /**
   * 获取用户输入
   *
   * 简洁的输入提示，分隔线由外部控制显示
   */
  private prompt(): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.rl || !this.isRunning) {
        resolve(null);
        return;
      }

      const emoji = this.getPermissionEmoji();
      const promptStr = `${this.colorize('> ', 'cyan')}${emoji} `;

      // 使用一次性监听器，避免内存泄漏
      const closeHandler = () => {
        resolve(null);
      };

      this.rl.once('close', closeHandler);

      this.rl.question(promptStr, (answer) => {
        // 移除 close 监听器，避免累积
        this.rl?.removeListener('close', closeHandler);
        resolve(answer);
      });
    });
  }

  /**
   * 使用 readline 获取原始输入
   *
   * 类似于 prompt()，但允许自定义提示字符串。
   * 用于菜单和确认对话框等需要特殊提示的场景。
   *
   * @param promptStr - 提示字符串
   * @returns 用户输入，如果关闭则返回 null
   */
  private promptRaw(promptStr: string): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.rl || !this.isRunning) {
        resolve(null);
        return;
      }

      const closeHandler = () => {
        resolve(null);
      };

      this.rl.once('close', closeHandler);

      this.rl.question(promptStr, (answer) => {
        this.rl?.removeListener('close', closeHandler);
        resolve(answer);
      });
    });
  }

  /**
   * 显示欢迎信息
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
   * 显示错误信息
   */
  displayError(message: string): void {
    this.writeLine(`${this.colorize('❌ 错误:', 'red')} ${message}`);
  }

  /**
   * 显示警告信息
   */
  displayWarning(message: string): void {
    this.writeLine(`${this.colorize('⚠️ 警告:', 'yellow')} ${message}`);
  }

  /**
   * 显示成功信息
   */
  displaySuccess(message: string): void {
    this.writeLine(`${this.colorize('✅ 成功:', 'green')} ${message}`);
  }

  /**
   * 显示信息
   */
  displayInfo(message: string): void {
    this.writeLine(`${this.colorize('ℹ️ 信息:', 'blue')} ${message}`);
  }

  /**
   * 显示权限模式状态
   *
   * @param mode - 权限模式
   */
  displayPermissionStatus(mode: PermissionMode): void {
    this.currentPermissionMode = mode;
    const color = PermissionModeColors[mode];
    const label = PermissionModeLabels[mode];

    const statusLine = `Permission Mode: ${this.colorize(`[${label}]`, color)}`;
    this.writeLine(statusLine);
  }

  /**
   * 循环切换权限模式
   *
   * @returns 新的权限模式
   */
  private cyclePermissionMode(): PermissionMode {
    const modes: PermissionMode[] = ['default', 'acceptEdits', 'bypassPermissions', 'plan'];
    const currentIndex = modes.indexOf(this.currentPermissionMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    const newMode = modes[nextIndex];

    // 更新当前权限模式
    this.currentPermissionMode = newMode;

    // 调用回调通知模式变更
    if (this.onPermissionModeChange) {
      this.onPermissionModeChange(newMode);
    }

    return newMode;
  }

  /**
   * 获取消息前缀
   *
   * 使用 Claude Code 风格的符号：
   * - 用户: >
   * - Assistant: ⏺
   * - 系统: ⚙️
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
   * 获取角色颜色
   */
  private getRoleColor(role: MessageRole): keyof typeof Colors {
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
   * 格式化时间（相对时间）
   *
   * @param date - 要格式化的日期
   * @returns 相对时间字符串，如 "X小时前", "X天前"
   */
  formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSeconds < 60) {
      return '刚刚';
    } else if (diffMinutes < 60) {
      return `${diffMinutes}分钟前`;
    } else if (diffHours < 24) {
      return `${diffHours}小时前`;
    } else if (diffDays < 7) {
      return `${diffDays}天前`;
    } else if (diffWeeks < 4) {
      return `${diffWeeks}周前`;
    } else if (diffMonths < 12) {
      return `${diffMonths}个月前`;
    } else {
      return `${diffYears}年前`;
    }
  }

  /**
   * 格式化时间（绝对时间）
   *
   * @param date - 要格式化的日期
   * @returns 绝对时间字符串，格式为 "YYYY-MM-DD HH:mm:ss"
   */
  formatAbsoluteTime(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * 格式化统计摘要
   *
   * @param stats - 会话统计信息
   * @returns 统计摘要字符串，格式为 "(X 条消息, Xk tokens, $X)"
   */
  formatStatsSummary(stats?: SessionStats): string {
    if (!stats) {
      return '(0 条消息, 0 tokens, $0)';
    }

    const totalTokens = stats.totalInputTokens + stats.totalOutputTokens;
    let tokensDisplay: string;

    if (totalTokens >= 1000) {
      const tokensInK = totalTokens / 1000;
      // 只有在小数部分不为0时才显示小数
      if (tokensInK % 1 === 0) {
        tokensDisplay = `${tokensInK}k`;
      } else {
        tokensDisplay = `${tokensInK.toFixed(1)}k`;
      }
    } else {
      tokensDisplay = totalTokens.toString();
    }

    const costDisplay = stats.totalCostUsd >= 0.01 ? `$${stats.totalCostUsd.toFixed(3)}` : '$0';

    return `(${stats.messageCount} 条消息, ${tokensDisplay} tokens, ${costDisplay})`;
  }

  /**
   * 格式化时间
   */
  private formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * 应用颜色
   */
  private colorize(text: string, color: keyof typeof Colors): string {
    if (!this.enableColors) {
      return text;
    }
    return `${Colors[color]}${text}${Colors.reset}`;
  }

  /**
   * 写入输出
   */
  private write(text: string): void {
    (this.output as NodeJS.WritableStream).write(text);
  }

  /**
   * 写入一行
   */
  private writeLine(text: string): void {
    (this.output as NodeJS.WritableStream).write(text + '\n');
  }

  /**
   * 清除当前行
   */
  private clearLine(): void {
    if (this.output === process.stdout && process.stdout.isTTY) {
      process.stdout.clearLine(0);
    }
  }
}
