/**
 * 文件功能：CLI 参数解析模块，负责解析命令行参数并生成配置选项
 *
 * 核心类：
 * - CLIParser: 命令行参数解析器
 *
 * 核心方法：
 * - parse(): 解析命令行参数数组
 * - getHelpText(): 获取帮助文本
 * - isValidFormat(): 验证输出格式是否有效
 */

import * as dotenv from 'dotenv';

// 加载环境变量配置
dotenv.config();

/**
 * CLI 解析错误类
 */
export class CLIParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CLIParseError';
  }
}

/**
 * 权限模式类型
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

/**
 * 输出格式类型
 */
export type OutputFormat = 'text' | 'json' | 'stream-json' | 'markdown';

/**
 * 配置源类型
 */
export type SettingSource = 'user' | 'project' | 'local';

/**
 * CLI 选项接口
 */
export interface CLIOptions {
  // 基本选项
  print?: boolean; // -p, --print
  prompt?: string; // 查询内容
  continue?: boolean; // -c, --continue
  resume?: string; // --resume <session-id>
  resumeSessionAt?: string; // --resume-at <message-uuid>
  forkSession?: boolean; // --fork

  // 模型和提示
  model?: string; // --model
  systemPrompt?: string; // --system-prompt
  systemPromptFile?: string; // --system-prompt-file
  appendSystemPrompt?: string; // --append-system-prompt

  // 工具和权限
  allowedTools?: string[]; // --allowed-tools
  disallowedTools?: string[]; // --disallowed-tools
  permissionMode?: PermissionMode; // --permission-mode
  allowDangerouslySkipPermissions?: boolean; // --dangerously-skip-permissions

  // 输出
  outputFormat?: OutputFormat; // --output-format
  verbose?: boolean; // --verbose
  includePartialMessages?: boolean; // --include-partial-messages

  // 扩展
  agents?: string; // --agents (JSON 字符串)
  pluginDir?: string; // --plugin-dir
  settingSources?: SettingSource[]; // --setting-sources

  // 高级选项
  maxTurns?: number; // --max-turns
  maxBudgetUsd?: number; // --max-budget-usd
  maxThinkingTokens?: number; // --max-thinking-tokens
  enableFileCheckpointing?: boolean; // --enable-file-checkpointing
  sandbox?: boolean; // --sandbox
  timeout?: number; // --timeout (秒)

  // 其他
  help?: boolean; // -h, --help
  version?: boolean; // -v, --version
}

/**
 * 有效的权限模式列表
 */
const VALID_PERMISSION_MODES: PermissionMode[] = [
  'default',
  'acceptEdits',
  'bypassPermissions',
  'plan',
];

/**
 * 有效的输出格式列表
 */
const VALID_OUTPUT_FORMATS: OutputFormat[] = ['text', 'json', 'stream-json', 'markdown'];

/**
 * 有效的配置源列表
 */
const VALID_SETTING_SOURCES: SettingSource[] = ['user', 'project', 'local'];

/**
 * CLI 参数解析器
 */
export class CLIParser {
  // 从环境变量读取版本号，如果未设置则使用默认值
  private readonly version = process.env.VERSION || '0.1.0';

  /**
   * 解析命令行参数
   * @param args 命令行参数数组
   * @returns 解析后的选项
   * @throws CLIParseError 当参数无效时
   */
  parse(args: string[]): CLIOptions {
    const options: CLIOptions = {};
    let i = 0;

    while (i < args.length) {
      const arg = args[i];

      switch (arg) {
        // 基本选项
        case '-p':
        case '--print':
          options.print = true;
          // 检查下一个参数是否是查询内容（不是以 - 开头）
          if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
            options.prompt = args[++i];
          }
          break;

        case '-c':
        case '--continue':
          options.continue = true;
          break;

        case '--resume':
          options.resume = this.requireValue(args, i, '--resume');
          i++;
          break;

        case '--resume-at':
          options.resumeSessionAt = this.requireValue(args, i, '--resume-at');
          i++;
          break;

        case '--fork':
          options.forkSession = true;
          break;

        // 模型和提示
        case '--model':
          options.model = this.requireValue(args, i, '--model');
          i++;
          break;

        case '--system-prompt':
          options.systemPrompt = this.requireValue(args, i, '--system-prompt');
          i++;
          break;

        case '--system-prompt-file':
          options.systemPromptFile = this.requireValue(args, i, '--system-prompt-file');
          i++;
          break;

        case '--append-system-prompt':
          options.appendSystemPrompt = this.requireValue(args, i, '--append-system-prompt');
          i++;
          break;

        // 工具和权限
        case '--allowed-tools':
          options.allowedTools = this.parseToolList(this.requireValue(args, i, '--allowed-tools'));
          i++;
          break;

        case '--disallowed-tools':
          options.disallowedTools = this.parseToolList(
            this.requireValue(args, i, '--disallowed-tools')
          );
          i++;
          break;

        case '--permission-mode':
          options.permissionMode = this.parsePermissionMode(
            this.requireValue(args, i, '--permission-mode')
          );
          i++;
          break;

        case '--dangerously-skip-permissions':
          options.allowDangerouslySkipPermissions = true;
          break;

        // 输出
        case '--output-format':
          options.outputFormat = this.parseOutputFormat(
            this.requireValue(args, i, '--output-format')
          );
          i++;
          break;

        case '--verbose':
          options.verbose = true;
          break;

        case '--include-partial-messages':
          options.includePartialMessages = true;
          break;

        // 扩展
        case '--agents':
          options.agents = this.requireValue(args, i, '--agents');
          i++;
          break;

        case '--plugin-dir':
          options.pluginDir = this.requireValue(args, i, '--plugin-dir');
          i++;
          break;

        case '--setting-sources':
          options.settingSources = this.parseSettingSources(
            this.requireValue(args, i, '--setting-sources')
          );
          i++;
          break;

        // 高级选项
        case '--max-turns':
          options.maxTurns = this.parseNumber(
            this.requireValue(args, i, '--max-turns'),
            '--max-turns'
          );
          i++;
          break;

        case '--max-budget-usd':
          options.maxBudgetUsd = this.parseNumber(
            this.requireValue(args, i, '--max-budget-usd'),
            '--max-budget-usd'
          );
          i++;
          break;

        case '--max-thinking-tokens':
          options.maxThinkingTokens = this.parseNumber(
            this.requireValue(args, i, '--max-thinking-tokens'),
            '--max-thinking-tokens'
          );
          i++;
          break;

        case '--enable-file-checkpointing':
          options.enableFileCheckpointing = true;
          break;

        case '--sandbox':
          options.sandbox = true;
          break;

        case '--timeout':
          options.timeout = this.parseNumber(this.requireValue(args, i, '--timeout'), '--timeout');
          i++;
          break;

        // 帮助和版本
        case '-h':
        case '--help':
          options.help = true;
          break;

        case '-v':
        case '--version':
          options.version = true;
          break;

        default:
          // 检查是否是未知选项
          if (arg.startsWith('-')) {
            throw new CLIParseError(`Unknown option: ${arg}`);
          }
          // 如果不是选项，可能是位置参数（查询内容）
          if (!options.prompt) {
            options.prompt = arg;
          }
          break;
      }

      i++;
    }

    return options;
  }

  /**
   * 获取帮助文本
   */
  getHelpText(): string {
    return `
claude-replica - Claude Code 智能代码助手命令行工具

用法:
  claude-replica [选项] [查询内容]
  claude-replica -p "查询内容"

基本选项:
  -p, --print <query>              非交互模式执行查询并退出
  -c, --continue                   继续最近的会话
  --resume <session-id>            恢复指定的会话
  --resume-at <message-uuid>       从指定消息恢复会话
  --fork                           分叉当前会话
  -h, --help                       显示帮助信息
  -v, --version                    显示版本号

模型选项:
  --model <name>                   选择模型 (sonnet, haiku, opus)
  --system-prompt <text>           设置系统提示词
  --system-prompt-file <path>      从文件加载系统提示词
  --append-system-prompt <text>    追加系统提示词

工具和权限:
  --allowed-tools <tools>          允许的工具列表 (逗号分隔)
  --disallowed-tools <tools>       禁止的工具列表 (逗号分隔)
  --permission-mode <mode>         权限模式 (default, acceptEdits, bypassPermissions, plan)
  --dangerously-skip-permissions   跳过所有权限检查 (危险)

输出选项:
  --output-format <format>         输出格式 (text, json, stream-json, markdown)
  --verbose                        详细输出模式
  --include-partial-messages       包含部分消息

扩展选项:
  --agents <json>                  子代理配置 (JSON 字符串)
  --plugin-dir <path>              插件目录路径
  --setting-sources <sources>      配置源 (user, project, local)

高级选项:
  --max-turns <n>                  最大对话轮数
  --max-budget-usd <amount>        最大预算 (美元)
  --max-thinking-tokens <n>        最大思考 token 数
  --enable-file-checkpointing      启用文件检查点
  --sandbox                        启用沙箱模式
  --timeout <seconds>              执行超时时间 (秒，用于 CI/CD)

示例:
  claude-replica                   启动交互式会话
  claude-replica -p "解释这段代码"  非交互模式查询
  claude-replica -c                继续最近的会话
  claude-replica --model haiku     使用 Haiku 模型
`.trim();
  }

  /**
   * 获取版本号
   */
  getVersion(): string {
    return this.version;
  }

  /**
   * 要求参数值存在
   */
  private requireValue(args: string[], index: number, optionName: string): string {
    if (index + 1 >= args.length || args[index + 1].startsWith('-')) {
      throw new CLIParseError(`Option ${optionName} requires a value`);
    }
    return args[index + 1];
  }

  /**
   * 解析工具列表
   */
  private parseToolList(value: string): string[] {
    return value
      .split(',')
      .map((tool) => tool.trim())
      .filter((tool) => tool.length > 0);
  }

  /**
   * 解析权限模式
   */
  private parsePermissionMode(value: string): PermissionMode {
    if (!VALID_PERMISSION_MODES.includes(value as PermissionMode)) {
      throw new CLIParseError(
        `Invalid permission mode: ${value}. Valid values: ${VALID_PERMISSION_MODES.join(', ')}`
      );
    }
    return value as PermissionMode;
  }

  /**
   * 解析输出格式
   */
  private parseOutputFormat(value: string): OutputFormat {
    if (!VALID_OUTPUT_FORMATS.includes(value as OutputFormat)) {
      throw new CLIParseError(
        `Invalid output format: ${value}. Valid values: ${VALID_OUTPUT_FORMATS.join(', ')}`
      );
    }
    return value as OutputFormat;
  }

  /**
   * 解析配置源列表
   */
  private parseSettingSources(value: string): SettingSource[] {
    const sources = value.split(',').map((s) => s.trim()) as SettingSource[];
    for (const source of sources) {
      if (!VALID_SETTING_SOURCES.includes(source)) {
        throw new CLIParseError(
          `Invalid setting source: ${source}. Valid values: ${VALID_SETTING_SOURCES.join(', ')}`
        );
      }
    }
    return sources;
  }

  /**
   * 解析数字
   */
  private parseNumber(value: string, optionName: string): number {
    const num = parseFloat(value);
    if (isNaN(num)) {
      throw new CLIParseError(`Option ${optionName} requires a numeric value, but received: ${value}`);
    }
    return num;
  }
}
