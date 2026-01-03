/**
 * 测试夹具属性测试
 *
 * 使用 fast-check 进行属性测试，验证 TestFixture 的正确性
 *
 * **Property 13: Fixture Lifecycle**
 * **Property 14: Fixture File Creation**
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
 */

import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import {
  createTestFixture,
  SkillDefinition,
  CommandDefinition,
  AgentDefinitionFixture,
} from '../../src/testing/TestFixture';

describe('TestFixture Property Tests', () => {
  /**
   * Property 13: Fixture Lifecycle
   *
   * *For any* TestFixture, after `setup()` the temp directory should exist
   * and be writable; after `teardown()` the temp directory should be removed.
   *
   * **Validates: Requirements 5.1, 5.4**
   */
  describe('Property 13: Fixture Lifecycle', () => {
    // 生成随机的临时目录前缀
    const prefixArb = fc
      .string({ minLength: 1, maxLength: 20 })
      .filter((s) => /^[a-zA-Z0-9-_]+$/.test(s))
      .map((s) => `test-${s}-`);

    it('setup() 后临时目录应该存在且可写', async () => {
      await fc.assert(
        fc.asyncProperty(prefixArb, async (prefix) => {
          const fixture = createTestFixture({ tempDirPrefix: prefix });
          let tempDir: string | null = null;

          try {
            const context = await fixture.setup();
            tempDir = context.tempDir;

            // 验证目录存在
            const stats = await fs.promises.stat(tempDir);
            expect(stats.isDirectory()).toBe(true);

            // 验证目录可写（通过创建测试文件）
            const testFile = path.join(tempDir, 'write-test.txt');
            await fs.promises.writeFile(testFile, 'test');
            const content = await fs.promises.readFile(testFile, 'utf-8');
            expect(content).toBe('test');
          } finally {
            await fixture.teardown();
          }
        }),
        { numRuns: 10 } // 减少运行次数以避免创建过多临时目录
      );
    });

    it('teardown() 后临时目录应该被删除', async () => {
      await fc.assert(
        fc.asyncProperty(prefixArb, async (prefix) => {
          const fixture = createTestFixture({ tempDirPrefix: prefix });

          const context = await fixture.setup();
          const tempDir = context.tempDir;

          // 验证目录存在
          expect(fs.existsSync(tempDir)).toBe(true);

          await fixture.teardown();

          // 验证目录已删除
          expect(fs.existsSync(tempDir)).toBe(false);
        }),
        { numRuns: 10 }
      );
    });

    it('setup() 应该创建配置目录和会话目录', async () => {
      await fc.assert(
        fc.asyncProperty(prefixArb, async (prefix) => {
          const fixture = createTestFixture({ tempDirPrefix: prefix });

          try {
            const context = await fixture.setup();

            // 验证配置目录存在
            expect(fs.existsSync(context.configDir)).toBe(true);
            expect((await fs.promises.stat(context.configDir)).isDirectory()).toBe(true);

            // 验证会话目录存在
            expect(fs.existsSync(context.sessionsDir)).toBe(true);
            expect((await fs.promises.stat(context.sessionsDir)).isDirectory()).toBe(true);
          } finally {
            await fixture.teardown();
          }
        }),
        { numRuns: 10 }
      );
    });

    it('多次 setup/teardown 循环应该正常工作', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 2, max: 5 }), async (cycles) => {
          const fixture = createTestFixture();

          for (let i = 0; i < cycles; i++) {
            const context = await fixture.setup();
            expect(fs.existsSync(context.tempDir)).toBe(true);
            await fixture.teardown();
            expect(fs.existsSync(context.tempDir)).toBe(false);
          }
        }),
        { numRuns: 5 }
      );
    });
  });

  /**
   * Property 14: Fixture File Creation
   *
   * *For any* file specification in FixtureOptions, the corresponding file
   * should be created with the exact content specified.
   *
   * **Validates: Requirements 5.2, 5.3, 5.5**
   */
  describe('Property 14: Fixture File Creation', () => {
    // 生成有效的文件名
    const fileNameArb = fc
      .string({ minLength: 1, maxLength: 20 })
      .filter((s) => /^[a-zA-Z0-9-_]+$/.test(s));

    // 生成文件内容
    const contentArb = fc.string({ minLength: 0, maxLength: 1000 });

    // 生成相对路径
    const relativePathArb = fc
      .array(fileNameArb, { minLength: 1, maxLength: 3 })
      .map((parts) => parts.join('/') + '.txt');

    it('createFile() 应该创建具有正确内容的文件', async () => {
      await fc.assert(
        fc.asyncProperty(relativePathArb, contentArb, async (relativePath, content) => {
          const fixture = createTestFixture();

          try {
            await fixture.setup();
            await fixture.createFile(relativePath, content);

            // 验证文件存在且内容正确
            const readContent = await fixture.readFile(relativePath);
            expect(readContent).toBe(content);
          } finally {
            await fixture.teardown();
          }
        }),
        { numRuns: 20 }
      );
    });

    it('createFile() 应该自动创建父目录', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fileNameArb, { minLength: 2, maxLength: 4 }),
          contentArb,
          async (pathParts, content) => {
            const fixture = createTestFixture();
            const relativePath = pathParts.join('/') + '.txt';

            try {
              await fixture.setup();
              await fixture.createFile(relativePath, content);

              // 验证文件存在
              const exists = await fixture.fileExists(relativePath);
              expect(exists).toBe(true);

              // 验证内容正确
              const readContent = await fixture.readFile(relativePath);
              expect(readContent).toBe(content);
            } finally {
              await fixture.teardown();
            }
          }
        ),
        { numRuns: 15 }
      );
    });

    it('通过 mocks.filesystem 创建的文件应该具有正确内容', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.dictionary(relativePathArb, contentArb, { minKeys: 1, maxKeys: 5 }),
          async (filesystem) => {
            const fixture = createTestFixture({
              mocks: { filesystem },
            });

            try {
              await fixture.setup();

              // 验证所有文件都被创建且内容正确
              for (const [relativePath, expectedContent] of Object.entries(filesystem)) {
                const exists = await fixture.fileExists(relativePath);
                expect(exists).toBe(true);

                const actualContent = await fixture.readFile(relativePath);
                expect(actualContent).toBe(expectedContent);
              }
            } finally {
              await fixture.teardown();
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    // 生成技能定义
    const skillArb: fc.Arbitrary<SkillDefinition> = fc.record({
      name: fileNameArb,
      description: fc.option(contentArb, { nil: undefined }),
      content: contentArb,
    });

    it('技能文件应该被正确创建', async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(skillArb, { minLength: 1, maxLength: 3 }), async (skills) => {
          const fixture = createTestFixture({
            extensions: { skills },
          });

          try {
            const context = await fixture.setup();

            // 验证每个技能文件都被创建
            for (const skill of skills) {
              const skillPath = path.join(context.configDir, 'skills', `${skill.name}.skill.md`);
              expect(fs.existsSync(skillPath)).toBe(true);

              // 验证文件内容包含技能内容
              const content = await fs.promises.readFile(skillPath, 'utf-8');
              expect(content).toContain(skill.content);
            }
          } finally {
            await fixture.teardown();
          }
        }),
        { numRuns: 10 }
      );
    });

    // 生成命令定义
    const commandArb: fc.Arbitrary<CommandDefinition> = fc.record({
      name: fileNameArb,
      description: fc.option(contentArb, { nil: undefined }),
      template: contentArb,
    });

    it('命令文件应该被正确创建', async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(commandArb, { minLength: 1, maxLength: 3 }), async (commands) => {
          const fixture = createTestFixture({
            extensions: { commands },
          });

          try {
            const context = await fixture.setup();

            // 验证每个命令文件都被创建
            for (const command of commands) {
              const commandPath = path.join(context.configDir, 'commands', `${command.name}.md`);
              expect(fs.existsSync(commandPath)).toBe(true);

              // 验证文件内容包含命令模板
              const content = await fs.promises.readFile(commandPath, 'utf-8');
              expect(content).toContain(command.template);
            }
          } finally {
            await fixture.teardown();
          }
        }),
        { numRuns: 10 }
      );
    });

    // 生成代理定义
    const agentArb: fc.Arbitrary<AgentDefinitionFixture> = fc.record({
      name: fileNameArb,
      description: contentArb,
      prompt: contentArb,
      tools: fc.option(fc.array(fileNameArb, { minLength: 0, maxLength: 5 }), { nil: undefined }),
    });

    it('代理文件应该被正确创建', async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(agentArb, { minLength: 1, maxLength: 3 }), async (agents) => {
          const fixture = createTestFixture({
            extensions: { agents },
          });

          try {
            const context = await fixture.setup();

            // 验证每个代理文件都被创建
            for (const agent of agents) {
              const agentPath = path.join(context.configDir, 'agents', `${agent.name}.agent.md`);
              expect(fs.existsSync(agentPath)).toBe(true);

              // 验证文件内容包含代理信息
              const content = await fs.promises.readFile(agentPath, 'utf-8');
              expect(content).toContain(agent.description);
              // 只在prompt非空时验证包含prompt
              if (agent.prompt) {
                expect(content).toContain(agent.prompt);
              }
            }
          } finally {
            await fixture.teardown();
          }
        }),
        { numRuns: 10 }
      );
    });
  });

  /**
   * 环境变量属性测试
   *
   * **Validates: Requirements 5.5**
   */
  describe('Environment Variable Properties', () => {
    // 生成有效的环境变量名
    const envKeyArb = fc
      .string({ minLength: 1, maxLength: 20 })
      .filter((s) => /^[A-Z][A-Z0-9_]*$/.test(s))
      .map((s) => `TEST_${s}`);

    // 生成环境变量值
    const envValueArb = fc.string({ minLength: 0, maxLength: 100 });

    it('setEnv() 应该设置环境变量', async () => {
      await fc.assert(
        fc.asyncProperty(envKeyArb, envValueArb, async (key, value) => {
          const fixture = createTestFixture();

          try {
            await fixture.setup();

            // 保存原始值
            const originalValue = process.env[key];

            fixture.setEnv(key, value);
            expect(process.env[key]).toBe(value);

            fixture.restoreEnv();

            // 验证恢复到原始值
            if (originalValue === undefined) {
              expect(process.env[key]).toBeUndefined();
            } else {
              expect(process.env[key]).toBe(originalValue);
            }
          } finally {
            await fixture.teardown();
          }
        }),
        { numRuns: 20 }
      );
    });

    it('通过 options.env 设置的环境变量应该在 setup 后生效', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.dictionary(envKeyArb, envValueArb, { minKeys: 1, maxKeys: 5 }),
          async (env) => {
            const fixture = createTestFixture({ env });

            // 保存原始值
            const originalValues: Record<string, string | undefined> = {};
            for (const key of Object.keys(env)) {
              originalValues[key] = process.env[key];
            }

            try {
              await fixture.setup();

              // 验证所有环境变量都被设置
              for (const [key, value] of Object.entries(env)) {
                expect(process.env[key]).toBe(value);
              }
            } finally {
              await fixture.teardown();

              // 验证环境变量被恢复
              for (const [key, originalValue] of Object.entries(originalValues)) {
                if (originalValue === undefined) {
                  expect(process.env[key]).toBeUndefined();
                } else {
                  expect(process.env[key]).toBe(originalValue);
                }
              }
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
