/**
 * File purpose: provide logging helpers for custom tool execution lifecycle events.
 *
 * Core exports:
 * - logToolExecutionStart: log the start of a tool execution.
 * - logToolExecutionSuccess: log the successful completion of a tool execution.
 * - logToolExecutionError: log the failed completion of a tool execution.
 * - withToolExecutionLogging: wrap a tool handler with execution logging.
 */

import type { ToolHandler } from '../types';

const LOG_MESSAGE_START = process.env.CUSTOM_TOOL_LOG_MESSAGE_START ?? 'Tool execution started.';
const LOG_MESSAGE_SUCCESS =
  process.env.CUSTOM_TOOL_LOG_MESSAGE_SUCCESS ?? 'Tool execution completed.';
const LOG_MESSAGE_ERROR = process.env.CUSTOM_TOOL_LOG_MESSAGE_ERROR ?? 'Tool execution failed.';

const normalizeErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return String(error);
};

export const logToolExecutionStart = (toolName: string): void => {
  console.info(LOG_MESSAGE_START, { tool: toolName });
};

export const logToolExecutionSuccess = (
  toolName: string,
  durationMs: number,
  result: unknown
): void => {
  console.info(LOG_MESSAGE_SUCCESS, { tool: toolName, durationMs, result });
};

export const logToolExecutionError = (
  toolName: string,
  durationMs: number,
  error: unknown
): void => {
  console.error(LOG_MESSAGE_ERROR, {
    tool: toolName,
    durationMs,
    error: normalizeErrorMessage(error),
  });
};

export const withToolExecutionLogging = <TArgs, TResult>(
  toolName: string,
  handler: ToolHandler<TArgs, TResult>
): ToolHandler<TArgs, TResult> => {
  return async (args: TArgs) => {
    const startTime = Date.now();
    logToolExecutionStart(toolName);

    try {
      const result = await handler(args);
      const durationMs = Date.now() - startTime;
      logToolExecutionSuccess(toolName, durationMs, result);
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logToolExecutionError(toolName, durationMs, error);
      throw error;
    }
  };
};
