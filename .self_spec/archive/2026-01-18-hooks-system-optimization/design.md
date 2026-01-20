# Hooks 系统优化实现方案

## 一、需求概述

基于 Agent SDK 官方 hooks 文档,优化 Claude Replica 项目的 hooks 系统,实现:

1. **三种回调方式**: command(Shell命令)、script(JS/TS文件)、prompt(文本提示词)
2. **统一配置管理**: hooks 配置纳入 settings.json,由 ConfigManager 统一加载
3. **完整 SDK 集成**: 修复当前未连接到查询流程的问题
4. **全事件支持**: 实现 12 种 hook 事件,标注 TypeScript SDK 独有事件

## 二、当前问题

1. ❌ **未集成到 SDK**: MessageRouter.buildQueryOptions() 未使用 HookManager,hooks 配置未传递给 SDK
2. ❌ **回调类型不全**: 仅支持 command 和 prompt,缺少 script 类型
3. ❌ **配置分散**: hooks.json 独立于 settings.json,未纳入 ConfigManager 管理
4. ❌ **返回值控制受限**: 现有实现无法支持 SDK 的完整返回值(permissionDecision、updatedInput 等)

## 三、配置格式设计

### 3.1 settings.json 结构

```json
{
  "model": "sonnet",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Validating $FILE...' && test -f '$FILE'",
            "description": "验证文件存在"
          },
          {
            "type": "script",
            "script": "./hooks/pre-tool-validation.js",
            "description": "自定义验证逻辑"
          }
        ],
        "timeout": 30
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "npm run lint:fix $FILE"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "记住遵循编码规范"
          }
        ]
      }
    ]
  }
}
```

### 3.2 TypeScript 类型定义

```typescript
// Hook 定义(三种类型)
export interface HookDefinition {
  type: 'command' | 'script' | 'prompt';
  description?: string;

  // command 类型字段
  command?: string;         // Shell 命令,支持变量替换

  // script 类型字段
  script?: string;          // JS/TS 文件路径(相对或绝对)

  // prompt 类型字段
  prompt?: string;          // 纯文本提示词
}

// Matcher 配置
export interface HookMatcher {
  matcher?: string;         // 正则匹配器(可选)
  hooks: HookDefinition[];
  timeout?: number;         // 超时(秒)
}

// Hooks 配置
export type HooksConfig = Partial<Record<HookEvent, HookMatcher[]>>;
```

## 四、架构调整

### 4.1 数据流向

```
settings.json
  ↓
ConfigManager.loadProjectConfig()
  ↓ (解析 hooks 字段)
ProjectConfig.hooks
  ↓
Application.initialize()
  ↓
HookManager.loadHooks(config.hooks)
  ↓
MessageRouter.buildQueryOptions()
  ↓ (调用 HookManager.convertToSDKFormat())
SDKQueryOptions.hooks
  ↓
SDKQueryExecutor.mapToSDKOptions()
  ↓
SDK query({options: {hooks}})
```

### 4.2 HookManager 重构

**角色转变**: 配置加载器 → 纯执行器

**核心方法**:
- `loadHooks(config: HooksConfig)`: 接收配置(由 ConfigManager 提供)
- `convertToSDKFormat(config)`: 转换为 SDK 格式
- `executeCommand(command, context)`: 执行 command 类型
- `executeScript(scriptPath, context, toolUseID, signal)`: 执行 script 类型
- `executePrompt(prompt, context)`: 执行 prompt 类型
- `createSDKCallback(hook: HookDefinition)`: 为单个 hook 创建 SDK 回调函数

**移除方法**:
- `loadFromProjectRoot()`: 配置加载由 ConfigManager 负责
- `loadFromFile()`: 同上

### 4.3 MessageRouter 集成

在 `buildQueryOptions()` 中添加:

```typescript
async buildQueryOptions(session: Session): Promise<QueryOptions> {
  const { projectConfig } = session.context;

  // 现有逻辑...

  // 🆕 添加 hooks 配置
  const hooks = this.getHooksForSDK(session);

  const options: QueryOptions = {
    // 现有字段...
    hooks: hooks && Object.keys(hooks).length > 0 ? hooks : undefined,
  };

  return options;
}

private getHooksForSDK(session: Session): Partial<Record<HookEvent, HookCallbackMatcher[]>> | undefined {
  const { projectConfig } = session.context;
  if (!projectConfig.hooks) return undefined;

  return this.hookManager.convertToSDKFormat(projectConfig.hooks);
}
```

## 五、回调执行机制

### 5.1 Command 类型

**行为**:
- 执行 shell 命令,支持变量替换($TOOL, $FILE, $COMMAND 等)
- 退出码控制: 0=allow, 非0=deny

**实现**:
```typescript
async executeCommand(command: string, context: HookInput): Promise<HookJSONOutput> {
  // 1. 变量替换
  const expandedCommand = this.expandVariablesFromSDKInput(command, context);

  // 2. 执行命令
  const { stdout, stderr, code } = await execAsync(expandedCommand, {
    cwd: context.cwd,
    timeout: this.commandTimeout,
  });

  // 3. 解析退出码
  if (code === 0) {
    return { continue: true };
  } else {
    return {
      decision: 'block',
      reason: `Hook command failed: ${stderr}`,
    };
  }
}
```

### 5.2 Script 类型

**行为**:
- 动态加载 JS/TS 模块
- 调用导出的函数,返回完整的 SDK HookJSONOutput 对象
- 支持所有 SDK 返回值字段(permissionDecision、updatedInput、systemMessage 等)

**实现**:
```typescript
async executeScript(
  scriptPath: string,
  context: HookInput,
  toolUseID: string | undefined,
  signal: AbortSignal
): Promise<HookJSONOutput> {
  // 1. 解析路径(相对路径基于 cwd)
  const absolutePath = path.isAbsolute(scriptPath)
    ? scriptPath
    : path.join(context.cwd, scriptPath);

  // 2. 检查文件存在
  if (!fs.existsSync(absolutePath)) {
    console.error(`Hook script not found: ${absolutePath}`);
    return { continue: true };
  }

  // 3. 动态加载模块
  const module = await import(absolutePath);
  const hookFunction = module.default || module.hook;

  if (typeof hookFunction !== 'function') {
    throw new Error('Hook script must export a default function');
  }

  // 4. 调用函数
  const result = await hookFunction(context, toolUseID, { signal });
  return result;
}
```

**脚本示例** (`hooks/pre-tool-validation.js`):
```javascript
/**
 * @param {HookInput} input - SDK 钩子输入
 * @param {string | undefined} toolUseID - 工具使用 ID
 * @param {{ signal: AbortSignal }} options - 选项
 * @returns {Promise<HookJSONOutput>} 钩子输出
 */
export default async function (input, toolUseID, { signal }) {
  // 阻止修改 .env 文件
  if (input.hook_event_name === 'PreToolUse' &&
      input.tool_name === 'Write' &&
      input.tool_input?.file_path?.endsWith('.env')) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'Cannot modify .env files'
      }
    };
  }

  return { continue: true };
}
```

### 5.3 Prompt 类型

**行为**:
- 支持变量替换
- 自动转为 systemMessage 注入对话

**实现**:
```typescript
async executePrompt(prompt: string, context: HookInput): Promise<HookJSONOutput> {
  const expandedPrompt = this.expandVariablesFromSDKInput(prompt, context);
  return {
    systemMessage: expandedPrompt,
    continue: true
  };
}
```

## 六、事件类型支持

### 6.1 全部 12 种事件

| Hook 事件 | SDK 支持 | 说明 |
|-----------|---------|------|
| PreToolUse | Python + TypeScript | 工具调用前 |
| PostToolUse | Python + TypeScript | 工具调用后 |
| PostToolUseFailure | **仅 TypeScript** | 工具调用失败后 |
| UserPromptSubmit | Python + TypeScript | 用户提交提示词 |
| Stop | Python + TypeScript | 代理停止 |
| SubagentStart | **仅 TypeScript** | 子代理启动 |
| SubagentStop | Python + TypeScript | 子代理停止 |
| PreCompact | Python + TypeScript | 对话压缩前 |
| PermissionRequest | **仅 TypeScript** | 权限请求 |
| SessionStart | **仅 TypeScript** | 会话开始 |
| SessionEnd | **仅 TypeScript** | 会话结束 |
| Notification | **仅 TypeScript** | 代理通知 |

### 6.2 TypeScript 独有事件标注

**配置验证时警告**:
```typescript
const TYPESCRIPT_ONLY_EVENTS: HookEvent[] = [
  'PostToolUseFailure',
  'SessionStart',
  'SessionEnd',
  'Notification',
  'PermissionRequest',
  'SubagentStart',
];

static validateConfig(config: HooksConfig): { valid: boolean; errors: string[]; warnings: string[] } {
  const warnings: string[] = [];

  for (const [event, matchers] of Object.entries(config)) {
    if (TYPESCRIPT_ONLY_EVENTS.includes(event as HookEvent)) {
      warnings.push(
        `Event "${event}" is only available in TypeScript SDK`
      );
    }
  }

  return { valid: true, errors: [], warnings };
}
```

## 七、安全策略与错误处理

### 7.1 脚本路径白名单

**配置**:
```json
{
  "hookScriptPaths": [
    "./.claude/hooks",
    "./hooks",
    "/trusted/scripts"
  ],
  "hooks": {
    "PreToolUse": [{
      "hooks": [{"type": "script", "script": "./hooks/validation.js"}]
    }]
  }
}
```

**验证逻辑**:
```typescript
function validateScriptPath(scriptPath: string, allowedPaths: string[], cwd: string): boolean {
  const absolutePath = path.resolve(cwd, scriptPath);

  // 检查是否在白名单目录内
  for (const allowedPath of allowedPaths) {
    const normalizedAllowed = path.resolve(cwd, allowedPath);
    if (absolutePath.startsWith(normalizedAllowed)) {
      return true;
    }
  }

  return false;
}
```

**默认白名单**: `["./.claude/hooks", "./hooks"]`

### 7.2 向后兼容策略

**立即废弃** `.claude/hooks.json`:
- 在加载时检测到该文件存在时,记录警告日志提示迁移
- 文档中提供迁移指南
- 不自动加载 hooks.json (用户必须手动迁移到 settings.json)

### 7.3 配置错误处理
- 记录警告日志
- 跳过无效配置
- 不影响应用启动

### 7.4 脚本加载/执行失败
- 捕获异常,记录错误日志
- 返回 `{ continue: true }` (不阻止流程)
- 用户需查看日志排查

### 7.5 命令执行超时
- 使用 matcher 级别的 `timeout` 配置
- 超时记录日志但不阻止流程

## 八、关键文件修改清单

| 文件路径 | 修改类型 | 修改内容 |
|---------|---------|---------|
| `src/hooks/HookManager.ts` | 重构 | 添加 `executeScript()`、`createSDKCallback()`、`convertToSDKFormat()`,移除文件加载逻辑 |
| `src/core/MessageRouter.ts` | 新增 | 构造函数注入 `hookManager`,在 `buildQueryOptions()` 中调用 `getHooksForSDK()` |
| `src/main.ts` | 调整 | 将 `this.hookManager` 传递给 MessageRouter 构造函数,调用 `hookManager.loadHooks(projectConfig.hooks)` |
| `src/config/SDKConfigLoader.ts` | 验证 | 确认 `ProjectConfig.hooks` 类型定义完整 |
| `src/sdk/SDKQueryExecutor.ts` | 验证 | 确认 `mapToSDKOptions()` 正确传递 hooks 选项 |

## 九、验证计划

### 9.1 单元测试
- `HookManager.executeCommand()`: 命令执行和退出码解析
- `HookManager.executeScript()`: 模块加载和调用
- `HookManager.executePrompt()`: 变量替换
- `HookManager.convertToSDKFormat()`: 配置转换

### 9.2 集成测试
- 端到端流程: settings.json → SDK hooks 配置 → 回调执行
- 各事件类型触发验证
- 三种回调类型混合使用

### 9.3 手动验证

**测试步骤**:

1. **创建测试配置** `.claude/settings.json`:
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Write",
      "hooks": [
        {"type": "command", "command": "echo 'PreToolUse: $TOOL $FILE'"},
        {"type": "prompt", "prompt": "记住遵循编码规范"}
      ]
    }],
    "PostToolUse": [{
      "matcher": "Write",
      "hooks": [{"type": "command", "command": "echo 'PostToolUse: $FILE'"}]
    }]
  }
}
```

2. **创建测试脚本** `hooks/test-hook.js`:
```javascript
export default async function (input, toolUseID, { signal }) {
  console.log('Script hook triggered:', input.hook_event_name);
  return { continue: true };
}
```

3. **运行测试**:
```bash
npm run build
npm run start -- "创建一个测试文件"
```

4. **验证输出**:
- 日志中显示 "PreToolUse: Write ..." 和 "PostToolUse: ..."
- 对话中出现 "记住遵循编码规范" 系统消息
- 脚本 hook 成功执行

## 十、迁移指南

### 10.1 废弃 .claude/hooks.json

**不再支持**: 直接废弃 `.claude/hooks.json` 配置文件

**迁移步骤**:
1. 将 `.claude/hooks.json` 内容复制到 `.claude/settings.json` 的 `hooks` 字段
2. 删除 `.claude/hooks.json` 文件
3. 重新启动应用

**迁移示例**:

旧配置 (`.claude/hooks.json`):
```json
{
  "PostToolUse": [
    {
      "matcher": "Write",
      "hooks": [{"type": "command", "command": "echo 'test'"}]
    }
  ]
}
```

新配置 (`.claude/settings.json`):
```json
{
  "model": "sonnet",
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [{"type": "command", "command": "echo 'test'"}]
      }
    ]
  }
}
```

### 10.2 检测与警告

在应用启动时检测 `.claude/hooks.json` 是否存在:
```typescript
if (fs.existsSync(path.join(projectRoot, '.claude/hooks.json'))) {
  console.warn(
    'WARNING: .claude/hooks.json is deprecated. ' +
    'Please migrate hooks configuration to .claude/settings.json'
  );
}
```

## 十一、实施优先级

**Phase 1: 核心集成** (优先)
1. MessageRouter 注入 HookManager 并在 buildQueryOptions 中组装 hooks
2. 验证 command/prompt 类型端到端流程

**Phase 2: Script 支持**
1. 实现 `executeScript()` 方法
2. 动态模块加载和错误处理

**Phase 3: 完善和文档**
1. TypeScript 独有事件标注
2. 配置验证优化
3. 用户文档和示例
