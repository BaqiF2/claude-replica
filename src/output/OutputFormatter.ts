/**
 * 输出格式化器
 *
 * 负责将查询结果格式化为不同的输出格式
 * 支持 text、json、stream-json、markdown 四种格式
 *
 * @module output/OutputFormatter
 * **验证: 需求 17.1, 17.2, 17.3, 17.4, 17.5, 17.6**
 */

/**
 * 输出格式类型
 */
export type OutputFormat = 'text' | 'json' | 'stream-json' | 'markdown';

/**
 * 有效的输出格式列表
 */
export const VALID_OUTPUT_FORMATS: OutputFormat[] = ['text', 'json', 'stream-json', 'markdown'];

/**
 * 工具调用信息
 */
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
}

/**
 * 查询结果
 */
export interface QueryResult {
  /** 响应内容 */
  content: string;
  /** 工具调用列表 */
  toolCalls?: ToolCall[];
  /** 使用的模型 */
  model?: string;
  /** 总花费（美元） */
  totalCostUsd?: number;
  /** 输入 token 数 */
  inputTokens?: number;
  /** 输出 token 数 */
  outputTokens?: number;
  /** 会话 ID */
  sessionId?: string;
  /** 消息 UUID */
  messageUuid?: string;
  /** 是否成功 */
  success?: boolean;
  /** 错误信息 */
  error?: string;
}

/**
 * JSON 输出结构
 */
export interface JsonOutput {
  result: string;
  toolCalls?: ToolCall[];
  metadata?: {
    model?: string;
    totalCostUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
    sessionId?: string;
    messageUuid?: string;
  };
  success: boolean;
  error?: string;
}

/**
 * Stream JSON 输出结构
 */
export interface StreamJsonOutput {
  type: 'result' | 'tool_use' | 'error' | 'metadata';
  content?: string;
  toolCall?: ToolCall;
  error?: string;
  metadata?: {
    model?: string;
    totalCostUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
    sessionId?: string;
    messageUuid?: string;
  };
}

/**
 * 输出格式化器类
 */
export class OutputFormatter {
  /**
   * 格式化查询结果
   * @param result 查询结果
   * @param format 输出格式
   * @returns 格式化后的字符串
   */
  format(result: QueryResult, format: OutputFormat): string {
    switch (format) {
      case 'json':
        return this.formatJson(result);
      case 'stream-json':
        return this.formatStreamJson(result);
      case 'markdown':
        return this.formatMarkdown(result);
      case 'text':
      default:
        return this.formatText(result);
    }
  }

  /**
   * 格式化为纯文本
   */
  formatText(result: QueryResult): string {
    return result.content;
  }

  /**
   * 格式化为 JSON
   */
  formatJson(result: QueryResult): string {
    const output: JsonOutput = {
      result: result.content,
      success: result.success !== false,
    };

    if (result.toolCalls && result.toolCalls.length > 0) {
      output.toolCalls = result.toolCalls;
    }

    if (result.model || result.totalCostUsd !== undefined || 
        result.inputTokens !== undefined || result.outputTokens !== undefined ||
        result.sessionId || result.messageUuid) {
      output.metadata = {};
      if (result.model) output.metadata.model = result.model;
      if (result.totalCostUsd !== undefined) output.metadata.totalCostUsd = result.totalCostUsd;
      if (result.inputTokens !== undefined) output.metadata.inputTokens = result.inputTokens;
      if (result.outputTokens !== undefined) output.metadata.outputTokens = result.outputTokens;
      if (result.sessionId) output.metadata.sessionId = result.sessionId;
      if (result.messageUuid) output.metadata.messageUuid = result.messageUuid;
    }

    if (result.error) {
      output.error = result.error;
    }

    return JSON.stringify(output, null, 2);
  }

  /**
   * 格式化为流式 JSON
   */
  formatStreamJson(result: QueryResult): string {
    const lines: string[] = [];

    // 输出工具调用
    if (result.toolCalls) {
      for (const toolCall of result.toolCalls) {
        const toolOutput: StreamJsonOutput = {
          type: 'tool_use',
          toolCall,
        };
        lines.push(JSON.stringify(toolOutput));
      }
    }

    // 输出结果
    const resultOutput: StreamJsonOutput = {
      type: 'result',
      content: result.content,
    };
    lines.push(JSON.stringify(resultOutput));

    // 输出元数据
    if (result.model || result.totalCostUsd !== undefined || 
        result.inputTokens !== undefined || result.outputTokens !== undefined ||
        result.sessionId || result.messageUuid) {
      const metadataOutput: StreamJsonOutput = {
        type: 'metadata',
        metadata: {},
      };
      if (result.model) metadataOutput.metadata!.model = result.model;
      if (result.totalCostUsd !== undefined) metadataOutput.metadata!.totalCostUsd = result.totalCostUsd;
      if (result.inputTokens !== undefined) metadataOutput.metadata!.inputTokens = result.inputTokens;
      if (result.outputTokens !== undefined) metadataOutput.metadata!.outputTokens = result.outputTokens;
      if (result.sessionId) metadataOutput.metadata!.sessionId = result.sessionId;
      if (result.messageUuid) metadataOutput.metadata!.messageUuid = result.messageUuid;
      lines.push(JSON.stringify(metadataOutput));
    }

    // 输出错误
    if (result.error) {
      const errorOutput: StreamJsonOutput = {
        type: 'error',
        error: result.error,
      };
      lines.push(JSON.stringify(errorOutput));
    }

    return lines.join('\n');
  }

  /**
   * 格式化为 Markdown
   */
  formatMarkdown(result: QueryResult): string {
    const lines: string[] = [];

    // 添加响应内容
    lines.push(result.content);

    // 添加工具调用信息
    if (result.toolCalls && result.toolCalls.length > 0) {
      lines.push('');
      lines.push('---');
      lines.push('');
      lines.push('## 工具调用');
      lines.push('');
      
      for (const toolCall of result.toolCalls) {
        lines.push(`### ${toolCall.name}`);
        lines.push('');
        lines.push('**参数:**');
        lines.push('```json');
        lines.push(JSON.stringify(toolCall.args, null, 2));
        lines.push('```');
        
        if (toolCall.result !== undefined) {
          lines.push('');
          lines.push('**结果:**');
          lines.push('```');
          lines.push(typeof toolCall.result === 'string' 
            ? toolCall.result 
            : JSON.stringify(toolCall.result, null, 2));
          lines.push('```');
        }
        lines.push('');
      }
    }

    // 添加元数据
    if (result.model || result.totalCostUsd !== undefined || 
        result.inputTokens !== undefined || result.outputTokens !== undefined) {
      lines.push('---');
      lines.push('');
      lines.push('## 元数据');
      lines.push('');
      
      if (result.model) {
        lines.push(`- **模型:** ${result.model}`);
      }
      if (result.totalCostUsd !== undefined) {
        lines.push(`- **花费:** $${result.totalCostUsd.toFixed(4)}`);
      }
      if (result.inputTokens !== undefined) {
        lines.push(`- **输入 Token:** ${result.inputTokens}`);
      }
      if (result.outputTokens !== undefined) {
        lines.push(`- **输出 Token:** ${result.outputTokens}`);
      }
    }

    // 添加错误信息
    if (result.error) {
      lines.push('');
      lines.push('---');
      lines.push('');
      lines.push('## 错误');
      lines.push('');
      lines.push(`> ${result.error}`);
    }

    return lines.join('\n');
  }

  /**
   * 验证输出格式是否有效
   */
  isValidFormat(format: string): format is OutputFormat {
    return VALID_OUTPUT_FORMATS.includes(format as OutputFormat);
  }

  /**
   * 解析 JSON 输出
   * @param jsonString JSON 字符串
   * @returns 解析后的 JsonOutput 对象
   */
  parseJsonOutput(jsonString: string): JsonOutput {
    return JSON.parse(jsonString) as JsonOutput;
  }

  /**
   * 解析流式 JSON 输出
   * @param streamJsonString 流式 JSON 字符串
   * @returns 解析后的 StreamJsonOutput 数组
   */
  parseStreamJsonOutput(streamJsonString: string): StreamJsonOutput[] {
    const lines = streamJsonString.split('\n').filter(line => line.trim());
    return lines.map(line => JSON.parse(line) as StreamJsonOutput);
  }
}
