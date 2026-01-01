/**
 * AgentRegistry 属性测试
 *
 * **Feature: claude-code-replica, Property 8: 子代理上下文的隔离性**
 * **验证: 需求 10.5**
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { AgentRegistry, AgentDefinition } from '../../src/agents/AgentRegistry';

describe('AgentRegistry', () => {
  let agentRegistry: AgentRegistry;
  let tempDir: string;

  beforeEach(async () => {
    agentRegistry = new AgentRegistry();
    // 创建临时目录用于测试
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-test-'));
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
   * 创建测试代理文件
   */
  async function createAgentFile(
    dir: string,
    filename: string,
    content: string
  ): Promise<string> {
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  describe('loadAgents', () => {
    it('应该从目录加载代理文件', async () => {
      const agentContent = `---
description: 代码审查专家
model: sonnet
tools:
  - Read
  - Grep
---

你是专家代码审查员,关注安全性和性能。
`;
      await createAgentFile(tempDir, 'code-review.agent.md', agentContent);

      await agentRegistry.loadAgents([tempDir]);

      const agent = agentRegistry.getAgent('code-review');
      expect(agent).toBeDefined();
      expect(agent?.description).toBe('代码审查专家');
      expect(agent?.model).toBe('sonnet');
      expect(agent?.tools).toEqual(['Read', 'Grep']);
      expect(agent?.prompt).toBe('你是专家代码审查员,关注安全性和性能。');
    });

    it('应该支持 AGENT.md 文件名格式', async () => {
      const subDir = path.join(tempDir, 'my-agent');
      await fs.mkdir(subDir);

      const agentContent = `---
description: 我的代理
---

代理提示词
`;
      await createAgentFile(subDir, 'AGENT.md', agentContent);

      await agentRegistry.loadAgents([tempDir]);

      const agent = agentRegistry.getAgent('my-agent');
      expect(agent).toBeDefined();
      expect(agent?.description).toBe('我的代理');
    });

    it('应该处理空目录', async () => {
      await agentRegistry.loadAgents([tempDir]);
      expect(agentRegistry.getAgentCount()).toBe(0);
    });

    it('应该处理不存在的目录', async () => {
      await agentRegistry.loadAgents(['/nonexistent/path']);
      expect(agentRegistry.getAgentCount()).toBe(0);
    });

    it('后加载的同名代理应覆盖先加载的', async () => {
      const dir1 = path.join(tempDir, 'dir1');
      const dir2 = path.join(tempDir, 'dir2');
      await fs.mkdir(dir1);
      await fs.mkdir(dir2);

      await createAgentFile(dir1, 'test.agent.md', `---
description: 第一个代理
model: haiku
---
提示词1
`);

      await createAgentFile(dir2, 'test.agent.md', `---
description: 第二个代理
model: opus
---
提示词2
`);

      await agentRegistry.loadAgents([dir1, dir2]);

      const agent = agentRegistry.getAgent('test');
      expect(agent?.description).toBe('第二个代理');
      expect(agent?.model).toBe('opus');
      expect(agent?.prompt).toBe('提示词2');
    });

    it('应该默认使用 inherit 模型', async () => {
      await createAgentFile(tempDir, 'default.agent.md', `---
description: 默认模型代理
---
提示词
`);

      await agentRegistry.loadAgents([tempDir]);

      const agent = agentRegistry.getAgent('default');
      expect(agent?.model).toBe('inherit');
    });
  });

  describe('getAgent', () => {
    it('应该返回指定名称的代理', async () => {
      await createAgentFile(tempDir, 'test.agent.md', `---
description: 测试代理
---
测试提示词
`);

      await agentRegistry.loadAgents([tempDir]);

      const agent = agentRegistry.getAgent('test');
      expect(agent).toBeDefined();
      expect(agent?.description).toBe('测试代理');
    });

    it('不存在的代理应返回 undefined', async () => {
      await agentRegistry.loadAgents([tempDir]);

      const agent = agentRegistry.getAgent('nonexistent');
      expect(agent).toBeUndefined();
    });
  });

  describe('listAgents', () => {
    it('应该列出所有代理', async () => {
      await createAgentFile(tempDir, 'agent1.agent.md', `---
description: 代理1描述
---
提示词1
`);

      await createAgentFile(tempDir, 'agent2.agent.md', `---
description: 代理2描述
---
提示词2
`);

      await agentRegistry.loadAgents([tempDir]);

      const agents = agentRegistry.listAgents();
      expect(agents).toHaveLength(2);
      expect(agents.map(a => a.name).sort()).toEqual(['agent1', 'agent2']);
      expect(agents.find(a => a.name === 'agent1')?.description).toBe('代理1描述');
      expect(agents.find(a => a.name === 'agent2')?.description).toBe('代理2描述');
    });

    it('空注册表应返回空数组', async () => {
      const agents = agentRegistry.listAgents();
      expect(agents).toHaveLength(0);
    });
  });

  describe('matchAgent', () => {
    beforeEach(async () => {
      // 创建测试代理
      await createAgentFile(tempDir, 'code-review.agent.md', `---
description: 代码审查专家 review security
---
代码审查提示词
`);

      await createAgentFile(tempDir, 'test-writer.agent.md', `---
description: 测试编写专家 unittest integration
---
测试编写提示词
`);

      await createAgentFile(tempDir, 'doc-writer.agent.md', `---
description: 文档编写专家 documentation guide
---
文档编写提示词
`);

      await agentRegistry.loadAgents([tempDir]);
    });

    it('应该根据任务描述匹配代理', () => {
      const matched = agentRegistry.matchAgent('请帮我 review 这段代码');
      expect(matched).toBe('code-review');
    });

    it('应该匹配测试相关任务', () => {
      const matched = agentRegistry.matchAgent('编写 unittest');
      expect(matched).toBe('test-writer');
    });

    it('应该匹配文档相关任务', () => {
      const matched = agentRegistry.matchAgent('生成 documentation');
      expect(matched).toBe('doc-writer');
    });

    it('空任务描述应返回 null', () => {
      const matched = agentRegistry.matchAgent('');
      expect(matched).toBeNull();
    });

    it('不匹配任何代理时应返回 null', () => {
      const matched = agentRegistry.matchAgent('xyz abc 123');
      expect(matched).toBeNull();
    });
  });

  describe('getAgentsForSDK', () => {
    it('应该转换为 SDK 格式', async () => {
      await createAgentFile(tempDir, 'test.agent.md', `---
description: 测试代理
model: sonnet
tools:
  - Read
  - Write
---
测试提示词
`);

      await agentRegistry.loadAgents([tempDir]);

      const sdkAgents = agentRegistry.getAgentsForSDK();

      expect(sdkAgents['test']).toBeDefined();
      expect(sdkAgents['test'].description).toBe('测试代理');
      expect(sdkAgents['test'].model).toBe('sonnet');
      expect(sdkAgents['test'].tools).toEqual(['Read', 'Write']);
      expect(sdkAgents['test'].prompt).toBe('测试提示词');
    });

    it('空注册表应返回空对象', () => {
      const sdkAgents = agentRegistry.getAgentsForSDK();
      expect(Object.keys(sdkAgents)).toHaveLength(0);
    });

    /**
     * 属性 8: 子代理上下文的隔离性
     *
     * *对于任意*子代理执行的任务,其上下文应该与主会话隔离,不影响主会话的上下文窗口。
     *
     * 在 AgentRegistry 层面,我们验证:
     * 1. 每个代理都有独立的配置（prompt、tools、model）
     * 2. 转换为 SDK 格式时,每个代理的配置是独立的
     * 3. 修改一个代理的 SDK 配置不会影响其他代理
     */
    describe('Property 8: 子代理上下文的隔离性', () => {
      // 生成有效的代理名称
      const arbAgentName = fc.string({ minLength: 1, maxLength: 20 })
        .filter(s => /^[a-zA-Z][a-zA-Z0-9-]*$/.test(s));

      // 生成有效的描述（不包含特殊字符）
      const arbDescription = fc.string({ minLength: 3, maxLength: 50 })
        .filter(s => s.trim().length >= 3 && !/['":\n\r]/.test(s))
        .map(s => s.trim());

      // 生成有效的提示词（不包含特殊字符）
      const arbPrompt = fc.string({ minLength: 3, maxLength: 100 })
        .filter(s => s.trim().length >= 3 && !/^---/.test(s))
        .map(s => s.trim());

      // 生成有效的模型
      const arbModel = fc.constantFrom('sonnet', 'opus', 'haiku', 'inherit') as fc.Arbitrary<'sonnet' | 'opus' | 'haiku' | 'inherit'>;

      // 生成有效的工具列表
      const arbTools = fc.array(
        fc.constantFrom('Read', 'Write', 'Bash', 'Grep', 'Glob'),
        { minLength: 0, maxLength: 5 }
      );

      // 生成代理配置
      const arbAgentConfig = fc.record({
        name: arbAgentName,
        description: arbDescription,
        prompt: arbPrompt,
        model: arbModel,
        tools: arbTools,
      });

      it('每个代理的 SDK 配置应该是独立的副本', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(arbAgentConfig, { minLength: 2, maxLength: 5 }),
            async (configs) => {
              // 确保名称唯一
              const uniqueConfigs = configs.reduce((acc, config, index) => {
                const uniqueName = `${config.name}-${index}`;
                acc.push({ ...config, name: uniqueName });
                return acc;
              }, [] as typeof configs);

              // 创建代理文件
              for (const config of uniqueConfigs) {
                const toolsYaml = config.tools.length > 0
                  ? `tools:\n${config.tools.map(t => `  - ${t}`).join('\n')}`
                  : '';
                const content = `---
description: ${config.description}
model: ${config.model}
${toolsYaml}
---

${config.prompt}
`;
                await createAgentFile(tempDir, `${config.name}.agent.md`, content);
              }

              await agentRegistry.loadAgents([tempDir]);
              const sdkAgents = agentRegistry.getAgentsForSDK();

              // 验证每个代理的配置是独立的
              for (const config of uniqueConfigs) {
                const sdkAgent = sdkAgents[config.name];
                expect(sdkAgent).toBeDefined();
                expect(sdkAgent.description).toBe(config.description);
                expect(sdkAgent.model).toBe(config.model);
                expect(sdkAgent.prompt).toBe(config.prompt);
              }

              // 验证修改一个代理的配置不会影响其他代理
              const agentNames = Object.keys(sdkAgents);
              if (agentNames.length >= 2) {
                const firstAgent = sdkAgents[agentNames[0]];
                const secondAgent = sdkAgents[agentNames[1]];

                // 保存原始值
                const originalFirstPrompt = firstAgent.prompt;
                const originalSecondPrompt = secondAgent.prompt;

                // 修改第一个代理的配置
                firstAgent.prompt = 'modified prompt';

                // 验证第二个代理的配置没有被影响
                expect(secondAgent.prompt).toBe(originalSecondPrompt);
                expect(secondAgent.prompt).not.toBe('modified prompt');

                // 恢复原始值
                firstAgent.prompt = originalFirstPrompt;
              }

              // 清理
              agentRegistry.clear();
              for (const config of uniqueConfigs) {
                try {
                  await fs.unlink(path.join(tempDir, `${config.name}.agent.md`));
                } catch {
                  // 忽略删除错误
                }
              }

              return true;
            }
          ),
          { numRuns: 100 }
        );
      });

      it('代理的工具列表应该是独立的', async () => {
        await fc.assert(
          fc.asyncProperty(
            arbTools,
            arbTools,
            async (tools1, tools2) => {
              // 创建两个代理
              await createAgentFile(tempDir, 'agent1.agent.md', `---
description: 代理1
tools:
${tools1.map(t => `  - ${t}`).join('\n')}
---
提示词1
`);

              await createAgentFile(tempDir, 'agent2.agent.md', `---
description: 代理2
tools:
${tools2.map(t => `  - ${t}`).join('\n')}
---
提示词2
`);

              await agentRegistry.loadAgents([tempDir]);
              const sdkAgents = agentRegistry.getAgentsForSDK();

              // 验证工具列表是独立的
              const agent1Tools = sdkAgents['agent1']?.tools || [];
              const agent2Tools = sdkAgents['agent2']?.tools || [];

              // 修改 agent1 的工具列表不应影响 agent2
              if (agent1Tools.length > 0) {
                const originalAgent2Tools = [...agent2Tools];
                agent1Tools.push('NewTool');

                expect(sdkAgents['agent2']?.tools || []).toEqual(originalAgent2Tools);
              }

              // 清理
              agentRegistry.clear();
              await fs.unlink(path.join(tempDir, 'agent1.agent.md'));
              await fs.unlink(path.join(tempDir, 'agent2.agent.md'));

              return true;
            }
          ),
          { numRuns: 100 }
        );
      });

      it('多次调用 getAgentsForSDK 应返回独立的对象', async () => {
        await createAgentFile(tempDir, 'test.agent.md', `---
description: 测试代理
model: sonnet
---
测试提示词
`);

        await agentRegistry.loadAgents([tempDir]);

        fc.assert(
          fc.property(
            fc.integer({ min: 2, max: 10 }),
            (callCount) => {
              const results: Record<string, AgentDefinition>[] = [];

              for (let i = 0; i < callCount; i++) {
                results.push(agentRegistry.getAgentsForSDK());
              }

              // 验证每次调用返回的对象是独立的
              for (let i = 0; i < results.length - 1; i++) {
                // 修改一个结果不应影响其他结果
                const originalPrompt = results[i + 1]['test']?.prompt;
                results[i]['test'].prompt = 'modified';

                expect(results[i + 1]['test']?.prompt).toBe(originalPrompt);
              }

              return true;
            }
          ),
          { numRuns: 100 }
        );
      });
    });
  });

  describe('getDefaultAgentDirectories', () => {
    it('应该返回用户级和项目级目录', () => {
      const workingDir = '/project';
      const dirs = agentRegistry.getDefaultAgentDirectories(workingDir);

      expect(dirs).toContain(path.join(os.homedir(), '.claude', 'agents'));
      expect(dirs).toContain(path.join(workingDir, '.claude', 'agents'));
      expect(dirs).toContain(path.join(workingDir, 'agents'));
    });
  });

  describe('YAML frontmatter 解析', () => {
    it('应该解析带引号的字符串值', async () => {
      await createAgentFile(tempDir, 'quoted.agent.md', `---
description: "quoted description"
---

内容
`);

      await agentRegistry.loadAgents([tempDir]);

      const agent = agentRegistry.getAgent('quoted');
      expect(agent?.description).toBe('quoted description');
    });

    it('应该处理没有 frontmatter 的文件', async () => {
      await createAgentFile(tempDir, 'no-fm.agent.md', `这是没有 frontmatter 的代理内容`);

      await agentRegistry.loadAgents([tempDir]);

      const agent = agentRegistry.getAgent('no-fm');
      expect(agent?.prompt).toBe('这是没有 frontmatter 的代理内容');
    });

    it('应该提取额外的元数据', async () => {
      await createAgentFile(tempDir, 'meta.agent.md', `---
description: 带元数据的代理
author: test-author
version: 1.0.0
---

代理内容
`);

      await agentRegistry.loadAgents([tempDir]);

      const agent = agentRegistry.getAgent('meta');
      expect(agent?.metadata?.author).toBe('test-author');
      expect(agent?.metadata?.version).toBe('1.0.0');
    });
  });

  describe('clear', () => {
    it('应该清除所有已加载的代理', async () => {
      await createAgentFile(tempDir, 'test.agent.md', `---
description: 测试代理
---
提示词
`);

      await agentRegistry.loadAgents([tempDir]);
      expect(agentRegistry.getAgentCount()).toBe(1);

      agentRegistry.clear();
      expect(agentRegistry.getAgentCount()).toBe(0);
    });
  });
});
