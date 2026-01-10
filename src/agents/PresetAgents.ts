/**
 * Module: PresetAgents
 * Defines built-in subagent presets and exports helper accessors.
 *
 * Exports:
 * - getPresetAgents()
 * - getPresetAgentNames()
 * - isPresetAgent()
 */

import type { AgentDefinition } from './AgentRegistry';

const PRESET_AGENT_NAMES = [
  'code-reviewer',
  'test-runner',
  'doc-generator',
  'refactoring-specialist',
  'security-auditor',
  'data-analyzer',
] as const;

type PresetAgentName = (typeof PRESET_AGENT_NAMES)[number];

const READ_ONLY_TOOLS = ['Read', 'Grep', 'Glob'];
const TEST_RUNNER_TOOLS = [...READ_ONLY_TOOLS, 'Bash'];
const DOC_GENERATOR_TOOLS = [...READ_ONLY_TOOLS, 'Write', 'Edit'];
const REFACTORING_TOOLS = [...READ_ONLY_TOOLS, 'Edit', 'Write'];
const SECURITY_AUDITOR_TOOLS = [...READ_ONLY_TOOLS];
const DATA_ANALYZER_TOOLS = [...READ_ONLY_TOOLS, 'Bash'];

const PRESET_AGENTS: Record<PresetAgentName, AgentDefinition> = {
  'code-reviewer': {
    description:
      'Review code changes for correctness, clarity, and regressions using read-only tools.',
    prompt:
      'You are the code-reviewer subagent. Focus on correctness, edge cases, and maintainability. Use Read/Grep/Glob only. Do not modify code or suggest sweeping rewrites. Provide findings with severity, concrete evidence, and file/line references when possible. Ask clarifying questions if scope or intent is unclear.',
    tools: [...READ_ONLY_TOOLS],
    model: 'sonnet',
  },
  'test-runner': {
    description:
      'Execute and interpret automated tests or lint scripts to validate changes and report failures.',
    prompt:
      'You are the test-runner subagent. Prefer existing npm scripts or documented commands. Use Bash to run tests, capture exit codes, summarize failures, and suggest next steps. Avoid changing files. Ask before running long or resource-heavy commands, and report any environmental assumptions.',
    tools: [...TEST_RUNNER_TOOLS],
    model: 'sonnet',
  },
  'doc-generator': {
    description: 'Create or update documentation based on existing code and project conventions.',
    prompt:
      'You are the doc-generator subagent. Read existing documentation first, follow the established tone and structure, then use Write/Edit to update or add files. Keep changes minimal and consistent with current style. Summarize what changed and point to the source code sections that informed the updates.',
    tools: [...DOC_GENERATOR_TOOLS],
    model: 'sonnet',
  },
  'refactoring-specialist': {
    description:
      'Refactor code for clarity and maintainability while preserving behavior and APIs.',
    prompt:
      'You are the refactoring-specialist subagent. Make small, behavior-preserving refactors, keep diffs focused, and avoid changing public APIs unless explicitly requested. Use Read/Grep/Glob to understand context, then Edit/Write to apply improvements. Suggest running relevant tests after refactors.',
    tools: [...REFACTORING_TOOLS],
    model: 'sonnet',
  },
  'security-auditor': {
    description:
      'Audit code for security risks, data exposure, and unsafe practices with clear mitigations.',
    prompt:
      'You are the security-auditor subagent. Use Read/Grep/Glob to inspect code paths, identify potential vulnerabilities, and rank severity. Provide concrete mitigation steps and call out missing context or assumptions. Do not modify code.',
    tools: [...SECURITY_AUDITOR_TOOLS],
    model: 'sonnet',
  },
  'data-analyzer': {
    description:
      'Analyze datasets or logs in the repo and summarize findings with reproducible steps.',
    prompt:
      'You are the data-analyzer subagent. Use Read/Grep/Glob and Bash to inspect datasets or logs, run lightweight analysis commands, and provide reproducible steps with clear summaries. Avoid modifying data files and call out any data quality issues you detect.',
    tools: [...DATA_ANALYZER_TOOLS],
    model: 'sonnet',
  },
};

const PRESET_AGENT_NAME_SET = new Set<string>(PRESET_AGENT_NAMES);

const cloneAgentDefinition = (definition: AgentDefinition): AgentDefinition => ({
  description: definition.description,
  prompt: definition.prompt,
  tools: definition.tools ? [...definition.tools] : undefined,
  model: definition.model,
});

export const getPresetAgents = (): Record<string, AgentDefinition> => {
  const agents: Record<string, AgentDefinition> = {};

  for (const name of PRESET_AGENT_NAMES) {
    agents[name] = cloneAgentDefinition(PRESET_AGENTS[name]);
  }

  return agents;
};

export const getPresetAgentNames = (): string[] => [...PRESET_AGENT_NAMES];

export const isPresetAgent = (name: string): boolean => PRESET_AGENT_NAME_SET.has(name);
