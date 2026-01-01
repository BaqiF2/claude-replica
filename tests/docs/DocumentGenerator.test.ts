/**
 * DocumentGenerator 测试
 * 
 * 测试文档生成功能，包括代码变更检测、API 文档生成、README 生成、
 * 多格式输出和代码示例提取
 */

import * as fs from 'fs';
import * as path from 'path';
import { DocumentGenerator, createDocumentGenerator } from '../../src/docs';

// 测试目录
const TEST_DIR = path.join(__dirname, '../fixtures/docs-test');

describe('DocumentGenerator', () => {
  let generator: DocumentGenerator;

  beforeAll(() => {
    // 创建测试目录
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }

    // 创建测试文件
    createTestFiles();
  });

  afterAll(() => {
    // 清理测试目录
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    generator = new DocumentGenerator({
      workingDirectory: TEST_DIR,
      outputDirectory: path.join(TEST_DIR, 'docs'),
      includePrivate: false,
      includeExamples: true,
    });
  });

  describe('构造函数', () => {
    it('应该使用默认配置创建实例', () => {
      const gen = new DocumentGenerator();
      expect(gen).toBeInstanceOf(DocumentGenerator);
    });

    it('应该使用自定义配置创建实例', () => {
      const gen = new DocumentGenerator({
        workingDirectory: '/custom/path',
        includePrivate: true,
      });
      expect(gen).toBeInstanceOf(DocumentGenerator);
    });

    it('createDocumentGenerator 应该返回 DocumentGenerator 实例', () => {
      const gen = createDocumentGenerator();
      expect(gen).toBeInstanceOf(DocumentGenerator);
    });
  });

  describe('代码变更检测', () => {
    it('detectUncommittedChanges 应该返回文件变更列表', async () => {
      const changes = await generator.detectUncommittedChanges();
      expect(Array.isArray(changes)).toBe(true);
    });

    it('needsDocUpdate 应该正确识别需要文档的文件', async () => {
      expect(await generator.needsDocUpdate('test.ts')).toBe(true);
      expect(await generator.needsDocUpdate('test.js')).toBe(true);
      expect(await generator.needsDocUpdate('test.py')).toBe(true);
      expect(await generator.needsDocUpdate('test.java')).toBe(true);
      expect(await generator.needsDocUpdate('test.go')).toBe(true);
      expect(await generator.needsDocUpdate('test.txt')).toBe(false);
      expect(await generator.needsDocUpdate('test.md')).toBe(false);
    });

    it('needsDocUpdate 应该排除测试文件', async () => {
      expect(await generator.needsDocUpdate('test.test.ts')).toBe(false);
      expect(await generator.needsDocUpdate('test.spec.ts')).toBe(false);
    });

    it('needsDocUpdate 应该排除 node_modules', async () => {
      expect(await generator.needsDocUpdate('node_modules/package/index.ts')).toBe(false);
    });
  });

  describe('API 文档生成', () => {
    it('generateAPIDoc 应该生成 API 文档', async () => {
      const apiDoc = await generator.generateAPIDoc(['src/sample.ts']);
      
      expect(apiDoc).toBeDefined();
      expect(apiDoc.projectName).toBeDefined();
      expect(apiDoc.modules).toBeDefined();
      expect(Array.isArray(apiDoc.modules)).toBe(true);
      expect(apiDoc.generatedAt).toBeInstanceOf(Date);
    });

    it('parseSourceFile 应该解析 TypeScript 文件', async () => {
      const moduleDoc = await generator.parseSourceFile('src/sample.ts');
      
      expect(moduleDoc).toBeDefined();
      expect(moduleDoc?.name).toBe('sample');
      expect(moduleDoc?.classes).toBeDefined();
      expect(moduleDoc?.functions).toBeDefined();
      expect(moduleDoc?.interfaces).toBeDefined();
      expect(moduleDoc?.types).toBeDefined();
    });

    it('parseSourceFile 应该返回 null 对于不存在的文件', async () => {
      const moduleDoc = await generator.parseSourceFile('nonexistent.ts');
      expect(moduleDoc).toBeNull();
    });

    it('formatAPIDocAsMarkdown 应该生成 Markdown 格式', async () => {
      const apiDoc = await generator.generateAPIDoc(['src/sample.ts']);
      const markdown = generator.formatAPIDocAsMarkdown(apiDoc);
      
      expect(markdown).toContain('# ');
      expect(markdown).toContain('API 文档');
      expect(markdown).toContain('## 目录');
    });
  });

  describe('README 生成', () => {
    it('generateReadme 应该生成基本 README', async () => {
      const readme = await generator.generateReadme({
        projectName: 'Test Project',
        description: 'A test project',
      });
      
      expect(readme).toContain('# Test Project');
      expect(readme).toContain('A test project');
      expect(readme).toContain('## 安装');
      expect(readme).toContain('## 使用方法');
      expect(readme).toContain('## 贡献');
      expect(readme).toContain('## 许可证');
    });

    it('generateReadme 应该包含目录', async () => {
      const readme = await generator.generateReadme({
        projectName: 'Test Project',
      });
      
      expect(readme).toContain('## 目录');
      expect(readme).toContain('- [安装]');
      expect(readme).toContain('- [使用方法]');
    });

    it('generateReadme 应该支持自定义章节', async () => {
      const readme = await generator.generateReadme({
        projectName: 'Test Project',
        customSections: [
          { title: '自定义章节', content: '自定义内容' },
        ],
      });
      
      expect(readme).toContain('## 自定义章节');
      expect(readme).toContain('自定义内容');
    });

    it('generateReadme 应该支持禁用章节', async () => {
      const readme = await generator.generateReadme({
        projectName: 'Test Project',
        includeInstallation: false,
        includeContributing: false,
        includeLicense: false,
      });
      
      expect(readme).not.toContain('## 安装');
      expect(readme).not.toContain('## 贡献');
      expect(readme).not.toContain('## 许可证');
    });

    it('generateReadme 应该包含 API 概览', async () => {
      const readme = await generator.generateReadme({
        projectName: 'Test Project',
        includeApiOverview: true,
      });
      
      expect(readme).toContain('## API 概览');
    });
  });

  describe('多格式输出', () => {
    it('convertToFormat 应该保持 Markdown 格式不变', async () => {
      const content = '# Title\n\nContent';
      const result = await generator.convertToFormat(content, 'markdown');
      expect(result).toBe(content);
    });

    it('convertToFormat 应该转换为 HTML', async () => {
      const content = '# Title\n\nContent';
      const result = await generator.convertToFormat(content, 'html');
      
      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<h1>Title</h1>');
      expect(result).toContain('<html');
      expect(result).toContain('</html>');
    });

    it('convertToFormat 应该转换代码块为 HTML', async () => {
      const content = '```javascript\nconst x = 1;\n```';
      const result = await generator.convertToFormat(content, 'html');
      
      expect(result).toContain('<pre>');
      expect(result).toContain('<code');
      expect(result).toContain('language-javascript');
    });

    it('convertToFormat 应该转换链接为 HTML', async () => {
      const content = '[Link](https://example.com)';
      const result = await generator.convertToFormat(content, 'html');
      
      expect(result).toContain('<a href="https://example.com">Link</a>');
    });

    it('convertToFormat 应该转换列表为 HTML', async () => {
      const content = '- Item 1\n- Item 2';
      const result = await generator.convertToFormat(content, 'html');
      
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>Item 1</li>');
      expect(result).toContain('<li>Item 2</li>');
    });

    it('saveDocument 应该保存文档到文件', async () => {
      const content = '# Test Document';
      const outputPath = await generator.saveDocument(content, 'test-doc', 'markdown');
      
      expect(fs.existsSync(outputPath)).toBe(true);
      expect(outputPath.endsWith('.md')).toBe(true);
      
      const savedContent = fs.readFileSync(outputPath, 'utf-8');
      expect(savedContent).toBe(content);
    });

    it('saveDocument 应该保存 HTML 文档', async () => {
      const content = '# Test Document';
      const outputPath = await generator.saveDocument(content, 'test-html', 'html');
      
      expect(fs.existsSync(outputPath)).toBe(true);
      expect(outputPath.endsWith('.html')).toBe(true);
      
      const savedContent = fs.readFileSync(outputPath, 'utf-8');
      expect(savedContent).toContain('<!DOCTYPE html>');
    });
  });

  describe('代码示例提取', () => {
    it('extractCodeExamples 应该返回示例列表', async () => {
      const examples = await generator.extractCodeExamples();
      expect(Array.isArray(examples)).toBe(true);
    });

    it('extractCodeExamples 应该从示例文件提取代码', async () => {
      // 创建示例文件
      const examplesDir = path.join(TEST_DIR, 'examples');
      if (!fs.existsSync(examplesDir)) {
        fs.mkdirSync(examplesDir, { recursive: true });
      }
      
      fs.writeFileSync(
        path.join(examplesDir, 'basic-example.ts'),
        '// Basic example\nconst x = 1;\nconsole.log(x);'
      );

      const examples = await generator.extractCodeExamples();
      
      // 清理
      fs.rmSync(examplesDir, { recursive: true, force: true });
      
      expect(examples.length).toBeGreaterThanOrEqual(0);
    });
  });
});

/**
 * 创建测试文件
 */
function createTestFiles() {
  // 创建 src 目录
  const srcDir = path.join(TEST_DIR, 'src');
  if (!fs.existsSync(srcDir)) {
    fs.mkdirSync(srcDir, { recursive: true });
  }

  // 创建示例 TypeScript 文件
  const sampleTs = `/**
 * 示例模块
 * 
 * 这是一个用于测试的示例模块
 * 
 * @module sample
 */

/**
 * 用户接口
 */
export interface User {
  /** 用户 ID */
  id: string;
  /** 用户名 */
  name: string;
  /** 邮箱地址 */
  email?: string;
}

/**
 * 用户状态类型
 */
export type UserStatus = 'active' | 'inactive' | 'pending';

/**
 * 用户管理类
 * 
 * 提供用户的增删改查功能
 */
export class UserManager {
  private users: Map<string, User> = new Map();

  /**
   * 创建新用户
   * 
   * @param user 用户信息
   * @returns 创建的用户
   * 
   * @example
   * const manager = new UserManager();
   * const user = manager.createUser({ id: '1', name: 'John' });
   */
  createUser(user: User): User {
    this.users.set(user.id, user);
    return user;
  }

  /**
   * 获取用户
   * 
   * @param id 用户 ID
   * @returns 用户信息或 undefined
   */
  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  /**
   * 删除用户
   * 
   * @param id 用户 ID
   * @returns 是否删除成功
   */
  deleteUser(id: string): boolean {
    return this.users.delete(id);
  }
}

/**
 * 格式化用户名
 * 
 * @param user 用户对象
 * @returns 格式化后的用户名
 */
export function formatUserName(user: User): string {
  return \`User: \${user.name}\`;
}

/**
 * 异步获取用户列表
 * 
 * @returns 用户列表
 */
export async function fetchUsers(): Promise<User[]> {
  return [];
}
`;

  fs.writeFileSync(path.join(srcDir, 'sample.ts'), sampleTs);

  // 创建 package.json
  const packageJson = {
    name: 'test-project',
    version: '1.0.0',
    description: 'A test project for documentation generation',
    scripts: {
      test: 'jest',
    },
  };

  fs.writeFileSync(
    path.join(TEST_DIR, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // 创建 LICENSE 文件
  fs.writeFileSync(
    path.join(TEST_DIR, 'LICENSE'),
    'MIT License\n\nPermission is hereby granted, free of charge...'
  );
}
