/**
 * HookManager 属性测试
 *
 * **Feature: claude-code-replica, Property 9: 钩子触发的准确性**
 * **验证: 需求 11.2**
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  HookManager,
  HookEvent,
  HookContext,
  HookConfig,
  ALL_HOOK_EVENTS,
} from '../../src/hooks/HookManager';

describe('HookManager', () => {
  let hookManager: HookManager;
  let tempDir: string;

  beforeEach(async () => {
    // 创建临时目录用于测试
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'));
    hookManager = new HookManager({
      workingDir: tempDir,
      debug: false,
    });
  });

  afterEach(async () => {
    // 清理临时目录
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  describe('loadHooks', () => {
    it('应该加载钩子配置', () => {
      const config: HookConfig = {
        PostToolUse: [
          {
            matcher: 'Write|Edit',
            hooks: [
              {
                matcher: 'Write|Edit',
                type: 'command',
                command: 'echo "file changed"',
              },
            ],
          },
        ],
      };

      hookManager.loadHooks(config);

      expect(hookManager.hasHooksForEvent('PostToolUse')).toBe(true);
      expect(hookManager.hasHooksForEvent('PreToolUse')).toBe(false);
    });

    it('应该覆盖之前的配置', () => {
      hookManager.loadHooks({
        PostToolUse: [{ matcher: 'Write', hooks: [] }],
      });

      hookManager.loadHooks({
        PreToolUse: [{ matcher: 'Read', hooks: [] }],
      });

      expect(hookManager.hasHooksForEvent('PostToolUse')).toBe(false);
      expect(hookManager.hasHooksForEvent('PreToolUse')).toBe(true);
    });
  });

  describe('getHooksForSDK', () => {
    it('应该转换为 SDK 格式', () => {
      const config: HookConfig = {
        PostToolUse: [
          {
            matcher: 'Write',
            hooks: [
              {
                matcher: 'Write',
                type: 'command',
                command: 'echo test',
              },
            ],
          },
        ],
        SessionStart: [
          {
            matcher: '.*',
            hooks: [
              {
                matcher: '.*',
                type: 'prompt',
                prompt: '请遵循编码规范',
              },
            ],
          },
        ],
      };

      hookManager.loadHooks(config);
      const sdkConfig = hookManager.getHooksForSDK();

      expect(sdkConfig.PostToolUse).toBeDefined();
      expect(sdkConfig.PostToolUse).toHaveLength(1);
      expect(sdkConfig.PostToolUse![0].matcher).toBe('Write');
      expect(typeof sdkConfig.PostToolUse![0].callback).toBe('function');

      expect(sdkConfig.SessionStart).toBeDefined();
      expect(sdkConfig.SessionStart).toHaveLength(1);
    });

    it('空配置应返回空对象', () => {
      const sdkConfig = hookManager.getHooksForSDK();
      expect(Object.keys(sdkConfig)).toHaveLength(0);
    });
  });

  describe('expandVariables', () => {
    it('应该替换 $TOOL 变量', () => {
      const context: HookContext = {
        event: 'PostToolUse',
        tool: 'Write',
      };

      const result = hookManager.expandVariables('工具: $TOOL', context);
      expect(result).toBe('工具: Write');
    });

    it('应该替换 $FILE 变量', () => {
      const context: HookContext = {
        event: 'PostToolUse',
        tool: 'Write',
        args: { path: '/path/to/file.ts' },
      };

      const result = hookManager.expandVariables('文件: $FILE', context);
      expect(result).toBe('文件: /path/to/file.ts');
    });

    it('应该替换 $COMMAND 变量', () => {
      const context: HookContext = {
        event: 'PostToolUse',
        tool: 'Bash',
        args: { command: 'npm test' },
      };

      const result = hookManager.expandVariables('命令: $COMMAND', context);
      expect(result).toBe('命令: npm test');
    });

    it('应该替换多个变量', () => {
      const context: HookContext = {
        event: 'PostToolUse',
        tool: 'Write',
        args: { path: '/file.ts' },
        sessionId: 'session-123',
      };

      const result = hookManager.expandVariables(
        '工具: $TOOL, 文件: $FILE, 会话: $SESSION_ID',
        context
      );
      expect(result).toBe('工具: Write, 文件: /file.ts, 会话: session-123');
    });

    it('缺失的变量应替换为空字符串', () => {
      const context: HookContext = {
        event: 'PostToolUse',
      };

      const result = hookManager.expandVariables('工具: $TOOL, 文件: $FILE', context);
      expect(result).toBe('工具: , 文件: ');
    });
  });


  describe('addHook', () => {
    it('应该添加新钩子', () => {
      hookManager.addHook('PostToolUse', 'Write', {
        matcher: 'Write',
        type: 'command',
        command: 'echo test',
      });

      expect(hookManager.hasHooksForEvent('PostToolUse')).toBe(true);
      const hooks = hookManager.getHooksForEvent('PostToolUse');
      expect(hooks).toHaveLength(1);
      expect(hooks[0].matcher).toBe('Write');
    });

    it('应该向现有匹配器添加钩子', () => {
      hookManager.addHook('PostToolUse', 'Write', {
        matcher: 'Write',
        type: 'command',
        command: 'echo first',
      });

      hookManager.addHook('PostToolUse', 'Write', {
        matcher: 'Write',
        type: 'prompt',
        prompt: 'second',
      });

      const hooks = hookManager.getHooksForEvent('PostToolUse');
      expect(hooks).toHaveLength(1);
      expect(hooks[0].hooks).toHaveLength(2);
    });

    it('应该为不同匹配器创建新条目', () => {
      hookManager.addHook('PostToolUse', 'Write', {
        matcher: 'Write',
        type: 'command',
        command: 'echo write',
      });

      hookManager.addHook('PostToolUse', 'Edit', {
        matcher: 'Edit',
        type: 'command',
        command: 'echo edit',
      });

      const hooks = hookManager.getHooksForEvent('PostToolUse');
      expect(hooks).toHaveLength(2);
    });

    it('无效的事件类型应抛出错误', () => {
      expect(() => {
        hookManager.addHook('InvalidEvent' as HookEvent, 'test', {
          matcher: 'test',
          type: 'command',
          command: 'echo test',
        });
      }).toThrow('Unknown hook event type: InvalidEvent');
    });
  });

  describe('removeHook', () => {
    beforeEach(() => {
      hookManager.loadHooks({
        PostToolUse: [
          { matcher: 'Write', hooks: [{ matcher: 'Write', type: 'command', command: 'echo 1' }] },
          { matcher: 'Edit', hooks: [{ matcher: 'Edit', type: 'command', command: 'echo 2' }] },
        ],
        PreToolUse: [
          { matcher: 'Read', hooks: [{ matcher: 'Read', type: 'prompt', prompt: 'test' }] },
        ],
      });
    });

    it('应该移除指定匹配器的钩子', () => {
      hookManager.removeHook('PostToolUse', 'Write');

      const hooks = hookManager.getHooksForEvent('PostToolUse');
      expect(hooks).toHaveLength(1);
      expect(hooks[0].matcher).toBe('Edit');
    });

    it('不提供匹配器应移除该事件的所有钩子', () => {
      hookManager.removeHook('PostToolUse');

      expect(hookManager.hasHooksForEvent('PostToolUse')).toBe(false);
      expect(hookManager.hasHooksForEvent('PreToolUse')).toBe(true);
    });

    it('移除不存在的钩子不应报错', () => {
      expect(() => {
        hookManager.removeHook('PostToolUse', 'NonExistent');
      }).not.toThrow();
    });
  });

  describe('executeCommand', () => {
    it('应该执行命令并返回输出', async () => {
      const context: HookContext = {
        event: 'PostToolUse',
        tool: 'Write',
      };

      const result = await hookManager.executeCommand('echo "hello world"', context);

      expect(result.success).toBe(true);
      expect(result.type).toBe('command');
      expect(result.output).toContain('hello world');
    });

    it('应该替换命令中的变量', async () => {
      const context: HookContext = {
        event: 'PostToolUse',
        tool: 'Write',
        args: { path: 'test.txt' },
      };

      const result = await hookManager.executeCommand('echo "$TOOL $FILE"', context);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Write');
      expect(result.output).toContain('test.txt');
    });

    it('命令执行失败应返回错误', async () => {
      const context: HookContext = {
        event: 'PostToolUse',
      };

      const result = await hookManager.executeCommand(
        'nonexistent-command-12345',
        context
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('command');
      expect(result.error).toBeDefined();
    });
  });

  describe('executePrompt', () => {
    it('应该执行提示词钩子', async () => {
      const executedPrompts: string[] = [];

      hookManager.setPromptHandler(async (prompt) => {
        executedPrompts.push(prompt);
      });

      const context: HookContext = {
        event: 'SessionStart',
      };

      const result = await hookManager.executePrompt('请遵循编码规范', context);

      expect(result.success).toBe(true);
      expect(result.type).toBe('prompt');
      expect(executedPrompts).toContain('请遵循编码规范');
    });

    it('应该替换提示词中的变量', async () => {
      const executedPrompts: string[] = [];

      hookManager.setPromptHandler(async (prompt) => {
        executedPrompts.push(prompt);
      });

      const context: HookContext = {
        event: 'PostToolUse',
        tool: 'Write',
        args: { path: 'file.ts' },
      };

      await hookManager.executePrompt('已修改文件: $FILE (工具: $TOOL)', context);

      expect(executedPrompts[0]).toBe('已修改文件: file.ts (工具: Write)');
    });

    it('没有处理器时应返回成功', async () => {
      const context: HookContext = {
        event: 'SessionStart',
      };

      const result = await hookManager.executePrompt('测试提示词', context);

      expect(result.success).toBe(true);
      expect(result.output).toBe('测试提示词');
    });
  });

  describe('triggerEvent', () => {
    it('应该触发指定事件的所有钩子', async () => {
      // 创建测试脚本
      const scriptPath = path.join(tempDir, 'test.sh');
      await fs.writeFile(scriptPath, '#!/bin/bash\necho "executed"', { mode: 0o755 });

      hookManager.loadHooks({
        PostToolUse: [
          {
            matcher: 'Write',
            hooks: [
              { matcher: 'Write', type: 'command', command: `echo "hook1"` },
              { matcher: 'Write', type: 'command', command: `echo "hook2"` },
            ],
          },
        ],
      });

      const results = await hookManager.triggerEvent('PostToolUse', {
        tool: 'Write',
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.every(r => r.type === 'command')).toBe(true);
    });

    it('没有钩子时应返回空数组', async () => {
      const results = await hookManager.triggerEvent('PostToolUse', {
        tool: 'Write',
      });

      expect(results).toHaveLength(0);
    });
  });

  describe('validateConfig', () => {
    it('有效配置应通过验证', () => {
      const config: HookConfig = {
        PostToolUse: [
          {
            matcher: 'Write',
            hooks: [{ matcher: 'Write', type: 'command', command: 'echo test' }],
          },
        ],
        SessionStart: [
          {
            matcher: '.*',
            hooks: [{ matcher: '.*', type: 'prompt', prompt: 'hello' }],
          },
        ],
      };

      const result = HookManager.validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('无效事件类型应报错', () => {
      const config = {
        InvalidEvent: [{ matcher: 'test', hooks: [] }],
      } as unknown as HookConfig;

      const result = HookManager.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Unknown hook event type'))).toBe(true);
    });

    it('缺少 command 字段应报错', () => {
      const config: HookConfig = {
        PostToolUse: [
          {
            matcher: 'Write',
            hooks: [{ matcher: 'Write', type: 'command' }],
          },
        ],
      };

      const result = HookManager.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("missing 'command' field"))).toBe(true);
    });

    it('缺少 prompt 字段应报错', () => {
      const config: HookConfig = {
        SessionStart: [
          {
            matcher: '.*',
            hooks: [{ matcher: '.*', type: 'prompt' }],
          },
        ],
      };

      const result = HookManager.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("missing 'prompt' field"))).toBe(true);
    });
  });

  describe('getConfiguredEvents', () => {
    it('应该返回所有已配置的事件类型', () => {
      hookManager.loadHooks({
        PostToolUse: [{ matcher: 'Write', hooks: [] }],
        SessionStart: [{ matcher: '.*', hooks: [] }],
        PreToolUse: [{ matcher: 'Read', hooks: [] }],
      });

      const events = hookManager.getConfiguredEvents();

      expect(events).toContain('PostToolUse');
      expect(events).toContain('SessionStart');
      expect(events).toContain('PreToolUse');
      expect(events).toHaveLength(3);
    });

    it('空配置应返回空数组', () => {
      const events = hookManager.getConfiguredEvents();
      expect(events).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('应该清除所有钩子配置', () => {
      hookManager.loadHooks({
        PostToolUse: [{ matcher: 'Write', hooks: [] }],
        SessionStart: [{ matcher: '.*', hooks: [] }],
      });

      hookManager.clear();

      expect(hookManager.getConfiguredEvents()).toHaveLength(0);
      expect(hookManager.hasHooksForEvent('PostToolUse')).toBe(false);
    });
  });


  /**
   * 属性 9: 钩子触发的准确性
   *
   * *对于任意*钩子配置和上下文，当钩子的 matcher 匹配工具名称时，
   * 该钩子应该被触发执行。
   *
   * **验证: 需求 11.2**
   */
  describe('Property 9: 钩子触发的准确性', () => {
    // 生成有效的工具名称
    const arbToolName = fc.constantFrom(
      'Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Task'
    );

    // 生成有效的事件类型
    const arbHookEvent = fc.constantFrom(...ALL_HOOK_EVENTS);

    // 生成简单的匹配器（工具名称或正则表达式）
    const arbMatcher = fc.oneof(
      arbToolName,
      fc.constant('.*'),
      fc.constant('Write|Edit'),
      fc.constant('Read|Grep|Glob')
    );

    // 生成钩子类型（保留以备将来使用）
    // const arbHookType = fc.constantFrom('command', 'prompt') as fc.Arbitrary<'command' | 'prompt'>;

    it('匹配的工具名称应触发对应钩子', () => {
      fc.assert(
        fc.property(
          arbToolName,
          (toolName) => {
            const manager = new HookManager({ workingDir: tempDir });

            // 配置钩子
            manager.loadHooks({
              PostToolUse: [
                {
                  matcher: toolName,
                  hooks: [
                    {
                      matcher: toolName,
                      type: 'command',
                      command: `echo "${toolName}"`,
                    },
                  ],
                },
              ],
            });

            // 获取 SDK 配置
            const sdkConfig = manager.getHooksForSDK();

            // 验证钩子存在
            expect(sdkConfig.PostToolUse).toBeDefined();
            expect(sdkConfig.PostToolUse!.length).toBeGreaterThan(0);

            // 验证匹配器正确
            const matcherConfig = sdkConfig.PostToolUse!.find(
              m => m.matcher === toolName
            );
            expect(matcherConfig).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('正则表达式匹配器应正确匹配多个工具', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('Write', 'Edit'),
          (toolName) => {
            const manager = new HookManager({ workingDir: tempDir });

            // 配置使用正则表达式的钩子
            manager.loadHooks({
              PostToolUse: [
                {
                  matcher: 'Write|Edit',
                  hooks: [
                    {
                      matcher: 'Write|Edit',
                      type: 'command',
                      command: 'echo "matched"',
                    },
                  ],
                },
              ],
            });

            // 验证匹配
            const hooks = manager.getHooksForEvent('PostToolUse');
            expect(hooks).toHaveLength(1);

            // 测试正则匹配
            const regex = new RegExp(hooks[0].matcher);
            expect(regex.test(toolName)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('通配符匹配器应匹配所有工具', () => {
      fc.assert(
        fc.property(
          arbToolName,
          (toolName) => {
            const manager = new HookManager({ workingDir: tempDir });

            // 配置通配符钩子
            manager.loadHooks({
              PostToolUse: [
                {
                  matcher: '.*',
                  hooks: [
                    {
                      matcher: '.*',
                      type: 'prompt',
                      prompt: '工具已使用',
                    },
                  ],
                },
              ],
            });

            // 验证匹配
            const hooks = manager.getHooksForEvent('PostToolUse');
            expect(hooks).toHaveLength(1);

            // 测试通配符匹配
            const regex = new RegExp(hooks[0].matcher);
            expect(regex.test(toolName)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('不匹配的工具名称不应触发钩子', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('Read', 'Grep', 'Glob'),
          (toolName) => {
            const manager = new HookManager({ workingDir: tempDir });

            // 配置只匹配 Write|Edit 的钩子
            manager.loadHooks({
              PostToolUse: [
                {
                  matcher: 'Write|Edit',
                  hooks: [
                    {
                      matcher: 'Write|Edit',
                      type: 'command',
                      command: 'echo "matched"',
                    },
                  ],
                },
              ],
            });

            // 验证不匹配
            const hooks = manager.getHooksForEvent('PostToolUse');
            const regex = new RegExp(hooks[0].matcher);
            expect(regex.test(toolName)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('相同配置多次触发应产生一致的结果', () => {
      fc.assert(
        fc.property(
          arbToolName,
          arbHookEvent,
          (toolName, event) => {
            const manager = new HookManager({ workingDir: tempDir });

            // 配置钩子
            const config: HookConfig = {
              [event]: [
                {
                  matcher: toolName,
                  hooks: [
                    {
                      matcher: toolName,
                      type: 'prompt',
                      prompt: `触发: ${toolName}`,
                    },
                  ],
                },
              ],
            };

            manager.loadHooks(config);

            // 多次获取 SDK 配置
            const sdkConfig1 = manager.getHooksForSDK();
            const sdkConfig2 = manager.getHooksForSDK();

            // 验证结果一致
            expect(Object.keys(sdkConfig1)).toEqual(Object.keys(sdkConfig2));

            if (sdkConfig1[event] && sdkConfig2[event]) {
              expect(sdkConfig1[event]!.length).toBe(sdkConfig2[event]!.length);
              expect(sdkConfig1[event]![0].matcher).toBe(sdkConfig2[event]![0].matcher);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('变量替换应该是确定性的', () => {
      fc.assert(
        fc.property(
          arbToolName,
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('$')),
          (toolName, filePath) => {
            const manager = new HookManager({ workingDir: tempDir });

            const context: HookContext = {
              event: 'PostToolUse',
              tool: toolName,
              args: { path: filePath },
            };

            const template = '工具: $TOOL, 文件: $FILE';

            // 多次替换
            const result1 = manager.expandVariables(template, context);
            const result2 = manager.expandVariables(template, context);

            // 结果应该相同
            expect(result1).toBe(result2);
            expect(result1).toBe(`工具: ${toolName}, 文件: ${filePath}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('所有 12 种事件类型都应该被支持', () => {
      fc.assert(
        fc.property(
          arbHookEvent,
          (event) => {
            const manager = new HookManager({ workingDir: tempDir });

            // 为每种事件类型添加钩子
            manager.addHook(event, '.*', {
              matcher: '.*',
              type: 'prompt',
              prompt: `事件: ${event}`,
            });

            // 验证钩子已添加
            expect(manager.hasHooksForEvent(event)).toBe(true);
            expect(manager.getConfiguredEvents()).toContain(event);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('添加和移除钩子应该是可逆的', () => {
      fc.assert(
        fc.property(
          arbHookEvent,
          arbMatcher,
          (event, matcher) => {
            const manager = new HookManager({ workingDir: tempDir });

            // 添加钩子
            manager.addHook(event, matcher, {
              matcher,
              type: 'command',
              command: 'echo test',
            });

            expect(manager.hasHooksForEvent(event)).toBe(true);

            // 移除钩子
            manager.removeHook(event, matcher);

            expect(manager.hasHooksForEvent(event)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('ALL_HOOK_EVENTS', () => {
    it('应该包含所有 12 种事件类型', () => {
      expect(ALL_HOOK_EVENTS).toHaveLength(12);
      expect(ALL_HOOK_EVENTS).toContain('PreToolUse');
      expect(ALL_HOOK_EVENTS).toContain('PostToolUse');
      expect(ALL_HOOK_EVENTS).toContain('PostToolUseFailure');
      expect(ALL_HOOK_EVENTS).toContain('Notification');
      expect(ALL_HOOK_EVENTS).toContain('UserPromptSubmit');
      expect(ALL_HOOK_EVENTS).toContain('SessionStart');
      expect(ALL_HOOK_EVENTS).toContain('SessionEnd');
      expect(ALL_HOOK_EVENTS).toContain('Stop');
      expect(ALL_HOOK_EVENTS).toContain('SubagentStart');
      expect(ALL_HOOK_EVENTS).toContain('SubagentStop');
      expect(ALL_HOOK_EVENTS).toContain('PreCompact');
      expect(ALL_HOOK_EVENTS).toContain('PermissionRequest');
    });
  });
});
