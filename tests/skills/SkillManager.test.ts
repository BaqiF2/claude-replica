/**
 * SkillManager 属性测试
 *
 * **Feature: claude-code-replica, Property 3: 技能匹配的一致性**
 * **验证: 需求 8.2**
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SkillManager, Skill } from '../../src/skills/SkillManager';

describe('SkillManager', () => {
  let skillManager: SkillManager;
  let tempDir: string;

  beforeEach(async () => {
    skillManager = new SkillManager();
    // 创建临时目录用于测试
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-test-'));
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
   * 创建测试技能文件
   */
  async function createSkillFile(
    dir: string,
    filename: string,
    content: string
  ): Promise<string> {
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  describe('loadSkills', () => {
    it('应该从目录加载技能文件', async () => {
      const skillContent = `---
name: test-skill
description: 测试技能
triggers:
  - test
  - 测试
tools:
  - Read
  - Write
---

这是测试技能的内容。
`;
      await createSkillFile(tempDir, 'test.skill.md', skillContent);

      const skills = await skillManager.loadSkills([tempDir]);

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('test-skill');
      expect(skills[0].description).toBe('测试技能');
      expect(skills[0].triggers).toEqual(['test', '测试']);
      expect(skills[0].tools).toEqual(['Read', 'Write']);
      expect(skills[0].content).toBe('这是测试技能的内容。');
    });

    it('应该支持 SKILL.md 文件名格式', async () => {
      const subDir = path.join(tempDir, 'my-skill');
      await fs.mkdir(subDir);

      const skillContent = `---
description: 我的技能
---

技能内容
`;
      await createSkillFile(subDir, 'SKILL.md', skillContent);

      const skills = await skillManager.loadSkills([subDir]);

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('my-skill');
    });

    it('应该处理空目录', async () => {
      const skills = await skillManager.loadSkills([tempDir]);
      expect(skills).toHaveLength(0);
    });

    it('应该处理不存在的目录', async () => {
      const skills = await skillManager.loadSkills(['/nonexistent/path']);
      expect(skills).toHaveLength(0);
    });

    it('后加载的同名技能应覆盖先加载的', async () => {
      const dir1 = path.join(tempDir, 'dir1');
      const dir2 = path.join(tempDir, 'dir2');
      await fs.mkdir(dir1);
      await fs.mkdir(dir2);

      await createSkillFile(dir1, 'test.skill.md', `---
name: test
description: 第一个
---
内容1
`);

      await createSkillFile(dir2, 'test.skill.md', `---
name: test
description: 第二个
---
内容2
`);

      const skills = await skillManager.loadSkills([dir1, dir2]);

      expect(skills).toHaveLength(1);
      expect(skills[0].description).toBe('第二个');
      expect(skills[0].content).toBe('内容2');
    });
  });

  describe('matchSkills', () => {
    beforeEach(async () => {
      // 创建测试技能
      const skills: Skill[] = [
        {
          name: 'typescript-skill',
          description: 'TypeScript 开发技能',
          triggers: ['typescript', 'ts', '类型'],
          tools: ['Read', 'Write'],
          content: 'TypeScript 技能内容',
          metadata: {},
        },
        {
          name: 'react-skill',
          description: 'React 组件开发',
          triggers: ['react', 'component', '组件'],
          tools: ['Read', 'Write', 'Bash'],
          content: 'React 技能内容',
          metadata: {},
        },
        {
          name: 'testing-skill',
          description: '测试框架使用指南',
          triggers: ['jest', 'test', '测试'],
          tools: ['Read', 'Bash'],
          content: '测试技能内容',
          metadata: {},
        },
      ];

      // 直接设置技能（通过加载文件）
      for (const skill of skills) {
        const content = `---
name: ${skill.name}
description: ${skill.description}
triggers:
${skill.triggers?.map(t => `  - ${t}`).join('\n')}
tools:
${skill.tools?.map(t => `  - ${t}`).join('\n')}
---

${skill.content}
`;
        await createSkillFile(tempDir, `${skill.name}.skill.md`, content);
      }

      await skillManager.loadSkills([tempDir]);
    });

    /**
     * 属性 3: 技能匹配的一致性
     *
     * *对于任意*上下文字符串，如果上下文包含技能的触发器，
     * 则该技能应该被匹配
     */
    describe('Property 3: 技能匹配的一致性', () => {
      // 生成包含触发器的上下文
      const arbTrigger = fc.constantFrom(
        'typescript',
        'ts',
        '类型',
        'react',
        'component',
        '组件',
        'jest',
        'test',
        '测试'
      );

      const arbContextPrefix = fc.string({ minLength: 0, maxLength: 50 });
      const arbContextSuffix = fc.string({ minLength: 0, maxLength: 50 });

      it('包含触发器的上下文应该匹配对应技能', () => {
        fc.assert(
          fc.property(
            arbTrigger,
            arbContextPrefix,
            arbContextSuffix,
            (trigger, prefix, suffix) => {
              const context = `${prefix} ${trigger} ${suffix}`;
              const matched = skillManager.matchSkills(context);

              // 应该至少匹配一个技能
              expect(matched.length).toBeGreaterThan(0);

              // 匹配的技能应该包含该触发器
              const hasMatchingTrigger = matched.some(skill =>
                skill.triggers?.some(t =>
                  t.toLowerCase() === trigger.toLowerCase() ||
                  trigger.toLowerCase().includes(t.toLowerCase())
                )
              );

              expect(hasMatchingTrigger).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('相同上下文多次匹配应返回相同结果', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 100 }),
            (context) => {
              const result1 = skillManager.matchSkills(context);
              const result2 = skillManager.matchSkills(context);

              // 结果应该相同
              expect(result1.length).toBe(result2.length);
              expect(result1.map(s => s.name).sort()).toEqual(
                result2.map(s => s.name).sort()
              );
            }
          ),
          { numRuns: 100 }
        );
      });

      it('空上下文不应匹配任何技能', () => {
        fc.assert(
          fc.property(
            fc.constantFrom('', '   ', '\n', '\t'),
            (emptyContext) => {
              const matched = skillManager.matchSkills(emptyContext);
              expect(matched).toHaveLength(0);
            }
          ),
          { numRuns: 20 }
        );
      });

      it('匹配应该不区分大小写', () => {
        fc.assert(
          fc.property(
            arbTrigger,
            (trigger) => {
              const upperContext = trigger.toUpperCase();
              const lowerContext = trigger.toLowerCase();
              const mixedContext = trigger
                .split('')
                .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
                .join('');

              const upperMatched = skillManager.matchSkills(upperContext);
              const lowerMatched = skillManager.matchSkills(lowerContext);
              const mixedMatched = skillManager.matchSkills(mixedContext);

              // 所有大小写变体应该匹配相同数量的技能
              expect(upperMatched.length).toBe(lowerMatched.length);
              expect(lowerMatched.length).toBe(mixedMatched.length);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    it('应该通过触发器匹配技能', () => {
      const matched = skillManager.matchSkills('我想学习 typescript');

      expect(matched.length).toBeGreaterThan(0);
      expect(matched.some(s => s.name === 'typescript-skill')).toBe(true);
    });

    it('应该通过描述关键词匹配技能', () => {
      const matched = skillManager.matchSkills('开发一个组件');

      expect(matched.length).toBeGreaterThan(0);
      expect(matched.some(s => s.name === 'react-skill')).toBe(true);
    });

    it('应该支持正则表达式触发器', async () => {
      // 创建带正则触发器的技能
      await createSkillFile(tempDir, 'regex.skill.md', `---
name: regex-skill
description: 正则技能
triggers:
  - api
  - rest
---

正则技能内容
`);

      await skillManager.loadSkills([tempDir]);

      const matched = skillManager.matchSkills('创建一个 api 接口');
      expect(matched.some(s => s.name === 'regex-skill')).toBe(true);
    });
  });

  describe('applySkills', () => {
    it('应该将技能内容添加到系统提示词', () => {
      const skills: Skill[] = [
        {
          name: 'skill1',
          description: '技能1',
          content: '技能1内容',
          metadata: {},
        },
        {
          name: 'skill2',
          description: '技能2',
          content: '技能2内容',
          metadata: {},
        },
      ];

      const basePrompt = '基础提示词';
      const result = skillManager.applySkills(skills, basePrompt);

      expect(result).toContain('基础提示词');
      expect(result).toContain('## Skill: skill1');
      expect(result).toContain('技能1内容');
      expect(result).toContain('## Skill: skill2');
      expect(result).toContain('技能2内容');
    });

    it('空技能列表应返回原始提示词', () => {
      const basePrompt = '基础提示词';
      const result = skillManager.applySkills([], basePrompt);

      expect(result).toBe(basePrompt);
    });

    it('应该保持技能顺序', () => {
      const skills: Skill[] = [
        { name: 'a', description: '', content: 'A', metadata: {} },
        { name: 'b', description: '', content: 'B', metadata: {} },
        { name: 'c', description: '', content: 'C', metadata: {} },
      ];

      const result = skillManager.applySkills(skills, '');

      const indexA = result.indexOf('## Skill: a');
      const indexB = result.indexOf('## Skill: b');
      const indexC = result.indexOf('## Skill: c');

      expect(indexA).toBeLessThan(indexB);
      expect(indexB).toBeLessThan(indexC);
    });
  });

  describe('getSkillTools', () => {
    it('应该返回所有技能的工具列表（去重）', () => {
      const skills: Skill[] = [
        {
          name: 'skill1',
          description: '',
          tools: ['Read', 'Write', 'Bash'],
          content: '',
          metadata: {},
        },
        {
          name: 'skill2',
          description: '',
          tools: ['Read', 'Grep', 'Glob'],
          content: '',
          metadata: {},
        },
      ];

      const tools = skillManager.getSkillTools(skills);

      expect(tools).toContain('Read');
      expect(tools).toContain('Write');
      expect(tools).toContain('Bash');
      expect(tools).toContain('Grep');
      expect(tools).toContain('Glob');
      // 确保去重
      expect(tools.filter(t => t === 'Read')).toHaveLength(1);
    });

    it('没有工具的技能应返回空数组', () => {
      const skills: Skill[] = [
        { name: 'skill1', description: '', content: '', metadata: {} },
      ];

      const tools = skillManager.getSkillTools(skills);

      expect(tools).toHaveLength(0);
    });

    it('空技能列表应返回空数组', () => {
      const tools = skillManager.getSkillTools([]);
      expect(tools).toHaveLength(0);
    });
  });

  describe('getDefaultSkillDirectories', () => {
    it('应该返回用户级和项目级目录', () => {
      const workingDir = '/project';
      const dirs = skillManager.getDefaultSkillDirectories(workingDir);

      expect(dirs).toContain(path.join(os.homedir(), '.claude', 'skills'));
      expect(dirs).toContain(path.join(workingDir, '.claude', 'skills'));
      expect(dirs).toContain(path.join(workingDir, 'skills'));
    });
  });

  describe('YAML frontmatter 解析', () => {
    it('应该解析带引号的字符串值', async () => {
      await createSkillFile(tempDir, 'quoted.skill.md', `---
name: "quoted-name"
description: 'single quoted'
---

内容
`);

      const skills = await skillManager.loadSkills([tempDir]);

      expect(skills[0].name).toBe('quoted-name');
      expect(skills[0].description).toBe('single quoted');
    });

    it('应该解析布尔值', async () => {
      await createSkillFile(tempDir, 'bool.skill.md', `---
name: bool-skill
description: 布尔测试
enabled: true
disabled: false
---

内容
`);

      const skills = await skillManager.loadSkills([tempDir]);

      expect(skills[0].metadata.enabled).toBe(true);
      expect(skills[0].metadata.disabled).toBe(false);
    });

    it('应该解析数字值', async () => {
      await createSkillFile(tempDir, 'num.skill.md', `---
name: num-skill
description: 数字测试
priority: 10
weight: 0.5
---

内容
`);

      const skills = await skillManager.loadSkills([tempDir]);

      expect(skills[0].metadata.priority).toBe(10);
      expect(skills[0].metadata.weight).toBe(0.5);
    });

    it('应该处理没有 frontmatter 的文件', async () => {
      await createSkillFile(tempDir, 'no-fm.skill.md', `这是没有 frontmatter 的技能内容`);

      const skills = await skillManager.loadSkills([tempDir]);

      expect(skills[0].name).toBe('no-fm');
      expect(skills[0].content).toBe('这是没有 frontmatter 的技能内容');
    });
  });
});
