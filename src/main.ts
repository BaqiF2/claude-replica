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

import * as fs from 'fs/promises';
import * as path from 'path';

import { CLIParser, CLIOptions } from './cli/CLIParser';
import { ConfigManager } from './config';
import { SessionManager, Session } from './core/SessionManager';
import { MessageRouter } from './core/MessageRouter';
import { StreamingMessageProcessor } from './core/StreamingMessageProcessor';
import { PermissionManager } from './permissions/PermissionManager';
import { ToolRegistry } from './tools/ToolRegistry';
import { InteractiveUI, Snapshot as UISnapshot, PermissionMode } from './ui/InteractiveUI';
import { PermissionUIImpl } from './ui/PermissionUIImpl';
import { HookManager } from './hooks/HookManager';
import { MCPManager, McpServerConfig } from './mcp/MCPManager';
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
import { ErrorHandler } from './errors/ErrorHandler';
import { CustomToolManager } from './custom-tools';
import { calculatorTool } from './custom-tools/math';

const VERSION = process.env.VERSION || '0.1.0';
const CUSTOM_TOOL_MODULE_NAME = process.env.CUSTOM_TOOL_MODULE_NAME ?? 'math/calculators';

/**
 * 会话保留数量（默认 10）
 * 可通过环境变量 SESSION_KEEP_COUNT 配置
 */
const SESSION_KEEP_COUNT = parseInt(process.env.SESSION_KEEP_COUNT || '10', 10);

export class Application {
  private readonly cliParser: CLIParser;
  private readonly configManager: ConfigManager;
  private readonly configBuilder: ConfigBuilder;
  private readonly errorHandler: ErrorHandler;
  private readonly sessionManager: SessionManager;
  private readonly toolRegistry: ToolRegistry;
  private readonly hookManager: HookManager;
  private readonly mcpManager: MCPManager;
  private readonly mcpService: MCPService;
  private readonly outputFormatter: OutputFormatter;
  private readonly securityManager: SecurityManager;
  private readonly sdkExecutor: SDKQueryExecutor;

  private rewindManager: RewindManager | null = null;
  private permissionManager!: PermissionManager;
  private messageRouter!: MessageRouter;
  // @ts-expect-error 流式消息处理器，用于处理 SDK 返回的流式消息（保留引用以便未来扩展）
  private streamingProcessor: StreamingMessageProcessor | null = null;
  private streamingQueryManager: StreamingQueryManager | null = null;
  private logger!: Logger;
  private ui: InteractiveUI | null = null;
  private currentAbortController: AbortController | null = null;

  constructor() {
    this.cliParser = new CLIParser();
    this.configManager = new ConfigManager();
    this.configBuilder = new ConfigBuilder();
    this.errorHandler = new ErrorHandler();
    this.sessionManager = new SessionManager();
    this.toolRegistry = new ToolRegistry();
    this.hookManager = new HookManager();
    this.mcpManager = new MCPManager();
    this.mcpService = new MCPService({ mcpManager: this.mcpManager });
    this.outputFormatter = new OutputFormatter();
    this.securityManager = new SecurityManager();
    this.sdkExecutor = new SDKQueryExecutor();
    this.logger = new Logger(this.securityManager);
  }

  async run(args: string[]): Promise<number> {
    try {
      // 1. 解析命令行参数
      const options = this.cliParser.parse(args);

      // 2. 早期返回：help/version（无需完整初始化）
      const earlyExitCode = await this.handleEarlyReturns(options);
      if (earlyExitCode !== null) {
        return earlyExitCode;
      }

      // 3. 初始化应用（包括 Logger）
      await this.initialize(options);

      // 4. 执行主逻辑
      if (options.print || options.prompt) {
        return await this.runNonInteractive(options);
      }

      return await this.runInteractive(options);
    } catch (error) {
      return this.errorHandler.handle(error);
    }
  }

  /**
   * 处理早期返回（help/version），无需完整应用初始化
   */
  private async handleEarlyReturns(options: CLIOptions): Promise<number | null> {
    if (options.help) {
      console.log(this.cliParser.getHelpText());
      return 0;
    }

    if (options.version) {
      console.log(`claude-replica v${VERSION}`);
      return 0;
    }

    return null;
  }

  private async initialize(options: CLIOptions): Promise<void> {
    await this.logger.init();
    await this.logger.info('Application started', { args: process.argv.slice(2) });

    await this.configManager.ensureUserConfigDir();

    const workingDir = process.cwd();
    const projectConfig = await this.configManager.loadProjectConfig(workingDir);
    const mergedConfig = this.configBuilder.build(options, projectConfig);
    const permissionConfig = this.configBuilder.buildPermissionConfig(options, mergedConfig);
    const permissionUI = new PermissionUIImpl();
    this.permissionManager = new PermissionManager(
      permissionConfig,
      permissionUI,
      this.toolRegistry
    );

    this.messageRouter = new MessageRouter({
      configManager: this.configManager,
      toolRegistry: this.toolRegistry,
      permissionManager: this.permissionManager,
    });
    this.messageRouter.setWorkingDirectory(workingDir);

    this.streamingProcessor = new StreamingMessageProcessor();

    this.rewindManager = new RewindManager({ workingDir });
    await this.rewindManager.initialize();

    await this.loadCustomExtensions(workingDir);
    await this.initializeCustomTools();
    await this.loadMCPServers(workingDir);

    // 自动清理旧会话，保留最近 N 个会话
    await this.cleanOldSessions();

    await this.logger.debug('Application initialized');
  }

  private async loadCustomExtensions(workingDir: string): Promise<void> {
    await this.logger.debug('Loading extensions...');

    const hooksConfigPath = path.join(workingDir, '.claude', 'hooks.json');
    try {
      await fs.access(hooksConfigPath);
      const hooksContent = await fs.readFile(hooksConfigPath, 'utf-8');
      this.hookManager.loadHooks(JSON.parse(hooksContent));
    } catch {
      // 钩子配置文件不存在，忽略
    }

    await this.logger.debug('Extensions loaded');
  }

  private async initializeCustomTools(): Promise<void> {
    const customToolManager = new CustomToolManager();
    const registration = customToolManager.registerModule(CUSTOM_TOOL_MODULE_NAME, [
      calculatorTool,
    ]);

    if (!registration.valid) {
      await this.logger.error('Custom tool module registration failed', {
        module: CUSTOM_TOOL_MODULE_NAME,
        errors: registration.errors,
      });
      return;
    }

    const customMcpServers = customToolManager.createMcpServers();
    if (!Object.keys(customMcpServers).length) {
      await this.logger.warn('No custom MCP servers created', { module: CUSTOM_TOOL_MODULE_NAME });
      return;
    }

    this.sdkExecutor.setCustomMcpServers(customMcpServers);
    await this.logger.info('Custom tool MCP servers registered', {
      servers: Object.keys(customMcpServers),
    });
  }

  private async loadMCPServers(workingDir: string): Promise<void> {
    let expandedConfig: Record<string, McpServerConfig> | undefined;

    try {
      await this.mcpManager.loadFromProjectRoot(workingDir);
      expandedConfig = this.mcpManager.getExpandedServersConfig();
      const configPath = await this.mcpManager.getConfigPath(workingDir);
      await this.logger.debug('MCP server config loaded', { path: configPath });
    } catch {
      expandedConfig = this.mcpManager.getExpandedServersConfig();
      // 配置文件不存在或无效，忽略
    } finally {
      this.messageRouter.setMcpServers(expandedConfig);
    }
  }

  /**
   * 清理旧会话
   *
   * 保留最近创建的 N 个会话，删除其余的旧会话。
   * 保留数量通过环境变量 SESSION_KEEP_COUNT 配置，默认 10。
   */
  private async cleanOldSessions(): Promise<void> {
    try {
      await this.sessionManager.cleanOldSessions(SESSION_KEEP_COUNT);
      await this.logger.debug('Old sessions cleaned', { keepCount: SESSION_KEEP_COUNT });
    } catch (error) {
      // 清理失败不影响应用启动，仅记录警告
      await this.logger.warn('Failed to clean old sessions', error);
    }
  }

  private async runInteractive(_options: CLIOptions): Promise<number> {
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
      return 0;
    } catch (error) {
      await this.logger.error('Interactive mode error', error);
      return 1;
    }
  }

  private async runNonInteractive(options: CLIOptions): Promise<number> {
    await this.logger.info('Starting non-interactive mode');
    const prompt = options.prompt || (await this.readStdin());
    if (!prompt) {
      console.error('Error: No query content provided');
      return 2;
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

      return 0;
    } catch (error) {
      await this.logger.error('Query execution failed', error);

      console.error('Error:', error instanceof Error ? error.message : String(error));
      return 1;
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

    console.log(helpText);
  }

  private async showSessions(): Promise<void> {
    const sessions = await this.sessionManager.listSessions();
    if (sessions.length === 0) {
      console.log('No saved sessions');
      return;
    }

    console.log('\nSession list:');
    for (const session of sessions) {
      const status = session.expired ? '(expired)' : '';
      const time = session.lastAccessedAt.toLocaleString();
      console.log(`  ${session.id} - ${time} ${status}`);
    }
    console.log('');
  }

  private async showConfig(): Promise<void> {
    const projectConfig = await this.configManager.loadProjectConfig(process.cwd());

    console.log('\nCurrent configuration:');
    console.log(JSON.stringify(projectConfig, null, 2));
    console.log('');
  }

  private showPermissions(): void {
    const config = this.permissionManager.getConfig();

    console.log('\nPermission settings:');
    console.log(`  Mode: ${config.mode}`);
    console.log(`  Allowed tools: ${config.allowedTools?.join(', ') || '(all)'}`);
    console.log(`  Disallowed tools: ${config.disallowedTools?.join(', ') || '(none)'}`);
    console.log(
      `  Skip permission checks: ${config.allowDangerouslySkipPermissions ? 'yes' : 'no'}`
    );
    console.log('');
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
      console.log('Warning: /resume command is only available in interactive mode');
      return;
    }

    // 获取最近会话列表
    const sessions = await this.sessionManager.listRecentSessions(10);

    // 如果没有可用会话，显示提示并返回
    if (sessions.length === 0) {
      console.log('No available sessions to resume');
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
          console.log(`\nCreated new branch from session: ${selectedSession.id}${forkIndicator}`);
        } else {
          console.log(`\nResumed session: ${selectedSession.id}${forkIndicator}`);
        }
      } else {
        console.log(
          `\nContinuing session: ${selectedSession.id}${forkIndicator} (new SDK session)`
        );
      }
    } catch (error) {
      console.error(
        `Failed to resume session: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private showMCPCommandHelp(subcommand?: string): void {
    if (subcommand) {
      console.log(`Unknown MCP subcommand: ${subcommand}`);
    }

    const helpText = `
MCP commands:
  /mcp           - Show MCP server status
  /mcp list      - Show MCP server status
  /mcp edit      - Edit MCP configuration
  /mcp validate  - Validate MCP configuration
`.trim();

    console.log(helpText);
  }

  private async showMCPConfig(): Promise<void> {
    try {
      const result = await this.mcpService.listServerConfig(process.cwd());
      if (result.servers.length === 0) {
        console.log(`No MCP servers configured at ${result.configPath}`);
        console.log('Use /mcp edit to add MCP servers.');
        console.log('Use /mcp validate to validate MCP configuration.');
        return;
      }

      console.log(`\nMCP configuration: ${result.configPath}`);
      console.log('MCP servers:');
      for (const server of result.servers) {
        console.log(`\n- ${server.name}`);
        console.log(`  Transport: ${server.type}`);
        console.log('  Config:');
        const configLines = JSON.stringify(server.config, null, 2).split('\n');
        for (const line of configLines) {
          console.log(`    ${line}`);
        }
      }

      console.log('\nCommands:');
      console.log('  /mcp edit     - Edit MCP configuration');
      console.log('  /mcp validate - Validate MCP configuration');
      console.log('');
    } catch (error) {
      await this.logger.error('Failed to show MCP configuration', error);
      console.error('Error:', error instanceof Error ? error.message : String(error));
    }
  }

  private async editMCPConfig(): Promise<void> {
    try {
      const result = await this.mcpService.editConfig(process.cwd());
      console.log(`MCP configuration updated: ${result.configPath}`);
      console.log('Reload the application to apply the updated configuration.');
    } catch (error) {
      await this.logger.error('MCP config edit failed', error);
      console.error('Error:', error instanceof Error ? error.message : String(error));
    }
  }

  private async validateMCPConfig(): Promise<void> {
    try {
      const result = await this.mcpService.validateConfig(process.cwd());

      if (result.valid) {
        console.log(`MCP configuration is valid. Servers: ${result.serverCount}`);
        console.log(
          `Transports: stdio ${result.transportCounts.stdio}, sse ${result.transportCounts.sse}, http ${result.transportCounts.http}`
        );
        return;
      }

      console.log(
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
        console.log(`- ${error.message}${suffix}`);
      }
    } catch (error) {
      await this.logger.error('MCP config validation failed', error);
      console.error('Error:', error instanceof Error ? error.message : String(error));
    }
  }

  private async executeQuery(
    prompt: string,
    session: Session,
    _options?: CLIOptions
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
    console.log(formattedOutput);
  }
}

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const app = new Application();
  return app.run(args);
}
