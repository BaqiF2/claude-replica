/**
 * CommandManager 测试
 *
 * **Feature: claude-code-replica, Property 7: 命令参数替换的正确性**
 * **验证: 需求 9.3**
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CommandManager } from '../../src/commands/CommandManager';

describe('CommandManager', () => {
  let commandManager: CommandManager;
  let tempDir: string;

  beforeEach(async () => {
    // 创建临时目录用于测试
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'command-test-'));
    commandManager = new CommandManager({
      workingDir: tempDir,
    });
  });

  afterEach(async () => {
    // 清理临时目录
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  /**
   * 创建测试命令文件
   */
  async function createCommandFile(
    dir: string,
    filename: string,
    content: string
  ): Promise<string> {
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  describe('loadCommands', () => {
    it('应该从目录加载命令文件', async () => {
      const commandContent = `---
name: test-command
description: 测试命令
argumentHint: <参数>
allowedTools:
  - Read
  - Write
---

这是测试命令的模板内容。
参数: $ARGUMENTS
`;
      await createCommandFile(tempDir, 'test-command.md', commandContent);

      const commands = await commandManager.loadCommands([tempDir]);

      expect(commands).toHaveLength(1);
      expect(commands[0].name).toBe('test-command');
      expect(commands[0].description).toBe('测试命令');
      expect(commands[0].argumentHint).toBe('<参数>');
      expect(commands[0].allowedTools).toEqual(['Read', 'Write']);
      expect(commands[0].template).toContain('$ARGUMENTS');
    });

    it('应该处理空目录', async () => {
      const commands = await commandManager.loadCommands([tempDir]);
      expect(commands).toHaveLength(0);
    });

    it('应该处理不存在的目录', async () => {
      const commands = await commandManager.loadCommands(['/nonexistent/path']);
      expect(commands).toHaveLength(0);
    });

    it('应该从文件名提取命令名称', async () => {
      await createCommandFile(tempDir, 'my-command.md', `---
description: 我的命令
---

命令内容
`);

      const commands = await commandManager.loadCommands([tempDir]);

      expect(commands).toHaveLength(1);
      expect(commands[0].name).toBe('my-command');
    });

    it('应该忽略没有内容的命令文件', async () => {
      await createCommandFile(tempDir, 'empty.md', `---
name: empty-command
description: 空命令
---

`);

      const commands = await commandManager.loadCommands([tempDir]);

      expect(commands).toHaveLength(0);
    });
  });

  describe('getCommand', () => {
    let userDir: string;
    let projectDir: string;

    beforeEach(async () => {
      // 创建用户级和项目级目录
      // 用户级目录需要包含 .claude 来被识别
      userDir = path.join(tempDir, '.claude', 'commands');
      projectDir = path.join(tempDir, 'project-commands');
      await fs.mkdir(userDir, { recursive: true });
      await fs.mkdir(projectDir, { recursive: true });

      // 重新创建 commandManager，设置 userDirPrefix 为 tempDir
      commandManager = new CommandManager({
        workingDir: tempDir,
        userDirPrefix: tempDir,
      });

      // 创建用户级命令
      await createCommandFile(userDir, 'user-only.md', `---
description: 仅用户级命令
---

用户命令内容
`);

      await createCommandFile(userDir, 'shared.md', `---
description: 用户级共享命令
---

用户级共享内容
`);

      // 创建项目级命令
      await createCommandFile(projectDir, 'project-only.md', `---
description: 仅项目级命令
---

项目命令内容
`);

      await createCommandFile(projectDir, 'shared.md', `---
description: 项目级共享命令
---

项目级共享内容
`);

      // 模拟用户目录和项目目录
      // userDir 包含 .claude，会被识别为用户级
      // projectDir 不包含 .claude，会被识别为项目级
      await commandManager.loadCommands([userDir, projectDir]);
    });

    it('应该获取项目级命令', () => {
      const command = commandManager.getCommand('project-only');
      expect(command).toBeDefined();
      expect(command?.description).toBe('仅项目级命令');
    });

    it('应该通过 /project: 前缀获取项目级命令', () => {
      const command = commandManager.getCommand('/project:shared');
      expect(command).toBeDefined();
      expect(command?.description).toBe('项目级共享命令');
    });

    it('应该通过 /user: 前缀获取用户级命令', () => {
      const command = commandManager.getCommand('/user:user-only');
      expect(command).toBeDefined();
      expect(command?.description).toBe('仅用户级命令');
    });

    it('同名命令应优先返回项目级', () => {
      const command = commandManager.getCommand('shared');
      expect(command).toBeDefined();
      expect(command?.description).toBe('项目级共享命令');
    });

    it('不存在的命令应返回 undefined', () => {
      const command = commandManager.getCommand('nonexistent');
      expect(command).toBeUndefined();
    });
  });

  describe('replaceArguments', () => {
    /**
     * 属性 7: 命令参数替换的正确性
     *
     * *对于任意*模板和参数，$ARGUMENTS 应该被正确替换为用户参数
     */
    describe('Property 7: 命令参数替换的正确性', () => {
      // 生成不包含 $ARGUMENTS 的字符串
      const arbTemplatePrefix = fc.string({ minLength: 0, maxLength: 50 })
        .filter(s => !s.includes('$ARGUMENTS'));
      const arbTemplateSuffix = fc.string({ minLength: 0, maxLength: 50 })
        .filter(s => !s.includes('$ARGUMENTS'));
      const arbArguments = fc.string({ minLength: 0, maxLength: 100 });

      it('单个 $ARGUMENTS 应被正确替换', () => {
        fc.assert(
          fc.property(
            arbTemplatePrefix,
            arbTemplateSuffix,
            arbArguments,
            (prefix, suffix, args) => {
              const template = `${prefix}$ARGUMENTS${suffix}`;
              const result = commandManager.replaceArguments(template, args);

              // 结果应该包含参数
              expect(result).toBe(`${prefix}${args}${suffix}`);

              // 结果不应该包含 $ARGUMENTS
              expect(result).not.toContain('$ARGUMENTS');
            }
          ),
          { numRuns: 100 }
        );
      });

      it('多个 $ARGUMENTS 应全部被替换', () => {
        fc.assert(
          fc.property(
            arbArguments,
            fc.integer({ min: 1, max: 5 }),
            (args, count) => {
              // 创建包含多个 $ARGUMENTS 的模板
              const template = Array(count).fill('$ARGUMENTS').join(' | ');
              const result = commandManager.replaceArguments(template, args);

              // 所有 $ARGUMENTS 都应被替换
              expect(result).not.toContain('$ARGUMENTS');

              // 结果应该包含正确数量的参数
              const expectedParts = Array(count).fill(args);
              expect(result).toBe(expectedParts.join(' | '));
            }
          ),
          { numRuns: 100 }
        );
      });

      it('没有 $ARGUMENTS 的模板应保持不变', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.includes('$ARGUMENTS')),
            arbArguments,
            (template, args) => {
              const result = commandManager.replaceArguments(template, args);
              expect(result).toBe(template);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('空参数应替换为空字符串', () => {
        fc.assert(
          fc.property(
            arbTemplatePrefix,
            arbTemplateSuffix,
            (prefix, suffix) => {
              const template = `${prefix}$ARGUMENTS${suffix}`;
              const result = commandManager.replaceArguments(template, '');

              expect(result).toBe(`${prefix}${suffix}`);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('替换应该是幂等的（对于不含 $ARGUMENTS 的结果）', () => {
        fc.assert(
          fc.property(
            arbTemplatePrefix,
            arbTemplateSuffix,
            arbArguments.filter(s => !s.includes('$ARGUMENTS')),
            (prefix, suffix, args) => {
              const template = `${prefix}$ARGUMENTS${suffix}`;
              const result1 = commandManager.replaceArguments(template, args);
              const result2 = commandManager.replaceArguments(result1, 'other-args');

              // 第二次替换不应改变结果（因为没有 $ARGUMENTS 了）
              expect(result2).toBe(result1);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    it('应该替换 $ARGUMENTS 为用户参数', () => {
      const template = '请分析以下代码: $ARGUMENTS';
      const result = commandManager.replaceArguments(template, 'src/main.ts');

      expect(result).toBe('请分析以下代码: src/main.ts');
    });

    it('应该替换多个 $ARGUMENTS', () => {
      const template = '比较 $ARGUMENTS 和 $ARGUMENTS';
      const result = commandManager.replaceArguments(template, 'file.ts');

      expect(result).toBe('比较 file.ts 和 file.ts');
    });
  });

  describe('embedCommandOutputs', () => {
    it('应该执行并嵌入命令输出', async () => {
      const template = '当前目录: !`pwd`';
      const result = await commandManager.embedCommandOutputs(template);

      expect(result).toContain(tempDir);
      expect(result).not.toContain('!`pwd`');
    });

    it('应该处理多个命令嵌入', async () => {
      // 创建测试文件
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'hello');

      const template = '文件列表: !`ls` 和 !`echo world`';
      const result = await commandManager.embedCommandOutputs(template);

      expect(result).toContain('test.txt');
      expect(result).toContain('world');
      expect(result).not.toContain('!`');
    });

    it('应该处理命令执行失败', async () => {
      const template = '结果: !`nonexistent-command-12345`';
      const result = await commandManager.embedCommandOutputs(template);

      expect(result).toContain('命令执行失败');
    });

    it('没有命令嵌入的模板应保持不变', async () => {
      const template = '这是普通文本，没有命令嵌入';
      const result = await commandManager.embedCommandOutputs(template);

      expect(result).toBe(template);
    });
  });

  describe('executeCommand', () => {
    beforeEach(async () => {
      const analyzeContent = [
        '---',
        'name: analyze',
        'description: 分析代码',
        'argumentHint: <文件路径>',
        'allowedTools:',
        '  - Read',
        '  - Grep',
        '---',
        '',
        '请分析以下文件: $ARGUMENTS',
        '',
        '当前目录内容:',
        '!\`ls\`',
      ].join('\n');
      await createCommandFile(tempDir, 'analyze.md', analyzeContent);

      await commandManager.loadCommands([tempDir]);
    });

    it('应该执行命令并返回处理后的内容', async () => {
      // 创建测试文件
      await fs.writeFile(path.join(tempDir, 'test.ts'), 'console.log("test")');

      const result = await commandManager.executeCommand('analyze', 'test.ts');

      expect(result.content).toContain('请分析以下文件: test.ts');
      expect(result.content).toContain('test.ts');
      expect(result.allowedTools).toEqual(['Read', 'Grep']);
    });

    it('不存在的命令应抛出错误', async () => {
      await expect(
        commandManager.executeCommand('nonexistent')
      ).rejects.toThrow('命令未找到');
    });
  });

  describe('listCommands', () => {
    beforeEach(async () => {
      const userDir = path.join(tempDir, 'user');
      const projectDir = path.join(tempDir, 'project');
      await fs.mkdir(userDir);
      await fs.mkdir(projectDir);

      await createCommandFile(userDir, 'user-cmd.md', `---
description: 用户命令
---

内容
`);

      await createCommandFile(projectDir, 'project-cmd.md', `---
description: 项目命令
---

内容
`);

      await commandManager.loadCommands([userDir, projectDir]);
    });

    it('应该列出所有命令', () => {
      const commands = commandManager.listCommands();

      expect(commands.length).toBeGreaterThanOrEqual(2);
      expect(commands.some(c => c.name === 'user-cmd')).toBe(true);
      expect(commands.some(c => c.name === 'project-cmd')).toBe(true);
    });
  });

  describe('getDefaultCommandDirectories', () => {
    it('应该返回用户级和项目级目录', () => {
      const workingDir = '/project';
      const dirs = commandManager.getDefaultCommandDirectories(workingDir);

      expect(dirs).toContain(path.join(os.homedir(), '.claude', 'commands'));
      expect(dirs).toContain(path.join(workingDir, '.claude', 'commands'));
      expect(dirs).toContain(path.join(workingDir, 'commands'));
    });
  });

  describe('YAML frontmatter 解析', () => {
    it('应该解析带引号的字符串值', async () => {
      await createCommandFile(tempDir, 'quoted.md', `---
name: "quoted-name"
description: 'single quoted'
---

内容
`);

      const commands = await commandManager.loadCommands([tempDir]);

      expect(commands[0].name).toBe('quoted-name');
      expect(commands[0].description).toBe('single quoted');
    });

    it('应该处理没有 frontmatter 的文件', async () => {
      await createCommandFile(tempDir, 'no-fm.md', `这是没有 frontmatter 的命令内容`);

      const commands = await commandManager.loadCommands([tempDir]);

      expect(commands[0].name).toBe('no-fm');
      expect(commands[0].template).toBe('这是没有 frontmatter 的命令内容');
    });
  });

  describe('hasCommand', () => {
    beforeEach(async () => {
      await createCommandFile(tempDir, 'exists.md', `---
description: 存在的命令
---

内容
`);

      await commandManager.loadCommands([tempDir]);
    });

    it('存在的命令应返回 true', () => {
      expect(commandManager.hasCommand('exists')).toBe(true);
    });

    it('不存在的命令应返回 false', () => {
      expect(commandManager.hasCommand('nonexistent')).toBe(false);
    });
  });
});
