import { AgentDefinition, AgentRegistry } from '../../../src/agents/AgentRegistry';

const PRESET_AGENT_NAMES = [
  'code-reviewer',
  'test-runner',
  'doc-generator',
  'refactoring-specialist',
  'security-auditor',
  'data-analyzer',
];

const [KNOWN_AGENT_NAME] = PRESET_AGENT_NAMES;
const UNKNOWN_AGENT_NAME = 'unknown-agent';

const createAgentDefinition = (
  overrides: Partial<AgentDefinition> = {}
): AgentDefinition => ({
  description: 'Valid description for testing purposes.',
  prompt: 'Valid prompt for testing purposes with enough detail.',
  ...overrides,
});

describe('AgentRegistry', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getAll should return all preset agents', () => {
    const registry = new AgentRegistry();
    const agents = registry.getAll();

    expect(Object.keys(agents).sort()).toEqual([...PRESET_AGENT_NAMES].sort());
  });

  it('getAgent should return a preset agent by name', () => {
    const registry = new AgentRegistry();
    const agent = registry.getAgent(KNOWN_AGENT_NAME);

    expect(agent).toBeDefined();
    expect(agent?.description).toBeTruthy();
    expect(agent?.prompt).toBeTruthy();
  });

  it('getAgent should return undefined for unknown names', () => {
    const registry = new AgentRegistry();
    const agent = registry.getAgent(UNKNOWN_AGENT_NAME);

    expect(agent).toBeUndefined();
  });

  it('validateAgentDefinitions should filter Task tool and warn', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const agents: Record<string, AgentDefinition> = {
      tester: createAgentDefinition({ tools: ['Read', 'Task', 'Write'] }),
    };

    const validated = AgentRegistry.validateAgentDefinitions(agents);

    expect(validated.tester.tools).toEqual(['Read', 'Write']);
    expect(warnSpy).toHaveBeenCalledWith(
      'Warning: Task tool removed from subagent definition',
      { name: 'tester' }
    );
  });

  it('validateAgentDefinitions should require description', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const agents: Record<string, AgentDefinition> = {
      tester: createAgentDefinition({ description: '' }),
    };

    const validated = AgentRegistry.validateAgentDefinitions(agents);

    expect(validated).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith(
      'Warning: Agent definition missing required fields',
      { name: 'tester' }
    );
  });

  it('validateAgentDefinitions should require prompt', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const agents: Record<string, AgentDefinition> = {
      tester: createAgentDefinition({ prompt: '' }),
    };

    const validated = AgentRegistry.validateAgentDefinitions(agents);

    expect(validated).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith(
      'Warning: Agent definition missing required fields',
      { name: 'tester' }
    );
  });

  it('validateAgentDefinitions should normalize invalid model and warn', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const agents: Record<string, AgentDefinition> = {
      tester: createAgentDefinition({
        model: 'invalid-model' as AgentDefinition['model'],
      }),
    };

    const validated = AgentRegistry.validateAgentDefinitions(agents);

    expect(validated.tester.model).toBe('inherit');
    expect(warnSpy).toHaveBeenCalledWith(
      'Warning: Invalid model replaced with inherit',
      { name: 'tester', model: 'invalid-model' }
    );
  });
});
