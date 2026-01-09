# Claude Replica Developer Guide

This guide is for developers who want to contribute code or extend Claude Replica's functionality.

## Table of Contents

- [Development Environment Setup](#development-environment-setup)
- [Project Architecture](#project-architecture)
- [Core Modules](#core-modules)
- [Extension Development](#extension-development)
- [Testing](#testing)
- [Code Standards](#code-standards)
- [Release Process](#release-process)
- [Contribution Guidelines](#contribution-guidelines)

## Development Environment Setup

### Environment Requirements

- Node.js >= 20.0.0
- npm >= 9.0.0
- Git

### Clone Repository

```bash
git clone https://github.com/your-username/claude-replica.git
cd claude-replica
```

### Install Dependencies

```bash
npm install
```

### Build Project

```bash
npm run build
```

### Local Link

```bash
npm link
```

Now you can use the `claude-replica` command in any directory.

### Development Mode

```bash
# Watch for file changes and auto-recompile
npm run dev
```

### Run Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Run specific test
npm test -- --testPathPattern="SessionManager"
```

### Code Checking

```bash
# Lint code
npm run lint

# Auto-fix
npm run lint:fix

# Format code
npm run format
```

## Project Architecture

### Directory Structure

```
claude-replica/
├── src/                    # Source code
│   ├── agents/            # Subagent registry
│   │   ├── AgentRegistry.ts
│   │   └── index.ts
│   ├── ci/                # CI/CD support
│   │   ├── CISupport.ts
│   │   └── index.ts
│   ├── cli/               # CLI parser
│   │   └── CLIParser.ts
│   ├── commands/          # Command manager
│   │   ├── CommandManager.ts
│   │   └── index.ts
│   ├── config/            # Configuration management
│   │   ├── ConfigManager.ts
│   │   ├── SDKConfigLoader.ts
│   │   └── index.ts
│   ├── context/           # Context management
│   │   ├── ContextManager.ts
│   │   └── index.ts
│   ├── core/              # Core engine
│   │   ├── MessageRouter.ts
│   │   ├── SessionManager.ts
│   │   └── StreamingMessageProcessor.ts
│   ├── hooks/             # Hook manager
│   │   ├── HookManager.ts
│   │   └── index.ts
│   ├── image/             # Image processing
│   │   ├── ImageHandler.ts
│   │   └── index.ts
│   ├── mcp/               # MCP integration
│   │   ├── MCPManager.ts
│   │   └── index.ts
│   ├── output/            # Output formatting
│   │   ├── OutputFormatter.ts
│   │   └── index.ts
│   ├── permissions/       # Permission management
│   │   ├── PermissionManager.ts
│   │   └── index.ts
│   ├── plugins/           # Plugin system
│   │   ├── PluginManager.ts
│   │   └── index.ts
│   ├── rewind/            # Rewind system
│   │   ├── RewindManager.ts
│   │   └── index.ts
│   ├── sandbox/           # Sandbox management
│   │   ├── SandboxManager.ts
│   │   └── index.ts
│   ├── tools/             # Tool registry
│   │   ├── ToolRegistry.ts
│   │   └── index.ts
│   ├── ui/                # Interactive UI
│   │   ├── InteractiveUI.ts
│   │   └── index.ts
│   ├── cli.ts             # CLI entry
│   ├── index.ts           # Main export
│   └── main.ts            # Main program
├── tests/                 # Test files
│   ├── agents/
│   ├── ci/
│   ├── cli/
│   ├── commands/
│   ├── config/
│   ├── context/
│   ├── core/
│   ├── hooks/
│   ├── image/
│   ├── mcp/
│   ├── output/
│   ├── permissions/
│   ├── plugins/
│   ├── rewind/
│   ├── sandbox/
│   ├── tools/
│   ├── ui/
│   └── utils/
├── docs/                  # Documentation
├── examples/              # Example projects
└── dist/                  # Build output
```

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Layer                                │
│  CLIParser → InteractiveUI / OutputFormatter                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      Core Engine Layer                               │
│  SessionManager → MessageRouter → StreamingMessageProcessor │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   Claude Agent SDK                           │
│  query() function → Streaming message processing → Tool calls │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────┬──────────────┬──────────────┬────────────────┐
│  Tool System  │ Extension System │ MCP Integration │ Configuration │
│ ToolRegistry  │ SDK Skills     │ MCPManager    │ ConfigManager  │
│ Permission   │ CommandMgr     │              │ SDKConfigLoader│
│ Manager      │ AgentRegistry  │              │                │
│              │ HookManager    │              │                │
│              │ PluginManager  │              │                │
└──────────────┴──────────────┴──────────────┴────────────────┘
```

### Data Flow

1. **User Input** → CLIParser parses command-line arguments
2. **Initialization** → Application initializes all managers
3. **Session Management** → SessionManager creates/restores sessions
4. **Message Routing** → MessageRouter builds query options
5. **SDK Call** → Calls Claude Agent SDK's query() function
6. **Streaming Processing** → StreamingMessageProcessor handles responses
7. **Output** → InteractiveUI or OutputFormatter displays results

## Core Modules

### SessionManager

Session manager is responsible for session lifecycle management.

```typescript
// src/core/SessionManager.ts

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private sessionsDir: string;

  constructor(options?: SessionManagerOptions) {
    this.sessionsDir = options?.sessionsDir ||
      path.join(os.homedir(), '.claude-replica', 'sessions');
  }

  async createSession(
    workingDir: string,
    projectConfig?: ProjectConfig,
    userConfig?: UserConfig
  ): Promise<Session> {
    const session: Session = {
      id: this.generateSessionId(),
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      messages: [],
      context: {
        workingDirectory: workingDir,
        projectConfig: projectConfig || {},
        userConfig: userConfig || {},
        loadedSkills: [],
        activeAgents: [],
      },
      expired: false,
      workingDirectory: workingDir,
    };

    await this.saveSession(session);
    return session;
  }

  // ... other methods
}
```

### MessageRouter

Message router is responsible for building SDK query options.

```typescript
// src/core/MessageRouter.ts

export class MessageRouter {
  constructor(private options: MessageRouterOptions) {}

  async routeMessage(
    message: Message,
    session: Session
  ): Promise<QueryResult> {
    // Build system prompt
    const systemPrompt = await this.buildSystemPrompt(session);

    // Get enabled tools
    const allowedTools = this.getEnabledToolNames(session);

    // Create permission handler
    const canUseTool = this.createPermissionHandler(session);

    // Get agent definitions
    const agents = this.getAgentDefinitions(session);

    return {
      prompt: message.content as string,
      options: {
        model: session.context.projectConfig.model,
        systemPrompt,
        allowedTools,
        canUseTool,
        agents,
        // ... other options
      },
    };
  }

  // ... other methods
}
```

### PermissionManager

Permission manager controls tool usage permissions.

```typescript
// src/permissions/PermissionManager.ts

export class PermissionManager {
  constructor(
    private config: PermissionConfig,
    private toolRegistry: ToolRegistry
  ) {}

  createCanUseToolHandler(): CanUseTool {
    return async ({ tool, args, context }) => {
      // Check blacklist
      if (this.config.disallowedTools?.includes(tool)) {
        return false;
      }

      // Check whitelist
      if (this.config.allowedTools &&
          !this.config.allowedTools.includes(tool)) {
        return false;
      }

      // Handle based on permission mode
      switch (this.config.mode) {
        case 'bypassPermissions':
          return true;
        case 'plan':
          return false;
        case 'acceptEdits':
          return !this.isDangerousTool(tool);
        default:
          return this.shouldPromptForTool(tool, args)
            ? await this.promptUser(tool, args)
            : true;
      }
    };
  }

  // ... other methods
}
```

## Extension Development

### Create New Manager

1. Create directory under `src/`
2. Create main class file
3. Create `index.ts` export
4. Add export to `src/index.ts`
5. Write tests

Example:

```typescript
// src/myfeature/MyFeatureManager.ts

export interface MyFeatureConfig {
  enabled: boolean;
  options: Record<string, unknown>;
}

export class MyFeatureManager {
  private config: MyFeatureConfig;

  constructor(config?: Partial<MyFeatureConfig>) {
    this.config = {
      enabled: true,
      options: {},
      ...config,
    };
  }

  async initialize(): Promise<void> {
    // Initialization logic
  }

  async process(input: string): Promise<string> {
    // Processing logic
    return input;
  }
}
```

```typescript
// src/myfeature/index.ts

export { MyFeatureManager, MyFeatureConfig } from './MyFeatureManager';
```

```typescript
// src/index.ts

export { MyFeatureManager, MyFeatureConfig } from './myfeature';
```

### Add New Tool

Tools are built-in supported by SDK, but custom tools can be added via MCP.

1. Create MCP server
2. Configure in `.mcp.json`
3. Tools automatically register

### SDK Skills

Skills are auto-discovered by the Claude Agent SDK; no custom SkillManager is needed.

- Project-level auto-discovery only
- Location: `.claude/skills/<skill-name>/SKILL.md`
- frontmatter must include `description`

Example:

```markdown
---
name: agent-sdk-dev
description: SDK development guide
---

Skill content...
```

### Create Plugin

Plugins are packaged extension collections.

```
my-plugin/
├── plugin.json          # Plugin metadata
├── commands/            # Command files
├── skills/              # Skill files
├── agents/              # Agent files
├── hooks.json           # Hook configuration
└── .mcp.json           # MCP server configuration
```

```json
// plugin.json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "My plugin",
  "author": "Your Name",
  "repository": "https://github.com/your-username/my-plugin"
}
```

## Testing

### Test Structure

```
tests/
├── agents/
│   └── AgentRegistry.test.ts
├── core/
│   ├── SessionManager.test.ts
│   └── MessageRouter.test.ts
├── utils/
│   ├── index.ts
│   └── testHelpers.ts
└── main.test.ts
```

### Write Tests

```typescript
// tests/core/SessionManager.test.ts

import { SessionManager } from '../../src/core/SessionManager';

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager({
      sessionsDir: '/tmp/test-sessions',
    });
  });

  afterEach(async () => {
    // Clean up test data
  });

  describe('createSession', () => {
    it('should create a new session with unique ID', async () => {
      const session = await sessionManager.createSession('/test/dir');

      expect(session.id).toBeDefined();
      expect(session.workingDirectory).toBe('/test/dir');
      expect(session.messages).toHaveLength(0);
    });

    it('should set correct timestamps', async () => {
      const before = new Date();
      const session = await sessionManager.createSession('/test/dir');
      const after = new Date();

      expect(session.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // ... more tests
});
```

### Property Testing

Use fast-check for property testing:

```typescript
import * as fc from 'fast-check';

describe('ConfigManager', () => {
  describe('mergeConfigs', () => {
    it('should preserve project config priority', () => {
      fc.assert(
        fc.property(
          fc.record({
            model: fc.option(fc.string()),
            maxTurns: fc.option(fc.integer()),
          }),
          fc.record({
            model: fc.option(fc.string()),
            maxTurns: fc.option(fc.integer()),
          }),
          (userConfig, projectConfig) => {
            const merged = configManager.mergeConfigs(userConfig, projectConfig);

            // Project config has priority
            if (projectConfig.model !== undefined) {
              expect(merged.model).toBe(projectConfig.model);
            }
          }
        )
      );
    });
  });
});
```

### Test Coverage

```bash
npm test -- --coverage
```

## Code Standards

### TypeScript Standards

- Use strict mode
- Explicit type annotations
- Avoid `any` type
- Use interfaces to define data structures

```typescript
// Good practice
interface UserConfig {
  model?: string;
  maxTurns?: number;
}

function processConfig(config: UserConfig): void {
  // ...
}

// Avoid
function processConfig(config: any): void {
  // ...
}
```

### Naming Conventions

- Class names: PascalCase
- Functions/methods: camelCase
- Constants: UPPER_SNAKE_CASE
- File names: PascalCase (classes) or camelCase (utilities)

### Comment Standards

Use JSDoc-style comments:

```typescript
/**
 * Session manager
 *
 * Responsible for creating, saving, and restoring sessions
 *
 * @example
 * ```typescript
 * const manager = new SessionManager();
 * const session = await manager.createSession('/path/to/project');
 * ```
 */
export class SessionManager {
  /**
   * Create new session
   *
   * @param workingDir - Working directory path
   * @param projectConfig - Project configuration (optional)
   * @param userConfig - User configuration (optional)
   * @returns Newly created session
   * @throws If unable to create session directory
   */
  async createSession(
    workingDir: string,
    projectConfig?: ProjectConfig,
    userConfig?: UserConfig
  ): Promise<Session> {
    // ...
  }
}
```

### ESLint Configuration

Project uses ESLint for code checking, configured in `.eslintrc.json`.

### Prettier Configuration

Project uses Prettier for code formatting, configured in `.prettierrc.json`.

## Release Process

### Version Number Standards

Follow Semantic Versioning (SemVer):

- **Major version**: Incompatible API changes
- **Minor version**: Backward-compatible feature additions
- **Patch version**: Backward-compatible bug fixes

### Release Steps

1. Update version number

```bash
npm version patch  # Patch version
npm version minor  # Minor version
npm version major  # Major version
```

2. Update CHANGELOG

3. Build project

```bash
npm run build
```

4. Run tests

```bash
npm test
```

5. Publish to npm

```bash
npm publish
```

### Pre-release Versions

```bash
npm version prerelease --preid=beta
npm publish --tag beta
```

## Contribution Guidelines

### Submit Issue

- Use Issue template
- Provide detailed reproduction steps
- Include environment information

### Submit PR

1. Fork repository
2. Create feature branch

```bash
git checkout -b feature/my-feature
```

3. Write code and tests
4. Ensure tests pass

```bash
npm test
npm run lint
```

5. Commit code

```bash
git commit -m "feat: add my feature"
```

6. Push and create PR

### Commit Standards

Use Conventional Commits:

- `feat:` New feature
- `fix:` Fix bug
- `docs:` Documentation update
- `style:` Code formatting
- `refactor:` Refactor
- `test:` Test
- `chore:` Build/tool

Example:

```
feat: add session expiration check
fix: resolve config merge priority issue
docs: update API documentation
```

### Code Review

- All PRs require at least one reviewer approval
- Ensure CI checks pass
- Resolve all review comments

## More Resources

- [API Documentation](API_EN.md)
- [User Guide](USER_GUIDE_EN.md)
- [Claude Agent SDK Documentation](https://docs.claude.com/en/api/agent-sdk/overview)
