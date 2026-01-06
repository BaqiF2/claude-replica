# Quick Code Patterns Reference

Quick reference for common claude-agent-sdk patterns. All examples extracted from official documentation.

## Basic Setup

### TypeScript - Simple Query
```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

for await (const message of query({
  prompt: "Analyze this codebase",
  options: {
    allowedTools: ['Read', 'Grep', 'Glob']
  }
})) {
  if (message.type === 'result') console.log(message.result);
}
```

### Python - Simple Query
```python
from claude_agent_sdk import query

async for message in query(
    prompt="Analyze this codebase",
    options={"allowed_tools": ["Read", "Grep", "Glob"]}
):
    if hasattr(message, 'result'):
        print(message.result)
```

---

## Custom Tools

### Pattern: API Integration Tool

**Purpose**: Create a tool to call external APIs
**Docs**: Custom-Tools.md

**TypeScript**:
```typescript
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const weatherServer = createSdkMcpServer({
  name: "weather-api",
  version: "1.0.0",
  tools: [
    tool(
      "get_weather",
      "Get current temperature for a location",
      {
        latitude: z.number(),
        longitude: z.number()
      },
      async (args) => {
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${args.latitude}&longitude=${args.longitude}&current=temperature_2m`
        );
        const data = await response.json();
        return {
          content: [{
            type: "text",
            text: `Temperature: ${data.current.temperature_2m}°F`
          }]
        };
      }
    )
  ]
});

// Usage with streaming input (required for MCP)
async function* generateMessages() {
  yield {
    type: "user" as const,
    message: { role: "user" as const, content: "What's the weather in SF?" }
  };
}

for await (const message of query({
  prompt: generateMessages(),
  options: {
    mcpServers: { "weather-api": weatherServer },
    allowedTools: ["mcp__weather-api__get_weather"]
  }
})) { /* ... */ }
```

**Python**:
```python
from claude_agent_sdk import create_sdk_mcp_server, tool
import aiohttp

@tool("get_weather", "Get current temperature", {"latitude": float, "longitude": float})
async def get_weather(args):
    async with aiohttp.ClientSession() as session:
        async with session.get(
            f"https://api.open-meteo.com/v1/forecast?latitude={args['latitude']}&longitude={args['longitude']}&current=temperature_2m"
        ) as response:
            data = await response.json()
    return {"content": [{"type": "text", "text": f"Temperature: {data['current']['temperature_2m']}°F"}]}

server = create_sdk_mcp_server("weather-api", "1.0.0", [get_weather])
```

---

## Permissions

### Pattern: File Protection Hook

**Purpose**: Block modifications to sensitive files
**Docs**: Control-Execute-With-Hooks.md

**TypeScript**:
```typescript
import { query, HookCallback } from "@anthropic-ai/claude-agent-sdk";

const protectEnvFiles: HookCallback = async (input, toolUseID) => {
  const filePath = input.tool_input?.file_path as string;
  if (filePath?.endsWith('.env')) {
    return {
      hookSpecificOutput: {
        hookEventName: input.hook_event_name,
        permissionDecision: 'deny',
        permissionDecisionReason: 'Cannot modify .env files'
      }
    };
  }
  return {};
};

for await (const message of query({
  prompt: "Update configuration",
  options: {
    hooks: {
      PreToolUse: [{ matcher: 'Write|Edit', hooks: [protectEnvFiles] }]
    }
  }
})) { /* ... */ }
```

**Python**:
```python
from claude_agent_sdk import query, HookMatcher

async def protect_env_files(input_data, tool_use_id, context):
    file_path = input_data['tool_input'].get('file_path', '')
    if file_path.endswith('.env'):
        return {
            'hookSpecificOutput': {
                'hookEventName': input_data['hook_event_name'],
                'permissionDecision': 'deny',
                'permissionDecisionReason': 'Cannot modify .env files'
            }
        }
    return {}

async for message in query(
    prompt="Update configuration",
    options={
        'hooks': {
            'PreToolUse': [HookMatcher(matcher='Write|Edit', hooks=[protect_env_files])]
        }
    }
): # ...
```

---

## Subagents

### Pattern: Parallel Code Review

**Purpose**: Run multiple review tasks concurrently
**Docs**: Subagents.md

**TypeScript**:
```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

for await (const message of query({
  prompt: "Review this PR for issues",
  options: {
    allowedTools: ['Read', 'Grep', 'Glob', 'Task'],
    agents: {
      'security-reviewer': {
        description: 'Security code reviewer',
        prompt: 'Identify security vulnerabilities and best practices violations.',
        tools: ['Read', 'Grep', 'Glob'],
        model: 'sonnet'
      },
      'style-checker': {
        description: 'Code style and formatting checker',
        prompt: 'Check code style, formatting, and naming conventions.',
        tools: ['Read', 'Grep', 'Glob']
      },
      'test-analyzer': {
        description: 'Test coverage analyzer',
        prompt: 'Analyze test coverage and suggest missing tests.',
        tools: ['Read', 'Grep', 'Glob', 'Bash']
      }
    }
  }
})) {
  if ('result' in message) console.log(message.result);
}
```

**Python**:
```python
from claude_agent_sdk import query, AgentDefinition

async for message in query(
    prompt="Review this PR for issues",
    options={
        'allowed_tools': ['Read', 'Grep', 'Glob', 'Task'],
        'agents': {
            'security-reviewer': AgentDefinition(
                description='Security code reviewer',
                prompt='Identify security vulnerabilities and best practices violations.',
                tools=['Read', 'Grep', 'Glob'],
                model='sonnet'
            ),
            'style-checker': AgentDefinition(
                description='Code style and formatting checker',
                prompt='Check code style, formatting, and naming conventions.',
                tools=['Read', 'Grep', 'Glob']
            ),
            'test-analyzer': AgentDefinition(
                description='Test coverage analyzer',
                prompt='Analyze test coverage and suggest missing tests.',
                tools=['Read', 'Grep', 'Glob', 'Bash']
            )
        }
    }
):
    if hasattr(message, 'result'):
        print(message.result)
```

---

## Structured Outputs

### Pattern: TODO Extraction with Git Blame

**Purpose**: Extract TODOs with author information
**Docs**: Structured-outputs.md

**TypeScript**:
```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

const todoSchema = {
  type: 'object',
  properties: {
    todos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'number' },
          author: { type: 'string' },
          date: { type: 'string' }
        },
        required: ['text', 'file', 'line']
      }
    },
    total_count: { type: 'number' }
  },
  required: ['todos', 'total_count']
};

for await (const message of query({
  prompt: 'Find all TODO comments in src/ and identify who added them',
  options: {
    outputFormat: {
      type: 'json_schema',
      schema: todoSchema
    }
  }
})) {
  if (message.type === 'result' && message.structured_output) {
    console.log(`Found ${message.structured_output.total_count} TODOs`);
    message.structured_output.todos.forEach(todo => {
      console.log(`${todo.file}:${todo.line} - ${todo.text}`);
    });
  }
}
```

**Python**:
```python
from claude_agent_sdk import query

todo_schema = {
    "type": "object",
    "properties": {
        "todos": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "file": {"type": "string"},
                    "line": {"type": "number"},
                    "author": {"type": "string"},
                    "date": {"type": "string"}
                },
                "required": ["text", "file", "line"]
            }
        },
        "total_count": {"type": "number"}
    },
    "required": ["todos", "total_count"]
}

async for message in query(
    prompt="Find all TODO comments in src/ and identify who added them",
    options={"output_format": {"type": "json_schema", "schema": todo_schema}}
):
    if hasattr(message, 'structured_output'):
        print(f"Found {message.structured_output['total_count']} TODOs")
```

---

## Session Management

### Pattern: Resume Conversation

**Purpose**: Continue previous conversation
**Docs**: Session-Management.md

**TypeScript**:
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// First conversation - capture session ID
let sessionId: string;

for await (const message of query({
  prompt: "Start analyzing the codebase"
})) {
  if (message.type === 'system' && message.subtype === 'init') {
    sessionId = message.session_id;
    console.log(`Session: ${sessionId}`);
  }
}

// Later - resume the session
for await (const message of query({
  prompt: "Continue the analysis",
  options: { resume: sessionId }
})) { /* ... */ }
```

**Python**:
```python
from claude_agent_sdk import query

# First conversation
session_id = None
async for message in query(prompt="Start analyzing the codebase"):
    if hasattr(message, 'subtype') and message.subtype == 'init':
        session_id = message.data.get('session_id')

# Later - resume
async for message in query(
    prompt="Continue the analysis",
    options={"resume": session_id}
): # ...
```

---

## Cost Tracking

### Pattern: Monitor API Usage

**Purpose**: Track token usage and costs
**Docs**: Tracking-Costs.md

**TypeScript**:
```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

let totalTokens = 0;

for await (const message of query({
  prompt: "Complex analysis task",
  options: {
    onUsage: (usage) => {
      totalTokens += usage.input_tokens + usage.output_tokens;
      console.log(`Tokens used: ${usage.input_tokens + usage.output_tokens}`);
      console.log(`Total so far: ${totalTokens}`);
    }
  }
})) { /* ... */ }
```

**Python**:
```python
from claude_agent_sdk import query

total_tokens = 0

def track_usage(usage):
    global total_tokens
    tokens = usage['input_tokens'] + usage['output_tokens']
    total_tokens += tokens
    print(f"Tokens used: {tokens}, Total: {total_tokens}")

async for message in query(
    prompt="Complex analysis task",
    options={"on_usage": track_usage}
): # ...
```

---

## Common Configuration Options

### TypeScript Options Summary
```typescript
{
  allowedTools: ['Read', 'Write', 'Bash', 'Grep', 'Glob'],
  permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions',
  canUseTool: async (toolName, input) => ({ behavior: 'allow' }),
  hooks: { PreToolUse: [...], PostToolUse: [...] },
  agents: { 'agent-name': AgentDefinition },
  mcpServers: { 'server-name': McpServer },
  outputFormat: { type: 'json_schema', schema: {...} },
  settingSources: ['user', 'project'],
  onUsage: (usage) => { /* track */ },
  model: 'claude-sonnet-4-5',
  cwd: '/path/to/project'
}
```

### Python Options Summary
```python
{
    "allowed_tools": ["Read", "Write", "Bash", "Grep", "Glob"],
    "permission_mode": "default" | "acceptEdits" | "bypassPermissions",
    "can_use_tool": lambda tool, input: {"behavior": "allow"},
    "hooks": {"PreToolUse": [...], "PostToolUse": [...]},
    "agents": {"agent-name": AgentDefinition(...)},
    "mcp_servers": {"server-name": mcp_server},
    "output_format": {"type": "json_schema", "schema": {...}},
    "setting_sources": ["user", "project"],
    "on_usage": lambda usage: None,
    "model": "claude-sonnet-4-5",
    "cwd": "/path/to/project"
}
```

---

## Key Differences: TypeScript vs Python

| Feature | TypeScript | Python |
|:--------|:-----------|:-------|
| **Options** | camelCase | snake_case |
| **Async iteration** | `for await (const x of ...)` | `async for x in ...` |
| **Type schemas** | Zod (`z.string()`) | Type hints or Pydantic |
| **Imports** | `import { query }` | `from ... import query` |
| **Tool decorator** | N/A (use `tool()`) | `@tool(...)` |
| **MCP streaming** | Async generator required | Async generator required |

---

*All patterns extracted from official claude-agent-sdk documentation*
