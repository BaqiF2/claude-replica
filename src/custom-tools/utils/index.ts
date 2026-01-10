/**
 * File purpose: barrel export for shared custom tool helpers and utilities.
 *
 * Core exports:
 * - logToolExecutionStart: log the start of tool execution.
 * - logToolExecutionSuccess: log tool execution completion.
 * - logToolExecutionError: log tool execution failures.
 * - withToolExecutionLogging: wrap tool handlers with execution logging.
 * - createToolErrorResult: convert tool errors to ToolResult payloads.
 * - withToolErrorHandling: wrap tool handlers with error-to-result conversion.
 */

export {
  logToolExecutionStart,
  logToolExecutionSuccess,
  logToolExecutionError,
  withToolExecutionLogging,
} from './logger';
export { createToolErrorResult, withToolErrorHandling } from './error-handler';
