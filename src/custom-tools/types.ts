/**
 * File purpose: shared type definitions for the custom tools system, covering tool metadata,
 * schemas, execution handlers, and validation results.
 *
 * Core exports:
 * - ToolDefinition: describes a custom tool's identity, schema, and handler.
 * - ToolHandler: async execution contract for custom tools.
 * - ToolResult: standard MCP tool output payload.
 * - CustomToolManagerOptions: configuration options for the CustomToolManager.
 * - ValidationResult: validation outcome for tool definitions.
 */

/**
 * Custom tool execution result.
 */
export interface ToolResult {
  /** Output content blocks returned to the SDK. */
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

/**
 * Custom tool handler signature.
 */
// Make handler parameter bivariant to allow mixed tool arg types in registries.
export type ToolHandler<TArgs = Record<string, unknown>, TResult = ToolResult> = {
  bivarianceHack(args: TArgs): Promise<TResult>;
}['bivarianceHack'];

/**
 * Custom tool definition.
 */
export interface ToolDefinition<
  TSchema = unknown,
  TArgs = Record<string, unknown>,
  TResult = ToolResult,
> {
  /** Tool name within its MCP server. */
  name: string;
  /** Tool description. */
  description: string;
  /** Parameter schema (intended for Zod schema usage). */
  schema: TSchema;
  /** Tool execution handler. */
  handler: ToolHandler<TArgs, TResult>;
  /** Module name used for grouping tools. */
  module: string;
  /** Whether the tool is dangerous and requires permission. */
  dangerous?: boolean;
  /** Optional metadata for documentation and discovery. */
  metadata?: {
    author?: string;
    version?: string;
    tags?: string[];
  };
}

/**
 * Custom tool manager options.
 */
export interface CustomToolManagerOptions {
  /** Prefix used to build MCP server names. */
  serverNamePrefix?: string;
  /** Default server version used when creating MCP servers. */
  serverVersion?: string;
}

/**
 * Tool definition validation result.
 */
export interface ValidationResult {
  /** Whether the validation passed. */
  valid: boolean;
  /** Validation errors for invalid fields or missing properties. */
  errors: Array<{
    field: string;
    message: string;
  }>;
}
