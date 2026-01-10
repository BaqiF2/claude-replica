/**
 * 文件功能：命令类型定义，为CommandManager和PluginManager提供共享的类型定义
 *
 * 核心接口：
 * - Command: 命令接口
 * - CommandFrontmatter: 命令文件YAML frontmatter结构
 * - CommandManagerConfig: 命令管理器配置
 * - CommandExecutionResult: 命令执行结果
 */

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
export interface CommandFrontmatter {
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
