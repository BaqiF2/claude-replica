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
} from '../../src/permissions/PermissionManager';
import { ToolRegistry } from '../../src/tools/ToolRegistry';
import { PermissionUI } from '../../src/permissions/PermissionUI';
import { PermissionUIResult } from '../../src/permissions/types';

// Mock PermissionUI for testing
class MockPermissionUI implements PermissionUI {
  async promptToolPermission(): Promise<PermissionUIResult> {
    return { approved: false, reason: 'Mock denied' };
  }

  async promptUserQuestions(): Promise<Record<string, string>> {
    return {};
  }
}

describe('PermissionManager', () => {
  let toolRegistry: ToolRegistry;
  let permissionUI: PermissionUI;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
    permissionUI = new MockPermissionUI();
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

            const manager = new PermissionManager(config, permissionUI, toolRegistry);
            const handler = manager.createCanUseToolHandler();

            const result = await handler(tool, {}, {
              signal: new AbortController().signal,
              toolUseID: 'test-uuid',
            });

            expect(result.behavior).toBe('deny');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('白名单模式下，不在白名单中的工具应被拒绝', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbToolName,
          fc.array(arbToolName, { minLength: 1, maxLength: 5 }),
          arbPermissionMode,
          async (tool, allowedTools, mode) => {
            // 确保工具不在白名单中
            const filteredAllowedTools = allowedTools.filter(t => t !== tool);

            // 如果白名单为空，跳过此测试用例（因为空白名单意味着允许所有工具）
            if (filteredAllowedTools.length === 0) {
              return;
            }

            const config: PermissionConfig = {
              mode,
              allowedTools: filteredAllowedTools,
            };

            const manager = new PermissionManager(config, permissionUI, toolRegistry);
            const handler = manager.createCanUseToolHandler();

            const result = await handler(tool, {}, {
              signal: new AbortController().signal,
              toolUseID: 'test-uuid',
            });

            expect(result.behavior).toBe('deny');
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

          const manager = new PermissionManager(config, permissionUI, toolRegistry);
          const handler = manager.createCanUseToolHandler();

          // AskUserQuestion 需要特殊的输入格式
          const input = tool === 'AskUserQuestion'
            ? { questions: [{ question: 'test?', header: 'Test', options: [{label: 'Yes', description: 'Yes'}], multiSelect: false }] }
            : {};

          const result = await handler(tool, input, {
            signal: new AbortController().signal,
            toolUseID: 'test-uuid',
          });

          expect(result.behavior).toBe('allow');
        }),
        { numRuns: 100 }
      );
    });

    it('plan 模式应只允许只读工具和 ExitPlanMode', async () => {
      await fc.assert(
        fc.asyncProperty(arbToolName, async (tool) => {
          const config: PermissionConfig = {
            mode: 'plan',
          };

          const manager = new PermissionManager(config, permissionUI, toolRegistry);
          const handler = manager.createCanUseToolHandler();

          const result = await handler(tool, {}, {
            signal: new AbortController().signal,
            toolUseID: 'test-uuid',
          });

          // 只允许只读工具和 ExitPlanMode
          const allowedInPlanMode = ['Read', 'Grep', 'Glob', 'ExitPlanMode'];
          if (allowedInPlanMode.includes(tool)) {
            expect(result.behavior).toBe('allow');
          } else {
            expect(result.behavior).toBe('deny');
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('acceptEdits 模式', () => {
    it('应自动批准 Write 和 Edit 工具', async () => {
      const config: PermissionConfig = {
        mode: 'acceptEdits',
      };

      const manager = new PermissionManager(config, permissionUI, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      const writeResult = await handler('Write', { file_path: 'test.txt', content: 'test' }, {
        signal: new AbortController().signal,
        toolUseID: 'test-uuid-1',
      });

      const editResult = await handler('Edit', { file_path: 'test.txt', old_string: 'a', new_string: 'b' }, {
        signal: new AbortController().signal,
        toolUseID: 'test-uuid-2',
      });

      expect(writeResult.behavior).toBe('allow');
      expect(editResult.behavior).toBe('allow');
    });
  });

  describe('MCP 工具权限', () => {
    it('应支持完整 MCP 工具名匹配', async () => {
      const config: PermissionConfig = {
        mode: 'default',
        disallowedTools: [MCP_TOOL_FULL_NAME],
      };

      const manager = new PermissionManager(config, permissionUI, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      const result = await handler(MCP_TOOL_FULL_NAME, {}, {
        signal: new AbortController().signal,
        toolUseID: 'test-uuid',
      });

      expect(result.behavior).toBe('deny');
    });

    it('应支持 MCP 模块名匹配', async () => {
      const config: PermissionConfig = {
        mode: 'default',
        disallowedTools: [MCP_MODULE_NAME],
      };

      const manager = new PermissionManager(config, permissionUI, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      const result = await handler(MCP_TOOL_FULL_NAME, {}, {
        signal: new AbortController().signal,
        toolUseID: 'test-uuid',
      });

      expect(result.behavior).toBe('deny');
    });

    it('应支持 MCP 通配符匹配', async () => {
      const config: PermissionConfig = {
        mode: 'default',
        disallowedTools: [MCP_MODULE_WILDCARD],
      };

      const manager = new PermissionManager(config, permissionUI, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      const result = await handler(MCP_TOOL_FULL_NAME, {}, {
        signal: new AbortController().signal,
        toolUseID: 'test-uuid',
      });

      expect(result.behavior).toBe('deny');
    });
  });

  describe('Bash 命令过滤', () => {
    it('应拒绝黑名单中的命令', async () => {
      const config: PermissionConfig = {
        mode: 'default',
        disallowedCommands: ['rm -rf'],
      };

      const manager = new PermissionManager(config, permissionUI, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      const result = await handler('Bash', { command: 'rm -rf /' }, {
        signal: new AbortController().signal,
        toolUseID: 'test-uuid',
      });

      expect(result.behavior).toBe('deny');
    });

    it('应允许白名单中的命令', async () => {
      const config: PermissionConfig = {
        mode: 'default',
        allowedCommands: ['npm install'],
      };

      const manager = new PermissionManager(config, permissionUI, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      const result = await handler('Bash', { command: 'npm install' }, {
        signal: new AbortController().signal,
        toolUseID: 'test-uuid',
      });

      expect(result.behavior).toBe('allow');
    });
  });

  describe('Signal aborted 检查', () => {
    it('应在 signal.aborted 时返回 interrupt', async () => {
      const config: PermissionConfig = {
        mode: 'default',
      };

      const manager = new PermissionManager(config, permissionUI, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      const controller = new AbortController();
      controller.abort();

      const result = await handler('Read', { file_path: 'test.txt' }, {
        signal: controller.signal,
        toolUseID: 'test-uuid',
      });

      expect(result.behavior).toBe('deny');
      if (result.behavior === 'deny') {
        expect(result.interrupt).toBe(true);
      }
    });
  });

  describe('PermissionResult 格式', () => {
    it('allow 结果应包含 updatedInput', async () => {
      const config: PermissionConfig = {
        mode: 'bypassPermissions',
      };

      const manager = new PermissionManager(config, permissionUI, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      const input = { file_path: 'test.txt' };
      const result = await handler('Read', input, {
        signal: new AbortController().signal,
        toolUseID: 'test-uuid',
      });

      expect(result.behavior).toBe('allow');
      if (result.behavior === 'allow') {
        expect(result.updatedInput).toEqual(input);
        expect(result.toolUseID).toBe('test-uuid');
      }
    });

    it('deny 结果应包含 message', async () => {
      const config: PermissionConfig = {
        mode: 'default',
        disallowedTools: ['Read'],
      };

      const manager = new PermissionManager(config, permissionUI, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      const result = await handler('Read', { file_path: 'test.txt' }, {
        signal: new AbortController().signal,
        toolUseID: 'test-uuid',
      });

      expect(result.behavior).toBe('deny');
      if (result.behavior === 'deny') {
        expect(result.message).toBeDefined();
        expect(result.toolUseID).toBe('test-uuid');
      }
    });
  });

  describe('AskUserQuestion 处理', () => {
    it('应正确构建 updatedInput 包含 questions 和 answers', async () => {
      // Mock PermissionUI 返回用户答案
      const mockUI = {
        async promptToolPermission(): Promise<PermissionUIResult> {
          return { approved: false, reason: 'Mock denied' };
        },
        async promptUserQuestions(_questions: any[]): Promise<Record<string, string>> {
          return {
            q1: 'Option 1',
            q2: 'Option 2',
          };
        },
      };

      const config: PermissionConfig = {
        mode: 'default',
      };

      const manager = new PermissionManager(config, mockUI, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      const input = {
        questions: [
          {
            question: 'Which option do you prefer?',
            header: 'Preference',
            options: [
              { label: 'Option 1', description: 'First option' },
              { label: 'Option 2', description: 'Second option' },
            ],
            multiSelect: false,
          },
        ],
      };

      const result = await handler('AskUserQuestion', input, {
        signal: new AbortController().signal,
        toolUseID: 'test-uuid',
      });

      expect(result.behavior).toBe('allow');
      if (result.behavior === 'allow') {
        expect(result.updatedInput).toHaveProperty('questions');
        expect(result.updatedInput).toHaveProperty('answers');
        expect((result.updatedInput as any).questions).toEqual(input.questions);
        expect((result.updatedInput as any).answers).toEqual({
          q1: 'Option 1',
          q2: 'Option 2',
        });
        expect(result.toolUseID).toBe('test-uuid');
      }
    });

    it('应在缺少 questions 字段时返回 deny', async () => {
      const config: PermissionConfig = {
        mode: 'default',
      };

      const manager = new PermissionManager(config, permissionUI, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      const result = await handler('AskUserQuestion', {}, {
        signal: new AbortController().signal,
        toolUseID: 'test-uuid',
      });

      expect(result.behavior).toBe('deny');
      if (result.behavior === 'deny') {
        expect(result.message).toContain('Invalid AskUserQuestion input');
        expect(result.toolUseID).toBe('test-uuid');
      }
    });

    it('应在用户取消时返回 deny', async () => {
      const mockUI = {
        async promptToolPermission(): Promise<PermissionUIResult> {
          return { approved: false, reason: 'Mock denied' };
        },
        async promptUserQuestions(): Promise<Record<string, string>> {
          throw new Error('User canceled');
        },
      };

      const config: PermissionConfig = {
        mode: 'default',
      };

      const manager = new PermissionManager(config, mockUI, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      const input = {
        questions: [
          {
            question: 'Test question?',
            header: 'Test',
            options: [{ label: 'Yes', description: 'Yes' }],
            multiSelect: false,
          },
        ],
      };

      const result = await handler('AskUserQuestion', input, {
        signal: new AbortController().signal,
        toolUseID: 'test-uuid',
      });

      expect(result.behavior).toBe('deny');
      if (result.behavior === 'deny') {
        expect(result.message).toContain('User canceled');
        expect(result.toolUseID).toBe('test-uuid');
      }
    });

    it('bypassPermissions 模式下仍应处理 AskUserQuestion', async () => {
      const mockUI = {
        async promptToolPermission(): Promise<PermissionUIResult> {
          return { approved: false, reason: 'Mock denied' };
        },
        async promptUserQuestions(): Promise<Record<string, string>> {
          return { q1: 'Answer' };
        },
      };

      const config: PermissionConfig = {
        mode: 'bypassPermissions',
      };

      const manager = new PermissionManager(config, mockUI, toolRegistry);
      const handler = manager.createCanUseToolHandler();

      const input = {
        questions: [
          {
            question: 'Test?',
            header: 'Test',
            options: [{ label: 'Answer', description: 'Desc' }],
            multiSelect: false,
          },
        ],
      };

      const result = await handler('AskUserQuestion', input, {
        signal: new AbortController().signal,
        toolUseID: 'test-uuid',
      });

      expect(result.behavior).toBe('allow');
      if (result.behavior === 'allow') {
        expect(result.updatedInput).toHaveProperty('answers');
        expect((result.updatedInput as any).answers).toEqual({ q1: 'Answer' });
      }
    });
  });
});
