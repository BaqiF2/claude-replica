# Troubleshooting Index

Quick reference for common issues when developing with claude-agent-sdk.

## By Symptom

### Skills

#### Skills Not Found / Not Loading
**Symptom**: Agent says skills are not available, or skill doesn't trigger

**Primary Doc**: Agent-Skills.md → Troubleshooting > Skills Not Found

**Common Causes**:
1. Missing `settingSources` configuration
2. Wrong working directory (`cwd`)
3. Skill not in `allowedTools`
4. SKILL.md syntax error

**Diagnostic Steps**:
```bash
# 1. Verify settingSources is configured
# TS: settingSources: ['user', 'project']
# PY: setting_sources=["user", "project"]

# 2. Check skill directory exists
ls .claude/skills/*/SKILL.md      # Project skills
ls ~/.claude/skills/*/SKILL.md    # User skills

# 3. Verify Skill tool is allowed
# allowedTools must include "Skill"

# 4. Check YAML syntax
# SKILL.md must have valid YAML frontmatter
```

**Quick Fix**:
```typescript
// TypeScript
options: {
  settingSources: ['user', 'project'],  // ADD THIS
  allowedTools: ['Skill', /* other tools */]
}
```
```python
# Python
options = {
    "setting_sources": ["user", "project"],  # ADD THIS
    "allowed_tools": ["Skill", # other tools]
}
```

**Related Sections**:
- Agent-Skills.md > Using Skills with the SDK
- Agent-Skills.md > Skill Locations

---

#### Skill Not Being Used
**Symptom**: Skill exists but Claude doesn't invoke it

**Primary Doc**: Agent-Skills.md → Troubleshooting > Skill Not Being Used

**Common Causes**:
1. Description doesn't match user request
2. Skill tool not enabled
3. Keywords not specific enough

**Solutions**:
1. Improve `description` field with relevant keywords
2. Explicitly mention skill by name in prompt
3. Ensure `"Skill"` is in `allowedTools`

**Example Fix**:
```yaml
# Before (too vague)
description: "Helper for data processing"

# After (specific)
description: "PDF document processing specialist. Use for extracting text from PDFs, parsing PDF tables, or analyzing PDF structure."
```

---

### MCP & Custom Tools

#### MCP Tools Not Available
**Symptom**: Custom MCP tools don't appear or can't be called

**Primary Doc**: MCP.md → Error Handling, Custom-Tools.md

**Common Causes**:
1. Not using streaming input mode (MCP requires it)
2. MCP server not in `mcpServers` option
3. Tool not in `allowedTools`
4. Incorrect tool name format

**Diagnostic Steps**:
```typescript
// 1. Check you're using async generator for prompt
async function* generateMessages() {  // ✓ Required
  yield { type: "user", message: { role: "user", content: "..." } };
}

// ❌ This won't work with MCP:
query({ prompt: "string prompt", ... })

// 2. Verify MCP server configuration
options: {
  mcpServers: {
    "my-server": customServer  // ✓ Present
  }
}

// 3. Check tool name format
allowedTools: [
  "mcp__my-server__my-tool"  // Format: mcp__<server>__<tool>
]
```

**Quick Fix**:
```typescript
// TypeScript
async function* input() {
  yield { type: "user" as const, message: { role: "user" as const, content: "Use my tool" } };
}

for await (const msg of query({
  prompt: input(),  // ✓ Async generator
  options: {
    mcpServers: { "my-tools": myServer },
    allowedTools: ["mcp__my-tools__my-tool"]
  }
})) { /* ... */ }
```

**Related Sections**:
- Custom-Tools.md > Using Custom Tools
- MCP.md > Configuration
- Streaming-Input.md

---

#### MCP Server Connection Failure
**Symptom**: MCP server fails to connect, tools unavailable

**Primary Doc**: MCP.md → Error Handling

**Common Causes**:
1. Wrong command or args for stdio server
2. Network issues for HTTP/SSE server
3. Authentication failure
4. Environment variables not set

**Diagnostic Steps**:
```typescript
// Check init message for MCP server status
for await (const msg of query({ ... })) {
  if (msg.type === 'system' && msg.subtype === 'init') {
    console.log('MCP servers:', msg.mcp_servers);
    // Check status of each server
    msg.mcp_servers.forEach(s => {
      if (s.status !== 'connected') {
        console.error('Failed:', s.name, s.error);
      }
    });
  }
}
```

**Solutions**:
- **stdio**: Verify command exists and is executable
- **HTTP/SSE**: Check URL and network connectivity
- **Auth**: Verify environment variables are set
- **Headers**: Check authentication headers

**Related Sections**:
- MCP.md > Transport Types
- MCP.md > Authentication

---

### Permissions

#### Permission Denied for Tool
**Symptom**: Tool execution blocked, permission denied error

**Primary Doc**: Handling-Permissions.md

**Common Causes**:
1. Tool not in `allowedTools`
2. Blocked by permission rules (deny rule)
3. `canUseTool` callback denying
4. Hook returning 'deny'

**Diagnostic Flow**:
```
1. Check allowedTools
   ├─ Is tool in the array?
   ├─ Is tool name correct?
   └─ Check for typos

2. Check permission rules (settings.json)
   ├─ Any deny rules matching?
   └─ Permission mode set?

3. Check canUseTool callback
   └─ Is it returning 'deny'?

4. Check hooks
   └─ PreToolUse hook denying?
```

**Quick Fix**:
```typescript
// 1. Add tool to allowedTools
allowedTools: ['Read', 'Write', 'Bash', 'YourTool']

// 2. Check permission mode
permissionMode: 'default',  // Not 'plan' mode

// 3. Verify canUseTool allows it
canUseTool: async (toolName, input) => {
  console.log('Checking:', toolName);  // Debug
  return { behavior: 'allow' };
}
```

**Related Sections**:
- Handling-Permissions.md > Permission Flow Diagram
- Handling-Permissions.md > canUseTool
- Control-Execute-With-Hooks.md > PreToolUse

---

#### Permission Callback Not Called
**Symptom**: `canUseTool` callback never fires

**Primary Doc**: Handling-Permissions.md → Permission Flow Diagram

**Understanding**:
`canUseTool` is called as a **fallback** when:
- No hook allows/denies
- No permission rule matches
- Not in `bypassPermissions` mode

**It won't be called if**:
- Hook already allowed/denied the tool
- Permission rule already handled it
- In `bypassPermissions` mode

**Diagnostic**:
```typescript
canUseTool: async (toolName, input) => {
  console.log(`canUseTool called for: ${toolName}`);  // Add logging
  return { behavior: 'allow' };
}
```

If not logging, check:
1. Are hooks handling permissions?
2. Are permission rules matching?
3. Is permission mode set to `bypassPermissions`?

**Related Sections**:
- Handling-Permissions.md > Permission Flow Diagram
- Control-Execute-With-Hooks.md

---

### Subagents

#### Subagent Not Being Invoked
**Symptom**: Claude handles task directly instead of delegating to subagent

**Primary Doc**: Subagents.md → Troubleshooting > Claude not delegating

**Common Causes**:
1. `Task` tool not in `allowedTools`
2. Subagent description doesn't match task
3. User didn't explicitly request subagent

**Solutions**:

**1. Ensure Task tool is enabled:**
```typescript
allowedTools: ['Read', 'Write', 'Task']  // Task required for subagents
```

**2. Improve subagent description:**
```typescript
agents: {
  'code-reviewer': {
    description: 'Expert code reviewer. Use for security audits, style checks, and best practices review.',  // ✓ Specific
    // NOT: 'Helps with code'  // ❌ Too vague
  }
}
```

**3. Explicitly request subagent:**
```typescript
prompt: "Use the code-reviewer agent to analyze this code"
```

**Related Sections**:
- Subagents.md > Creating subagents
- Subagents.md > Invoking subagents

---

#### Subagent Can't Use Tools
**Symptom**: Subagent reports it can't use certain tools

**Common Cause**: Tools not in subagent's `tools` array

**Solution**:
```typescript
agents: {
  'my-agent': {
    description: '...',
    prompt: '...',
    tools: ['Read', 'Grep', 'Bash'],  // ✓ Explicitly list tools
    // If omitted, inherits all tools from parent
  }
}
```

**Note**: Subagents cannot spawn other subagents. Don't include `'Task'` in subagent tools.

**Related Sections**:
- Subagents.md > Tool restrictions

---

### Structured Outputs

#### Structured Output Validation Failed
**Symptom**: Error `error_max_structured_output_retries` or invalid JSON

**Primary Doc**: Structured-outputs.md → Error handling

**Common Causes**:
1. Schema too complex
2. `additionalProperties` not set to `false`
3. Agent can't produce required format from available data

**Solutions**:

**1. Simplify schema:**
```typescript
// ❌ Too complex
{ type: 'object', properties: { /* 20+ nested fields */ } }

// ✓ Start simple
{ type: 'object', properties: { summary: { type: 'string' } } }
```

**2. Set additionalProperties:**
```typescript
{
  type: 'object',
  properties: { /* ... */ },
  additionalProperties: false  // ✓ Required
}
```

**3. Check data availability:**
Ensure agent has tools to gather required data.

**Related Sections**:
- Structured-outputs.md > Supported JSON Schema features
- Structured-outputs.md > Error handling

---

### Session Management

#### Session Resume Fails
**Symptom**: Cannot resume previous conversation, session not found

**Primary Doc**: Session-Management.md → Resuming Sessions

**Common Causes**:
1. Session ID not captured
2. Session expired
3. Wrong session ID

**Solution**:
```typescript
// Capture session ID from init message
let sessionId: string;

for await (const msg of query({ prompt: "..." })) {
  if (msg.type === 'system' && msg.subtype === 'init') {
    sessionId = msg.session_id;  // ✓ Save this
    console.log('Session:', sessionId);
  }
}

// Later, resume with correct ID
for await (const msg of query({
  prompt: "Continue",
  options: { resume: sessionId }  // ✓ Use saved ID
})) { /* ... */ }
```

**Related Sections**:
- Session-Management.md > Getting the Session ID
- Session-Management.md > Resuming Sessions

---

## By Error Message

### "Skills not found"
→ See [Skills Not Found](#skills-not-found--not-loading)

### "Tool not allowed"
→ See [Permission Denied for Tool](#permission-denied-for-tool)

### "MCP server connection failed"
→ See [MCP Server Connection Failure](#mcp-server-connection-failure)

### "error_max_structured_output_retries"
→ See [Structured Output Validation Failed](#structured-output-validation-failed)

### "Session not found"
→ See [Session Resume Fails](#session-resume-fails)

---

## General Debugging Checklist

When something isn't working:

### 1. Check Configuration
- [ ] Is the feature's tool in `allowedTools`?
- [ ] Are required options set (e.g., `settingSources` for skills)?
- [ ] Is `cwd` pointing to the right directory?
- [ ] Are environment variables set?

### 2. Check Console Output
- [ ] Look at system messages (type === 'system')
- [ ] Check init message for server status
- [ ] Look for error messages in tool results

### 3. Enable Logging
```typescript
for await (const msg of query({ ... })) {
  console.log('Message type:', msg.type, msg.subtype);
  if (msg.type === 'system') {
    console.log('System message:', JSON.stringify(msg, null, 2));
  }
}
```

### 4. Simplify
- [ ] Remove hooks and permissions temporarily
- [ ] Test with minimal configuration
- [ ] Isolate the feature you're testing

### 5. Consult Documentation
- [ ] Read the relevant doc section fully
- [ ] Check code examples in docs
- [ ] Look for notes and warnings

---

## Quick Reference: Where to Look

| Problem Area | Primary Docs | Keywords to Search |
|:-------------|:-------------|:-------------------|
| Skills | Agent-Skills.md | settingSources, SKILL.md, description |
| Custom Tools | Custom-Tools.md, MCP.md | createSdkMcpServer, tool, streaming |
| Permissions | Handling-Permissions.md | allowedTools, canUseTool, permissionMode |
| Hooks | Control-Execute-With-Hooks.md | PreToolUse, PostToolUse, matcher |
| Subagents | Subagents.md | agents, Task, description |
| Outputs | Structured-outputs.md | outputFormat, json_schema, validation |
| Sessions | Session-Management.md | resume, session_id |
| Streaming | Streaming-Input.md | async generator, AsyncIterable |
| Costs | Tracking-Costs.md | onUsage, tokens |
| Deployment | Securely-deploying-AI-agents.md | security, production |

---

*For detailed solutions, always consult the full documentation*
