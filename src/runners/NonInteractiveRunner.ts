/**
 * 文件功能：实现非交互式运行模式，处理单次查询执行和输出。
 *
 * 核心类：
 * - NonInteractiveRunner: 非交互模式运行器，执行单次查询并输出结果。
 *
 * 核心方法：
 * - run(): 执行非交互模式的主流程。
 * - executeQuery(): 执行查询并返回结果。
 * - readStdin(): 从标准输入读取查询内容。
 * - outputResult(): 格式化并输出查询结果。
 */

import type { ApplicationRunner, ApplicationOptions } from './ApplicationRunner';
import type { OutputInterface } from '../ui/OutputInterface';
import type { MessageRouter } from '../core/MessageRouter';
import type { SDKQueryExecutor } from '../sdk';
import type { SessionManager, Session } from '../core/SessionManager';
import type { OutputFormatter, QueryResult as OutputQueryResult, OutputFormat } from '../output/OutputFormatter';
import type { Logger } from '../logging/Logger';
import type { ConfigManager } from '../config/ConfigManager';

const EXIT_CODE_SUCCESS = parseInt(process.env.EXIT_CODE_SUCCESS || '0', 10);
const EXIT_CODE_GENERAL_ERROR = parseInt(process.env.EXIT_CODE_GENERAL_ERROR || '1', 10);
const EXIT_CODE_CONFIG_ERROR = parseInt(process.env.EXIT_CODE_CONFIG_ERROR || '2', 10);

/** Timeout for reading stdin in milliseconds. Prevents indefinite blocking when 'end' event doesn't fire. */
const STDIN_READ_TIMEOUT_MS = parseInt(process.env.STDIN_READ_TIMEOUT_MS || '1000', 10);

export class NonInteractiveRunner implements ApplicationRunner {
  constructor(
    private readonly output: OutputInterface,
    private readonly sessionManager: SessionManager,
    private readonly messageRouter: MessageRouter,
    private readonly sdkExecutor: SDKQueryExecutor,
    private readonly outputFormatter: OutputFormatter,
    private readonly configManager: ConfigManager,
    private readonly logger: Logger
  ) {}

  async run(options: ApplicationOptions): Promise<number> {
    await this.logger.info('Starting non-interactive mode');
    const prompt = options.prompt || (await this.readStdin());
    if (!prompt) {
      await this.logger.error('Error: No query content provided');
      return EXIT_CODE_CONFIG_ERROR;
    }

    // 创建临时会话对象（不持久化到磁盘）
    const tempSessionId = `temp-${Date.now()}`;
    const now = new Date();
    const workingDir = process.cwd();

    // 加载项目配置并合并 CLI 选项
    const projectConfig = await this.configManager.loadProjectConfig(workingDir);
    const mergedConfig = this.configManager.build(options, projectConfig);

    const tempSession: Session = {
      id: tempSessionId,
      createdAt: now,
      lastAccessedAt: now,
      messages: [],
      context: {
        workingDirectory: workingDir,
        projectConfig: mergedConfig,
        activeAgents: [],
      },
      expired: false,
      workingDirectory: workingDir,
    };

    try {
      const result = await this.executeQuery(prompt, tempSession);
      this.outputResult(result, options.outputFormat || 'text');
      return EXIT_CODE_SUCCESS;
    } catch (error) {
      await this.logger.error('Query execution failed', error);
      this.output.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      return EXIT_CODE_GENERAL_ERROR;
    }
  }

  private async executeQuery(
    prompt: string,
    session: Session,
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

    const queryParams = await this.messageRouter.routeMessage(message, session);

    await this.logger.debug('Query built', {
      ...queryParams,
    });

    const abortController = new AbortController();

    try {
      const sdkResult = await this.sdkExecutor.execute({
        prompt: queryParams.prompt,
        model: queryParams.options.model,
        systemPrompt: queryParams.options.systemPrompt,
        allowedTools: queryParams.options.allowedTools,
        disallowedTools: queryParams.options.disallowedTools,
        cwd: queryParams.options.cwd,
        permissionMode: queryParams.options.permissionMode,
        canUseTool: queryParams.options.canUseTool,
        maxTurns: queryParams.options.maxTurns,
        maxBudgetUsd: queryParams.options.maxBudgetUsd,
        maxThinkingTokens: queryParams.options.maxThinkingTokens,
        mcpServers: queryParams.options.mcpServers,
        agents: queryParams.options.agents,
        sandbox: queryParams.options.sandbox,
        abortController,
        resume: session.sdkSessionId,
      });

      if (sdkResult.isError) {
        throw new Error(sdkResult.errorMessage || 'Query execution failed');
      }

      await this.logger.debug('Query executed successfully');

      return sdkResult.response || '';
    } catch (error) {
      await this.logger.error('SDK execution failed', error);
      throw error;
    }
  }

  /**
   * Reads data from standard input (stdin) for pipe input scenarios.
   *
   * This method handles non-interactive input such as:
   * - `echo "query" | claude-replica`
   * - `cat file.txt | claude-replica`
   *
   * @returns The trimmed stdin content, or null if:
   *          - stdin is a TTY (no pipe input)
   *          - an error occurs during reading
   *          - no data is received
   */
  private async readStdin(): Promise<string | null> {
    // If stdin is a TTY, there's no piped input available
    if (process.stdin.isTTY) {
      return null;
    }

    return new Promise((resolve) => {
      let data = '';

      process.stdin.setEncoding('utf-8');

      // Accumulate data chunks as they arrive
      process.stdin.on('data', (chunk) => {
        data += chunk;
      });

      // Resolve when stdin stream ends (pipe closed)
      process.stdin.on('end', () => {
        resolve(data.trim() || null);
      });

      // Handle read errors gracefully by returning null
      process.stdin.on('error', () => {
        resolve(null);
      });

      // Timeout protection: resolve after 1 second to prevent indefinite blocking
      // This handles edge cases where 'end' event may not fire
      setTimeout(() => {
        resolve(data.trim() || null);
      }, STDIN_READ_TIMEOUT_MS);
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
