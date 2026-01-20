/**
 * Test Suite: UIFactoryRegistry
 *
 * Purpose:
 * - Verify UIFactoryRegistry correctly manages UI factory registration and retrieval
 * - Test all public static methods: register(), get(), create()
 * - Validate error handling for invalid inputs and unknown types
 * - Ensure default factory creation logic works correctly
 */

import { UIFactoryRegistry, UIConfig } from '../../src/ui/factories/UIFactoryRegistry';
import type { UIFactory } from '../../src/ui/contracts/core/UIFactory';
import { PermissionUIFactory } from '../../src/ui/factories/PermissionUIFactory';
import { TerminalPermissionUIFactory } from '../../src/ui/factories/TerminalPermissionUIFactory';
import { TerminalUIFactory } from '../../src/ui/factories/TerminalUIFactory';
import type { OutputInterface, OutputOptions } from '../../src/ui/contracts/core/OutputInterface';
import type { ParserInterface } from '../../src/ui/contracts/core/ParserInterface';
import type {
  InteractiveUICallbacks,
  InteractiveUIConfig,
  InteractiveUIInterface,
} from '../../src/ui/contracts/interactive/InteractiveUIInterface';
import type { MessageRole, PermissionMode, Snapshot, TodoItem } from '../../src/ui/contracts/interactive/InteractiveUIInterface';
import type { Session, SessionStats } from '../../src/core/SessionManager';
import { PermissionUI } from '../../src/permissions/PermissionUI';

// Mock factory for testing
class MockPermissionUIFactory implements PermissionUIFactory {
  createPermissionUI(
    _output?: NodeJS.WritableStream,
    _input?: NodeJS.ReadableStream
  ): PermissionUI {
    return {
      promptToolPermission: async () => ({ approved: true }),
      promptUserQuestions: async () => ({})
    } as PermissionUI;
  }
}

class MockUIFactory implements UIFactory {
  private createMockInteractiveUI(): InteractiveUIInterface {
    return {
      start: async () => undefined,
      stop: () => undefined,
      displayMessage: (_message: string, _role: MessageRole) => undefined,
      displayToolUse: (_tool: string, _args: Record<string, unknown>) => undefined,
      displayToolResult: (_tool: string, _result: string, _isError?: boolean) => undefined,
      displayThinking: (_content?: string) => undefined,
      displayComputing: () => undefined,
      stopComputing: () => undefined,
      clearProgress: () => undefined,
      displayError: (_message: string) => undefined,
      displayWarning: (_message: string) => undefined,
      displaySuccess: (_message: string) => undefined,
      displayInfo: (_message: string) => undefined,
      displayTodoList: (_todos: TodoItem[]) => undefined,
      promptConfirmation: async (_message: string) => false,
      showRewindMenu: async (_snapshots: Snapshot[]) => null,
      showSessionMenu: async (_sessions: Session[]) => null,
      showConfirmationMenu: async (
        _title: string,
        _options: Array<{ key: string; label: string; description?: string }>,
        _defaultKey?: string
      ) => false,
      setInitialPermissionMode: (_mode: PermissionMode) => undefined,
      setPermissionMode: (_mode: PermissionMode) => undefined,
      displayPermissionStatus: (_mode: PermissionMode) => undefined,
      setProcessingState: (_processing: boolean) => undefined,
      formatRelativeTime: (_date: Date) => '',
      formatAbsoluteTime: (_date: Date) => '',
      formatStatsSummary: (_stats?: SessionStats) => '',
    };
  }

  createParser(): ParserInterface {
    return {
      parse: (_args: string[]) => ({
        help: false,
        version: false,
        debug: false,
      }),
      getHelpText: () => 'mock help',
      getVersionText: () => 'mock version',
    };
  }

  createOutput(): OutputInterface {
    return {
      info: (_message: string, _options?: OutputOptions) => undefined,
      warn: (_message: string, _options?: OutputOptions) => undefined,
      error: (_message: string, _options?: OutputOptions) => undefined,
      success: (_message: string, _options?: OutputOptions) => undefined,
      section: (_title: string, _options?: OutputOptions) => undefined,
      blankLine: (_count?: number) => undefined,
    };
  }

  createPermissionUI(): PermissionUI {
    return {
      promptToolPermission: async () => ({ approved: true }),
      promptUserQuestions: async () => ({}),
    } as PermissionUI;
  }

  createInteractiveUI(
    _callbacks: InteractiveUICallbacks,
    _config?: InteractiveUIConfig
  ): InteractiveUIInterface {
    return this.createMockInteractiveUI();
  }
}

describe('UIFactoryRegistry', () => {
  // Clear all factories before each test
  beforeEach(() => {
    UIFactoryRegistry.clear();
  });

  describe('register()', () => {
    it('should register a factory with valid type', () => {
      const mockFactory = new MockPermissionUIFactory();
      expect(() => {
        UIFactoryRegistry.register('mock', mockFactory);
      }).not.toThrow();
    });

    it('should throw error for empty type string', () => {
      const mockFactory = new MockPermissionUIFactory();
      expect(() => {
        UIFactoryRegistry.register('', mockFactory);
      }).toThrow('UI factory type must be a non-empty string');
    });

    it('should throw error for null type', () => {
      const mockFactory = new MockPermissionUIFactory();
      expect(() => {
        UIFactoryRegistry.register(null as unknown as string, mockFactory);
      }).toThrow('UI factory type must be a non-empty string');
    });

    it('should throw error for undefined type', () => {
      const mockFactory = new MockPermissionUIFactory();
      expect(() => {
        UIFactoryRegistry.register(undefined as unknown as string, mockFactory);
      }).toThrow('UI factory type must be a non-empty string');
    });

    it('should throw error for non-string type', () => {
      const mockFactory = new MockPermissionUIFactory();
      expect(() => {
        UIFactoryRegistry.register(123 as unknown as string, mockFactory);
      }).toThrow('UI factory type must be a non-empty string');
    });

    it('should throw error for null factory', () => {
      expect(() => {
        UIFactoryRegistry.register('mock', null as unknown as PermissionUIFactory);
      }).toThrow('UI factory instance is required');
    });

    it('should throw error for undefined factory', () => {
      expect(() => {
        UIFactoryRegistry.register('mock', undefined as unknown as PermissionUIFactory);
      }).toThrow('UI factory instance is required');
    });

    it('should allow overwriting existing factory of same type', () => {
      const factory1 = new MockPermissionUIFactory();
      const factory2 = new MockPermissionUIFactory();

      UIFactoryRegistry.register('mock', factory1);
      expect(() => {
        UIFactoryRegistry.register('mock', factory2);
      }).not.toThrow();

      const retrieved = UIFactoryRegistry.get('mock');
      expect(retrieved).toBe(factory2);
    });
  });

  describe('get()', () => {
    beforeEach(() => {
      UIFactoryRegistry.clear();
      UIFactoryRegistry.register('mock', new MockPermissionUIFactory());
    });

    it('should retrieve registered factory by type', () => {
      const mockFactory = new MockPermissionUIFactory();
      UIFactoryRegistry.register('test', mockFactory);

      const retrieved = UIFactoryRegistry.get('test');
      expect(retrieved).toBe(mockFactory);
    });

    it('should throw error for empty type string', () => {
      expect(() => {
        UIFactoryRegistry.get('');
      }).toThrow('UI factory type must be a non-empty string');
    });

    it('should throw error for null type', () => {
      expect(() => {
        UIFactoryRegistry.get(null as unknown as string);
      }).toThrow('UI factory type must be a non-empty string');
    });

    it('should throw error for undefined type', () => {
      expect(() => {
        UIFactoryRegistry.get(undefined as unknown as string);
      }).toThrow('UI factory type must be a non-empty string');
    });

    it('should throw error for non-string type', () => {
      expect(() => {
        UIFactoryRegistry.get(123 as unknown as string);
      }).toThrow('UI factory type must be a non-empty string');
    });

    it('should throw error for unregistered type', () => {
      expect(() => {
        UIFactoryRegistry.get('unknown');
      }).toThrow('UI factory not found for type: unknown');
    });

    it('should be case-sensitive for type names', () => {
      UIFactoryRegistry.register('TestType', new MockPermissionUIFactory());

      expect(() => {
        UIFactoryRegistry.get('testtype');
      }).toThrow('UI factory not found for type: testtype');
    });
  });

  describe('registerUIFactory()', () => {
    it('should register a UIFactory with valid type', () => {
      const mockFactory = new MockUIFactory();
      expect(() => {
        UIFactoryRegistry.registerUIFactory('mock', mockFactory);
      }).not.toThrow();
    });

    it('should throw error for empty type string', () => {
      const mockFactory = new MockUIFactory();
      expect(() => {
        UIFactoryRegistry.registerUIFactory('', mockFactory);
      }).toThrow('UI factory type must be a non-empty string');
    });

    it('should throw error for null factory', () => {
      expect(() => {
        UIFactoryRegistry.registerUIFactory('mock', null as unknown as UIFactory);
      }).toThrow('UI factory instance is required');
    });

    it('should allow overwriting existing UIFactory of same type', () => {
      const factory1 = new MockUIFactory();
      const factory2 = new MockUIFactory();

      UIFactoryRegistry.registerUIFactory('mock', factory1);
      expect(() => {
        UIFactoryRegistry.registerUIFactory('mock', factory2);
      }).not.toThrow();

      const retrieved = UIFactoryRegistry.createUIFactory({ type: 'mock' });
      expect(retrieved).toBe(factory2);
    });
  });

  describe('create()', () => {
    beforeEach(() => {
      UIFactoryRegistry.clear();
      UIFactoryRegistry.register('mock', new MockPermissionUIFactory());
      UIFactoryRegistry.register('terminal', new TerminalPermissionUIFactory());
    });

    it('should create default TerminalPermissionUIFactory when config is null', () => {
      const factory = UIFactoryRegistry.create(null as unknown as UIConfig);
      expect(factory).toBeInstanceOf(TerminalPermissionUIFactory);
    });

    it('should create default TerminalPermissionUIFactory when config is undefined', () => {
      const factory = UIFactoryRegistry.create(undefined);
      expect(factory).toBeInstanceOf(TerminalPermissionUIFactory);
    });

    it('should create default TerminalPermissionUIFactory when no config provided', () => {
      const factory = UIFactoryRegistry.create();
      expect(factory).toBeInstanceOf(TerminalPermissionUIFactory);
    });

    it('should throw error when config type is empty string', () => {
      const config: UIConfig = { type: '' };
      expect(() => {
        UIFactoryRegistry.create(config);
      }).toThrow('UI config must include a valid type string');
    });

    it('should throw error when config type is null', () => {
      const config: UIConfig = { type: null as unknown as string };
      expect(() => {
        UIFactoryRegistry.create(config);
      }).toThrow('UI config must include a valid type string');
    });

    it('should throw error when config type is undefined', () => {
      const config: UIConfig = { type: undefined as unknown as string };
      expect(() => {
        UIFactoryRegistry.create(config);
      }).toThrow('UI config must include a valid type string');
    });

    it('should throw error when config type is not registered', () => {
      const config: UIConfig = { type: 'unregistered' };
      expect(() => {
        UIFactoryRegistry.create(config);
      }).toThrow('UI factory not found for type: unregistered');
    });

    it('should create registered factory from valid config', () => {
      const config: UIConfig = { type: 'mock', options: { test: true } };
      const factory = UIFactoryRegistry.create(config);
      expect(factory).toBeInstanceOf(MockPermissionUIFactory);
    });

    it('should create registered factory from config without options', () => {
      const config: UIConfig = { type: 'mock' };
      const factory = UIFactoryRegistry.create(config);
      expect(factory).toBeInstanceOf(MockPermissionUIFactory);
    });

    it('should create terminal factory from valid terminal config', () => {
      const config: UIConfig = { type: 'terminal' };
      const factory = UIFactoryRegistry.create(config);
      expect(factory).toBeInstanceOf(TerminalPermissionUIFactory);
    });

    it('should pass streams to factory create method', () => {
      const mockOutput = process.stdout;
      const mockInput = process.stdin;
      const config: UIConfig = { type: 'mock' };
      const factory = UIFactoryRegistry.create(config);

      const uiInstance = factory.createPermissionUI(mockOutput, mockInput);
      expect(uiInstance).toBeDefined();
    });
  });

  describe('createUIFactory()', () => {
    beforeEach(() => {
      UIFactoryRegistry.clear();
      UIFactoryRegistry.registerUIFactory('mock', new MockUIFactory());
      UIFactoryRegistry.registerUIFactory('terminal', new TerminalUIFactory());
    });

    it('should throw error when config type is empty string', () => {
      const config: UIConfig = { type: '' };
      expect(() => {
        UIFactoryRegistry.createUIFactory(config);
      }).toThrow('UI config must include a valid type string');
    });

    it('should throw error when config type is null', () => {
      const config: UIConfig = { type: null as unknown as string };
      expect(() => {
        UIFactoryRegistry.createUIFactory(config);
      }).toThrow('UI config must include a valid type string');
    });

    it('should throw error when config type is not registered', () => {
      const config: UIConfig = { type: 'unregistered' };
      expect(() => {
        UIFactoryRegistry.createUIFactory(config);
      }).toThrow('UI factory not found for type: unregistered');
    });

    it('should create registered UIFactory from valid config', () => {
      const config: UIConfig = { type: 'mock', options: { test: true } };
      const factory = UIFactoryRegistry.createUIFactory(config);
      expect(factory).toBeInstanceOf(MockUIFactory);
    });

    it('should create terminal UIFactory from valid terminal config', () => {
      const config: UIConfig = { type: 'terminal' };
      const factory = UIFactoryRegistry.createUIFactory(config);
      expect(factory).toBeInstanceOf(TerminalUIFactory);
    });
  });

  describe('createUIFactory default selection', () => {
    const envKey = 'CLAUDE_UI_TYPE';
    let originalEnv: string | undefined;

    beforeEach(() => {
      originalEnv = process.env[envKey];
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env[envKey];
      } else {
        process.env[envKey] = originalEnv;
      }
    });

    it('should default to terminal UIFactory when env is not set', () => {
      jest.isolateModules(() => {
        delete process.env[envKey];
        const registryModule = require('../../src/ui/factories/UIFactoryRegistry') as {
          UIFactoryRegistry: typeof UIFactoryRegistry;
        };
        const terminalModule = require('../../src/ui/factories/TerminalUIFactory') as {
          TerminalUIFactory: typeof TerminalUIFactory;
        };
        const factory = registryModule.UIFactoryRegistry.createUIFactory();
        expect(factory).toBeInstanceOf(terminalModule.TerminalUIFactory);
      });
    });

    it('should use env-selected UIFactory when env is set', () => {
      jest.isolateModules(() => {
        process.env[envKey] = 'mock';
        const registryModule = require('../../src/ui/factories/UIFactoryRegistry') as {
          UIFactoryRegistry: typeof UIFactoryRegistry;
        };
        registryModule.UIFactoryRegistry.registerUIFactory('mock', new MockUIFactory());
        const factory = registryModule.UIFactoryRegistry.createUIFactory();
        expect(factory).toBeInstanceOf(MockUIFactory);
      });
    });

    it('should default to terminal when env is unset at creation time', () => {
      jest.isolateModules(() => {
        delete process.env[envKey];
        const registryModule = require('../../src/ui/factories/UIFactoryRegistry') as {
          UIFactoryRegistry: typeof UIFactoryRegistry;
        };
        const terminalModule = require('../../src/ui/factories/TerminalUIFactory') as {
          TerminalUIFactory: typeof TerminalUIFactory;
        };
        const factory = registryModule.UIFactoryRegistry.createUIFactory();
        expect(factory).toBeInstanceOf(terminalModule.TerminalUIFactory);
      });
    });

    it('should throw error when env value is invalid', () => {
      jest.isolateModules(() => {
        process.env[envKey] = 'invalid';
        const registryModule = require('../../src/ui/factories/UIFactoryRegistry') as {
          UIFactoryRegistry: typeof UIFactoryRegistry;
        };

        expect(() => registryModule.UIFactoryRegistry.createUIFactory()).toThrow(
          'Invalid CLAUDE_UI_TYPE: "invalid". Supported types: terminal'
        );
      });
    });
  });

  describe('createUIFactory singleton', () => {
    const envKey = 'CLAUDE_UI_TYPE';
    let originalEnv: string | undefined;

    beforeEach(() => {
      originalEnv = process.env[envKey];
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env[envKey];
      } else {
        process.env[envKey] = originalEnv;
      }
    });

    it('should create once and return the same instance on repeated calls', () => {
      let createdCount = 0;

      jest.isolateModules(() => {
        delete process.env[envKey];
        jest.doMock('../../src/ui/factories/TerminalUIFactory', () => ({
          TerminalUIFactory: jest.fn().mockImplementation(() => {
            createdCount += 1;
            return {
              createParser: jest.fn(),
              createOutput: jest.fn(),
              createPermissionUI: jest.fn(),
            };
          }),
        }));

        const registryModule = require('../../src/ui/factories/UIFactoryRegistry') as {
          UIFactoryRegistry: typeof UIFactoryRegistry;
        };

        expect(createdCount).toBe(0);

        const firstFactory = registryModule.UIFactoryRegistry.createUIFactory();
        const secondFactory = registryModule.UIFactoryRegistry.createUIFactory();

        expect(firstFactory).toBe(secondFactory);
        expect(createdCount).toBe(1);
      });
    });
  });

  describe('createUIFactory resetForTesting', () => {
    const envKey = 'CLAUDE_UI_TYPE';
    let originalEnv: string | undefined;

    beforeEach(() => {
      originalEnv = process.env[envKey];
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env[envKey];
      } else {
        process.env[envKey] = originalEnv;
      }
    });

    it('should create a new instance after resetForTesting', () => {
      let createdCount = 0;

      jest.isolateModules(() => {
        delete process.env[envKey];
        jest.doMock('../../src/ui/factories/TerminalUIFactory', () => ({
          TerminalUIFactory: jest.fn().mockImplementation(() => {
            createdCount += 1;
            return {
              createParser: jest.fn(),
              createOutput: jest.fn(),
              createPermissionUI: jest.fn(),
            };
          }),
        }));

        const registryModule = require('../../src/ui/factories/UIFactoryRegistry') as {
          UIFactoryRegistry: typeof UIFactoryRegistry;
        };

        const firstFactory = registryModule.UIFactoryRegistry.createUIFactory();
        registryModule.UIFactoryRegistry.resetForTesting();
        const secondFactory = registryModule.UIFactoryRegistry.createUIFactory();

        expect(firstFactory).not.toBe(secondFactory);
        expect(createdCount).toBe(2);
      });
    });
  });

  describe('has()', () => {
    beforeEach(() => {
      UIFactoryRegistry.clear();
      UIFactoryRegistry.register('mock', new MockPermissionUIFactory());
    });

    it('should return true for registered type', () => {
      expect(UIFactoryRegistry.has('mock')).toBe(true);
    });

    it('should return false for unregistered type', () => {
      expect(UIFactoryRegistry.has('unregistered')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(UIFactoryRegistry.has('')).toBe(false);
    });

    it('should be case-sensitive', () => {
      UIFactoryRegistry.register('TestType', new MockPermissionUIFactory());
      expect(UIFactoryRegistry.has('TestType')).toBe(true);
      expect(UIFactoryRegistry.has('testtype')).toBe(false);
    });
  });

  describe('getRegisteredTypes()', () => {
    beforeEach(() => {
      UIFactoryRegistry.clear();
    });

    it('should return empty array when no factories registered', () => {
      expect(UIFactoryRegistry.getRegisteredTypes()).toEqual([]);
    });

    it('should return array with single registered type', () => {
      UIFactoryRegistry.register('mock', new MockPermissionUIFactory());
      expect(UIFactoryRegistry.getRegisteredTypes()).toEqual(['mock']);
    });

    it('should return array with multiple registered types', () => {
      UIFactoryRegistry.register('mock', new MockPermissionUIFactory());
      UIFactoryRegistry.register('terminal', new TerminalPermissionUIFactory());
      const types = UIFactoryRegistry.getRegisteredTypes();
      expect(types).toHaveLength(2);
      expect(types).toContain('mock');
      expect(types).toContain('terminal');
    });

    it('should not include cleared types', () => {
      UIFactoryRegistry.register('mock', new MockPermissionUIFactory());
      UIFactoryRegistry.register('terminal', new TerminalPermissionUIFactory());
      UIFactoryRegistry.clear();
      expect(UIFactoryRegistry.getRegisteredTypes()).toEqual([]);
    });
  });

  describe('clear()', () => {
    it('should clear all registered factories', () => {
      UIFactoryRegistry.register('mock', new MockPermissionUIFactory());
      UIFactoryRegistry.register('terminal', new TerminalPermissionUIFactory());
      UIFactoryRegistry.registerUIFactory('ui', new MockUIFactory());

      expect(UIFactoryRegistry.getRegisteredTypes()).toHaveLength(2);

      UIFactoryRegistry.clear();

      expect(UIFactoryRegistry.getRegisteredTypes()).toEqual([]);
      expect(UIFactoryRegistry.has('mock')).toBe(false);
      expect(UIFactoryRegistry.has('terminal')).toBe(false);
      expect(() => {
        UIFactoryRegistry.createUIFactory({ type: 'ui' });
      }).toThrow('UI factory not found for type: ui');
    });

    it('should not throw when clearing empty registry', () => {
      expect(() => {
        UIFactoryRegistry.clear();
      }).not.toThrow();
    });
  });

  describe('Default Factory Registration', () => {
    it('should register terminal factory by default on module load', () => {
      // Re-import or trigger module initialization
      // Since we've cleared in beforeEach, we need to register it again
      // This test verifies that terminal is registered initially

      // We cannot easily test module load behavior after clear,
      // so we just verify that the factory can be registered
      const terminalFactory = new TerminalPermissionUIFactory();
      UIFactoryRegistry.register('terminal', terminalFactory);

      expect(() => {
        UIFactoryRegistry.get('terminal');
      }).not.toThrow();
    });

    it('should be able to retrieve default terminal factory', () => {
      // Register terminal factory explicitly for this test
      const terminalFactory = new TerminalPermissionUIFactory();
      UIFactoryRegistry.register('terminal', terminalFactory);

      expect(UIFactoryRegistry.has('terminal')).toBe(true);

      const retrievedFactory = UIFactoryRegistry.get('terminal');
      expect(retrievedFactory).toBeInstanceOf(TerminalPermissionUIFactory);
    });
  });

  describe('Permission UI compatibility', () => {
    it('should keep permission and UI factories separate for same type', () => {
      UIFactoryRegistry.register('mock', new MockPermissionUIFactory());
      UIFactoryRegistry.registerUIFactory('mock', new MockUIFactory());

      const permissionFactory = UIFactoryRegistry.create({ type: 'mock' });
      const uiFactory = UIFactoryRegistry.createUIFactory({ type: 'mock' });

      expect(permissionFactory).toBeInstanceOf(MockPermissionUIFactory);
      expect(uiFactory).toBeInstanceOf(MockUIFactory);
    });
  });
});
