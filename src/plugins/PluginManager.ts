/**
 * 文件功能：插件管理模块，管理插件的安装、卸载、加载和列表功能
 *
 * 核心类：
 * - PluginManager: 插件管理器核心类
 *
 * 核心方法：
 * - installPlugin(): 安装插件（支持本地、Git、市场）
 * - uninstallPlugin(): 卸载插件
 * - loadPlugin(): 加载插件内容
 * - listPlugins(): 列出已安装的插件
 * - reloadPlugins(): 重新加载所有插件
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

import { Command } from '../commands/CommandManager';
import { Agent } from '../agents/AgentRegistry';
import { HookConfig } from '../hooks/HookManager';
import { MCPServerConfigMap } from '../mcp/MCPManager';

const execAsync = promisify(exec);

/**
 * 插件元数据接口
 */
export interface PluginMetadata {
  /** 插件名称 */
  name: string;
  /** 插件版本 */
  version: string;
  /** 插件描述 */
  description: string;
  /** 作者 */
  author?: string;
  /** 仓库地址 */
  repository?: string;
  /** 依赖项 */
  dependencies?: Record<string, string>;
}

/**
 * 插件技能接口
 */
export interface PluginSkill {
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 触发器 */
  triggers?: string[];
  /** 工具列表 */
  tools?: string[];
  /** 技能内容 */
  content: string;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
  /** 源文件路径 */
  sourcePath: string;
}

/**
 * 插件接口
 */
export interface Plugin extends PluginMetadata {
  /** 插件安装路径 */
  installPath: string;
  /** 插件来源类型 */
  sourceType: 'local' | 'git' | 'marketplace';
  /** 插件来源地址 */
  source: string;
  /** 命令列表 */
  commands?: Command[];
  /** 代理列表 */
  agents?: Agent[];
  /** 技能列表 */
  skills?: PluginSkill[];
  /** 钩子配置 */
  hooks?: HookConfig;
  /** MCP 服务器配置 */
  mcpServers?: MCPServerConfigMap;
}

/**
 * 插件内容接口（加载后的内容）
 */
export interface PluginContent {
  /** 命令列表 */
  commands: Command[];
  /** 代理列表 */
  agents: Agent[];
  /** 技能列表 */
  skills: PluginSkill[];
  /** 钩子配置 */
  hooks: HookConfig;
  /** MCP 服务器配置 */
  mcpServers: MCPServerConfigMap;
}

/**
 * 插件安装结果
 */
export interface PluginInstallResult {
  /** 是否成功 */
  success: boolean;
  /** 插件信息 */
  plugin?: Plugin;
  /** 错误信息 */
  error?: string;
}

/**
 * 插件管理器配置
 */
export interface PluginManagerConfig {
  /** 插件安装目录 */
  pluginsDir?: string;
  /** 插件市场 URL */
  marketplaceUrl?: string;
  /** 是否启用调试日志 */
  debug?: boolean;
  /** Git 命令超时（毫秒） */
  gitTimeout?: number;
}

/**
 * 插件来源类型
 */
export type PluginSourceType = 'local' | 'git' | 'marketplace';

/**
 * 插件管理器
 *
 * 负责插件的安装、卸载、加载和管理。
 */
export class PluginManager {
  /** 已安装的插件映射 */
  private plugins: Map<string, Plugin> = new Map();

  /** 插件安装目录 */
  private readonly pluginsDir: string;

  /** 插件市场 URL */
  private readonly marketplaceUrl: string;

  /** 是否启用调试日志 */
  private readonly debug: boolean;

  /** Git 命令超时 */
  private readonly gitTimeout: number;

  constructor(config: PluginManagerConfig = {}) {
    this.pluginsDir = config.pluginsDir ?? path.join(os.homedir(), '.claude', 'plugins');
    this.marketplaceUrl = config.marketplaceUrl ?? 'https://plugins.claude.dev';
    this.debug = config.debug ?? false;
    this.gitTimeout = config.gitTimeout ?? 60000; // 默认 60 秒
  }

  /**
   * 初始化插件管理器
   *
   * 创建插件目录并加载已安装的插件
   */
  async initialize(): Promise<void> {
    await this.ensurePluginsDir();
    await this.loadInstalledPlugins();
  }

  /**
   * 确保插件目录存在
   */
  private async ensurePluginsDir(): Promise<void> {
    try {
      await fs.mkdir(this.pluginsDir, { recursive: true });
    } catch (error) {
      if (this.debug) {
        console.error('Failed to create plugins directory:', error);
      }
    }
  }

  /**
   * 加载已安装的插件
   */
  private async loadInstalledPlugins(): Promise<void> {
    try {
      const entries = await fs.readdir(this.pluginsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = path.join(this.pluginsDir, entry.name);
          try {
            const plugin = await this.loadPlugin(pluginPath);
            if (plugin) {
              this.plugins.set(plugin.name, plugin);
            }
          } catch (error) {
            if (this.debug) {
              console.warn(`Failed to load plugin ${entry.name}:`, error);
            }
          }
        }
      }
    } catch (error) {
      if (this.debug) {
        console.warn('Failed to load installed plugins:', error);
      }
    }
  }

  /**
   * 安装插件
   *
   * 支持从本地目录、Git 仓库和插件市场安装
   *
   * @param source 插件来源（路径、Git URL 或插件名称）
   * @returns 安装结果
   */
  async installPlugin(source: string): Promise<PluginInstallResult> {
    const sourceType = this.detectSourceType(source);

    try {
      let installPath: string;

      switch (sourceType) {
        case 'local':
          installPath = await this.installFromLocal(source);
          break;
        case 'git':
          installPath = await this.installFromGit(source);
          break;
        case 'marketplace':
          installPath = await this.installFromMarketplace(source);
          break;
        default:
          throw new Error(`Unsupported plugin source type: ${sourceType}`);
      }

      const plugin = await this.loadPlugin(installPath);
      if (!plugin) {
        throw new Error('Failed to load installed plugin');
      }

      plugin.sourceType = sourceType;
      plugin.source = source;
      this.plugins.set(plugin.name, plugin);

      if (this.debug) {
        console.log(`Plugin ${plugin.name} installed successfully`);
      }

      return { success: true, plugin };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (this.debug) {
        console.error('Failed to install plugin:', error);
      }
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 检测插件来源类型
   *
   * @param source 插件来源
   * @returns 来源类型
   */
  detectSourceType(source: string): PluginSourceType {
    // Git URL 模式
    if (
      source.startsWith('git@') ||
      source.startsWith('https://github.com') ||
      source.startsWith('https://gitlab.com') ||
      source.startsWith('git://') ||
      source.endsWith('.git')
    ) {
      return 'git';
    }

    // 本地路径模式
    if (
      source.startsWith('/') ||
      source.startsWith('./') ||
      source.startsWith('../') ||
      source.startsWith('~') ||
      /^[a-zA-Z]:[\\/]/.test(source)
    ) {
      return 'local';
    }

    // 默认为插件市场
    return 'marketplace';
  }

  /**
   * 从本地目录安装插件
   *
   * @param sourcePath 本地路径
   * @returns 安装路径
   */
  private async installFromLocal(sourcePath: string): Promise<string> {
    // 展开 ~ 为用户目录
    const expandedPath = sourcePath.startsWith('~')
      ? path.join(os.homedir(), sourcePath.slice(1))
      : path.resolve(sourcePath);

    // 验证源目录存在
    const stat = await fs.stat(expandedPath);
    if (!stat.isDirectory()) {
      throw new Error(`Plugin path is not a directory: ${expandedPath}`);
    }

    // 读取插件元数据
    const metadata = await this.readPluginMetadata(expandedPath);
    if (!metadata) {
      throw new Error('Plugin directory missing valid plugin.json file');
    }

    // 检查是否已安装
    if (this.plugins.has(metadata.name)) {
      throw new Error(`Plugin ${metadata.name} is already installed`);
    }

    // 复制到插件目录
    const targetPath = path.join(this.pluginsDir, metadata.name);
    await this.copyDirectory(expandedPath, targetPath);

    return targetPath;
  }

  /**
   * 从 Git 仓库安装插件
   *
   * @param gitUrl Git URL
   * @returns 安装路径
   */
  private async installFromGit(gitUrl: string): Promise<string> {
    // 从 URL 提取仓库名称
    const repoName = this.extractRepoName(gitUrl);
    const tempPath = path.join(this.pluginsDir, `.temp-${repoName}-${Date.now()}`);

    try {
      // 克隆仓库
      await execAsync(`git clone --depth 1 "${gitUrl}" "${tempPath}"`, {
        timeout: this.gitTimeout,
      });

      // 读取插件元数据
      const metadata = await this.readPluginMetadata(tempPath);
      if (!metadata) {
        throw new Error('Git repository missing valid plugin.json file');
      }

      // 检查是否已安装
      if (this.plugins.has(metadata.name)) {
        throw new Error(`Plugin ${metadata.name} is already installed`);
      }

      // 移动到最终位置
      const targetPath = path.join(this.pluginsDir, metadata.name);
      await fs.rename(tempPath, targetPath);

      return targetPath;
    } catch (error) {
      // 清理临时目录
      try {
        await fs.rm(tempPath, { recursive: true, force: true });
      } catch {
        // 忽略清理错误
      }
      throw error;
    }
  }

  /**
   * 从插件市场安装插件
   *
   * @param pluginName 插件名称
   * @returns 安装路径
   */
  private async installFromMarketplace(pluginName: string): Promise<string> {
    // 检查是否已安装
    if (this.plugins.has(pluginName)) {
      throw new Error(`Plugin ${pluginName} is already installed`);
    }

    // 构建下载 URL
    const downloadUrl = `${this.marketplaceUrl}/plugins/${pluginName}/latest.tar.gz`;
    const tempPath = path.join(this.pluginsDir, `.temp-${pluginName}-${Date.now()}`);
    const targetPath = path.join(this.pluginsDir, pluginName);

    try {
      // 创建临时目录
      await fs.mkdir(tempPath, { recursive: true });

      // 下载并解压插件
      await execAsync(`curl -sL "${downloadUrl}" | tar -xz -C "${tempPath}"`, {
        timeout: this.gitTimeout,
      });

      // 读取插件元数据
      const metadata = await this.readPluginMetadata(tempPath);
      if (!metadata) {
        throw new Error('Downloaded plugin missing valid plugin.json file');
      }

      // 移动到最终位置
      await fs.rename(tempPath, targetPath);

      return targetPath;
    } catch (error) {
      // 清理临时目录
      try {
        await fs.rm(tempPath, { recursive: true, force: true });
      } catch {
        // 忽略清理错误
      }
      throw error;
    }
  }

  /**
   * 卸载插件
   *
   * @param name 插件名称
   * @returns 是否成功卸载
   */
  async uninstallPlugin(name: string): Promise<boolean> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      if (this.debug) {
        console.warn(`Plugin ${name} is not installed`);
      }
      return false;
    }

    try {
      // 删除插件目录
      await fs.rm(plugin.installPath, { recursive: true, force: true });

      // 从映射中移除
      this.plugins.delete(name);

      if (this.debug) {
        console.log(`Plugin ${name} uninstalled`);
      }

      return true;
    } catch (error) {
      if (this.debug) {
        console.error(`Failed to uninstall plugin ${name}:`, error);
      }
      return false;
    }
  }

  /**
   * 列出所有已安装的插件
   *
   * @returns 插件列表
   */
  listPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * 获取指定插件
   *
   * @param name 插件名称
   * @returns 插件对象或 undefined
   */
  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * 检查插件是否已安装
   *
   * @param name 插件名称
   * @returns 是否已安装
   */
  hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * 获取已安装插件数量
   *
   * @returns 插件数量
   */
  getPluginCount(): number {
    return this.plugins.size;
  }

  /**
   * 加载插件内容
   *
   * 从插件目录加载命令、代理、技能、钩子和 MCP 服务器配置
   *
   * @param directory 插件目录路径
   * @returns 插件对象或 null
   */
  async loadPlugin(directory: string): Promise<Plugin | null> {
    // 读取插件元数据
    const metadata = await this.readPluginMetadata(directory);
    if (!metadata) {
      return null;
    }

    // 加载插件内容
    const content = await this.loadPluginContent(directory);

    return {
      ...metadata,
      installPath: directory,
      sourceType: 'local',
      source: directory,
      commands: content.commands,
      agents: content.agents,
      skills: content.skills,
      hooks: content.hooks,
      mcpServers: content.mcpServers,
    };
  }

  /**
   * 加载插件内容
   *
   * @param directory 插件目录
   * @returns 插件内容
   */
  private async loadPluginContent(directory: string): Promise<PluginContent> {
    const content: PluginContent = {
      commands: [],
      agents: [],
      skills: [],
      hooks: {},
      mcpServers: {},
    };

    // 加载命令
    const commandsDir = path.join(directory, 'commands');
    if (await this.directoryExists(commandsDir)) {
      content.commands = await this.loadCommands(commandsDir);
    }

    // 加载代理
    const agentsDir = path.join(directory, 'agents');
    if (await this.directoryExists(agentsDir)) {
      content.agents = await this.loadAgents(agentsDir);
    }

    // 加载技能
    const skillsDir = path.join(directory, 'skills');
    if (await this.directoryExists(skillsDir)) {
      content.skills = await this.loadSkills(skillsDir);
    }

    // 加载钩子配置
    const hooksPath = path.join(directory, 'hooks.json');
    if (await this.fileExists(hooksPath)) {
      content.hooks = await this.loadHooks(hooksPath);
    }

    // 加载 MCP 服务器配置
    const mcpPaths = [path.join(directory, '.mcp.json'), path.join(directory, 'mcp.json')];
    for (const mcpPath of mcpPaths) {
      if (await this.fileExists(mcpPath)) {
        content.mcpServers = await this.loadMcpServers(mcpPath);
        break;
      }
    }

    return content;
  }

  /**
   * 读取插件元数据
   *
   * @param directory 插件目录
   * @returns 插件元数据或 null
   */
  private async readPluginMetadata(directory: string): Promise<PluginMetadata | null> {
    const metadataPath = path.join(directory, 'plugin.json');

    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(content);

      // 验证必需字段
      if (!metadata.name || typeof metadata.name !== 'string') {
        return null;
      }
      if (!metadata.version || typeof metadata.version !== 'string') {
        return null;
      }

      return {
        name: metadata.name,
        version: metadata.version,
        description: metadata.description || '',
        author: metadata.author,
        repository: metadata.repository,
        dependencies: metadata.dependencies,
      };
    } catch {
      return null;
    }
  }

  /**
   * 加载命令文件
   *
   * @param directory 命令目录
   * @returns 命令列表
   */
  private async loadCommands(directory: string): Promise<Command[]> {
    const commands: Command[] = [];

    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const filePath = path.join(directory, entry.name);
          try {
            const command = await this.parseCommandFile(filePath);
            if (command) {
              commands.push(command);
            }
          } catch (error) {
            if (this.debug) {
              console.warn(`Failed to parse command file ${filePath}:`, error);
            }
          }
        }
      }
    } catch (error) {
      if (this.debug) {
        console.warn(`Failed to load command directory ${directory}:`, error);
      }
    }

    return commands;
  }

  /**
   * 解析命令文件
   *
   * @param filePath 文件路径
   * @returns 命令对象或 null
   */
  private async parseCommandFile(filePath: string): Promise<Command | null> {
    const content = await fs.readFile(filePath, 'utf-8');
    const { frontmatter, body } = this.parseFrontmatter(content);

    if (!body.trim()) {
      return null;
    }

    const name = path.basename(filePath, '.md');

    const rawName = frontmatter.name ?? name;
    const rawDescription = frontmatter.description;

    return {
      name: typeof rawName === 'string' ? rawName : String(rawName),
      description:
        typeof rawDescription === 'string'
          ? rawDescription
          : rawDescription == null
            ? ''
            : String(rawDescription),
      argumentHint: frontmatter.argumentHint as string | undefined,
      allowedTools: frontmatter.allowedTools as string[] | undefined,
      template: body.trim(),
      sourcePath: filePath,
    };
  }

  /**
   * 加载代理文件
   *
   * @param directory 代理目录
   * @returns 代理列表
   */
  private async loadAgents(directory: string): Promise<Agent[]> {
    const agents: Agent[] = [];

    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && this.isAgentFile(entry.name)) {
          const filePath = path.join(directory, entry.name);
          try {
            const agent = await this.parseAgentFile(filePath);
            if (agent) {
              agents.push(agent);
            }
          } catch (error) {
            if (this.debug) {
              console.warn(`Failed to parse agent file ${filePath}:`, error);
            }
          }
        }
      }
    } catch (error) {
      if (this.debug) {
        console.warn(`Failed to load agent directory ${directory}:`, error);
      }
    }

    return agents;
  }

  /**
   * 判断是否为代理文件
   */
  private isAgentFile(filename: string): boolean {
    const lowerName = filename.toLowerCase();
    return filename === 'AGENT.md' || lowerName === 'agent.md' || lowerName.endsWith('.agent.md');
  }

  /**
   * 解析代理文件
   *
   * @param filePath 文件路径
   * @returns 代理对象或 null
   */
  private async parseAgentFile(filePath: string): Promise<Agent | null> {
    const content = await fs.readFile(filePath, 'utf-8');
    const { frontmatter, body } = this.parseFrontmatter(content);

    if (!frontmatter.description && !body.trim()) {
      return null;
    }

    const rawDescription = frontmatter.description;

    return {
      description:
        typeof rawDescription === 'string'
          ? rawDescription
          : rawDescription == null
            ? ''
            : String(rawDescription),
      model: frontmatter.model as 'sonnet' | 'opus' | 'haiku' | 'inherit' | undefined,
      prompt: body.trim(),
      tools: frontmatter.tools as string[] | undefined,
      sourcePath: filePath,
    };
  }

  /**
   * 加载技能文件
   *
   * @param directory 技能目录
   * @returns 技能列表
   */
  private async loadSkills(directory: string): Promise<PluginSkill[]> {
    const skills: PluginSkill[] = [];

    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && this.isSkillFile(entry.name)) {
          const filePath = path.join(directory, entry.name);
          try {
            const skill = await this.parseSkillFile(filePath);
            if (skill) {
              skills.push(skill);
            }
          } catch (error) {
            if (this.debug) {
              console.warn(`Failed to parse skill file ${filePath}:`, error);
            }
          }
        }
      }
    } catch (error) {
      if (this.debug) {
        console.warn(`Failed to load skill directory ${directory}:`, error);
      }
    }

    return skills;
  }

  /**
   * 判断是否为技能文件
   */
  private isSkillFile(filename: string): boolean {
    const lowerName = filename.toLowerCase();
    return filename === 'SKILL.md' || lowerName === 'skill.md' || lowerName.endsWith('.skill.md');
  }

  /**
   * 解析技能文件
   *
   * @param filePath 文件路径
   * @returns 技能对象或 null
   */
  private async parseSkillFile(filePath: string): Promise<PluginSkill | null> {
    const content = await fs.readFile(filePath, 'utf-8');
    const { frontmatter, body } = this.parseFrontmatter(content);

    if (!frontmatter.description && !body.trim()) {
      return null;
    }

    const name = this.extractSkillName(filePath);

    const rawName = frontmatter.name ?? name;
    const rawDescription = frontmatter.description;

    return {
      name: typeof rawName === 'string' ? rawName : String(rawName),
      description:
        typeof rawDescription === 'string'
          ? rawDescription
          : rawDescription == null
            ? ''
            : String(rawDescription),
      triggers: frontmatter.triggers as string[] | undefined,
      tools: frontmatter.tools as string[] | undefined,
      content: body.trim(),
      metadata: this.extractMetadata(frontmatter, ['name', 'description', 'triggers', 'tools']),
      sourcePath: filePath,
    };
  }

  /**
   * 从文件路径提取技能名称
   */
  private extractSkillName(filePath: string): string {
    const basename = path.basename(filePath);
    if (basename.toLowerCase() === 'skill.md') {
      return path.basename(path.dirname(filePath));
    }
    return basename.replace(/\.skill\.md$/i, '').replace(/\.md$/i, '');
  }

  /**
   * 加载钩子配置
   *
   * @param filePath 钩子配置文件路径
   * @returns 钩子配置
   */
  private async loadHooks(filePath: string): Promise<HookConfig> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as HookConfig;
    } catch {
      return {};
    }
  }

  /**
   * 加载 MCP 服务器配置
   *
   * @param filePath MCP 配置文件路径
   * @returns MCP 服务器配置
   */
  private async loadMcpServers(filePath: string): Promise<MCPServerConfigMap> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as MCPServerConfigMap;
    } catch {
      return {};
    }
  }

  /**
   * 解析 YAML frontmatter
   *
   * @param content 文件内容
   * @returns frontmatter 和正文
   */
  private parseFrontmatter(content: string): {
    frontmatter: Record<string, unknown>;
    body: string;
  } {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return { frontmatter: {}, body: content };
    }

    const [, yamlContent, body] = match;
    const frontmatter = this.parseYaml(yamlContent);

    return { frontmatter, body };
  }

  /**
   * 简单的 YAML 解析器
   *
   * @param yaml YAML 内容
   * @returns 解析后的对象
   */
  private parseYaml(yaml: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = yaml.split('\n');
    let currentKey: string | null = null;
    let currentArray: string[] | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      if (trimmed.startsWith('- ')) {
        if (currentKey && currentArray) {
          currentArray.push(trimmed.slice(2).trim());
        }
        continue;
      }

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        if (currentKey && currentArray) {
          result[currentKey] = currentArray;
        }

        const key = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();

        if (value) {
          result[key] = this.parseYamlValue(value);
          currentKey = null;
          currentArray = null;
        } else {
          currentKey = key;
          currentArray = [];
        }
      }
    }

    if (currentKey && currentArray && currentArray.length > 0) {
      result[currentKey] = currentArray;
    }

    return result;
  }

  /**
   * 解析 YAML 值
   */
  private parseYamlValue(value: string): string | number | boolean {
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }

    if (value === 'true') return true;
    if (value === 'false') return false;

    if (/^-?0\d+/.test(value)) {
      return value;
    }

    if (/^-?\d+(\.\d+)?$/.test(value)) {
      const num = Number(value);
      if (!isNaN(num)) return num;
    }

    return value;
  }

  /**
   * 提取元数据（排除已知字段）
   */
  private extractMetadata(
    frontmatter: Record<string, unknown>,
    knownKeys: string[]
  ): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(frontmatter)) {
      if (!knownKeys.includes(key)) {
        metadata[key] = value;
      }
    }
    return metadata;
  }

  /**
   * 从 Git URL 提取仓库名称
   */
  private extractRepoName(gitUrl: string): string {
    // 处理各种 Git URL 格式
    const patterns = [
      /\/([^/]+?)(?:\.git)?$/, // https://github.com/user/repo.git
      /:([^/]+\/[^/]+?)(?:\.git)?$/, // git@github.com:user/repo.git
    ];

    for (const pattern of patterns) {
      const match = gitUrl.match(pattern);
      if (match) {
        return match[1].replace('/', '-');
      }
    }

    // 默认使用时间戳
    return `plugin-${Date.now()}`;
  }

  /**
   * 复制目录
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * 检查目录是否存在
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
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  /**
   * 获取所有插件的命令
   *
   * @returns 命令列表
   */
  getAllCommands(): Command[] {
    const commands: Command[] = [];
    const pluginArray = Array.from(this.plugins.values());
    for (const plugin of pluginArray) {
      if (plugin.commands) {
        commands.push(...plugin.commands);
      }
    }
    return commands;
  }

  /**
   * 获取所有插件的代理
   *
   * @returns 代理列表
   */
  getAllAgents(): Agent[] {
    const agents: Agent[] = [];
    const pluginArray = Array.from(this.plugins.values());
    for (const plugin of pluginArray) {
      if (plugin.agents) {
        agents.push(...plugin.agents);
      }
    }
    return agents;
  }

  /**
   * 获取所有插件的技能
   *
   * @returns 技能列表
   */
  getAllSkills(): PluginSkill[] {
    const skills: PluginSkill[] = [];
    const pluginArray = Array.from(this.plugins.values());
    for (const plugin of pluginArray) {
      if (plugin.skills) {
        skills.push(...plugin.skills);
      }
    }
    return skills;
  }

  /**
   * 获取所有插件的钩子配置
   *
   * @returns 合并后的钩子配置
   */
  getAllHooks(): HookConfig {
    const mergedHooks: HookConfig = {};

    const pluginArray = Array.from(this.plugins.values());
    for (const plugin of pluginArray) {
      if (plugin.hooks) {
        const entries = Object.entries(plugin.hooks);
        for (const [event, matchers] of entries) {
          const eventKey = event as keyof HookConfig;
          if (!mergedHooks[eventKey]) {
            mergedHooks[eventKey] = [];
          }
          if (Array.isArray(matchers)) {
            const hookArray = mergedHooks[eventKey]!;
            for (const matcher of matchers) {
              hookArray.push(matcher);
            }
          }
        }
      }
    }

    return mergedHooks;
  }

  /**
   * 获取所有插件的 MCP 服务器配置
   *
   * @returns 合并后的 MCP 服务器配置
   */
  getAllMcpServers(): MCPServerConfigMap {
    const mergedServers: MCPServerConfigMap = {};

    const pluginArray = Array.from(this.plugins.values());
    for (const plugin of pluginArray) {
      if (plugin.mcpServers) {
        Object.assign(mergedServers, plugin.mcpServers);
      }
    }

    return mergedServers;
  }

  /**
   * 清除所有已加载的插件
   */
  clear(): void {
    this.plugins.clear();
  }

  /**
   * 获取插件安装目录
   */
  getPluginsDir(): string {
    return this.pluginsDir;
  }

  /**
   * 重新加载指定插件
   *
   * @param name 插件名称
   * @returns 是否成功重新加载
   */
  async reloadPlugin(name: string): Promise<boolean> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      return false;
    }

    try {
      const reloaded = await this.loadPlugin(plugin.installPath);
      if (reloaded) {
        reloaded.sourceType = plugin.sourceType;
        reloaded.source = plugin.source;
        this.plugins.set(name, reloaded);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}
