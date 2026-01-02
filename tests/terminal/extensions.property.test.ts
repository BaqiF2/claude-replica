/**
 * 扩展系统属性测试
 *
 * 使用 fast-check 进行属性测试，验证扩展系统的正确性
 *
 * **Property 17: Extension Loading**
 * **Property 18: Extension Error Handling**
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SkillManager } from '../../src/skills/SkillManager';
import { CommandManager } from '../../src/commands/CommandManager';
import { AgentRegistry } from '../../src/agents/AgentRegistry';
import { HookManager, HookConfig, ALL_HOOK_EVENTS } from '../../src/hooks/HookManager';

describe('扩展系统属性测试', () => {
  // 生成有效的名称（字母数字和连字符，不能以数字开头）
  const validNameArb = fc
    .string({ minLength: 2, maxLength: 20 })
    .filter((s) => /^[a-zA-Z][a-zA-Z0-9-]*$/.test(s));

  // 生成有效的描述（非空白字符串，不包含 YAML 特殊字符，不能是纯数字）
  const descriptionArb = fc
    .string({ minLength: 2, maxLength: 100 })
    .filter((s) => s.trim().length > 0)
    .filter((s) => !/[:"'\[\]{}|>]/.test(s)) // 过滤 YAML 特殊字符
    .filter((s) => !/^\d+(\.\d+)?$/.test(s.trim())) // 不能是纯数字
    .map((s) => s.trim());

  // 生成有效的内容（非空白字符串）
  const contentArb = fc
    .string({ minLength: 1, maxLength: 500 })
    .filter((s) => s.trim().length > 0)
    .map((s) => s.trim());

  // 生成工具名称列表
  const toolsArb = fc.array(validNameArb, { minLength: 0, maxLength: 5 });

  /**
   * Property 17: Extension Loading
   *
   * *For any* valid extension file (skill, command, agent), the CLI should
   * load it without error and make it available for use.
   *
   * **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
   */
  describe('Property 17: Extension Loading', () => {
    /**
     * 技能加载属性测试
     *
     * 对于任何有效的技能定义，加载后应该能够正确获取技能信息
     *
     * **Validates: Requirements 7.1**
     */
    it('有效的技能文件应该被正确加载', async () => {
      await fc.assert(
        fc.asyncProperty(
          validNameArb,
          descriptionArb,
          contentArb,
          async (name, description, content) => {
            // 每次测试创建新的临时目录
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-test-'));
            
            try {
              const skillsDir = path.join(tempDir, 'skills');
              await fs.mkdir(skillsDir, { recursive: true });

              // 创建技能文件
              const skillContent = `---
name: ${name}
description: ${description}
---

${content}
`;
              await fs.writeFile(
                path.join(skillsDir, `${name}.skill.md`),
                skillContent,
                'utf-8'
              );

              // 加载技能
              const skillManager = new SkillManager();
              const skills = await skillManager.loadSkills([skillsDir]);

              // 验证技能被正确加载
              expect(skills.length).toBe(1);
              expect(skills[0].name).toBe(name);
              expect(skills[0].description).toBe(description);
              expect(skills[0].content).toContain(content);
            } finally {
              await fs.rm(tempDir, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * 命令加载属性测试
     *
     * 对于任何有效的命令定义，加载后应该能够正确获取命令信息
     *
     * **Validates: Requirements 7.2**
     */
    it('有效的命令文件应该被正确加载', async () => {
      await fc.assert(
        fc.asyncProperty(
          validNameArb,
          descriptionArb,
          contentArb,
          async (name, description, template) => {
            // 每次测试创建新的临时目录
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmd-test-'));
            
            try {
              const commandsDir = path.join(tempDir, 'commands');
              await fs.mkdir(commandsDir, { recursive: true });

              // 创建命令文件
              const commandContent = `---
name: ${name}
description: ${description}
---

${template}
`;
              await fs.writeFile(
                path.join(commandsDir, `${name}.md`),
                commandContent,
                'utf-8'
              );

              // 加载命令
              const commandManager = new CommandManager({
                userDirPrefix: tempDir,
              });
              const commands = await commandManager.loadCommands([commandsDir]);

              // 验证命令被正确加载
              expect(commands.length).toBe(1);
              expect(commands[0].name).toBe(name);
              expect(commands[0].description).toBe(description);
              expect(commands[0].template).toContain(template);
            } finally {
              await fs.rm(tempDir, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * 代理加载属性测试
     *
     * 对于任何有效的代理定义，加载后应该能够正确获取代理信息
     *
     * **Validates: Requirements 7.3**
     */
    it('有效的代理文件应该被正确加载', async () => {
      await fc.assert(
        fc.asyncProperty(
          validNameArb,
          descriptionArb,
          contentArb,
          toolsArb,
          async (name, description, prompt, tools) => {
            // 每次测试创建新的临时目录
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-test-'));
            
            try {
              const agentsDir = path.join(tempDir, 'agents');
              await fs.mkdir(agentsDir, { recursive: true });

              // 创建代理文件
              let agentContent = `---
description: ${description}
`;
              if (tools.length > 0) {
                agentContent += `tools:\n`;
                for (const tool of tools) {
                  agentContent += `  - ${tool}\n`;
                }
              }
              agentContent += `---

${prompt}
`;
              await fs.writeFile(
                path.join(agentsDir, `${name}.agent.md`),
                agentContent,
                'utf-8'
              );

              // 加载代理
              const agentRegistry = new AgentRegistry();
              await agentRegistry.loadAgents([agentsDir]);

              // 验证代理被正确加载
              const agent = agentRegistry.getAgent(name);
              expect(agent).toBeDefined();
              expect(agent!.description).toBe(description);
              expect(agent!.prompt).toContain(prompt);
              if (tools.length > 0) {
                expect(agent!.tools).toEqual(tools);
              }
            } finally {
              await fs.rm(tempDir, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * 钩子配置加载属性测试
     *
     * 对于任何有效的钩子配置，加载后应该能够正确获取钩子信息
     *
     * **Validates: Requirements 7.4**
     */
    it('有效的钩子配置应该被正确加载', async () => {
      // 生成有效的钩子事件
      const hookEventArb = fc.constantFrom(...ALL_HOOK_EVENTS);

      // 生成有效的钩子类型
      const hookTypeArb = fc.constantFrom('command', 'prompt');

      // 生成匹配器
      const matcherArb = fc.constantFrom('.*', 'read_file', 'write_file', 'bash');

      await fc.assert(
        fc.asyncProperty(
          hookEventArb,
          matcherArb,
          hookTypeArb,
          contentArb,
          async (event, matcher, hookType, value) => {
            const hookConfig: HookConfig = {
              [event]: [
                {
                  matcher,
                  hooks: [
                    {
                      matcher,
                      type: hookType as 'command' | 'prompt',
                      ...(hookType === 'command' ? { command: value } : { prompt: value }),
                    },
                  ],
                },
              ],
            };

            const hookManager = new HookManager();
            hookManager.loadHooks(hookConfig);

            // 验证钩子被正确加载
            expect(hookManager.hasHooksForEvent(event)).toBe(true);
            const hooks = hookManager.getHooksForEvent(event);
            expect(hooks.length).toBe(1);
            expect(hooks[0].matcher).toBe(matcher);
            expect(hooks[0].hooks.length).toBe(1);
            expect(hooks[0].hooks[0].type).toBe(hookType);
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * 多个扩展文件加载属性测试
     *
     * 对于任何数量的有效扩展文件，都应该被正确加载
     *
     * **Validates: Requirements 7.1, 7.2, 7.3**
     */
    it('多个扩展文件应该都被正确加载', async () => {
      // 生成唯一名称列表
      const uniqueNamesArb = fc
        .array(validNameArb, { minLength: 1, maxLength: 5 })
        .map((names) => [...new Set(names)]);

      await fc.assert(
        fc.asyncProperty(uniqueNamesArb, async (names) => {
          if (names.length === 0) return;

          // 每次测试创建新的临时目录
          const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'multi-skill-test-'));
          
          try {
            const skillsDir = path.join(tempDir, 'skills');
            await fs.mkdir(skillsDir, { recursive: true });

            // 创建多个技能文件
            for (const name of names) {
              const skillContent = `---
name: ${name}
description: Description for ${name}
---

Content for ${name}
`;
              await fs.writeFile(
                path.join(skillsDir, `${name}.skill.md`),
                skillContent,
                'utf-8'
              );
            }

            // 加载技能
            const skillManager = new SkillManager();
            const skills = await skillManager.loadSkills([skillsDir]);

            // 验证所有技能都被加载
            expect(skills.length).toBe(names.length);
            const loadedNames = skills.map((s) => s.name);
            for (const name of names) {
              expect(loadedNames).toContain(name);
            }
          } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
          }
        }),
        { numRuns: 15 }
      );
    });
  });

  /**
   * Property 18: Extension Error Handling
   *
   * *For any* malformed extension file, the CLI should handle the error
   * gracefully without crashing.
   *
   * **Validates: Requirements 7.5**
   */
  describe('Property 18: Extension Error Handling', () => {
    /**
     * 空文件处理属性测试
     *
     * 对于任何空的扩展文件，加载时不应该崩溃
     *
     * **Validates: Requirements 7.5**
     */
    it('空的扩展文件应该被优雅处理', async () => {
      await fc.assert(
        fc.asyncProperty(validNameArb, async (name) => {
          // 每次测试创建新的临时目录
          const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'empty-skill-test-'));
          
          try {
            const skillsDir = path.join(tempDir, 'skills');
            await fs.mkdir(skillsDir, { recursive: true });

            // 创建空文件
            await fs.writeFile(path.join(skillsDir, `${name}.skill.md`), '', 'utf-8');

            // 加载技能（不应该抛出错误）
            const skillManager = new SkillManager();
            const skills = await skillManager.loadSkills([skillsDir]);

            // 空文件不应该被加载为有效技能
            expect(skills.length).toBe(0);
          } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
          }
        }),
        { numRuns: 20 }
      );
    });

    /**
     * 格式错误的 YAML 处理属性测试
     *
     * 对于格式错误的 YAML frontmatter，加载时不应该崩溃
     *
     * **Validates: Requirements 7.5**
     */
    it('格式错误的 YAML 应该被优雅处理', async () => {
      // 生成格式错误的 YAML 内容
      const malformedYamlArb = fc.constantFrom(
        '---\nname: test\n  - invalid yaml\n---\ncontent',
        '---\n: no key\n---\ncontent',
        '---\nname: [unclosed bracket\n---\ncontent',
        '---\nname: "unclosed quote\n---\ncontent'
      );

      await fc.assert(
        fc.asyncProperty(validNameArb, malformedYamlArb, async (name, malformedContent) => {
          // 每次测试创建新的临时目录
          const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'malformed-yaml-test-'));
          
          try {
            const skillsDir = path.join(tempDir, 'skills');
            await fs.mkdir(skillsDir, { recursive: true });

            // 创建格式错误的文件
            await fs.writeFile(
              path.join(skillsDir, `${name}.skill.md`),
              malformedContent,
              'utf-8'
            );

            // 加载技能（不应该抛出错误）
            const skillManager = new SkillManager();
            await expect(skillManager.loadSkills([skillsDir])).resolves.toBeDefined();
          } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
          }
        }),
        { numRuns: 20 }
      );
    });

    /**
     * 不存在的目录处理属性测试
     *
     * 对于不存在的目录，加载时不应该崩溃
     *
     * **Validates: Requirements 7.5**
     */
    it('不存在的目录应该被优雅处理', async () => {
      await fc.assert(
        fc.asyncProperty(validNameArb, async (dirName) => {
          // 每次测试创建新的临时目录
          const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nonexist-test-'));
          
          try {
            const nonExistentDir = path.join(tempDir, dirName, 'non-existent');

            // 加载技能（不应该抛出错误）
            const skillManager = new SkillManager();
            const skills = await skillManager.loadSkills([nonExistentDir]);
            expect(skills.length).toBe(0);

            // 加载命令（不应该抛出错误）
            const commandManager = new CommandManager({ userDirPrefix: tempDir });
            const commands = await commandManager.loadCommands([nonExistentDir]);
            expect(commands.length).toBe(0);

            // 加载代理（不应该抛出错误）
            const agentRegistry = new AgentRegistry();
            await agentRegistry.loadAgents([nonExistentDir]);
            expect(agentRegistry.getAgentCount()).toBe(0);
          } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
          }
        }),
        { numRuns: 20 }
      );
    });

    /**
     * 混合有效和无效文件处理属性测试
     *
     * 当目录中同时存在有效和无效文件时，有效文件应该被正确加载
     *
     * **Validates: Requirements 7.5**
     */
    it('混合有效和无效文件时，有效文件应该被正确加载', async () => {
      await fc.assert(
        fc.asyncProperty(validNameArb, descriptionArb, contentArb, async (name, description, content) => {
          // 每次测试创建新的临时目录
          const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mixed-skill-test-'));
          
          try {
            const skillsDir = path.join(tempDir, 'skills');
            await fs.mkdir(skillsDir, { recursive: true });

            // 创建无效文件
            await fs.writeFile(path.join(skillsDir, 'invalid.skill.md'), '', 'utf-8');

            // 创建有效文件
            const validContent = `---
name: ${name}
description: ${description}
---

${content}
`;
            await fs.writeFile(
              path.join(skillsDir, `${name}.skill.md`),
              validContent,
              'utf-8'
            );

            // 加载技能
            const skillManager = new SkillManager();
            const skills = await skillManager.loadSkills([skillsDir]);

            // 只有有效的技能应该被加载
            expect(skills.length).toBe(1);
            expect(skills[0].name).toBe(name);
          } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
          }
        }),
        { numRuns: 20 }
      );
    });

    /**
     * 无效钩子配置验证属性测试
     *
     * 对于无效的钩子配置，验证函数应该返回错误
     *
     * **Validates: Requirements 7.5**
     */
    it('无效的钩子配置应该被正确验证', async () => {
      // 生成无效的钩子配置
      const invalidConfigArb = fc.constantFrom(
        // 缺少 command 字段的命令钩子
        {
          PreToolUse: [
            {
              matcher: 'test',
              hooks: [{ matcher: 'test', type: 'command' }],
            },
          ],
        },
        // 缺少 prompt 字段的提示词钩子
        {
          PostToolUse: [
            {
              matcher: 'test',
              hooks: [{ matcher: 'test', type: 'prompt' }],
            },
          ],
        },
        // 无效的钩子类型
        {
          SessionStart: [
            {
              matcher: 'test',
              hooks: [{ matcher: 'test', type: 'invalid' }],
            },
          ],
        }
      );

      await fc.assert(
        fc.asyncProperty(invalidConfigArb, async (config) => {
          const validation = HookManager.validateConfig(config as HookConfig);
          expect(validation.valid).toBe(false);
          expect(validation.errors.length).toBeGreaterThan(0);
        }),
        { numRuns: 10 }
      );
    });

    /**
     * 命令执行失败处理属性测试
     *
     * 对于执行失败的命令，钩子管理器应该返回错误而不是崩溃
     *
     * **Validates: Requirements 7.5**
     */
    it('命令执行失败应该被优雅处理', async () => {
      // 生成不存在的命令
      const invalidCommandArb = fc
        .string({ minLength: 10, maxLength: 30 })
        .filter((s) => /^[a-zA-Z0-9_]+$/.test(s))
        .map((s) => `nonexistent_command_${s}`);

      await fc.assert(
        fc.asyncProperty(invalidCommandArb, async (command) => {
          // 每次测试创建新的临时目录
          const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-cmd-test-'));
          
          try {
            const hookManager = new HookManager({
              workingDir: tempDir,
              commandTimeout: 1000,
            });

            const result = await hookManager.executeCommand(command, {
              event: 'PostToolUse',
              tool: 'test',
            });

            // 应该返回失败结果而不是抛出错误
            expect(result.success).toBe(false);
            expect(result.type).toBe('command');
            expect(result.error).toBeDefined();
          } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
          }
        }),
        { numRuns: 10 }
      );
    });
  });
});
