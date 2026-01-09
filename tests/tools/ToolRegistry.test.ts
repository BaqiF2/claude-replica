/**
 * ToolRegistry 单元测试
 * 
 * 测试工具注册表的核心功能
 * **验证: 需求 2.1, 3.1, 4.1**
 */

import { ToolRegistry, ToolCategory, ToolConfig } from '../../src/tools/ToolRegistry';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('getDefaultTools', () => {
    it('应返回默认工具列表', () => {
      const defaultTools = registry.getDefaultTools();

      expect(defaultTools).toContain('Read');
      expect(defaultTools).toContain('Write');
      expect(defaultTools).toContain('Edit');
      expect(defaultTools).toContain('Bash');
      expect(defaultTools).toContain('Grep');
      expect(defaultTools).toContain('Glob');
      expect(defaultTools).toHaveLength(6);
    });

    it('默认工具应都是有效工具', () => {
      const defaultTools = registry.getDefaultTools();

      for (const tool of defaultTools) {
        expect(registry.isValidTool(tool)).toBe(true);
      }
    });
  });

  describe('getAllTools', () => {
    it('应返回所有可用工具', () => {
      const allTools = registry.getAllTools();

      // 验证包含所有预期的工具
      const expectedTools = [
        'Read', 'Write', 'Edit',
        'Bash', 'BashOutput', 'KillBash',
        'Grep', 'Glob',
        'Task',
        'Skill',
        'AskUserQuestion',
        'WebFetch', 'WebSearch',
        'TodoWrite',
        'NotebookEdit',
        'ExitPlanMode',
        'ListMcpResources', 'ReadMcpResource',
      ];

      for (const tool of expectedTools) {
        expect(allTools).toContain(tool);
      }
    });

    it('所有工具应都有元数据', () => {
      const allTools = registry.getAllTools();

      for (const tool of allTools) {
        const metadata = registry.getToolMetadata(tool);
        expect(metadata).toBeDefined();
        expect(metadata?.name).toBe(tool);
        expect(metadata?.category).toBeDefined();
        expect(metadata?.description).toBeDefined();
        expect(typeof metadata?.dangerous).toBe('boolean');
      }
    });
  });

  describe('isValidTool', () => {
    it('应识别有效的工具名称', () => {
      expect(registry.isValidTool('Read')).toBe(true);
      expect(registry.isValidTool('Write')).toBe(true);
      expect(registry.isValidTool('Bash')).toBe(true);
      expect(registry.isValidTool('Task')).toBe(true);
    });

    it('应拒绝无效的工具名称', () => {
      expect(registry.isValidTool('InvalidTool')).toBe(false);
      expect(registry.isValidTool('')).toBe(false);
      expect(registry.isValidTool('read')).toBe(false); // 大小写敏感
      expect(registry.isValidTool('WRITE')).toBe(false);
    });
  });

  describe('getEnabledTools', () => {
    it('无配置时应返回默认工具', () => {
      const tools = registry.getEnabledTools();

      expect(tools).toEqual(registry.getDefaultTools());
    });

    it('空配置时应返回默认工具', () => {
      const tools = registry.getEnabledTools({});

      expect(tools).toEqual(registry.getDefaultTools());
    });

    it('应使用 allowedTools 白名单', () => {
      const config: ToolConfig = {
        allowedTools: ['Read', 'Grep'],
      };

      const tools = registry.getEnabledTools(config);

      expect(tools).toEqual(['Read', 'Grep']);
    });

    it('应过滤 allowedTools 中的无效工具', () => {
      const config: ToolConfig = {
        allowedTools: ['Read', 'InvalidTool', 'Grep'],
      };

      const tools = registry.getEnabledTools(config);

      expect(tools).toEqual(['Read', 'Grep']);
      expect(tools).not.toContain('InvalidTool');
    });

    it('应从默认工具中移除 disallowedTools', () => {
      const config: ToolConfig = {
        disallowedTools: ['Write', 'Bash'],
      };

      const tools = registry.getEnabledTools(config);

      expect(tools).not.toContain('Write');
      expect(tools).not.toContain('Bash');
      expect(tools).toContain('Read');
      expect(tools).toContain('Edit');
      expect(tools).toContain('Grep');
      expect(tools).toContain('Glob');
    });

    it('应同时处理 allowedTools 和 disallowedTools', () => {
      const config: ToolConfig = {
        allowedTools: ['Read', 'Write', 'Bash', 'Grep'],
        disallowedTools: ['Write', 'Bash'],
      };

      const tools = registry.getEnabledTools(config);

      expect(tools).toEqual(['Read', 'Grep']);
    });

    it('空 allowedTools 数组应返回默认工具', () => {
      const config: ToolConfig = {
        allowedTools: [],
      };

      const tools = registry.getEnabledTools(config);

      expect(tools).toEqual(registry.getDefaultTools());
    });
  });

  describe('getToolsByCategory', () => {
    it('应返回文件操作工具', () => {
      const tools = registry.getToolsByCategory(ToolCategory.FILE);

      expect(tools).toContain('Read');
      expect(tools).toContain('Write');
      expect(tools).toContain('Edit');
    });

    it('应返回命令执行工具', () => {
      const tools = registry.getToolsByCategory(ToolCategory.COMMAND);

      expect(tools).toContain('Bash');
      expect(tools).toContain('BashOutput');
      expect(tools).toContain('KillBash');
    });

    it('应返回搜索工具', () => {
      const tools = registry.getToolsByCategory(ToolCategory.SEARCH);

      expect(tools).toContain('Grep');
      expect(tools).toContain('Glob');
    });

    it('应返回 MCP 工具', () => {
      const tools = registry.getToolsByCategory(ToolCategory.MCP);

      expect(tools).toContain('ListMcpResources');
      expect(tools).toContain('ReadMcpResource');
    });
  });

  describe('getDangerousTools', () => {
    it('应返回所有危险工具', () => {
      const dangerousTools = registry.getDangerousTools();

      expect(dangerousTools).toContain('Write');
      expect(dangerousTools).toContain('Edit');
      expect(dangerousTools).toContain('Bash');
      expect(dangerousTools).toContain('KillBash');
      expect(dangerousTools).toContain('NotebookEdit');
    });

    it('安全工具不应在危险工具列表中', () => {
      const dangerousTools = registry.getDangerousTools();

      expect(dangerousTools).not.toContain('Read');
      expect(dangerousTools).not.toContain('Grep');
      expect(dangerousTools).not.toContain('Glob');
      expect(dangerousTools).not.toContain('Task');
    });
  });

  describe('isDangerousTool', () => {
    it('应正确识别危险工具', () => {
      expect(registry.isDangerousTool('Write')).toBe(true);
      expect(registry.isDangerousTool('Edit')).toBe(true);
      expect(registry.isDangerousTool('Bash')).toBe(true);
      expect(registry.isDangerousTool('KillBash')).toBe(true);
    });

    it('应正确识别安全工具', () => {
      expect(registry.isDangerousTool('Read')).toBe(false);
      expect(registry.isDangerousTool('Grep')).toBe(false);
      expect(registry.isDangerousTool('Glob')).toBe(false);
      expect(registry.isDangerousTool('Task')).toBe(false);
    });

    it('无效工具应返回 false', () => {
      expect(registry.isDangerousTool('InvalidTool')).toBe(false);
    });
  });

  describe('validateConfig', () => {
    it('有效配置应通过验证', () => {
      const config: ToolConfig = {
        allowedTools: ['Read', 'Write', 'Bash'],
        disallowedTools: ['WebFetch'],
      };

      const result = registry.validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.invalidTools).toHaveLength(0);
    });

    it('应检测 allowedTools 中的无效工具', () => {
      const config: ToolConfig = {
        allowedTools: ['Read', 'InvalidTool1', 'Write'],
      };

      const result = registry.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.invalidTools).toContain('InvalidTool1');
    });

    it('应检测 disallowedTools 中的无效工具', () => {
      const config: ToolConfig = {
        disallowedTools: ['InvalidTool2'],
      };

      const result = registry.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.invalidTools).toContain('InvalidTool2');
    });

    it('应去重无效工具列表', () => {
      const config: ToolConfig = {
        allowedTools: ['InvalidTool', 'Read'],
        disallowedTools: ['InvalidTool', 'Write'],
      };

      const result = registry.validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.invalidTools).toEqual(['InvalidTool']);
    });

    it('空配置应通过验证', () => {
      const result = registry.validateConfig({});

      expect(result.valid).toBe(true);
      expect(result.invalidTools).toHaveLength(0);
    });
  });

  describe('getToolMetadata', () => {
    it('应返回工具的完整元数据', () => {
      const metadata = registry.getToolMetadata('Read');

      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('Read');
      expect(metadata?.category).toBe(ToolCategory.FILE);
      expect(metadata?.description).toBe('读取文件内容');
      expect(metadata?.dangerous).toBe(false);
    });

    it('无效工具应返回 undefined', () => {
      const metadata = registry.getToolMetadata('InvalidTool');

      expect(metadata).toBeUndefined();
    });
  });

  describe('Skill 工具注册', () => {
    it('应注册 Skill 工具并设置正确元数据', () => {
      const metadata = registry.getToolMetadata('Skill');

      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('Skill');
      expect(metadata?.category).toBe(ToolCategory.AGENT);
      expect(metadata?.dangerous).toBe(false);
    });
  });
});
