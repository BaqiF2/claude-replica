/**
 * Test purpose: verify calculatorTool behavior for basic math, precision, and invalid inputs.
 *
 * Core targets:
 * - calculatorTool: expression evaluation, precision formatting, and validation handling.
 */

import { calculatorTool } from '../../src/custom-tools/math/calculator';
import type { ToolResult } from '../../src/custom-tools/types';

const BASIC_OPERAND_A = parseInt(process.env.TEST_CALCULATOR_BASIC_OPERAND_A || '2', 10);
const BASIC_OPERAND_B = parseInt(process.env.TEST_CALCULATOR_BASIC_OPERAND_B || '2', 10);
const DECIMAL_NUMERATOR = parseInt(process.env.TEST_CALCULATOR_DECIMAL_NUMERATOR || '1', 10);
const DECIMAL_DENOMINATOR = parseInt(process.env.TEST_CALCULATOR_DECIMAL_DENOMINATOR || '3', 10);
const DECIMAL_PRECISION = parseInt(process.env.TEST_CALCULATOR_DECIMAL_PRECISION || '2', 10);
const INVALID_EXPRESSION_VALUE = parseInt(
  process.env.TEST_CALCULATOR_INVALID_EXPRESSION_VALUE || '123',
  10
);
const FIRST_CONTENT_INDEX = parseInt(process.env.TEST_CALCULATOR_FIRST_CONTENT_INDEX || '0', 10);

const BASIC_EXPRESSION = `${BASIC_OPERAND_A} + ${BASIC_OPERAND_B}`;
const BASIC_EXPECTED = `${BASIC_OPERAND_A + BASIC_OPERAND_B}`;
const DECIMAL_EXPRESSION = `${DECIMAL_NUMERATOR} / ${DECIMAL_DENOMINATOR}`;
const DECIMAL_EXPECTED = (DECIMAL_NUMERATOR / DECIMAL_DENOMINATOR).toFixed(DECIMAL_PRECISION);
const INVALID_EXPRESSION = `${BASIC_OPERAND_A} +`;

const VALIDATION_ERROR_MESSAGE =
  process.env.CUSTOM_TOOL_CALCULATOR_VALIDATION_ERROR_MESSAGE ??
  'Input validation failed for calculator tool.';
const EVALUATION_ERROR_MESSAGE =
  process.env.CUSTOM_TOOL_CALCULATOR_EVALUATION_ERROR_MESSAGE ??
  'Failed to evaluate the math expression.';

const getResultText = (result: ToolResult): string =>
  result.content[FIRST_CONTENT_INDEX]?.text ?? '';

describe('calculatorTool', () => {
  it('evaluates basic math expressions', async () => {
    const result = await calculatorTool.handler({ expression: BASIC_EXPRESSION });

    expect(getResultText(result)).toBe(BASIC_EXPECTED);
  });

  it('formats results with requested precision', async () => {
    const result = await calculatorTool.handler({
      expression: DECIMAL_EXPRESSION,
      precision: DECIMAL_PRECISION,
    });

    expect(getResultText(result)).toBe(DECIMAL_EXPECTED);
  });

  it('returns evaluation errors for invalid expressions', async () => {
    const result = await calculatorTool.handler({ expression: INVALID_EXPRESSION });

    expect(getResultText(result)).toBe(EVALUATION_ERROR_MESSAGE);
  });

  it('returns validation errors for invalid parameters', async () => {
    const result = await calculatorTool.handler({
      expression: INVALID_EXPRESSION_VALUE,
    } as unknown as { expression: string });

    expect(getResultText(result)).toBe(VALIDATION_ERROR_MESSAGE);
  });
});
