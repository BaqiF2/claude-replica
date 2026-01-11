/**
 * SDKConfigLoader 属性测试
 * 
 * **Feature: claude-code-replica, Property 1: 配置合并的优先级**
 * **验证: 需求 7.3**
 */

import * as fc from 'fast-check';
import { SDKConfigLoader, UserConfig } from '../../src/config/SDKConfigLoader';

describe('SDKConfigLoader', () => {
  let loader: SDKConfigLoader;

  beforeEach(() => {
    loader = new SDKConfigLoader();
  });

  describe('mergeConfigs', () => {
    /**
     * 属性 1: 配置合并的优先级
     * 
     * *对于任意*用户配置、项目配置，合并后的配置应该遵循优先级规则:
     * 项目配置覆盖用户配置
     */
    describe('Property 1: 配置合并的优先级', () => {
      // 生成配置的 Arbitrary
      const arbConfig = fc.record({
        model: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
        maxTurns: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
        maxBudgetUsd: fc.option(fc.float({ min: 0, max: 100, noNaN: true }), { nil: undefined }),
        maxThinkingTokens: fc.option(fc.integer({ min: 100, max: 10000 }), { nil: undefined }),
        permissionMode: fc.option(
          fc.constantFrom('default', 'acceptEdits', 'bypassPermissions', 'plan') as fc.Arbitrary<'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'>,
          { nil: undefined }
        ),
        allowedTools: fc.option(
          fc.array(fc.constantFrom('Read', 'Write', 'Edit', 'Bash', 'Grep')),
          { nil: undefined }
        ),
        disallowedTools: fc.option(
          fc.array(fc.constantFrom('WebFetch', 'WebSearch', 'NotebookEdit')),
          { nil: undefined }
        ),
      });

      it('项目配置的基本字段应覆盖用户配置', () => {
        fc.assert(
          fc.property(arbConfig, arbConfig, (userConfig, projectConfig) => {
            const merged = loader.mergeConfigs(userConfig, projectConfig);

            // 如果项目配置有值，应该使用项目配置
            if (projectConfig.model !== undefined) {
              expect(merged.model).toBe(projectConfig.model);
            } else {
              expect(merged.model).toBe(userConfig.model);
            }

            if (projectConfig.maxTurns !== undefined) {
              expect(merged.maxTurns).toBe(projectConfig.maxTurns);
            } else {
              expect(merged.maxTurns).toBe(userConfig.maxTurns);
            }

            if (projectConfig.maxBudgetUsd !== undefined) {
              expect(merged.maxBudgetUsd).toBe(projectConfig.maxBudgetUsd);
            } else {
              expect(merged.maxBudgetUsd).toBe(userConfig.maxBudgetUsd);
            }

            if (projectConfig.permissionMode !== undefined) {
              expect(merged.permissionMode).toBe(projectConfig.permissionMode);
            } else {
              expect(merged.permissionMode).toBe(userConfig.permissionMode);
            }
          }),
          { numRuns: 100 }
        );
      });

      it('allowedTools 应使用项目配置优先', () => {
        fc.assert(
          fc.property(arbConfig, arbConfig, (userConfig, projectConfig) => {
            const merged = loader.mergeConfigs(userConfig, projectConfig);

            if (projectConfig.allowedTools !== undefined) {
              expect(merged.allowedTools).toEqual(projectConfig.allowedTools);
            } else {
              expect(merged.allowedTools).toEqual(userConfig.allowedTools);
            }
          }),
          { numRuns: 100 }
        );
      });

      it('disallowedTools 应合并两个配置', () => {
        fc.assert(
          fc.property(arbConfig, arbConfig, (userConfig, projectConfig) => {
            const merged = loader.mergeConfigs(userConfig, projectConfig);

            // 如果两者都没有，结果应该是 undefined
            if (!userConfig.disallowedTools && !projectConfig.disallowedTools) {
              expect(merged.disallowedTools).toBeUndefined();
              return;
            }

            // 合并后应包含两者的所有工具（去重）
            const expectedSet = new Set([
              ...(userConfig.disallowedTools || []),
              ...(projectConfig.disallowedTools || []),
            ]);

            expect(new Set(merged.disallowedTools)).toEqual(expectedSet);
          }),
          { numRuns: 100 }
        );
      });

      it('空配置合并应返回空配置', () => {
        const merged = loader.mergeConfigs({}, {});
        
        expect(merged.model).toBeUndefined();
        expect(merged.maxTurns).toBeUndefined();
        expect(merged.allowedTools).toBeUndefined();
        expect(merged.disallowedTools).toBeUndefined();
      });

      it('用户配置与空项目配置合并应保留用户配置', () => {
        fc.assert(
          fc.property(arbConfig, (userConfig) => {
            const merged = loader.mergeConfigs(userConfig, {});

            expect(merged.model).toBe(userConfig.model);
            expect(merged.maxTurns).toBe(userConfig.maxTurns);
            expect(merged.maxBudgetUsd).toBe(userConfig.maxBudgetUsd);
            expect(merged.permissionMode).toBe(userConfig.permissionMode);
            expect(merged.allowedTools).toEqual(userConfig.allowedTools);
          }),
          { numRuns: 100 }
        );
      });

      it('空用户配置与项目配置合并应使用项目配置', () => {
        fc.assert(
          fc.property(arbConfig, (projectConfig) => {
            const merged = loader.mergeConfigs({}, projectConfig);

            expect(merged.model).toBe(projectConfig.model);
            expect(merged.maxTurns).toBe(projectConfig.maxTurns);
            expect(merged.maxBudgetUsd).toBe(projectConfig.maxBudgetUsd);
            expect(merged.permissionMode).toBe(projectConfig.permissionMode);
            expect(merged.allowedTools).toEqual(projectConfig.allowedTools);
          }),
          { numRuns: 100 }
        );
      });
    });

    describe('对象类型深度合并', () => {
      it('agents 应深度合并', () => {
        const userConfig: UserConfig = {
          agents: {
            reviewer: { description: '代码审查', prompt: '审查代码' },
          },
        };
        const projectConfig: UserConfig = {
          agents: {
            tester: { description: '测试专家', prompt: '编写测试' },
          },
        };

        const merged = loader.mergeConfigs(userConfig, projectConfig);

        expect(merged.agents).toEqual({
          reviewer: { description: '代码审查', prompt: '审查代码' },
          tester: { description: '测试专家', prompt: '编写测试' },
        });
      });
    });

    describe('Legacy MCP 检测', () => {
      it('解析 mcpServers 字段应标记为 legacy', () => {
        const parser = (loader as unknown as { parseConfig: (content: string) => UserConfig }).parseConfig;
        const parsed = parser.call(loader, JSON.stringify({ mcpServers: {} }));

        expect(parsed.legacyMcpServers).toBe(true);
      });

      it('当 mcpServers 缺失时不标记为 legacy', () => {
        const parser = (loader as unknown as { parseConfig: (content: string) => UserConfig }).parseConfig;
        const parsed = parser.call(loader, JSON.stringify({}));

        expect(parsed.legacyMcpServers).toBeFalsy();
      });

      it('合并时检测到 legacy 配置应输出警告', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        loader.mergeConfigs({ legacyMcpServers: true }, {});

        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
      });

      it('没有 legacy 配置时不输出警告', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        loader.mergeConfigs({}, {});

        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
      });
    });

    describe('沙箱配置合并', () => {
      it('sandbox.excludedCommands 应合并', () => {
        const userConfig: UserConfig = {
          sandbox: {
            enabled: true,
            excludedCommands: ['rm -rf /'],
          },
        };
        const projectConfig: UserConfig = {
          sandbox: {
            excludedCommands: ['dd if=/dev/zero'],
          },
        };

        const merged = loader.mergeConfigs(userConfig, projectConfig);

        expect(merged.sandbox?.excludedCommands).toContain('rm -rf /');
        expect(merged.sandbox?.excludedCommands).toContain('dd if=/dev/zero');
      });

      it('sandbox.network.allowedDomains 应合并', () => {
        const userConfig: UserConfig = {
          sandbox: {
            network: {
              allowedDomains: ['github.com'],
            },
          },
        };
        const projectConfig: UserConfig = {
          sandbox: {
            network: {
              allowedDomains: ['npmjs.com'],
            },
          },
        };

        const merged = loader.mergeConfigs(userConfig, projectConfig);

        expect(merged.sandbox?.network?.allowedDomains).toContain('github.com');
        expect(merged.sandbox?.network?.allowedDomains).toContain('npmjs.com');
      });
    });

    describe('钩子配置合并', () => {
      it('hooks 应合并同一事件的钩子', () => {
        const userConfig: UserConfig = {
          hooks: {
            PostToolUse: [
              { matcher: 'Write', hooks: [{ type: 'command', command: 'lint' }] },
            ],
          },
        };
        const projectConfig: UserConfig = {
          hooks: {
            PostToolUse: [
              { matcher: 'Edit', hooks: [{ type: 'command', command: 'format' }] },
            ],
          },
        };

        const merged = loader.mergeConfigs(userConfig, projectConfig);

        expect(merged.hooks?.PostToolUse).toHaveLength(2);
        expect(merged.hooks?.PostToolUse?.[0].matcher).toBe('Write');
        expect(merged.hooks?.PostToolUse?.[1].matcher).toBe('Edit');
      });

      it('不同事件的钩子应分别保留', () => {
        const userConfig: UserConfig = {
          hooks: {
            SessionStart: [
              { matcher: '.*', hooks: [{ type: 'prompt', prompt: 'Hello' }] },
            ],
          },
        };
        const projectConfig: UserConfig = {
          hooks: {
            SessionEnd: [
              { matcher: '.*', hooks: [{ type: 'prompt', prompt: 'Goodbye' }] },
            ],
          },
        };

        const merged = loader.mergeConfigs(userConfig, projectConfig);

        expect(merged.hooks?.SessionStart).toHaveLength(1);
        expect(merged.hooks?.SessionEnd).toHaveLength(1);
      });
    });
  });
});
