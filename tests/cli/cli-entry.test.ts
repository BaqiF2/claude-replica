/**
 * CLI 入口点测试
 *
 * 验证 cli.ts 初始化 UIFactory 并注入 Application。
 */

import type { UIFactory } from '../../src/ui/factories/UIFactory';

describe('cli.ts 入口点', () => {
  const originalClaudeUiType = process.env.CLAUDE_UI_TYPE;
  const originalArgv = process.argv.slice();

  const createMockFactory = (): UIFactory =>
    ({
      createParser: jest.fn(),
      createOutput: jest.fn(),
    }) as unknown as UIFactory;

  const flushMicrotasks = async (): Promise<void> =>
    new Promise((resolve) => setImmediate(resolve));

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    if (originalClaudeUiType === undefined) {
      delete process.env.CLAUDE_UI_TYPE;
    } else {
      process.env.CLAUDE_UI_TYPE = originalClaudeUiType;
    }
    process.argv = originalArgv.slice();
    jest.restoreAllMocks();
    jest.dontMock('../../src/ui/factories/UIFactoryRegistry');
    jest.dontMock('../../src/main');
    jest.resetModules();
  });

  it('应创建 UIFactory 并注入 Application', async () => {
    const mockFactory = createMockFactory();
    const createUIFactory = jest.fn(() => mockFactory);
    const run = jest.fn().mockResolvedValue(0);
    const ApplicationMock = jest.fn().mockImplementation(() => ({ run }));
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    jest.doMock('../../src/ui/factories/UIFactoryRegistry', () => ({
      UIFactoryRegistry: { createUIFactory },
    }));
    jest.doMock('../../src/main', () => ({ Application: ApplicationMock }));

    jest.isolateModules(() => {
      require('../../src/cli');
    });

    await flushMicrotasks();

    expect(createUIFactory).toHaveBeenCalledTimes(1);
    expect(ApplicationMock).toHaveBeenCalledWith(mockFactory);
    expect(run).toHaveBeenCalledWith(process.argv.slice(2));
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('应使用 CLAUDE_UI_TYPE 对应的工厂', async () => {
    process.env.CLAUDE_UI_TYPE = 'mock';

    const mockFactory = createMockFactory();
    const run = jest.fn().mockResolvedValue(0);
    const ApplicationMock = jest.fn().mockImplementation(() => ({ run }));
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    jest.doMock('../../src/main', () => ({ Application: ApplicationMock }));

    jest.isolateModules(() => {
      const { UIFactoryRegistry } = require('../../src/ui/factories/UIFactoryRegistry');
      UIFactoryRegistry.registerUIFactory('mock', mockFactory);
      require('../../src/cli');
    });

    await flushMicrotasks();

    expect(ApplicationMock).toHaveBeenCalledWith(mockFactory);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("未设置 CLAUDE_UI_TYPE 时应使用默认 'terminal' 工厂", async () => {
    delete process.env.CLAUDE_UI_TYPE;

    const mockFactory = createMockFactory();
    const run = jest.fn().mockResolvedValue(0);
    const ApplicationMock = jest.fn().mockImplementation(() => ({ run }));
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    jest.doMock('../../src/main', () => ({ Application: ApplicationMock }));

    jest.isolateModules(() => {
      const { UIFactoryRegistry } = require('../../src/ui/factories/UIFactoryRegistry');
      UIFactoryRegistry.registerUIFactory('terminal', mockFactory);
      require('../../src/cli');
    });

    await flushMicrotasks();

    expect(ApplicationMock).toHaveBeenCalledWith(mockFactory);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
