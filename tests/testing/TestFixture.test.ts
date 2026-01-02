/**
 * 测试夹具单元测试
 *
 * 测试 TestFixture 类的核心功能
 * 包括临时目录创建和清理、配置文件创建、环境变量设置和恢复
 *
 * _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  TestFixture,
  createTestFixture,
} from '../../src/testing/TestFixture';
import { TerminalTestError } from '../../src/testing/types';

describe('TestFixture', () => {
  let fixture: TestFixture;

  afterEach(async () => {
    // 确保每个测试后清理
    if (fixture && fixture.isReady()) {
      await fixture.teardown();
    }
  });

  describe('临时目录创建和清理', () => {
    it('setup() 应该创建临时目录', async () => {
      fixture = createTestFixture();
      const context = await fixture.setup();

      expect(context.tempDir).toBeDefined();
      expect(fs.existsSync(context.tempDir)).toBe(true);
      expect(fs.statSync(context.tempDir).isDirectory()).toBe(true);
    });

    it('setup() 应该使用指定的前缀创建临时目录', async () => {
      fixture = createTestFixture({ tempDirPrefix: 'my-test-prefix-' });
      const context = await fixture.setup();

      expect(path.basename(context.tempDir)).toMatch(/^my-test-prefix-/);
    });

    it('teardown() 应该删除临时目录', async () => {
      fixture = createTestFixture();
      const context = await fixture.setup();
      const tempDir = context.tempDir;

      expect(fs.existsSync(tempDir)).toBe(true);

      await fixture.teardown();

      expect(fs.existsSync(tempDir)).toBe(false);
    });

    it('teardown() 应该删除临时目录中的所有文件', async () => {
      fixture = createTestFixture();
      const context = await fixture.setup();

      // 创建一些文件
      await fixture.createFile('test1.txt', 'content1');
      await fixture.createFile('subdir/test2.txt', 'content2');

      await fixture.teardown();

      expect(fs.existsSync(context.tempDir)).toBe(false);
    });

    it('setup() 应该创建配置目录', async () => {
      fixture = createTestFixture();
      const context = await fixture.setup();

      expect(context.configDir).toBeDefined();
      expect(fs.existsSync(context.configDir)).toBe(true);
      expect(context.configDir).toBe(path.join(context.tempDir, '.claude-replica'));
    });

    it('setup() 应该创建会话目录', async () => {
      fixture = createTestFixture();
      const context = await fixture.setup();

      expect(context.sessionsDir).toBeDefined();
      expect(fs.existsSync(context.sessionsDir)).toBe(true);
      expect(context.sessionsDir).toBe(path.join(context.configDir, 'sessions'));
    });

    it('重复调用 setup() 应该抛出错误', async () => {
      fixture = createTestFixture();
      await fixture.setup();

      await expect(fixture.setup()).rejects.toThrow(TerminalTestError);
    });

    it('getTempDir() 在 setup() 之前应该抛出错误', () => {
      fixture = createTestFixture();

      expect(() => fixture.getTempDir()).toThrow(TerminalTestError);
    });

    it('isReady() 应该正确反映夹具状态', async () => {
      fixture = createTestFixture();

      expect(fixture.isReady()).toBe(false);

      await fixture.setup();
      expect(fixture.isReady()).toBe(true);

      await fixture.teardown();
      expect(fixture.isReady()).toBe(false);
    });
  });

  describe('配置文件创建', () => {
    it('应该创建用户配置文件', async () => {
      const userConfig = { apiKey: 'test-key', model: 'claude-3' };
      fixture = createTestFixture({
        config: { userConfig },
      });

      const context = await fixture.setup();
      const configPath = path.join(context.configDir, 'settings.json');

      expect(fs.existsSync(configPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(content).toEqual(userConfig);
    });

    it('应该创建项目配置文件', async () => {
      const projectConfig = { name: 'test-project', version: '1.0.0' };
      fixture = createTestFixture({
        config: { projectConfig },
      });

      const context = await fixture.setup();
      const configPath = path.join(context.tempDir, '.claude-replica', 'project.json');

      expect(fs.existsSync(configPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(content).toEqual(projectConfig);
    });

    it('应该创建 CLAUDE.md 文件', async () => {
      const claudeMd = '# Project Instructions\n\nThis is a test project.';
      fixture = createTestFixture({
        config: { claudeMd },
      });

      const context = await fixture.setup();
      const claudeMdPath = path.join(context.tempDir, 'CLAUDE.md');

      expect(fs.existsSync(claudeMdPath)).toBe(true);

      const content = fs.readFileSync(claudeMdPath, 'utf-8');
      expect(content).toBe(claudeMd);
    });

    it('应该同时创建多个配置文件', async () => {
      fixture = createTestFixture({
        config: {
          userConfig: { key: 'value' },
          projectConfig: { name: 'test' },
          claudeMd: '# Test',
        },
      });

      const context = await fixture.setup();

      expect(fs.existsSync(path.join(context.configDir, 'settings.json'))).toBe(true);
      expect(fs.existsSync(path.join(context.tempDir, '.claude-replica', 'project.json'))).toBe(true);
      expect(fs.existsSync(path.join(context.tempDir, 'CLAUDE.md'))).toBe(true);
    });
  });

  describe('扩展文件创建', () => {
    it('应该创建技能文件', async () => {
      fixture = createTestFixture({
        extensions: {
          skills: [
            { name: 'typescript-expert', description: 'TypeScript 专家', content: '你是一个 TypeScript 专家' },
          ],
        },
      });

      const context = await fixture.setup();
      const skillPath = path.join(context.configDir, 'skills', 'typescript-expert.skill.md');

      expect(fs.existsSync(skillPath)).toBe(true);

      const content = fs.readFileSync(skillPath, 'utf-8');
      expect(content).toContain('typescript-expert');
      expect(content).toContain('TypeScript 专家');
      expect(content).toContain('你是一个 TypeScript 专家');
    });

    it('应该创建命令文件', async () => {
      fixture = createTestFixture({
        extensions: {
          commands: [
            { name: 'review', description: '代码审查', template: '请审查以下代码：\n{{code}}' },
          ],
        },
      });

      const context = await fixture.setup();
      const commandPath = path.join(context.configDir, 'commands', 'review.md');

      expect(fs.existsSync(commandPath)).toBe(true);

      const content = fs.readFileSync(commandPath, 'utf-8');
      expect(content).toContain('review');
      expect(content).toContain('代码审查');
      expect(content).toContain('请审查以下代码');
    });

    it('应该创建代理文件', async () => {
      fixture = createTestFixture({
        extensions: {
          agents: [
            {
              name: 'code-reviewer',
              description: '代码审查代理',
              prompt: '你是一个专业的代码审查员',
              tools: ['read_file', 'write_file'],
            },
          ],
        },
      });

      const context = await fixture.setup();
      const agentPath = path.join(context.configDir, 'agents', 'code-reviewer.agent.md');

      expect(fs.existsSync(agentPath)).toBe(true);

      const content = fs.readFileSync(agentPath, 'utf-8');
      // 代理文件格式不包含名称字段，只包含 description, tools 和 prompt
      expect(content).toContain('代码审查代理');
      expect(content).toContain('你是一个专业的代码审查员');
      expect(content).toContain('read_file');
      expect(content).toContain('write_file');
    });

    it('应该创建钩子配置文件', async () => {
      const hooks = {
        onSave: [{ pattern: '*.ts', command: 'npm run lint' }],
      };
      fixture = createTestFixture({
        extensions: { hooks },
      });

      const context = await fixture.setup();
      const hooksPath = path.join(context.configDir, 'hooks.json');

      expect(fs.existsSync(hooksPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(hooksPath, 'utf-8'));
      expect(content).toEqual(hooks);
    });

    it('应该创建多个扩展文件', async () => {
      fixture = createTestFixture({
        extensions: {
          skills: [
            { name: 'skill1', content: 'content1' },
            { name: 'skill2', content: 'content2' },
          ],
          commands: [
            { name: 'cmd1', template: 'template1' },
          ],
          agents: [
            { name: 'agent1', description: 'desc1', prompt: 'prompt1' },
          ],
        },
      });

      const context = await fixture.setup();

      expect(fs.existsSync(path.join(context.configDir, 'skills', 'skill1.skill.md'))).toBe(true);
      expect(fs.existsSync(path.join(context.configDir, 'skills', 'skill2.skill.md'))).toBe(true);
      expect(fs.existsSync(path.join(context.configDir, 'commands', 'cmd1.md'))).toBe(true);
      expect(fs.existsSync(path.join(context.configDir, 'agents', 'agent1.agent.md'))).toBe(true);
    });
  });

  describe('文件操作', () => {
    it('createFile() 应该创建文件', async () => {
      fixture = createTestFixture();
      await fixture.setup();

      await fixture.createFile('test.txt', 'Hello World');

      const content = await fixture.readFile('test.txt');
      expect(content).toBe('Hello World');
    });

    it('createFile() 应该自动创建父目录', async () => {
      fixture = createTestFixture();
      await fixture.setup();

      await fixture.createFile('deep/nested/dir/file.txt', 'content');

      const content = await fixture.readFile('deep/nested/dir/file.txt');
      expect(content).toBe('content');
    });

    it('readFile() 应该读取文件内容', async () => {
      fixture = createTestFixture();
      await fixture.setup();

      await fixture.createFile('data.json', '{"key": "value"}');

      const content = await fixture.readFile('data.json');
      expect(content).toBe('{"key": "value"}');
    });

    it('fileExists() 应该检查文件是否存在', async () => {
      fixture = createTestFixture();
      await fixture.setup();

      expect(await fixture.fileExists('nonexistent.txt')).toBe(false);

      await fixture.createFile('exists.txt', 'content');
      expect(await fixture.fileExists('exists.txt')).toBe(true);
    });

    it('deleteFile() 应该删除文件', async () => {
      fixture = createTestFixture();
      await fixture.setup();

      await fixture.createFile('to-delete.txt', 'content');
      expect(await fixture.fileExists('to-delete.txt')).toBe(true);

      await fixture.deleteFile('to-delete.txt');
      expect(await fixture.fileExists('to-delete.txt')).toBe(false);
    });

    it('通过 mocks.filesystem 创建文件', async () => {
      fixture = createTestFixture({
        mocks: {
          filesystem: {
            'file1.txt': 'content1',
            'dir/file2.txt': 'content2',
          },
        },
      });

      await fixture.setup();

      expect(await fixture.readFile('file1.txt')).toBe('content1');
      expect(await fixture.readFile('dir/file2.txt')).toBe('content2');
    });
  });

  describe('环境变量设置和恢复', () => {
    const TEST_ENV_KEY = 'TEST_FIXTURE_ENV_VAR';

    afterEach(() => {
      // 确保测试后清理环境变量
      delete process.env[TEST_ENV_KEY];
    });

    it('setEnv() 应该设置环境变量', async () => {
      fixture = createTestFixture();
      await fixture.setup();

      fixture.setEnv(TEST_ENV_KEY, 'test-value');

      expect(process.env[TEST_ENV_KEY]).toBe('test-value');
    });

    it('restoreEnv() 应该恢复环境变量', async () => {
      fixture = createTestFixture();
      await fixture.setup();

      const originalValue = process.env[TEST_ENV_KEY];

      fixture.setEnv(TEST_ENV_KEY, 'new-value');
      expect(process.env[TEST_ENV_KEY]).toBe('new-value');

      fixture.restoreEnv();

      if (originalValue === undefined) {
        expect(process.env[TEST_ENV_KEY]).toBeUndefined();
      } else {
        expect(process.env[TEST_ENV_KEY]).toBe(originalValue);
      }
    });

    it('teardown() 应该自动恢复环境变量', async () => {
      fixture = createTestFixture();
      await fixture.setup();

      const originalValue = process.env[TEST_ENV_KEY];

      fixture.setEnv(TEST_ENV_KEY, 'temp-value');
      expect(process.env[TEST_ENV_KEY]).toBe('temp-value');

      await fixture.teardown();

      if (originalValue === undefined) {
        expect(process.env[TEST_ENV_KEY]).toBeUndefined();
      } else {
        expect(process.env[TEST_ENV_KEY]).toBe(originalValue);
      }
    });

    it('通过 options.env 设置环境变量', async () => {
      fixture = createTestFixture({
        env: {
          [TEST_ENV_KEY]: 'from-options',
        },
      });

      await fixture.setup();

      expect(process.env[TEST_ENV_KEY]).toBe('from-options');
    });

    it('getEnv() 应该获取环境变量', async () => {
      fixture = createTestFixture();
      await fixture.setup();

      fixture.setEnv(TEST_ENV_KEY, 'get-test');

      expect(fixture.getEnv(TEST_ENV_KEY)).toBe('get-test');
    });

    it('多次设置同一环境变量应该只保存原始值', async () => {
      fixture = createTestFixture();
      await fixture.setup();

      const originalValue = process.env[TEST_ENV_KEY];

      fixture.setEnv(TEST_ENV_KEY, 'value1');
      fixture.setEnv(TEST_ENV_KEY, 'value2');
      fixture.setEnv(TEST_ENV_KEY, 'value3');

      expect(process.env[TEST_ENV_KEY]).toBe('value3');

      fixture.restoreEnv();

      if (originalValue === undefined) {
        expect(process.env[TEST_ENV_KEY]).toBeUndefined();
      } else {
        expect(process.env[TEST_ENV_KEY]).toBe(originalValue);
      }
    });
  });

  describe('createTestFixture()', () => {
    it('应该创建 TestFixture 实例', () => {
      const instance = createTestFixture();
      expect(instance).toBeInstanceOf(TestFixture);
    });

    it('应该接受选项参数', () => {
      const instance = createTestFixture({
        tempDirPrefix: 'custom-prefix-',
        env: { KEY: 'value' },
      });
      expect(instance).toBeInstanceOf(TestFixture);
    });

    it('创建的实例应该正常工作', async () => {
      fixture = createTestFixture();
      const context = await fixture.setup();

      expect(context.tempDir).toBeDefined();
      expect(fs.existsSync(context.tempDir)).toBe(true);
    });
  });

  describe('错误处理', () => {
    it('createFile() 在 setup() 之前应该抛出错误', async () => {
      fixture = createTestFixture();

      await expect(fixture.createFile('test.txt', 'content')).rejects.toThrow(TerminalTestError);
    });

    it('readFile() 在 setup() 之前应该抛出错误', async () => {
      fixture = createTestFixture();

      await expect(fixture.readFile('test.txt')).rejects.toThrow(TerminalTestError);
    });

    it('deleteFile() 在 setup() 之前应该抛出错误', async () => {
      fixture = createTestFixture();

      await expect(fixture.deleteFile('test.txt')).rejects.toThrow(TerminalTestError);
    });

    it('getConfigDir() 在 setup() 之前应该抛出错误', () => {
      fixture = createTestFixture();

      expect(() => fixture.getConfigDir()).toThrow(TerminalTestError);
    });

    it('getSessionsDir() 在 setup() 之前应该抛出错误', () => {
      fixture = createTestFixture();

      expect(() => fixture.getSessionsDir()).toThrow(TerminalTestError);
    });
  });
});
