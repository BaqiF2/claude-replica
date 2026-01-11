/**
 * File purpose: normalize custom tool execution errors into ToolResult payloads.
 *
 * Core exports:
 * - createToolErrorResult: convert tool errors into ToolResult responses.
 * - withToolErrorHandling: wrap a tool handler with error-to-result conversion.
 */

import { ZodError, type ZodIssue } from 'zod';

import type { ToolHandler, ToolResult } from '../types';

const DEFAULT_TOOL_ERROR_MESSAGE =
  process.env.CUSTOM_TOOL_DEFAULT_ERROR_MESSAGE ?? 'Tool execution failed.';
const DEFAULT_VALIDATION_ERROR_MESSAGE =
  process.env.CUSTOM_TOOL_VALIDATION_ERROR_MESSAGE ?? 'Tool input validation failed.';
const DEFAULT_VALIDATION_ISSUE_SEPARATOR =
  process.env.CUSTOM_TOOL_VALIDATION_ISSUE_SEPARATOR ?? '; ';
const DEFAULT_VALIDATION_PATH_SEPARATOR = process.env.CUSTOM_TOOL_VALIDATION_PATH_SEPARATOR ?? '.';
const DEFAULT_VALIDATION_UNKNOWN_PATH = process.env.CUSTOM_TOOL_VALIDATION_UNKNOWN_PATH ?? 'input';

const createToolResult = (text: string): ToolResult => ({
  content: [
    {
      type: 'text',
      text,
    },
  ],
});

const formatZodIssue = (issue: ZodIssue): string => {
  const path =
    issue.path.length > 0
      ? issue.path.join(DEFAULT_VALIDATION_PATH_SEPARATOR)
      : DEFAULT_VALIDATION_UNKNOWN_PATH;
  return `${path}: ${issue.message}`;
};

const formatZodError = (error: ZodError): string => {
  const details = error.issues.map(formatZodIssue).join(DEFAULT_VALIDATION_ISSUE_SEPARATOR);
  if (!details) {
    return DEFAULT_VALIDATION_ERROR_MESSAGE;
  }
  return `${DEFAULT_VALIDATION_ERROR_MESSAGE} ${details}`;
};

export const createToolErrorResult = (error: unknown): ToolResult => {
  if (error instanceof ZodError) {
    return createToolResult(formatZodError(error));
  }
  if (error instanceof Error) {
    return createToolResult(error.message || DEFAULT_TOOL_ERROR_MESSAGE);
  }
  if (typeof error === 'string' && error) {
    return createToolResult(error);
  }
  return createToolResult(DEFAULT_TOOL_ERROR_MESSAGE);
};

export const withToolErrorHandling = <TArgs, TResult extends ToolResult>(
  handler: ToolHandler<TArgs, TResult>
): ToolHandler<TArgs, TResult> => {
  return async (args: TArgs) => {
    try {
      return await handler(args);
    } catch (error) {
      return createToolErrorResult(error) as TResult;
    }
  };
};
