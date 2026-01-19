/**
 * Hook Event Types Support Tests
 *
 * Tests for complete hook event type support:
 * - All 12 hook events type definition and validation
 * - Configuration validation for all event types
 *
 * Requirements: Complete Hook Event Support
 * Scenarios: Support all hook events
 * TaskGroup: 5
 */

import {
  HookManager,
  HookConfig,
  HookEvent,
  ALL_HOOK_EVENTS,
} from '../../src/hooks/HookManager';

describe('Hook Event Types Support', () => {
  describe('ALL_HOOK_EVENTS', () => {
    it('should contain exactly 12 hook events', () => {
      expect(ALL_HOOK_EVENTS).toHaveLength(12);
    });

    it('should include all required events', () => {
      const requiredEvents: HookEvent[] = [
        'PreToolUse',
        'PostToolUse',
        'PostToolUseFailure',
        'Notification',
        'UserPromptSubmit',
        'SessionStart',
        'SessionEnd',
        'Stop',
        'SubagentStart',
        'SubagentStop',
        'PreCompact',
        'PermissionRequest',
      ];

      requiredEvents.forEach((event) => {
        expect(ALL_HOOK_EVENTS).toContain(event);
      });
    });

    it('should have no duplicate events', () => {
      const uniqueEvents = new Set(ALL_HOOK_EVENTS);
      expect(uniqueEvents.size).toBe(ALL_HOOK_EVENTS.length);
    });
  });

  describe('HookManager.validateConfig', () => {
    it('should validate config with valid events', () => {
      const config: HookConfig = {
        PreToolUse: [
          {
            matcher: 'Write',
            hooks: [{ matcher: 'Write', type: 'command', command: 'echo test' }],
          },
        ],
        PostToolUse: [
          {
            matcher: '.*',
            hooks: [{ matcher: '.*', type: 'prompt', prompt: 'Review completed' }],
          },
        ],
      };

      const result = HookManager.validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate config with all 12 event types', () => {
      const config: HookConfig = {};

      ALL_HOOK_EVENTS.forEach((event) => {
        config[event] = [
          {
            matcher: '.*',
            hooks: [{ matcher: '.*', type: 'prompt', prompt: `Event: ${event}` }],
          },
        ];
      });

      const result = HookManager.validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for unknown event types', () => {
      const config = {
        UnknownEvent: [
          {
            matcher: '.*',
            hooks: [{ matcher: '.*', type: 'prompt', prompt: 'test' }],
          },
        ],
      } as unknown as HookConfig;

      const result = HookManager.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Unknown hook event type'))).toBe(true);
    });

    it('should return error for invalid hook type', () => {
      const config: HookConfig = {
        PreToolUse: [
          {
            matcher: '.*',
            hooks: [{ matcher: '.*', type: 'invalid' as any }],
          },
        ],
      };

      const result = HookManager.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('invalid type'))).toBe(true);
    });

    it('should return error for command hook missing command field', () => {
      const config: HookConfig = {
        PreToolUse: [
          {
            matcher: '.*',
            hooks: [{ matcher: '.*', type: 'command' } as any],
          },
        ],
      };

      const result = HookManager.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("missing 'command' field"))).toBe(true);
    });

    it('should return error for prompt hook missing prompt field', () => {
      const config: HookConfig = {
        PostToolUse: [
          {
            matcher: '.*',
            hooks: [{ matcher: '.*', type: 'prompt' } as any],
          },
        ],
      };

      const result = HookManager.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("missing 'prompt' field"))).toBe(true);
    });

    it('should return error for script hook missing script field', () => {
      const config: HookConfig = {
        SessionStart: [
          {
            matcher: '.*',
            hooks: [{ matcher: '.*', type: 'script' } as any],
          },
        ],
      };

      const result = HookManager.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("missing 'script' field"))).toBe(true);
    });
  });

  describe('HookManager with all event types', () => {
    let hookManager: HookManager;

    beforeEach(() => {
      hookManager = new HookManager({ debug: false });
    });

    it('should accept configuration with all 12 event types', () => {
      const config: HookConfig = {};

      ALL_HOOK_EVENTS.forEach((event) => {
        config[event] = [
          {
            matcher: '.*',
            hooks: [{ matcher: '.*', type: 'prompt', prompt: `Event: ${event}` }],
          },
        ];
      });

      hookManager.loadHooks(config);
      const loadedConfig = hookManager.getConfig();

      ALL_HOOK_EVENTS.forEach((event) => {
        expect(loadedConfig[event]).toBeDefined();
      });
    });

    it('should convert all event types to SDK format', () => {
      const config: HookConfig = {};

      ALL_HOOK_EVENTS.forEach((event) => {
        config[event] = [
          {
            matcher: '.*',
            hooks: [{ matcher: '.*', type: 'prompt', prompt: `Event: ${event}` }],
          },
        ];
      });

      hookManager.loadHooks(config);
      const sdkFormat = hookManager.getHooksForSDK();

      ALL_HOOK_EVENTS.forEach((event) => {
        expect(sdkFormat[event]).toBeDefined();
        expect(Array.isArray(sdkFormat[event])).toBe(true);
      });
    });

    it('should trigger hooks for PreToolUse event', async () => {
      const triggered: HookEvent[] = [];

      hookManager.setPromptHandler(async (_prompt, context) => {
        triggered.push(context.event);
      });

      hookManager.loadHooks({
        PreToolUse: [
          {
            matcher: '.*',
            hooks: [{ matcher: '.*', type: 'prompt', prompt: 'test' }],
          },
        ],
      });

      await hookManager.triggerEvent('PreToolUse', { tool: 'Write' });

      expect(triggered).toContain('PreToolUse');
    });

    it('should trigger hooks for SessionStart event', async () => {
      const triggered: HookEvent[] = [];

      hookManager.setPromptHandler(async (_prompt, context) => {
        triggered.push(context.event);
      });

      hookManager.loadHooks({
        SessionStart: [
          {
            matcher: '.*',
            hooks: [{ matcher: '.*', type: 'prompt', prompt: 'session starting' }],
          },
        ],
      });

      await hookManager.triggerEvent('SessionStart', { sessionId: 'test-session' });

      expect(triggered).toContain('SessionStart');
    });

    it('should trigger hooks for Notification event', async () => {
      const triggered: HookEvent[] = [];

      hookManager.setPromptHandler(async (_prompt, context) => {
        triggered.push(context.event);
      });

      hookManager.loadHooks({
        Notification: [
          {
            matcher: '.*',
            hooks: [{ matcher: '.*', type: 'prompt', prompt: 'notification received' }],
          },
        ],
      });

      await hookManager.triggerEvent('Notification', { notification: 'test notification' });

      expect(triggered).toContain('Notification');
    });

    it('should trigger hooks for SubagentStart event', async () => {
      const triggered: HookEvent[] = [];

      hookManager.setPromptHandler(async (_prompt, context) => {
        triggered.push(context.event);
      });

      hookManager.loadHooks({
        SubagentStart: [
          {
            matcher: '.*',
            hooks: [{ matcher: '.*', type: 'prompt', prompt: 'subagent starting' }],
          },
        ],
      });

      await hookManager.triggerEvent('SubagentStart', { agentName: 'test-agent' });

      expect(triggered).toContain('SubagentStart');
    });
  });
});
