# Changelog

This document records all important changes to the Claude Replica project.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
project versions follow [Semantic Versioning](https://semver.org/) specification.

## [Unreleased]

### Breaking Changes
- **Removed CLI arguments for session management**: The following CLI arguments have been removed in favor of interactive mode commands:
  - `-c, --continue`: Continue most recent session
  - `--resume <id>`: Resume specific session
  - `--fork`: Fork current session

### Added
- **Interactive Session Management Commands**:
  - `/resume`: Interactive session browser with statistics, timestamps, and parent-child session tracking
  - `/fork`: Create session branches with parent-child relationship tracking
- **Session Statistics**: Automatic calculation and display of:
  - Token usage (input/output)
  - Cost calculation in USD
  - Message count
  - Last message preview
- **Session Forking**: Full session branching support with:
  - Visual indicator (🔀) for forked sessions
  - Parent session tracking
  - Independent session lifecycles
- **Automatic Session Cleanup**:
  - Configurable retention via `SESSION_KEEP_COUNT` environment variable (default: 10)
  - Cleans old sessions on application startup
  - Preserves active sessions
- **Enhanced Session Metadata**: Extended session metadata with:
  - `parentSessionId`: Tracks parent-child relationships
  - `stats`: Session statistics (tokens, cost, messages, preview)
- **UI Enhancements**:
  - Relative and absolute time formatting for sessions
  - Session statistics summary display
  - Improved session listing with comprehensive information

### Changed
- **Session Persistence Behavior**:
  - Interactive mode: Sessions persist and can be resumed
  - Non-interactive mode: Uses temporary sessions (not saved to disk)
- **Session Architecture**: Refactored to focus on interaction patterns rather than CLI argument parsing

### Migration Guide

**Old Usage (Deprecated):**
```bash
# These commands no longer work
claude-replica -c
claude-replica --resume <session-id>
claude-replica --fork
```

**New Usage:**
```bash
# Start interactive mode
claude-replica

# Inside interactive mode, use:
/resume  # Browse and resume sessions interactively
/fork    # Fork current session
```

**Benefits:**
- More intuitive session management
- Better visualization of session history and statistics
- Support for session branching and parent-child tracking
- Automatic cleanup to manage disk space
- Consistent interactive experience

## [v0.1.0] - 2026-01-02

### Added
- Overall project architecture design
- Claude Agent SDK integration
- Complete CLI command-line interface
- Session management system
- Tool permission management system
- Multi-level configuration management system
- Extension system (Skills, Commands, Agents, Hooks)
- MCP (Model Context Protocol) integration
- Terminal interaction testing framework
- Property testing (fast-check)

### Documentation
- Added project documentation standards
- Added file header documentation standards
- Complete README documentation
- API reference documentation

---

## Latest Commit Details

### c593ad1 - 2026-01-02 - Add file header documentation standards for all source code files

This change involved **64 files**, adding unified file header comment standards to improve code readability and maintainability.

#### Change Types
- **Documentation (docs)**: Added standardized documentation headers for all TypeScript source files

#### Change Scope
Added file header documentation for all files in the following modules:

1. **Core entry files**
   - `src/main.ts` - Main program entry
   - `src/cli.ts` - CLI entry point
   - `src/index.ts` - Project main entry file

2. **SDK integration layer**
   - `src/sdk/SDKQueryExecutor.ts` - SDK query executor
   - `src/core/MessageRouter.ts` - Message router
   - `src/core/SessionManager.ts` - Session manager
   - `src/core/StreamingMessageProcessor.ts` - Streaming message processor

3. **Configuration management system**
   - `src/config/ConfigManager.ts` - Configuration manager
   - `src/config/SDKConfigLoader.ts` - SDK configuration loader
   - `src/config/EnvConfig.ts` - Environment configuration

4. **Permission management**
   - `src/permissions/PermissionManager.ts` - Permission manager

5. **Tool system**
   - `src/tools/ToolRegistry.ts` - Tool registry
   - `src/tools/*` - Various tool handlers

6. **Extension system**
   - `src/skills/SkillManager.ts` - Skill manager
   - `src/commands/CommandManager.ts` - Command manager
   - `src/agents/AgentRegistry.ts` - Agent registry
   - `src/hooks/HookManager.ts` - Hook manager
   - `src/mcp/MCPManager.ts` - MCP manager
   - `src/extensibility/ExtensibilityManager.ts` - Extensibility manager

7. **Other core modules**
   - `src/context/ContextManager.ts` - Context manager
   - `src/security/SecurityManager.ts` - Security manager
   - `src/output/OutputFormatter.ts` - Output formatter
   - `src/testing/*` - Testing-related modules
   - `src/ui/InteractiveUI.ts` - Interactive UI
   - `src/sandbox/SandboxManager.ts` - Sandbox manager
   - `src/rewind/RewindManager.ts` - Rollback manager
   - `src/plugins/PluginManager.ts` - Plugin manager
   - `src/performance/PerformanceManager.ts` - Performance manager
   - `src/ci/CISupport.ts` - CI support
   - `src/collaboration/CollaborationManager.ts` - Collaboration manager
   - `src/docs/DocumentGenerator.ts` - Document generator
   - `src/image/ImageHandler.ts` - Image handler
   - `src/language/LanguageSupport.ts` - Language support

#### Documentation Standards
Each file header includes:
- **File functionality description**: Concise description of the file's main responsibilities and functions
- **Core export list**: List of core classes, methods, constants, etc. in the file
- **Purpose explanation**: Brief purpose explanation for each core export

#### Example Format
```typescript
/**
 * File functionality: Session management module, responsible for creating, saving, loading and cleaning user sessions
 *
 * Core classes:
 * - SessionManager: Session lifecycle manager
 *
 * Core methods:
 * - createSession(): Create new session instance
 * - loadSession(): Load specified session data from disk
 * - saveSession(): Persist session to local storage
 * - cleanExpiredSessions(): Clean expired sessions
 * - resumeSession(): Resume existing session and support SDK session continuation
 */
```

#### Statistics
- **Total files**: 64
- **Lines added**: 401
- **Lines removed**: 340
- **Net growth**: 61 lines (primarily documentation content)

#### Impact Scope
- ✅ Improved code readability
- ✅ Conforms to project documentation standards (`.claude/rules/file-header-documentation.md`)
- ✅ Facilitates new developers understanding code structure
- ✅ Improved code maintainability
- ✅ No functional changes, documentation improvements only

---

## Early Commits

### 43d2a64 - 2026-01-02 - Add project documentation, code standards, and skills system
- Added project documentation and code standards
- Implemented skills system
- Updated test task completion status

### 8b76d95 - 2026-01-02 - Update terminal interaction test task completion status
- Terminal interaction test functionality

### a936273 - 2026-01-02 - Integrate Claude Agent SDK and add terminal interaction tests
- Claude Agent SDK integration
- Terminal interaction test framework

### 47ae444 - 2026-01-02 - Remove Claude Code copy's Agent SDK reference documentation
- Removed irrelevant reference documentation
