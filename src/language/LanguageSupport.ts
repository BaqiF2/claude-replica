/**
 * 多语言支持模块
 * 
 * 提供项目语言检测、代码生成策略和最佳实践建议功能
 * 
 * 支持的编程语言:
 * - JavaScript/TypeScript
 * - Python
 * - Java
 * - Go
 * 
 * @module LanguageSupport
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * 支持的编程语言类型
 */
export type ProgrammingLanguage = 
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'java'
  | 'go'
  | 'unknown';

/**
 * 语言检测结果
 */
export interface LanguageDetectionResult {
  /** 主要语言 */
  primaryLanguage: ProgrammingLanguage;
  /** 检测到的所有语言及其文件数量 */
  detectedLanguages: Map<ProgrammingLanguage, number>;
  /** 置信度 (0-1) */
  confidence: number;
  /** 检测依据 */
  evidence: LanguageEvidence[];
}

/**
 * 语言检测依据
 */
export interface LanguageEvidence {
  /** 依据类型 */
  type: 'config_file' | 'source_file' | 'package_manager' | 'build_tool';
  /** 文件路径或描述 */
  source: string;
  /** 检测到的语言 */
  language: ProgrammingLanguage;
  /** 权重 (用于计算置信度) */
  weight: number;
}

/**
 * 代码生成策略
 */
export interface CodeGenerationStrategy {
  /** 目标语言 */
  language: ProgrammingLanguage;
  /** 文件扩展名 */
  fileExtension: string;
  /** 命名约定 */
  namingConvention: NamingConvention;
  /** 缩进风格 */
  indentation: IndentationStyle;
  /** 导入风格 */
  importStyle: ImportStyle;
  /** 类型系统 */
  typeSystem: TypeSystemInfo;
  /** 错误处理模式 */
  errorHandling: ErrorHandlingPattern;
  /** 异步模式 */
  asyncPattern: AsyncPattern;
  /** 测试框架建议 */
  testFramework: string;
  /** 包管理器 */
  packageManager: string;
}

/**
 * 命名约定
 */
export interface NamingConvention {
  /** 变量命名 */
  variables: 'camelCase' | 'snake_case' | 'PascalCase';
  /** 函数命名 */
  functions: 'camelCase' | 'snake_case' | 'PascalCase';
  /** 类命名 */
  classes: 'PascalCase' | 'snake_case';
  /** 常量命名 */
  constants: 'UPPER_SNAKE_CASE' | 'camelCase' | 'PascalCase';
  /** 文件命名 */
  files: 'kebab-case' | 'snake_case' | 'PascalCase' | 'camelCase';
  /** 私有成员前缀 */
  privatePrefix?: string;
}

/**
 * 缩进风格
 */
export interface IndentationStyle {
  /** 使用空格还是制表符 */
  type: 'spaces' | 'tabs';
  /** 缩进大小 */
  size: number;
}

/**
 * 导入风格
 */
export interface ImportStyle {
  /** 导入语法 */
  syntax: 'import' | 'require' | 'from_import' | 'import_static';
  /** 是否支持命名导入 */
  namedImports: boolean;
  /** 是否支持默认导入 */
  defaultImports: boolean;
  /** 导入排序规则 */
  sortOrder: 'alphabetical' | 'grouped' | 'none';
}

/**
 * 类型系统信息
 */
export interface TypeSystemInfo {
  /** 是否静态类型 */
  isStatic: boolean;
  /** 是否支持类型注解 */
  supportsAnnotations: boolean;
  /** 是否支持泛型 */
  supportsGenerics: boolean;
  /** 是否支持接口 */
  supportsInterfaces: boolean;
  /** 空值处理 */
  nullHandling: 'nullable' | 'optional' | 'none';
}

/**
 * 错误处理模式
 */
export interface ErrorHandlingPattern {
  /** 主要模式 */
  primary: 'exceptions' | 'error_values' | 'result_types';
  /** 是否支持 try-catch */
  supportsTryCatch: boolean;
  /** 是否支持 finally */
  supportsFinally: boolean;
  /** 自定义错误类型 */
  customErrorTypes: boolean;
}

/**
 * 异步模式
 */
export interface AsyncPattern {
  /** 主要模式 */
  primary: 'async_await' | 'promises' | 'callbacks' | 'goroutines' | 'threads';
  /** 是否支持 async/await */
  supportsAsyncAwait: boolean;
  /** 是否支持 Promise */
  supportsPromises: boolean;
  /** 并发原语 */
  concurrencyPrimitives: string[];
}

/**
 * 最佳实践建议
 */
export interface BestPractice {
  /** 建议类别 */
  category: 'naming' | 'structure' | 'error_handling' | 'testing' | 'documentation' | 'performance' | 'security';
  /** 建议标题 */
  title: string;
  /** 建议描述 */
  description: string;
  /** 代码示例 */
  example?: string;
  /** 反面示例 */
  antiPattern?: string;
  /** 优先级 */
  priority: 'high' | 'medium' | 'low';
}

/**
 * 语言支持配置
 */
export interface LanguageSupportConfig {
  /** 工作目录 */
  workingDirectory?: string;
  /** 排除的目录 */
  excludeDirectories?: string[];
  /** 最大扫描深度 */
  maxScanDepth?: number;
  /** 是否包含隐藏文件 */
  includeHidden?: boolean;
}


/**
 * 语言支持类
 * 
 * 提供项目语言检测、代码生成策略和最佳实践建议功能
 */
export class LanguageSupport {
  private workingDirectory: string;
  private config: LanguageSupportConfig;
  private detectionCache: LanguageDetectionResult | null = null;

  constructor(config: LanguageSupportConfig = {}) {
    this.workingDirectory = config.workingDirectory || process.cwd();
    this.config = {
      excludeDirectories: ['node_modules', 'vendor', 'venv', '.venv', '__pycache__', 
                          'target', 'build', 'dist', '.git', '.idea', '.vscode'],
      maxScanDepth: 5,
      includeHidden: false,
      ...config,
    };
  }

  // ==================== 语言检测 ====================

  /**
   * 检测项目的主要编程语言
   * 
   * 通过分析配置文件、源文件和构建工具来确定项目语言
   * 
   * @returns 语言检测结果
   */
  async detectLanguage(): Promise<LanguageDetectionResult> {
    if (this.detectionCache) {
      return this.detectionCache;
    }

    const evidence: LanguageEvidence[] = [];
    const languageCounts = new Map<ProgrammingLanguage, number>();

    // 1. 检查配置文件和包管理器
    await this.detectFromConfigFiles(evidence);

    // 2. 扫描源文件
    await this.scanSourceFiles(evidence, languageCounts);

    // 3. 检查构建工具
    await this.detectFromBuildTools(evidence);

    // 计算主要语言和置信度
    const result = this.calculateResult(evidence, languageCounts);
    this.detectionCache = result;

    return result;
  }

  /**
   * 清除检测缓存
   */
  clearCache(): void {
    this.detectionCache = null;
  }

  /**
   * 从配置文件检测语言
   */
  private async detectFromConfigFiles(evidence: LanguageEvidence[]): Promise<void> {
    const configChecks: Array<{
      file: string;
      language: ProgrammingLanguage;
      type: LanguageEvidence['type'];
      weight: number;
    }> = [
      // JavaScript/TypeScript
      { file: 'package.json', language: 'javascript', type: 'package_manager', weight: 0.8 },
      { file: 'tsconfig.json', language: 'typescript', type: 'config_file', weight: 0.9 },
      { file: 'jsconfig.json', language: 'javascript', type: 'config_file', weight: 0.7 },
      { file: '.eslintrc.json', language: 'javascript', type: 'config_file', weight: 0.5 },
      { file: '.eslintrc.js', language: 'javascript', type: 'config_file', weight: 0.5 },
      { file: 'webpack.config.js', language: 'javascript', type: 'build_tool', weight: 0.6 },
      { file: 'vite.config.ts', language: 'typescript', type: 'build_tool', weight: 0.7 },
      { file: 'next.config.js', language: 'javascript', type: 'config_file', weight: 0.6 },
      
      // Python
      { file: 'requirements.txt', language: 'python', type: 'package_manager', weight: 0.8 },
      { file: 'setup.py', language: 'python', type: 'package_manager', weight: 0.8 },
      { file: 'pyproject.toml', language: 'python', type: 'package_manager', weight: 0.9 },
      { file: 'Pipfile', language: 'python', type: 'package_manager', weight: 0.8 },
      { file: 'poetry.lock', language: 'python', type: 'package_manager', weight: 0.8 },
      { file: '.python-version', language: 'python', type: 'config_file', weight: 0.6 },
      { file: 'pytest.ini', language: 'python', type: 'config_file', weight: 0.5 },
      
      // Java
      { file: 'pom.xml', language: 'java', type: 'build_tool', weight: 0.9 },
      { file: 'build.gradle', language: 'java', type: 'build_tool', weight: 0.9 },
      { file: 'build.gradle.kts', language: 'java', type: 'build_tool', weight: 0.9 },
      { file: 'settings.gradle', language: 'java', type: 'build_tool', weight: 0.7 },
      { file: '.java-version', language: 'java', type: 'config_file', weight: 0.6 },
      
      // Go
      { file: 'go.mod', language: 'go', type: 'package_manager', weight: 0.9 },
      { file: 'go.sum', language: 'go', type: 'package_manager', weight: 0.7 },
      { file: 'Gopkg.toml', language: 'go', type: 'package_manager', weight: 0.8 },
    ];

    for (const check of configChecks) {
      const filePath = path.join(this.workingDirectory, check.file);
      if (fs.existsSync(filePath)) {
        evidence.push({
          type: check.type,
          source: check.file,
          language: check.language,
          weight: check.weight,
        });

        // 特殊处理: 检查 package.json 中是否有 TypeScript
        if (check.file === 'package.json') {
          await this.checkPackageJsonForTypeScript(filePath, evidence);
        }
      }
    }
  }

  /**
   * 检查 package.json 中是否使用 TypeScript
   */
  private async checkPackageJsonForTypeScript(
    filePath: string, 
    evidence: LanguageEvidence[]
  ): Promise<void> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const packageJson = JSON.parse(content);
      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      if (deps.typescript || deps['@types/node']) {
        evidence.push({
          type: 'package_manager',
          source: 'package.json (typescript dependency)',
          language: 'typescript',
          weight: 0.85,
        });
      }
    } catch {
      // 忽略解析错误
    }
  }

  /**
   * 扫描源文件
   */
  private async scanSourceFiles(
    evidence: LanguageEvidence[],
    languageCounts: Map<ProgrammingLanguage, number>
  ): Promise<void> {
    const extensionMap: Record<string, ProgrammingLanguage> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.py': 'python',
      '.pyw': 'python',
      '.java': 'java',
      '.go': 'go',
    };

    const files = await this.walkDirectory(this.workingDirectory, 0);
    
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const language = extensionMap[ext];
      
      if (language) {
        const count = languageCounts.get(language) || 0;
        languageCounts.set(language, count + 1);
      }
    }

    // 将文件统计转换为证据
    for (const [language, count] of languageCounts) {
      if (count > 0) {
        evidence.push({
          type: 'source_file',
          source: `${count} ${language} files`,
          language,
          weight: Math.min(0.9, 0.3 + (count / 100) * 0.6),
        });
      }
    }
  }

  /**
   * 递归遍历目录
   */
  private async walkDirectory(dir: string, depth: number): Promise<string[]> {
    if (depth > (this.config.maxScanDepth || 5)) {
      return [];
    }

    const files: string[] = [];
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        // 跳过排除的目录
        if (entry.isDirectory()) {
          if (this.config.excludeDirectories?.includes(entry.name)) {
            continue;
          }
          if (!this.config.includeHidden && entry.name.startsWith('.')) {
            continue;
          }
          const subFiles = await this.walkDirectory(fullPath, depth + 1);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch {
      // 忽略权限错误等
    }

    return files;
  }

  /**
   * 从构建工具检测语言
   */
  private async detectFromBuildTools(evidence: LanguageEvidence[]): Promise<void> {
    // 检查 Makefile 中的线索
    const makefilePath = path.join(this.workingDirectory, 'Makefile');
    if (fs.existsSync(makefilePath)) {
      try {
        const content = fs.readFileSync(makefilePath, 'utf-8');
        
        if (content.includes('go build') || content.includes('go test')) {
          evidence.push({
            type: 'build_tool',
            source: 'Makefile (go commands)',
            language: 'go',
            weight: 0.7,
          });
        }
        if (content.includes('python') || content.includes('pip')) {
          evidence.push({
            type: 'build_tool',
            source: 'Makefile (python commands)',
            language: 'python',
            weight: 0.6,
          });
        }
        if (content.includes('npm') || content.includes('yarn') || content.includes('pnpm')) {
          evidence.push({
            type: 'build_tool',
            source: 'Makefile (node commands)',
            language: 'javascript',
            weight: 0.6,
          });
        }
        if (content.includes('mvn') || content.includes('gradle')) {
          evidence.push({
            type: 'build_tool',
            source: 'Makefile (java commands)',
            language: 'java',
            weight: 0.6,
          });
        }
      } catch {
        // 忽略读取错误
      }
    }

    // 检查 Docker 文件中的线索
    const dockerfilePath = path.join(this.workingDirectory, 'Dockerfile');
    if (fs.existsSync(dockerfilePath)) {
      try {
        const content = fs.readFileSync(dockerfilePath, 'utf-8');
        
        if (content.includes('FROM node') || content.includes('FROM npm')) {
          evidence.push({
            type: 'build_tool',
            source: 'Dockerfile (node base image)',
            language: 'javascript',
            weight: 0.6,
          });
        }
        if (content.includes('FROM python')) {
          evidence.push({
            type: 'build_tool',
            source: 'Dockerfile (python base image)',
            language: 'python',
            weight: 0.6,
          });
        }
        if (content.includes('FROM golang') || content.includes('FROM go')) {
          evidence.push({
            type: 'build_tool',
            source: 'Dockerfile (go base image)',
            language: 'go',
            weight: 0.6,
          });
        }
        if (content.includes('FROM openjdk') || content.includes('FROM maven') || content.includes('FROM gradle')) {
          evidence.push({
            type: 'build_tool',
            source: 'Dockerfile (java base image)',
            language: 'java',
            weight: 0.6,
          });
        }
      } catch {
        // 忽略读取错误
      }
    }
  }

  /**
   * 计算检测结果
   */
  private calculateResult(
    evidence: LanguageEvidence[],
    languageCounts: Map<ProgrammingLanguage, number>
  ): LanguageDetectionResult {
    // 计算每种语言的加权分数
    const scores = new Map<ProgrammingLanguage, number>();
    
    for (const e of evidence) {
      const currentScore = scores.get(e.language) || 0;
      scores.set(e.language, currentScore + e.weight);
    }

    // 找出得分最高的语言
    let primaryLanguage: ProgrammingLanguage = 'unknown';
    let maxScore = 0;
    let totalScore = 0;

    for (const [language, score] of scores) {
      totalScore += score;
      if (score > maxScore) {
        maxScore = score;
        primaryLanguage = language;
      }
    }

    // 计算置信度
    const confidence = totalScore > 0 ? Math.min(1, maxScore / totalScore) : 0;

    return {
      primaryLanguage,
      detectedLanguages: languageCounts,
      confidence,
      evidence,
    };
  }


  // ==================== 代码生成策略 ====================

  /**
   * 获取指定语言的代码生成策略
   * 
   * @param language 目标语言
   * @returns 代码生成策略
   */
  getCodeGenerationStrategy(language: ProgrammingLanguage): CodeGenerationStrategy {
    switch (language) {
      case 'javascript':
        return this.getJavaScriptStrategy();
      case 'typescript':
        return this.getTypeScriptStrategy();
      case 'python':
        return this.getPythonStrategy();
      case 'java':
        return this.getJavaStrategy();
      case 'go':
        return this.getGoStrategy();
      default:
        return this.getDefaultStrategy();
    }
  }

  /**
   * 获取 JavaScript 代码生成策略
   */
  private getJavaScriptStrategy(): CodeGenerationStrategy {
    return {
      language: 'javascript',
      fileExtension: '.js',
      namingConvention: {
        variables: 'camelCase',
        functions: 'camelCase',
        classes: 'PascalCase',
        constants: 'UPPER_SNAKE_CASE',
        files: 'camelCase',
        privatePrefix: '_',
      },
      indentation: {
        type: 'spaces',
        size: 2,
      },
      importStyle: {
        syntax: 'import',
        namedImports: true,
        defaultImports: true,
        sortOrder: 'grouped',
      },
      typeSystem: {
        isStatic: false,
        supportsAnnotations: false,
        supportsGenerics: false,
        supportsInterfaces: false,
        nullHandling: 'nullable',
      },
      errorHandling: {
        primary: 'exceptions',
        supportsTryCatch: true,
        supportsFinally: true,
        customErrorTypes: true,
      },
      asyncPattern: {
        primary: 'async_await',
        supportsAsyncAwait: true,
        supportsPromises: true,
        concurrencyPrimitives: ['Promise', 'Promise.all', 'Promise.race', 'Promise.allSettled'],
      },
      testFramework: 'jest',
      packageManager: 'npm',
    };
  }

  /**
   * 获取 TypeScript 代码生成策略
   */
  private getTypeScriptStrategy(): CodeGenerationStrategy {
    return {
      language: 'typescript',
      fileExtension: '.ts',
      namingConvention: {
        variables: 'camelCase',
        functions: 'camelCase',
        classes: 'PascalCase',
        constants: 'UPPER_SNAKE_CASE',
        files: 'camelCase',
        privatePrefix: 'private',
      },
      indentation: {
        type: 'spaces',
        size: 2,
      },
      importStyle: {
        syntax: 'import',
        namedImports: true,
        defaultImports: true,
        sortOrder: 'grouped',
      },
      typeSystem: {
        isStatic: true,
        supportsAnnotations: true,
        supportsGenerics: true,
        supportsInterfaces: true,
        nullHandling: 'optional',
      },
      errorHandling: {
        primary: 'exceptions',
        supportsTryCatch: true,
        supportsFinally: true,
        customErrorTypes: true,
      },
      asyncPattern: {
        primary: 'async_await',
        supportsAsyncAwait: true,
        supportsPromises: true,
        concurrencyPrimitives: ['Promise', 'Promise.all', 'Promise.race', 'Promise.allSettled'],
      },
      testFramework: 'jest',
      packageManager: 'npm',
    };
  }

  /**
   * 获取 Python 代码生成策略
   */
  private getPythonStrategy(): CodeGenerationStrategy {
    return {
      language: 'python',
      fileExtension: '.py',
      namingConvention: {
        variables: 'snake_case',
        functions: 'snake_case',
        classes: 'PascalCase',
        constants: 'UPPER_SNAKE_CASE',
        files: 'snake_case',
        privatePrefix: '_',
      },
      indentation: {
        type: 'spaces',
        size: 4,
      },
      importStyle: {
        syntax: 'from_import',
        namedImports: true,
        defaultImports: false,
        sortOrder: 'grouped',
      },
      typeSystem: {
        isStatic: false,
        supportsAnnotations: true,
        supportsGenerics: true,
        supportsInterfaces: false,
        nullHandling: 'optional',
      },
      errorHandling: {
        primary: 'exceptions',
        supportsTryCatch: true,
        supportsFinally: true,
        customErrorTypes: true,
      },
      asyncPattern: {
        primary: 'async_await',
        supportsAsyncAwait: true,
        supportsPromises: false,
        concurrencyPrimitives: ['asyncio', 'threading', 'multiprocessing', 'concurrent.futures'],
      },
      testFramework: 'pytest',
      packageManager: 'pip',
    };
  }

  /**
   * 获取 Java 代码生成策略
   */
  private getJavaStrategy(): CodeGenerationStrategy {
    return {
      language: 'java',
      fileExtension: '.java',
      namingConvention: {
        variables: 'camelCase',
        functions: 'camelCase',
        classes: 'PascalCase',
        constants: 'UPPER_SNAKE_CASE',
        files: 'PascalCase',
        privatePrefix: 'private',
      },
      indentation: {
        type: 'spaces',
        size: 4,
      },
      importStyle: {
        syntax: 'import_static',
        namedImports: false,
        defaultImports: false,
        sortOrder: 'grouped',
      },
      typeSystem: {
        isStatic: true,
        supportsAnnotations: true,
        supportsGenerics: true,
        supportsInterfaces: true,
        nullHandling: 'nullable',
      },
      errorHandling: {
        primary: 'exceptions',
        supportsTryCatch: true,
        supportsFinally: true,
        customErrorTypes: true,
      },
      asyncPattern: {
        primary: 'threads',
        supportsAsyncAwait: false,
        supportsPromises: false,
        concurrencyPrimitives: ['Thread', 'ExecutorService', 'CompletableFuture', 'ForkJoinPool'],
      },
      testFramework: 'junit',
      packageManager: 'maven',
    };
  }

  /**
   * 获取 Go 代码生成策略
   */
  private getGoStrategy(): CodeGenerationStrategy {
    return {
      language: 'go',
      fileExtension: '.go',
      namingConvention: {
        variables: 'camelCase',
        functions: 'camelCase',
        classes: 'PascalCase',
        constants: 'PascalCase',
        files: 'snake_case',
      },
      indentation: {
        type: 'tabs',
        size: 1,
      },
      importStyle: {
        syntax: 'import',
        namedImports: false,
        defaultImports: false,
        sortOrder: 'grouped',
      },
      typeSystem: {
        isStatic: true,
        supportsAnnotations: false,
        supportsGenerics: true,
        supportsInterfaces: true,
        nullHandling: 'nullable',
      },
      errorHandling: {
        primary: 'error_values',
        supportsTryCatch: false,
        supportsFinally: false,
        customErrorTypes: true,
      },
      asyncPattern: {
        primary: 'goroutines',
        supportsAsyncAwait: false,
        supportsPromises: false,
        concurrencyPrimitives: ['goroutine', 'channel', 'sync.WaitGroup', 'sync.Mutex', 'context'],
      },
      testFramework: 'go-test',
      packageManager: 'go-modules',
    };
  }

  /**
   * 获取默认代码生成策略
   */
  private getDefaultStrategy(): CodeGenerationStrategy {
    return this.getJavaScriptStrategy();
  }


  // ==================== 最佳实践建议 ====================

  /**
   * 获取指定语言的最佳实践建议
   * 
   * @param language 目标语言
   * @returns 最佳实践建议列表
   */
  getBestPractices(language: ProgrammingLanguage): BestPractice[] {
    switch (language) {
      case 'javascript':
        return this.getJavaScriptBestPractices();
      case 'typescript':
        return this.getTypeScriptBestPractices();
      case 'python':
        return this.getPythonBestPractices();
      case 'java':
        return this.getJavaBestPractices();
      case 'go':
        return this.getGoBestPractices();
      default:
        return this.getGeneralBestPractices();
    }
  }

  /**
   * JavaScript 最佳实践
   */
  private getJavaScriptBestPractices(): BestPractice[] {
    return [
      {
        category: 'naming',
        title: '使用有意义的变量名',
        description: '变量名应该清晰地描述其用途，避免使用单字母变量名（循环计数器除外）',
        example: 'const userEmail = "user@example.com";\nconst isAuthenticated = true;',
        antiPattern: 'const x = "user@example.com";\nconst flag = true;',
        priority: 'high',
      },
      {
        category: 'structure',
        title: '使用 ES6+ 模块语法',
        description: '优先使用 import/export 而不是 require/module.exports',
        example: 'import { useState } from "react";\nexport const MyComponent = () => {};',
        antiPattern: 'const { useState } = require("react");\nmodule.exports = MyComponent;',
        priority: 'medium',
      },
      {
        category: 'error_handling',
        title: '正确处理 Promise 错误',
        description: '始终使用 try-catch 或 .catch() 处理 Promise 错误',
        example: 'try {\n  const data = await fetchData();\n} catch (error) {\n  console.error("获取数据失败:", error);\n}',
        antiPattern: 'const data = await fetchData(); // 未处理错误',
        priority: 'high',
      },
      {
        category: 'testing',
        title: '编写单元测试',
        description: '为关键业务逻辑编写单元测试，使用 Jest 或 Vitest',
        example: 'describe("calculateTotal", () => {\n  it("应该正确计算总价", () => {\n    expect(calculateTotal([10, 20])).toBe(30);\n  });\n});',
        priority: 'high',
      },
      {
        category: 'performance',
        title: '避免不必要的重新渲染',
        description: '使用 useMemo、useCallback 和 React.memo 优化性能',
        example: 'const memoizedValue = useMemo(() => computeExpensiveValue(a, b), [a, b]);',
        priority: 'medium',
      },
      {
        category: 'security',
        title: '避免使用 eval()',
        description: 'eval() 会执行任意代码，存在安全风险',
        antiPattern: 'eval(userInput); // 危险！',
        priority: 'high',
      },
      {
        category: 'documentation',
        title: '使用 JSDoc 注释',
        description: '为公共 API 添加 JSDoc 注释，提高代码可读性',
        example: '/**\n * 计算两个数的和\n * @param {number} a - 第一个数\n * @param {number} b - 第二个数\n * @returns {number} 两数之和\n */\nfunction add(a, b) {\n  return a + b;\n}',
        priority: 'medium',
      },
    ];
  }

  /**
   * TypeScript 最佳实践
   */
  private getTypeScriptBestPractices(): BestPractice[] {
    return [
      ...this.getJavaScriptBestPractices(),
      {
        category: 'naming',
        title: '接口命名不使用 I 前缀',
        description: 'TypeScript 社区推荐不使用 I 前缀命名接口',
        example: 'interface User {\n  name: string;\n}',
        antiPattern: 'interface IUser {\n  name: string;\n}',
        priority: 'low',
      },
      {
        category: 'structure',
        title: '优先使用 interface 而非 type',
        description: '对于对象类型，优先使用 interface，因为它支持声明合并和更好的错误提示',
        example: 'interface User {\n  name: string;\n  age: number;\n}',
        antiPattern: 'type User = {\n  name: string;\n  age: number;\n};',
        priority: 'low',
      },
      {
        category: 'structure',
        title: '使用严格模式',
        description: '在 tsconfig.json 中启用 strict 模式以获得更好的类型检查',
        example: '{\n  "compilerOptions": {\n    "strict": true\n  }\n}',
        priority: 'high',
      },
      {
        category: 'error_handling',
        title: '使用类型守卫',
        description: '使用类型守卫来缩小类型范围，提高类型安全性',
        example: 'function isString(value: unknown): value is string {\n  return typeof value === "string";\n}',
        priority: 'medium',
      },
      {
        category: 'structure',
        title: '避免使用 any 类型',
        description: '尽量避免使用 any，使用 unknown 或具体类型代替',
        example: 'function processData(data: unknown): void {\n  if (typeof data === "string") {\n    console.log(data.toUpperCase());\n  }\n}',
        antiPattern: 'function processData(data: any): void {\n  console.log(data.toUpperCase()); // 可能运行时错误\n}',
        priority: 'high',
      },
      {
        category: 'structure',
        title: '使用枚举或联合类型',
        description: '对于固定的值集合，使用枚举或字符串联合类型',
        example: 'type Status = "pending" | "approved" | "rejected";\n// 或\nenum Status {\n  Pending = "pending",\n  Approved = "approved",\n  Rejected = "rejected"\n}',
        priority: 'medium',
      },
    ];
  }

  /**
   * Python 最佳实践
   */
  private getPythonBestPractices(): BestPractice[] {
    return [
      {
        category: 'naming',
        title: '遵循 PEP 8 命名规范',
        description: '函数和变量使用 snake_case，类使用 PascalCase，常量使用 UPPER_SNAKE_CASE',
        example: 'def calculate_total(items):\n    pass\n\nclass UserAccount:\n    pass\n\nMAX_RETRY_COUNT = 3',
        antiPattern: 'def CalculateTotal(Items):\n    pass',
        priority: 'high',
      },
      {
        category: 'structure',
        title: '使用类型注解',
        description: '为函数参数和返回值添加类型注解，提高代码可读性',
        example: 'def greet(name: str) -> str:\n    return f"Hello, {name}!"',
        antiPattern: 'def greet(name):\n    return f"Hello, {name}!"',
        priority: 'medium',
      },
      {
        category: 'structure',
        title: '使用 dataclass 简化数据类',
        description: '对于主要存储数据的类，使用 @dataclass 装饰器',
        example: 'from dataclasses import dataclass\n\n@dataclass\nclass User:\n    name: str\n    age: int\n    email: str',
        priority: 'medium',
      },
      {
        category: 'error_handling',
        title: '使用具体的异常类型',
        description: '捕获具体的异常类型，而不是使用裸 except',
        example: 'try:\n    value = int(user_input)\nexcept ValueError as e:\n    print(f"无效输入: {e}")',
        antiPattern: 'try:\n    value = int(user_input)\nexcept:\n    print("出错了")',
        priority: 'high',
      },
      {
        category: 'testing',
        title: '使用 pytest 编写测试',
        description: '使用 pytest 框架编写简洁的测试代码',
        example: 'def test_add():\n    assert add(1, 2) == 3\n\ndef test_add_negative():\n    assert add(-1, 1) == 0',
        priority: 'high',
      },
      {
        category: 'documentation',
        title: '使用 docstring 文档',
        description: '为模块、类和函数添加 docstring 文档',
        example: 'def calculate_area(radius: float) -> float:\n    """计算圆的面积。\n\n    Args:\n        radius: 圆的半径\n\n    Returns:\n        圆的面积\n    """\n    return 3.14159 * radius ** 2',
        priority: 'medium',
      },
      {
        category: 'performance',
        title: '使用列表推导式',
        description: '对于简单的列表转换，使用列表推导式而不是循环',
        example: 'squares = [x ** 2 for x in range(10)]',
        antiPattern: 'squares = []\nfor x in range(10):\n    squares.append(x ** 2)',
        priority: 'low',
      },
      {
        category: 'security',
        title: '避免使用 eval()',
        description: 'eval() 会执行任意代码，存在安全风险',
        antiPattern: 'result = eval(user_input)  # 危险！',
        priority: 'high',
      },
    ];
  }

  /**
   * Java 最佳实践
   */
  private getJavaBestPractices(): BestPractice[] {
    return [
      {
        category: 'naming',
        title: '遵循 Java 命名规范',
        description: '类使用 PascalCase，方法和变量使用 camelCase，常量使用 UPPER_SNAKE_CASE',
        example: 'public class UserService {\n    private static final int MAX_USERS = 100;\n    \n    public void createUser(String userName) {\n        // ...\n    }\n}',
        priority: 'high',
      },
      {
        category: 'structure',
        title: '使用 Optional 处理可空值',
        description: '使用 Optional 而不是返回 null，避免 NullPointerException',
        example: 'public Optional<User> findUserById(Long id) {\n    return Optional.ofNullable(userRepository.findById(id));\n}',
        antiPattern: 'public User findUserById(Long id) {\n    return userRepository.findById(id); // 可能返回 null\n}',
        priority: 'high',
      },
      {
        category: 'structure',
        title: '使用 Stream API',
        description: '对于集合操作，使用 Stream API 提高代码可读性',
        example: 'List<String> names = users.stream()\n    .filter(u -> u.getAge() > 18)\n    .map(User::getName)\n    .collect(Collectors.toList());',
        priority: 'medium',
      },
      {
        category: 'error_handling',
        title: '使用具体的异常类型',
        description: '抛出和捕获具体的异常类型，而不是使用 Exception',
        example: 'public void processFile(String path) throws FileNotFoundException, IOException {\n    // ...\n}',
        antiPattern: 'public void processFile(String path) throws Exception {\n    // ...\n}',
        priority: 'high',
      },
      {
        category: 'testing',
        title: '使用 JUnit 5 编写测试',
        description: '使用 JUnit 5 和 AssertJ 编写清晰的测试代码',
        example: '@Test\nvoid shouldCalculateTotal() {\n    assertThat(calculator.add(1, 2)).isEqualTo(3);\n}',
        priority: 'high',
      },
      {
        category: 'documentation',
        title: '使用 Javadoc 注释',
        description: '为公共 API 添加 Javadoc 注释',
        example: '/**\n * 计算两个数的和。\n *\n * @param a 第一个数\n * @param b 第二个数\n * @return 两数之和\n */\npublic int add(int a, int b) {\n    return a + b;\n}',
        priority: 'medium',
      },
      {
        category: 'structure',
        title: '使用 record 类型',
        description: 'Java 16+ 中，对于不可变数据类使用 record',
        example: 'public record User(String name, int age, String email) {}',
        priority: 'medium',
      },
      {
        category: 'security',
        title: '使用参数化查询',
        description: '避免 SQL 注入，使用 PreparedStatement 或 ORM',
        example: 'PreparedStatement stmt = conn.prepareStatement("SELECT * FROM users WHERE id = ?");\nstmt.setLong(1, userId);',
        antiPattern: 'Statement stmt = conn.createStatement();\nstmt.executeQuery("SELECT * FROM users WHERE id = " + userId);',
        priority: 'high',
      },
    ];
  }

  /**
   * Go 最佳实践
   */
  private getGoBestPractices(): BestPractice[] {
    return [
      {
        category: 'naming',
        title: '遵循 Go 命名规范',
        description: '导出的标识符使用 PascalCase，非导出的使用 camelCase',
        example: 'type UserService struct {\n    db *sql.DB\n}\n\nfunc (s *UserService) CreateUser(name string) error {\n    // ...\n}',
        priority: 'high',
      },
      {
        category: 'error_handling',
        title: '显式处理错误',
        description: 'Go 使用返回值处理错误，不要忽略错误',
        example: 'result, err := doSomething()\nif err != nil {\n    return fmt.Errorf("操作失败: %w", err)\n}',
        antiPattern: 'result, _ := doSomething() // 忽略错误',
        priority: 'high',
      },
      {
        category: 'error_handling',
        title: '使用错误包装',
        description: '使用 fmt.Errorf 和 %w 包装错误，保留错误链',
        example: 'if err != nil {\n    return fmt.Errorf("处理用户 %s 失败: %w", userID, err)\n}',
        priority: 'medium',
      },
      {
        category: 'structure',
        title: '使用接口实现多态',
        description: 'Go 使用隐式接口实现，定义小而专注的接口',
        example: 'type Reader interface {\n    Read(p []byte) (n int, err error)\n}\n\ntype Writer interface {\n    Write(p []byte) (n int, err error)\n}',
        priority: 'medium',
      },
      {
        category: 'testing',
        title: '使用表驱动测试',
        description: '使用表驱动测试模式编写全面的测试',
        example: 'func TestAdd(t *testing.T) {\n    tests := []struct {\n        a, b, want int\n    }{\n        {1, 2, 3},\n        {0, 0, 0},\n        {-1, 1, 0},\n    }\n    for _, tt := range tests {\n        got := Add(tt.a, tt.b)\n        if got != tt.want {\n            t.Errorf("Add(%d, %d) = %d; want %d", tt.a, tt.b, got, tt.want)\n        }\n    }\n}',
        priority: 'high',
      },
      {
        category: 'documentation',
        title: '使用 godoc 注释',
        description: '为导出的标识符添加注释，注释以标识符名称开头',
        example: '// UserService 提供用户相关的业务逻辑。\ntype UserService struct {\n    // ...\n}\n\n// CreateUser 创建新用户。\nfunc (s *UserService) CreateUser(name string) error {\n    // ...\n}',
        priority: 'medium',
      },
      {
        category: 'performance',
        title: '使用 goroutine 和 channel',
        description: '利用 Go 的并发原语处理并发任务',
        example: 'ch := make(chan Result)\ngo func() {\n    result := doWork()\n    ch <- result\n}()\nresult := <-ch',
        priority: 'medium',
      },
      {
        category: 'structure',
        title: '使用 context 传递取消信号',
        description: '使用 context.Context 传递取消信号和超时',
        example: 'func DoWork(ctx context.Context) error {\n    select {\n    case <-ctx.Done():\n        return ctx.Err()\n    default:\n        // 执行工作\n    }\n    return nil\n}',
        priority: 'high',
      },
    ];
  }

  /**
   * 通用最佳实践
   */
  private getGeneralBestPractices(): BestPractice[] {
    return [
      {
        category: 'naming',
        title: '使用有意义的名称',
        description: '变量、函数和类的名称应该清晰地描述其用途',
        priority: 'high',
      },
      {
        category: 'structure',
        title: '保持函数简短',
        description: '函数应该只做一件事，保持在 20-30 行以内',
        priority: 'medium',
      },
      {
        category: 'error_handling',
        title: '正确处理错误',
        description: '不要忽略错误，提供有意义的错误信息',
        priority: 'high',
      },
      {
        category: 'testing',
        title: '编写测试',
        description: '为关键业务逻辑编写单元测试',
        priority: 'high',
      },
      {
        category: 'documentation',
        title: '添加注释',
        description: '为复杂的逻辑添加注释，解释"为什么"而不是"是什么"',
        priority: 'medium',
      },
      {
        category: 'security',
        title: '验证输入',
        description: '始终验证和清理用户输入',
        priority: 'high',
      },
    ];
  }


  // ==================== 代码模板生成 ====================

  /**
   * 生成函数模板
   * 
   * @param language 目标语言
   * @param name 函数名
   * @param params 参数列表
   * @param returnType 返回类型
   * @param isAsync 是否异步
   * @returns 函数模板代码
   */
  generateFunctionTemplate(
    language: ProgrammingLanguage,
    name: string,
    params: Array<{ name: string; type: string }> = [],
    returnType?: string,
    isAsync: boolean = false
  ): string {
    const strategy = this.getCodeGenerationStrategy(language);
    const indent = strategy.indentation.type === 'spaces' 
      ? ' '.repeat(strategy.indentation.size) 
      : '\t';

    switch (language) {
      case 'javascript':
        return this.generateJavaScriptFunction(name, params, isAsync, indent);
      case 'typescript':
        return this.generateTypeScriptFunction(name, params, returnType, isAsync, indent);
      case 'python':
        return this.generatePythonFunction(name, params, returnType, isAsync, indent);
      case 'java':
        return this.generateJavaMethod(name, params, returnType || 'void', indent);
      case 'go':
        return this.generateGoFunction(name, params, returnType, indent);
      default:
        return this.generateJavaScriptFunction(name, params, isAsync, indent);
    }
  }

  private generateJavaScriptFunction(
    name: string,
    params: Array<{ name: string; type: string }>,
    isAsync: boolean,
    indent: string
  ): string {
    const asyncPrefix = isAsync ? 'async ' : '';
    const paramList = params.map(p => p.name).join(', ');
    
    return `${asyncPrefix}function ${name}(${paramList}) {
${indent}// TODO: 实现函数逻辑
${indent}throw new Error('Not implemented');
}`;
  }

  private generateTypeScriptFunction(
    name: string,
    params: Array<{ name: string; type: string }>,
    returnType: string | undefined,
    isAsync: boolean,
    indent: string
  ): string {
    const asyncPrefix = isAsync ? 'async ' : '';
    const paramList = params.map(p => `${p.name}: ${p.type}`).join(', ');
    const returnTypeStr = returnType 
      ? `: ${isAsync ? `Promise<${returnType}>` : returnType}` 
      : '';
    
    return `${asyncPrefix}function ${name}(${paramList})${returnTypeStr} {
${indent}// TODO: 实现函数逻辑
${indent}throw new Error('Not implemented');
}`;
  }

  private generatePythonFunction(
    name: string,
    params: Array<{ name: string; type: string }>,
    returnType: string | undefined,
    isAsync: boolean,
    indent: string
  ): string {
    const asyncPrefix = isAsync ? 'async ' : '';
    const paramList = params.map(p => `${p.name}: ${p.type}`).join(', ');
    const returnTypeStr = returnType ? ` -> ${returnType}` : '';
    
    return `${asyncPrefix}def ${name}(${paramList})${returnTypeStr}:
${indent}"""
${indent}TODO: 添加函数文档
${indent}"""
${indent}raise NotImplementedError()`;
  }

  private generateJavaMethod(
    name: string,
    params: Array<{ name: string; type: string }>,
    returnType: string,
    indent: string
  ): string {
    const paramList = params.map(p => `${p.type} ${p.name}`).join(', ');
    
    return `public ${returnType} ${name}(${paramList}) {
${indent}// TODO: 实现方法逻辑
${indent}throw new UnsupportedOperationException("Not implemented");
}`;
  }

  private generateGoFunction(
    name: string,
    params: Array<{ name: string; type: string }>,
    returnType: string | undefined,
    indent: string
  ): string {
    const paramList = params.map(p => `${p.name} ${p.type}`).join(', ');
    const returnTypeStr = returnType ? ` ${returnType}` : '';
    
    return `func ${name}(${paramList})${returnTypeStr} {
${indent}// TODO: 实现函数逻辑
${indent}panic("not implemented")
}`;
  }

  /**
   * 生成类模板
   * 
   * @param language 目标语言
   * @param name 类名
   * @param properties 属性列表
   * @returns 类模板代码
   */
  generateClassTemplate(
    language: ProgrammingLanguage,
    name: string,
    properties: Array<{ name: string; type: string; visibility?: string }> = []
  ): string {
    const strategy = this.getCodeGenerationStrategy(language);
    const indent = strategy.indentation.type === 'spaces' 
      ? ' '.repeat(strategy.indentation.size) 
      : '\t';

    switch (language) {
      case 'javascript':
        return this.generateJavaScriptClass(name, properties, indent);
      case 'typescript':
        return this.generateTypeScriptClass(name, properties, indent);
      case 'python':
        return this.generatePythonClass(name, properties, indent);
      case 'java':
        return this.generateJavaClass(name, properties, indent);
      case 'go':
        return this.generateGoStruct(name, properties, indent);
      default:
        return this.generateJavaScriptClass(name, properties, indent);
    }
  }

  private generateJavaScriptClass(
    name: string,
    properties: Array<{ name: string; type: string; visibility?: string }>,
    indent: string
  ): string {
    const propAssignments = properties
      .map(p => `${indent}${indent}this.${p.name} = ${p.name};`)
      .join('\n');
    const constructorParams = properties.map(p => p.name).join(', ');
    
    return `class ${name} {
${indent}constructor(${constructorParams}) {
${propAssignments}
${indent}}
}`;
  }

  private generateTypeScriptClass(
    name: string,
    properties: Array<{ name: string; type: string; visibility?: string }>,
    indent: string
  ): string {
    const propDeclarations = properties
      .map(p => `${indent}${p.visibility || 'private'} ${p.name}: ${p.type};`)
      .join('\n');
    const constructorParams = properties
      .map(p => `${p.name}: ${p.type}`)
      .join(', ');
    const propAssignments = properties
      .map(p => `${indent}${indent}this.${p.name} = ${p.name};`)
      .join('\n');
    
    return `class ${name} {
${propDeclarations}

${indent}constructor(${constructorParams}) {
${propAssignments}
${indent}}
}`;
  }

  private generatePythonClass(
    name: string,
    properties: Array<{ name: string; type: string; visibility?: string }>,
    indent: string
  ): string {
    const initParams = properties
      .map(p => `${p.name}: ${p.type}`)
      .join(', ');
    const propAssignments = properties
      .map(p => {
        const prefix = p.visibility === 'private' ? '_' : '';
        return `${indent}${indent}self.${prefix}${p.name} = ${p.name}`;
      })
      .join('\n');
    
    return `class ${name}:
${indent}"""
${indent}TODO: 添加类文档
${indent}"""
${indent}
${indent}def __init__(self, ${initParams}) -> None:
${propAssignments}`;
  }

  private generateJavaClass(
    name: string,
    properties: Array<{ name: string; type: string; visibility?: string }>,
    indent: string
  ): string {
    const propDeclarations = properties
      .map(p => `${indent}${p.visibility || 'private'} ${p.type} ${p.name};`)
      .join('\n');
    const constructorParams = properties
      .map(p => `${p.type} ${p.name}`)
      .join(', ');
    const propAssignments = properties
      .map(p => `${indent}${indent}this.${p.name} = ${p.name};`)
      .join('\n');
    
    return `public class ${name} {
${propDeclarations}

${indent}public ${name}(${constructorParams}) {
${propAssignments}
${indent}}
}`;
  }

  private generateGoStruct(
    name: string,
    properties: Array<{ name: string; type: string; visibility?: string }>,
    indent: string
  ): string {
    const propDeclarations = properties
      .map(p => {
        // Go 中首字母大写表示导出
        const fieldName = p.visibility === 'public' 
          ? p.name.charAt(0).toUpperCase() + p.name.slice(1)
          : p.name;
        return `${indent}${fieldName} ${p.type}`;
      })
      .join('\n');
    
    return `type ${name} struct {
${propDeclarations}
}`;
  }

  // ==================== 辅助方法 ====================

  /**
   * 将字符串转换为指定的命名风格
   * 
   * @param str 原始字符串
   * @param style 目标命名风格
   * @returns 转换后的字符串
   */
  convertNamingStyle(
    str: string, 
    style: 'camelCase' | 'snake_case' | 'PascalCase' | 'UPPER_SNAKE_CASE' | 'kebab-case'
  ): string {
    // 首先将字符串分割成单词
    const words = str
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 0);

    switch (style) {
      case 'camelCase':
        return words
          .map((w, i) => i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))
          .join('');
      case 'PascalCase':
        return words
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join('');
      case 'snake_case':
        return words.join('_');
      case 'UPPER_SNAKE_CASE':
        return words.join('_').toUpperCase();
      case 'kebab-case':
        return words.join('-');
      default:
        return str;
    }
  }

  /**
   * 获取语言的文件扩展名
   * 
   * @param language 编程语言
   * @returns 文件扩展名
   */
  getFileExtension(language: ProgrammingLanguage): string {
    const strategy = this.getCodeGenerationStrategy(language);
    return strategy.fileExtension;
  }

  /**
   * 获取语言的推荐测试框架
   * 
   * @param language 编程语言
   * @returns 测试框架名称
   */
  getRecommendedTestFramework(language: ProgrammingLanguage): string {
    const strategy = this.getCodeGenerationStrategy(language);
    return strategy.testFramework;
  }

  /**
   * 获取语言的包管理器
   * 
   * @param language 编程语言
   * @returns 包管理器名称
   */
  getPackageManager(language: ProgrammingLanguage): string {
    const strategy = this.getCodeGenerationStrategy(language);
    return strategy.packageManager;
  }

  /**
   * 检查语言是否支持类型注解
   * 
   * @param language 编程语言
   * @returns 是否支持类型注解
   */
  supportsTypeAnnotations(language: ProgrammingLanguage): boolean {
    const strategy = this.getCodeGenerationStrategy(language);
    return strategy.typeSystem.supportsAnnotations;
  }

  /**
   * 检查语言是否是静态类型
   * 
   * @param language 编程语言
   * @returns 是否是静态类型
   */
  isStaticallyTyped(language: ProgrammingLanguage): boolean {
    const strategy = this.getCodeGenerationStrategy(language);
    return strategy.typeSystem.isStatic;
  }
}

/**
 * 创建语言支持实例的工厂函数
 * 
 * @param config 配置选项
 * @returns LanguageSupport 实例
 */
export function createLanguageSupport(config?: LanguageSupportConfig): LanguageSupport {
  return new LanguageSupport(config);
}
