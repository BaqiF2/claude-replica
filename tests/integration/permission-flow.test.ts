/**
 * 权限流程集成测试
 *
 * 测试场景：
 * - 完整权限流程：用户输入 → 触发工具 → 显示面板 → 用户批准/拒绝 → SDK 执行/拒绝
 * - AskUserQuestion 流程：触发工具 → 显示菜单 → 用户选择 → 返回 updatedInput → 工具读取答案
 * - 动态权限切换流程：切换模式 → 本地更新 → SDK 异步应用 → 下次工具调用生效
 *
 * @module tests/integration/permission-flow
 * **验证: 权限系统核心需求**
 */

// Mock SDK before any imports
jest.mock('@anthropic-ai/claude-agent-sdk', () => {
  let currentPermissionMode = 'default';
  let mockCanUseTool: any = null;

  return {
    query: jest.fn().mockImplementation((options) => {
      // Store the canUseTool handler for testing
      mockCanUseTool = options.canUseTool;

      async function* mockGenerator() {
        // Return assistant message
        yield {
          type: 'assistant',
          session_id: 'test-session-id',
          message: {
            content: [
              {
                type: 'text',
                text: 'Mock response',
              },
            ],
          },
        };

        // Return success result
        yield {
          type: 'result',
          subtype: 'success',
          session_id: 'test-session-id',
          result: 'Mock response',
          total_cost_usd: 0.001,
          duration_ms: 100,
          usage: {
            input_tokens: 10,
            output_tokens: 20,
          },
        };
      }

      const generator = mockGenerator();

      // Add setPermissionMode method to the generator
      (generator as any).setPermissionMode = jest.fn().mockImplementation(async (mode: string) => {
        currentPermissionMode = mode;
      });

      return generator;
    }),
    createSdkMcpServer: jest.fn().mockImplementation((config) => config),
    tool: jest.fn().mockImplementation((name, description, schema, handler) => ({
      name,
      description,
      schema,
      handler,
    })),
    // Export helper to access the stored canUseTool
    __getMockCanUseTool: () => mockCanUseTool,
    __getCurrentPermissionMode: () => currentPermissionMode,
  };
});

import { PermissionManager } from '../../src/permissions/PermissionManager';
import { PermissionUIImpl } from '../../src/ui/PermissionUIImpl';
import { MessageRouter } from '../../src/core/MessageRouter';
import { StreamingQueryManager } from '../../src/sdk/StreamingQueryManager';
import { SDKQueryExecutor } from '../../src/sdk/SDKQueryExecutor';
import { ConfigManager } from '../../src/config/ConfigManager';
import type { PermissionMode } from '../../src/permissions';
import type { QuestionInput } from '../../src/permissions/PermissionUI';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Permission Flow Integration Tests', () => {
  let permissionManager: PermissionManager;
  let permissionUI: PermissionUIImpl;
  let messageRouter: MessageRouter;
  let streamingQueryManager: StreamingQueryManager;
  let configManager: ConfigManager;
  let sdkExecutor: SDKQueryExecutor;
  let testDir: string;

  beforeAll(async () => {
    // Create temp directories
    testDir = path.join(os.tmpdir(), `permission-flow-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    // Clean up
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Initialize managers
    configManager = new ConfigManager();

    // Initialize permission system
    permissionUI = new PermissionUIImpl();
    permissionManager = new PermissionManager(
      {
        mode: 'default',
        allowedTools: [],
        disallowedTools: [],
      },
      permissionUI
    );

    // Initialize message router
    messageRouter = new MessageRouter({
      permissionManager,
      configManager,
    });

    // Initialize SDK executor
    sdkExecutor = new SDKQueryExecutor();

    // Initialize streaming query manager
    streamingQueryManager = new StreamingQueryManager({
      messageRouter,
      sdkExecutor,
    });
  });

  describe('Complete Permission Flow', () => {
    it('should handle full permission workflow: user input → tool trigger → panel display → user approval → execution', async () => {
      // Mock user approval
      jest.spyOn(permissionUI, 'promptToolPermission').mockResolvedValue({
        approved: true,
      });

      // Create canUseTool handler
      const canUseTool = permissionManager.createCanUseToolHandler();

      // Simulate tool use request
      const signal = new AbortController().signal;
      const result = await canUseTool('Bash', { command: 'echo test' }, { signal, toolUseID: 'test-id-1' });

      // Verify result
      expect(result.behavior).toBe('allow');
      expect(result.toolUseID).toBe('test-id-1');
      if (result.behavior === 'allow') {
        expect(result.updatedInput).toEqual({ command: 'echo test' });
      }

      // Verify UI was called
      expect(permissionUI.promptToolPermission).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'Bash',
          input: { command: 'echo test' },
        })
      );
    });

    it('should handle user denial workflow', async () => {
      // Mock user denial
      jest.spyOn(permissionUI, 'promptToolPermission').mockResolvedValue({
        approved: false,
        reason: 'User rejected the operation',
      });

      // Create canUseTool handler
      const canUseTool = permissionManager.createCanUseToolHandler();

      // Simulate tool use request
      const signal = new AbortController().signal;
      const result = await canUseTool('Bash', { command: 'rm -rf /' }, { signal, toolUseID: 'test-id-2' });

      // Verify denial
      expect(result.behavior).toBe('deny');
      expect(result.toolUseID).toBe('test-id-2');
      if (result.behavior === 'deny') {
        expect(result.message).toBe('User rejected the operation');
      }
    });

    it('should handle signal.aborted and return interrupt', async () => {
      // Create canUseTool handler
      const canUseTool = permissionManager.createCanUseToolHandler();

      // Simulate aborted signal
      const controller = new AbortController();
      controller.abort();
      const result = await canUseTool('Bash', { command: 'echo test' }, { signal: controller.signal, toolUseID: 'test-id-3' });

      // Verify interrupt
      expect(result.behavior).toBe('deny');
      if (result.behavior === 'deny') {
        expect(result.interrupt).toBe(true);
      }
      expect(result.toolUseID).toBe('test-id-3');
    });

    it('should respect whitelist and always allow', async () => {
      // Configure whitelist
      const promptSpy = jest.spyOn(permissionUI, 'promptToolPermission');

      permissionManager = new PermissionManager(
        {
          mode: 'default',
          allowedTools: ['Read'],
          disallowedTools: [],
        },
        permissionUI
      );

      const canUseTool = permissionManager.createCanUseToolHandler();
      const signal = new AbortController().signal;
      const result = await canUseTool('Read', { file_path: '/test/file.txt' }, { signal, toolUseID: 'test-id-4' });

      // Should allow without prompting
      expect(result.behavior).toBe('allow');
      expect(promptSpy).not.toHaveBeenCalled();
    });

    it('should respect blacklist and always deny', async () => {
      // Configure blacklist
      const promptSpy = jest.spyOn(permissionUI, 'promptToolPermission');

      permissionManager = new PermissionManager(
        {
          mode: 'default',
          allowedTools: [],
          disallowedTools: ['Bash'],
        },
        permissionUI
      );

      const canUseTool = permissionManager.createCanUseToolHandler();
      const signal = new AbortController().signal;
      const result = await canUseTool('Bash', { command: 'echo test' }, { signal, toolUseID: 'test-id-5' });

      // Should deny without prompting
      expect(result.behavior).toBe('deny');
      expect(promptSpy).not.toHaveBeenCalled();
    });

    it('should auto-approve Write/Edit in acceptEdits mode', async () => {
      // Set acceptEdits mode
      const promptSpy = jest.spyOn(permissionUI, 'promptToolPermission');

      permissionManager.setMode('acceptEdits');

      const canUseTool = permissionManager.createCanUseToolHandler();
      const signal = new AbortController().signal;

      // Test Write tool
      const writeResult = await canUseTool('Write', { file_path: '/test/file.txt', content: 'test' }, { signal, toolUseID: 'test-id-6' });
      expect(writeResult.behavior).toBe('allow');

      // Test Edit tool
      const editResult = await canUseTool('Edit', { file_path: '/test/file.txt', old_string: 'a', new_string: 'b' }, { signal, toolUseID: 'test-id-7' });
      expect(editResult.behavior).toBe('allow');

      // Should not prompt
      expect(promptSpy).not.toHaveBeenCalled();
    });

    it('should auto-approve all tools in bypassPermissions mode', async () => {
      // Set bypass mode
      const promptSpy = jest.spyOn(permissionUI, 'promptToolPermission');

      permissionManager.setMode('bypassPermissions');

      const canUseTool = permissionManager.createCanUseToolHandler();
      const signal = new AbortController().signal;

      // Test various tools
      const bashResult = await canUseTool('Bash', { command: 'echo test' }, { signal, toolUseID: 'test-id-8' });
      expect(bashResult.behavior).toBe('allow');

      const writeResult = await canUseTool('Write', { file_path: '/test/file.txt', content: 'test' }, { signal, toolUseID: 'test-id-9' });
      expect(writeResult.behavior).toBe('allow');

      // Should not prompt
      expect(promptSpy).not.toHaveBeenCalled();
    });
  });

  describe('AskUserQuestion Flow', () => {
    it('should handle AskUserQuestion workflow: trigger → menu → user selection → updatedInput', async () => {
      // Mock user answers
      const mockAnswers = {
        'Which option do you prefer?': 'Option A',
      };
      jest.spyOn(permissionUI, 'promptUserQuestions').mockResolvedValue(mockAnswers);

      // Create canUseTool handler
      const canUseTool = permissionManager.createCanUseToolHandler();

      // Simulate AskUserQuestion tool
      const questions: QuestionInput[] = [
        {
          question: 'Which option do you prefer?',
          header: 'Preference',
          options: [
            { label: 'Option A', description: 'First option' },
            { label: 'Option B', description: 'Second option' },
          ],
          multiSelect: false,
        },
      ];

      const signal = new AbortController().signal;
      const result = await canUseTool(
        'AskUserQuestion',
        { questions },
        { signal, toolUseID: 'test-id-10' }
      );

      // Verify behavior
      expect(result.behavior).toBe('allow');
      expect(result.toolUseID).toBe('test-id-10');

      // Verify updatedInput contains answers
      if (result.behavior === 'allow') {
        expect(result.updatedInput).toHaveProperty('questions', questions);
        expect(result.updatedInput).toHaveProperty('answers', mockAnswers);
      }

      // Verify UI was called
      expect(permissionUI.promptUserQuestions).toHaveBeenCalledWith(questions);
    });

    it('should handle multi-select questions', async () => {
      // Mock user answers for multi-select
      const mockAnswers = {
        'Which features do you want?': 'Feature A, Feature B',
      };
      jest.spyOn(permissionUI, 'promptUserQuestions').mockResolvedValue(mockAnswers);

      const canUseTool = permissionManager.createCanUseToolHandler();

      const questions: QuestionInput[] = [
        {
          question: 'Which features do you want?',
          header: 'Features',
          options: [
            { label: 'Feature A', description: 'First feature' },
            { label: 'Feature B', description: 'Second feature' },
            { label: 'Feature C', description: 'Third feature' },
          ],
          multiSelect: true,
        },
      ];

      const signal = new AbortController().signal;
      const result = await canUseTool(
        'AskUserQuestion',
        { questions },
        { signal, toolUseID: 'test-id-11' }
      );

      // Verify updatedInput
      expect(result.behavior).toBe('allow');
      if (result.behavior === 'allow') {
        expect(result.updatedInput).toHaveProperty('answers', mockAnswers);
      }
    });

    it('should handle multiple questions sequentially', async () => {
      const mockAnswers = {
        'Question 1?': 'Answer 1',
        'Question 2?': 'Answer 2',
      };
      jest.spyOn(permissionUI, 'promptUserQuestions').mockResolvedValue(mockAnswers);

      const canUseTool = permissionManager.createCanUseToolHandler();

      const questions: QuestionInput[] = [
        {
          question: 'Question 1?',
          header: 'Q1',
          options: [
            { label: 'Answer 1', description: 'First answer' },
            { label: 'Answer 2', description: 'Second answer' },
          ],
          multiSelect: false,
        },
        {
          question: 'Question 2?',
          header: 'Q2',
          options: [
            { label: 'Answer 1', description: 'First answer' },
            { label: 'Answer 2', description: 'Second answer' },
          ],
          multiSelect: false,
        },
      ];

      const signal = new AbortController().signal;
      const result = await canUseTool(
        'AskUserQuestion',
        { questions },
        { signal, toolUseID: 'test-id-12' }
      );

      // Verify all answers are collected
      expect(result.behavior).toBe('allow');
      if (result.behavior === 'allow') {
        expect(result.updatedInput).toHaveProperty('answers');
        const answers = (result.updatedInput as any).answers;
        expect(Object.keys(answers)).toHaveLength(2);
      }
    });
  });

  describe('Dynamic Permission Switching Flow', () => {
    it('should switch permission mode locally and sync to SDK', async () => {
      // Initial mode
      expect(permissionManager.getMode()).toBe('default');

      // Switch to acceptEdits
      await streamingQueryManager.setPermissionMode('acceptEdits');

      // Verify local update
      expect(permissionManager.getMode()).toBe('acceptEdits');

      // Verify SDK would be updated (in real scenario)
      // Note: In this test, we can't directly verify SDK update without a real query instance
      // But the StreamingQueryManager.setPermissionMode should call both:
      // 1. messageRouter.setPermissionMode(mode)
      // 2. queryInstance.setPermissionMode(mode) if queryInstance exists
    });

    it('should apply new mode to next tool call after switch', async () => {
      // Start in default mode - requires permission
      jest.spyOn(permissionUI, 'promptToolPermission').mockResolvedValue({ approved: true });

      const canUseTool = permissionManager.createCanUseToolHandler();
      const signal = new AbortController().signal;

      // First call in default mode - should prompt
      await canUseTool('Bash', { command: 'echo test' }, { signal, toolUseID: 'test-id-13' });
      expect(permissionUI.promptToolPermission).toHaveBeenCalledTimes(1);

      // Switch to bypass mode
      await streamingQueryManager.setPermissionMode('bypassPermissions');

      // Second call in bypass mode - should not prompt
      await canUseTool('Bash', { command: 'echo test2' }, { signal, toolUseID: 'test-id-14' });
      expect(permissionUI.promptToolPermission).toHaveBeenCalledTimes(1); // Still 1, no new call
    });

    it('should cycle through all permission modes', async () => {
      const modes: PermissionMode[] = ['default', 'acceptEdits', 'bypassPermissions', 'plan'];

      for (const mode of modes) {
        await streamingQueryManager.setPermissionMode(mode);
        expect(permissionManager.getMode()).toBe(mode);
      }

      // Cycle back to default
      await streamingQueryManager.setPermissionMode('default');
      expect(permissionManager.getMode()).toBe('default');
    });

    it('should maintain mode across multiple tool calls', async () => {
      // Set to bypassPermissions
      const promptSpy = jest.spyOn(permissionUI, 'promptToolPermission');

      await streamingQueryManager.setPermissionMode('bypassPermissions');

      const canUseTool = permissionManager.createCanUseToolHandler();
      const signal = new AbortController().signal;

      // Multiple tool calls should all bypass
      const tools = ['Bash', 'Write', 'Edit', 'Read', 'Grep'];
      for (const tool of tools) {
        const result = await canUseTool(tool, {}, { signal, toolUseID: `test-${tool}` });
        expect(result.behavior).toBe('allow');
      }

      // No prompts should occur
      expect(promptSpy).not.toHaveBeenCalled();
    });

    it('should handle rapid mode switches', async () => {
      const modes: PermissionMode[] = ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'default'];

      // Rapidly switch modes
      for (const mode of modes) {
        await streamingQueryManager.setPermissionMode(mode);
      }

      // Final mode should be the last one set
      expect(permissionManager.getMode()).toBe('default');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty AskUserQuestion input', async () => {
      jest.spyOn(permissionUI, 'promptUserQuestions').mockResolvedValue({});

      const canUseTool = permissionManager.createCanUseToolHandler();
      const signal = new AbortController().signal;

      const result = await canUseTool(
        'AskUserQuestion',
        { questions: [] },
        { signal, toolUseID: 'test-id-15' }
      );

      expect(result.behavior).toBe('allow');
      if (result.behavior === 'allow') {
        expect(result.updatedInput).toHaveProperty('answers', {});
      }
    });

    it('should handle UI errors gracefully', async () => {
      // Mock UI error
      jest.spyOn(permissionUI, 'promptToolPermission').mockRejectedValue(new Error('UI Error'));

      const canUseTool = permissionManager.createCanUseToolHandler();
      const signal = new AbortController().signal;

      // Should propagate error or handle gracefully
      await expect(
        canUseTool('Bash', { command: 'echo test' }, { signal, toolUseID: 'test-id-16' })
      ).rejects.toThrow();
    });

    it('should preserve tool input structure in updatedInput', async () => {
      jest.spyOn(permissionUI, 'promptToolPermission').mockResolvedValue({ approved: true });

      const canUseTool = permissionManager.createCanUseToolHandler();
      const signal = new AbortController().signal;

      const complexInput = {
        command: 'echo "test"',
        timeout: 5000,
        options: { shell: true, cwd: '/tmp' },
      };

      const result = await canUseTool('Bash', complexInput, { signal, toolUseID: 'test-id-17' });

      expect(result.behavior).toBe('allow');
      if (result.behavior === 'allow') {
        expect(result.updatedInput).toEqual(complexInput);
      }
    });
  });
});
