/**
 * 测试工具函数
 */

import * as fc from 'fast-check';

/**
 * 生成随机字符串的 Arbitrary
 */
export const arbNonEmptyString = fc.string({ minLength: 1, maxLength: 100 });

/**
 * 生成有效工具名称的 Arbitrary
 */
export const arbToolName = fc.constantFrom(
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

/**
 * 生成权限模式的 Arbitrary
 */
export const arbPermissionMode = fc.constantFrom(
  'default', 'acceptEdits', 'bypassPermissions', 'plan'
);

/**
 * 生成配置对象的 Arbitrary
 */
export const arbConfig = fc.record({
  model: fc.option(fc.string(), { nil: undefined }),
  maxTurns: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
  maxBudgetUsd: fc.option(fc.float({ min: 0, max: 100 }), { nil: undefined }),
  allowedTools: fc.option(fc.array(arbToolName), { nil: undefined }),
  disallowedTools: fc.option(fc.array(arbToolName), { nil: undefined }),
});

/**
 * 创建模拟的用户确认回调
 */
export function createMockPromptCallback(defaultResponse: boolean = true) {
  const calls: string[] = [];
  const callback = async (message: string): Promise<boolean> => {
    calls.push(message);
    return defaultResponse;
  };
  return { callback, calls };
}

/**
 * 等待指定时间
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 创建临时目录路径
 */
export function getTempDir(): string {
  return `/tmp/claude-replica-test-${Date.now()}`;
}

/**
 * 深度比较两个对象
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;
  
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  
  if (keysA.length !== keysB.length) return false;
  
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  
  return true;
}
