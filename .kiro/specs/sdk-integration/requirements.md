# Requirements Document

## Introduction

本文档定义了将 Claude Replica 项目中的模拟响应实现替换为真实 Claude Agent SDK 调用的需求。当前 `executeQuery` 方法返回模拟响应，需要集成 `@anthropic-ai/claude-agent-sdk` 包来实现真实的 AI 交互功能。

## Glossary

- **SDK**: Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)，用于与 Claude AI 进行交互的官方 TypeScript SDK
- **Query**: SDK 提供的主要函数，用于向 Claude 发送查询并获取流式响应
- **Session**: 会话对象，包含对话历史、配置和上下文信息
- **StreamingMessageProcessor**: 流式消息处理器，用于处理 SDK 返回的异步消息流
- **SDKMessage**: SDK 返回的消息类型联合，包括 assistant、user、result、system 等类型
- **QueryOptions**: SDK query() 函数的配置选项对象
- **AbortController**: 用于取消正在进行的 SDK 查询的控制器

## Requirements

### Requirement 1: SDK Query 函数集成

**User Story:** As a developer, I want to call the real Claude Agent SDK query() function, so that I can get actual AI responses instead of mock data.

#### Acceptance Criteria

1. WHEN the executeQuery method is called with a prompt, THE Application SHALL invoke the SDK query() function with the constructed options
2. WHEN the SDK query() function is invoked, THE Application SHALL pass the prompt, model, systemPrompt, allowedTools, cwd, and permissionMode options
3. WHEN the SDK returns an async generator, THE Application SHALL iterate through all SDKMessage objects
4. IF the SDK query() throws an error, THEN THE Application SHALL catch the error and log it appropriately

### Requirement 2: 流式消息处理

**User Story:** As a user, I want to see AI responses as they stream in, so that I can get faster feedback during long responses.

#### Acceptance Criteria

1. WHEN the SDK yields an SDKAssistantMessage, THE StreamingMessageProcessor SHALL extract and accumulate the text content
2. WHEN the SDK yields an SDKResultMessage with subtype 'success', THE Application SHALL return the accumulated response
3. WHEN the SDK yields an SDKResultMessage with error subtype, THE Application SHALL throw an appropriate error with the error details
4. WHEN processing streaming messages in interactive mode, THE Application SHALL update the UI progressively

### Requirement 3: 会话消息同步

**User Story:** As a user, I want my conversation history to be maintained correctly, so that the AI has proper context for follow-up questions.

#### Acceptance Criteria

1. WHEN a query completes successfully, THE SessionManager SHALL store both the user message and assistant response
2. WHEN resuming a session, THE Application SHALL provide the conversation history to the SDK
3. WHEN the SDK returns usage statistics, THE Application SHALL log the token usage and cost information

### Requirement 4: 中断处理

**User Story:** As a user, I want to be able to cancel a running query, so that I can stop long-running operations.

#### Acceptance Criteria

1. WHEN the user triggers an interrupt (Ctrl+C), THE Application SHALL call the AbortController.abort() method
2. WHEN the AbortController is aborted, THE SDK query SHALL stop processing and return early
3. WHEN a query is interrupted, THE Application SHALL display a warning message to the user

### Requirement 5: 错误处理与重试

**User Story:** As a user, I want the application to handle API errors gracefully, so that temporary failures don't crash the application.

#### Acceptance Criteria

1. IF the SDK throws a network error, THEN THE Application SHALL log the error and inform the user
2. IF the SDK throws an authentication error, THEN THE Application SHALL display a message about checking the API key
3. IF the SDK throws a rate limit error, THEN THE Application SHALL inform the user about the rate limit

### Requirement 6: 配置选项传递

**User Story:** As a developer, I want all CLI options to be properly passed to the SDK, so that users can customize the AI behavior.

#### Acceptance Criteria

1. WHEN maxTurns is specified, THE Application SHALL pass it to the SDK options
2. WHEN maxBudgetUsd is specified, THE Application SHALL pass it to the SDK options
3. WHEN maxThinkingTokens is specified, THE Application SHALL pass it to the SDK options
4. WHEN sandbox mode is enabled, THE Application SHALL pass the sandbox configuration to the SDK
5. WHEN MCP servers are configured, THE Application SHALL pass the mcpServers configuration to the SDK
