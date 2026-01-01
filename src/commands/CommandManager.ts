/**
 * 命令管理器
 *
 * 负责加载、管理和执行自定义命令
 * 支持用户级和项目级命令目录
 * 支持 /project:command 和 /user:command 命名空间
 *
 * @module CommandManager
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * 命令接口
 */
export interface Command {
  /** 命令名称 */
  name: string;
  /** 命令描述 */
  description: string;
  /** 参数提示 */
  argumentHint?: string;
  /** 允许使用的工具列表 */
  allowedTools?: string[];
  /** 命令模板内容 */
  template: string;
  /** 命令文件来源路径 */
  sourcePath?: string;
  /** 命令来源类型 */
  sourceType?: 'user' | 'project';
}

/**
 * 命令文件的 YAML frontmatter 结构
 */
interface CommandFrontmatter {
  name?: string;
  description?: string;
  argumentHint?: string;
  allowedTools?: string[];
  [key: string]: unknown;
}

/**
 * 命令管理器配置
 */
export interface CommandManagerConfig {
  /** 用户级命令目录 */
  userCommandsDir?: string;
  /** 项目级命令目录 */
  projectCommandsDir?: string;
  /** 工作目录（用于执行命令） */
  workingDir?: string;
  /** 用户目录前缀（用于判断是否为用户级目录） */
  userDirPrefix?: string;
}

/**
 * 命令执行结果
 */
export interface CommandExecutionResult {
  /** 执行后的模板内容（已替换参数和命令输出） */
  content: string;
  /** 允许使用的工具列表 */
  allowedTools?: string[];
}

/**
 * 命令管理器
 *
 * 负责从目录加载命令文件，获取和执行命令，
 * 支持参数替换和命令输出嵌入
 */
export class CommandManager {
  /** 已加载的命令（按命名空间组织） */
  private userCommands: Map<string, Command> = new Map();
  private projectCommands: Map<string, Command> = new Map();

  /** 用户级命令目录 */
  private readonly userCommandsDir: string;

  /** 工作目录 */
  private workingDir: string;

  /** 用户目录前缀 */
  private readonly userDirPrefix: string;

  constructor(config?: CommandManagerConfig) {
    this.userCommandsDir = config?.userCommandsDir ?? path.join(os.homedir(), '.claude', 'commands');
    this.workingDir = config?.workingDir ?? process.cwd();
    this.userDirPrefix = config?.userDirPrefix ?? os.homedir();
  }

  /**
   * 从目录加载命令文件
   *
   * 支持从多个目录加载命令，区分用户级和项目级命令
   *
   * @param directories - 命令目录列表
   * @returns 加载的命令列表
   */
  async loadCommands(directories: string[]): Promise<Command[]> {
    this.userCommands.clear();
    this.projectCommands.clear();

    for (const dir of directories) {
      const commands = await this.loadCommandsFromDirectory(dir);
      for (const command of commands) {
        if (command.sourceType === 'user') {
          this.userCommands.set(command.name, command);
        } else {
          this.projectCommands.set(command.name, command);
        }
      }
    }

    return this.getAllCommands();
  }

  /**
   * 从单个目录加载命令文件
   *
   * @param directory - 命令目录路径
   * @returns 加载的命令列表
   */
  private async loadCommandsFromDirectory(directory: string): Promise<Command[]> {
    const commands: Command[] = [];

    if (!(await this.directoryExists(directory))) {
      return commands;
    }

    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && this.isCommandFile(entry.name)) {
          const filePath = path.join(directory, entry.name);
          try {
            const command = await this.parseCommandFile(filePath);
            if (command) {
              // 确定来源类型
              command.sourceType = this.isUserDirectory(directory) ? 'user' : 'project';
              commands.push(command);
            }
          } catch (error) {
            console.warn(`警告: 无法解析命令文件 ${filePath}:`, error);
          }
        }
      }
    } catch (error) {
      console.warn(`警告: 无法读取命令目录 ${directory}:`, error);
    }

    return commands;
  }

  /**
   * 判断目录是否为用户级目录
   *
   * @param directory - 目录路径
   * @returns 是否为用户级目录
   */
  private isUserDirectory(directory: string): boolean {
    return directory.startsWith(this.userDirPrefix) && directory.includes('.claude');
  }

  /**
   * 判断文件是否为命令文件
   *
   * 支持的文件名格式：
   * - *.md (Markdown 文件)
   *
   * @param filename - 文件名
   * @returns 是否为命令文件
   */
  private isCommandFile(filename: string): boolean {
    return filename.endsWith('.md');
  }

  /**
   * 解析命令文件
   *
   * @param filePath - 命令文件路径
   * @returns 解析后的命令对象
   */
  private async parseCommandFile(filePath: string): Promise<Command | null> {
    const content = await fs.readFile(filePath, 'utf-8');
    const { frontmatter, body } = this.parseFrontmatter(content);

    // 从文件名提取默认名称
    const defaultName = this.extractCommandName(filePath);

    // 如果没有模板内容，命令无效
    if (!body.trim()) {
      return null;
    }

    return {
      name: frontmatter.name ?? defaultName,
      description: frontmatter.description ?? '',
      argumentHint: frontmatter.argumentHint,
      allowedTools: frontmatter.allowedTools,
      template: body.trim(),
      sourcePath: filePath,
    };
  }

  /**
   * 从文件路径提取命令名称
   *
   * @param filePath - 文件路径
   * @returns 命令名称
   */
  private extractCommandName(filePath: string): string {
    const basename = path.basename(filePath);
    return basename.replace(/\.md$/i, '');
  }

  /**
   * 解析 YAML frontmatter
   *
   * @param content - 文件内容
   * @returns frontmatter 和正文
   */
  private parseFrontmatter(content: string): {
    frontmatter: CommandFrontmatter;
    body: string;
  } {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return {
        frontmatter: {},
        body: content,
      };
    }

    const [, yamlContent, body] = match;
    const frontmatter = this.parseYaml(yamlContent);

    return { frontmatter, body };
  }

  /**
   * 简单的 YAML 解析器
   *
   * 支持基本的键值对和数组格式
   *
   * @param yaml - YAML 内容
   * @returns 解析后的对象
   */
  private parseYaml(yaml: string): CommandFrontmatter {
    const result: CommandFrontmatter = {};
    const lines = yaml.split('\n');
    let currentKey: string | null = null;
    let currentArray: string[] | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // 跳过空行和注释
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // 检查是否是数组项
      if (trimmed.startsWith('- ')) {
        if (currentKey && currentArray) {
          currentArray.push(trimmed.slice(2).trim());
        }
        continue;
      }

      // 检查是否是键值对
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        // 保存之前的数组
        if (currentKey && currentArray) {
          result[currentKey] = currentArray;
        }

        const key = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();

        if (value) {
          // 直接值
          result[key] = this.parseYamlValue(value);
          currentKey = null;
          currentArray = null;
        } else {
          // 可能是数组的开始
          currentKey = key;
          currentArray = [];
        }
      }
    }

    // 保存最后的数组
    if (currentKey && currentArray && currentArray.length > 0) {
      result[currentKey] = currentArray;
    }

    return result;
  }

  /**
   * 解析 YAML 值
   *
   * @param value - 值字符串
   * @returns 解析后的值
   */
  private parseYamlValue(value: string): string | number | boolean {
    // 去除引号
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    // 布尔值
    if (value === 'true') return true;
    if (value === 'false') return false;

    // 数字
    const num = Number(value);
    if (!isNaN(num)) return num;

    return value;
  }

  /**
   * 获取指定命令
   *
   * 支持命名空间语法：
   * - /command-name - 优先项目级，然后用户级
   * - /project:command-name - 仅项目级
   * - /user:command-name - 仅用户级
   *
   * @param name - 命令名称（可包含命名空间前缀）
   * @returns 命令对象或 undefined
   */
  getCommand(name: string): Command | undefined {
    // 移除开头的 / 如果存在
    const cleanName = name.startsWith('/') ? name.slice(1) : name;

    // 检查命名空间
    if (cleanName.startsWith('project:')) {
      const commandName = cleanName.slice(8);
      return this.projectCommands.get(commandName);
    }

    if (cleanName.startsWith('user:')) {
      const commandName = cleanName.slice(5);
      return this.userCommands.get(commandName);
    }

    // 默认：优先项目级，然后用户级
    return this.projectCommands.get(cleanName) ?? this.userCommands.get(cleanName);
  }

  /**
   * 执行命令模板
   *
   * 处理参数替换 ($ARGUMENTS) 和命令输出嵌入 (!`command`)
   *
   * @param name - 命令名称
   * @param args - 用户提供的参数
   * @returns 执行结果
   */
  async executeCommand(name: string, args: string = ''): Promise<CommandExecutionResult> {
    const command = this.getCommand(name);

    if (!command) {
      throw new Error(`命令未找到: ${name}`);
    }

    let content = command.template;

    // 1. 替换 $ARGUMENTS
    content = this.replaceArguments(content, args);

    // 2. 执行并嵌入命令输出 (!`command`)
    content = await this.embedCommandOutputs(content);

    return {
      content,
      allowedTools: command.allowedTools,
    };
  }

  /**
   * 替换模板中的 $ARGUMENTS 占位符
   *
   * 注意：使用函数作为替换参数，避免 String.replace() 对 $ 的特殊处理
   * 在 replace() 的替换字符串中，$$ 会被解释为单个 $
   *
   * @param template - 模板内容
   * @param args - 用户参数
   * @returns 替换后的内容
   */
  replaceArguments(template: string, args: string): string {
    // 使用函数作为替换参数，避免 $ 的特殊处理
    return template.replace(/\$ARGUMENTS/g, () => args);
  }

  /**
   * 执行并嵌入命令输出
   *
   * 查找 !`command` 语法并替换为命令执行结果
   *
   * @param template - 模板内容
   * @returns 嵌入命令输出后的内容
   */
  async embedCommandOutputs(template: string): Promise<string> {
    // 匹配 !`command` 语法
    const commandPattern = /!\`([^`]+)\`/g;
    const matches = [...template.matchAll(commandPattern)];

    if (matches.length === 0) {
      return template;
    }

    let result = template;

    for (const match of matches) {
      const fullMatch = match[0];
      const command = match[1];

      try {
        const output = await this.executeShellCommand(command);
        result = result.replace(fullMatch, output.trim());
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result = result.replace(fullMatch, `[命令执行失败: ${errorMessage}]`);
      }
    }

    return result;
  }

  /**
   * 执行 shell 命令
   *
   * @param command - 要执行的命令
   * @returns 命令输出
   */
  private async executeShellCommand(command: string): Promise<string> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workingDir,
        timeout: 30000, // 30 秒超时
        maxBuffer: 1024 * 1024, // 1MB 缓冲区
      });

      // 优先返回 stdout，如果为空则返回 stderr
      return stdout || stderr;
    } catch (error: unknown) {
      // 命令执行失败，抛出错误让上层处理
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(String(error));
    }
  }

  /**
   * 列出所有命令
   *
   * @returns 命令列表（包含名称、描述和命名空间）
   */
  listCommands(): Array<{ name: string; description: string; namespace: 'user' | 'project' }> {
    const result: Array<{ name: string; description: string; namespace: 'user' | 'project' }> = [];

    // 添加项目级命令
    for (const [name, command] of this.projectCommands) {
      result.push({
        name,
        description: command.description,
        namespace: 'project',
      });
    }

    // 添加用户级命令（排除与项目级同名的）
    for (const [name, command] of this.userCommands) {
      if (!this.projectCommands.has(name)) {
        result.push({
          name,
          description: command.description,
          namespace: 'user',
        });
      }
    }

    return result;
  }

  /**
   * 获取所有已加载的命令
   *
   * @returns 命令列表
   */
  getAllCommands(): Command[] {
    const commands: Command[] = [];

    // 项目级命令优先
    for (const command of this.projectCommands.values()) {
      commands.push(command);
    }

    // 用户级命令（排除与项目级同名的）
    for (const [name, command] of this.userCommands) {
      if (!this.projectCommands.has(name)) {
        commands.push(command);
      }
    }

    return commands;
  }

  /**
   * 获取默认的命令目录列表
   *
   * @param workingDir - 工作目录
   * @returns 命令目录列表（用户级 + 项目级）
   */
  getDefaultCommandDirectories(workingDir: string): string[] {
    return [
      this.userCommandsDir,
      path.join(workingDir, '.claude', 'commands'),
      path.join(workingDir, 'commands'),
    ];
  }

  /**
   * 设置工作目录
   *
   * @param dir - 工作目录路径
   */
  setWorkingDir(dir: string): void {
    this.workingDir = dir;
  }

  /**
   * 检查目录是否存在
   *
   * @param dirPath - 目录路径
   * @returns 目录是否存在
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * 检查命令是否存在
   *
   * @param name - 命令名称
   * @returns 命令是否存在
   */
  hasCommand(name: string): boolean {
    return this.getCommand(name) !== undefined;
  }

  /**
   * 获取用户级命令数量
   *
   * @returns 用户级命令数量
   */
  getUserCommandCount(): number {
    return this.userCommands.size;
  }

  /**
   * 获取项目级命令数量
   *
   * @returns 项目级命令数量
   */
  getProjectCommandCount(): number {
    return this.projectCommands.size;
  }
}
