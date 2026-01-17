const createCallbacks = () => ({
  onMessage: async () => {},
  onCommand: async () => {},
  onInterrupt: () => {},
  onRewind: async () => {},
});

const loadRegistry = async () => {
  jest.resetModules();
  return import('../../src/ui/factories/UIFactoryRegistry');
};

describe('UI type switching', () => {
  const originalUiType = process.env.CLAUDE_UI_TYPE;

  afterEach(() => {
    if (typeof originalUiType === 'undefined') {
      delete process.env.CLAUDE_UI_TYPE;
    } else {
      process.env.CLAUDE_UI_TYPE = originalUiType;
    }
  });

  it('uses TerminalInteractiveUI when CLAUDE_UI_TYPE=terminal', async () => {
    process.env.CLAUDE_UI_TYPE = 'terminal';

    const { UIFactoryRegistry } = await loadRegistry();
    UIFactoryRegistry.resetForTesting();

    const uiFactory = UIFactoryRegistry.createUIFactory();
    const ui = uiFactory.createInteractiveUI(createCallbacks());

    const { TerminalInteractiveUI } = await import('../../src/ui/TerminalInteractiveUI');
    expect(ui).toBeInstanceOf(TerminalInteractiveUI);
  });

  it('defaults to TerminalUIFactory when CLAUDE_UI_TYPE is unset', async () => {
    delete process.env.CLAUDE_UI_TYPE;

    const { UIFactoryRegistry } = await loadRegistry();
    UIFactoryRegistry.resetForTesting();

    const uiFactory = UIFactoryRegistry.createUIFactory();

    const { TerminalUIFactory } = await import('../../src/ui/factories/TerminalUIFactory');
    expect(uiFactory).toBeInstanceOf(TerminalUIFactory);
  });
});
