#!/usr/bin/env node

/**
 * 文件功能：主程序入口，负责初始化应用程序、解析命令行参数、管理会话和执行查询
 *
 * 核心类：
 * - Logger: 应用程序日志记录器，提供分级日志记录功能
 * - Application: 应用程序主类，协调所有子系统
 *
 * 核心方法：
 * - main(): 主程序入口函数
 * - Application.run(): 运行应用程序主循环
 * - Application.runInteractive(): 运行交互式模式
 * - Application.runNonInteractive(): 运行非交互式模式
 * - Application.executeQuery(): 执行 SDK 查询
 */

import * as dotenv from 'dotenv';

// 在所有其他模块加载之前初始化环境变量
dotenv.config();

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { CLIParser, CLIOptions, CLIParseError } from './cli/CLIParser';
import { ConfigManager, UserConfig, ProjectConfig, EnvConfig } from './config';
import { SessionManager, Session } from './core/SessionManager';
import { MessageRouter } from './core/MessageRouter';
import { StreamingMessageProcessor } from './core/StreamingMessageProcessor';
import { PermissionManager, PermissionConfig } from './permissions/PermissionManager';
import { ToolRegistry } from './tools/ToolRegistry';
import { InteractiveUI, Snapshot as UISnapshot } from './ui/InteractiveUI';
import { SkillManager } from './skills/SkillManager';
import { CommandManager } from './commands/CommandManager';
import { AgentRegistry } from './agents/AgentRegistry';
import { HookManager } from './hooks/HookManager';
import { MCPManager } from './mcp/MCPManager';
import { RewindManager, Snapshot as RewindSnapshot } from './rewind/RewindManager';
import {
  OutputFormatter,
  QueryResult as OutputQueryResult,
  OutputFormat,
} from './output/OutputFormatter';
import { SecurityManager } from './security/SecurityManager';
import {
  CISupport,
  CIDetector,
  StructuredLogger,
  TimeoutManager,
  TimeoutError,
  ExitCodes,
  type CIConfig,
  type TimeoutConfig,
} from './ci/CISupport';
import { SDKQueryExecutor, SDKErrorType, ERROR_MESSAGES } from './sdk';

/**
 * 应用程序版本号（从环境变量读取，默认 0.1.0）
 */
const VERSION = process.env.VERSION || '0.1.0';

// 导出 CI 相关类型和类，供外部使用
export {
  CISupport,
  CIDetector,
  StructuredLogger,
  TimeoutManager,
  TimeoutError,
  ExitCodes,
  type CIConfig,
  type TimeoutConfig,
};

/**
 * 日志目录路径
 */
const LOG_DIR = path.join(os.homedir(), '.claude-replica', 'logs');

/**
 * 日志级别
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 日志记录器类
 */
class Logger {
  private readonly logFile: string;
  private readonly verbose: boolean;
  private readonly debugMode: boolean;
  private readonly securityManager: SecurityManager;

  constructor(verbose = false, securityManager?: SecurityManager) {
    this.verbose = verbose;
    this.debugMode = EnvConfig.isDebugMode();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(LOG_DIR, `claude-replica-${timestamp}.log`);
    this.securityManager = securityManager || new SecurityManager();
  }

  /**
   * 初始化日志目录
   */
  async init(): Promise<void> {
    await fs.mkdir(LOG_DIR, { recursive: true });
  }

  /**
   * 记录日志
   */
  async log(level: LogLevel, message: string, data?: unknown): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data: data ? this.securityManager.sanitizeLogData(data) : undefined,
    };

    // 写入日志文件
    try {
      await fs.appendFile(this.logFile, JSON.stringify(logEntry) + '\n', 'utf-8');
    } catch {
      // 忽略日志写入错误
    }

    // 控制台输出
    if (this.verbose || this.debugMode || level === 'error') {
      const prefix = this.getLogPrefix(level);
      if (level === 'error') {
        console.error(`${prefix} ${message}`);
      } else if (this.verbose || this.debugMode) {
        console.log(`${prefix} ${message}`);
      }
    }
  }

  debug(message: string, data?: unknown): Promise<void> {
    return this.log('debug', message, data);
  }

  info(message: string, data?: unknown): Promise<void> {
    return this.log('info', message, data);
  }

  warn(message: string, data?: unknown): Promise<void> {
    return this.log('warn', message, data);
  }

  error(message: string, data?: unknown): Promise<void> {
    return this.log('error', message, data);
  }

  /**
   * 获取日志前缀
   */
  private getLogPrefix(level: LogLevel): string {
    const colors: Record<LogLevel, string> = {
      debug: '\x1b[90m',
      info: '\x1b[36m',
      warn: '\x1b[33m',
      error: '\x1b[31m',
    };
    const reset = '\x1b[0m';
    return `${colors[level]}[${level.toUpperCase()}]${reset}`;
  }
}

/**
 * 应用程序类
 */
export class Application {
  private readonly cliParser: CLIParser;
  private readonly configManager: ConfigManager;
  private readonly sessionManager: SessionManager;
  private readonly toolRegistry: ToolRegistry;
  private readonly skillManager: SkillManager;
  private readonly commandManager: CommandManager;
  private readonly agentRegistry: AgentRegistry;
  private readonly hookManager: HookManager;
  private readonly mcpManager: MCPManager;
  private readonly outputFormatter: OutputFormatter;
  private readonly securityManager: SecurityManager;
  private readonly sdkExecutor: SDKQueryExecutor;

  private rewindManager: RewindManager | null = null;
  private permissionManager!: PermissionManager;
  private messageRouter!: MessageRouter;
  // 流式消息处理器，用于处理 SDK 返回的流式消息（将在 SDK 集成时使用）
  // @ts-expect-error 预留变量，将在后续 SDK 集成中使用
  private streamingProcessor!: StreamingMessageProcessor;
  private logger!: Logger;
  private ui: InteractiveUI | null = null;
  // 当前会话引用，用于全局访问（将在后续功能中使用）
  // @ts-expect-error 预留变量，将在后续功能中使用
  private currentSession: Session | null = null;
  // 中断标志，用于取消正在进行的操作（将在 SDK 集成时使用）
  // @ts-expect-error 预留变量，将在后续功能中使用
  private isInterrupted = false;
  // 当前的中断控制器，用于取消正在进行的 SDK 查询
  private currentAbortController: AbortController | null = null;
  // CI/CD 支持
  private ciSupport: CISupport | null = null;
  private ciLogger: StructuredLogger | null = null;

  constructor() {
    this.cliParser = new CLIParser();
    this.configManager = new ConfigManager();
    this.sessionManager = new SessionManager();
    this.toolRegistry = new ToolRegistry();
    this.skillManager = new SkillManager();
    this.commandManager = new CommandManager();
    this.agentRegistry = new AgentRegistry();
    this.hookManager = new HookManager();
    this.mcpManager = new MCPManager();
    this.outputFormatter = new OutputFormatter();
    this.securityManager = new SecurityManager();
    this.sdkExecutor = new SDKQueryExecutor();
  }

  /**
   * 运行应用程序
   */
  async run(args: string[]): Promise<number> {
    try {
      // 解析命令行参数
      const options = this.cliParser.parse(args);

      // 初始化日志记录器（使用安全管理器进行日志脱敏）
      this.logger = new Logger(options.verbose, this.securityManager);
      await this.logger.init();
      await this.logger.info('应用程序启动', { args });

      // 初始化 CI/CD 支持
      this.initializeCISupport(options);

      // 处理 --help 选项
      if (options.help) {
        console.log(this.cliParser.getHelpText());
        return ExitCodes.SUCCESS;
      }

      // 处理 --version 选项
      if (options.version) {
        console.log(`claude-replica v${VERSION}`);
        return ExitCodes.SUCCESS;
      }

      // 在 CI 环境中记录环境信息
      if (this.ciSupport?.isCI()) {
        // 记录 CI 环境信息
        this.ciLogger?.info('CI 环境检测', this.ciSupport.getSummary() as Record<string, unknown>);
      }

      // 初始化应用程序
      await this.initialize(options);

      // 根据模式执行
      if (options.print || options.prompt) {
        // 非交互模式
        return await this.runNonInteractive(options);
      } else {
        // 在 CI 环境中，如果没有提供查询内容，自动使用非交互模式
        if (this.ciSupport?.isCI()) {
          console.error('错误: CI 环境中必须使用 -p 选项提供查询内容');
          return ExitCodes.CONFIG_ERROR;
        }
        // 交互模式
        return await this.runInteractive(options);
      }
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 初始化 CI/CD 支持
   */
  private initializeCISupport(options: CLIOptions): void {
    // 构建超时配置
    let timeoutConfig: TimeoutConfig | undefined;
    if (options.timeout) {
      timeoutConfig = {
        totalMs: options.timeout * 1000, // 转换为毫秒
      };
    }

    // 创建 CI 支持实例
    this.ciSupport = new CISupport({
      timeout: timeoutConfig,
      structuredLogs: CIDetector.isCI() || options.verbose,
    });

    // 创建结构化日志记录器
    if (this.ciSupport.isCI()) {
      this.ciLogger = this.ciSupport.getLogger();
    }
  }

  /**
   * 初始化应用程序
   */
  private async initialize(options: CLIOptions): Promise<void> {
    await this.logger.debug('初始化应用程序...');

    // 确保配置目录存在
    await this.configManager.ensureUserConfigDir();

    // 加载配置
    const workingDir = process.cwd();
    const userConfig = await this.configManager.loadUserConfig();
    const projectConfig = await this.configManager.loadProjectConfig(workingDir);

    // 合并 CLI 选项到配置
    const mergedConfig = this.mergeOptionsToConfig(options, userConfig, projectConfig);

    // 初始化权限管理器
    const permissionConfig = this.buildPermissionConfig(options, mergedConfig);
    this.permissionManager = new PermissionManager(permissionConfig, this.toolRegistry);

    // 初始化消息路由器
    this.messageRouter = new MessageRouter({
      configManager: this.configManager,
      toolRegistry: this.toolRegistry,
      permissionManager: this.permissionManager,
    });

    // 初始化流式消息处理器
    this.streamingProcessor = new StreamingMessageProcessor();

    // 初始化回退管理器
    this.rewindManager = new RewindManager({
      workingDir,
    });
    await this.rewindManager.initialize();

    // 加载扩展
    await this.loadExtensions(workingDir);

    // 加载 MCP 服务器配置
    await this.loadMCPServers(workingDir);

    await this.logger.debug('应用程序初始化完成');
  }

  /**
   * 合并 CLI 选项到配置
   */
  private mergeOptionsToConfig(
    options: CLIOptions,
    userConfig: UserConfig,
    projectConfig: ProjectConfig
  ): ProjectConfig {
    const merged = this.configManager.mergeConfigs(userConfig, projectConfig);

    // 应用 CLI 选项（最高优先级）
    if (options.model) {
      merged.model = options.model;
    }
    if (options.allowedTools) {
      merged.allowedTools = options.allowedTools;
    }
    if (options.disallowedTools) {
      merged.disallowedTools = options.disallowedTools;
    }
    if (options.permissionMode) {
      merged.permissionMode = options.permissionMode;
    }
    if (options.maxTurns !== undefined) {
      merged.maxTurns = options.maxTurns;
    }
    if (options.maxBudgetUsd !== undefined) {
      merged.maxBudgetUsd = options.maxBudgetUsd;
    }
    if (options.maxThinkingTokens !== undefined) {
      merged.maxThinkingTokens = options.maxThinkingTokens;
    }
    if (options.enableFileCheckpointing) {
      merged.enableFileCheckpointing = options.enableFileCheckpointing;
    }
    if (options.sandbox) {
      merged.sandbox = { enabled: true };
    }

    return merged;
  }

  /**
   * 构建权限配置
   */
  private buildPermissionConfig(options: CLIOptions, config: ProjectConfig): PermissionConfig {
    return {
      mode: options.permissionMode || config.permissionMode || 'default',
      allowedTools: options.allowedTools || config.allowedTools,
      disallowedTools: options.disallowedTools || config.disallowedTools,
      allowDangerouslySkipPermissions: options.allowDangerouslySkipPermissions || false,
    };
  }

  /**
   * 加载扩展（技能、命令、代理、钩子）
   */
  private async loadExtensions(workingDir: string): Promise<void> {
    await this.logger.debug('加载扩展...');

    // 技能目录
    const skillDirs = [
      path.join(os.homedir(), '.claude-replica', 'skills'),
      path.join(workingDir, '.claude-replica', 'skills'),
    ];

    // 命令目录
    const commandDirs = [
      path.join(os.homedir(), '.claude-replica', 'commands'),
      path.join(workingDir, '.claude-replica', 'commands'),
    ];

    // 代理目录
    const agentDirs = [
      path.join(os.homedir(), '.claude-replica', 'agents'),
      path.join(workingDir, '.claude-replica', 'agents'),
    ];

    // 加载扩展
    await Promise.all([
      this.skillManager.loadSkills(skillDirs).catch((err) => this.logger.warn('加载技能失败', err)),
      this.commandManager
        .loadCommands(commandDirs)
        .catch((err) => this.logger.warn('加载命令失败', err)),
      this.agentRegistry
        .loadAgents(agentDirs)
        .catch((err) => this.logger.warn('加载代理失败', err)),
    ]);

    // 加载钩子配置
    const hooksConfigPath = path.join(workingDir, '.claude-replica', 'hooks.json');
    try {
      await fs.access(hooksConfigPath);
      const hooksContent = await fs.readFile(hooksConfigPath, 'utf-8');
      const hooksConfig = JSON.parse(hooksContent);
      this.hookManager.loadHooks(hooksConfig);
    } catch {
      // 钩子配置文件不存在，忽略
    }

    await this.logger.debug('扩展加载完成');
  }

  /**
   * 加载 MCP 服务器配置
   */
  private async loadMCPServers(workingDir: string): Promise<void> {
    const mcpConfigPaths = [path.join(workingDir, '.mcp.json'), path.join(workingDir, 'mcp.json')];

    for (const configPath of mcpConfigPaths) {
      try {
        await this.mcpManager.loadServersFromConfig(configPath);
        await this.logger.debug('MCP 服务器配置已加载', { path: configPath });
        break;
      } catch {
        // 配置文件不存在，继续尝试下一个
      }
    }
  }

  /**
   * 运行交互模式
   */
  private async runInteractive(options: CLIOptions): Promise<number> {
    await this.logger.info('启动交互模式');

    // 创建或恢复会话
    const session = await this.getOrCreateSession(options);
    this.currentSession = session;

    // 设置用户确认回调
    this.permissionManager.setPromptUserCallback(async (message: string) => {
      if (this.ui) {
        return this.ui.promptConfirmation(message);
      }
      return false;
    });

    // 创建交互式 UI
    this.ui = new InteractiveUI({
      onMessage: async (message: string) => {
        await this.handleUserMessage(message, session);
      },
      onInterrupt: () => {
        this.handleInterrupt();
      },
      onRewind: async () => {
        await this.handleRewind(session);
      },
    });

    // 启动 UI
    try {
      await this.ui.start();
      return 0;
    } catch (error) {
      await this.logger.error('交互模式错误', error);
      return 1;
    }
  }

  /**
   * 运行非交互模式
   */
  private async runNonInteractive(options: CLIOptions): Promise<number> {
    await this.logger.info('启动非交互模式');

    // 获取查询内容
    const prompt = options.prompt || (await this.readStdin());
    if (!prompt) {
      console.error('错误: 未提供查询内容');
      return ExitCodes.CONFIG_ERROR;
    }

    // 创建或恢复会话
    const session = await this.getOrCreateSession(options);
    this.currentSession = session;

    // 记录执行开始（CI 模式）
    const startTime = Date.now();
    this.ciLogger?.logStart(prompt, {
      model: options.model,
      sessionId: session.id,
    });

    // 启动超时计时
    if (this.ciSupport) {
      this.ciSupport.startExecution(() => {
        this.ciLogger?.error('执行超时');
      });
    }

    try {
      // 执行查询
      const result = await this.executeQuery(prompt, session, options);

      // 停止超时计时
      this.ciSupport?.endExecution();

      // 检查是否超时
      if (this.ciSupport?.hasTimedOut()) {
        console.error('错误: 执行超时');
        return ExitCodes.TIMEOUT_ERROR;
      }

      // 输出结果
      this.outputResult(result, options.outputFormat || 'text');

      // 记录执行完成（CI 模式）
      const duration = Date.now() - startTime;
      this.ciLogger?.logComplete({
        success: true,
        duration,
      });

      return ExitCodes.SUCCESS;
    } catch (error) {
      // 停止超时计时
      this.ciSupport?.endExecution();

      await this.logger.error('查询执行失败', error);

      // 记录错误（CI 模式）
      if (error instanceof Error) {
        this.ciLogger?.logError(error);
      }

      console.error('错误:', error instanceof Error ? error.message : String(error));

      // 返回适当的退出码
      return CISupport.getExitCode(error instanceof Error ? error : String(error));
    }
  }

  /**
   * 获取或创建会话
   */
  private async getOrCreateSession(options: CLIOptions): Promise<Session> {
    const workingDir = process.cwd();

    // 恢复指定会话
    if (options.resume) {
      await this.logger.debug('恢复会话', { sessionId: options.resume });
      const session = await this.sessionManager.loadSession(options.resume);
      if (!session) {
        throw new Error(`会话不存在: ${options.resume}`);
      }
      if (session.expired) {
        await this.logger.warn('会话已过期', { sessionId: options.resume });
        console.warn('警告: 会话已过期，将创建新会话');
        return this.sessionManager.createSession(workingDir);
      }
      return session;
    }

    // 继续最近的会话
    if (options.continue) {
      await this.logger.debug('继续最近的会话');
      const recentSession = await this.sessionManager.getRecentSession();
      if (recentSession) {
        await this.logger.info('恢复最近会话', { sessionId: recentSession.id });
        return recentSession;
      }
      await this.logger.info('没有可用的最近会话，创建新会话');
    }

    // 创建新会话
    await this.logger.debug('创建新会话');
    const userConfig = await this.configManager.loadUserConfig();
    const projectConfig = await this.configManager.loadProjectConfig(workingDir);

    return this.sessionManager.createSession(workingDir, projectConfig, userConfig);
  }

  /**
   * 处理用户消息
   */
  private async handleUserMessage(message: string, session: Session): Promise<void> {
    // 检查是否是命令
    if (message.startsWith('/')) {
      await this.handleCommand(message, session);
      return;
    }

    try {
      // 显示处理中状态
      if (this.ui) {
        this.ui.displayProgress('正在处理...', 'running');
      }

      // 执行查询
      const result = await this.executeQuery(message, session);

      // 清除进度指示器
      if (this.ui) {
        this.ui.clearProgress();
      }

      // 显示结果
      if (this.ui && result) {
        this.ui.displayMessage(result, 'assistant');
      }
    } catch (error) {
      if (this.ui) {
        this.ui.clearProgress();
        this.ui.displayError(error instanceof Error ? error.message : String(error));
      }
      await this.logger.error('消息处理失败', error);
    }
  }

  /**
   * 处理命令
   */
  private async handleCommand(command: string, _session: Session): Promise<void> {
    const parts = command.slice(1).split(/\s+/);
    const cmdName = parts[0].toLowerCase();
    const cmdArgs = parts.slice(1).join(' ');

    switch (cmdName) {
      case 'help':
        this.showCommandHelp();
        break;

      case 'sessions':
        await this.showSessions();
        break;

      case 'config':
        await this.showConfig();
        break;

      case 'permissions':
        this.showPermissions();
        break;

      case 'mcp':
        this.showMCPStatus();
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

      default:
        // 尝试执行自定义命令
        const customCmd = this.commandManager.getCommand(cmdName);
        if (customCmd) {
          await this.commandManager.executeCommand(cmdName, cmdArgs);
        } else if (this.ui) {
          this.ui.displayError(`未知命令: ${cmdName}。输入 /help 查看可用命令。`);
        }
    }
  }

  /**
   * 显示命令帮助
   */
  private showCommandHelp(): void {
    const helpText = `
可用命令:
  /help        - 显示此帮助信息
  /sessions    - 列出所有会话
  /config      - 显示当前配置
  /permissions - 显示权限设置
  /mcp         - 显示 MCP 服务器状态
  /clear       - 清屏
  /exit        - 退出程序

自定义命令:
${
  this.commandManager
    .listCommands()
    .map((c) => `  /${c.name} - ${c.description}`)
    .join('\n') || '  (无)'
}
`.trim();

    console.log(helpText);
  }

  /**
   * 显示会话列表
   */
  private async showSessions(): Promise<void> {
    const sessions = await this.sessionManager.listSessions();

    if (sessions.length === 0) {
      console.log('没有保存的会话');
      return;
    }

    console.log('\n会话列表:');
    for (const session of sessions) {
      const status = session.expired ? '(已过期)' : '';
      const time = session.lastAccessedAt.toLocaleString();
      console.log(`  ${session.id} - ${time} ${status}`);
    }
    console.log('');
  }

  /**
   * 显示当前配置
   */
  private async showConfig(): Promise<void> {
    const userConfig = await this.configManager.loadUserConfig();
    const projectConfig = await this.configManager.loadProjectConfig(process.cwd());
    const merged = this.configManager.mergeConfigs(userConfig, projectConfig);

    console.log('\n当前配置:');
    console.log(JSON.stringify(merged, null, 2));
    console.log('');
  }

  /**
   * 显示权限设置
   */
  private showPermissions(): void {
    const config = this.permissionManager.getConfig();

    console.log('\n权限设置:');
    console.log(`  模式: ${config.mode}`);
    console.log(`  允许的工具: ${config.allowedTools?.join(', ') || '(全部)'}`);
    console.log(`  禁止的工具: ${config.disallowedTools?.join(', ') || '(无)'}`);
    console.log(`  跳过权限检查: ${config.allowDangerouslySkipPermissions ? '是' : '否'}`);
    console.log('');
  }

  /**
   * 显示 MCP 服务器状态
   */
  private showMCPStatus(): void {
    const servers = this.mcpManager.listServers();

    if (servers.length === 0) {
      console.log('没有配置 MCP 服务器');
      return;
    }

    console.log('\nMCP 服务器:');
    for (const server of servers) {
      console.log(`  ${server}`);
    }
    console.log('');
  }

  /**
   * 执行查询
   *
   * 使用 SDK 执行真实的 AI 查询，替代之前的模拟响应
   *
   * **验证: 需求 1.1, 2.2, 2.3, 3.2**
   */
  private async executeQuery(
    prompt: string,
    session: Session,
    _options?: CLIOptions
  ): Promise<string> {
    // 添加用户消息到会话
    await this.sessionManager.addMessage(session, {
      role: 'user',
      content: prompt,
    });

    // 构建查询
    const message = {
      id: '',
      role: 'user' as const,
      content: prompt,
      timestamp: new Date(),
    };

    const queryResult = await this.messageRouter.routeMessage(message, session);

    await this.logger.debug('查询构建完成', {
      prompt: queryResult.prompt,
      model: queryResult.options.model,
    });

    // 创建 AbortController 用于中断支持
    this.currentAbortController = new AbortController();

    try {
      // 调用 SDK 执行查询
      // 注意：canUseTool 和 mcpServers 类型需要在 SDK 层面处理兼容性
      const sdkResult = await this.sdkExecutor.execute({
        prompt: queryResult.prompt,
        model: queryResult.options.model,
        systemPrompt: queryResult.options.systemPrompt,
        allowedTools: queryResult.options.allowedTools,
        disallowedTools: queryResult.options.disallowedTools,
        cwd: queryResult.options.cwd,
        permissionMode: queryResult.options.permissionMode,
        // canUseTool 类型不兼容，暂时不传递，由 SDK 使用默认权限处理
        // canUseTool: queryResult.options.canUseTool,
        maxTurns: queryResult.options.maxTurns,
        maxBudgetUsd: queryResult.options.maxBudgetUsd,
        maxThinkingTokens: queryResult.options.maxThinkingTokens,
        // mcpServers 类型需要转换，暂时使用类型断言
        mcpServers: queryResult.options.mcpServers as Parameters<typeof this.sdkExecutor.execute>[0]['mcpServers'],
        agents: queryResult.options.agents as Parameters<typeof this.sdkExecutor.execute>[0]['agents'],
        sandbox: queryResult.options.sandbox,
        abortController: this.currentAbortController,
        // 会话恢复支持 (Requirement 3.2)
        // 如果会话有 SDK 会话 ID，则传递给 SDK 以恢复历史消息
        resume: session.sdkSessionId,
      });

      // 记录使用统计
      if (sdkResult.usage) {
        await this.logger.info('Token 使用统计', {
          inputTokens: sdkResult.usage.inputTokens,
          outputTokens: sdkResult.usage.outputTokens,
          totalCostUsd: sdkResult.totalCostUsd,
          durationMs: sdkResult.durationMs,
        });
      }

      // 处理错误结果 (Requirement 2.3)
      if (sdkResult.isError) {
        throw new Error(sdkResult.errorMessage || '查询执行失败');
      }

      // 保存 SDK 会话 ID 以便后续恢复 (Requirement 3.2)
      if (sdkResult.sessionId && sdkResult.sessionId !== session.sdkSessionId) {
        session.sdkSessionId = sdkResult.sessionId;
        await this.sessionManager.saveSession(session);
        await this.logger.debug('已保存 SDK 会话 ID', { sdkSessionId: sdkResult.sessionId });
      }

      // 添加助手消息到会话，包含 usage 统计信息 (Requirement 2.2, 3.1, 3.3)
      await this.sessionManager.addMessage(session, {
        role: 'assistant',
        content: sdkResult.response,
        usage: sdkResult.usage ? {
          inputTokens: sdkResult.usage.inputTokens,
          outputTokens: sdkResult.usage.outputTokens,
          totalCostUsd: sdkResult.totalCostUsd,
          durationMs: sdkResult.durationMs,
        } : undefined,
      });

      return sdkResult.response;
    } finally {
      this.currentAbortController = null;
    }
  }

  /**
   * 处理中断
   *
   * 当用户触发中断（Ctrl+C）时调用此方法
   * 会中止当前正在进行的 SDK 查询并显示中断状态
   *
   * **验证: 需求 4.1, 4.2, 4.3**
   */
  private handleInterrupt(): void {
    this.isInterrupted = true;
    this.logger.info('用户中断操作');

    // 调用 AbortController.abort() 中断正在进行的 SDK 查询 (Requirement 4.1)
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.logger.debug('已发送中断信号到 SDK 查询');
    }

    // 中断 SDKQueryExecutor（如果正在执行）
    if (this.sdkExecutor.isRunning()) {
      this.sdkExecutor.interrupt();
    }

    // 显示中断警告消息 (Requirement 4.3)
    if (this.ui) {
      this.ui.displayWarning(ERROR_MESSAGES[SDKErrorType.INTERRUPTED]);
    }
  }

  /**
   * 处理回退
   */
  private async handleRewind(_session: Session): Promise<void> {
    await this.logger.info('打开回退菜单');

    if (!this.rewindManager) {
      if (this.ui) {
        this.ui.displayWarning('回退管理器未初始化');
      }
      return;
    }

    // 获取快照列表
    const snapshots = await this.rewindManager.listSnapshots();

    if (snapshots.length === 0) {
      if (this.ui) {
        this.ui.displayWarning('没有可用的回退点');
      }
      return;
    }

    // 转换为 UI 快照格式
    const uiSnapshots: UISnapshot[] = snapshots.map((s: RewindSnapshot) => ({
      id: s.id,
      timestamp: s.timestamp,
      description: s.description,
      files: Array.from(s.files.keys()),
    }));

    // 显示回退菜单
    if (this.ui) {
      const selected = await this.ui.showRewindMenu(uiSnapshots);

      if (selected) {
        try {
          await this.rewindManager.restoreSnapshot(selected.id);
          this.ui.displaySuccess(`已回退到: ${selected.description}`);
          await this.logger.info('回退成功', { snapshotId: selected.id });
        } catch (error) {
          this.ui.displayError(
            `回退失败: ${error instanceof Error ? error.message : String(error)}`
          );
          await this.logger.error('回退失败', error);
        }
      }
    }
  }

  /**
   * 从 stdin 读取输入
   */
  private async readStdin(): Promise<string | null> {
    // 检查是否有管道输入
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

      // 设置超时
      setTimeout(() => {
        resolve(data.trim() || null);
      }, 1000);
    });
  }

  /**
   * 输出结果
   * @param result 查询结果字符串
   * @param format 输出格式
   */
  private outputResult(result: string, format: string): void {
    // 构建查询结果对象
    const queryResult: OutputQueryResult = {
      content: result,
      success: true,
    };

    // 验证格式是否有效
    const outputFormat: OutputFormat = this.outputFormatter.isValidFormat(format)
      ? (format as OutputFormat)
      : 'text';

    // 使用格式化器输出
    const formattedOutput = this.outputFormatter.format(queryResult, outputFormat);
    console.log(formattedOutput);
  }

  /**
   * 输出带有完整信息的结果
   * @param queryResult 完整的查询结果对象
   * @param format 输出格式
   * @internal 此方法将在 SDK 集成后使用，用于输出包含工具调用和元数据的完整结果
   */
  // @ts-expect-error 预留方法，将在后续 SDK 集成中使用
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private outputFullResult(queryResult: OutputQueryResult, format: string): void {
    // 验证格式是否有效
    const outputFormat: OutputFormat = this.outputFormatter.isValidFormat(format)
      ? (format as OutputFormat)
      : 'text';

    // 使用格式化器输出
    const formattedOutput = this.outputFormatter.format(queryResult, outputFormat);
    console.log(formattedOutput);
  }

  /**
   * 处理错误
   */
  private handleError(error: unknown): number {
    if (error instanceof CLIParseError) {
      console.error(`Argument error: ${error.message}`);
      console.error('Use --help for help information');
      return ExitCodes.CONFIG_ERROR;
    }

    if (error instanceof TimeoutError) {
      console.error(`超时错误: ${error.message}`);
      this.ciLogger?.logError(error);
      return ExitCodes.TIMEOUT_ERROR;
    }

    if (error instanceof Error) {
      // 网络错误处理
      if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        console.error('网络错误: 无法连接到服务器，请检查网络连接');
        console.error('提示: 将自动重试...');
        this.ciLogger?.logError(error, { type: 'network' });
        return ExitCodes.NETWORK_ERROR;
      }

      // API 错误处理
      if (
        error.message.includes('API') ||
        error.message.includes('401') ||
        error.message.includes('403')
      ) {
        console.error('API 错误: 认证失败，请检查 ANTHROPIC_API_KEY 环境变量');
        this.ciLogger?.logError(error, { type: 'auth' });
        return ExitCodes.AUTH_ERROR;
      }

      console.error(`错误: ${error.message}`);
      this.ciLogger?.logError(error);

      // 详细模式下显示堆栈
      if (EnvConfig.isDebugMode()) {
        console.error(error.stack);
      }

      return CISupport.getExitCode(error);
    } else {
      console.error('未知错误:', error);
      return ExitCodes.ERROR;
    }
  }
}

/**
 * 主函数
 */
export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const app = new Application();
  return app.run(args);
}

// 如果直接运行此文件
if (require.main === module) {
  main()
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((error) => {
      console.error('致命错误:', error);
      process.exit(1);
    });
}
