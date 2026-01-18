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
import type { CheckpointManager } from '../checkpoint/CheckpointManager';
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
  // @ts-expect-error - output is retained for backward compatibility
  private readonly output: OutputInterface;

  constructor(
    output: OutputInterface,
    private readonly sessionManager: SessionManager,
    private readonly messageRouter: MessageRouter,
    private readonly sdkExecutor: SDKQueryExecutor,
    private readonly permissionManager: PermissionManager,
    private readonly mcpService: MCPService,
    private readonly checkpointManager: CheckpointManager | null,
    private readonly configManager: ConfigManager,
    private readonly uiFactory: UIFactory,
    private readonly logger: Logger
  ) {
    this.output = output;
  }

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
      onInterrupt: () => this.handleInterrupt(),
      onRewind: async () => await this.handleRewind(session),
      onPermissionModeChange: (mode: PermissionMode) => this.permissionManager.setMode(mode),
      onQueueMessage: (message: string) => {
        if (this.streamingQueryManager) {
          this.streamingQueryManager.queueMessage(message);
        }
      },
      getRunner: () => this,
    };

    this.ui = this.uiFactory.createInteractiveUI(callbacks);

    this.streamingQueryManager = new StreamingQueryManagerImpl({
      messageRouter: this.messageRouter,
      sdkExecutor: this.sdkExecutor,
      sessionManager: this.sessionManager,
      ui: this.ui,
      checkpointManager: this.checkpointManager ?? undefined,
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
    const session = await this.sessionManager.createSession(workingDir, projectConfig);

    if (this.checkpointManager) {
      this.checkpointManager.setSessionId(session.id);
      await this.checkpointManager.initialize();
    }

    return session;
  }

  private async handleUserMessage(message: string, session: Session): Promise<void> {
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

  public async listSessionsData(): Promise<Session[]> {
    return this.sessionManager.listSessions();
  }

  public async getConfigData(): Promise<any> {
    return this.configManager.loadProjectConfig(process.cwd());
  }


  public getPermissionsData(): { mode: string; allowDangerouslySkipPermissions: boolean } {
    const config = this.permissionManager.getConfig();
    return {
      mode: config.mode,
      allowDangerouslySkipPermissions: config.allowDangerouslySkipPermissions ?? false,
    };
  }

  public async listRecentSessionsData(limit: number): Promise<Session[]> {
    return this.sessionManager.listRecentSessions(limit);
  }

  public async resumeSession(session: Session, forkSession: boolean): Promise<void> {
    const currentSession = this.streamingQueryManager?.getActiveSession();

    if (currentSession?.session) {
      await this.sessionManager.saveSession(currentSession.session);
    }

    this.streamingQueryManager?.endSession();

    this.streamingQueryManager?.startSession(session);

    this.streamingQueryManager?.setForkSession(forkSession);

    if (this.checkpointManager) {
      this.checkpointManager.setSessionId(session.id);
      await this.checkpointManager.initialize();
    }
  }

  public async getMCPConfigData(): Promise<{
    servers: Array<{
      name: string;
      type: string;
      config: any;
    }>;
    configPath: string;
  }> {
    return this.mcpService.listServerConfig(process.cwd());
  }

  public async editMCPConfigData(): Promise<{ configPath: string }> {
    return this.mcpService.editConfig(process.cwd());
  }

  public async validateMCPConfigData(): Promise<{
    valid: boolean;
    serverCount: number;
    transportCounts: { stdio: number; sse: number; http: number };
    errors: Array<{
      message: string;
      path?: string;
      line?: number;
      column?: number;
    }>;
    configPath: string;
  }> {
    return this.mcpService.validateConfig(process.cwd());
  }

  public getResumeSessionInfo(session: Session, forkSession: boolean): {
    hasValidSdkSession: boolean;
    forkIndicator: string;
    isFork: boolean;
    message: string;
  } {
    const hasValidSdkSession = !!session.sdkSessionId;
    const forkIndicator = session.parentSessionId ? ' 🔀' : '';

    let message: string;
    if (hasValidSdkSession) {
      if (forkSession) {
        message = `Created new branch from session: ${session.id}${forkIndicator}`;
      } else {
        message = `Resumed session: ${session.id}${forkIndicator}`;
      }
    } else {
      message = `Continuing session: ${session.id}${forkIndicator} (new SDK session)`;
    }

    return {
      hasValidSdkSession,
      forkIndicator,
      isFork: forkSession,
      message,
    };
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
    await this.logger.info('Opening checkpoint menu');

    if (!this.checkpointManager) {
      if (this.ui) {
        this.ui.displayWarning('Checkpoint feature not enabled');
      }
      return;
    }

    await this.checkpointManager.initialize();
    const activeSession = this.streamingQueryManager?.getActiveSession();
    const sdkSessionId = activeSession?.session.sdkSessionId;

    if (!sdkSessionId) {
      if (this.ui) {
        this.ui.displayWarning('No active SDK session for checkpoints');
      }
      return;
    }

    const checkpoints = this.checkpointManager.listCheckpoints({ sdkSessionId });

    if (checkpoints.length === 0) {
      if (this.ui) {
        this.ui.displayWarning('No checkpoints available');
      }
      return;
    }

    const uiSnapshots: UISnapshot[] = checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      timestamp: checkpoint.timestamp,
      description: checkpoint.description,
      files: [],
    }));

    if (this.ui) {
      const selected = await this.ui.showRewindMenu(uiSnapshots);

      if (selected) {
        try {
          const queryInstance = this.streamingQueryManager?.getQueryInstance();
          if (!queryInstance) {
            throw new Error('No active query session. Cannot restore checkpoint.');
          }

          await this.checkpointManager.restoreCheckpoint(selected.id, queryInstance, sdkSessionId);
          this.ui.displaySuccess(`Restored to checkpoint: ${selected.description}`);
          await this.logger.info('Checkpoint restored successfully', {
            checkpointId: selected.id,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.ui.displayError(`Restore failed: ${message}`);
          await this.logger.error('Checkpoint restore failed', error);
        }
      }
    }
  }
}
