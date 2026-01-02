/**
 * 测试夹具模块
 * 负责测试环境的准备和清理
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TerminalTestError, TerminalTestErrorType } from './types';

/**
 * 技能定义
 */
export interface SkillDefinition {
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description?: string;
  /** 技能内容 */
  content: string;
}

/**
 * 命令定义
 */
export interface CommandDefinition {
  /** 命令名称 */
  name: string;
  /** 命令描述 */
  description?: string;
  /** 命令模板 */
  template: string;
}

/**
 * 代理定义
 */
export interface AgentDefinitionFixture {
  /** 代理名称 */
  name: string;
  /** 代理描述 */
  description: string;
  /** 代理提示词 */
  prompt: string;
  /** 可用工具 */
  tools?: string[];
}

/**
 * 配置夹具
 */
export interface ConfigFixture {
  /** 用户配置 */
  userConfig?: object;
  /** 项目配置 */
  projectConfig?: object;
  /** CLAUDE.md 内容 */
  claudeMd?: string;
}

/**
 * 扩展夹具
 */
export interface ExtensionFixture {
  /** 技能文件 */
  skills?: SkillDefinition[];
  /** 命令文件 */
  commands?: CommandDefinition[];
  /** 代理文件 */
  agents?: AgentDefinitionFixture[];
  /** 钩子配置 */
  hooks?: object;
}

/**
 * 模拟响应
 */
export interface MockResponse {
  /** 请求匹配模式 */
  pattern: string | RegExp;
  /** 响应数据 */
  response: object | string;
  /** HTTP 状态码 */
  status?: number;
}

/**
 * 模拟夹具
 */
export interface MockFixture {
  /** 模拟 API 响应 */
  apiResponses?: MockResponse[];
  /** 模拟文件系统 */
  filesystem?: Record<string, string>;
}

/**
 * 夹具选项
 */
export interface FixtureOptions {
  /** 是否创建临时目录 */
  createTempDir?: boolean;
  /** 临时目录前缀 */
  tempDirPrefix?: string;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 配置文件 */
  config?: ConfigFixture;
  /** 扩展文件 */
  extensions?: ExtensionFixture;
  /** 模拟设置 */
  mocks?: MockFixture;
}

/**
 * 夹具上下文
 */
export interface FixtureContext {
  /** 临时目录路径 */
  tempDir: string;
  /** 环境变量 */
  env: Record<string, string>;
  /** 配置目录路径 */
  configDir: string;
  /** 会话目录路径 */
  sessionsDir: string;
}


/**
 * 测试夹具类
 * 负责测试环境的准备和清理
 */
export class TestFixture {
  private options: FixtureOptions;
  private tempDir: string | null = null;
  private configDir: string | null = null;
  private sessionsDir: string | null = null;
  private originalEnv: Record<string, string | undefined> = {};
  private isSetup: boolean = false;

  constructor(options: FixtureOptions = {}) {
    this.options = {
      createTempDir: true,
      tempDirPrefix: 'claude-replica-test-',
      ...options,
    };
  }

  /**
   * 设置测试环境
   * @returns 夹具上下文
   */
  async setup(): Promise<FixtureContext> {
    if (this.isSetup) {
      throw new TerminalTestError(
        TerminalTestErrorType.FIXTURE_SETUP_FAILED,
        '夹具已经设置，请先调用 teardown()'
      );
    }

    try {
      // 创建临时目录
      if (this.options.createTempDir) {
        this.tempDir = await fs.promises.mkdtemp(
          path.join(os.tmpdir(), this.options.tempDirPrefix || 'test-')
        );
      } else {
        this.tempDir = os.tmpdir();
      }

      // 创建配置目录
      this.configDir = path.join(this.tempDir, '.claude-replica');
      await fs.promises.mkdir(this.configDir, { recursive: true });

      // 创建会话目录
      this.sessionsDir = path.join(this.configDir, 'sessions');
      await fs.promises.mkdir(this.sessionsDir, { recursive: true });

      // 设置环境变量
      if (this.options.env) {
        for (const [key, value] of Object.entries(this.options.env)) {
          this.setEnv(key, value);
        }
      }

      // 创建配置文件
      if (this.options.config) {
        await this.setupConfig(this.options.config);
      }

      // 创建扩展文件
      if (this.options.extensions) {
        await this.setupExtensions(this.options.extensions);
      }

      // 创建模拟文件系统
      if (this.options.mocks?.filesystem) {
        for (const [relativePath, content] of Object.entries(this.options.mocks.filesystem)) {
          await this.createFile(relativePath, content);
        }
      }

      this.isSetup = true;

      return {
        tempDir: this.tempDir,
        env: { ...this.options.env },
        configDir: this.configDir,
        sessionsDir: this.sessionsDir,
      };
    } catch (error) {
      // 清理已创建的资源
      await this.cleanup();
      throw new TerminalTestError(
        TerminalTestErrorType.FIXTURE_SETUP_FAILED,
        `夹具设置失败: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 清理测试环境
   */
  async teardown(): Promise<void> {
    try {
      // 恢复环境变量
      this.restoreEnv();

      // 清理临时目录
      await this.cleanup();

      this.isSetup = false;
    } catch (error) {
      throw new TerminalTestError(
        TerminalTestErrorType.FIXTURE_TEARDOWN_FAILED,
        `夹具清理失败: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 获取临时目录路径
   * @returns 临时目录路径
   */
  getTempDir(): string {
    if (!this.tempDir) {
      throw new TerminalTestError(
        TerminalTestErrorType.FIXTURE_SETUP_FAILED,
        '夹具尚未设置，请先调用 setup()'
      );
    }
    return this.tempDir;
  }

  /**
   * 获取配置目录路径
   * @returns 配置目录路径
   */
  getConfigDir(): string {
    if (!this.configDir) {
      throw new TerminalTestError(
        TerminalTestErrorType.FIXTURE_SETUP_FAILED,
        '夹具尚未设置，请先调用 setup()'
      );
    }
    return this.configDir;
  }

  /**
   * 获取会话目录路径
   * @returns 会话目录路径
   */
  getSessionsDir(): string {
    if (!this.sessionsDir) {
      throw new TerminalTestError(
        TerminalTestErrorType.FIXTURE_SETUP_FAILED,
        '夹具尚未设置，请先调用 setup()'
      );
    }
    return this.sessionsDir;
  }

  /**
   * 创建文件
   * @param relativePath 相对路径
   * @param content 文件内容
   */
  async createFile(relativePath: string, content: string): Promise<void> {
    if (!this.tempDir) {
      throw new TerminalTestError(
        TerminalTestErrorType.FIXTURE_SETUP_FAILED,
        '夹具尚未设置，请先调用 setup()'
      );
    }

    const fullPath = path.join(this.tempDir, relativePath);
    const dir = path.dirname(fullPath);

    // 确保目录存在
    await fs.promises.mkdir(dir, { recursive: true });

    // 写入文件
    await fs.promises.writeFile(fullPath, content, 'utf-8');
  }

  /**
   * 读取文件
   * @param relativePath 相对路径
   * @returns 文件内容
   */
  async readFile(relativePath: string): Promise<string> {
    if (!this.tempDir) {
      throw new TerminalTestError(
        TerminalTestErrorType.FIXTURE_SETUP_FAILED,
        '夹具尚未设置，请先调用 setup()'
      );
    }

    const fullPath = path.join(this.tempDir, relativePath);
    return fs.promises.readFile(fullPath, 'utf-8');
  }

  /**
   * 检查文件是否存在
   * @param relativePath 相对路径
   * @returns 是否存在
   */
  async fileExists(relativePath: string): Promise<boolean> {
    if (!this.tempDir) {
      return false;
    }

    const fullPath = path.join(this.tempDir, relativePath);
    try {
      await fs.promises.access(fullPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 删除文件
   * @param relativePath 相对路径
   */
  async deleteFile(relativePath: string): Promise<void> {
    if (!this.tempDir) {
      throw new TerminalTestError(
        TerminalTestErrorType.FIXTURE_SETUP_FAILED,
        '夹具尚未设置，请先调用 setup()'
      );
    }

    const fullPath = path.join(this.tempDir, relativePath);
    await fs.promises.unlink(fullPath);
  }

  /**
   * 设置环境变量
   * @param key 环境变量名
   * @param value 环境变量值
   */
  setEnv(key: string, value: string): void {
    // 保存原始值
    if (!(key in this.originalEnv)) {
      this.originalEnv[key] = process.env[key];
    }
    process.env[key] = value;
  }

  /**
   * 恢复环境变量
   */
  restoreEnv(): void {
    for (const [key, value] of Object.entries(this.originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    this.originalEnv = {};
  }

  /**
   * 获取环境变量
   * @param key 环境变量名
   * @returns 环境变量值
   */
  getEnv(key: string): string | undefined {
    return process.env[key];
  }

  /**
   * 检查夹具是否已设置
   * @returns 是否已设置
   */
  isReady(): boolean {
    return this.isSetup;
  }

  /**
   * 设置配置文件
   */
  private async setupConfig(config: ConfigFixture): Promise<void> {
    if (!this.configDir) return;

    // 创建用户配置
    if (config.userConfig) {
      const userConfigPath = path.join(this.configDir, 'settings.json');
      await fs.promises.writeFile(
        userConfigPath,
        JSON.stringify(config.userConfig, null, 2),
        'utf-8'
      );
    }

    // 创建项目配置
    if (config.projectConfig) {
      const projectConfigPath = path.join(this.tempDir!, '.claude-replica', 'project.json');
      await fs.promises.writeFile(
        projectConfigPath,
        JSON.stringify(config.projectConfig, null, 2),
        'utf-8'
      );
    }

    // 创建 CLAUDE.md
    if (config.claudeMd) {
      const claudeMdPath = path.join(this.tempDir!, 'CLAUDE.md');
      await fs.promises.writeFile(claudeMdPath, config.claudeMd, 'utf-8');
    }
  }

  /**
   * 设置扩展文件
   */
  private async setupExtensions(extensions: ExtensionFixture): Promise<void> {
    if (!this.configDir) return;

    // 创建技能文件
    if (extensions.skills) {
      const skillsDir = path.join(this.configDir, 'skills');
      await fs.promises.mkdir(skillsDir, { recursive: true });

      for (const skill of extensions.skills) {
        const skillPath = path.join(skillsDir, `${skill.name}.skill.md`);
        const content = this.formatSkillContent(skill);
        await fs.promises.writeFile(skillPath, content, 'utf-8');
      }
    }

    // 创建命令文件
    if (extensions.commands) {
      const commandsDir = path.join(this.configDir, 'commands');
      await fs.promises.mkdir(commandsDir, { recursive: true });

      for (const command of extensions.commands) {
        const commandPath = path.join(commandsDir, `${command.name}.md`);
        const content = this.formatCommandContent(command);
        await fs.promises.writeFile(commandPath, content, 'utf-8');
      }
    }

    // 创建代理文件
    if (extensions.agents) {
      const agentsDir = path.join(this.configDir, 'agents');
      await fs.promises.mkdir(agentsDir, { recursive: true });

      for (const agent of extensions.agents) {
        const agentPath = path.join(agentsDir, `${agent.name}.agent.md`);
        const content = this.formatAgentContent(agent);
        await fs.promises.writeFile(agentPath, content, 'utf-8');
      }
    }

    // 创建钩子配置
    if (extensions.hooks) {
      const hooksPath = path.join(this.configDir, 'hooks.json');
      await fs.promises.writeFile(
        hooksPath,
        JSON.stringify(extensions.hooks, null, 2),
        'utf-8'
      );
    }
  }

  /**
   * 格式化技能内容
   */
  private formatSkillContent(skill: SkillDefinition): string {
    let content = '---\n';
    content += `name: ${skill.name}\n`;
    if (skill.description) {
      content += `description: ${skill.description}\n`;
    }
    content += '---\n\n';
    content += skill.content;
    return content;
  }

  /**
   * 格式化命令内容
   */
  private formatCommandContent(command: CommandDefinition): string {
    let content = '---\n';
    content += `name: ${command.name}\n`;
    if (command.description) {
      content += `description: ${command.description}\n`;
    }
    content += '---\n\n';
    content += command.template;
    return content;
  }

  /**
   * 格式化代理内容
   */
  private formatAgentContent(agent: AgentDefinitionFixture): string {
    let content = '---\n';
    content += `description: ${agent.description}\n`;
    if (agent.tools && agent.tools.length > 0) {
      content += 'tools:\n';
      for (const tool of agent.tools) {
        content += `  - ${tool}\n`;
      }
    }
    content += '---\n\n';
    content += agent.prompt;
    return content;
  }

  /**
   * 清理临时目录
   */
  private async cleanup(): Promise<void> {
    if (this.tempDir && this.options.createTempDir) {
      try {
        await fs.promises.rm(this.tempDir, { recursive: true, force: true });
      } catch {
        // 忽略清理错误
      }
    }
    this.tempDir = null;
    this.configDir = null;
    this.sessionsDir = null;
  }
}

/**
 * 创建测试夹具实例
 * @param options 夹具选项
 * @returns 测试夹具实例
 */
export function createTestFixture(options?: FixtureOptions): TestFixture {
  return new TestFixture(options);
}
