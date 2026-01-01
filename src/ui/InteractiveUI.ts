/**
 * 交互式 UI 组件
 *
 * 负责处理用户交互、消息显示、工具调用显示、进度指示和回退功能
 * 支持 Esc 键中断和 Esc + Esc 打开回退菜单
 *
 * @module InteractiveUI
 * **验证: 需求 1.4, 1.5, 1.6, 15.2, 27.1, 27.2, 27.3, 27.4, 27.5**
 */

import * as readline from 'readline';
import { EventEmitter } from 'events';

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
 * 交互式 UI 选项
 */
export interface InteractiveUIOptions {
  /** 消息处理回调 */
  onMessage: (message: string) => Promise<void>;
  /** 中断回调 */
  onInterrupt: () => void;
  /** 回退回调 */
  onRewind: () => Promise<void>;
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
 * 进度状态类型
 */
export type ProgressStatus = 'running' | 'success' | 'error' | 'warning';

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
 */
export class InteractiveUI extends EventEmitter {
  private readonly onMessage: (message: string) => Promise<void>;
  private readonly onInterrupt: () => void;
  private readonly onRewind: () => Promise<void>;
  private readonly input: NodeJS.ReadableStream;
  private readonly output: NodeJS.WritableStream;
  private readonly enableColors: boolean;

  private rl: readline.Interface | null = null;
  private isRunning = false;
  private lastEscTime = 0;
  private progressInterval: NodeJS.Timeout | null = null;

  /** Esc 双击检测时间窗口（毫秒） */
  private static readonly ESC_DOUBLE_PRESS_WINDOW = 300;

  constructor(options: InteractiveUIOptions) {
    super();
    this.onMessage = options.onMessage;
    this.onInterrupt = options.onInterrupt;
    this.onRewind = options.onRewind;
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
   * @param tool - 工具名称
   * @param args - 工具参数
   */
  displayToolUse(tool: string, args: Record<string, unknown>): void {
    const toolIcon = '🔧';
    const toolName = this.colorize(tool, 'cyan');
    
    this.writeLine('');
    this.writeLine(`${toolIcon} ${this.colorize('工具调用:', 'bold')} ${toolName}`);
    
    if (Object.keys(args).length > 0) {
      const argsStr = JSON.stringify(args, null, 2);
      const indentedArgs = argsStr.split('\n').map(line => `   ${line}`).join('\n');
      this.writeLine(this.colorize(indentedArgs, 'gray'));
    }
  }

  /**
   * 显示进度指示器
   *
   * @param message - 进度消息
   * @param status - 进度状态
   */
  displayProgress(message: string, status: ProgressStatus = 'running'): void {
    // 清除之前的进度
    this.clearProgress();

    if (status === 'running') {
      const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      let frameIndex = 0;

      this.progressInterval = setInterval(() => {
        const frame = frames[frameIndex % frames.length];
        this.clearLine();
        this.write(`\r${this.colorize(frame, 'cyan')} ${message}`);
        frameIndex++;
      }, 80);
    } else {
      const icon = this.getStatusIcon(status);
      const color = this.getStatusColor(status);
      this.writeLine(`${icon} ${this.colorize(message, color)}`);
    }
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
      const prompt = `${this.colorize('?', 'yellow')} ${message} ${this.colorize('(y/n)', 'gray')} `;
      
      this.write(prompt);

      const handleKey = (key: Buffer) => {
        const char = key.toString().toLowerCase();
        
        if (char === 'y' || char === '\r' || char === '\n') {
          this.writeLine(this.colorize('是', 'green'));
          this.input.removeListener('data', handleKey);
          resolve(true);
        } else if (char === 'n' || char === '\x1b') {
          this.writeLine(this.colorize('否', 'red'));
          this.input.removeListener('data', handleKey);
          resolve(false);
        }
      };

      this.input.on('data', handleKey);
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
    this.writeLine(this.colorize('选择要回退到的时间点:', 'gray'));
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
    this.writeLine(this.colorize('  [0] 取消', 'gray'));
    this.writeLine('');

    return new Promise((resolve) => {
      const prompt = `${this.colorize('?', 'yellow')} 请选择 (0-${snapshots.length}): `;
      this.write(prompt);

      const handleInput = (data: Buffer) => {
        const input = data.toString().trim();
        const num = parseInt(input, 10);

        if (input === '0' || input === '\x1b') {
          this.writeLine(this.colorize('已取消', 'gray'));
          this.input.removeListener('data', handleInput);
          resolve(null);
        } else if (!isNaN(num) && num >= 1 && num <= snapshots.length) {
          const selected = snapshots[num - 1];
          this.writeLine(this.colorize(`已选择: ${selected.description}`, 'green'));
          this.input.removeListener('data', handleInput);
          resolve(selected);
        } else {
          this.writeLine(this.colorize('无效选择，请重试', 'red'));
          this.write(prompt);
        }
      };

      this.input.on('data', handleInput);
    });
  }

  /**
   * 显示选择菜单
   *
   * @param title - 菜单标题
   * @param items - 菜单项
   * @returns 选中的值，如果取消则返回 null
   */
  async showSelectMenu(title: string, items: MenuItem[]): Promise<string | null> {
    this.writeLine('');
    this.writeLine(this.colorize(title, 'bold'));
    this.writeLine('');

    items.forEach((item, index) => {
      const desc = item.description ? ` - ${this.colorize(item.description, 'gray')}` : '';
      this.writeLine(`  ${this.colorize(`[${index + 1}]`, 'cyan')} ${item.label}${desc}`);
    });

    this.writeLine('');
    this.writeLine(this.colorize('  [0] 取消', 'gray'));
    this.writeLine('');

    return new Promise((resolve) => {
      const prompt = `${this.colorize('?', 'yellow')} 请选择 (0-${items.length}): `;
      this.write(prompt);

      const handleInput = (data: Buffer) => {
        const input = data.toString().trim();
        const num = parseInt(input, 10);

        if (input === '0' || input === '\x1b') {
          this.writeLine(this.colorize('已取消', 'gray'));
          this.input.removeListener('data', handleInput);
          resolve(null);
        } else if (!isNaN(num) && num >= 1 && num <= items.length) {
          const selected = items[num - 1];
          this.writeLine(this.colorize(`已选择: ${selected.label}`, 'green'));
          this.input.removeListener('data', handleInput);
          resolve(selected.value);
        } else {
          this.writeLine(this.colorize('无效选择，请重试', 'red'));
          this.write(prompt);
        }
      };

      this.input.on('data', handleInput);
    });
  }

  /**
   * 显示代码差异
   *
   * @param diff - 差异内容
   */
  displayDiff(diff: string): void {
    const lines = diff.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        this.writeLine(this.colorize(line, 'green'));
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        this.writeLine(this.colorize(line, 'red'));
      } else if (line.startsWith('@@')) {
        this.writeLine(this.colorize(line, 'cyan'));
      } else {
        this.writeLine(line);
      }
    }
  }

  /**
   * 显示分页内容
   *
   * @param content - 内容
   * @param pageSize - 每页行数
   */
  async displayPaged(content: string, pageSize = 20): Promise<void> {
    const lines = content.split('\n');
    let currentLine = 0;

    while (currentLine < lines.length) {
      const pageLines = lines.slice(currentLine, currentLine + pageSize);
      this.writeLine(pageLines.join('\n'));
      currentLine += pageSize;

      if (currentLine < lines.length) {
        const remaining = lines.length - currentLine;
        const continuePrompt = await this.promptConfirmation(
          `还有 ${remaining} 行，继续显示?`
        );
        
        if (!continuePrompt) {
          break;
        }
      }
    }
  }


  /**
   * 检查是否正在运行
   */
  isActive(): boolean {
    return this.isRunning;
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

      // 检测 Esc 键
      if (keyStr === '\x1b') {
        const now = Date.now();
        
        if (now - this.lastEscTime < InteractiveUI.ESC_DOUBLE_PRESS_WINDOW) {
          // 双击 Esc - 打开回退菜单
          this.lastEscTime = 0;
          this.emit('rewind');
          this.onRewind().catch(err => {
            this.displayError(`回退失败: ${err.message}`);
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
          continue;
        }

        // 处理特殊命令
        if (trimmedInput.startsWith('/')) {
          this.emit('command', trimmedInput);
          continue;
        }

        // 发送消息
        await this.onMessage(trimmedInput);
      } catch (error) {
        if (error instanceof Error) {
          this.displayError(error.message);
        }
      }
    }
  }

  /**
   * 获取用户输入
   */
  private prompt(): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.rl || !this.isRunning) {
        resolve(null);
        return;
      }

      const promptStr = this.colorize('> ', 'cyan');
      
      this.rl.question(promptStr, (answer) => {
        resolve(answer);
      });

      this.rl.once('close', () => {
        resolve(null);
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
   * 获取消息前缀
   */
  private getMessagePrefix(role: MessageRole): string {
    switch (role) {
      case 'user':
        return this.colorize('👤 你:', 'green');
      case 'assistant':
        return this.colorize('🤖 Claude:', 'blue');
      case 'system':
        return this.colorize('⚙️ 系统:', 'gray');
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
   * 获取状态图标
   */
  private getStatusIcon(status: ProgressStatus): string {
    switch (status) {
      case 'running':
        return '⏳';
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      default:
        return '•';
    }
  }

  /**
   * 获取状态颜色
   */
  private getStatusColor(status: ProgressStatus): keyof typeof Colors {
    switch (status) {
      case 'running':
        return 'cyan';
      case 'success':
        return 'green';
      case 'error':
        return 'red';
      case 'warning':
        return 'yellow';
      default:
        return 'white';
    }
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
