/**
 * 文档生成模块
 * 
 * 提供代码变更检测、API 文档生成、README 生成、多格式输出和代码示例提取功能
 * 
 * 支持的输出格式:
 * - Markdown
 * - HTML
 * - PDF (通过 Markdown 转换)
 * 
 * @module DocumentGenerator
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * 文档输出格式
 */
export type DocumentFormat = 'markdown' | 'html' | 'pdf';

/**
 * 代码变更类型
 */
export type ChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

/**
 * 文件变更信息
 */
export interface FileChange {
  /** 文件路径 */
  filePath: string;
  /** 变更类型 */
  changeType: ChangeType;
  /** 旧文件路径（重命名时使用） */
  oldPath?: string;
  /** 变更的行数 */
  linesChanged?: number;
  /** 变更时间 */
  timestamp?: Date;
}

/**
 * 代码示例
 */
export interface CodeExample {
  /** 示例标题 */
  title: string;
  /** 示例描述 */
  description?: string;
  /** 代码内容 */
  code: string;
  /** 编程语言 */
  language: string;
  /** 来源文件 */
  sourceFile?: string;
  /** 起始行号 */
  startLine?: number;
  /** 结束行号 */
  endLine?: number;
}

/**
 * 函数/方法文档
 */
export interface FunctionDoc {
  /** 函数名称 */
  name: string;
  /** 函数描述 */
  description: string;
  /** 参数列表 */
  parameters: ParameterDoc[];
  /** 返回值描述 */
  returns?: ReturnDoc;
  /** 代码示例 */
  examples?: CodeExample[];
  /** 是否异步 */
  isAsync?: boolean;
  /** 访问修饰符 */
  visibility?: 'public' | 'private' | 'protected';
  /** 是否静态 */
  isStatic?: boolean;
  /** 所属文件 */
  filePath?: string;
  /** 行号 */
  lineNumber?: number;
}

/**
 * 参数文档
 */
export interface ParameterDoc {
  /** 参数名称 */
  name: string;
  /** 参数类型 */
  type: string;
  /** 参数描述 */
  description?: string;
  /** 是否可选 */
  optional?: boolean;
  /** 默认值 */
  defaultValue?: string;
}

/**
 * 返回值文档
 */
export interface ReturnDoc {
  /** 返回类型 */
  type: string;
  /** 返回值描述 */
  description?: string;
}

/**
 * 类/接口文档
 */
export interface ClassDoc {
  /** 类名 */
  name: string;
  /** 类描述 */
  description: string;
  /** 方法列表 */
  methods: FunctionDoc[];
  /** 属性列表 */
  properties: PropertyDoc[];
  /** 构造函数文档 */
  constructorDoc?: FunctionDoc;
  /** 继承的类 */
  extends?: string;
  /** 实现的接口 */
  implements?: string[];
  /** 是否为接口 */
  isInterface?: boolean;
  /** 所属文件 */
  filePath?: string;
  /** 代码示例 */
  examples?: CodeExample[];
}

/**
 * 属性文档
 */
export interface PropertyDoc {
  /** 属性名称 */
  name: string;
  /** 属性类型 */
  type: string;
  /** 属性描述 */
  description?: string;
  /** 访问修饰符 */
  visibility?: 'public' | 'private' | 'protected';
  /** 是否只读 */
  readonly?: boolean;
  /** 是否静态 */
  isStatic?: boolean;
  /** 默认值 */
  defaultValue?: string;
}

/**
 * 模块文档
 */
export interface ModuleDoc {
  /** 模块名称 */
  name: string;
  /** 模块描述 */
  description: string;
  /** 导出的类 */
  classes: ClassDoc[];
  /** 导出的函数 */
  functions: FunctionDoc[];
  /** 导出的接口 */
  interfaces: ClassDoc[];
  /** 导出的类型 */
  types: TypeDoc[];
  /** 文件路径 */
  filePath: string;
}

/**
 * 类型文档
 */
export interface TypeDoc {
  /** 类型名称 */
  name: string;
  /** 类型定义 */
  definition: string;
  /** 类型描述 */
  description?: string;
}

/**
 * API 文档
 */
export interface APIDoc {
  /** 项目名称 */
  projectName: string;
  /** 项目版本 */
  version?: string;
  /** 项目描述 */
  description?: string;
  /** 模块列表 */
  modules: ModuleDoc[];
  /** 生成时间 */
  generatedAt: Date;
}

/**
 * README 配置
 */
export interface ReadmeConfig {
  /** 项目名称 */
  projectName: string;
  /** 项目描述 */
  description?: string;
  /** 是否包含安装说明 */
  includeInstallation?: boolean;
  /** 是否包含使用示例 */
  includeUsage?: boolean;
  /** 是否包含 API 概览 */
  includeApiOverview?: boolean;
  /** 是否包含贡献指南 */
  includeContributing?: boolean;
  /** 是否包含许可证 */
  includeLicense?: boolean;
  /** 自定义章节 */
  customSections?: { title: string; content: string }[];
}

/**
 * 文档生成配置
 */
export interface DocumentGeneratorConfig {
  /** 工作目录 */
  workingDirectory?: string;
  /** 输出目录 */
  outputDirectory?: string;
  /** 默认输出格式 */
  defaultFormat?: DocumentFormat;
  /** 是否包含私有成员 */
  includePrivate?: boolean;
  /** 是否包含代码示例 */
  includeExamples?: boolean;
  /** 排除的文件模式 */
  excludePatterns?: string[];
}


/**
 * 文档生成器类
 * 
 * 提供代码变更检测、API 文档生成、README 生成等功能
 */
export class DocumentGenerator {
  private workingDirectory: string;
  private outputDirectory: string;
  private config: DocumentGeneratorConfig;

  constructor(config: DocumentGeneratorConfig = {}) {
    this.workingDirectory = config.workingDirectory || process.cwd();
    this.outputDirectory = config.outputDirectory || path.join(this.workingDirectory, 'docs');
    this.config = {
      defaultFormat: 'markdown',
      includePrivate: false,
      includeExamples: true,
      excludePatterns: ['node_modules/**', 'dist/**', '*.test.*', '*.spec.*'],
      ...config,
    };
  }

  // ==================== 代码变更检测 ====================

  /**
   * 检测代码变更
   * 
   * 使用 Git 检测自上次提交以来的文件变更
   * 
   * @param since 起始提交或时间（可选）
   * @returns 文件变更列表
   */
  async detectChanges(since?: string): Promise<FileChange[]> {
    const changes: FileChange[] = [];

    try {
      // 检查是否是 Git 仓库
      await execAsync('git rev-parse --git-dir', { cwd: this.workingDirectory });

      // 获取变更文件
      const sinceArg = since ? `${since}..HEAD` : 'HEAD~1..HEAD';
      const { stdout } = await execAsync(
        `git diff --name-status ${sinceArg}`,
        { cwd: this.workingDirectory }
      );

      const lines = stdout.trim().split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length < 2) continue;

        const status = parts[0];
        const filePath = parts[1];
        const oldPath = parts.length > 2 ? parts[1] : undefined;
        const newPath = parts.length > 2 ? parts[2] : filePath;

        let changeType: ChangeType;
        switch (status[0]) {
          case 'A':
            changeType = 'added';
            break;
          case 'M':
            changeType = 'modified';
            break;
          case 'D':
            changeType = 'deleted';
            break;
          case 'R':
            changeType = 'renamed';
            break;
          default:
            changeType = 'modified';
        }

        changes.push({
          filePath: newPath,
          changeType,
          oldPath: changeType === 'renamed' ? oldPath : undefined,
        });
      }

      // 获取每个文件的变更行数
      for (const change of changes) {
        if (change.changeType !== 'deleted') {
          try {
            const { stdout: diffStat } = await execAsync(
              `git diff --numstat ${sinceArg} -- "${change.filePath}"`,
              { cwd: this.workingDirectory }
            );
            const statParts = diffStat.trim().split('\t');
            if (statParts.length >= 2) {
              const added = parseInt(statParts[0], 10) || 0;
              const removed = parseInt(statParts[1], 10) || 0;
              change.linesChanged = added + removed;
            }
          } catch {
            // 忽略统计错误
          }
        }
      }
    } catch (error) {
      // 如果不是 Git 仓库，返回空列表
      console.warn('无法检测代码变更：不是 Git 仓库或 Git 命令失败');
    }

    return changes;
  }

  /**
   * 检测未提交的变更
   * 
   * @returns 未提交的文件变更列表
   */
  async detectUncommittedChanges(): Promise<FileChange[]> {
    const changes: FileChange[] = [];

    try {
      const { stdout } = await execAsync(
        'git status --porcelain',
        { cwd: this.workingDirectory }
      );

      const lines = stdout.trim().split('\n').filter(line => line.trim());

      for (const line of lines) {
        const status = line.substring(0, 2).trim();
        const filePath = line.substring(3).trim();

        let changeType: ChangeType;
        if (status.includes('A') || status === '??') {
          changeType = 'added';
        } else if (status.includes('D')) {
          changeType = 'deleted';
        } else if (status.includes('R')) {
          changeType = 'renamed';
        } else {
          changeType = 'modified';
        }

        changes.push({
          filePath,
          changeType,
          timestamp: new Date(),
        });
      }
    } catch {
      // 忽略错误
    }

    return changes;
  }

  /**
   * 检查文件是否需要更新文档
   * 
   * @param filePath 文件路径
   * @returns 是否需要更新文档
   */
  async needsDocUpdate(filePath: string): Promise<boolean> {
    const ext = path.extname(filePath).toLowerCase();
    const documentableExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go'];
    
    if (!documentableExtensions.includes(ext)) {
      return false;
    }

    // 检查是否在排除列表中
    for (const pattern of this.config.excludePatterns || []) {
      if (this.matchPattern(filePath, pattern)) {
        return false;
      }
    }

    return true;
  }

  // ==================== API 文档生成 ====================

  /**
   * 生成 API 文档
   * 
   * 分析源代码并生成 API 文档
   * 
   * @param sourceFiles 源文件列表（可选，默认扫描整个项目）
   * @returns API 文档对象
   */
  async generateAPIDoc(sourceFiles?: string[]): Promise<APIDoc> {
    const files = sourceFiles || await this.findSourceFiles();
    const modules: ModuleDoc[] = [];

    for (const file of files) {
      if (await this.needsDocUpdate(file)) {
        const moduleDoc = await this.parseSourceFile(file);
        if (moduleDoc) {
          modules.push(moduleDoc);
        }
      }
    }

    // 获取项目信息
    const projectInfo = await this.getProjectInfo();

    return {
      projectName: projectInfo.name,
      version: projectInfo.version,
      description: projectInfo.description,
      modules,
      generatedAt: new Date(),
    };
  }

  /**
   * 解析源文件生成模块文档
   * 
   * @param filePath 文件路径
   * @returns 模块文档
   */
  async parseSourceFile(filePath: string): Promise<ModuleDoc | null> {
    const fullPath = path.resolve(this.workingDirectory, filePath);
    
    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.ts':
      case '.tsx':
        return this.parseTypeScriptFile(filePath, content);
      case '.js':
      case '.jsx':
        return this.parseJavaScriptFile(filePath, content);
      case '.py':
        return this.parsePythonFile(filePath, content);
      case '.java':
        return this.parseJavaFile(filePath, content);
      case '.go':
        return this.parseGoFile(filePath, content);
      default:
        return null;
    }
  }

  /**
   * 解析 TypeScript 文件
   */
  private parseTypeScriptFile(filePath: string, content: string): ModuleDoc {
    const moduleDoc: ModuleDoc = {
      name: this.getModuleName(filePath),
      description: this.extractModuleDescription(content),
      classes: [],
      functions: [],
      interfaces: [],
      types: [],
      filePath,
    };

    // 解析类
    const classMatches = content.matchAll(
      /(?:\/\*\*[\s\S]*?\*\/\s*)?(export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?\s*\{/g
    );
    for (const match of classMatches) {
      const classDoc = this.parseTypeScriptClass(content, match);
      if (classDoc && (match[1] || this.config.includePrivate)) {
        moduleDoc.classes.push(classDoc);
      }
    }

    // 解析接口
    const interfaceMatches = content.matchAll(
      /(?:\/\*\*[\s\S]*?\*\/\s*)?(export\s+)?interface\s+(\w+)(?:\s+extends\s+([\w,\s]+))?\s*\{/g
    );
    for (const match of interfaceMatches) {
      const interfaceDoc = this.parseTypeScriptInterface(content, match);
      if (interfaceDoc && (match[1] || this.config.includePrivate)) {
        moduleDoc.interfaces.push(interfaceDoc);
      }
    }

    // 解析独立函数
    const functionMatches = content.matchAll(
      /(?:\/\*\*[\s\S]*?\*\/\s*)?(export\s+)?(async\s+)?function\s+(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/g
    );
    for (const match of functionMatches) {
      const funcDoc = this.parseTypeScriptFunction(content, match);
      if (funcDoc && (match[1] || this.config.includePrivate)) {
        moduleDoc.functions.push(funcDoc);
      }
    }

    // 解析类型别名
    const typeMatches = content.matchAll(
      /(?:\/\*\*[\s\S]*?\*\/\s*)?(export\s+)?type\s+(\w+)\s*=\s*([^;]+);/g
    );
    for (const match of typeMatches) {
      if (match[1] || this.config.includePrivate) {
        moduleDoc.types.push({
          name: match[2],
          definition: match[3].trim(),
          description: this.extractJSDocDescription(content, match.index || 0),
        });
      }
    }

    return moduleDoc;
  }

  /**
   * 解析 TypeScript 类
   */
  private parseTypeScriptClass(content: string, match: RegExpMatchArray): ClassDoc {
    const className = match[2];
    const extendsClass = match[3];
    const implementsInterfaces = match[4]?.split(',').map(s => s.trim());
    const startIndex = match.index || 0;

    // 提取类体
    const classBody = this.extractBlock(content, startIndex + match[0].length - 1);
    
    const classDoc: ClassDoc = {
      name: className,
      description: this.extractJSDocDescription(content, startIndex),
      methods: [],
      properties: [],
      extends: extendsClass,
      implements: implementsInterfaces,
      filePath: '',
    };

    // 解析方法
    const methodMatches = classBody.matchAll(
      /(?:\/\*\*[\s\S]*?\*\/\s*)?(public|private|protected)?\s*(static)?\s*(async)?\s*(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/g
    );
    for (const methodMatch of methodMatches) {
      const visibility = methodMatch[1] as 'public' | 'private' | 'protected' | undefined;
      if (visibility === 'private' && !this.config.includePrivate) continue;

      classDoc.methods.push({
        name: methodMatch[4],
        description: this.extractJSDocDescription(classBody, methodMatch.index || 0),
        parameters: this.parseParameters(methodMatch[5]),
        returns: methodMatch[6] ? { type: methodMatch[6].trim() } : undefined,
        isAsync: !!methodMatch[3],
        visibility: visibility || 'public',
        isStatic: !!methodMatch[2],
      });
    }

    // 解析属性
    const propertyMatches = classBody.matchAll(
      /(?:\/\*\*[\s\S]*?\*\/\s*)?(public|private|protected)?\s*(static)?\s*(readonly)?\s*(\w+)(?:\?)?(?:\s*:\s*([^;=]+))?(?:\s*=\s*([^;]+))?;/g
    );
    for (const propMatch of propertyMatches) {
      const visibility = propMatch[1] as 'public' | 'private' | 'protected' | undefined;
      if (visibility === 'private' && !this.config.includePrivate) continue;

      classDoc.properties.push({
        name: propMatch[4],
        type: propMatch[5]?.trim() || 'any',
        description: this.extractJSDocDescription(classBody, propMatch.index || 0),
        visibility: visibility || 'public',
        readonly: !!propMatch[3],
        isStatic: !!propMatch[2],
        defaultValue: propMatch[6]?.trim(),
      });
    }

    return classDoc;
  }

  /**
   * 解析 TypeScript 接口
   */
  private parseTypeScriptInterface(content: string, match: RegExpMatchArray): ClassDoc {
    const interfaceName = match[2];
    const extendsInterfaces = match[3]?.split(',').map(s => s.trim());
    const startIndex = match.index || 0;

    const interfaceBody = this.extractBlock(content, startIndex + match[0].length - 1);

    const interfaceDoc: ClassDoc = {
      name: interfaceName,
      description: this.extractJSDocDescription(content, startIndex),
      methods: [],
      properties: [],
      extends: extendsInterfaces?.[0],
      implements: extendsInterfaces?.slice(1),
      isInterface: true,
      filePath: '',
    };

    // 解析接口属性
    const propertyMatches = interfaceBody.matchAll(
      /(?:\/\*\*[\s\S]*?\*\/\s*)?(\w+)(\?)?(?:\s*:\s*([^;]+));/g
    );
    for (const propMatch of propertyMatches) {
      interfaceDoc.properties.push({
        name: propMatch[1],
        type: propMatch[3]?.trim() || 'any',
        description: this.extractJSDocDescription(interfaceBody, propMatch.index || 0),
        readonly: false,
      });
    }

    // 解析接口方法
    const methodMatches = interfaceBody.matchAll(
      /(?:\/\*\*[\s\S]*?\*\/\s*)?(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*:\s*([^;]+))?;/g
    );
    for (const methodMatch of methodMatches) {
      interfaceDoc.methods.push({
        name: methodMatch[1],
        description: this.extractJSDocDescription(interfaceBody, methodMatch.index || 0),
        parameters: this.parseParameters(methodMatch[2]),
        returns: methodMatch[3] ? { type: methodMatch[3].trim() } : undefined,
      });
    }

    return interfaceDoc;
  }

  /**
   * 解析 TypeScript 函数
   */
  private parseTypeScriptFunction(content: string, match: RegExpMatchArray): FunctionDoc {
    return {
      name: match[3],
      description: this.extractJSDocDescription(content, match.index || 0),
      parameters: this.parseParameters(match[4]),
      returns: match[5] ? { type: match[5].trim() } : undefined,
      isAsync: !!match[2],
    };
  }


  /**
   * 解析 JavaScript 文件
   */
  private parseJavaScriptFile(filePath: string, content: string): ModuleDoc {
    // JavaScript 解析与 TypeScript 类似，但不包含类型信息
    return this.parseTypeScriptFile(filePath, content);
  }

  /**
   * 解析 Python 文件
   */
  private parsePythonFile(filePath: string, content: string): ModuleDoc {
    const moduleDoc: ModuleDoc = {
      name: this.getModuleName(filePath),
      description: this.extractPythonDocstring(content, 0),
      classes: [],
      functions: [],
      interfaces: [],
      types: [],
      filePath,
    };

    // 解析类
    const classMatches = content.matchAll(
      /class\s+(\w+)(?:\(([^)]*)\))?\s*:/g
    );
    for (const match of classMatches) {
      const classDoc = this.parsePythonClass(content, match);
      moduleDoc.classes.push(classDoc);
    }

    // 解析函数
    const functionMatches = content.matchAll(
      /(async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?\s*:/g
    );
    for (const match of functionMatches) {
      // 跳过类方法（缩进的函数）
      const lineStart = content.lastIndexOf('\n', match.index || 0) + 1;
      const indent = (match.index || 0) - lineStart;
      if (indent === 0 && !match[2].startsWith('_')) {
        moduleDoc.functions.push(this.parsePythonFunction(content, match));
      }
    }

    return moduleDoc;
  }

  /**
   * 解析 Python 类
   */
  private parsePythonClass(content: string, match: RegExpMatchArray): ClassDoc {
    const className = match[1];
    const bases = match[2]?.split(',').map(s => s.trim());
    const startIndex = match.index || 0;

    const classDoc: ClassDoc = {
      name: className,
      description: this.extractPythonDocstring(content, startIndex + match[0].length),
      methods: [],
      properties: [],
      extends: bases?.[0],
      filePath: '',
    };

    // 查找类体的结束位置
    const classBody = this.extractPythonBlock(content, startIndex);

    // 解析方法
    const methodMatches = classBody.matchAll(
      /(async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?\s*:/g
    );
    for (const methodMatch of methodMatches) {
      const methodName = methodMatch[2];
      const visibility = methodName.startsWith('_') 
        ? (methodName.startsWith('__') && !methodName.endsWith('__') ? 'private' : 'protected')
        : 'public';

      if (visibility === 'private' && !this.config.includePrivate) continue;

      classDoc.methods.push({
        name: methodName,
        description: this.extractPythonDocstring(classBody, (methodMatch.index || 0) + methodMatch[0].length),
        parameters: this.parsePythonParameters(methodMatch[3]),
        returns: methodMatch[4] ? { type: methodMatch[4].trim() } : undefined,
        isAsync: !!methodMatch[1],
        visibility: visibility as 'public' | 'private' | 'protected',
      });
    }

    return classDoc;
  }

  /**
   * 解析 Python 函数
   */
  private parsePythonFunction(content: string, match: RegExpMatchArray): FunctionDoc {
    return {
      name: match[2],
      description: this.extractPythonDocstring(content, (match.index || 0) + match[0].length),
      parameters: this.parsePythonParameters(match[3]),
      returns: match[4] ? { type: match[4].trim() } : undefined,
      isAsync: !!match[1],
    };
  }

  /**
   * 解析 Java 文件
   */
  private parseJavaFile(filePath: string, content: string): ModuleDoc {
    const moduleDoc: ModuleDoc = {
      name: this.getModuleName(filePath),
      description: this.extractJavaDocDescription(content, 0),
      classes: [],
      functions: [],
      interfaces: [],
      types: [],
      filePath,
    };

    // 解析类
    const classMatches = content.matchAll(
      /(?:\/\*\*[\s\S]*?\*\/\s*)?(public|private|protected)?\s*(abstract)?\s*class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?\s*\{/g
    );
    for (const match of classMatches) {
      const visibility = match[1] as 'public' | 'private' | 'protected' | undefined;
      if (visibility === 'private' && !this.config.includePrivate) continue;

      moduleDoc.classes.push(this.parseJavaClass(content, match));
    }

    // 解析接口
    const interfaceMatches = content.matchAll(
      /(?:\/\*\*[\s\S]*?\*\/\s*)?(public|private|protected)?\s*interface\s+(\w+)(?:\s+extends\s+([\w,\s]+))?\s*\{/g
    );
    for (const match of interfaceMatches) {
      moduleDoc.interfaces.push(this.parseJavaInterface(content, match));
    }

    return moduleDoc;
  }

  /**
   * 解析 Java 类
   */
  private parseJavaClass(content: string, match: RegExpMatchArray): ClassDoc {
    const className = match[3];
    const extendsClass = match[4];
    const implementsInterfaces = match[5]?.split(',').map(s => s.trim());
    const startIndex = match.index || 0;

    const classBody = this.extractBlock(content, startIndex + match[0].length - 1);

    const classDoc: ClassDoc = {
      name: className,
      description: this.extractJavaDocDescription(content, startIndex),
      methods: [],
      properties: [],
      extends: extendsClass,
      implements: implementsInterfaces,
      filePath: '',
    };

    // 解析方法
    const methodMatches = classBody.matchAll(
      /(?:\/\*\*[\s\S]*?\*\/\s*)?(public|private|protected)?\s*(static)?\s*([\w<>[\],\s]+)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w,\s]+)?\s*\{/g
    );
    for (const methodMatch of methodMatches) {
      const visibility = methodMatch[1] as 'public' | 'private' | 'protected' | undefined;
      if (visibility === 'private' && !this.config.includePrivate) continue;

      classDoc.methods.push({
        name: methodMatch[4],
        description: this.extractJavaDocDescription(classBody, methodMatch.index || 0),
        parameters: this.parseJavaParameters(methodMatch[5]),
        returns: { type: methodMatch[3].trim() },
        visibility: visibility || 'public',
        isStatic: !!methodMatch[2],
      });
    }

    return classDoc;
  }

  /**
   * 解析 Java 接口
   */
  private parseJavaInterface(content: string, match: RegExpMatchArray): ClassDoc {
    const interfaceName = match[2];
    const extendsInterfaces = match[3]?.split(',').map(s => s.trim());
    const startIndex = match.index || 0;

    return {
      name: interfaceName,
      description: this.extractJavaDocDescription(content, startIndex),
      methods: [],
      properties: [],
      extends: extendsInterfaces?.[0],
      isInterface: true,
      filePath: '',
    };
  }

  /**
   * 解析 Go 文件
   */
  private parseGoFile(filePath: string, content: string): ModuleDoc {
    const moduleDoc: ModuleDoc = {
      name: this.getModuleName(filePath),
      description: this.extractGoDocComment(content, 0),
      classes: [],
      functions: [],
      interfaces: [],
      types: [],
      filePath,
    };

    // 解析结构体（作为类处理）
    const structMatches = content.matchAll(
      /(?:\/\/[^\n]*\n)*type\s+(\w+)\s+struct\s*\{/g
    );
    for (const match of structMatches) {
      moduleDoc.classes.push(this.parseGoStruct(content, match));
    }

    // 解析接口
    const interfaceMatches = content.matchAll(
      /(?:\/\/[^\n]*\n)*type\s+(\w+)\s+interface\s*\{/g
    );
    for (const match of interfaceMatches) {
      moduleDoc.interfaces.push(this.parseGoInterface(content, match));
    }

    // 解析函数
    const functionMatches = content.matchAll(
      /(?:\/\/[^\n]*\n)*func\s+(\w+)\s*\(([^)]*)\)(?:\s*\(([^)]*)\)|\s*(\w+))?\s*\{/g
    );
    for (const match of functionMatches) {
      // 只解析导出的函数（首字母大写）
      if (match[1][0] === match[1][0].toUpperCase()) {
        moduleDoc.functions.push(this.parseGoFunction(content, match));
      }
    }

    return moduleDoc;
  }

  /**
   * 解析 Go 结构体
   */
  private parseGoStruct(content: string, match: RegExpMatchArray): ClassDoc {
    const structName = match[1];
    const startIndex = match.index || 0;

    const structBody = this.extractBlock(content, startIndex + match[0].length - 1);

    const classDoc: ClassDoc = {
      name: structName,
      description: this.extractGoDocComment(content, startIndex),
      methods: [],
      properties: [],
      filePath: '',
    };

    // 解析字段
    const fieldMatches = structBody.matchAll(
      /(\w+)\s+([\w*[\]]+)(?:\s+`[^`]+`)?/g
    );
    for (const fieldMatch of fieldMatches) {
      classDoc.properties.push({
        name: fieldMatch[1],
        type: fieldMatch[2],
        visibility: fieldMatch[1][0] === fieldMatch[1][0].toUpperCase() ? 'public' : 'private',
      });
    }

    // 查找关联的方法
    const methodMatches = content.matchAll(
      new RegExp(`(?:\\/\\/[^\\n]*\\n)*func\\s+\\(\\w+\\s+\\*?${structName}\\)\\s+(\\w+)\\s*\\(([^)]*)\\)(?:\\s*\\(([^)]*)\\)|\\s*(\\w+))?\\s*\\{`, 'g')
    );
    for (const methodMatch of methodMatches) {
      if (methodMatch[1][0] === methodMatch[1][0].toUpperCase() || this.config.includePrivate) {
        classDoc.methods.push({
          name: methodMatch[1],
          description: this.extractGoDocComment(content, methodMatch.index || 0),
          parameters: this.parseGoParameters(methodMatch[2]),
          returns: methodMatch[3] || methodMatch[4] ? { type: methodMatch[3] || methodMatch[4] } : undefined,
          visibility: methodMatch[1][0] === methodMatch[1][0].toUpperCase() ? 'public' : 'private',
        });
      }
    }

    return classDoc;
  }

  /**
   * 解析 Go 接口
   */
  private parseGoInterface(content: string, match: RegExpMatchArray): ClassDoc {
    const interfaceName = match[1];
    const startIndex = match.index || 0;

    const interfaceBody = this.extractBlock(content, startIndex + match[0].length - 1);

    const interfaceDoc: ClassDoc = {
      name: interfaceName,
      description: this.extractGoDocComment(content, startIndex),
      methods: [],
      properties: [],
      isInterface: true,
      filePath: '',
    };

    // 解析方法签名
    const methodMatches = interfaceBody.matchAll(
      /(\w+)\s*\(([^)]*)\)(?:\s*\(([^)]*)\)|\s*(\w+))?/g
    );
    for (const methodMatch of methodMatches) {
      interfaceDoc.methods.push({
        name: methodMatch[1],
        description: '',
        parameters: this.parseGoParameters(methodMatch[2]),
        returns: methodMatch[3] || methodMatch[4] ? { type: methodMatch[3] || methodMatch[4] } : undefined,
      });
    }

    return interfaceDoc;
  }

  /**
   * 解析 Go 函数
   */
  private parseGoFunction(content: string, match: RegExpMatchArray): FunctionDoc {
    return {
      name: match[1],
      description: this.extractGoDocComment(content, match.index || 0),
      parameters: this.parseGoParameters(match[2]),
      returns: match[3] || match[4] ? { type: match[3] || match[4] } : undefined,
    };
  }


  // ==================== README 生成 ====================

  /**
   * 生成 README 文档
   * 
   * @param config README 配置
   * @returns README 内容
   */
  async generateReadme(config: ReadmeConfig): Promise<string> {
    const sections: string[] = [];

    // 标题
    sections.push(`# ${config.projectName}\n`);

    // 描述
    if (config.description) {
      sections.push(`${config.description}\n`);
    }

    // 徽章（可选）
    const badges = await this.generateBadges();
    if (badges) {
      sections.push(`${badges}\n`);
    }

    // 目录
    sections.push(this.generateTableOfContents(config));

    // 安装说明
    if (config.includeInstallation !== false) {
      sections.push(await this.generateInstallationSection());
    }

    // 使用示例
    if (config.includeUsage !== false) {
      sections.push(await this.generateUsageSection());
    }

    // API 概览
    if (config.includeApiOverview) {
      sections.push(await this.generateApiOverviewSection());
    }

    // 自定义章节
    if (config.customSections) {
      for (const section of config.customSections) {
        sections.push(`## ${section.title}\n\n${section.content}\n`);
      }
    }

    // 贡献指南
    if (config.includeContributing !== false) {
      sections.push(this.generateContributingSection());
    }

    // 许可证
    if (config.includeLicense !== false) {
      sections.push(await this.generateLicenseSection());
    }

    return sections.join('\n');
  }

  /**
   * 生成徽章
   */
  private async generateBadges(): Promise<string> {
    const badges: string[] = [];
    const projectInfo = await this.getProjectInfo();

    if (projectInfo.version) {
      badges.push(`![Version](https://img.shields.io/badge/version-${projectInfo.version}-blue.svg)`);
    }

    // 检查是否有测试
    if (fs.existsSync(path.join(this.workingDirectory, 'package.json'))) {
      const packageJson = JSON.parse(fs.readFileSync(path.join(this.workingDirectory, 'package.json'), 'utf-8'));
      if (packageJson.scripts?.test) {
        badges.push('![Tests](https://img.shields.io/badge/tests-passing-green.svg)');
      }
    }

    // 检查许可证
    const licenseFile = await this.findLicenseFile();
    if (licenseFile) {
      const licenseType = await this.detectLicenseType(licenseFile);
      if (licenseType) {
        badges.push(`![License](https://img.shields.io/badge/license-${licenseType}-green.svg)`);
      }
    }

    return badges.join(' ');
  }

  /**
   * 生成目录
   */
  private generateTableOfContents(config: ReadmeConfig): string {
    const items: string[] = ['## 目录\n'];

    if (config.includeInstallation !== false) {
      items.push('- [安装](#安装)');
    }
    if (config.includeUsage !== false) {
      items.push('- [使用方法](#使用方法)');
    }
    if (config.includeApiOverview) {
      items.push('- [API 概览](#api-概览)');
    }
    if (config.customSections) {
      for (const section of config.customSections) {
        const anchor = section.title.toLowerCase().replace(/\s+/g, '-');
        items.push(`- [${section.title}](#${anchor})`);
      }
    }
    if (config.includeContributing !== false) {
      items.push('- [贡献](#贡献)');
    }
    if (config.includeLicense !== false) {
      items.push('- [许可证](#许可证)');
    }

    return items.join('\n') + '\n';
  }

  /**
   * 生成安装说明
   */
  private async generateInstallationSection(): Promise<string> {
    const lines: string[] = ['## 安装\n'];
    const projectInfo = await this.getProjectInfo();

    // 检测项目类型并生成相应的安装命令
    if (fs.existsSync(path.join(this.workingDirectory, 'package.json'))) {
      lines.push('```bash');
      lines.push(`npm install ${projectInfo.name}`);
      lines.push('```\n');
      lines.push('或使用 yarn:\n');
      lines.push('```bash');
      lines.push(`yarn add ${projectInfo.name}`);
      lines.push('```\n');
    } else if (fs.existsSync(path.join(this.workingDirectory, 'setup.py')) ||
               fs.existsSync(path.join(this.workingDirectory, 'pyproject.toml'))) {
      lines.push('```bash');
      lines.push(`pip install ${projectInfo.name}`);
      lines.push('```\n');
    } else if (fs.existsSync(path.join(this.workingDirectory, 'go.mod'))) {
      lines.push('```bash');
      lines.push(`go get ${projectInfo.name}`);
      lines.push('```\n');
    } else if (fs.existsSync(path.join(this.workingDirectory, 'pom.xml'))) {
      lines.push('添加以下依赖到 `pom.xml`:\n');
      lines.push('```xml');
      lines.push('<dependency>');
      lines.push(`  <groupId>com.example</groupId>`);
      lines.push(`  <artifactId>${projectInfo.name}</artifactId>`);
      lines.push(`  <version>${projectInfo.version || '1.0.0'}</version>`);
      lines.push('</dependency>');
      lines.push('```\n');
    }

    return lines.join('\n');
  }

  /**
   * 生成使用示例
   */
  private async generateUsageSection(): Promise<string> {
    const lines: string[] = ['## 使用方法\n'];

    // 尝试从代码中提取示例
    const examples = await this.extractCodeExamples();
    
    if (examples.length > 0) {
      for (const example of examples.slice(0, 3)) {
        if (example.title) {
          lines.push(`### ${example.title}\n`);
        }
        if (example.description) {
          lines.push(`${example.description}\n`);
        }
        lines.push(`\`\`\`${example.language}`);
        lines.push(example.code);
        lines.push('```\n');
      }
    } else {
      // 生成基本示例
      lines.push('```javascript');
      lines.push('// 基本使用示例');
      lines.push('const example = require(\'your-package\');');
      lines.push('');
      lines.push('// 使用示例代码');
      lines.push('```\n');
    }

    return lines.join('\n');
  }

  /**
   * 生成 API 概览
   */
  private async generateApiOverviewSection(): Promise<string> {
    const lines: string[] = ['## API 概览\n'];
    const apiDoc = await this.generateAPIDoc();

    for (const module of apiDoc.modules.slice(0, 5)) {
      lines.push(`### ${module.name}\n`);
      
      if (module.description) {
        lines.push(`${module.description}\n`);
      }

      // 列出主要的类和函数
      if (module.classes.length > 0) {
        lines.push('**类:**\n');
        for (const cls of module.classes.slice(0, 5)) {
          lines.push(`- \`${cls.name}\` - ${cls.description || '无描述'}`);
        }
        lines.push('');
      }

      if (module.functions.length > 0) {
        lines.push('**函数:**\n');
        for (const func of module.functions.slice(0, 5)) {
          lines.push(`- \`${func.name}()\` - ${func.description || '无描述'}`);
        }
        lines.push('');
      }
    }

    lines.push('详细 API 文档请参阅 [API 文档](./docs/API.md)\n');

    return lines.join('\n');
  }

  /**
   * 生成贡献指南
   */
  private generateContributingSection(): string {
    return `## 贡献

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (\`git checkout -b feature/amazing-feature\`)
3. 提交更改 (\`git commit -m 'Add some amazing feature'\`)
4. 推送到分支 (\`git push origin feature/amazing-feature\`)
5. 创建 Pull Request

请确保您的代码符合项目的编码规范，并通过所有测试。
`;
  }

  /**
   * 生成许可证章节
   */
  private async generateLicenseSection(): Promise<string> {
    const licenseFile = await this.findLicenseFile();
    const licenseType = licenseFile ? await this.detectLicenseType(licenseFile) : 'MIT';

    return `## 许可证

本项目采用 ${licenseType} 许可证 - 详情请参阅 [LICENSE](LICENSE) 文件。
`;
  }

  // ==================== 多格式输出 ====================

  /**
   * 将文档转换为指定格式
   * 
   * @param content Markdown 内容
   * @param format 目标格式
   * @returns 转换后的内容
   */
  async convertToFormat(content: string, format: DocumentFormat): Promise<string> {
    switch (format) {
      case 'markdown':
        return content;
      case 'html':
        return this.convertToHtml(content);
      case 'pdf':
        return this.convertToPdf(content);
      default:
        return content;
    }
  }

  /**
   * 转换为 HTML
   */
  private convertToHtml(markdown: string): string {
    // 简单的 Markdown 到 HTML 转换
    let html = markdown;

    // 转换标题
    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

    // 转换代码块
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code class="language-${lang || 'text'}">${this.escapeHtml(code.trim())}</code></pre>`;
    });

    // 转换行内代码
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 转换粗体
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 转换斜体
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 转换链接
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // 转换列表
    html = html.replace(/^- (.*$)/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // 转换段落
    html = html.replace(/^(?!<[huplo])(.*$)/gm, (match) => {
      if (match.trim()) {
        return `<p>${match}</p>`;
      }
      return match;
    });

    // 包装 HTML 文档
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>文档</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    code { background: #f4f4f4; padding: 2px 5px; border-radius: 3px; }
    pre code { background: none; padding: 0; }
    h1, h2, h3 { border-bottom: 1px solid #eee; padding-bottom: 10px; }
    ul { padding-left: 20px; }
    a { color: #0366d6; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
  }

  /**
   * 转换为 PDF（返回 HTML，需要外部工具转换）
   */
  private convertToPdf(markdown: string): string {
    // PDF 转换需要外部工具（如 puppeteer 或 wkhtmltopdf）
    // 这里返回适合 PDF 转换的 HTML
    const html = this.convertToHtml(markdown);
    
    // 添加打印样式
    return html.replace('</style>', `
    @media print {
      body { max-width: none; }
      pre { white-space: pre-wrap; word-wrap: break-word; }
    }
  </style>`);
  }

  /**
   * 保存文档到文件
   * 
   * @param content 文档内容
   * @param filename 文件名
   * @param format 输出格式
   */
  async saveDocument(content: string, filename: string, format: DocumentFormat = 'markdown'): Promise<string> {
    const convertedContent = await this.convertToFormat(content, format);
    
    const ext = format === 'markdown' ? '.md' : format === 'html' ? '.html' : '.html';
    const outputPath = path.join(this.outputDirectory, `${filename}${ext}`);

    // 确保输出目录存在
    if (!fs.existsSync(this.outputDirectory)) {
      fs.mkdirSync(this.outputDirectory, { recursive: true });
    }

    fs.writeFileSync(outputPath, convertedContent, 'utf-8');
    return outputPath;
  }


  // ==================== 代码示例提取 ====================

  /**
   * 从代码中提取示例
   * 
   * @param sourceFiles 源文件列表（可选）
   * @returns 代码示例列表
   */
  async extractCodeExamples(sourceFiles?: string[]): Promise<CodeExample[]> {
    const examples: CodeExample[] = [];
    const files = sourceFiles || await this.findExampleFiles();

    for (const file of files) {
      const fullPath = path.resolve(this.workingDirectory, file);
      if (!fs.existsSync(fullPath)) continue;

      const content = fs.readFileSync(fullPath, 'utf-8');
      const ext = path.extname(file).toLowerCase();
      const language = this.getLanguageFromExtension(ext);

      // 从 JSDoc @example 标签提取
      const jsdocExamples = this.extractJSDocExamples(content, file, language);
      examples.push(...jsdocExamples);

      // 从 Python docstring 提取
      if (ext === '.py') {
        const pythonExamples = this.extractPythonDocstringExamples(content, file);
        examples.push(...pythonExamples);
      }

      // 从示例文件提取
      if (file.includes('example') || file.includes('demo')) {
        examples.push({
          title: this.getExampleTitle(file),
          description: this.extractFileDescription(content),
          code: this.extractMainCode(content),
          language,
          sourceFile: file,
        });
      }
    }

    return examples;
  }

  /**
   * 从 JSDoc @example 标签提取示例
   */
  private extractJSDocExamples(content: string, file: string, language: string): CodeExample[] {
    const examples: CodeExample[] = [];
    
    const exampleMatches = content.matchAll(/@example\s*\n([\s\S]*?)(?=\*\/|\*\s*@)/g);
    for (const match of exampleMatches) {
      const code = match[1]
        .split('\n')
        .map(line => line.replace(/^\s*\*\s?/, ''))
        .join('\n')
        .trim();

      if (code) {
        examples.push({
          title: `示例 - ${path.basename(file)}`,
          code,
          language,
          sourceFile: file,
        });
      }
    }

    return examples;
  }

  /**
   * 从 Python docstring 提取示例
   */
  private extractPythonDocstringExamples(content: string, file: string): CodeExample[] {
    const examples: CodeExample[] = [];

    // 匹配 >>> 开头的交互式示例
    const docstringMatches = content.matchAll(/"""[\s\S]*?"""/g);
    for (const match of docstringMatches) {
      const docstring = match[0];
      const exampleLines: string[] = [];
      let inExample = false;

      for (const line of docstring.split('\n')) {
        if (line.trim().startsWith('>>>')) {
          inExample = true;
          exampleLines.push(line.trim().substring(4));
        } else if (inExample && line.trim().startsWith('...')) {
          exampleLines.push(line.trim().substring(4));
        } else if (inExample && line.trim() && !line.trim().startsWith('>>>')) {
          // 输出行
          exampleLines.push(`# Output: ${line.trim()}`);
        } else if (inExample && !line.trim()) {
          inExample = false;
        }
      }

      if (exampleLines.length > 0) {
        examples.push({
          title: `示例 - ${path.basename(file)}`,
          code: exampleLines.join('\n'),
          language: 'python',
          sourceFile: file,
        });
      }
    }

    return examples;
  }

  /**
   * 获取示例标题
   */
  private getExampleTitle(file: string): string {
    const basename = path.basename(file, path.extname(file));
    return basename
      .replace(/[-_]/g, ' ')
      .replace(/example|demo/gi, '')
      .trim()
      .replace(/^\w/, c => c.toUpperCase()) || '示例';
  }

  /**
   * 提取文件描述
   */
  private extractFileDescription(content: string): string {
    // 尝试从文件头部注释提取描述
    const headerMatch = content.match(/^(?:\/\*\*[\s\S]*?\*\/|\/\/[^\n]*\n|#[^\n]*\n)/);
    if (headerMatch) {
      return headerMatch[0]
        .replace(/^\/\*\*|\*\/$/g, '')
        .replace(/^\s*\*\s?/gm, '')
        .replace(/^\/\/\s?/gm, '')
        .replace(/^#\s?/gm, '')
        .trim()
        .split('\n')[0];
    }
    return '';
  }

  /**
   * 提取主要代码
   */
  private extractMainCode(content: string): string {
    // 移除头部注释
    let code = content.replace(/^(?:\/\*\*[\s\S]*?\*\/\s*|(?:\/\/[^\n]*\n)+|(?:#[^\n]*\n)+)/, '');
    
    // 移除导入语句后的空行
    code = code.replace(/^((?:import|from|require|const\s+\w+\s*=\s*require)[^\n]*\n)+\n*/, '');
    
    // 限制代码长度
    const lines = code.split('\n');
    if (lines.length > 30) {
      return lines.slice(0, 30).join('\n') + '\n// ...';
    }
    
    return code.trim();
  }

  // ==================== 辅助方法 ====================

  /**
   * 查找源文件
   */
  private async findSourceFiles(): Promise<string[]> {
    const files: string[] = [];
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go'];

    const walkDir = (dir: string, baseDir: string = '') => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const relativePath = path.join(baseDir, entry.name);
        const fullPath = path.join(dir, entry.name);

        // 跳过排除的目录
        if (entry.isDirectory()) {
          if (!this.shouldExclude(relativePath)) {
            walkDir(fullPath, relativePath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.includes(ext) && !this.shouldExclude(relativePath)) {
            files.push(relativePath);
          }
        }
      }
    };

    walkDir(this.workingDirectory);
    return files;
  }

  /**
   * 查找示例文件
   */
  private async findExampleFiles(): Promise<string[]> {
    const files: string[] = [];
    const exampleDirs = ['examples', 'example', 'demo', 'demos'];

    for (const dir of exampleDirs) {
      const dirPath = path.join(this.workingDirectory, dir);
      if (fs.existsSync(dirPath)) {
        const walkDir = (currentDir: string, baseDir: string = dir) => {
          const entries = fs.readdirSync(currentDir, { withFileTypes: true });
          
          for (const entry of entries) {
            const relativePath = path.join(baseDir, entry.name);
            const fullPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
              walkDir(fullPath, relativePath);
            } else if (entry.isFile()) {
              files.push(relativePath);
            }
          }
        };
        walkDir(dirPath);
      }
    }

    return files;
  }

  /**
   * 检查是否应该排除
   */
  private shouldExclude(filePath: string): boolean {
    for (const pattern of this.config.excludePatterns || []) {
      if (this.matchPattern(filePath, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 匹配模式
   */
  private matchPattern(filePath: string, pattern: string): boolean {
    // 简单的 glob 匹配
    // 先处理 ** 模式，然后处理 * 模式
    let regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{DOUBLE_STAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\{\{DOUBLE_STAR\}\}/g, '.*');
    
    // 如果模式以 ** 结尾，确保可以匹配任意深度
    return new RegExp(`^${regexPattern}$`).test(filePath);
  }

  /**
   * 获取项目信息
   */
  private async getProjectInfo(): Promise<{ name: string; version?: string; description?: string }> {
    // 尝试从 package.json 读取
    const packageJsonPath = path.join(this.workingDirectory, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        return {
          name: packageJson.name || path.basename(this.workingDirectory),
          version: packageJson.version,
          description: packageJson.description,
        };
      } catch {
        // 忽略解析错误
      }
    }

    // 尝试从 pyproject.toml 读取
    const pyprojectPath = path.join(this.workingDirectory, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      const content = fs.readFileSync(pyprojectPath, 'utf-8');
      const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
      const versionMatch = content.match(/version\s*=\s*"([^"]+)"/);
      const descMatch = content.match(/description\s*=\s*"([^"]+)"/);
      
      return {
        name: nameMatch?.[1] || path.basename(this.workingDirectory),
        version: versionMatch?.[1],
        description: descMatch?.[1],
      };
    }

    // 尝试从 go.mod 读取
    const goModPath = path.join(this.workingDirectory, 'go.mod');
    if (fs.existsSync(goModPath)) {
      const content = fs.readFileSync(goModPath, 'utf-8');
      const moduleMatch = content.match(/module\s+(\S+)/);
      
      return {
        name: moduleMatch?.[1] || path.basename(this.workingDirectory),
      };
    }

    return {
      name: path.basename(this.workingDirectory),
    };
  }

  /**
   * 获取模块名称
   */
  private getModuleName(filePath: string): string {
    return path.basename(filePath, path.extname(filePath));
  }

  /**
   * 从扩展名获取语言
   */
  private getLanguageFromExtension(ext: string): string {
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
    };
    return langMap[ext] || 'text';
  }

  /**
   * 提取模块描述
   */
  private extractModuleDescription(content: string): string {
    // 尝试从文件头部的 JSDoc 注释提取
    const jsdocMatch = content.match(/^\/\*\*[\s\S]*?\*\//);
    if (jsdocMatch) {
      return this.extractJSDocDescription(content, 0);
    }
    return '';
  }

  /**
   * 提取 JSDoc 描述
   */
  private extractJSDocDescription(content: string, position: number): string {
    // 向前查找 JSDoc 注释
    const beforeContent = content.substring(0, position);
    const jsdocMatch = beforeContent.match(/\/\*\*[\s\S]*?\*\/\s*$/);
    
    if (jsdocMatch) {
      const jsdoc = jsdocMatch[0];
      // 提取描述（第一段非标签文本）
      const lines = jsdoc
        .replace(/^\/\*\*|\*\/$/g, '')
        .split('\n')
        .map(line => line.replace(/^\s*\*\s?/, '').trim())
        .filter(line => line && !line.startsWith('@'));
      
      return lines.join(' ').trim();
    }
    
    return '';
  }

  /**
   * 提取 Python docstring
   */
  private extractPythonDocstring(content: string, position: number): string {
    const afterContent = content.substring(position);
    const docstringMatch = afterContent.match(/^\s*"""([\s\S]*?)"""/);
    
    if (docstringMatch) {
      return docstringMatch[1].trim().split('\n')[0];
    }
    
    return '';
  }

  /**
   * 提取 JavaDoc 描述
   */
  private extractJavaDocDescription(content: string, position: number): string {
    return this.extractJSDocDescription(content, position);
  }

  /**
   * 提取 Go 文档注释
   */
  private extractGoDocComment(content: string, position: number): string {
    const beforeContent = content.substring(0, position);
    const lines = beforeContent.split('\n');
    const commentLines: string[] = [];
    
    // 从后向前查找连续的注释行
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('//')) {
        commentLines.unshift(line.substring(2).trim());
      } else if (line === '') {
        continue;
      } else {
        break;
      }
    }
    
    return commentLines.join(' ');
  }

  /**
   * 解析参数列表
   */
  private parseParameters(paramsStr: string): ParameterDoc[] {
    if (!paramsStr.trim()) return [];

    const params: ParameterDoc[] = [];
    const paramParts = this.splitParameters(paramsStr);

    for (const part of paramParts) {
      const match = part.match(/(\w+)(\?)?(?:\s*:\s*([^=]+))?(?:\s*=\s*(.+))?/);
      if (match) {
        params.push({
          name: match[1],
          type: match[3]?.trim() || 'any',
          optional: !!match[2] || !!match[4],
          defaultValue: match[4]?.trim(),
        });
      }
    }

    return params;
  }

  /**
   * 解析 Python 参数
   */
  private parsePythonParameters(paramsStr: string): ParameterDoc[] {
    if (!paramsStr.trim()) return [];

    const params: ParameterDoc[] = [];
    const paramParts = this.splitParameters(paramsStr);

    for (const part of paramParts) {
      if (part.trim() === 'self' || part.trim() === 'cls') continue;

      const match = part.match(/(\*{0,2}\w+)(?:\s*:\s*([^=]+))?(?:\s*=\s*(.+))?/);
      if (match) {
        params.push({
          name: match[1],
          type: match[2]?.trim() || 'Any',
          optional: !!match[3],
          defaultValue: match[3]?.trim(),
        });
      }
    }

    return params;
  }

  /**
   * 解析 Java 参数
   */
  private parseJavaParameters(paramsStr: string): ParameterDoc[] {
    if (!paramsStr.trim()) return [];

    const params: ParameterDoc[] = [];
    const paramParts = this.splitParameters(paramsStr);

    for (const part of paramParts) {
      const match = part.match(/([\w<>[\],\s]+)\s+(\w+)/);
      if (match) {
        params.push({
          name: match[2],
          type: match[1].trim(),
        });
      }
    }

    return params;
  }

  /**
   * 解析 Go 参数
   */
  private parseGoParameters(paramsStr: string): ParameterDoc[] {
    if (!paramsStr.trim()) return [];

    const params: ParameterDoc[] = [];
    const paramParts = this.splitParameters(paramsStr);

    for (const part of paramParts) {
      const match = part.match(/(\w+)\s+([\w*[\]]+)/);
      if (match) {
        params.push({
          name: match[1],
          type: match[2],
        });
      }
    }

    return params;
  }

  /**
   * 分割参数字符串
   */
  private splitParameters(paramsStr: string): string[] {
    const params: string[] = [];
    let current = '';
    let depth = 0;

    for (const char of paramsStr) {
      if (char === '(' || char === '<' || char === '[' || char === '{') {
        depth++;
        current += char;
      } else if (char === ')' || char === '>' || char === ']' || char === '}') {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        params.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      params.push(current.trim());
    }

    return params;
  }

  /**
   * 提取代码块
   */
  private extractBlock(content: string, startIndex: number): string {
    let depth = 0;
    let endIndex = startIndex;

    for (let i = startIndex; i < content.length; i++) {
      if (content[i] === '{') {
        depth++;
      } else if (content[i] === '}') {
        depth--;
        if (depth === 0) {
          endIndex = i;
          break;
        }
      }
    }

    return content.substring(startIndex + 1, endIndex);
  }

  /**
   * 提取 Python 代码块
   */
  private extractPythonBlock(content: string, startIndex: number): string {
    const lines = content.substring(startIndex).split('\n');
    const blockLines: string[] = [lines[0]];
    const baseIndent = lines[1]?.match(/^(\s*)/)?.[1].length || 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const indent = line.match(/^(\s*)/)?.[1].length || 0;
      
      if (line.trim() && indent < baseIndent) {
        break;
      }
      blockLines.push(line);
    }

    return blockLines.join('\n');
  }

  /**
   * 查找许可证文件
   */
  private async findLicenseFile(): Promise<string | null> {
    const licenseFiles = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md'];
    
    for (const file of licenseFiles) {
      const filePath = path.join(this.workingDirectory, file);
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }
    
    return null;
  }

  /**
   * 检测许可证类型
   */
  private async detectLicenseType(licensePath: string): Promise<string | null> {
    const content = fs.readFileSync(licensePath, 'utf-8').toLowerCase();
    
    if (content.includes('mit license') || content.includes('permission is hereby granted, free of charge')) {
      return 'MIT';
    } else if (content.includes('apache license') || content.includes('version 2.0')) {
      return 'Apache-2.0';
    } else if (content.includes('gnu general public license') || content.includes('gpl')) {
      return 'GPL';
    } else if (content.includes('bsd')) {
      return 'BSD';
    } else if (content.includes('isc license')) {
      return 'ISC';
    }
    
    return null;
  }

  /**
   * HTML 转义
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==================== 格式化 API 文档 ====================

  /**
   * 格式化 API 文档为 Markdown
   * 
   * @param apiDoc API 文档对象
   * @returns Markdown 格式的文档
   */
  formatAPIDocAsMarkdown(apiDoc: APIDoc): string {
    const lines: string[] = [];

    // 标题
    lines.push(`# ${apiDoc.projectName} API 文档\n`);
    
    if (apiDoc.version) {
      lines.push(`版本: ${apiDoc.version}\n`);
    }
    
    if (apiDoc.description) {
      lines.push(`${apiDoc.description}\n`);
    }

    lines.push(`生成时间: ${apiDoc.generatedAt.toISOString()}\n`);
    lines.push('---\n');

    // 目录
    lines.push('## 目录\n');
    for (const module of apiDoc.modules) {
      lines.push(`- [${module.name}](#${module.name.toLowerCase().replace(/\s+/g, '-')})`);
    }
    lines.push('\n---\n');

    // 模块文档
    for (const module of apiDoc.modules) {
      lines.push(`## ${module.name}\n`);
      
      if (module.description) {
        lines.push(`${module.description}\n`);
      }

      // 类
      if (module.classes.length > 0) {
        lines.push('### 类\n');
        for (const cls of module.classes) {
          lines.push(this.formatClassDoc(cls));
        }
      }

      // 接口
      if (module.interfaces.length > 0) {
        lines.push('### 接口\n');
        for (const iface of module.interfaces) {
          lines.push(this.formatClassDoc(iface));
        }
      }

      // 函数
      if (module.functions.length > 0) {
        lines.push('### 函数\n');
        for (const func of module.functions) {
          lines.push(this.formatFunctionDoc(func));
        }
      }

      // 类型
      if (module.types.length > 0) {
        lines.push('### 类型\n');
        for (const type of module.types) {
          lines.push(`#### \`${type.name}\`\n`);
          if (type.description) {
            lines.push(`${type.description}\n`);
          }
          lines.push('```typescript');
          lines.push(`type ${type.name} = ${type.definition}`);
          lines.push('```\n');
        }
      }

      lines.push('---\n');
    }

    return lines.join('\n');
  }

  /**
   * 格式化类文档
   */
  private formatClassDoc(cls: ClassDoc): string {
    const lines: string[] = [];

    lines.push(`#### \`${cls.name}\`\n`);
    
    if (cls.description) {
      lines.push(`${cls.description}\n`);
    }

    if (cls.extends) {
      lines.push(`继承自: \`${cls.extends}\`\n`);
    }

    if (cls.implements && cls.implements.length > 0) {
      lines.push(`实现: ${cls.implements.map(i => `\`${i}\``).join(', ')}\n`);
    }

    // 属性
    if (cls.properties.length > 0) {
      lines.push('**属性:**\n');
      lines.push('| 名称 | 类型 | 描述 |');
      lines.push('|------|------|------|');
      for (const prop of cls.properties) {
        const desc = prop.description || '-';
        lines.push(`| \`${prop.name}\` | \`${prop.type}\` | ${desc} |`);
      }
      lines.push('');
    }

    // 方法
    if (cls.methods.length > 0) {
      lines.push('**方法:**\n');
      for (const method of cls.methods) {
        lines.push(this.formatMethodDoc(method));
      }
    }

    return lines.join('\n');
  }

  /**
   * 格式化函数文档
   */
  private formatFunctionDoc(func: FunctionDoc): string {
    const lines: string[] = [];
    const asyncPrefix = func.isAsync ? 'async ' : '';
    const params = func.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
    const returnType = func.returns?.type || 'void';

    lines.push(`#### \`${asyncPrefix}${func.name}(${params}): ${returnType}\`\n`);
    
    if (func.description) {
      lines.push(`${func.description}\n`);
    }

    if (func.parameters.length > 0) {
      lines.push('**参数:**\n');
      lines.push('| 名称 | 类型 | 描述 |');
      lines.push('|------|------|------|');
      for (const param of func.parameters) {
        const optional = param.optional ? ' (可选)' : '';
        const desc = param.description || '-';
        lines.push(`| \`${param.name}\`${optional} | \`${param.type}\` | ${desc} |`);
      }
      lines.push('');
    }

    if (func.returns && func.returns.description) {
      lines.push(`**返回值:** ${func.returns.description}\n`);
    }

    return lines.join('\n');
  }

  /**
   * 格式化方法文档
   */
  private formatMethodDoc(method: FunctionDoc): string {
    const visibility = method.visibility ? `${method.visibility} ` : '';
    const staticPrefix = method.isStatic ? 'static ' : '';
    const asyncPrefix = method.isAsync ? 'async ' : '';
    const params = method.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
    const returnType = method.returns?.type || 'void';

    const lines: string[] = [];
    lines.push(`- \`${visibility}${staticPrefix}${asyncPrefix}${method.name}(${params}): ${returnType}\``);
    
    if (method.description) {
      lines.push(`  - ${method.description}`);
    }

    return lines.join('\n');
  }
}

/**
 * 创建文档生成器实例
 * 
 * @param config 配置选项
 * @returns 文档生成器实例
 */
export function createDocumentGenerator(config?: DocumentGeneratorConfig): DocumentGenerator {
  return new DocumentGenerator(config);
}
