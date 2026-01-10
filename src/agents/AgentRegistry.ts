/**
 * 文件功能：子代理注册表，提供程序化定义的预设子代理并进行校验修正
 *
 * 核心类：
 * - AgentRegistry: 提供预设代理定义访问，已移除文件系统加载逻辑
 *
 * 核心方法：
 * - getAll(): 获取所有预设代理定义
 * - getAgent(): 获取指定名称代理
 * - getAgentsForSDK(): 获取 SDK 兼容格式
 * - validateAgentDefinitions(): 校验并修正代理定义
 */

import { getPresetAgents } from './PresetAgents';

/**
 * SDK 的 AgentDefinition 类型
 * 用于 query() 函数的 agents 选项
 */
export interface AgentDefinition {
  /** 代理描述 */
  description: string;
  /** 允许使用的工具列表 */
  tools?: string[];
  /** 代理提示词 */
  prompt: string;
  /** 使用的模型 */
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
}

/**
 * 代理接口（用于内部加载和管理）
 */
export interface Agent extends AgentDefinition {
  /** 代理文件来源路径 */
  sourcePath?: string;
  /** 代理来源类型 */
  sourceType?: 'user' | 'project';
  /** 元数据（YAML frontmatter 中的其他字段） */
  metadata?: Record<string, unknown>;
}

/**
 * 代理注册表配置
 */
export interface AgentRegistryConfig {
  /** @deprecated 文件系统子代理已移除，此配置不再使用 */
  userAgentsDir?: string;
  /** @deprecated 文件系统子代理已移除，此配置不再使用 */
  projectAgentsDir?: string;
}

const VALID_MODELS = new Set<NonNullable<AgentDefinition['model']>>([
  'sonnet',
  'opus',
  'haiku',
  'inherit',
]);
const TASK_TOOL_NAME = 'Task';
const DEFAULT_MODEL: AgentDefinition['model'] = 'inherit';

const isNonEmptyString = (value: string | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const cloneAgentDefinition = (definition: AgentDefinition): AgentDefinition => ({
  description: definition.description,
  prompt: definition.prompt,
  tools: definition.tools ? [...definition.tools] : undefined,
  model: definition.model,
});

/**
 * 子代理注册表
 *
 * 提供预设代理定义并输出 SDK 兼容格式
 */
export class AgentRegistry {
  constructor(_config?: AgentRegistryConfig) {}

  /**
   * 获取所有预设代理定义
   */
  getAll(): Record<string, AgentDefinition> {
    const agents = getPresetAgents();
    return AgentRegistry.validateAgentDefinitions(agents);
  }

  /**
   * 获取指定代理
   */
  getAgent(name: string): AgentDefinition | undefined {
    const agents = this.getAll();
    return agents[name] ? cloneAgentDefinition(agents[name]) : undefined;
  }

  /**
   * 转换为 SDK 格式
   */
  getAgentsForSDK(): Record<string, AgentDefinition> {
    return this.getAll();
  }

  /**
   * 校验并修正代理定义
   */
  static validateAgentDefinitions(
    agents: Record<string, AgentDefinition>
  ): Record<string, AgentDefinition> {
    const validated: Record<string, AgentDefinition> = {};

    for (const [name, definition] of Object.entries(agents)) {
      if (!isNonEmptyString(definition.description) || !isNonEmptyString(definition.prompt)) {
        console.warn('Warning: Agent definition missing required fields', { name });
        continue;
      }

      const cleanedTools = definition.tools ? [...definition.tools] : undefined;
      const filteredTools = cleanedTools
        ? cleanedTools.filter((tool) => tool !== TASK_TOOL_NAME)
        : undefined;

      if (cleanedTools && filteredTools && cleanedTools.length !== filteredTools.length) {
        console.warn('Warning: Task tool removed from subagent definition', { name });
      }

      const model = definition.model;
      const normalizedModel = model && !VALID_MODELS.has(model) ? DEFAULT_MODEL : definition.model;

      if (model && normalizedModel !== model) {
        console.warn('Warning: Invalid model replaced with inherit', { name, model });
      }

      validated[name] = {
        description: definition.description,
        prompt: definition.prompt,
        tools: filteredTools && filteredTools.length > 0 ? filteredTools : undefined,
        model: normalizedModel,
      };
    }

    return validated;
  }
}
