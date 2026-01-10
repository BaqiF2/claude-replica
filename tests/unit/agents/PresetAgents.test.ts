import {
  getPresetAgents,
  getPresetAgentNames,
  isPresetAgent,
} from '../../../src/agents/PresetAgents';

const EXPECTED_AGENT_COUNT = parseInt(process.env.PRESET_AGENT_COUNT || '6', 10);
const MIN_DESCRIPTION_LENGTH = parseInt(
  process.env.PRESET_AGENT_DESCRIPTION_MIN || '20',
  10
);
const MIN_PROMPT_LENGTH = parseInt(process.env.PRESET_AGENT_PROMPT_MIN || '50', 10);
const EXPECTED_AGENT_NAMES = [
  'code-reviewer',
  'test-runner',
  'doc-generator',
  'refactoring-specialist',
  'security-auditor',
  'data-analyzer',
];
const NON_PRESET_AGENT_NAME = 'unknown-agent';
const DISALLOWED_TOOL_NAME = 'Task';

describe('PresetAgents', () => {
  it('getPresetAgents should return expected agent count', () => {
    const agents = getPresetAgents();
    expect(Object.keys(agents)).toHaveLength(EXPECTED_AGENT_COUNT);
  });

  it('preset agents should not include Task tool', () => {
    const agents = getPresetAgents();

    for (const definition of Object.values(agents)) {
      expect(definition.tools ?? []).not.toContain(DISALLOWED_TOOL_NAME);
    }
  });

  it('preset agents should have valid descriptions', () => {
    const agents = getPresetAgents();

    for (const definition of Object.values(agents)) {
      expect(definition.description.length).toBeGreaterThan(MIN_DESCRIPTION_LENGTH);
    }
  });

  it('preset agents should have valid prompts', () => {
    const agents = getPresetAgents();

    for (const definition of Object.values(agents)) {
      expect(definition.prompt.length).toBeGreaterThan(MIN_PROMPT_LENGTH);
    }
  });

  it('getPresetAgentNames should return expected names', () => {
    expect(getPresetAgentNames()).toEqual(EXPECTED_AGENT_NAMES);
  });

  it('isPresetAgent should detect preset agent names', () => {
    for (const name of EXPECTED_AGENT_NAMES) {
      expect(isPresetAgent(name)).toBe(true);
    }

    expect(isPresetAgent(NON_PRESET_AGENT_NAME)).toBe(false);
  });
});
