/**
 * Test purpose: validate CustomToolRegistry behaviors for registering, querying, and removing tools.
 *
 * Core targets:
 * - CustomToolRegistry: registry operations and module mapping behavior.
 */

import { CustomToolRegistry } from '../../src/custom-tools/CustomToolRegistry';
import type { ToolDefinition } from '../../src/custom-tools/types';

const createTool = (name: string, moduleName: string): ToolDefinition => ({
  name,
  description: 'Test tool',
  schema: {},
  module: moduleName,
  handler: async () => ({
    content: [{ type: 'text', text: 'ok' }],
  }),
});

describe('CustomToolRegistry', () => {
  it('registers a tool and exposes lookups', () => {
    const registry = new CustomToolRegistry();
    const tool = createTool('alpha', 'math');

    registry.register(tool);

    expect(registry.has('alpha')).toBe(true);
    expect(registry.get('alpha')).toBe(tool);
    expect(registry.getAll().map((item) => item.name)).toEqual(['alpha']);
  });

  it('registers tools by module and supports module queries', () => {
    const registry = new CustomToolRegistry();
    const toolA = createTool('alpha', 'ignored');
    const toolB = createTool('bravo', 'ignored');

    registry.registerModule('math', [toolA, toolB]);

    expect(registry.getByModule('math').map((tool) => tool.name).sort()).toEqual([
      'alpha',
      'bravo',
    ]);
    expect(registry.getByModule('ignored')).toEqual([]);
  });

  it('updates module mapping when re-registering a tool', () => {
    const registry = new CustomToolRegistry();
    const original = createTool('alpha', 'math');
    const updated = createTool('alpha', 'utils');

    registry.register(original);
    registry.register(updated);

    expect(registry.getByModule('math')).toEqual([]);
    expect(registry.getByModule('utils').map((tool) => tool.name)).toEqual(['alpha']);
    expect(registry.getAll().map((tool) => tool.module)).toEqual(['utils']);
  });

  it('removes tools and clears module mappings', () => {
    const registry = new CustomToolRegistry();
    const tool = createTool('alpha', 'math');

    registry.register(tool);

    expect(registry.remove('alpha')).toBe(true);
    expect(registry.has('alpha')).toBe(false);
    expect(registry.getByModule('math')).toEqual([]);
    expect(registry.remove('alpha')).toBe(false);
  });

  it('clears all tools and modules', () => {
    const registry = new CustomToolRegistry();
    const toolA = createTool('alpha', 'math');
    const toolB = createTool('bravo', 'utils');

    registry.register(toolA);
    registry.register(toolB);
    registry.clear();

    expect(registry.getAll()).toEqual([]);
    expect(registry.getByModule('math')).toEqual([]);
    expect(registry.getByModule('utils')).toEqual([]);
  });
});
