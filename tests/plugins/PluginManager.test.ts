/**
 * PluginManager 测试
 *
 * 测试插件管理器的核心功能：
 * - 插件安装（本地、Git、市场）
 * - 插件卸载
 * - 插件列表
 * - 插件加载（命令、代理、技能、钩子、MCP）
 *
 * **Feature: claude-code-replica, Property 12: 插件加载的完整性**
 * **验证: 需求 13.2**
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { PluginManager } from '../../src/plugins/PluginManager';

async function createTestPlugin(
  dir: string,
  metadata: { name: string; version: string; description: string }
): Promise<void> {
  await fs.writeFile(
    path.join(dir, 'plugin.json'),
    JSON.stringify(metadata, null, 2)
  );
}

describe('PluginManager', () => {
  let pluginManager: PluginManager;
  let testPluginsDir: string;
  let testPluginDir: string;

  beforeEach(async () => {
    testPluginsDir = path.join(os.tmpdir(), `test-plugins-${Date.now()}`);
    testPluginDir = path.join(os.tmpdir(), `test-plugin-source-${Date.now()}`);
    await fs.mkdir(testPluginsDir, { recursive: true });
    await fs.mkdir(testPluginDir, { recursive: true });

    pluginManager = new PluginManager({
      pluginsDir: testPluginsDir,
      debug: false,
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(testPluginsDir, { recursive: true, force: true });
      await fs.rm(testPluginDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  describe('detectSourceType', () => {
    it('应该检测 GitHub HTTPS URL 为 git 类型', () => {
      expect(pluginManager.detectSourceType('https://github.com/user/repo')).toBe('git');
      expect(pluginManager.detectSourceType('https://github.com/user/repo.git')).toBe('git');
    });

    it('应该检测 GitLab HTTPS URL 为 git 类型', () => {
      expect(pluginManager.detectSourceType('https://gitlab.com/user/repo')).toBe('git');
    });

    it('应该检测 SSH URL 为 git 类型', () => {
      expect(pluginManager.detectSourceType('git@github.com:user/repo.git')).toBe('git');
    });

    it('应该检测绝对路径为 local 类型', () => {
      expect(pluginManager.detectSourceType('/home/user/plugin')).toBe('local');
      expect(pluginManager.detectSourceType('/var/plugins/my-plugin')).toBe('local');
    });

    it('应该检测相对路径为 local 类型', () => {
      expect(pluginManager.detectSourceType('./my-plugin')).toBe('local');
      expect(pluginManager.detectSourceType('../plugins/my-plugin')).toBe('local');
    });

    it('应该检测 ~ 路径为 local 类型', () => {
      expect(pluginManager.detectSourceType('~/plugins/my-plugin')).toBe('local');
    });

    it('应该检测简单名称为 marketplace 类型', () => {
      expect(pluginManager.detectSourceType('my-plugin')).toBe('marketplace');
      expect(pluginManager.detectSourceType('awesome-claude-plugin')).toBe('marketplace');
    });
  });

  describe('loadPlugin', () => {
    it('应该加载有效的插件', async () => {
      await createTestPlugin(testPluginDir, {
        name: 'test-plugin',
        version: '1.0.0',
        description: '测试插件',
      });

      const plugin = await pluginManager.loadPlugin(testPluginDir);

      expect(plugin).not.toBeNull();
      expect(plugin!.name).toBe('test-plugin');
      expect(plugin!.version).toBe('1.0.0');
      expect(plugin!.description).toBe('测试插件');
    });

    it('应该返回 null 如果缺少 plugin.json', async () => {
      const plugin = await pluginManager.loadPlugin(testPluginDir);
      expect(plugin).toBeNull();
    });

    it('应该返回 null 如果 plugin.json 缺少必需字段', async () => {
      await fs.writeFile(
        path.join(testPluginDir, 'plugin.json'),
        JSON.stringify({ description: '缺少 name 和 version' })
      );

      const plugin = await pluginManager.loadPlugin(testPluginDir);
      expect(plugin).toBeNull();
    });

    it('应该加载插件中的命令', async () => {
      await createTestPlugin(testPluginDir, {
        name: 'test-plugin',
        version: '1.0.0',
        description: '测试插件',
      });

      const commandsDir = path.join(testPluginDir, 'commands');
      await fs.mkdir(commandsDir, { recursive: true });
      await fs.writeFile(
        path.join(commandsDir, 'test-command.md'),
        '---\ndescription: 测试命令\n---\n\n这是测试命令的模板内容'
      );

      const plugin = await pluginManager.loadPlugin(testPluginDir);

      expect(plugin).not.toBeNull();
      expect(plugin!.commands).toHaveLength(1);
      expect(plugin!.commands![0].name).toBe('test-command');
      expect(plugin!.commands![0].description).toBe('测试命令');
    });

    it('应该加载插件中的代理', async () => {
      await createTestPlugin(testPluginDir, {
        name: 'test-plugin',
        version: '1.0.0',
        description: '测试插件',
      });

      const agentsDir = path.join(testPluginDir, 'agents');
      await fs.mkdir(agentsDir, { recursive: true });
      await fs.writeFile(
        path.join(agentsDir, 'reviewer.agent.md'),
        '---\ndescription: 代码审查代理\nmodel: sonnet\ntools:\n  - Read\n  - Grep\n---\n\n你是代码审查专家。'
      );

      const plugin = await pluginManager.loadPlugin(testPluginDir);

      expect(plugin).not.toBeNull();
      expect(plugin!.agents).toHaveLength(1);
      expect(plugin!.agents![0].description).toBe('代码审查代理');
      expect(plugin!.agents![0].model).toBe('sonnet');
      expect(plugin!.agents![0].tools).toEqual(['Read', 'Grep']);
    });

    it('应该加载插件中的技能', async () => {
      await createTestPlugin(testPluginDir, {
        name: 'test-plugin',
        version: '1.0.0',
        description: '测试插件',
      });

      const skillsDir = path.join(testPluginDir, 'skills');
      await fs.mkdir(skillsDir, { recursive: true });
      await fs.writeFile(
        path.join(skillsDir, 'typescript.skill.md'),
        '---\ndescription: TypeScript 开发技能\ntriggers:\n  - typescript\n  - ts\ntools:\n  - Read\n  - Write\n---\n\nTypeScript 最佳实践指南。'
      );

      const plugin = await pluginManager.loadPlugin(testPluginDir);

      expect(plugin).not.toBeNull();
      expect(plugin!.skills).toHaveLength(1);
      expect(plugin!.skills![0].name).toBe('typescript');
      expect(plugin!.skills![0].description).toBe('TypeScript 开发技能');
      expect(plugin!.skills![0].triggers).toEqual(['typescript', 'ts']);
    });

    it('应该加载插件中的钩子配置', async () => {
      await createTestPlugin(testPluginDir, {
        name: 'test-plugin',
        version: '1.0.0',
        description: '测试插件',
      });

      const hooksConfig = {
        PostToolUse: [
          {
            matcher: 'Write|Edit',
            hooks: [{ type: 'command', command: 'npm run lint:fix' }],
          },
        ],
      };

      await fs.writeFile(
        path.join(testPluginDir, 'hooks.json'),
        JSON.stringify(hooksConfig, null, 2)
      );

      const plugin = await pluginManager.loadPlugin(testPluginDir);

      expect(plugin).not.toBeNull();
      expect(plugin!.hooks).toBeDefined();
      expect(plugin!.hooks!.PostToolUse).toHaveLength(1);
      expect(plugin!.hooks!.PostToolUse![0].matcher).toBe('Write|Edit');
    });

    it('应该加载插件中的 MCP 服务器配置', async () => {
      await createTestPlugin(testPluginDir, {
        name: 'test-plugin',
        version: '1.0.0',
        description: '测试插件',
      });

      const mcpConfig = {
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_TOKEN: 'token' },
        },
      };

      await fs.writeFile(
        path.join(testPluginDir, '.mcp.json'),
        JSON.stringify(mcpConfig, null, 2)
      );

      const plugin = await pluginManager.loadPlugin(testPluginDir);

      expect(plugin).not.toBeNull();
      expect(plugin!.mcpServers).toBeDefined();
      expect(plugin!.mcpServers!.github).toBeDefined();
      const githubConfig = plugin!.mcpServers!.github as { command: string; args: string[] };
      expect(githubConfig.command).toBe('npx');
    });
  });

  describe('installPlugin', () => {
    it('应该从本地目录安装插件', async () => {
      await createTestPlugin(testPluginDir, {
        name: 'local-plugin',
        version: '1.0.0',
        description: '本地插件',
      });

      const result = await pluginManager.installPlugin(testPluginDir);

      expect(result.success).toBe(true);
      expect(result.plugin).toBeDefined();
      expect(result.plugin!.name).toBe('local-plugin');
      expect(result.plugin!.sourceType).toBe('local');
    });

    it('应该拒绝安装已存在的插件', async () => {
      await createTestPlugin(testPluginDir, {
        name: 'duplicate-plugin',
        version: '1.0.0',
        description: '重复插件',
      });

      await pluginManager.installPlugin(testPluginDir);

      const anotherDir = path.join(os.tmpdir(), `another-plugin-${Date.now()}`);
      await fs.mkdir(anotherDir, { recursive: true });
      await createTestPlugin(anotherDir, {
        name: 'duplicate-plugin',
        version: '2.0.0',
        description: '另一个重复插件',
      });

      const result = await pluginManager.installPlugin(anotherDir);

      expect(result.success).toBe(false);
      expect(result.error).toContain('已安装');

      await fs.rm(anotherDir, { recursive: true, force: true });
    });

    it('应该拒绝安装缺少 plugin.json 的目录', async () => {
      const result = await pluginManager.installPlugin(testPluginDir);

      expect(result.success).toBe(false);
      expect(result.error).toContain('plugin.json');
    });
  });

  describe('uninstallPlugin', () => {
    it('应该卸载已安装的插件', async () => {
      await createTestPlugin(testPluginDir, {
        name: 'uninstall-test',
        version: '1.0.0',
        description: '卸载测试插件',
      });

      await pluginManager.installPlugin(testPluginDir);
      expect(pluginManager.hasPlugin('uninstall-test')).toBe(true);

      const result = await pluginManager.uninstallPlugin('uninstall-test');

      expect(result).toBe(true);
      expect(pluginManager.hasPlugin('uninstall-test')).toBe(false);
    });

    it('卸载不存在的插件应返回 false', async () => {
      const result = await pluginManager.uninstallPlugin('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('listPlugins', () => {
    it('应该列出所有已安装的插件', async () => {
      const plugin1Dir = path.join(os.tmpdir(), `plugin1-${Date.now()}`);
      const plugin2Dir = path.join(os.tmpdir(), `plugin2-${Date.now()}`);
      await fs.mkdir(plugin1Dir, { recursive: true });
      await fs.mkdir(plugin2Dir, { recursive: true });

      await createTestPlugin(plugin1Dir, {
        name: 'plugin-1',
        version: '1.0.0',
        description: '插件1',
      });

      await createTestPlugin(plugin2Dir, {
        name: 'plugin-2',
        version: '2.0.0',
        description: '插件2',
      });

      await pluginManager.installPlugin(plugin1Dir);
      await pluginManager.installPlugin(plugin2Dir);

      const plugins = pluginManager.listPlugins();

      expect(plugins).toHaveLength(2);
      expect(plugins.map(p => p.name).sort()).toEqual(['plugin-1', 'plugin-2']);

      await fs.rm(plugin1Dir, { recursive: true, force: true });
      await fs.rm(plugin2Dir, { recursive: true, force: true });
    });

    it('空插件列表应返回空数组', () => {
      const plugins = pluginManager.listPlugins();
      expect(plugins).toHaveLength(0);
    });
  });

  describe('getAllCommands / getAllAgents / getAllSkills', () => {
    it('应该获取所有插件的命令', async () => {
      await createTestPlugin(testPluginDir, {
        name: 'test-plugin',
        version: '1.0.0',
        description: '测试插件',
      });

      const commandsDir = path.join(testPluginDir, 'commands');
      await fs.mkdir(commandsDir, { recursive: true });
      await fs.writeFile(path.join(commandsDir, 'cmd1.md'), '---\ndescription: 命令1\n---\n\n命令模板1');
      await fs.writeFile(path.join(commandsDir, 'cmd2.md'), '---\ndescription: 命令2\n---\n\n命令模板2');

      await pluginManager.installPlugin(testPluginDir);

      const commands = pluginManager.getAllCommands();
      expect(commands).toHaveLength(2);
      expect(commands.map(c => c.name).sort()).toEqual(['cmd1', 'cmd2']);
    });

    it('应该获取所有插件的代理', async () => {
      await createTestPlugin(testPluginDir, {
        name: 'test-plugin',
        version: '1.0.0',
        description: '测试插件',
      });

      const agentsDir = path.join(testPluginDir, 'agents');
      await fs.mkdir(agentsDir, { recursive: true });
      await fs.writeFile(path.join(agentsDir, 'reviewer.agent.md'), '---\ndescription: 代码审查代理\n---\n\n审查代码');

      await pluginManager.installPlugin(testPluginDir);

      const agents = pluginManager.getAllAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].description).toBe('代码审查代理');
    });

    it('应该获取所有插件的技能', async () => {
      await createTestPlugin(testPluginDir, {
        name: 'test-plugin',
        version: '1.0.0',
        description: '测试插件',
      });

      const skillsDir = path.join(testPluginDir, 'skills');
      await fs.mkdir(skillsDir, { recursive: true });
      await fs.writeFile(path.join(skillsDir, 'ts.skill.md'), '---\ndescription: TypeScript 技能\n---\n\nTS 最佳实践');

      await pluginManager.installPlugin(testPluginDir);

      const skills = pluginManager.getAllSkills();
      expect(skills).toHaveLength(1);
      expect(skills[0].description).toBe('TypeScript 技能');
    });
  });

  /**
   * 属性 12: 插件加载的完整性
   *
   * *对于任意*已安装的插件,系统应该加载插件中定义的所有命令、代理、技能和钩子。
   *
   * **Feature: claude-code-replica, Property 12: 插件加载的完整性**
   * **验证: 需求 13.2**
   */
  describe('Property 12: 插件加载的完整性', () => {
    const arbPluginName = fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => /^[a-zA-Z][a-zA-Z0-9-]*$/.test(s));

    const arbVersion = fc.tuple(
      fc.integer({ min: 0, max: 99 }),
      fc.integer({ min: 0, max: 99 }),
      fc.integer({ min: 0, max: 99 })
    ).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

    const arbDescription = fc.string({ minLength: 3, maxLength: 50 })
      .filter(s => s.trim().length >= 3 && !/['":\n\r]/.test(s))
      .map(s => s.trim());

    const arbCommandConfig = fc.record({
      name: arbPluginName,
      description: arbDescription,
      template: fc.string({ minLength: 5, maxLength: 100 })
        .filter(s => s.trim().length >= 5 && !/^---/.test(s))
        .map(s => s.trim()),
    });

    const arbAgentConfig = fc.record({
      name: arbPluginName,
      description: arbDescription,
      prompt: fc.string({ minLength: 5, maxLength: 100 })
        .filter(s => s.trim().length >= 5 && !/^---/.test(s))
        .map(s => s.trim()),
      model: fc.constantFrom('sonnet', 'opus', 'haiku', 'inherit'),
      tools: fc.array(fc.constantFrom('Read', 'Write', 'Bash', 'Grep', 'Glob'), { minLength: 0, maxLength: 3 }),
    });

    const arbSkillConfig = fc.record({
      name: arbPluginName,
      description: arbDescription,
      content: fc.string({ minLength: 5, maxLength: 100 })
        .filter(s => s.trim().length >= 5 && !/^---/.test(s))
        .map(s => s.trim()),
      triggers: fc.array(
        fc.string({ minLength: 2, maxLength: 10 }).filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
        { minLength: 0, maxLength: 3 }
      ),
    });

    const arbHookConfig = fc.record({
      PostToolUse: fc.array(
        fc.record({
          matcher: fc.constantFrom('Write', 'Edit', 'Bash', 'Write|Edit'),
          hooks: fc.array(
            fc.record({ type: fc.constantFrom('command', 'prompt'), command: fc.constant('echo test') }),
            { minLength: 1, maxLength: 2 }
          ),
        }),
        { minLength: 0, maxLength: 2 }
      ),
    });

    async function createFullTestPlugin(
      dir: string,
      config: {
        name: string;
        version: string;
        description: string;
        commands?: Array<{ name: string; description: string; template: string }>;
        agents?: Array<{ name: string; description: string; prompt: string; model: string; tools: string[] }>;
        skills?: Array<{ name: string; description: string; content: string; triggers: string[] }>;
        hooks?: Record<string, unknown>;
      }
    ): Promise<void> {
      await fs.writeFile(
        path.join(dir, 'plugin.json'),
        JSON.stringify({ name: config.name, version: config.version, description: config.description }, null, 2)
      );

      if (config.commands && config.commands.length > 0) {
        const commandsDir = path.join(dir, 'commands');
        await fs.mkdir(commandsDir, { recursive: true });
        for (const cmd of config.commands) {
          const content = `---\ndescription: ${cmd.description}\n---\n\n${cmd.template}`;
          await fs.writeFile(path.join(commandsDir, `${cmd.name}.md`), content);
        }
      }

      if (config.agents && config.agents.length > 0) {
        const agentsDir = path.join(dir, 'agents');
        await fs.mkdir(agentsDir, { recursive: true });
        for (const agent of config.agents) {
          const toolsYaml = agent.tools.length > 0 ? `tools:\n${agent.tools.map(t => `  - ${t}`).join('\n')}` : '';
          const content = `---\ndescription: ${agent.description}\nmodel: ${agent.model}\n${toolsYaml}\n---\n\n${agent.prompt}`;
          await fs.writeFile(path.join(agentsDir, `${agent.name}.agent.md`), content);
        }
      }

      if (config.skills && config.skills.length > 0) {
        const skillsDir = path.join(dir, 'skills');
        await fs.mkdir(skillsDir, { recursive: true });
        for (const skill of config.skills) {
          const triggersYaml = skill.triggers.length > 0 ? `triggers:\n${skill.triggers.map(t => `  - ${t}`).join('\n')}` : '';
          const content = `---\ndescription: ${skill.description}\n${triggersYaml}\n---\n\n${skill.content}`;
          await fs.writeFile(path.join(skillsDir, `${skill.name}.skill.md`), content);
        }
      }

      if (config.hooks && Object.keys(config.hooks).length > 0) {
        await fs.writeFile(path.join(dir, 'hooks.json'), JSON.stringify(config.hooks, null, 2));
      }
    }

    it('加载的插件应包含所有定义的命令', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPluginName, arbVersion, arbDescription,
          fc.array(arbCommandConfig, { minLength: 1, maxLength: 5 }),
          async (name, version, description, commands) => {
            const uniqueCommands = commands.map((cmd, index) => ({ ...cmd, name: `${cmd.name}-${index}` }));

            await createFullTestPlugin(testPluginDir, { name, version, description, commands: uniqueCommands });

            const plugin = await pluginManager.loadPlugin(testPluginDir);

            expect(plugin).not.toBeNull();
            expect(plugin!.commands).toBeDefined();
            expect(plugin!.commands!.length).toBe(uniqueCommands.length);

            for (const expectedCmd of uniqueCommands) {
              const loadedCmd = plugin!.commands!.find(c => c.name === expectedCmd.name);
              expect(loadedCmd).toBeDefined();
              expect(loadedCmd!.description).toBe(expectedCmd.description);
              expect(loadedCmd!.template).toBe(expectedCmd.template);
            }

            await fs.rm(testPluginDir, { recursive: true, force: true });
            await fs.mkdir(testPluginDir, { recursive: true });

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('加载的插件应包含所有定义的代理', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPluginName, arbVersion, arbDescription,
          fc.array(arbAgentConfig, { minLength: 1, maxLength: 5 }),
          async (name, version, description, agents) => {
            const uniqueAgents = agents.map((agent, index) => ({ ...agent, name: `${agent.name}-${index}` }));

            await createFullTestPlugin(testPluginDir, { name, version, description, agents: uniqueAgents });

            const plugin = await pluginManager.loadPlugin(testPluginDir);

            expect(plugin).not.toBeNull();
            expect(plugin!.agents).toBeDefined();
            expect(plugin!.agents!.length).toBe(uniqueAgents.length);

            for (const expectedAgent of uniqueAgents) {
              const loadedAgent = plugin!.agents!.find(a => a.description === expectedAgent.description);
              expect(loadedAgent).toBeDefined();
              expect(loadedAgent!.prompt).toBe(expectedAgent.prompt);
              expect(loadedAgent!.model).toBe(expectedAgent.model);
            }

            await fs.rm(testPluginDir, { recursive: true, force: true });
            await fs.mkdir(testPluginDir, { recursive: true });

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('加载的插件应包含所有定义的技能', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPluginName, arbVersion, arbDescription,
          fc.array(arbSkillConfig, { minLength: 1, maxLength: 5 }),
          async (name, version, description, skills) => {
            const uniqueSkills = skills.map((skill, index) => ({ ...skill, name: `${skill.name}-${index}` }));

            await createFullTestPlugin(testPluginDir, { name, version, description, skills: uniqueSkills });

            const plugin = await pluginManager.loadPlugin(testPluginDir);

            expect(plugin).not.toBeNull();
            expect(plugin!.skills).toBeDefined();
            expect(plugin!.skills!.length).toBe(uniqueSkills.length);

            for (const expectedSkill of uniqueSkills) {
              const loadedSkill = plugin!.skills!.find(s => s.name === expectedSkill.name);
              expect(loadedSkill).toBeDefined();
              expect(loadedSkill!.description).toBe(expectedSkill.description);
              expect(loadedSkill!.content).toBe(expectedSkill.content);
            }

            await fs.rm(testPluginDir, { recursive: true, force: true });
            await fs.mkdir(testPluginDir, { recursive: true });

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('加载的插件应包含所有定义的钩子', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPluginName, arbVersion, arbDescription, arbHookConfig,
          async (name, version, description, hooks) => {
            await createFullTestPlugin(testPluginDir, { name, version, description, hooks });

            const plugin = await pluginManager.loadPlugin(testPluginDir);

            expect(plugin).not.toBeNull();

            if (hooks.PostToolUse && hooks.PostToolUse.length > 0) {
              expect(plugin!.hooks).toBeDefined();
              expect(plugin!.hooks!.PostToolUse).toBeDefined();
              expect(plugin!.hooks!.PostToolUse!.length).toBe(hooks.PostToolUse.length);

              for (let i = 0; i < hooks.PostToolUse.length; i++) {
                const expectedHook = hooks.PostToolUse[i];
                const loadedHook = plugin!.hooks!.PostToolUse![i];
                expect(loadedHook.matcher).toBe(expectedHook.matcher);
                expect(loadedHook.hooks.length).toBe(expectedHook.hooks.length);
              }
            }

            await fs.rm(testPluginDir, { recursive: true, force: true });
            await fs.mkdir(testPluginDir, { recursive: true });

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('安装后通过 getAllXxx 方法应能获取所有插件内容', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbPluginName, arbVersion, arbDescription,
          fc.array(arbCommandConfig, { minLength: 1, maxLength: 3 }),
          fc.array(arbAgentConfig, { minLength: 1, maxLength: 3 }),
          fc.array(arbSkillConfig, { minLength: 1, maxLength: 3 }),
          async (name, version, description, commands, agents, skills) => {
            const uniqueCommands = commands.map((cmd, index) => ({ ...cmd, name: `cmd-${index}` }));
            const uniqueAgents = agents.map((agent, index) => ({ ...agent, name: `agent-${index}` }));
            const uniqueSkills = skills.map((skill, index) => ({ ...skill, name: `skill-${index}` }));

            await createFullTestPlugin(testPluginDir, {
              name, version, description,
              commands: uniqueCommands,
              agents: uniqueAgents,
              skills: uniqueSkills,
            });

            const result = await pluginManager.installPlugin(testPluginDir);
            expect(result.success).toBe(true);

            const allCommands = pluginManager.getAllCommands();
            const allAgents = pluginManager.getAllAgents();
            const allSkills = pluginManager.getAllSkills();

            expect(allCommands.length).toBe(uniqueCommands.length);
            expect(allAgents.length).toBe(uniqueAgents.length);
            expect(allSkills.length).toBe(uniqueSkills.length);

            for (const expectedCmd of uniqueCommands) {
              expect(allCommands.find(c => c.name === expectedCmd.name)).toBeDefined();
            }
            for (const expectedAgent of uniqueAgents) {
              expect(allAgents.find(a => a.description === expectedAgent.description)).toBeDefined();
            }
            for (const expectedSkill of uniqueSkills) {
              expect(allSkills.find(s => s.name === expectedSkill.name)).toBeDefined();
            }

            pluginManager.clear();
            await fs.rm(testPluginDir, { recursive: true, force: true });
            await fs.mkdir(testPluginDir, { recursive: true });

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('多个插件的内容应该正确合并', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 4 }),
          async (pluginCount) => {
            const pluginDirs: string[] = [];
            const expectedCommands: string[] = [];
            const expectedAgents: string[] = [];
            const expectedSkills: string[] = [];

            for (let i = 0; i < pluginCount; i++) {
              const pluginDir = path.join(os.tmpdir(), `multi-plugin-${Date.now()}-${i}`);
              await fs.mkdir(pluginDir, { recursive: true });
              pluginDirs.push(pluginDir);

              const cmdName = `cmd-plugin${i}`;
              const agentDesc = `agent-plugin${i}`;
              const skillName = `skill-plugin${i}`;

              expectedCommands.push(cmdName);
              expectedAgents.push(agentDesc);
              expectedSkills.push(skillName);

              await createFullTestPlugin(pluginDir, {
                name: `plugin-${i}`,
                version: '1.0.0',
                description: `插件 ${i}`,
                commands: [{ name: cmdName, description: `命令 ${i}`, template: `模板 ${i}` }],
                agents: [{ name: `agent${i}`, description: agentDesc, prompt: `提示词 ${i}`, model: 'sonnet', tools: [] }],
                skills: [{ name: skillName, description: `技能 ${i}`, content: `内容 ${i}`, triggers: [] }],
              });

              await pluginManager.installPlugin(pluginDir);
            }

            const allCommands = pluginManager.getAllCommands();
            const allAgents = pluginManager.getAllAgents();
            const allSkills = pluginManager.getAllSkills();

            expect(allCommands.length).toBe(pluginCount);
            expect(allAgents.length).toBe(pluginCount);
            expect(allSkills.length).toBe(pluginCount);

            for (const cmdName of expectedCommands) {
              expect(allCommands.find(c => c.name === cmdName)).toBeDefined();
            }
            for (const agentDesc of expectedAgents) {
              expect(allAgents.find(a => a.description === agentDesc)).toBeDefined();
            }
            for (const skillName of expectedSkills) {
              expect(allSkills.find(s => s.name === skillName)).toBeDefined();
            }

            pluginManager.clear();
            for (const dir of pluginDirs) {
              await fs.rm(dir, { recursive: true, force: true });
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
