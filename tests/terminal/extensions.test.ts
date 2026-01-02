/**
 * 扩展系统测试
 *
 * 测试 CLI 工具的扩展系统功能，包括：
 * - 技能文件加载
 * - 自定义命令执行
 * - 子代理调用
 * - 钩子触发
 * - 扩展加载错误处理
 *
 * @module tests/terminal/extensions.test.ts
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
 */

import './setup';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { SkillManager } from '../../src/skills/SkillManager';
import { CommandManager } from '../../src/commands/CommandManager';
import { AgentRegistry } from '../../src/agents/AgentRegistry';
import { HookManager, HookConfig, HookContext } from '../../src/hooks/HookManager';
import { TestFixture, createTestFixture } from '../../src/testing/TestFixture';

describe('扩展系统测试', () => {
  // 临时目录
  let tempDir: string;
  let fixture: TestFixture;

  beforeEach(async () => {
    // 创建临时目录
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-replica-ext-test-'));
  });

  afterEach(async () => {
    // 清理临时目录
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });


  describe('技能文件加载', () => {
    /**
     * 测试加载有效的技能文件
     *
     * **Validates: Requirements 7.1**
     */
    it('应该能够加载有效的技能文件', async () => {
      // 创建技能目录
      const skillsDir = path.join(tempDir, 'skills');
      await fs.mkdir(skillsDir, { recursive: true });

      // 创建技能文件
      const skillContent = `---
name: test-skill
description: 测试技能
triggers:
  - test
  - 测试
tools:
  - read_file
  - write_file
---

# 测试技能

这是一个测试技能的内容。

## 使用说明

当用户提到"测试"时，应用此技能。
`;
      await fs.writeFile(path.join(skillsDir, 'test-skill.skill.md'), skillContent, 'utf-8');

      // 加载技能
      const skillManager = new SkillManager();
      const skills = await skillManager.loadSkills([skillsDir]);

      // 验证技能已加载
      expect(skills.length).toBe(1);
      expect(skills[0].name).toBe('test-skill');
      expect(skills[0].description).toBe('测试技能');
      expect(skills[0].triggers).toContain('test');
      expect(skills[0].triggers).toContain('测试');
      expect(skills[0].tools).toContain('read_file');
      expect(skills[0].tools).toContain('write_file');
      expect(skills[0].content).toContain('测试技能');
    });

    /**
     * 测试技能匹配
     *
     * **Validates: Requirements 7.1**
     */
    it('应该能够根据上下文匹配技能', async () => {
      // 创建技能目录
      const skillsDir = path.join(tempDir, 'skills');
      await fs.mkdir(skillsDir, { recursive: true });

      // 创建技能文件
      const skillContent = `---
name: typescript-skill
description: TypeScript 开发技能
triggers:
  - typescript
  - ts
  - 类型
---

TypeScript 开发最佳实践。
`;
      await fs.writeFile(path.join(skillsDir, 'typescript.skill.md'), skillContent, 'utf-8');

      // 加载技能
      const skillManager = new SkillManager();
      await skillManager.loadSkills([skillsDir]);

      // 测试匹配
      const matchedSkills = skillManager.matchSkills('我需要帮助写 TypeScript 代码');
      expect(matchedSkills.length).toBe(1);
      expect(matchedSkills[0].name).toBe('typescript-skill');

      // 测试不匹配
      const noMatch = skillManager.matchSkills('我需要帮助写 Python 代码');
      expect(noMatch.length).toBe(0);
    });

    /**
     * 测试多个技能目录加载
     *
     * **Validates: Requirements 7.1**
     */
    it('应该能够从多个目录加载技能', async () => {
      // 创建两个技能目录
      const userSkillsDir = path.join(tempDir, 'user-skills');
      const projectSkillsDir = path.join(tempDir, 'project-skills');
      await fs.mkdir(userSkillsDir, { recursive: true });
      await fs.mkdir(projectSkillsDir, { recursive: true });

      // 创建用户级技能
      await fs.writeFile(
        path.join(userSkillsDir, 'user-skill.skill.md'),
        `---
name: user-skill
description: 用户级技能
---
用户级技能内容`,
        'utf-8'
      );

      // 创建项目级技能
      await fs.writeFile(
        path.join(projectSkillsDir, 'project-skill.skill.md'),
        `---
name: project-skill
description: 项目级技能
---
项目级技能内容`,
        'utf-8'
      );

      // 加载技能
      const skillManager = new SkillManager();
      const skills = await skillManager.loadSkills([userSkillsDir, projectSkillsDir]);

      // 验证两个技能都已加载
      expect(skills.length).toBe(2);
      const skillNames = skills.map((s) => s.name);
      expect(skillNames).toContain('user-skill');
      expect(skillNames).toContain('project-skill');
    });

    /**
     * 测试技能应用到系统提示词
     *
     * **Validates: Requirements 7.1**
     */
    it('应该能够将技能应用到系统提示词', async () => {
      // 创建技能目录
      const skillsDir = path.join(tempDir, 'skills');
      await fs.mkdir(skillsDir, { recursive: true });

      // 创建技能文件
      await fs.writeFile(
        path.join(skillsDir, 'test.skill.md'),
        `---
name: test-skill
description: 测试技能
---
这是技能内容`,
        'utf-8'
      );

      // 加载技能
      const skillManager = new SkillManager();
      const skills = await skillManager.loadSkills([skillsDir]);

      // 应用技能
      const basePrompt = '你是一个有帮助的助手。';
      const enhancedPrompt = skillManager.applySkills(skills, basePrompt);

      // 验证技能内容被添加
      expect(enhancedPrompt).toContain(basePrompt);
      expect(enhancedPrompt).toContain('test-skill');
      expect(enhancedPrompt).toContain('这是技能内容');
    });
  });


  describe('自定义命令执行', () => {
    /**
     * 测试加载有效的命令文件
     *
     * **Validates: Requirements 7.2**
     */
    it('应该能够加载有效的命令文件', async () => {
      // 创建命令目录
      const commandsDir = path.join(tempDir, 'commands');
      await fs.mkdir(commandsDir, { recursive: true });

      // 创建命令文件
      const commandContent = `---
name: review
description: 代码审查命令
argumentHint: <file_path>
allowedTools:
  - read_file
  - write_file
---

请审查以下文件的代码：$ARGUMENTS

重点关注：
1. 代码风格
2. 潜在的 bug
3. 性能问题
`;
      await fs.writeFile(path.join(commandsDir, 'review.md'), commandContent, 'utf-8');

      // 加载命令
      const commandManager = new CommandManager({
        userDirPrefix: tempDir,
      });
      const commands = await commandManager.loadCommands([commandsDir]);

      // 验证命令已加载
      expect(commands.length).toBe(1);
      expect(commands[0].name).toBe('review');
      expect(commands[0].description).toBe('代码审查命令');
      expect(commands[0].argumentHint).toBe('<file_path>');
      expect(commands[0].allowedTools).toContain('read_file');
    });

    /**
     * 测试命令参数替换
     *
     * **Validates: Requirements 7.2**
     */
    it('应该能够替换命令参数', async () => {
      // 创建命令目录
      const commandsDir = path.join(tempDir, 'commands');
      await fs.mkdir(commandsDir, { recursive: true });

      // 创建命令文件
      await fs.writeFile(
        path.join(commandsDir, 'greet.md'),
        `---
name: greet
description: 问候命令
---
你好，$ARGUMENTS！欢迎使用 Claude Replica。`,
        'utf-8'
      );

      // 加载命令
      const commandManager = new CommandManager({
        userDirPrefix: tempDir,
      });
      await commandManager.loadCommands([commandsDir]);

      // 执行命令
      const result = await commandManager.executeCommand('greet', '张三');

      // 验证参数被替换
      expect(result.content).toContain('你好，张三！');
      expect(result.content).toContain('欢迎使用 Claude Replica');
    });

    /**
     * 测试命令命名空间
     *
     * **Validates: Requirements 7.2**
     */
    it('应该支持命令命名空间', async () => {
      // 创建用户级和项目级命令目录
      const userCommandsDir = path.join(tempDir, '.claude', 'commands');
      const projectCommandsDir = path.join(tempDir, 'project', 'commands');
      await fs.mkdir(userCommandsDir, { recursive: true });
      await fs.mkdir(projectCommandsDir, { recursive: true });

      // 创建同名命令
      await fs.writeFile(
        path.join(userCommandsDir, 'test.md'),
        `---
name: test
description: 用户级测试命令
---
用户级命令内容`,
        'utf-8'
      );

      await fs.writeFile(
        path.join(projectCommandsDir, 'test.md'),
        `---
name: test
description: 项目级测试命令
---
项目级命令内容`,
        'utf-8'
      );

      // 加载命令
      const commandManager = new CommandManager({
        userDirPrefix: tempDir,
      });
      await commandManager.loadCommands([userCommandsDir, projectCommandsDir]);

      // 默认应该返回项目级命令（后加载的覆盖先加载的）
      const defaultCommand = commandManager.getCommand('test');
      expect(defaultCommand).toBeDefined();
      expect(defaultCommand!.template).toContain('项目级命令内容');
    });

    /**
     * 测试列出所有命令
     *
     * **Validates: Requirements 7.2**
     */
    it('应该能够列出所有命令', async () => {
      // 创建命令目录
      const commandsDir = path.join(tempDir, 'commands');
      await fs.mkdir(commandsDir, { recursive: true });

      // 创建多个命令
      await fs.writeFile(
        path.join(commandsDir, 'cmd1.md'),
        `---
name: cmd1
description: 命令1
---
命令1内容`,
        'utf-8'
      );

      await fs.writeFile(
        path.join(commandsDir, 'cmd2.md'),
        `---
name: cmd2
description: 命令2
---
命令2内容`,
        'utf-8'
      );

      // 加载命令
      const commandManager = new CommandManager({
        userDirPrefix: tempDir,
      });
      await commandManager.loadCommands([commandsDir]);

      // 列出命令
      const commandList = commandManager.listCommands();

      expect(commandList.length).toBe(2);
      const names = commandList.map((c) => c.name);
      expect(names).toContain('cmd1');
      expect(names).toContain('cmd2');
    });
  });


  describe('子代理调用', () => {
    /**
     * 测试加载有效的代理文件
     *
     * **Validates: Requirements 7.3**
     */
    it('应该能够加载有效的代理文件', async () => {
      // 创建代理目录
      const agentsDir = path.join(tempDir, 'agents');
      await fs.mkdir(agentsDir, { recursive: true });

      // 创建代理文件
      const agentContent = `---
description: 代码审查专家
model: sonnet
tools:
  - read_file
  - write_file
---

你是一个代码审查专家。你的任务是：
1. 仔细阅读代码
2. 找出潜在问题
3. 提供改进建议
`;
      await fs.writeFile(path.join(agentsDir, 'code-reviewer.agent.md'), agentContent, 'utf-8');

      // 加载代理
      const agentRegistry = new AgentRegistry();
      await agentRegistry.loadAgents([agentsDir]);

      // 验证代理已加载
      const agent = agentRegistry.getAgent('code-reviewer');
      expect(agent).toBeDefined();
      expect(agent!.description).toBe('代码审查专家');
      expect(agent!.model).toBe('sonnet');
      expect(agent!.tools).toContain('read_file');
      expect(agent!.prompt).toContain('代码审查专家');
    });

    /**
     * 测试代理匹配
     *
     * **Validates: Requirements 7.3**
     */
    it('应该能够根据任务匹配代理', async () => {
      // 创建代理目录
      const agentsDir = path.join(tempDir, 'agents');
      await fs.mkdir(agentsDir, { recursive: true });

      // 创建代理文件 - 使用更明确的关键词
      // 注意：matchAgent 会提取描述中的中文词和长度 > 2 的英文词作为关键词
      // 然后检查任务描述是否包含这些关键词
      await fs.writeFile(
        path.join(agentsDir, 'translator.agent.md'),
        `---
description: translation expert
---
你是一个翻译专家。`,
        'utf-8'
      );

      // 加载代理
      const agentRegistry = new AgentRegistry();
      await agentRegistry.loadAgents([agentsDir]);

      // 测试匹配 - 使用描述中的英文关键词 "translation" 或 "expert"
      const matchedAgent = agentRegistry.matchAgent('I need translation help');
      expect(matchedAgent).toBe('translator');

      // 测试不匹配
      const noMatch = agentRegistry.matchAgent('请帮我写代码');
      expect(noMatch).toBeNull();
    });

    /**
     * 测试列出所有代理
     *
     * **Validates: Requirements 7.3**
     */
    it('应该能够列出所有代理', async () => {
      // 创建代理目录
      const agentsDir = path.join(tempDir, 'agents');
      await fs.mkdir(agentsDir, { recursive: true });

      // 创建多个代理
      await fs.writeFile(
        path.join(agentsDir, 'agent1.agent.md'),
        `---
description: 代理1
---
代理1提示词`,
        'utf-8'
      );

      await fs.writeFile(
        path.join(agentsDir, 'agent2.agent.md'),
        `---
description: 代理2
---
代理2提示词`,
        'utf-8'
      );

      // 加载代理
      const agentRegistry = new AgentRegistry();
      await agentRegistry.loadAgents([agentsDir]);

      // 列出代理
      const agentList = agentRegistry.listAgents();

      expect(agentList.length).toBe(2);
      const names = agentList.map((a) => a.name);
      expect(names).toContain('agent1');
      expect(names).toContain('agent2');
    });

    /**
     * 测试转换为 SDK 格式
     *
     * **Validates: Requirements 7.3**
     */
    it('应该能够转换为 SDK 格式', async () => {
      // 创建代理目录
      const agentsDir = path.join(tempDir, 'agents');
      await fs.mkdir(agentsDir, { recursive: true });

      // 创建代理文件
      await fs.writeFile(
        path.join(agentsDir, 'test.agent.md'),
        `---
description: 测试代理
model: haiku
tools:
  - bash
---
测试代理提示词`,
        'utf-8'
      );

      // 加载代理
      const agentRegistry = new AgentRegistry();
      await agentRegistry.loadAgents([agentsDir]);

      // 转换为 SDK 格式
      const sdkAgents = agentRegistry.getAgentsForSDK();

      expect(sdkAgents['test']).toBeDefined();
      expect(sdkAgents['test'].description).toBe('测试代理');
      expect(sdkAgents['test'].model).toBe('haiku');
      expect(sdkAgents['test'].tools).toContain('bash');
      expect(sdkAgents['test'].prompt).toBe('测试代理提示词');
    });
  });


  describe('钩子触发', () => {
    /**
     * 测试加载钩子配置
     *
     * **Validates: Requirements 7.4**
     */
    it('应该能够加载钩子配置', () => {
      const hookConfig: HookConfig = {
        PreToolUse: [
          {
            matcher: 'write_file',
            hooks: [
              {
                matcher: 'write_file',
                type: 'prompt',
                prompt: '请确认是否要写入文件',
              },
            ],
          },
        ],
        PostToolUse: [
          {
            matcher: '.*',
            hooks: [
              {
                matcher: '.*',
                type: 'command',
                command: 'echo "工具执行完成"',
              },
            ],
          },
        ],
      };

      const hookManager = new HookManager();
      hookManager.loadHooks(hookConfig);

      // 验证钩子已加载
      expect(hookManager.hasHooksForEvent('PreToolUse')).toBe(true);
      expect(hookManager.hasHooksForEvent('PostToolUse')).toBe(true);
      expect(hookManager.hasHooksForEvent('SessionStart')).toBe(false);
    });

    /**
     * 测试执行命令类型钩子
     *
     * **Validates: Requirements 7.4**
     */
    it('应该能够执行命令类型钩子', async () => {
      const hookManager = new HookManager({
        workingDir: tempDir,
      });

      const context: HookContext = {
        event: 'PostToolUse',
        tool: 'read_file',
      };

      // 执行命令钩子
      const result = await hookManager.executeCommand('echo "test output"', context);

      expect(result.success).toBe(true);
      expect(result.type).toBe('command');
      expect(result.output).toContain('test output');
    });

    /**
     * 测试执行提示词类型钩子
     *
     * **Validates: Requirements 7.4**
     */
    it('应该能够执行提示词类型钩子', async () => {
      let capturedPrompt = '';

      const hookManager = new HookManager({
        promptHandler: async (prompt) => {
          capturedPrompt = prompt;
        },
      });

      const context: HookContext = {
        event: 'PreToolUse',
        tool: 'write_file',
      };

      // 执行提示词钩子
      const result = await hookManager.executePrompt('请确认写入文件: $TOOL', context);

      expect(result.success).toBe(true);
      expect(result.type).toBe('prompt');
      expect(capturedPrompt).toContain('write_file');
    });

    /**
     * 测试钩子变量替换
     *
     * **Validates: Requirements 7.4**
     */
    it('应该能够替换钩子变量', () => {
      const hookManager = new HookManager();

      const context: HookContext = {
        event: 'PostToolUse',
        tool: 'read_file',
        args: { path: '/path/to/file.txt' },
        sessionId: 'session-123',
      };

      const template = '工具: $TOOL, 文件: $FILE, 会话: $SESSION_ID';
      const expanded = hookManager.expandVariables(template, context);

      expect(expanded).toBe('工具: read_file, 文件: /path/to/file.txt, 会话: session-123');
    });

    /**
     * 测试触发钩子事件
     *
     * **Validates: Requirements 7.4**
     */
    it('应该能够触发钩子事件', async () => {
      let hookExecuted = false;

      const hookManager = new HookManager({
        workingDir: tempDir,
        promptHandler: async () => {
          hookExecuted = true;
        },
      });

      hookManager.addHook('SessionStart', '.*', {
        matcher: '.*',
        type: 'prompt',
        prompt: '会话开始',
      });

      // 触发事件
      await hookManager.triggerEvent('SessionStart', {});

      expect(hookExecuted).toBe(true);
    });

    /**
     * 测试钩子匹配器
     *
     * **Validates: Requirements 7.4**
     */
    it('应该正确匹配钩子', async () => {
      const executedHooks: string[] = [];

      const hookManager = new HookManager({
        promptHandler: async (prompt) => {
          executedHooks.push(prompt);
        },
      });

      // 添加特定工具的钩子
      hookManager.addHook('PreToolUse', 'write_file', {
        matcher: 'write_file',
        type: 'prompt',
        prompt: 'write_file 钩子',
      });

      // 添加通配符钩子
      hookManager.addHook('PreToolUse', '.*', {
        matcher: '.*',
        type: 'prompt',
        prompt: '通配符钩子',
      });

      // 触发 write_file 工具
      await hookManager.triggerEvent('PreToolUse', { tool: 'write_file' });

      // 两个钩子都应该被执行
      expect(executedHooks).toContain('write_file 钩子');
      expect(executedHooks).toContain('通配符钩子');
    });
  });


  describe('扩展加载错误处理', () => {
    /**
     * 测试加载无效的技能文件
     *
     * **Validates: Requirements 7.5**
     */
    it('应该优雅处理无效的技能文件', async () => {
      // 创建技能目录
      const skillsDir = path.join(tempDir, 'skills');
      await fs.mkdir(skillsDir, { recursive: true });

      // 创建无效的技能文件（空文件）
      await fs.writeFile(path.join(skillsDir, 'invalid.skill.md'), '', 'utf-8');

      // 创建有效的技能文件
      await fs.writeFile(
        path.join(skillsDir, 'valid.skill.md'),
        `---
name: valid-skill
description: 有效技能
---
有效技能内容`,
        'utf-8'
      );

      // 加载技能（不应该抛出错误）
      const skillManager = new SkillManager();
      const skills = await skillManager.loadSkills([skillsDir]);

      // 只有有效的技能被加载
      expect(skills.length).toBe(1);
      expect(skills[0].name).toBe('valid-skill');
    });

    /**
     * 测试加载无效的命令文件
     *
     * **Validates: Requirements 7.5**
     */
    it('应该优雅处理无效的命令文件', async () => {
      // 创建命令目录
      const commandsDir = path.join(tempDir, 'commands');
      await fs.mkdir(commandsDir, { recursive: true });

      // 创建无效的命令文件（空文件）
      await fs.writeFile(path.join(commandsDir, 'invalid.md'), '', 'utf-8');

      // 创建有效的命令文件
      await fs.writeFile(
        path.join(commandsDir, 'valid.md'),
        `---
name: valid-command
description: 有效命令
---
有效命令内容`,
        'utf-8'
      );

      // 加载命令（不应该抛出错误）
      const commandManager = new CommandManager({
        userDirPrefix: tempDir,
      });
      const commands = await commandManager.loadCommands([commandsDir]);

      // 只有有效的命令被加载
      expect(commands.length).toBe(1);
      expect(commands[0].name).toBe('valid-command');
    });

    /**
     * 测试加载无效的代理文件
     *
     * **Validates: Requirements 7.5**
     */
    it('应该优雅处理无效的代理文件', async () => {
      // 创建代理目录
      const agentsDir = path.join(tempDir, 'agents');
      await fs.mkdir(agentsDir, { recursive: true });

      // 创建无效的代理文件（空文件）
      await fs.writeFile(path.join(agentsDir, 'invalid.agent.md'), '', 'utf-8');

      // 创建有效的代理文件
      await fs.writeFile(
        path.join(agentsDir, 'valid.agent.md'),
        `---
description: 有效代理
---
有效代理提示词`,
        'utf-8'
      );

      // 加载代理（不应该抛出错误）
      const agentRegistry = new AgentRegistry();
      await agentRegistry.loadAgents([agentsDir]);

      // 只有有效的代理被加载
      expect(agentRegistry.getAgentCount()).toBe(1);
      expect(agentRegistry.getAgent('valid')).toBeDefined();
    });

    /**
     * 测试加载不存在的目录
     *
     * **Validates: Requirements 7.5**
     */
    it('应该优雅处理不存在的目录', async () => {
      const nonExistentDir = path.join(tempDir, 'non-existent');

      // 加载技能（不应该抛出错误）
      const skillManager = new SkillManager();
      const skills = await skillManager.loadSkills([nonExistentDir]);
      expect(skills.length).toBe(0);

      // 加载命令（不应该抛出错误）
      const commandManager = new CommandManager({
        userDirPrefix: tempDir,
      });
      const commands = await commandManager.loadCommands([nonExistentDir]);
      expect(commands.length).toBe(0);

      // 加载代理（不应该抛出错误）
      const agentRegistry = new AgentRegistry();
      await agentRegistry.loadAgents([nonExistentDir]);
      expect(agentRegistry.getAgentCount()).toBe(0);
    });

    /**
     * 测试无效的钩子配置
     *
     * **Validates: Requirements 7.5**
     */
    it('应该验证无效的钩子配置', () => {
      const invalidConfig: HookConfig = {
        PreToolUse: [
          {
            matcher: 'test',
            hooks: [
              {
                matcher: 'test',
                type: 'command',
                // 缺少 command 字段
              },
            ],
          },
        ],
      };

      const validation = HookManager.validateConfig(invalidConfig);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    /**
     * 测试命令执行失败处理
     *
     * **Validates: Requirements 7.5**
     */
    it('应该优雅处理命令执行失败', async () => {
      const hookManager = new HookManager({
        workingDir: tempDir,
        commandTimeout: 1000,
      });

      const context: HookContext = {
        event: 'PostToolUse',
        tool: 'test',
      };

      // 执行不存在的命令
      const result = await hookManager.executeCommand('nonexistent_command_12345', context);

      expect(result.success).toBe(false);
      expect(result.type).toBe('command');
      expect(result.error).toBeDefined();
    });

    /**
     * 测试格式错误的 YAML frontmatter
     *
     * **Validates: Requirements 7.5**
     */
    it('应该优雅处理格式错误的 YAML frontmatter', async () => {
      // 创建技能目录
      const skillsDir = path.join(tempDir, 'skills');
      await fs.mkdir(skillsDir, { recursive: true });

      // 创建格式错误的技能文件
      await fs.writeFile(
        path.join(skillsDir, 'malformed.skill.md'),
        `---
name: malformed
description: 格式错误
  - 这不是有效的 YAML
---
内容`,
        'utf-8'
      );

      // 创建有效的技能文件
      await fs.writeFile(
        path.join(skillsDir, 'valid.skill.md'),
        `---
name: valid
description: 有效
---
有效内容`,
        'utf-8'
      );

      // 加载技能（不应该抛出错误）
      const skillManager = new SkillManager();
      const skills = await skillManager.loadSkills([skillsDir]);

      // 至少有效的技能应该被加载
      // 注意：格式错误的文件可能被部分解析或跳过
      expect(skills.length).toBeGreaterThanOrEqual(1);
    });
  });


  describe('使用 TestFixture 的扩展测试', () => {
    /**
     * 测试使用 TestFixture 创建扩展文件
     *
     * **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
     */
    it('应该能够使用 TestFixture 创建扩展文件', async () => {
      fixture = createTestFixture({
        extensions: {
          skills: [
            {
              name: 'fixture-skill',
              description: '夹具创建的技能',
              content: '技能内容',
            },
          ],
          commands: [
            {
              name: 'fixture-command',
              description: '夹具创建的命令',
              template: '命令模板 $ARGUMENTS',
            },
          ],
          agents: [
            {
              name: 'fixture-agent',
              description: '夹具创建的代理',
              prompt: '代理提示词',
            },
          ],
          hooks: {
            PreToolUse: [
              {
                matcher: '.*',
                hooks: [
                  {
                    matcher: '.*',
                    type: 'prompt',
                    prompt: '测试钩子',
                  },
                ],
              },
            ],
          },
        },
      });

      await fixture.setup();

      // 验证技能文件存在（注意文件名格式是 .skill.md）
      const skillExists = await fixture.fileExists('.claude-replica/skills/fixture-skill.skill.md');
      expect(skillExists).toBe(true);

      // 验证命令文件存在
      const commandExists = await fixture.fileExists('.claude-replica/commands/fixture-command.md');
      expect(commandExists).toBe(true);

      // 验证代理文件存在
      const agentExists = await fixture.fileExists('.claude-replica/agents/fixture-agent.agent.md');
      expect(agentExists).toBe(true);

      // 验证钩子配置存在
      const hooksExists = await fixture.fileExists('.claude-replica/hooks.json');
      expect(hooksExists).toBe(true);

      // 读取并验证钩子配置内容
      const hooksContent = await fixture.readFile('.claude-replica/hooks.json');
      const hooks = JSON.parse(hooksContent);
      expect(hooks.PreToolUse).toBeDefined();

      await fixture.teardown();
    });

    /**
     * 测试加载 TestFixture 创建的技能
     *
     * **Validates: Requirements 7.1**
     */
    it('应该能够加载 TestFixture 创建的技能', async () => {
      fixture = createTestFixture({
        extensions: {
          skills: [
            {
              name: 'loadable-skill',
              description: '可加载的技能',
              content: '这是技能的详细内容',
            },
          ],
        },
      });

      const context = await fixture.setup();

      // 加载技能
      const skillManager = new SkillManager();
      const skillsDir = path.join(context.configDir, 'skills');
      const skills = await skillManager.loadSkills([skillsDir]);

      // 验证技能已加载
      expect(skills.length).toBe(1);
      expect(skills[0].name).toBe('loadable-skill');
      expect(skills[0].description).toBe('可加载的技能');

      await fixture.teardown();
    });

    /**
     * 测试加载 TestFixture 创建的命令
     *
     * **Validates: Requirements 7.2**
     */
    it('应该能够加载 TestFixture 创建的命令', async () => {
      fixture = createTestFixture({
        extensions: {
          commands: [
            {
              name: 'loadable-command',
              description: '可加载的命令',
              template: '执行命令: $ARGUMENTS',
            },
          ],
        },
      });

      const context = await fixture.setup();

      // 加载命令
      const commandManager = new CommandManager({
        userDirPrefix: context.tempDir,
      });
      const commandsDir = path.join(context.configDir, 'commands');
      await commandManager.loadCommands([commandsDir]);

      // 验证命令已加载
      const command = commandManager.getCommand('loadable-command');
      expect(command).toBeDefined();
      expect(command!.description).toBe('可加载的命令');

      // 执行命令
      const result = await commandManager.executeCommand('loadable-command', '测试参数');
      expect(result.content).toContain('执行命令: 测试参数');

      await fixture.teardown();
    });

    /**
     * 测试加载 TestFixture 创建的代理
     *
     * **Validates: Requirements 7.3**
     */
    it('应该能够加载 TestFixture 创建的代理', async () => {
      fixture = createTestFixture({
        extensions: {
          agents: [
            {
              name: 'loadable-agent',
              description: '可加载的代理',
              prompt: '你是一个测试代理',
              tools: ['read_file'],
            },
          ],
        },
      });

      const context = await fixture.setup();

      // 加载代理
      const agentRegistry = new AgentRegistry();
      const agentsDir = path.join(context.configDir, 'agents');
      await agentRegistry.loadAgents([agentsDir]);

      // 验证代理已加载
      const agent = agentRegistry.getAgent('loadable-agent');
      expect(agent).toBeDefined();
      expect(agent!.description).toBe('可加载的代理');
      expect(agent!.prompt).toContain('测试代理');

      await fixture.teardown();
    });
  });
});
