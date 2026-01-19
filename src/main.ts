#!/usr/bin/env node

/**
 * 文件功能：主程序入口，负责初始化应用程序、解析命令行参数、管理会话和执行查询。
 *
 * 作用说明：装配核心子系统并选择 Runner 执行 CLI 流程。
 *
 * 核心导出：
 * - Application
 * - main
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
import type { HookEvent, HookConfig } from './config/SDKConfigLoader';
import { SessionManager } from './core/SessionManager';
import { MessageRouter } from './core/MessageRouter';
import { StreamingMessageProcessor } from './core/StreamingMessageProcessor';
import { PermissionManager } from './permissions/PermissionManager';
import { ToolRegistry } from './tools/ToolRegistry';
import { UIFactoryRegistry } from './ui/factories/UIFactoryRegistry';
import type { UIFactory } from './ui/factories/UIFactory';
import type { OptionsInterface } from './ui/OptionsInterface';
import type { OutputInterface } from './ui/OutputInterface';
import type { ParserInterface } from './ui/ParserInterface';
import { HookManager } from './hooks/HookManager';
import { MCPManager } from './mcp/MCPManager';
import { MCPService } from './mcp/MCPService';
import { CheckpointManager } from './checkpoint/CheckpointManager';
import { OutputFormatter } from './output/OutputFormatter';
import { SecurityManager } from './security/SecurityManager';
import { SDKQueryExecutor } from './sdk';
import { Logger } from './logging/Logger';
import { CustomToolManager } from './custom-tools';
import { RunnerFactory, ApplicationOptions } from './runners';

const VERSION = process.env.VERSION || '0.1.0';
const CHECKPOINT_ENV_FLAG = 'CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING';

/**
 * 会话保留数量（默认 10）
 * 可通过环境变量 SESSION_KEEP_COUNT 配置
 */
const SESSION_KEEP_COUNT = parseInt(process.env.SESSION_KEEP_COUNT || '10', 10);
const EXIT_CODE_SUCCESS = parseInt(process.env.EXIT_CODE_SUCCESS || '0', 10);
const EXIT_CODE_GENERAL_ERROR = parseInt(process.env.EXIT_CODE_GENERAL_ERROR || '1', 10);
const EXIT_CODE_CONFIG_ERROR = parseInt(process.env.EXIT_CODE_CONFIG_ERROR || '2', 10);

export class Application {
  private readonly parser: ParserInterface;
  private readonly output: OutputInterface;
  private readonly configManager: ConfigManager;
  private readonly sessionManager: SessionManager;
  private readonly toolRegistry: ToolRegistry;
  private readonly hookManager: HookManager;
  private readonly mcpManager: MCPManager;
  private readonly mcpService: MCPService;
  private readonly outputFormatter: OutputFormatter;
  private readonly securityManager: SecurityManager;
  private readonly sdkExecutor: SDKQueryExecutor;
  private readonly customToolManager: CustomToolManager;
  private readonly uiFactory: UIFactory;

  private checkpointManager: CheckpointManager | null = null;
  private permissionManager!: PermissionManager;
  private messageRouter!: MessageRouter;
  // @ts-expect-error 流式消息处理器，用于处理 SDK 返回的流式消息（保留引用以便未来扩展）
  private streamingProcessor: StreamingMessageProcessor | null = null;
  private logger!: Logger;
  private runnerFactory!: RunnerFactory;

  constructor(uiFactory: UIFactory) {
    this.uiFactory = uiFactory;
    this.parser = uiFactory.createParser();
    this.output = uiFactory.createOutput();
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
    this.configManager = new ConfigManager(this.logger);
    this.checkpointManager = null;
  }

  async run(args: string[]): Promise<number> {
    try {
      // 1. 解析命令行参数
      const options: OptionsInterface = this.parser.parse(args);

      // 2. 早期返回：help/version（无需完整初始化）
      const earlyExitCode = await this.handleEarlyReturns(options);
      if (earlyExitCode !== null) {
        return earlyExitCode;
      }

      const appOptions = options as ApplicationOptions;

      // 3. 初始化应用（包括 Logger）
      await this.initialize(appOptions);

      // 4. 使用 RunnerFactory 创建并执行 Runner
      const runner = this.runnerFactory.createRunner(appOptions);
      return await runner.run(appOptions);
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
      this.output.success(`${VERSION}`);
      return EXIT_CODE_SUCCESS;
    }

    return null;
  }

  private async initialize(options: ApplicationOptions): Promise<void> {
    // Session cleanup
    await this.sessionManager.cleanOldSessions(SESSION_KEEP_COUNT);

    // Logger initialization
    await this.logger.init();
    await this.logger.info('Application started', { args: process.argv.slice(2) });

    // Ensure user configuration directory exists
    await this.configManager.ensureUserConfigDir();

    const workingDir = process.cwd();

    // Step 1: Load project configuration (including hooks)
    const projectConfig = await this.configManager.loadProjectConfig(workingDir);
    await this.logger.info('Project configuration loaded', {
      hasHooks: !!projectConfig.hooks,
      hasAgents: !!projectConfig.agents,
    });

    // Step 2: Initialize permission manager
    const permissionConfig = await this.configManager.loadPermissionConfig(options, workingDir);
    this.permissionManager = new PermissionManager(
      permissionConfig,
      this.uiFactory,
      this.toolRegistry
    );
    await this.logger.info('Permission manager initialized', {
      mode: permissionConfig.mode,
    });

    // Step 3: Load hooks configuration into HookManager
    if (projectConfig.hooks) {
      try {
        const hookManagerConfig = this.convertHooksToHookManagerFormat(projectConfig.hooks);
        this.hookManager.loadHooks(hookManagerConfig);
        await this.logger.info('Hooks configuration loaded', {
          eventCount: Object.keys(hookManagerConfig).length,
        });
      } catch (error) {
        await this.logger.warn('Failed to load hooks configuration', { error });
        // Continue initialization even if hooks loading fails
      }
    } else {
      try {
        await this.hookManager.loadFromProjectRoot(workingDir);
        const legacyHookConfig = this.hookManager.getConfig();
        if (Object.keys(legacyHookConfig).length > 0) {
          await this.logger.info('Hooks configuration loaded from hooks.json', {
            eventCount: Object.keys(legacyHookConfig).length,
          });
        }
      } catch (error) {
        await this.logger.warn('Failed to load hooks.json configuration', { error });
      }
    }

    // Step 4: Initialize MessageRouter with HookManager
    this.messageRouter = new MessageRouter({
      toolRegistry: this.toolRegistry,
      permissionManager: this.permissionManager,
      workingDirectory: workingDir,
      hookManager: this.hookManager,
    });
    await this.logger.info('Message router initialized');

    // Streaming processor initialization
    this.streamingProcessor = new StreamingMessageProcessor();

    // Custom tools initialization
    await this.customToolManager.initialize();
    await this.customToolManager.registerMcpServers(this.sdkExecutor, this.logger);
    await this.logger.info('Custom tools initialized');

    // MCP initialization
    await this.mcpManager.configureMessageRouter(workingDir, this.messageRouter, this.logger);
    await this.logger.info('MCP servers configured');

    // Checkpointing initialization
    const checkpointingEnabled = process.env[CHECKPOINT_ENV_FLAG] === '1';
    this.checkpointManager = checkpointingEnabled ? new CheckpointManager({}) : null;
    if (checkpointingEnabled) {
      await this.logger.info('File checkpointing enabled');
    }

    // Create RunnerFactory
    this.runnerFactory = new RunnerFactory(
      this.output,
      this.sessionManager,
      this.messageRouter,
      this.sdkExecutor,
      this.outputFormatter,
      this.permissionManager,
      this.mcpService,
      this.checkpointManager,
      this.configManager,
      this.uiFactory,
      this.logger
    );

    await this.logger.info('Application initialized successfully');
  }

  /**
   * Convert hooks configuration from SDKConfigLoader format to HookManager format
   *
   * This conversion is necessary because:
   * - SDKConfigLoader uses HookConfig[] with HookDefinition[] (file format)
   * - HookManager uses HookMatcher[] with Hook[] (runtime format)
   *
   * Each hook definition in the file format is expanded to include the matcher
   * from its parent configuration.
   *
   * @param sdkHooks - Hooks configuration from settings.json
   * @returns Hooks configuration in HookManager format
   */
  private convertHooksToHookManagerFormat(
    sdkHooks: Partial<Record<HookEvent, HookConfig[]>>
  ): import('./hooks/HookManager').HookConfig {
    const result: import('./hooks/HookManager').HookConfig = {};

    for (const [event, configs] of Object.entries(sdkHooks)) {
      if (!configs || configs.length === 0) continue;

      result[event as HookEvent] = configs.map(config => ({
        matcher: config.matcher,
        hooks: config.hooks.map(hookDef => ({
          matcher: config.matcher,
          type: hookDef.type,
          command: hookDef.command,
          prompt: hookDef.prompt,
          script: hookDef.script,
        })),
      }));
    }

    return result;
  }
}

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const uiFactory = UIFactoryRegistry.createUIFactory();
  const app = new Application(uiFactory);
  return app.run(args);
}
