/**
 * 子代理注册表
 *
 * 负责加载、管理和匹配子代理定义
 * 支持从目录加载代理文件，根据任务描述匹配代理
 * 并转换为 SDK 兼容的格式
 *
 * @module AgentRegistry
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * SDK 的 AgentDefinition 类型
 * 用于 query() 函数的 agents 选项
 */
export interface AgentDefinition {
  /** 代理描述 */
  description: string;
  /** 允许使用的工具列表 */
  tools?: string[];
  /** 代理提示词 */
  prompt: string;
  /** 使用的模型 */
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
}

/**
 * 代理接口（用于内部加载和管理）
 */
export interface Agent {
  /** 代理描述 */
  description: string;
  /** 使用的模型 */
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  /** 代理提示词 */
  prompt: string;
  /** 允许使用的工具列表 */
  tools?: string[];
  /** 代理文件来源路径 */
  sourcePath?: string;
  /** 代理来源类型 */
  sourceType?: 'user' | 'project';
  /** 元数据（YAML frontmatter 中的其他字段） */
  metadata?: Record<string, unknown>;
}

/**
 * 代理文件的 YAML frontmatter 结构
 */
interface AgentFrontmatter {
  description?: string;
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  tools?: string[];
  [key: string]: unknown;
}

/**
 * 代理注册表配置
 */
export interface AgentRegistryConfig {
  /** 用户级代理目录 */
  userAgentsDir?: string;
  /** 项目级代理目录 */
  projectAgentsDir?: string;
}

/**
 * 子代理注册表
 *
 * 负责从目录加载代理定义文件，根据任务描述匹配代理，
 * 并转换为 SDK 兼容的格式
 */
export class AgentRegistry {
  /** 已加载的代理映射 */
  private agents: Map<string, Agent> = new Map();

  /** 用户级代理目录 */
  private readonly userAgentsDir: string;

  constructor(config?: AgentRegistryConfig) {
    this.userAgentsDir = config?.userAgentsDir ?? path.join(os.homedir(), '.claude', 'agents');
  }

  /**
   * 从目录加载代理定义文件
   *
   * 支持从多个目录加载代理，后加载的同名代理会覆盖先加载的
   *
   * @param directories - 代理目录列表
   */
  async loadAgents(directories: string[]): Promise<void> {
    this.agents.clear();

    for (const dir of directories) {
      await this.loadAgentsFromDirectory(dir);
    }
  }

  /**
   * 从单个目录加载代理文件
   *
   * @param directory - 代理目录路径
   */
  private async loadAgentsFromDirectory(directory: string): Promise<void> {
    if (!(await this.directoryExists(directory))) {
      return;
    }

    try {
      const files = await this.findAgentFiles(directory);

      for (const file of files) {
        try {
          const agent = await this.parseAgentFile(file);
          if (agent) {
            const name = this.extractAgentName(file);
            // 确定来源类型
            agent.sourceType = directory.includes(os.homedir()) ? 'user' : 'project';
            // 后加载的同名代理覆盖先加载的
            this.agents.set(name, agent);
          }
        } catch (error) {
          console.warn(`警告: 无法解析代理文件 ${file}:`, error);
        }
      }
    } catch (error) {
      console.warn(`警告: 无法读取代理目录 ${directory}:`, error);
    }
  }

  /**
   * 查找目录中的代理文件
   *
   * 支持的文件名格式：
   * - *.agent.md
   * - AGENT.md（使用父目录名作为代理名）
   *
   * @param dir - 目录路径
   * @returns 代理文件路径列表
   */
  private async findAgentFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && this.isAgentFile(entry.name)) {
        files.push(path.join(dir, entry.name));
      } else if (entry.isDirectory()) {
        // 检查子目录中是否有 AGENT.md
        const agentMdPath = path.join(dir, entry.name, 'AGENT.md');
        if (await this.fileExists(agentMdPath)) {
          files.push(agentMdPath);
        }
      }
    }

    return files;
  }

  /**
   * 判断文件是否为代理文件
   *
   * @param filename - 文件名
   * @returns 是否为代理文件
   */
  private isAgentFile(filename: string): boolean {
    const lowerName = filename.toLowerCase();
    return (
      filename === 'AGENT.md' ||
      lowerName === 'agent.md' ||
      lowerName.endsWith('.agent.md')
    );
  }

  /**
   * 从文件路径提取代理名称
   *
   * @param filePath - 文件路径
   * @returns 代理名称
   */
  private extractAgentName(filePath: string): string {
    const basename = path.basename(filePath);

    // 处理 AGENT.md 格式
    if (basename.toLowerCase() === 'agent.md') {
      // 使用父目录名作为代理名
      return path.basename(path.dirname(filePath));
    }

    // 处理 *.agent.md 格式
    return basename.replace(/\.agent\.md$/i, '');
  }

  /**
   * 解析代理文件
   *
   * @param filePath - 代理文件路径
   * @returns 解析后的代理对象
   */
  private async parseAgentFile(filePath: string): Promise<Agent | null> {
    const content = await fs.readFile(filePath, 'utf-8');
    const { frontmatter, body } = this.parseFrontmatter(content);

    // 如果没有描述和内容，代理无效
    if (!frontmatter.description && !body.trim()) {
      return null;
    }

    return {
      description: frontmatter.description ?? '',
      model: frontmatter.model ?? 'inherit',
      prompt: body.trim(),
      tools: frontmatter.tools,
      sourcePath: filePath,
      metadata: this.extractMetadata(frontmatter),
    };
  }

  /**
   * 解析 YAML frontmatter
   *
   * @param content - 文件内容
   * @returns frontmatter 和正文
   */
  private parseFrontmatter(content: string): {
    frontmatter: AgentFrontmatter;
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
  private parseYaml(yaml: string): AgentFrontmatter {
    const result: AgentFrontmatter = {};
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

    // 如果值只是一个引号字符，返回空字符串
    if (value === '"' || value === "'") {
      return '';
    }

    // 布尔值
    if (value === 'true') return true;
    if (value === 'false') return false;

    // 数字 - 只有纯数字才解析为数字，避免 "0e0" 这样的字符串被解析为数字
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      const num = Number(value);
      if (!isNaN(num)) return num;
    }

    return value;
  }

  /**
   * 提取元数据（排除已知字段）
   *
   * @param frontmatter - frontmatter 对象
   * @returns 元数据对象
   */
  private extractMetadata(frontmatter: AgentFrontmatter): Record<string, unknown> {
    const knownKeys = ['description', 'model', 'tools'];
    const metadata: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(frontmatter)) {
      if (!knownKeys.includes(key)) {
        metadata[key] = value;
      }
    }

    return metadata;
  }

  /**
   * 获取指定代理
   *
   * @param name - 代理名称
   * @returns 代理对象或 undefined
   */
  getAgent(name: string): Agent | undefined {
    return this.agents.get(name);
  }

  /**
   * 列出所有代理
   *
   * @returns 代理名称和描述列表
   */
  listAgents(): Array<{ name: string; description: string }> {
    return Array.from(this.agents.entries()).map(([name, agent]) => ({
      name,
      description: agent.description,
    }));
  }

  /**
   * 根据任务描述匹配合适的代理
   *
   * 匹配规则：
   * 1. 检查任务描述是否包含代理描述中的关键词
   * 2. 返回第一个匹配的代理名称
   *
   * @param task - 任务描述
   * @returns 匹配的代理名称或 null
   */
  matchAgent(task: string): string | null {
    if (!task || !task.trim()) {
      return null;
    }

    const taskLower = task.toLowerCase();

    for (const [name, agent] of this.agents.entries()) {
      if (this.isTaskMatch(taskLower, agent.description)) {
        return name;
      }
    }

    return null;
  }

  /**
   * 检查任务是否匹配代理描述
   *
   * @param taskLower - 小写的任务描述
   * @param description - 代理描述
   * @returns 是否匹配
   */
  private isTaskMatch(taskLower: string, description: string): boolean {
    if (!description) {
      return false;
    }

    // 提取描述中的关键词（中文字符或长度 > 2 的英文词）
    const descLower = description.toLowerCase();
    
    // 分割中文和英文词
    const chineseWords = descLower.match(/[\u4e00-\u9fa5]+/g) || [];
    const englishWords = descLower
      .split(/[\s,，、]+/)
      .filter(word => /^[a-zA-Z]+$/.test(word) && word.length > 2);

    const keywords = [...chineseWords, ...englishWords];

    // 检查任务是否包含任一关键词
    return keywords.some(keyword => taskLower.includes(keyword));
  }

  /**
   * 转换为 SDK 格式
   *
   * 用于 query() 函数的 agents 选项
   *
   * @returns SDK 兼容的代理定义映射
   */
  getAgentsForSDK(): Record<string, AgentDefinition> {
    const result: Record<string, AgentDefinition> = {};

    for (const [name, agent] of this.agents.entries()) {
      result[name] = {
        description: agent.description,
        prompt: agent.prompt,
        tools: agent.tools,
        model: agent.model,
      };
    }

    return result;
  }

  /**
   * 获取所有已加载的代理
   *
   * @returns 代理映射的副本
   */
  getAllAgents(): Map<string, Agent> {
    return new Map(this.agents);
  }

  /**
   * 获取代理数量
   *
   * @returns 代理数量
   */
  getAgentCount(): number {
    return this.agents.size;
  }

  /**
   * 清除所有已加载的代理
   */
  clear(): void {
    this.agents.clear();
  }

  /**
   * 获取默认的代理目录列表
   *
   * @param workingDir - 工作目录
   * @returns 代理目录列表（用户级 + 项目级）
   */
  getDefaultAgentDirectories(workingDir: string): string[] {
    return [
      this.userAgentsDir,
      path.join(workingDir, '.claude', 'agents'),
      path.join(workingDir, 'agents'),
    ];
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
   * 检查文件是否存在
   *
   * @param filePath - 文件路径
   * @returns 文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }
}
