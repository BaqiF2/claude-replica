/**
 * 多语言支持模块测试
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  LanguageSupport,
  createLanguageSupport,
} from '../../src/language';

describe('LanguageSupport', () => {
  let tempDir: string;
  let languageSupport: LanguageSupport;

  beforeEach(() => {
    // 创建临时目录用于测试
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'language-test-'));
    languageSupport = new LanguageSupport({ workingDirectory: tempDir });
  });

  afterEach(() => {
    // 清理临时目录
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('语言检测', () => {
    it('应该检测 TypeScript 项目', async () => {
      // 创建 tsconfig.json
      fs.writeFileSync(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: true } })
      );
      // 创建 package.json
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ devDependencies: { typescript: '^5.0.0' } })
      );
      // 创建 TypeScript 文件
      fs.writeFileSync(path.join(tempDir, 'index.ts'), 'export const x = 1;');

      const result = await languageSupport.detectLanguage();

      expect(result.primaryLanguage).toBe('typescript');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.evidence.length).toBeGreaterThan(0);
    });

    it('应该检测 JavaScript 项目', async () => {
      // 创建 package.json
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: { express: '^4.0.0' } })
      );
      // 创建 JavaScript 文件
      fs.writeFileSync(path.join(tempDir, 'index.js'), 'module.exports = {};');

      const result = await languageSupport.detectLanguage();

      expect(result.primaryLanguage).toBe('javascript');
      expect(result.evidence.some(e => e.source === 'package.json')).toBe(true);
    });

    it('应该检测 Python 项目', async () => {
      // 创建 requirements.txt
      fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'flask==2.0.0\nrequests==2.28.0');
      // 创建 Python 文件
      fs.writeFileSync(path.join(tempDir, 'main.py'), 'print("Hello")');

      const result = await languageSupport.detectLanguage();

      expect(result.primaryLanguage).toBe('python');
    });

    it('应该检测 Java 项目 (Maven)', async () => {
      // 创建 pom.xml
      fs.writeFileSync(
        path.join(tempDir, 'pom.xml'),
        '<project><dependencies><dependency>junit</dependency></dependencies></project>'
      );

      const result = await languageSupport.detectLanguage();

      expect(result.primaryLanguage).toBe('java');
    });

    it('应该检测 Go 项目', async () => {
      // 创建 go.mod
      fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module example.com/myproject\n\ngo 1.21');
      // 创建 Go 文件
      fs.writeFileSync(path.join(tempDir, 'main.go'), 'package main\n\nfunc main() {}');

      const result = await languageSupport.detectLanguage();

      expect(result.primaryLanguage).toBe('go');
    });

    it('应该返回 unknown 当没有检测到语言时', async () => {
      // 空目录
      const result = await languageSupport.detectLanguage();

      expect(result.primaryLanguage).toBe('unknown');
      expect(result.confidence).toBe(0);
    });

    it('应该缓存检测结果', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: {} })
      );

      const result1 = await languageSupport.detectLanguage();
      const result2 = await languageSupport.detectLanguage();

      expect(result1).toBe(result2); // 应该是同一个对象引用
    });

    it('应该在清除缓存后重新检测', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: {} })
      );

      const result1 = await languageSupport.detectLanguage();
      languageSupport.clearCache();
      const result2 = await languageSupport.detectLanguage();

      expect(result1).not.toBe(result2); // 应该是不同的对象
    });
  });

  describe('代码生成策略', () => {
    it('应该返回 JavaScript 策略', () => {
      const strategy = languageSupport.getCodeGenerationStrategy('javascript');

      expect(strategy.language).toBe('javascript');
      expect(strategy.fileExtension).toBe('.js');
      expect(strategy.namingConvention.variables).toBe('camelCase');
      expect(strategy.testFramework).toBe('jest');
      expect(strategy.packageManager).toBe('npm');
    });

    it('应该返回 TypeScript 策略', () => {
      const strategy = languageSupport.getCodeGenerationStrategy('typescript');

      expect(strategy.language).toBe('typescript');
      expect(strategy.fileExtension).toBe('.ts');
      expect(strategy.typeSystem.isStatic).toBe(true);
      expect(strategy.typeSystem.supportsGenerics).toBe(true);
    });

    it('应该返回 Python 策略', () => {
      const strategy = languageSupport.getCodeGenerationStrategy('python');

      expect(strategy.language).toBe('python');
      expect(strategy.fileExtension).toBe('.py');
      expect(strategy.namingConvention.variables).toBe('snake_case');
      expect(strategy.namingConvention.functions).toBe('snake_case');
      expect(strategy.indentation.size).toBe(4);
      expect(strategy.testFramework).toBe('pytest');
    });

    it('应该返回 Java 策略', () => {
      const strategy = languageSupport.getCodeGenerationStrategy('java');

      expect(strategy.language).toBe('java');
      expect(strategy.fileExtension).toBe('.java');
      expect(strategy.namingConvention.files).toBe('PascalCase');
      expect(strategy.typeSystem.isStatic).toBe(true);
      expect(strategy.testFramework).toBe('junit');
    });

    it('应该返回 Go 策略', () => {
      const strategy = languageSupport.getCodeGenerationStrategy('go');

      expect(strategy.language).toBe('go');
      expect(strategy.fileExtension).toBe('.go');
      expect(strategy.indentation.type).toBe('tabs');
      expect(strategy.errorHandling.primary).toBe('error_values');
      expect(strategy.asyncPattern.primary).toBe('goroutines');
    });

    it('应该为 unknown 返回默认策略', () => {
      const strategy = languageSupport.getCodeGenerationStrategy('unknown');

      expect(strategy.language).toBe('javascript');
    });
  });

  describe('最佳实践建议', () => {
    it('应该返回 JavaScript 最佳实践', () => {
      const practices = languageSupport.getBestPractices('javascript');

      expect(practices.length).toBeGreaterThan(0);
      expect(practices.some(p => p.category === 'naming')).toBe(true);
      expect(practices.some(p => p.category === 'error_handling')).toBe(true);
    });

    it('应该返回 TypeScript 最佳实践（包含 JavaScript 实践）', () => {
      const tsPractices = languageSupport.getBestPractices('typescript');
      const jsPractices = languageSupport.getBestPractices('javascript');

      expect(tsPractices.length).toBeGreaterThan(jsPractices.length);
      expect(tsPractices.some(p => p.title.includes('any'))).toBe(true);
    });

    it('应该返回 Python 最佳实践', () => {
      const practices = languageSupport.getBestPractices('python');

      expect(practices.length).toBeGreaterThan(0);
      expect(practices.some(p => p.title.includes('PEP 8'))).toBe(true);
      expect(practices.some(p => p.title.includes('pytest'))).toBe(true);
    });

    it('应该返回 Java 最佳实践', () => {
      const practices = languageSupport.getBestPractices('java');

      expect(practices.length).toBeGreaterThan(0);
      expect(practices.some(p => p.title.includes('Optional'))).toBe(true);
    });

    it('应该返回 Go 最佳实践', () => {
      const practices = languageSupport.getBestPractices('go');

      expect(practices.length).toBeGreaterThan(0);
      expect(practices.some(p => p.title.includes('错误'))).toBe(true);
      expect(practices.some(p => p.title.includes('goroutine') || p.title.includes('channel'))).toBe(true);
    });

    it('最佳实践应该包含必要的字段', () => {
      const practices = languageSupport.getBestPractices('javascript');

      for (const practice of practices) {
        expect(practice.category).toBeDefined();
        expect(practice.title).toBeDefined();
        expect(practice.description).toBeDefined();
        expect(practice.priority).toBeDefined();
        expect(['high', 'medium', 'low']).toContain(practice.priority);
      }
    });
  });

  describe('代码模板生成', () => {
    it('应该生成 JavaScript 函数模板', () => {
      const template = languageSupport.generateFunctionTemplate(
        'javascript',
        'calculateSum',
        [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }]
      );

      expect(template).toContain('function calculateSum(a, b)');
      expect(template).toContain('throw new Error');
    });

    it('应该生成异步 JavaScript 函数模板', () => {
      const template = languageSupport.generateFunctionTemplate(
        'javascript',
        'fetchData',
        [],
        undefined,
        true
      );

      expect(template).toContain('async function fetchData');
    });

    it('应该生成 TypeScript 函数模板（带类型）', () => {
      const template = languageSupport.generateFunctionTemplate(
        'typescript',
        'add',
        [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }],
        'number'
      );

      expect(template).toContain('function add(a: number, b: number): number');
    });

    it('应该生成 Python 函数模板', () => {
      const template = languageSupport.generateFunctionTemplate(
        'python',
        'calculate_sum',
        [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }],
        'int'
      );

      expect(template).toContain('def calculate_sum(a: int, b: int) -> int:');
      expect(template).toContain('raise NotImplementedError');
    });

    it('应该生成 Java 方法模板', () => {
      const template = languageSupport.generateFunctionTemplate(
        'java',
        'calculateSum',
        [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }],
        'int'
      );

      expect(template).toContain('public int calculateSum(int a, int b)');
    });

    it('应该生成 Go 函数模板', () => {
      const template = languageSupport.generateFunctionTemplate(
        'go',
        'CalculateSum',
        [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }],
        'int'
      );

      expect(template).toContain('func CalculateSum(a int, b int) int');
      expect(template).toContain('panic("not implemented")');
    });
  });

  describe('类模板生成', () => {
    it('应该生成 TypeScript 类模板', () => {
      const template = languageSupport.generateClassTemplate(
        'typescript',
        'User',
        [
          { name: 'name', type: 'string', visibility: 'public' },
          { name: 'age', type: 'number', visibility: 'private' },
        ]
      );

      expect(template).toContain('class User');
      expect(template).toContain('public name: string');
      expect(template).toContain('private age: number');
      expect(template).toContain('constructor(name: string, age: number)');
    });

    it('应该生成 Python 类模板', () => {
      const template = languageSupport.generateClassTemplate(
        'python',
        'User',
        [
          { name: 'name', type: 'str' },
          { name: 'age', type: 'int', visibility: 'private' },
        ]
      );

      expect(template).toContain('class User:');
      expect(template).toContain('def __init__(self, name: str, age: int)');
      expect(template).toContain('self.name = name');
      expect(template).toContain('self._age = age'); // 私有属性带下划线
    });

    it('应该生成 Go 结构体模板', () => {
      const template = languageSupport.generateClassTemplate(
        'go',
        'User',
        [
          { name: 'name', type: 'string', visibility: 'public' },
          { name: 'age', type: 'int' },
        ]
      );

      expect(template).toContain('type User struct');
      expect(template).toContain('Name string'); // 导出字段首字母大写
    });
  });

  describe('命名风格转换', () => {
    it('应该转换为 camelCase', () => {
      expect(languageSupport.convertNamingStyle('user_name', 'camelCase')).toBe('userName');
      expect(languageSupport.convertNamingStyle('UserName', 'camelCase')).toBe('userName');
      expect(languageSupport.convertNamingStyle('user-name', 'camelCase')).toBe('userName');
    });

    it('应该转换为 PascalCase', () => {
      expect(languageSupport.convertNamingStyle('user_name', 'PascalCase')).toBe('UserName');
      expect(languageSupport.convertNamingStyle('userName', 'PascalCase')).toBe('UserName');
    });

    it('应该转换为 snake_case', () => {
      expect(languageSupport.convertNamingStyle('userName', 'snake_case')).toBe('user_name');
      expect(languageSupport.convertNamingStyle('UserName', 'snake_case')).toBe('user_name');
    });

    it('应该转换为 UPPER_SNAKE_CASE', () => {
      expect(languageSupport.convertNamingStyle('userName', 'UPPER_SNAKE_CASE')).toBe('USER_NAME');
      expect(languageSupport.convertNamingStyle('max_value', 'UPPER_SNAKE_CASE')).toBe('MAX_VALUE');
    });

    it('应该转换为 kebab-case', () => {
      expect(languageSupport.convertNamingStyle('userName', 'kebab-case')).toBe('user-name');
      expect(languageSupport.convertNamingStyle('UserName', 'kebab-case')).toBe('user-name');
    });
  });

  describe('辅助方法', () => {
    it('应该返回正确的文件扩展名', () => {
      expect(languageSupport.getFileExtension('javascript')).toBe('.js');
      expect(languageSupport.getFileExtension('typescript')).toBe('.ts');
      expect(languageSupport.getFileExtension('python')).toBe('.py');
      expect(languageSupport.getFileExtension('java')).toBe('.java');
      expect(languageSupport.getFileExtension('go')).toBe('.go');
    });

    it('应该返回推荐的测试框架', () => {
      expect(languageSupport.getRecommendedTestFramework('javascript')).toBe('jest');
      expect(languageSupport.getRecommendedTestFramework('typescript')).toBe('jest');
      expect(languageSupport.getRecommendedTestFramework('python')).toBe('pytest');
      expect(languageSupport.getRecommendedTestFramework('java')).toBe('junit');
      expect(languageSupport.getRecommendedTestFramework('go')).toBe('go-test');
    });

    it('应该返回包管理器', () => {
      expect(languageSupport.getPackageManager('javascript')).toBe('npm');
      expect(languageSupport.getPackageManager('python')).toBe('pip');
      expect(languageSupport.getPackageManager('java')).toBe('maven');
      expect(languageSupport.getPackageManager('go')).toBe('go-modules');
    });

    it('应该正确判断类型注解支持', () => {
      expect(languageSupport.supportsTypeAnnotations('javascript')).toBe(false);
      expect(languageSupport.supportsTypeAnnotations('typescript')).toBe(true);
      expect(languageSupport.supportsTypeAnnotations('python')).toBe(true);
      expect(languageSupport.supportsTypeAnnotations('java')).toBe(true);
      expect(languageSupport.supportsTypeAnnotations('go')).toBe(false);
    });

    it('应该正确判断静态类型', () => {
      expect(languageSupport.isStaticallyTyped('javascript')).toBe(false);
      expect(languageSupport.isStaticallyTyped('typescript')).toBe(true);
      expect(languageSupport.isStaticallyTyped('python')).toBe(false);
      expect(languageSupport.isStaticallyTyped('java')).toBe(true);
      expect(languageSupport.isStaticallyTyped('go')).toBe(true);
    });
  });

  describe('工厂函数', () => {
    it('应该创建 LanguageSupport 实例', () => {
      const instance = createLanguageSupport();
      expect(instance).toBeInstanceOf(LanguageSupport);
    });

    it('应该接受配置参数', () => {
      const instance = createLanguageSupport({
        workingDirectory: tempDir,
        maxScanDepth: 3,
      });
      expect(instance).toBeInstanceOf(LanguageSupport);
    });
  });
});
