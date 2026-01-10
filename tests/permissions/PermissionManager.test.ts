/**
 * PermissionManager 属性测试
 * 
 * **Feature: claude-code-replica, Property 4: 工具权限的安全性**
 * **验证: 需求 14.1, 14.3**
 */

import * as fc from 'fast-check';
import {
  PermissionManager,
  PermissionConfig,
  PermissionMode,
  ToolUseParams,
} from '../../src/permissions/PermissionManager';
import { ToolRegistry } from '../../src/tools/ToolRegistry';

describe('PermissionManager', () => {
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
  });

  // 生成工具名称的 Arbitrary
  const arbToolName = fc.constantFrom(
    'Read', 'Write', 'Edit',
    'Bash', 'BashOutput', 'KillBash',
    'Grep', 'Glob',
    'Task',
    'AskUserQuestion',
    'WebFetch', 'WebSearch',
    'TodoWrite',
    'NotebookEdit',
    'ExitPlanMode',
    'ListMcpResources', 'ReadMcpResource'
  );

  const MCP_SERVER_NAME = 'custom-tools-math';
  const MCP_TOOL_NAME = 'calculator';
  const MCP_TOOL_FULL_NAME = `mcp__${MCP_SERVER_NAME}__${MCP_TOOL_NAME}`;
  const MCP_MODULE_NAME = `mcp__${MCP_SERVER_NAME}`;
  const MCP_MODULE_WILDCARD = `${MCP_MODULE_NAME}__*`;

  // 生成权限模式的 Arbitrary
  const arbPermissionMode = fc.constantFrom(
    'default', 'acceptEdits', 'bypassPermissions', 'plan'
  ) as fc.Arbitrary<PermissionMode>;

  // 生成工具使用参数的 Arbitrary（保留以备将来使用）
  // const arbToolUseParams = (tool?: string): fc.Arbitrary<ToolUseParams> =>
  //   fc.record({
  //     tool: tool ? fc.constant(tool) : arbToolName,
  //     args: fc.record({
  //       path: fc.option(fc.string(), { nil: undefined }),
  //       command: fc.option(fc.string(), { nil: undefined }),
  //     }),
  //     context: fc.record({
  //       sessionId: fc.uuid(),
  //       messageUuid: fc.uuid(),
  //     }),
  //   });

  describe('Property 4: 工具权限的安全性', () => {
    /**
     * 属性 4: 工具权限的安全性
     * 
     * *对于任意*工具调用，如果该工具不在白名单中且不在自动批准模式，
     * 则必须请求用户确认。
     */

    it('黑名单中的工具应始终被拒绝', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbToolName,
          fc.array(arbToolName, { minLength: 1, maxLength: 5 }),
          arbPermissionMode,
          async (tool, disallowedTools, mode) => {
            // 确保工具在黑名单中
            if (!disallowedTools.includes(tool)) {
              disallowedTools.push(tool);
            }

            const config: PermissionConfig = {
              mode,
              disallowedTools,
            };

            const manager = new PermissionManager(config, toolRegistry);
            const handler = manager.createCanUseToolHandler();

            const params: ToolUseParams = {
              tool,
              args: {},
              context: { sessionId: 'test-session', messageUuid: 'test-uuid' },
            };

            const result = await handler(params);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('白名单模式下，不在白名单中的工具应被拒绝', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbToolName,
          fc.array(arbToolName, { minLength: 1, maxLength: 3 }),
          async (tool, allowedTools) => {
            // 确保工具不在白名单中
            const filteredAllowed = allowedTools.filter(t => t !== tool);
            if (filteredAllowed.length === 0) {
              return; // 跳过这个测试用例
            }

            const config: PermissionConfig = {
              mode: 'default',
              allowedTools: filteredAllowed,
            };

            const manager = new PermissionManager(config, toolRegistry);
            const handler = manager.createCanUseToolHandler();

            const params: ToolUseParams = {
              tool,
              args: {},
              context: { sessionId: 'test-session', messageUuid: 'test-uuid' },
            };

            const result = await handler(params);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('bypassPermissions 模式应允许所有工具', async () => {
      await fc.assert(
        fc.asyncProperty(arbToolName, async (tool) => {
          const config: PermissionConfig = {
            mode: 'bypassPermissions',
          };

          const manager = new PermissionManager(config, toolRegistry);
          const handler = manager.createCanUseToolHandler();

          const params: ToolUseParams = {
            tool,
            args: {},
            context: { sessionId: 'test-session', messageUuid: 'test-uuid' },
          };

          const result = await handler(params);
          expect(result).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('plan 模式应拒绝所有工具', async () => {
      await fc.assert(
        fc.asyncProperty(arbToolName, async (tool) => {
          const config: PermissionConfig = {
            mode: 'plan',
          };

          const manager = new PermissionManager(config, toolRegistry);
          const handler = manager.createCanUseToolHandler();

          const params: ToolUseParams = {
            tool,
            args: {},
            context: { sessionId: 'test-session', messageUuid: 'test-uuid' },
          };

          const result = await handler(params);
          expect(result).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('acceptEdits 模式应自动允许 Write 和 Edit', async () => {
      const editTools = ['Write', 'Edit'];

      for (const tool of editTools) {
        const config: PermissionConfig = {
          mode: 'acceptEdits',
        };

        const manager = new PermissionManager(config, toolRegistry);
        const handler = manager.createCanUseToolHandler();

        const params: ToolUseParams = {
          tool,
          args: { path: '/test/file.txt' },
          context: { sessionId: 'test-session', messageUuid: 'test-uuid' },
        };

        const result = await handler(params);
        expect(result).toBe(true);
      }
    });

    it('allowDangerouslySkipPermissions 应绕过所有检查', async () => {
      await fc.assert(
        fc.asyncProperty(arbToolName, arbPermissionMode, async (tool, mode) => {
          const config: PermissionConfig = {
            mode,
            allowDangerouslySkipPermissions: true,
          };

          const manager = new PermissionManager(config, toolRegistry);
          const handler = manager.createCanUseToolHandler();

          const params: ToolUseParams = {
            tool,
            args: {},
            context: { sessionId: 'test-session', messageUuid: 'test-uuid' },
          };

          const result = await handler(params);
          expect(result).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('shouldPromptForTool', () => {
    it('危险工具应需要确认', () => {
      const config: PermissionConfig = { mode: 'default' };
      const manager = new PermissionManager(config, toolRegistry);

      const dangerousTools = toolRegistry.getDangerousTools();
      for (const tool of dangerousTools) {
        expect(manager.shouldPromptForTool(tool)).toBe(true);
      }
    });

    it('安全工具不应需要确认', () => {
      const config: PermissionConfig = { mode: 'default' };
      const manager = new PermissionManager(config, toolRegistry);

      const safeTools = ['Read', 'Grep', 'Glob', 'Task', 'AskUserQuestion'];
      for (const tool of safeTools) {
        expect(manager.shouldPromptForTool(tool)).toBe(false);
      }
    });
  });

  describe('MCP 工具权限', () => {
    it('应支持 MCP 工具白名单的模块级匹配', async () => {
      const config: PermissionConfig = {
        mode: 'default',
        allowedTools: [MCP_MODULE_NAME],
      };

      const manager = new PermissionManager(config, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      const result = await handler({
        tool: MCP_TOOL_FULL_NAME,
        args: {},
        context: { sessionId: 'test-session', messageUuid: 'test-uuid' },
      });

      expect(result).toBe(true);
    });

    it('应支持 MCP 工具白名单的通配模块匹配', async () => {
      const config: PermissionConfig = {
        mode: 'default',
        allowedTools: [MCP_MODULE_WILDCARD],
      };

      const manager = new PermissionManager(config, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      const result = await handler({
        tool: MCP_TOOL_FULL_NAME,
        args: {},
        context: { sessionId: 'test-session', messageUuid: 'test-uuid' },
      });

      expect(result).toBe(true);
    });

    it('应支持 MCP 工具黑名单的模块级拒绝', async () => {
      const config: PermissionConfig = {
        mode: 'default',
        disallowedTools: [MCP_MODULE_NAME],
      };

      const manager = new PermissionManager(config, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      const result = await handler({
        tool: MCP_TOOL_FULL_NAME,
        args: {},
        context: { sessionId: 'test-session', messageUuid: 'test-uuid' },
      });

      expect(result).toBe(false);
    });
  });

  describe('promptUser', () => {
    it('应调用用户确认回调', async () => {
      const calls: string[] = [];
      const mockCallback = async (message: string): Promise<boolean> => {
        calls.push(message);
        return true;
      };

      const config: PermissionConfig = { mode: 'default' };
      const manager = new PermissionManager(config, toolRegistry, mockCallback);

      const result = await manager.promptUser('Write', { path: '/test.txt' });

      expect(result).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain('/test.txt');
    });

    it('无回调时应默认拒绝', async () => {
      const config: PermissionConfig = { mode: 'default' };
      const manager = new PermissionManager(config, toolRegistry);

      const result = await manager.promptUser('Write', { path: '/test.txt' });

      expect(result).toBe(false);
    });
  });

  describe('setMode', () => {
    it('应能运行时修改权限模式', () => {
      const config: PermissionConfig = { mode: 'default' };
      const manager = new PermissionManager(config, toolRegistry);

      expect(manager.getMode()).toBe('default');

      manager.setMode('bypassPermissions');
      expect(manager.getMode()).toBe('bypassPermissions');

      manager.setMode('plan');
      expect(manager.getMode()).toBe('plan');
    });
  });

  describe('白名单和黑名单管理', () => {
    it('应能添加和移除工具白名单', () => {
      const config: PermissionConfig = { mode: 'default' };
      const manager = new PermissionManager(config, toolRegistry);

      manager.addToAllowedTools('Read');
      manager.addToAllowedTools('Write');

      let currentConfig = manager.getConfig();
      expect(currentConfig.allowedTools).toContain('Read');
      expect(currentConfig.allowedTools).toContain('Write');

      manager.removeFromAllowedTools('Write');
      currentConfig = manager.getConfig();
      expect(currentConfig.allowedTools).toContain('Read');
      expect(currentConfig.allowedTools).not.toContain('Write');
    });

    it('应能添加和移除工具黑名单', () => {
      const config: PermissionConfig = { mode: 'default' };
      const manager = new PermissionManager(config, toolRegistry);

      manager.addToDisallowedTools('WebFetch');
      manager.addToDisallowedTools('WebSearch');

      let currentConfig = manager.getConfig();
      expect(currentConfig.disallowedTools).toContain('WebFetch');
      expect(currentConfig.disallowedTools).toContain('WebSearch');

      manager.removeFromDisallowedTools('WebFetch');
      currentConfig = manager.getConfig();
      expect(currentConfig.disallowedTools).not.toContain('WebFetch');
      expect(currentConfig.disallowedTools).toContain('WebSearch');
    });

    it('不应重复添加工具', () => {
      const config: PermissionConfig = { mode: 'default' };
      const manager = new PermissionManager(config, toolRegistry);

      manager.addToAllowedTools('Read');
      manager.addToAllowedTools('Read');
      manager.addToAllowedTools('Read');

      const currentConfig = manager.getConfig();
      const readCount = currentConfig.allowedTools?.filter(t => t === 'Read').length;
      expect(readCount).toBe(1);
    });
  });

  describe('命令白名单和黑名单', () => {
    it('白名单中的命令应自动批准', async () => {
      const config: PermissionConfig = {
        mode: 'default',
        allowedCommands: ['npm test', 'npm run *'],
      };

      const manager = new PermissionManager(config, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      // 精确匹配
      let result = await handler({
        tool: 'Bash',
        args: { command: 'npm test' },
        context: { sessionId: 'test', messageUuid: 'test' },
      });
      expect(result).toBe(true);

      // 通配符匹配
      result = await handler({
        tool: 'Bash',
        args: { command: 'npm run build' },
        context: { sessionId: 'test', messageUuid: 'test' },
      });
      expect(result).toBe(true);
    });

    it('黑名单中的命令应被拒绝', async () => {
      const config: PermissionConfig = {
        mode: 'bypassPermissions', // 即使绕过权限，黑名单命令也应被拒绝
        disallowedCommands: ['rm -rf /'],
      };

      const manager = new PermissionManager(config, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      const result = await handler({
        tool: 'Bash',
        args: { command: 'rm -rf /' },
        context: { sessionId: 'test', messageUuid: 'test' },
      });
      expect(result).toBe(false);
    });
  });

  describe('权限历史记录', () => {
    it('应记录权限请求', async () => {
      const config: PermissionConfig = { mode: 'bypassPermissions' };
      const manager = new PermissionManager(config, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      await handler({
        tool: 'Read',
        args: { path: '/test.txt' },
        context: { sessionId: 'session-1', messageUuid: 'uuid-1' },
      });

      await handler({
        tool: 'Write',
        args: { path: '/test.txt' },
        context: { sessionId: 'session-1', messageUuid: 'uuid-2' },
      });

      const history = manager.getPermissionHistory();
      expect(history).toHaveLength(2);
      expect(history[0].tool).toBe('Read');
      expect(history[1].tool).toBe('Write');
    });

    it('应能限制返回的历史记录数量', async () => {
      const config: PermissionConfig = { mode: 'bypassPermissions' };
      const manager = new PermissionManager(config, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      for (let i = 0; i < 10; i++) {
        await handler({
          tool: 'Read',
          args: {},
          context: { sessionId: 'test', messageUuid: `uuid-${i}` },
        });
      }

      const limitedHistory = manager.getPermissionHistory(3);
      expect(limitedHistory).toHaveLength(3);
    });

    it('应能清除历史记录', async () => {
      const config: PermissionConfig = { mode: 'bypassPermissions' };
      const manager = new PermissionManager(config, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      await handler({
        tool: 'Read',
        args: {},
        context: { sessionId: 'test', messageUuid: 'test' },
      });

      expect(manager.getPermissionHistory()).toHaveLength(1);

      manager.clearPermissionHistory();
      expect(manager.getPermissionHistory()).toHaveLength(0);
    });
  });

  describe('isToolAllowed', () => {
    it('应快速检查工具是否被允许', () => {
      const config: PermissionConfig = {
        mode: 'default',
        allowedTools: ['Read', 'Grep'],
        disallowedTools: ['WebFetch'],
      };

      const manager = new PermissionManager(config, toolRegistry);

      expect(manager.isToolAllowed('Read')).toBe(true);
      expect(manager.isToolAllowed('Grep')).toBe(true);
      expect(manager.isToolAllowed('Write')).toBe(false); // 不在白名单
      expect(manager.isToolAllowed('WebFetch')).toBe(false); // 在黑名单
    });

    it('无白名单时应默认允许', () => {
      const config: PermissionConfig = { mode: 'default' };
      const manager = new PermissionManager(config, toolRegistry);

      expect(manager.isToolAllowed('Read')).toBe(true);
      expect(manager.isToolAllowed('Write')).toBe(true);
    });

    it('应支持 MCP 工具模块级白名单', () => {
      const config: PermissionConfig = {
        mode: 'default',
        allowedTools: [MCP_MODULE_NAME],
      };

      const manager = new PermissionManager(config, toolRegistry);

      expect(manager.isToolAllowed(MCP_TOOL_FULL_NAME)).toBe(true);
      expect(manager.isToolAllowed('Read')).toBe(false);
    });
  });

  describe('createDefaultConfig', () => {
    it('应创建安全的默认配置', () => {
      const defaultConfig = PermissionManager.createDefaultConfig();

      expect(defaultConfig.mode).toBe('default');
      expect(defaultConfig.allowDangerouslySkipPermissions).toBe(false);
      expect(defaultConfig.disallowedCommands).toContain('rm -rf /');
      expect(defaultConfig.disallowedCommands).toContain('dd if=/dev/zero');
    });
  });
});
