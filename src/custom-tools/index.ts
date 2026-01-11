/**
 * File purpose: barrel export for the custom tools module, exposing managers, registries,
 * and shared type definitions used by custom tool implementations.
 *
 * Core exports:
 * - CustomToolManager: orchestrates custom tool registration and MCP server creation.
 * - CustomToolRegistry: manages registered custom tools and module mappings.
 * - ToolDefinition: describes a custom tool's schema and handler.
 * - ToolHandler: async execution contract for custom tools.
 * - ToolResult: standard MCP tool output payload.
 * - CustomToolManagerOptions: configuration options for the custom tools manager.
 * - ValidationResult: validation outcome for tool definitions.
 */

export { CustomToolManager } from './CustomToolManager';
export { CustomToolRegistry } from './CustomToolRegistry';
export {
  ToolDefinition,
  ToolHandler,
  ToolResult,
  CustomToolManagerOptions,
  ValidationResult,
} from './types';
