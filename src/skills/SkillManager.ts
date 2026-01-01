/**
 * 技能管理器
 *
 * 负责加载、匹配和应用技能模块
 * 支持用户级和项目级技能目录
 * 解析技能文件的 YAML frontmatter 元数据
 *
 * @module SkillManager
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * 技能接口
 */
export interface Skill {
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 触发器列表（关键词或正则表达式） */
  triggers?: string[];
  /** 允许使用的工具列表 */
  tools?: string[];
  /** 技能内容（Markdown 正文） */
  content: string;
  /** 元数据（YAML frontmatter 中的其他字段） */
  metadata: Record<string, unknown>;
  /** 技能文件来源路径 */
  sourcePath?: string;
  /** 技能来源类型 */
  sourceType?: 'user' | 'project';
}

/**
 * 技能文件的 YAML frontmatter 结构
 */
interface SkillFrontmatter {
  name?: string;
  description?: string;
  triggers?: string[];
  tools?: string[];
  [key: string]: unknown;
}

/**
 * 技能管理器配置
 */
export interface SkillManagerConfig {
  /** 用户级技能目录 */
  userSkillsDir?: string;
  /** 项目级技能目录 */
  projectSkillsDir?: string;
}

/**
 * 技能管理器
 *
 * 负责从目录加载技能文件，根据上下文匹配技能，
 * 并将技能内容应用到系统提示词中
 */
export class SkillManager {
  /** 已加载的技能列表 */
  private skills: Skill[] = [];

  /** 用户级技能目录 */
  private readonly userSkillsDir: string;

  constructor(config?: SkillManagerConfig) {
    this.userSkillsDir = config?.userSkillsDir ?? path.join(os.homedir(), '.claude', 'skills');
  }

  /**
   * 从目录加载技能文件
   *
   * 支持从多个目录加载技能，后加载的同名技能会覆盖先加载的
   *
   * @param directories - 技能目录列表
   * @returns 加载的技能列表
   */
  async loadSkills(directories: string[]): Promise<Skill[]> {
    this.skills = [];
    const skillMap = new Map<string, Skill>();

    for (const dir of directories) {
      const dirSkills = await this.loadSkillsFromDirectory(dir);
      for (const skill of dirSkills) {
        // 后加载的同名技能覆盖先加载的
        skillMap.set(skill.name, skill);
      }
    }

    this.skills = Array.from(skillMap.values());
    return this.skills;
  }

  /**
   * 从单个目录加载技能文件
   *
   * @param directory - 技能目录路径
   * @returns 加载的技能列表
   */
  private async loadSkillsFromDirectory(directory: string): Promise<Skill[]> {
    const skills: Skill[] = [];

    if (!(await this.directoryExists(directory))) {
      return skills;
    }

    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && this.isSkillFile(entry.name)) {
          const filePath = path.join(directory, entry.name);
          try {
            const skill = await this.parseSkillFile(filePath);
            if (skill) {
              // 确定来源类型
              skill.sourceType = directory.includes(os.homedir()) ? 'user' : 'project';
              skills.push(skill);
            }
          } catch (error) {
            console.warn(`警告: 无法解析技能文件 ${filePath}:`, error);
          }
        }
      }
    } catch (error) {
      console.warn(`警告: 无法读取技能目录 ${directory}:`, error);
    }

    return skills;
  }

  /**
   * 判断文件是否为技能文件
   *
   * 支持的文件名格式：
   * - SKILL.md
   * - *.skill.md
   * - *.SKILL.md
   *
   * @param filename - 文件名
   * @returns 是否为技能文件
   */
  private isSkillFile(filename: string): boolean {
    const lowerName = filename.toLowerCase();
    return (
      filename === 'SKILL.md' ||
      lowerName === 'skill.md' ||
      lowerName.endsWith('.skill.md')
    );
  }

  /**
   * 解析技能文件
   *
   * @param filePath - 技能文件路径
   * @returns 解析后的技能对象
   */
  private async parseSkillFile(filePath: string): Promise<Skill | null> {
    const content = await fs.readFile(filePath, 'utf-8');
    const { frontmatter, body } = this.parseFrontmatter(content);

    // 从文件名提取默认名称
    const defaultName = this.extractSkillName(filePath);

    // 如果没有描述，技能无效
    if (!frontmatter.description && !body.trim()) {
      return null;
    }

    return {
      name: frontmatter.name ?? defaultName,
      description: frontmatter.description ?? '',
      triggers: frontmatter.triggers,
      tools: frontmatter.tools,
      content: body.trim(),
      metadata: this.extractMetadata(frontmatter),
      sourcePath: filePath,
    };
  }

  /**
   * 从文件路径提取技能名称
   *
   * @param filePath - 文件路径
   * @returns 技能名称
   */
  private extractSkillName(filePath: string): string {
    const basename = path.basename(filePath);

    // 处理 SKILL.md 格式
    if (basename.toLowerCase() === 'skill.md') {
      // 使用父目录名作为技能名
      return path.basename(path.dirname(filePath));
    }

    // 处理 *.skill.md 格式
    return basename.replace(/\.skill\.md$/i, '').replace(/\.md$/i, '');
  }

  /**
   * 解析 YAML frontmatter
   *
   * @param content - 文件内容
   * @returns frontmatter 和正文
   */
  private parseFrontmatter(content: string): {
    frontmatter: SkillFrontmatter;
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
  private parseYaml(yaml: string): SkillFrontmatter {
    const result: SkillFrontmatter = {};
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
   * 提取元数据（排除已知字段）
   *
   * @param frontmatter - frontmatter 对象
   * @returns 元数据对象
   */
  private extractMetadata(frontmatter: SkillFrontmatter): Record<string, unknown> {
    const knownKeys = ['name', 'description', 'triggers', 'tools'];
    const metadata: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(frontmatter)) {
      if (!knownKeys.includes(key)) {
        metadata[key] = value;
      }
    }

    return metadata;
  }

  /**
   * 根据上下文匹配技能
   *
   * 匹配规则：
   * 1. 如果技能有 triggers，检查上下文是否包含任一触发器
   * 2. 如果技能有 description，检查上下文是否包含描述中的关键词
   *
   * @param context - 对话上下文或用户消息
   * @returns 匹配的技能列表
   */
  matchSkills(context: string): Skill[] {
    if (!context || !context.trim()) {
      return [];
    }

    const contextLower = context.toLowerCase();
    const matchedSkills: Skill[] = [];

    for (const skill of this.skills) {
      if (this.isSkillMatch(skill, contextLower)) {
        matchedSkills.push(skill);
      }
    }

    return matchedSkills;
  }

  /**
   * 检查技能是否匹配上下文
   *
   * @param skill - 技能对象
   * @param contextLower - 小写的上下文字符串
   * @returns 是否匹配
   */
  private isSkillMatch(skill: Skill, contextLower: string): boolean {
    // 检查触发器
    if (skill.triggers && skill.triggers.length > 0) {
      for (const trigger of skill.triggers) {
        // 尝试作为正则表达式匹配
        try {
          const regex = new RegExp(trigger, 'i');
          if (regex.test(contextLower)) {
            return true;
          }
        } catch {
          // 如果不是有效的正则，作为普通字符串匹配
          if (contextLower.includes(trigger.toLowerCase())) {
            return true;
          }
        }
      }
    }

    // 检查描述中的关键词
    if (skill.description) {
      const descWords = skill.description.toLowerCase().split(/\s+/);
      // 至少匹配描述中的一个重要词（长度 > 3）
      for (const word of descWords) {
        if (word.length > 3 && contextLower.includes(word)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 将技能内容应用到系统提示词
   *
   * @param skills - 要应用的技能列表
   * @param baseSystemPrompt - 基础系统提示词
   * @returns 包含技能内容的系统提示词
   */
  applySkills(skills: Skill[], baseSystemPrompt: string): string {
    if (skills.length === 0) {
      return baseSystemPrompt;
    }

    let prompt = baseSystemPrompt;

    for (const skill of skills) {
      prompt += `\n\n## Skill: ${skill.name}\n\n${skill.content}`;
    }

    return prompt;
  }

  /**
   * 获取技能相关的工具列表
   *
   * @param skills - 技能列表
   * @returns 工具名称列表（去重）
   */
  getSkillTools(skills: Skill[]): string[] {
    const tools = new Set<string>();

    for (const skill of skills) {
      if (skill.tools) {
        skill.tools.forEach(t => tools.add(t));
      }
    }

    return Array.from(tools);
  }

  /**
   * 获取所有已加载的技能
   *
   * @returns 技能列表
   */
  getAllSkills(): Skill[] {
    return [...this.skills];
  }

  /**
   * 根据名称获取技能
   *
   * @param name - 技能名称
   * @returns 技能对象或 undefined
   */
  getSkillByName(name: string): Skill | undefined {
    return this.skills.find(s => s.name === name);
  }

  /**
   * 获取默认的技能目录列表
   *
   * @param workingDir - 工作目录
   * @returns 技能目录列表（用户级 + 项目级）
   */
  getDefaultSkillDirectories(workingDir: string): string[] {
    return [
      this.userSkillsDir,
      path.join(workingDir, '.claude', 'skills'),
      path.join(workingDir, 'skills'),
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
}
