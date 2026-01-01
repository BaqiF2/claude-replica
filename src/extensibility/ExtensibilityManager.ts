/**
 * ExtensibilityManager - 扩展性架构管理器
 *
 * 提供完整的扩展性架构，支持：
 * - 自定义工具注册
 * - 工具参数验证
 * - 工具错误处理
 * - 工具钩子点
 * - 工具异步执行和流式输出
 *
 * **需求: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6**
 */

import { EventEmitter } from 'events';

/**
 * 工具参数 Schema 类型
 */
export type ParameterType = 'string' | 'number' | 'boolean' | 'array' | 'object';

/**
 * 工具参数定义
 */
export interface ToolParameter {
  /** 参数名称 */
  name: string;
  /** 参数类型 */
  type: ParameterType;
  /** 参数描述 */
  description: string;
  /** 是否必需 */
  required: boolean;
  /** 默认值 */
  default?: unknown;
  /** 枚举值（仅当 type 为 string 时有效） */
  enum?: string[];
  /** 数组元素类型（仅当 type 为 array 时有效） */
  items?: { type: ParameterType };
  /** 对象属性（仅当 type 为 object 时有效） */
  properties?: Record<string, ToolParameter>;
  /** 最小值（仅当 type 为 number 时有效） */
  minimum?: number;
  /** 最大值（仅当 type 为 number 时有效） */
  maximum?: number;
  /** 最小长度（仅当 type 为 string 或 array 时有效） */
  minLength?: number;
  /** 最大长度（仅当 type 为 string 或 array 时有效） */
  maxLength?: number;
  /** 正则表达式模式（仅当 type 为 string 时有效） */
  pattern?: string;
}

/**
 * 工具执行上下文
 */
export interface ToolExecutionContext {
  /** 会话 ID */
  sessionId: string;
  /** 消息 UUID */
  messageUuid: string;
  /** 工作目录 */
  workingDir: string;
  /** 用户配置 */
  userConfig?: Record<string, unknown>;
  /** 取消信号 */
  abortSignal?: AbortSignal;
}

/**
 * 工具执行结果
 */
export interface ToolExecutionResult {
  /** 是否成功 */
  success: boolean;
  /** 输出内容 */
  output?: string;
  /** 结构化数据 */
  data?: unknown;
  /** 错误信息 */
  error?: string;
  /** 错误代码 */
  errorCode?: string;
  /** 执行时间（毫秒） */
  executionTime?: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 流式输出块
 */
export interface StreamChunk {
  /** 块类型 */
  type: 'text' | 'progress' | 'data' | 'error';
  /** 块内容 */
  content: string;
  /** 进度百分比（仅当 type 为 progress 时有效） */
  progress?: number;
  /** 结构化数据（仅当 type 为 data 时有效） */
  data?: unknown;
}

/**
 * 工具执行函数类型
 */
export type ToolExecutor = (
  args: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<ToolExecutionResult>;

/**
 * 流式工具执行函数类型
 */
export type StreamingToolExecutor = (
  args: Record<string, unknown>,
  context: ToolExecutionContext
) => AsyncGenerator<StreamChunk, ToolExecutionResult, void>;

/**
 * 自定义工具定义
 */
export interface CustomToolDefinition {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 参数定义 */
  parameters: ToolParameter[];
  /** 执行函数 */
  executor: ToolExecutor;
  /** 流式执行函数（可选） */
  streamingExecutor?: StreamingToolExecutor;
  /** 是否为危险工具 */
  dangerous?: boolean;
  /** 工具分类 */
  category?: string;
  /** 工具版本 */
  version?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 是否支持流式输出 */
  supportsStreaming?: boolean;
}

/**
 * 工具钩子事件类型
 */
export type ToolHookEvent =
  | 'beforeExecute' // 执行前
  | 'afterExecute' // 执行后
  | 'onError' // 错误时
  | 'onProgress' // 进度更新
  | 'onStream'; // 流式输出

/**
 * 工具钩子上下文
 */
export interface ToolHookContext {
  /** 工具名称 */
  toolName: string;
  /** 工具参数 */
  args: Record<string, unknown>;
  /** 执行上下文 */
  executionContext: ToolExecutionContext;
  /** 执行结果（仅在 afterExecute 和 onError 时有效） */
  result?: ToolExecutionResult;
  /** 错误信息（仅在 onError 时有效） */
  error?: Error;
  /** 流式块（仅在 onStream 时有效） */
  chunk?: StreamChunk;
  /** 进度百分比（仅在 onProgress 时有效） */
  progress?: number;
}

/**
 * 工具钩子函数类型
 */
export type ToolHookHandler = (context: ToolHookContext) => void | Promise<void>;

/**
 * 参数验证错误
 */
export class ParameterValidationError extends Error {
  constructor(
    message: string,
    public readonly parameterName: string,
    public readonly expectedType: string,
    public readonly actualValue: unknown
  ) {
    super(message);
    this.name = 'ParameterValidationError';
  }
}

/**
 * 工具执行错误
 */
export class ToolExecutionError extends Error {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly errorCode: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

/**
 * 工具超时错误
 */
export class ToolTimeoutError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly timeout: number
  ) {
    super(`工具 ${toolName} 执行超时 (${timeout}ms)`);
    this.name = 'ToolTimeoutError';
  }
}

/**
 * 扩展性架构管理器配置
 */
export interface ExtensibilityManagerConfig {
  /** 默认工具超时时间（毫秒） */
  defaultTimeout?: number;
  /** 是否启用调试日志 */
  debug?: boolean;
  /** 最大并发执行数 */
  maxConcurrentExecutions?: number;
  /** 是否启用参数验证 */
  enableValidation?: boolean;
}

/**
 * 扩展性架构管理器
 *
 * 提供完整的插件 API 和工具扩展能力。
 */
export class ExtensibilityManager extends EventEmitter {
  /** 已注册的自定义工具 */
  private customTools: Map<string, CustomToolDefinition> = new Map();

  /** 工具钩子 */
  private toolHooks: Map<ToolHookEvent, ToolHookHandler[]> = new Map();

  /** 当前执行数 */
  private currentExecutions: number = 0;

  /** 配置 */
  private readonly config: Required<ExtensibilityManagerConfig>;

  constructor(config: ExtensibilityManagerConfig = {}) {
    super();
    this.config = {
      defaultTimeout: config.defaultTimeout ?? 30000,
      debug: config.debug ?? false,
      maxConcurrentExecutions: config.maxConcurrentExecutions ?? 10,
      enableValidation: config.enableValidation ?? true,
    };
  }

  // ==================== 工具注册 API ====================

  /**
   * 注册自定义工具
   *
   * @param tool 工具定义
   * @throws Error 如果工具名称已存在
   */
  registerTool(tool: CustomToolDefinition): void {
    if (this.customTools.has(tool.name)) {
      throw new Error(`工具 ${tool.name} 已注册`);
    }

    // 验证工具定义
    this.validateToolDefinition(tool);

    this.customTools.set(tool.name, tool);

    if (this.config.debug) {
      console.log(`已注册工具: ${tool.name}`);
    }

    this.emit('toolRegistered', tool);
  }

  /**
   * 注销自定义工具
   *
   * @param toolName 工具名称
   * @returns 是否成功注销
   */
  unregisterTool(toolName: string): boolean {
    const existed = this.customTools.delete(toolName);

    if (existed && this.config.debug) {
      console.log(`已注销工具: ${toolName}`);
    }

    if (existed) {
      this.emit('toolUnregistered', toolName);
    }

    return existed;
  }

  /**
   * 获取已注册的工具
   *
   * @param toolName 工具名称
   * @returns 工具定义或 undefined
   */
  getTool(toolName: string): CustomToolDefinition | undefined {
    return this.customTools.get(toolName);
  }

  /**
   * 获取所有已注册的工具
   *
   * @returns 工具定义数组
   */
  getAllTools(): CustomToolDefinition[] {
    return Array.from(this.customTools.values());
  }

  /**
   * 检查工具是否已注册
   *
   * @param toolName 工具名称
   * @returns 是否已注册
   */
  hasTool(toolName: string): boolean {
    return this.customTools.has(toolName);
  }

  /**
   * 获取工具数量
   *
   * @returns 工具数量
   */
  getToolCount(): number {
    return this.customTools.size;
  }

  // ==================== 工具定义验证 ====================

  /**
   * 验证工具定义
   *
   * @param tool 工具定义
   * @throws Error 如果工具定义无效
   */
  private validateToolDefinition(tool: CustomToolDefinition): void {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('工具名称必须是非空字符串');
    }

    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(tool.name)) {
      throw new Error('工具名称必须以字母开头，只能包含字母、数字和下划线');
    }

    if (!tool.description || typeof tool.description !== 'string') {
      throw new Error('工具描述必须是非空字符串');
    }

    if (!Array.isArray(tool.parameters)) {
      throw new Error('工具参数必须是数组');
    }

    if (typeof tool.executor !== 'function') {
      throw new Error('工具执行函数必须是函数');
    }

    // 验证参数定义
    for (const param of tool.parameters) {
      this.validateParameterDefinition(param);
    }
  }

  /**
   * 验证参数定义
   *
   * @param param 参数定义
   * @throws Error 如果参数定义无效
   */
  private validateParameterDefinition(param: ToolParameter): void {
    if (!param.name || typeof param.name !== 'string') {
      throw new Error('参数名称必须是非空字符串');
    }

    const validTypes: ParameterType[] = ['string', 'number', 'boolean', 'array', 'object'];
    if (!validTypes.includes(param.type)) {
      throw new Error(`参数类型必须是以下之一: ${validTypes.join(', ')}`);
    }

    if (!param.description || typeof param.description !== 'string') {
      throw new Error('参数描述必须是非空字符串');
    }

    if (typeof param.required !== 'boolean') {
      throw new Error('参数 required 字段必须是布尔值');
    }
  }

  // ==================== 参数验证 ====================

  /**
   * 验证工具参数
   *
   * @param tool 工具定义
   * @param args 参数值
   * @throws ParameterValidationError 如果参数验证失败
   */
  validateParameters(tool: CustomToolDefinition, args: Record<string, unknown>): void {
    if (!this.config.enableValidation) {
      return;
    }

    for (const param of tool.parameters) {
      const value = args[param.name];

      // 检查必需参数
      if (param.required && (value === undefined || value === null)) {
        throw new ParameterValidationError(
          `缺少必需参数: ${param.name}`,
          param.name,
          param.type,
          value
        );
      }

      // 如果参数存在，验证类型
      if (value !== undefined && value !== null) {
        this.validateParameterValue(param, value);
      } else if (param.default !== undefined) {
        // 使用默认值
        args[param.name] = param.default;
      }
    }
  }

  /**
   * 验证参数值
   *
   * @param param 参数定义
   * @param value 参数值
   * @throws ParameterValidationError 如果参数值无效
   */
  private validateParameterValue(param: ToolParameter, value: unknown): void {
    // 类型验证
    const actualType = this.getValueType(value);
    if (actualType !== param.type) {
      throw new ParameterValidationError(
        `参数 ${param.name} 类型错误: 期望 ${param.type}, 实际 ${actualType}`,
        param.name,
        param.type,
        value
      );
    }

    // 字符串特定验证
    if (param.type === 'string' && typeof value === 'string') {
      this.validateStringParameter(param, value);
    }

    // 数字特定验证
    if (param.type === 'number' && typeof value === 'number') {
      this.validateNumberParameter(param, value);
    }

    // 数组特定验证
    if (param.type === 'array' && Array.isArray(value)) {
      this.validateArrayParameter(param, value);
    }
  }

  /**
   * 获取值的类型
   */
  private getValueType(value: unknown): ParameterType {
    if (Array.isArray(value)) return 'array';
    if (value === null) return 'object';
    const type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean' || type === 'object') {
      return type as ParameterType;
    }
    return 'string';
  }

  /**
   * 验证字符串参数
   */
  private validateStringParameter(param: ToolParameter, value: string): void {
    if (param.enum && !param.enum.includes(value)) {
      throw new ParameterValidationError(
        `参数 ${param.name} 必须是以下值之一: ${param.enum.join(', ')}`,
        param.name,
        param.type,
        value
      );
    }

    if (param.minLength !== undefined && value.length < param.minLength) {
      throw new ParameterValidationError(
        `参数 ${param.name} 长度不能小于 ${param.minLength}`,
        param.name,
        param.type,
        value
      );
    }

    if (param.maxLength !== undefined && value.length > param.maxLength) {
      throw new ParameterValidationError(
        `参数 ${param.name} 长度不能大于 ${param.maxLength}`,
        param.name,
        param.type,
        value
      );
    }

    if (param.pattern) {
      const regex = new RegExp(param.pattern);
      if (!regex.test(value)) {
        throw new ParameterValidationError(
          `参数 ${param.name} 不匹配模式: ${param.pattern}`,
          param.name,
          param.type,
          value
        );
      }
    }
  }

  /**
   * 验证数字参数
   */
  private validateNumberParameter(param: ToolParameter, value: number): void {
    if (param.minimum !== undefined && value < param.minimum) {
      throw new ParameterValidationError(
        `参数 ${param.name} 不能小于 ${param.minimum}`,
        param.name,
        param.type,
        value
      );
    }

    if (param.maximum !== undefined && value > param.maximum) {
      throw new ParameterValidationError(
        `参数 ${param.name} 不能大于 ${param.maximum}`,
        param.name,
        param.type,
        value
      );
    }
  }

  /**
   * 验证数组参数
   */
  private validateArrayParameter(param: ToolParameter, value: unknown[]): void {
    if (param.minLength !== undefined && value.length < param.minLength) {
      throw new ParameterValidationError(
        `参数 ${param.name} 数组长度不能小于 ${param.minLength}`,
        param.name,
        param.type,
        value
      );
    }

    if (param.maxLength !== undefined && value.length > param.maxLength) {
      throw new ParameterValidationError(
        `参数 ${param.name} 数组长度不能大于 ${param.maxLength}`,
        param.name,
        param.type,
        value
      );
    }

    // 验证数组元素类型
    if (param.items) {
      for (let i = 0; i < value.length; i++) {
        const itemType = this.getValueType(value[i]);
        if (itemType !== param.items.type) {
          throw new ParameterValidationError(
            `参数 ${param.name}[${i}] 类型错误: 期望 ${param.items.type}, 实际 ${itemType}`,
            param.name,
            param.items.type,
            value[i]
          );
        }
      }
    }
  }

  // ==================== 工具钩子 ====================

  /**
   * 添加工具钩子
   *
   * @param event 钩子事件
   * @param handler 钩子处理函数
   */
  addToolHook(event: ToolHookEvent, handler: ToolHookHandler): void {
    if (!this.toolHooks.has(event)) {
      this.toolHooks.set(event, []);
    }
    this.toolHooks.get(event)!.push(handler);

    if (this.config.debug) {
      console.log(`已添加工具钩子: ${event}`);
    }
  }

  /**
   * 移除工具钩子
   *
   * @param event 钩子事件
   * @param handler 钩子处理函数
   * @returns 是否成功移除
   */
  removeToolHook(event: ToolHookEvent, handler: ToolHookHandler): boolean {
    const handlers = this.toolHooks.get(event);
    if (!handlers) return false;

    const index = handlers.indexOf(handler);
    if (index === -1) return false;

    handlers.splice(index, 1);
    return true;
  }

  /**
   * 清除指定事件的所有钩子
   *
   * @param event 钩子事件
   */
  clearToolHooks(event: ToolHookEvent): void {
    this.toolHooks.delete(event);
  }

  /**
   * 清除所有工具钩子
   */
  clearAllToolHooks(): void {
    this.toolHooks.clear();
  }

  /**
   * 触发工具钩子
   *
   * @param event 钩子事件
   * @param context 钩子上下文
   */
  private async triggerToolHook(event: ToolHookEvent, context: ToolHookContext): Promise<void> {
    const handlers = this.toolHooks.get(event);
    if (!handlers || handlers.length === 0) return;

    for (const handler of handlers) {
      try {
        await handler(context);
      } catch (error) {
        if (this.config.debug) {
          console.error(`工具钩子 ${event} 执行失败:`, error);
        }
        // 钩子错误不应该中断工具执行
      }
    }
  }

  // ==================== 工具执行 ====================

  /**
   * 执行工具
   *
   * @param toolName 工具名称
   * @param args 工具参数
   * @param context 执行上下文
   * @returns 执行结果
   */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const tool = this.customTools.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `工具 ${toolName} 未注册`,
        errorCode: 'TOOL_NOT_FOUND',
      };
    }

    // 检查并发限制
    if (this.currentExecutions >= this.config.maxConcurrentExecutions) {
      return {
        success: false,
        error: '已达到最大并发执行数',
        errorCode: 'MAX_CONCURRENT_EXCEEDED',
      };
    }

    const startTime = Date.now();
    this.currentExecutions++;

    const hookContext: ToolHookContext = {
      toolName,
      args,
      executionContext: context,
    };

    try {
      // 触发 beforeExecute 钩子
      await this.triggerToolHook('beforeExecute', hookContext);

      // 验证参数
      this.validateParameters(tool, args);

      // 执行工具
      const timeout = tool.timeout ?? this.config.defaultTimeout;
      const result = await this.executeWithTimeout(tool, args, context, timeout);

      // 计算执行时间
      result.executionTime = Date.now() - startTime;

      // 触发 afterExecute 钩子
      hookContext.result = result;
      await this.triggerToolHook('afterExecute', hookContext);

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;

      // 处理错误
      const result = this.handleToolError(toolName, error, executionTime);

      // 触发 onError 钩子
      hookContext.result = result;
      hookContext.error = error instanceof Error ? error : new Error(String(error));
      await this.triggerToolHook('onError', hookContext);

      return result;
    } finally {
      this.currentExecutions--;
    }
  }

  /**
   * 带超时的工具执行
   */
  private async executeWithTimeout(
    tool: CustomToolDefinition,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
    timeout: number
  ): Promise<ToolExecutionResult> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new ToolTimeoutError(tool.name, timeout));
      }, timeout);

      tool
        .executor(args, context)
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * 处理工具执行错误
   */
  private handleToolError(
    toolName: string,
    error: unknown,
    executionTime: number
  ): ToolExecutionResult {
    if (error instanceof ParameterValidationError) {
      return {
        success: false,
        error: error.message,
        errorCode: 'PARAMETER_VALIDATION_ERROR',
        executionTime,
        metadata: {
          parameterName: error.parameterName,
          expectedType: error.expectedType,
          actualValue: error.actualValue,
        },
      };
    }

    if (error instanceof ToolTimeoutError) {
      return {
        success: false,
        error: error.message,
        errorCode: 'TIMEOUT',
        executionTime,
        metadata: {
          timeout: error.timeout,
        },
      };
    }

    if (error instanceof ToolExecutionError) {
      return {
        success: false,
        error: error.message,
        errorCode: error.errorCode,
        executionTime,
      };
    }

    // 未知错误
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `工具 ${toolName} 执行失败: ${errorMessage}`,
      errorCode: 'EXECUTION_ERROR',
      executionTime,
    };
  }

  // ==================== 流式执行 ====================

  /**
   * 流式执行工具
   *
   * @param toolName 工具名称
   * @param args 工具参数
   * @param context 执行上下文
   * @returns 流式输出生成器
   */
  async *executeToolStreaming(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): AsyncGenerator<StreamChunk, ToolExecutionResult, void> {
    const tool = this.customTools.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `工具 ${toolName} 未注册`,
        errorCode: 'TOOL_NOT_FOUND',
      };
    }

    if (!tool.streamingExecutor) {
      // 如果没有流式执行器，回退到普通执行
      const result = await this.executeTool(toolName, args, context);
      if (result.output) {
        yield { type: 'text', content: result.output };
      }
      return result;
    }

    // 检查并发限制
    if (this.currentExecutions >= this.config.maxConcurrentExecutions) {
      return {
        success: false,
        error: '已达到最大并发执行数',
        errorCode: 'MAX_CONCURRENT_EXCEEDED',
      };
    }

    const startTime = Date.now();
    this.currentExecutions++;

    const hookContext: ToolHookContext = {
      toolName,
      args,
      executionContext: context,
    };

    try {
      // 触发 beforeExecute 钩子
      await this.triggerToolHook('beforeExecute', hookContext);

      // 验证参数
      this.validateParameters(tool, args);

      // 流式执行
      const generator = tool.streamingExecutor(args, context);
      let result: ToolExecutionResult | undefined;

      while (true) {
        const { value, done } = await generator.next();

        if (done) {
          result = value;
          break;
        }

        // 触发 onStream 钩子
        hookContext.chunk = value;
        await this.triggerToolHook('onStream', hookContext);

        // 如果是进度更新，触发 onProgress 钩子
        if (value.type === 'progress' && value.progress !== undefined) {
          hookContext.progress = value.progress;
          await this.triggerToolHook('onProgress', hookContext);
        }

        yield value;
      }

      // 计算执行时间
      if (result) {
        result.executionTime = Date.now() - startTime;
      } else {
        result = {
          success: true,
          executionTime: Date.now() - startTime,
        };
      }

      // 触发 afterExecute 钩子
      hookContext.result = result;
      await this.triggerToolHook('afterExecute', hookContext);

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;

      // 处理错误
      const result = this.handleToolError(toolName, error, executionTime);

      // 触发 onError 钩子
      hookContext.result = result;
      hookContext.error = error instanceof Error ? error : new Error(String(error));
      await this.triggerToolHook('onError', hookContext);

      // 输出错误块
      yield { type: 'error', content: result.error || '未知错误' };

      return result;
    } finally {
      this.currentExecutions--;
    }
  }

  // ==================== 工具信息 ====================

  /**
   * 获取工具的 JSON Schema 格式参数定义
   *
   * @param toolName 工具名称
   * @returns JSON Schema 或 undefined
   */
  getToolSchema(toolName: string): Record<string, unknown> | undefined {
    const tool = this.customTools.get(toolName);
    if (!tool) return undefined;

    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const param of tool.parameters) {
      properties[param.name] = this.parameterToJsonSchema(param);
      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }

  /**
   * 将参数定义转换为 JSON Schema
   */
  private parameterToJsonSchema(param: ToolParameter): Record<string, unknown> {
    const schema: Record<string, unknown> = {
      type: param.type,
      description: param.description,
    };

    if (param.default !== undefined) {
      schema.default = param.default;
    }

    if (param.enum) {
      schema.enum = param.enum;
    }

    if (param.minimum !== undefined) {
      schema.minimum = param.minimum;
    }

    if (param.maximum !== undefined) {
      schema.maximum = param.maximum;
    }

    if (param.minLength !== undefined) {
      schema.minLength = param.minLength;
    }

    if (param.maxLength !== undefined) {
      schema.maxLength = param.maxLength;
    }

    if (param.pattern) {
      schema.pattern = param.pattern;
    }

    if (param.items) {
      schema.items = { type: param.items.type };
    }

    return schema;
  }

  /**
   * 获取所有工具的摘要信息
   *
   * @returns 工具摘要数组
   */
  getToolsSummary(): Array<{
    name: string;
    description: string;
    category?: string;
    dangerous: boolean;
    supportsStreaming: boolean;
  }> {
    return Array.from(this.customTools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      category: tool.category,
      dangerous: tool.dangerous ?? false,
      supportsStreaming: tool.supportsStreaming ?? !!tool.streamingExecutor,
    }));
  }

  // ==================== 清理 ====================

  /**
   * 清除所有已注册的工具
   */
  clearAllTools(): void {
    this.customTools.clear();
    if (this.config.debug) {
      console.log('已清除所有工具');
    }
  }

  /**
   * 重置管理器状态
   */
  reset(): void {
    this.clearAllTools();
    this.clearAllToolHooks();
    this.currentExecutions = 0;
  }

  /**
   * 获取当前执行数
   */
  getCurrentExecutions(): number {
    return this.currentExecutions;
  }
}
