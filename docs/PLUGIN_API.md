# 插件 API 文档

本文档描述了 Claude Replica 的扩展性架构和插件 API，帮助开发者创建自定义工具和扩展。

## 概述

Claude Replica 提供了完整的扩展性架构，支持：

- **自定义工具注册** - 注册新的工具供 AI 使用
- **工具参数验证** - 自动验证工具参数的类型和约束
- **工具错误处理** - 统一的错误处理机制
- **工具钩子点** - 在工具执行的各个阶段插入自定义逻辑
- **异步执行和流式输出** - 支持长时间运行的任务和实时输出

## 快速开始

### 安装

```bash
npm install claude-replica
```

### 基本使用

```typescript
import { ExtensibilityManager, CustomToolDefinition } from 'claude-replica';

// 创建扩展性管理器
const manager = new ExtensibilityManager({
  defaultTimeout: 30000,  // 默认超时 30 秒
  enableValidation: true, // 启用参数验证
});

// 定义自定义工具
const myTool: CustomToolDefinition = {
  name: 'myCustomTool',
  description: '我的自定义工具',
  parameters: [
    {
      name: 'input',
      type: 'string',
      description: '输入内容',
      required: true,
    },
  ],
  executor: async (args, context) => {
    const input = args.input as string;
    return {
      success: true,
      output: `处理结果: ${input}`,
    };
  },
};

// 注册工具
manager.registerTool(myTool);

// 执行工具
const result = await manager.executeTool('myCustomTool', { input: 'hello' }, {
  sessionId: 'session-1',
  messageUuid: 'msg-1',
  workingDir: process.cwd(),
});

console.log(result.output); // 处理结果: hello
```

## 工具定义

### CustomToolDefinition 接口

```typescript
interface CustomToolDefinition {
  // 必需字段
  name: string;                    // 工具名称（字母开头，只能包含字母、数字、下划线）
  description: string;             // 工具描述
  parameters: ToolParameter[];     // 参数定义列表
  executor: ToolExecutor;          // 执行函数

  // 可选字段
  streamingExecutor?: StreamingToolExecutor;  // 流式执行函数
  dangerous?: boolean;             // 是否为危险工具
  category?: string;               // 工具分类
  version?: string;                // 工具版本
  timeout?: number;                // 超时时间（毫秒）
  supportsStreaming?: boolean;     // 是否支持流式输出
}
```

### 参数定义

```typescript
interface ToolParameter {
  name: string;           // 参数名称
  type: ParameterType;    // 参数类型: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string;    // 参数描述
  required: boolean;      // 是否必需

  // 可选约束
  default?: unknown;      // 默认值
  enum?: string[];        // 枚举值（仅 string 类型）
  items?: { type: ParameterType };  // 数组元素类型
  properties?: Record<string, ToolParameter>;  // 对象属性
  minimum?: number;       // 最小值（仅 number 类型）
  maximum?: number;       // 最大值（仅 number 类型）
  minLength?: number;     // 最小长度（string 或 array）
  maxLength?: number;     // 最大长度（string 或 array）
  pattern?: string;       // 正则表达式模式（仅 string 类型）
}
```

### 参数类型示例

#### 字符串参数

```typescript
{
  name: 'email',
  type: 'string',
  description: '邮箱地址',
  required: true,
  pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
}
```

#### 数字参数

```typescript
{
  name: 'count',
  type: 'number',
  description: '数量',
  required: true,
  minimum: 1,
  maximum: 100,
  default: 10,
}
```

#### 枚举参数

```typescript
{
  name: 'status',
  type: 'string',
  description: '状态',
  required: true,
  enum: ['active', 'inactive', 'pending'],
}
```

#### 数组参数

```typescript
{
  name: 'tags',
  type: 'array',
  description: '标签列表',
  required: false,
  items: { type: 'string' },
  minLength: 1,
  maxLength: 10,
}
```

## 执行上下文

工具执行时会收到执行上下文：

```typescript
interface ToolExecutionContext {
  sessionId: string;       // 会话 ID
  messageUuid: string;     // 消息 UUID
  workingDir: string;      // 工作目录
  userConfig?: Record<string, unknown>;  // 用户配置
  abortSignal?: AbortSignal;  // 取消信号
}
```

## 执行结果

工具执行后返回结果：

```typescript
interface ToolExecutionResult {
  success: boolean;        // 是否成功
  output?: string;         // 输出内容
  data?: unknown;          // 结构化数据
  error?: string;          // 错误信息
  errorCode?: string;      // 错误代码
  executionTime?: number;  // 执行时间（毫秒）
  metadata?: Record<string, unknown>;  // 元数据
}
```

## 流式输出

对于长时间运行的任务，可以使用流式输出：

```typescript
const streamingTool: CustomToolDefinition = {
  name: 'longRunningTask',
  description: '长时间运行的任务',
  parameters: [],
  supportsStreaming: true,
  executor: async () => ({ success: true }),
  streamingExecutor: async function* (args, context) {
    // 输出文本
    yield { type: 'text', content: '开始处理...\n' };

    // 输出进度
    for (let i = 0; i <= 100; i += 10) {
      yield { type: 'progress', content: `${i}%`, progress: i };
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 输出数据
    yield { type: 'data', content: '', data: { result: 'done' } };

    // 返回最终结果
    return { success: true, output: '处理完成' };
  },
};
```

### 流式块类型

```typescript
interface StreamChunk {
  type: 'text' | 'progress' | 'data' | 'error';
  content: string;
  progress?: number;  // 进度百分比（0-100）
  data?: unknown;     // 结构化数据
}
```

### 消费流式输出

```typescript
const generator = manager.executeToolStreaming('longRunningTask', {}, context);

for await (const chunk of generator) {
  switch (chunk.type) {
    case 'text':
      process.stdout.write(chunk.content);
      break;
    case 'progress':
      console.log(`进度: ${chunk.progress}%`);
      break;
    case 'data':
      console.log('数据:', chunk.data);
      break;
    case 'error':
      console.error('错误:', chunk.content);
      break;
  }
}
```

## 工具钩子

钩子允许在工具执行的各个阶段插入自定义逻辑：

### 钩子事件

| 事件 | 描述 | 触发时机 |
|------|------|----------|
| `beforeExecute` | 执行前 | 参数验证之前 |
| `afterExecute` | 执行后 | 成功执行之后 |
| `onError` | 错误时 | 执行出错时 |
| `onProgress` | 进度更新 | 流式输出进度时 |
| `onStream` | 流式输出 | 每个流式块输出时 |

### 添加钩子

```typescript
// 执行前钩子
manager.addToolHook('beforeExecute', async (context) => {
  console.log(`即将执行工具: ${context.toolName}`);
  console.log(`参数:`, context.args);
});

// 执行后钩子
manager.addToolHook('afterExecute', async (context) => {
  console.log(`工具执行完成: ${context.toolName}`);
  console.log(`结果:`, context.result);
});

// 错误钩子
manager.addToolHook('onError', async (context) => {
  console.error(`工具执行失败: ${context.toolName}`);
  console.error(`错误:`, context.error);
});

// 进度钩子
manager.addToolHook('onProgress', async (context) => {
  console.log(`进度: ${context.progress}%`);
});
```

### 钩子上下文

```typescript
interface ToolHookContext {
  toolName: string;                    // 工具名称
  args: Record<string, unknown>;       // 工具参数
  executionContext: ToolExecutionContext;  // 执行上下文
  result?: ToolExecutionResult;        // 执行结果（afterExecute/onError）
  error?: Error;                       // 错误信息（onError）
  chunk?: StreamChunk;                 // 流式块（onStream）
  progress?: number;                   // 进度（onProgress）
}
```

## 错误处理

### 错误类型

```typescript
// 参数验证错误
class ParameterValidationError extends Error {
  parameterName: string;
  expectedType: string;
  actualValue: unknown;
}

// 工具执行错误
class ToolExecutionError extends Error {
  toolName: string;
  errorCode: string;
  cause?: Error;
}

// 工具超时错误
class ToolTimeoutError extends Error {
  toolName: string;
  timeout: number;
}
```

### 错误代码

| 错误代码 | 描述 |
|----------|------|
| `TOOL_NOT_FOUND` | 工具未注册 |
| `PARAMETER_VALIDATION_ERROR` | 参数验证失败 |
| `TIMEOUT` | 执行超时 |
| `EXECUTION_ERROR` | 执行错误 |
| `MAX_CONCURRENT_EXCEEDED` | 超过最大并发数 |

### 自定义错误处理

```typescript
const result = await manager.executeTool('myTool', args, context);

if (!result.success) {
  switch (result.errorCode) {
    case 'PARAMETER_VALIDATION_ERROR':
      console.error('参数错误:', result.error);
      break;
    case 'TIMEOUT':
      console.error('执行超时');
      break;
    case 'EXECUTION_ERROR':
      console.error('执行失败:', result.error);
      break;
    default:
      console.error('未知错误:', result.error);
  }
}
```

## 配置选项

```typescript
interface ExtensibilityManagerConfig {
  defaultTimeout?: number;           // 默认超时时间（毫秒），默认 30000
  debug?: boolean;                   // 是否启用调试日志，默认 false
  maxConcurrentExecutions?: number;  // 最大并发执行数，默认 10
  enableValidation?: boolean;        // 是否启用参数验证，默认 true
}
```

## 工具 Schema

获取工具的 JSON Schema 格式参数定义：

```typescript
const schema = manager.getToolSchema('myTool');
console.log(JSON.stringify(schema, null, 2));
```

输出示例：

```json
{
  "type": "object",
  "properties": {
    "input": {
      "type": "string",
      "description": "输入内容",
      "minLength": 1
    },
    "count": {
      "type": "number",
      "description": "数量",
      "minimum": 0,
      "maximum": 100,
      "default": 10
    }
  },
  "required": ["input"]
}
```

## 工具摘要

获取所有工具的摘要信息：

```typescript
const summary = manager.getToolsSummary();
console.log(summary);
```

输出示例：

```json
[
  {
    "name": "myTool",
    "description": "我的工具",
    "category": "utility",
    "dangerous": false,
    "supportsStreaming": true
  }
]
```

## 最佳实践

### 1. 参数验证

始终定义完整的参数约束，让系统自动验证：

```typescript
{
  name: 'filePath',
  type: 'string',
  description: '文件路径',
  required: true,
  pattern: '^[a-zA-Z0-9_/.-]+$',  // 限制允许的字符
  maxLength: 255,                  // 限制最大长度
}
```

### 2. 错误处理

在执行函数中正确处理错误：

```typescript
executor: async (args, context) => {
  try {
    // 执行逻辑
    return { success: true, output: 'done' };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      errorCode: 'CUSTOM_ERROR',
    };
  }
}
```

### 3. 超时设置

为长时间运行的任务设置合理的超时：

```typescript
{
  name: 'longTask',
  timeout: 60000,  // 60 秒超时
  // ...
}
```

### 4. 流式输出

对于长时间运行的任务，使用流式输出提供实时反馈：

```typescript
streamingExecutor: async function* (args, context) {
  yield { type: 'text', content: '开始处理...\n' };
  
  // 定期输出进度
  for (let i = 0; i <= 100; i += 10) {
    yield { type: 'progress', content: `${i}%`, progress: i };
    // 执行部分工作
  }
  
  return { success: true };
}
```

### 5. 危险工具标记

对于可能造成破坏的工具，标记为危险：

```typescript
{
  name: 'deleteFile',
  dangerous: true,  // 标记为危险工具
  // ...
}
```

## 完整示例

### 文件搜索工具

```typescript
import { ExtensibilityManager, CustomToolDefinition } from 'claude-replica';
import * as fs from 'fs/promises';
import * as path from 'path';

const fileSearchTool: CustomToolDefinition = {
  name: 'fileSearch',
  description: '在目录中搜索文件',
  category: 'file',
  dangerous: false,
  supportsStreaming: true,
  parameters: [
    {
      name: 'directory',
      type: 'string',
      description: '搜索目录',
      required: true,
    },
    {
      name: 'pattern',
      type: 'string',
      description: '文件名模式（正则表达式）',
      required: true,
    },
    {
      name: 'maxResults',
      type: 'number',
      description: '最大结果数',
      required: false,
      default: 100,
      minimum: 1,
      maximum: 1000,
    },
  ],
  executor: async (args, context) => {
    const directory = args.directory as string;
    const pattern = new RegExp(args.pattern as string);
    const maxResults = args.maxResults as number;

    const results: string[] = [];
    
    async function search(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (results.length >= maxResults) break;
        
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await search(fullPath);
        } else if (pattern.test(entry.name)) {
          results.push(fullPath);
        }
      }
    }

    await search(directory);

    return {
      success: true,
      output: results.join('\n'),
      data: { files: results, count: results.length },
    };
  },
  streamingExecutor: async function* (args, context) {
    const directory = args.directory as string;
    const pattern = new RegExp(args.pattern as string);
    const maxResults = args.maxResults as number;

    const results: string[] = [];
    let scannedDirs = 0;

    async function* search(dir: string): AsyncGenerator<string> {
      scannedDirs++;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (results.length >= maxResults) return;
        
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          yield* search(fullPath);
        } else if (pattern.test(entry.name)) {
          results.push(fullPath);
          yield fullPath;
        }
      }
    }

    yield { type: 'text', content: `开始搜索: ${directory}\n` };

    for await (const file of search(directory)) {
      yield { type: 'text', content: `找到: ${file}\n` };
    }

    yield { type: 'text', content: `\n搜索完成，共扫描 ${scannedDirs} 个目录\n` };

    return {
      success: true,
      output: `找到 ${results.length} 个文件`,
      data: { files: results, count: results.length },
    };
  },
};

// 使用
const manager = new ExtensibilityManager();
manager.registerTool(fileSearchTool);

// 普通执行
const result = await manager.executeTool('fileSearch', {
  directory: '/path/to/search',
  pattern: '\\.ts$',
  maxResults: 50,
}, context);

// 流式执行
for await (const chunk of manager.executeToolStreaming('fileSearch', {
  directory: '/path/to/search',
  pattern: '\\.ts$',
}, context)) {
  process.stdout.write(chunk.content);
}
```

## API 参考

### ExtensibilityManager

| 方法 | 描述 |
|------|------|
| `registerTool(tool)` | 注册自定义工具 |
| `unregisterTool(name)` | 注销工具 |
| `getTool(name)` | 获取工具定义 |
| `getAllTools()` | 获取所有工具 |
| `hasTool(name)` | 检查工具是否存在 |
| `getToolCount()` | 获取工具数量 |
| `executeTool(name, args, context)` | 执行工具 |
| `executeToolStreaming(name, args, context)` | 流式执行工具 |
| `addToolHook(event, handler)` | 添加钩子 |
| `removeToolHook(event, handler)` | 移除钩子 |
| `clearToolHooks(event)` | 清除指定事件的钩子 |
| `clearAllToolHooks()` | 清除所有钩子 |
| `getToolSchema(name)` | 获取工具 JSON Schema |
| `getToolsSummary()` | 获取工具摘要 |
| `clearAllTools()` | 清除所有工具 |
| `reset()` | 重置管理器状态 |
