/**
 * 文件功能：实现交互式运行模式，管理用户交互、命令处理和流式查询。
 *
 * 核心类：
 * - InteractiveRunner: 交互模式运行器，处理用户输入、命令和流式查询。
 *
 * 核心方法：
 * - run(): 启动交互模式并运行 UI 循环。
 * - handleUserMessage(): 处理用户消息输入。
 * - handleCommand(): 处理用户命令（/help, /sessions 等）。
 * - handleResumeCommand(): 处理会话恢复命令。
 * - handleInterrupt(): 处理用户中断信号。
 * - handleRewind(): 处理 rewind 功能。
 */

import type { ApplicationRunner, ApplicationOptions } from './ApplicationRunner';
import type { OutputInterface } from '../ui/OutputInterface';
import type { SessionManager, Session } from '../core/SessionManager';
import type { MessageRouter } from '../core/MessageRouter';
import type { SDKQueryExecutor, StreamingQueryManager, SDKErrorType } from '../sdk';
import type { PermissionManager } from '../permissions/PermissionManager';
import type { MCPService } from '../mcp/MCPService';
import type { RewindManager, Snapshot as RewindSnapshot } from '../rewind/RewindManager';
import type { Logger } from '../logging/Logger';
import type { ConfigManager } from '../config';
import type { UIFactory } from '../ui/factories/UIFactory';
import type {
  InteractiveUICallbacks,
  InteractiveUIInterface,
  PermissionMode,
  Snapshot as UISnapshot,
} from '../ui/InteractiveUIInterface';
import { StreamingQueryManager as StreamingQueryManagerImpl } from '../sdk';

const EXIT_CODE_SUCCESS = parseInt(process.env.EXIT_CODE_SUCCESS || '0', 10);
const EXIT_CODE_GENERAL_ERROR = parseInt(process.env.EXIT_CODE_GENERAL_ERROR || '1', 10);

// Import ERROR_MESSAGES dynamically to avoid circular dependencies
let ERROR_MESSAGES: Record<SDKErrorType, string>;
import('../sdk').then((module) => {
  ERROR_MESSAGES = module.ERROR_MESSAGES;
});

export class InteractiveRunner implements ApplicationRunner {
  private ui: InteractiveUIInterface | null = null;
  private streamingQueryManager: StreamingQueryManager | null = null;
  private currentAbortController: AbortController | null = null;

  constructor(
    private readonly output: OutputInterface,
    private readonly sessionManager: SessionManager,
    private readonly messageRouter: MessageRouter,
    private readonly sdkExecutor: SDKQueryExecutor,
    private readonly permissionManager: PermissionManager,
    private readonly mcpService: MCPService,
    private readonly rewindManager: RewindManager | null,
    private readonly configManager: ConfigManager,
    private readonly uiFactory: UIFactory,
    private readonly logger: Logger
  ) {}

  async run(_options: ApplicationOptions): Promise<number> {
    await this.logger.info('Starting interactive mode');
    const session = await this.getOrCreateSession();

    const callbacks: InteractiveUICallbacks = {
      onMessage: async (message: string) => {
        this.ui!.setProcessingState(true);
        try {
          await this.handleUserMessage(message, session);
        } finally {
          this.ui!.setProcessingState(false);
        }
      },
      onCommand: async (command: string) => {
        await this.handleCommand(command, session);
      },
      onInterrupt: () => this.handleInterrupt(),
      onRewind: async () => await this.handleRewind(session),
      onPermissionModeChange: (mode: PermissionMode) => this.permissionManager.setMode(mode),
      onQueueMessage: (message: string) => {
        if (this.streamingQueryManager) {
          this.streamingQueryManager.queueMessage(message);
        }
      },
    };

    this.ui = this.uiFactory.createInteractiveUI(callbacks);

    this.streamingQueryManager = new StreamingQueryManagerImpl({
      messageRouter: this.messageRouter,
      sdkExecutor: this.sdkExecutor,
      sessionManager: this.sessionManager,
      ui: this.ui,
      onThinking: (content) => {
        if (this.ui) {
          this.ui.stopComputing();
          this.ui.displayThinking(content);
        }
      },
      onToolUse: (info) => {
        if (this.ui) {
          this.ui.stopComputing();
          this.ui.displayToolUse(info.name, info.input);
        }
      },
      onToolResult: (info) => {
        if (this.ui) {
          this.ui.displayToolResult(info.name || 'unknown', info.content, info.isError);
        }
      },
      onAssistantText: (text) => {
        if (this.ui && text.trim()) {
          this.ui.stopComputing();
          this.ui.displayMessage(text, 'assistant');
        }
      },
    });

    this.streamingQueryManager.startSession(session);
    await this.logger.debug('Started streaming query session with tool callbacks');

    try {
      this.ui.setInitialPermissionMode(this.permissionManager.getMode());
      await this.ui.start();
      return EXIT_CODE_SUCCESS;
    } catch (error) {
      await this.logger.error('Interactive mode error', error);
      return EXIT_CODE_GENERAL_ERROR;
    }
  }

  private async getOrCreateSession(): Promise<Session> {
    const workingDir = process.cwd();
    const projectConfig = await this.configManager.loadProjectConfig(workingDir);
    return this.sessionManager.createSession(workingDir, projectConfig);
  }

  private async handleUserMessage(message: string, session: Session): Promise<void> {
    // Check if it's a built-in command
    if (message.startsWith('/')) {
      const parts = message.slice(1).split(/\s+/);
      const cmdName = parts[0].toLowerCase();
      const builtInCommands = [
        'help',
        'sessions',
        'config',
        'permissions',
        'mcp',
        'clear',
        'exit',
        'quit',
      ];

      if (builtInCommands.includes(cmdName)) {
        await this.handleCommand(message, session);
        return;
      }
      // Non-built-in slash commands are passed to SDK
    }

    try {
      const hasImages = this.messageRouter.hasImageReferences(message);
      if (hasImages && this.ui) {
        this.ui.displayInfo('正在处理图像引用...');
      }

      if (this.ui) {
        this.ui.displayComputing();
      }

      // 交互模式下总是使用流式查询管理器
      const processResult = await this.streamingQueryManager!.sendMessage(message);
      if (!processResult.success) {
        if (this.ui) {
          this.ui.stopComputing();
          this.ui.displayError(processResult.error || '消息处理失败');
        }
        return;
      }

      // 获取当前活跃会话（可能被 resume 更新）
      const activeSession = this.streamingQueryManager!.getActiveSession();
      const currentSession = activeSession?.session || session;

      await this.sessionManager.addMessage(currentSession, {
        role: 'user',
        content: message,
      });
    } catch (error) {
      if (this.ui) {
        this.ui.stopComputing();
        this.ui.displayError(error instanceof Error ? error.message : String(error));
      }
      await this.logger.error('Message processing failed', error);
    }
  }

  private async handleCommand(command: string, session: Session): Promise<void> {
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
        if (this.ui) {
          this.ui.stop();
        }
        break;
      default: {
        // Unknown commands are treated as slash commands and passed to SDK
        await this.handleUserMessage(command, session);
      }
    }
  }

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

    this.output.info(helpText);
  }

  private async showSessions(): Promise<void> {
    const sessions = await this.sessionManager.listSessions();
    if (sessions.length === 0) {
      this.output.info('No saved sessions');
      return;
    }

    this.output.blankLine();
    const lines = ['Session list:'];
    for (const session of sessions) {
      const status = session.expired ? '(expired)' : '';
      const time = session.lastAccessedAt.toLocaleString();
      lines.push(`  ${session.id} - ${time} ${status}`);
    }
    this.output.section(lines.join('\n'));
  }

  private async showConfig(): Promise<void> {
    const projectConfig = await this.configManager.loadProjectConfig(process.cwd());

    this.output.blankLine();
    const lines = ['Current configuration:', JSON.stringify(projectConfig, null, 2)];
    this.output.section(lines.join('\n'));
  }

  private showPermissions(): void {
    const config = this.permissionManager.getConfig();

    this.output.blankLine();
    const lines = [
      'Permission settings:',
      `  Mode: ${config.mode}`,
      `  Skip permission checks: ${config.allowDangerouslySkipPermissions ? 'yes' : 'no'}`,
    ];
    this.output.section(lines.join('\n'));
  }

  private async handleMCPCommand(parts: string[]): Promise<void> {
    const subcommand = parts[1]?.toLowerCase();

    if (!subcommand || subcommand === 'list') {
      await this.showMCPConfig();
      return;
    }

    if (subcommand === 'edit') {
      await this.editMCPConfig();
      return;
    }

    if (subcommand === 'validate') {
      await this.validateMCPConfig();
      return;
    }

    this.showMCPCommandHelp(subcommand);
  }

  /**
   * 处理 /resume 命令，显示会话恢复菜单
   *
   * 仅在交互模式中可用，显示最近会话列表供用户选择恢复。
   * 用户可以选择取消（返回 null），或选择特定会话进行恢复。
   */
  private async handleResumeCommand(): Promise<void> {
    // 验证是否在交互模式中
    if (!this.ui) {
      this.output.info('Warning: /resume command is only available in interactive mode');
      return;
    }

    // 获取最近会话列表
    const sessions = await this.sessionManager.listRecentSessions(10);

    // 如果没有可用会话，显示提示并返回
    if (sessions.length === 0) {
      this.output.info('No available sessions to resume');
      return;
    }

    // 显示会话选择菜单
    const selectedSession = await this.ui.showSessionMenu(sessions);

    // 用户取消选择，直接返回
    if (!selectedSession) {
      return;
    }

    try {
      // 检查选中的会话是否可以恢复
      const hasValidSdkSession = !!selectedSession.sdkSessionId;
      const forkIndicator = selectedSession.parentSessionId ? ' 🔀' : '';

      // 询问用户是否要创建新分支（仅在有有效SDK会话ID时询问）
      let forkSession = false;
      if (hasValidSdkSession && this.ui) {
        forkSession = await this.ui.showConfirmationMenu(
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

      // 获取当前活动会话
      const currentSession = this.streamingQueryManager?.getActiveSession();

      // 保存当前会话（如果存在）
      if (currentSession?.session) {
        await this.sessionManager.saveSession(currentSession.session);
      }

      // 结束当前会话
      this.streamingQueryManager?.endSession();

      // 切换到选中的会话
      this.streamingQueryManager?.startSession(selectedSession);

      // 设置forkSession标志
      this.streamingQueryManager?.setForkSession(forkSession);

      // 显示成功消息
      if (hasValidSdkSession) {
        if (forkSession) {
          this.output.blankLine();
          this.output.success(
            `Created new branch from session: ${selectedSession.id}${forkIndicator}`
          );
        } else {
          this.output.blankLine();
          this.output.success(`Resumed session: ${selectedSession.id}${forkIndicator}`);
        }
      } else {
        this.output.blankLine();
        this.output.success(
          `Continuing session: ${selectedSession.id}${forkIndicator} (new SDK session)`
        );
      }
    } catch (error) {
      this.output.error(
        `Failed to resume session: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private showMCPCommandHelp(subcommand?: string): void {
    if (subcommand) {
      this.output.info(`Unknown MCP subcommand: ${subcommand}`);
    }

    const helpText = `
MCP commands:
  /mcp           - Show MCP server status
  /mcp list      - Show MCP server status
  /mcp edit      - Edit MCP configuration
  /mcp validate  - Validate MCP configuration
`.trim();

    this.output.info(helpText);
  }

  private async showMCPConfig(): Promise<void> {
    try {
      const result = await this.mcpService.listServerConfig(process.cwd());
      if (result.servers.length === 0) {
        this.output.info(`No MCP servers configured at ${result.configPath}`);
        this.output.info('Use /mcp edit to add MCP servers.');
        this.output.info('Use /mcp validate to validate MCP configuration.');
        return;
      }

      this.output.blankLine();
      this.output.section(`MCP configuration: ${result.configPath}\nMCP servers:`);
      result.servers.forEach((server, index) => {
        if (index > 0) {
          this.output.blankLine();
        }
        this.output.info(`- ${server.name}`);
        this.output.info(`  Transport: ${server.type}`);
        this.output.info('  Config:');
        const configLines = JSON.stringify(server.config, null, 2).split('\n');
        for (const line of configLines) {
          this.output.info(`    ${line}`);
        }
      });

      this.output.blankLine();
      this.output.info('Commands:');
      this.output.info('  /mcp edit     - Edit MCP configuration');
      this.output.info('  /mcp validate - Validate MCP configuration');
      this.output.blankLine();
    } catch (error) {
      await this.logger.error('Failed to show MCP configuration', error);
      this.output.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async editMCPConfig(): Promise<void> {
    try {
      const result = await this.mcpService.editConfig(process.cwd());
      this.output.success(`MCP configuration updated: ${result.configPath}`);
      this.output.info('Reload the application to apply the updated configuration.');
    } catch (error) {
      await this.logger.error('MCP config edit failed', error);
      this.output.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async validateMCPConfig(): Promise<void> {
    try {
      const result = await this.mcpService.validateConfig(process.cwd());

      if (result.valid) {
        this.output.success(`MCP configuration is valid. Servers: ${result.serverCount}`);
        this.output.info(
          `Transports: stdio ${result.transportCounts.stdio}, sse ${result.transportCounts.sse}, http ${result.transportCounts.http}`
        );
        return;
      }

      this.output.info(
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
        this.output.info(`- ${error.message}${suffix}`);
      }
    } catch (error) {
      await this.logger.error('MCP config validation failed', error);
      this.output.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private handleInterrupt(): void {
    // 异步日志记录在后台静默执行（不阻塞中断流程）
    this.logger.info('User interrupted operation').catch(() => {});

    if (this.streamingQueryManager && this.streamingQueryManager.isProcessing()) {
      const result = this.streamingQueryManager.interruptSession();
      if (result.success) {
        this.logger
          .debug('Interrupt signal sent to streaming query manager', {
            clearedMessages: result.clearedMessages,
          })
          .catch(() => {});

        if (this.ui) {
          if (result.clearedMessages > 0) {
            this.ui.displayWarning(
              `Operation interrupted. ${result.clearedMessages} queued message(s) cleared.`
            );
          } else if (ERROR_MESSAGES) {
            this.ui.displayWarning(ERROR_MESSAGES['INTERRUPTED' as SDKErrorType]);
          }
        }
      }
    }

    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.logger.debug('Interrupt signal sent to SDK query').catch(() => {});
    }

    if (this.sdkExecutor.isRunning()) {
      this.sdkExecutor.interrupt();
    }

    if (this.ui && !this.streamingQueryManager?.isProcessing()) {
      this.ui.stopComputing();
      if (ERROR_MESSAGES) {
        this.ui.displayWarning(ERROR_MESSAGES['INTERRUPTED' as SDKErrorType]);
      }
    }
  }

  private async handleRewind(_session: Session): Promise<void> {
    await this.logger.info('Opening rewind menu');

    if (!this.rewindManager) {
      if (this.ui) {
        this.ui.displayWarning('Rewind manager not initialized');
      }
      return;
    }

    const snapshots = await this.rewindManager.listSnapshots();

    if (snapshots.length === 0) {
      if (this.ui) {
        this.ui.displayWarning('No rewind points available');
      }
      return;
    }

    const uiSnapshots: UISnapshot[] = snapshots.map((s: RewindSnapshot) => ({
      id: s.id,
      timestamp: s.timestamp,
      description: s.description,
      files: Array.from(s.files.keys()),
    }));

    if (this.ui) {
      const selected = await this.ui.showRewindMenu(uiSnapshots);

      if (selected) {
        try {
          await this.rewindManager.restoreSnapshot(selected.id);
          this.ui.displaySuccess(`Reverted to: ${selected.description}`);
          await this.logger.info('Rewind successful', { snapshotId: selected.id });
        } catch (error) {
          this.ui.displayError(
            `Rewind failed: ${error instanceof Error ? error.message : String(error)}`
          );
          await this.logger.error('Rewind failed', error);
        }
      }
    }
  }
}
