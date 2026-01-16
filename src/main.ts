#!/usr/bin/env node

/**
 * 文件功能：主程序入口，负责初始化应用程序、解析命令行参数、管理会话和执行查询。
 *
 * 核心类：
 * - Application: CLI 应用生命周期与执行流程管理。
 *
 * 核心方法：
 * - run(): 解析命令行参数并执行交互/非交互模式。
 * - initialize(): 初始化配置、权限、扩展和工具。
 * - main(): CLI 入口函数，创建 Application 并运行。
 */

import * as dotenv from 'dotenv';

// 在所有其他模块加载之前初始化环境变量
dotenv.config({ quiet: process.env.DOTENV_QUIET === 'true' });

import { ConfigManager } from './config';
import { SessionManager, Session } from './core/SessionManager';
import { MessageRouter } from './core/MessageRouter';
import { StreamingMessageProcessor } from './core/StreamingMessageProcessor';
import { PermissionManager } from './permissions/PermissionManager';
import { ToolRegistry } from './tools/ToolRegistry';
import { InteractiveUI, Snapshot as UISnapshot, PermissionMode } from './ui/InteractiveUI';
import { UIFactoryRegistry } from './ui/factories/UIFactoryRegistry';
import type { UIFactory } from './ui/factories/UIFactory';
import type { OptionsInterface } from './ui/OptionsInterface';
import type { OutputInterface } from './ui/OutputInterface';
import type { ParserInterface } from './ui/ParserInterface';
import { HookManager } from './hooks/HookManager';
import { MCPManager } from './mcp/MCPManager';
import { MCPService } from './mcp/MCPService';
import { RewindManager, Snapshot as RewindSnapshot } from './rewind/RewindManager';
import {
  OutputFormatter,
  QueryResult as OutputQueryResult,
  OutputFormat,
} from './output/OutputFormatter';
import { SecurityManager } from './security/SecurityManager';
import { SDKQueryExecutor, SDKErrorType, ERROR_MESSAGES, StreamingQueryManager } from './sdk';
import { Logger } from './logging/Logger';
import { ConfigBuilder } from './config/ConfigBuilder';
import { CustomToolManager } from './custom-tools';

const VERSION = process.env.VERSION || '0.1.0';

/**
 * 会话保留数量（默认 10）
 * 可通过环境变量 SESSION_KEEP_COUNT 配置
 */
const SESSION_KEEP_COUNT = parseInt(process.env.SESSION_KEEP_COUNT || '10', 10);
const EXIT_CODE_SUCCESS = parseInt(process.env.EXIT_CODE_SUCCESS || '0', 10);
const EXIT_CODE_GENERAL_ERROR = parseInt(process.env.EXIT_CODE_GENERAL_ERROR || '1', 10);
const EXIT_CODE_CONFIG_ERROR = parseInt(process.env.EXIT_CODE_CONFIG_ERROR || '2', 10);

type ApplicationOptions = OptionsInterface & {
  print?: boolean;
  prompt?: string;
  outputFormat?: string;
};

export class Application {
  private readonly parser: ParserInterface;
  private readonly output: OutputInterface;
  private readonly configManager: ConfigManager;
  private readonly configBuilder: ConfigBuilder;
  private readonly sessionManager: SessionManager;
  private readonly toolRegistry: ToolRegistry;
  private readonly hookManager: HookManager;
  private readonly mcpManager: MCPManager;
  private readonly mcpService: MCPService;
  private readonly outputFormatter: OutputFormatter;
  private readonly securityManager: SecurityManager;
  private readonly sdkExecutor: SDKQueryExecutor;
  private readonly customToolManager: CustomToolManager;

  private rewindManager: RewindManager | null = null;
  private permissionManager!: PermissionManager;
  private messageRouter!: MessageRouter;
  // @ts-expect-error 流式消息处理器，用于处理 SDK 返回的流式消息（保留引用以便未来扩展）
  private streamingProcessor: StreamingMessageProcessor | null = null;
  private streamingQueryManager: StreamingQueryManager | null = null;
  private logger!: Logger;
  private ui: InteractiveUI | null = null;
  private currentAbortController: AbortController | null = null;

  constructor(uiFactory: UIFactory = UIFactoryRegistry.createUIFactory()) {
    this.parser = uiFactory.createParser();
    this.output = uiFactory.createOutput();
    this.configManager = new ConfigManager();
    this.configBuilder = new ConfigBuilder();
    this.sessionManager = new SessionManager();
    this.toolRegistry = new ToolRegistry();
    this.hookManager = new HookManager();
    this.mcpManager = new MCPManager();
    this.mcpService = new MCPService({ mcpManager: this.mcpManager });
    this.outputFormatter = new OutputFormatter();
    this.securityManager = new SecurityManager();
    this.sdkExecutor = new SDKQueryExecutor();
    this.customToolManager = new CustomToolManager({
      serverNamePrefix: process.env.CUSTOM_TOOL_SERVER_NAME_PREFIX,
      serverVersion: process.env.CUSTOM_TOOL_SERVER_VERSION,
    });
    this.logger = new Logger(this.securityManager);
  }

  async run(args: string[]): Promise<number> {
    try {
      // 1. 解析命令行参数
      const options: OptionsInterface = this.parser.parse(args);
      const appOptions = options as ApplicationOptions;

      // 2. 早期返回：help/version（无需完整初始化）
      const earlyExitCode = await this.handleEarlyReturns(options);
      if (earlyExitCode !== null) {
        return earlyExitCode;
      }

      // 3. 初始化应用（包括 Logger）
      await this.initialize(appOptions);

      // 4. 无头模式（单次运行）
      if (appOptions.print) {
        return await this.runNonInteractive(appOptions);
      }

      // 4. 交互模式
      return await this.runInteractive(appOptions);
    } catch (error) {
      if (error instanceof Error && error.name === 'CLIParseError') {
        this.output.error(`Argument error: ${error.message}`);
        return EXIT_CODE_CONFIG_ERROR;
      }
      this.output.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      return EXIT_CODE_GENERAL_ERROR;
    }
  }

  /**
   * 处理早期返回（help/version），无需完整应用初始化
   */
  private async handleEarlyReturns(options: OptionsInterface): Promise<number | null> {
    if (options.help) {
      this.output.info(this.parser.getHelpText());
      return EXIT_CODE_SUCCESS;
    }

    if (options.version) {
      this.output.success(`claude-replica v${VERSION}`);
      return EXIT_CODE_SUCCESS;
    }

    return null;
  }

  private async initialize(options: ApplicationOptions): Promise<void> {
    // session清理
    await this.sessionManager.cleanOldSessions(SESSION_KEEP_COUNT)

    await this.logger.init();
    await this.logger.info('Application started', { args: process.argv.slice(2) });

    await this.configManager.ensureUserConfigDir();

    const workingDir = process.cwd();
    const projectConfig = await this.configManager.loadProjectConfig(workingDir);
    const permissionConfig = this.configBuilder.buildPermissionConfigOnly(
      options as Parameters<ConfigBuilder['buildPermissionConfigOnly']>[0],
      projectConfig
    );

    // Create UI factory from configuration (default to terminal)
    const uiFactory = UIFactoryRegistry.create(permissionConfig.ui);

    this.permissionManager = new PermissionManager(permissionConfig, uiFactory, this.toolRegistry);

    this.messageRouter = new MessageRouter({
      configManager: this.configManager,
      toolRegistry: this.toolRegistry,
      permissionManager: this.permissionManager,
      workingDirectory: workingDir,
    });

    this.streamingProcessor = new StreamingMessageProcessor();
    // 自定义工具初始化
    await this.customToolManager.initialize();
    await this.customToolManager.registerMcpServers(this.sdkExecutor, this.logger);
    // mcp初始化
    await this.mcpManager.configureMessageRouter(workingDir, this.messageRouter, this.logger);
    // 文件回退点初始化
    this.rewindManager = new RewindManager({ workingDir });
    await this.rewindManager.initialize();
    // hooks初始化
    await this.hookManager.loadFromProjectRoot(workingDir);

    await this.logger.info('Application initialized');
  }


  private async runInteractive(_options: ApplicationOptions): Promise<number> {
    await this.logger.info('Starting interactive mode');
    const session = await this.getOrCreateSession();

    this.ui = new InteractiveUI({
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
    });

    this.streamingQueryManager = new StreamingQueryManager({
      messageRouter: this.messageRouter,
      sdkExecutor: this.sdkExecutor,
      sessionManager: this.sessionManager,
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

    this.ui.setInitialPermissionMode(this.permissionManager.getMode());

    try {
      await this.ui.start();
      return EXIT_CODE_SUCCESS;
    } catch (error) {
      await this.logger.error('Interactive mode error', error);
      return EXIT_CODE_GENERAL_ERROR;
    }
  }

  private async runNonInteractive(options: ApplicationOptions): Promise<number> {
    await this.logger.info('Starting non-interactive mode');
    const prompt = options.prompt || (await this.readStdin());
    if (!prompt) {
      await this.logger.error('Error: No query content provided');
      return EXIT_CODE_CONFIG_ERROR;
    }

    // 创建临时会话对象（不持久化到磁盘）
    const tempSessionId = `temp-${Date.now()}`;
    const now = new Date();
    const tempSession: Session = {
      id: tempSessionId,
      createdAt: now,
      lastAccessedAt: now,
      messages: [],
      context: {
        workingDirectory: process.cwd(),
        projectConfig: {},
        activeAgents: [],
      },
      expired: false,
      workingDirectory: process.cwd(),
    };

    try {
      const result = await this.executeQuery(prompt, tempSession, options);

      this.outputResult(result, options.outputFormat || 'text');

      return EXIT_CODE_SUCCESS;
    } catch (error) {
      await this.logger.error('Query execution failed', error);

      this.output.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      return EXIT_CODE_GENERAL_ERROR;
    }
  }

  private async getOrCreateSession(): Promise<Session> {
    const workingDir = process.cwd();

    await this.logger.debug('create new session');
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
      `  Allowed tools: ${config.allowedTools?.join(', ') || '(all)'}`,
      `  Disallowed tools: ${config.disallowedTools?.join(', ') || '(none)'}`,
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

  private async executeQuery(
    prompt: string,
    session: Session,
    _options?: ApplicationOptions
  ): Promise<string> {
    await this.sessionManager.addMessage(session, {
      role: 'user',
      content: prompt,
    });

    const message = {
      id: '',
      role: 'user' as const,
      content: prompt,
      timestamp: new Date(),
    };

    const queryResult = await this.messageRouter.routeMessage(message, session);

    await this.logger.debug('Query built', {
      prompt: queryResult.prompt,
      model: queryResult.options.model,
    });

    this.currentAbortController = new AbortController();

    try {
      const sdkResult = await this.sdkExecutor.execute({
        prompt: queryResult.prompt,
        model: queryResult.options.model,
        systemPrompt: queryResult.options.systemPrompt,
        allowedTools: queryResult.options.allowedTools,
        disallowedTools: queryResult.options.disallowedTools,
        cwd: queryResult.options.cwd,
        permissionMode: queryResult.options.permissionMode,
        canUseTool: queryResult.options.canUseTool,
        maxTurns: queryResult.options.maxTurns,
        maxBudgetUsd: queryResult.options.maxBudgetUsd,
        maxThinkingTokens: queryResult.options.maxThinkingTokens,
        mcpServers: queryResult.options.mcpServers as Parameters<
          typeof this.sdkExecutor.execute
        >[0]['mcpServers'],
        agents: queryResult.options.agents as Parameters<
          typeof this.sdkExecutor.execute
        >[0]['agents'],
        sandbox: queryResult.options.sandbox,
        abortController: this.currentAbortController,
        resume: session.sdkSessionId,
      });

      if (sdkResult.usage) {
        await this.logger.info('Token usage statistics', {
          inputTokens: sdkResult.usage.inputTokens,
          outputTokens: sdkResult.usage.outputTokens,
          totalCostUsd: sdkResult.totalCostUsd,
          durationMs: sdkResult.durationMs,
        });
      }

      if (sdkResult.isError) {
        throw new Error(sdkResult.errorMessage || 'Query execution failed');
      }

      await this.sessionManager.addMessage(session, {
        role: 'assistant',
        content: sdkResult.response,
        usage: sdkResult.usage
          ? {
              inputTokens: sdkResult.usage.inputTokens,
              outputTokens: sdkResult.usage.outputTokens,
              totalCostUsd: sdkResult.totalCostUsd,
              durationMs: sdkResult.durationMs,
            }
          : undefined,
      });

      return sdkResult.response;
    } finally {
      this.currentAbortController = null;
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
          } else {
            this.ui.displayWarning(ERROR_MESSAGES[SDKErrorType.INTERRUPTED]);
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
      this.ui.displayWarning(ERROR_MESSAGES[SDKErrorType.INTERRUPTED]);
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

  private async readStdin(): Promise<string | null> {
    if (process.stdin.isTTY) {
      return null;
    }

    return new Promise((resolve) => {
      let data = '';

      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (chunk) => {
        data += chunk;
      });
      process.stdin.on('end', () => {
        resolve(data.trim() || null);
      });
      process.stdin.on('error', () => {
        resolve(null);
      });

      setTimeout(() => {
        resolve(data.trim() || null);
      }, 1000);
    });
  }

  private outputResult(result: string, format: string): void {
    const queryResult: OutputQueryResult = {
      content: result,
      success: true,
    };

    const outputFormat: OutputFormat = this.outputFormatter.isValidFormat(format)
      ? (format as OutputFormat)
      : 'text';

    const formattedOutput = this.outputFormatter.format(queryResult, outputFormat);
    this.output.info(formattedOutput);
  }
}

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const app = new Application();
  return app.run(args);
}
