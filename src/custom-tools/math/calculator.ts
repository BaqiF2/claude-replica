/**
 * File purpose: provide a calculator custom tool using Zod validation and expr-eval
 * for safe math expression evaluation.
 *
 * Core exports:
 * - calculatorTool: custom tool definition for evaluating math expressions.
 *
 * Core methods:
 * - evaluateExpression(): parse and evaluate a math expression safely.
 * - formatResult(): format numeric results with optional precision.
 * - createToolResult(): wrap output text in a ToolResult payload.
 */

import { Parser } from 'expr-eval';
import { z } from 'zod';

import type { ToolDefinition, ToolResult } from '../types';

const DEFAULT_TOOL_NAME = process.env.CUSTOM_TOOL_CALCULATOR_NAME ?? 'calculator';
const DEFAULT_MODULE_NAME = process.env.CUSTOM_TOOL_CALCULATOR_MODULE ?? 'math';
const DEFAULT_DESCRIPTION =
  process.env.CUSTOM_TOOL_CALCULATOR_DESCRIPTION ??
  'Evaluate a math expression safely using a constrained parser.';
const DEFAULT_VALIDATION_ERROR_MESSAGE =
  process.env.CUSTOM_TOOL_CALCULATOR_VALIDATION_ERROR_MESSAGE ??
  'Input validation failed for calculator tool.';
const DEFAULT_EVALUATION_ERROR_MESSAGE =
  process.env.CUSTOM_TOOL_CALCULATOR_EVALUATION_ERROR_MESSAGE ??
  'Failed to evaluate the math expression.';
const DEFAULT_NON_NUMERIC_ERROR_MESSAGE =
  process.env.CUSTOM_TOOL_CALCULATOR_NON_NUMERIC_ERROR_MESSAGE ??
  'Expression did not evaluate to a numeric result.';
const DEFAULT_EMPTY_EXPRESSION_ERROR_MESSAGE =
  process.env.CUSTOM_TOOL_CALCULATOR_EMPTY_EXPRESSION_ERROR_MESSAGE ??
  'Expression must contain at least one non-whitespace character.';

const MIN_EXPRESSION_LENGTH = parseInt(
  process.env.CUSTOM_TOOL_CALCULATOR_MIN_EXPRESSION_LENGTH || '1',
  10
);
const MAX_EXPRESSION_LENGTH = parseInt(
  process.env.CUSTOM_TOOL_CALCULATOR_MAX_EXPRESSION_LENGTH || '256',
  10
);
const MIN_DECIMAL_PLACES = parseInt(
  process.env.CUSTOM_TOOL_CALCULATOR_MIN_DECIMAL_PLACES || '0',
  10
);
const MAX_DECIMAL_PLACES = parseInt(
  process.env.CUSTOM_TOOL_CALCULATOR_MAX_DECIMAL_PLACES || '12',
  10
);
const ALLOW_MEMBER_ACCESS =
  (process.env.CUSTOM_TOOL_CALCULATOR_ALLOW_MEMBER_ACCESS ?? 'false') === 'true';

const CALCULATOR_SCHEMA = z.object({
  expression: z.string().min(MIN_EXPRESSION_LENGTH).max(MAX_EXPRESSION_LENGTH),
  precision: z.number().int().min(MIN_DECIMAL_PLACES).max(MAX_DECIMAL_PLACES).optional(),
});

type CalculatorArgs = z.infer<typeof CALCULATOR_SCHEMA>;

const parser = new Parser({ allowMemberAccess: ALLOW_MEMBER_ACCESS });

const logInfo = (message: string, context?: Record<string, unknown>) => {
  context ? console.info(message, context) : console.info(message);
};

const logWarn = (message: string, context?: Record<string, unknown>) => {
  context ? console.warn(message, context) : console.warn(message);
};

const logError = (message: string, context?: Record<string, unknown>) => {
  context ? console.error(message, context) : console.error(message);
};

const createToolResult = (text: string): ToolResult => ({
  content: [
    {
      type: 'text',
      text,
    },
  ],
});

const formatResult = (value: number, precision?: number): string => {
  if (precision === undefined) {
    return value.toString();
  }
  return value.toFixed(precision);
};

const evaluateExpression = (expression: string): number => {
  const compiled = parser.parse(expression);
  const result = compiled.evaluate({});
  if (typeof result !== 'number' || Number.isNaN(result) || !Number.isFinite(result)) {
    throw new Error(DEFAULT_NON_NUMERIC_ERROR_MESSAGE);
  }
  return result;
};

export const calculatorTool: ToolDefinition<typeof CALCULATOR_SCHEMA, CalculatorArgs, ToolResult> =
  {
    name: DEFAULT_TOOL_NAME,
    description: DEFAULT_DESCRIPTION,
    module: DEFAULT_MODULE_NAME,
    schema: CALCULATOR_SCHEMA,
    handler: async (args) => {
      const parsed = CALCULATOR_SCHEMA.safeParse(args);
      if (!parsed.success) {
        logWarn('Calculator tool input validation failed.', { issues: parsed.error.issues });
        return createToolResult(DEFAULT_VALIDATION_ERROR_MESSAGE);
      }

      const expression = parsed.data.expression.trim();
      if (expression.length < MIN_EXPRESSION_LENGTH) {
        logWarn('Calculator tool received empty expression.', { length: expression.length });
        return createToolResult(DEFAULT_EMPTY_EXPRESSION_ERROR_MESSAGE);
      }

      try {
        logInfo('Calculator tool evaluation started.', { expression });
        const result = evaluateExpression(expression);
        const formatted = formatResult(result, parsed.data.precision);
        logInfo('Calculator tool evaluation completed.', { result: formatted });
        return createToolResult(formatted);
      } catch (error) {
        logError('Calculator tool evaluation failed.', {
          error: error instanceof Error ? error.message : String(error),
        });
        return createToolResult(DEFAULT_EVALUATION_ERROR_MESSAGE);
      }
    },
  };
