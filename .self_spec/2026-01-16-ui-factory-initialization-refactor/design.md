# UI Factory Initialization Refactor Design

## 1. Overview

### 1.1 Project Context
Claude Replica is a CLI tool that replicates Claude Code functionality using the Claude Agent SDK. The application uses a UI factory pattern to support multiple UI types (currently `terminal`, with potential future support for `web`, `json`, etc.).

### 1.2 Problem Statement
Current UI factory initialization has the following redundancies:

1. **Duplicate UIConfig Interface**: Defined in 3 files
   - `src/ui/factories/UIFactoryRegistry.ts:28-33`
   - `src/permissions/PermissionManager.ts:58-63`
   - `src/config/SDKConfigLoader.ts:177-182`

2. **Invalid permissionConfig.ui Field**:
   - `PermissionConfig` interface includes `ui?: UIConfig` field (`PermissionManager.ts:82`)
   - `buildPermissionConfigOnly()` doesn't return this field (`ConfigManager.ts:153-166`)
   - Leads to `UIFactoryRegistry.create(permissionConfig.ui)` always receiving `undefined` (`main.ts:153`)

3. **Dual UIFactory Creation**:
   - `cli.ts:16` creates UIFactory and passes to Application constructor
   - `main.ts:153` recreates UIFactory (with invalid config)
   - Wastes resources, confuses initialization flow

4. **Unused ProjectConfig.ui Field**:
   - `ProjectConfig.ui` field defined (`SDKConfigLoader.ts:203`) but never used
   - CLI only configures UI type via `CLAUDE_UI_TYPE` environment variable
   - Keeping this field causes confusion

### 1.3 Design Goals
1. **Single Creation Point**: UIFactory created once at CLI entry, reused throughout application lifecycle
2. **Unified Interface**: Merge duplicate `UIConfig` definitions to single location
3. **Consistent Configuration**: Remove unused `ui` fields from PermissionConfig and ProjectConfig
4. **Environment Variable Only**: Support UI type configuration only via `CLAUDE_UI_TYPE`
5. **Minimal Changes**: Maintain existing architecture, only remove redundancies

---

## 2. User Requirements & Decisions

Based on stakeholder interviews, the following decisions were made:

### 2.1 Configuration Approach
- **UI Configuration Method**: Environment variable only (not config files)
- **Backward Compatibility**: Silently ignore `ui` field in old config files
- **Invalid UI Type Handling**: Throw error and terminate when `CLAUDE_UI_TYPE` has invalid value

### 2.2 Architecture Decisions
- **Singleton Pattern**: Global single UIFactory instance (not per-type singleton)
- **Factory Access Method**: Use `this.uiFactory` directly instead of `UIFactoryRegistry.get()`
- **PermissionManager Parameter**: Pass `UIFactory` instance directly (let PermissionManager extract PermissionUI internally)
- **Extensibility**: Reserve extension interface for future multi-UI-type support

### 2.3 Code Quality Standards
- **Testing Strategy**:
  - Update existing unit tests
  - Add new integration tests
  - Manual regression testing
- **Quality Gates**:
  - All tests pass (`npm test`)
  - Lint checks pass (`npm run lint`)
  - Type checks pass (`tsc --noEmit`)
  - Manual scenario validation

### 2.4 Documentation & Migration
- **File Header Comments**: Synchronize updates with code changes
- **Project Documentation**: No updates needed (internal refactor, transparent to users)
- **Migration Guide**: Not needed (backward compatible, old config fields silently ignored)

### 2.5 Implementation Management
- **Version Control**: Single atomic commit for all steps
- **UIConfig Scope**: Used only within `UIFactoryRegistry`, not a global shared type
- **ConfigManager Method**: Only add comments, no method renaming

### 2.6 Testing Infrastructure
- **TestUIFactory Design**:
  - Implement minimal UIFactory interface
  - Support mock behavior for test assertions
  - Created in `tests/` directory for test use only

---

## 3. Technical Design

### 3.1 Architecture Overview

#### Before Refactor
```
┌─────────────────────────────────────────────────────────────┐
│                      cli.ts                                  │
│  1. Create UIFactory (via UIFactoryRegistry)                │
│  2. new Application(uiFactory)                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Application Constructor                     │
│  - Has default parameter: uiFactory = createUIFactory()     │
│  - Creates parser and output                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Application.initialize()                        │
│  1. Load PermissionConfig (with invalid ui field)           │
│  2. UIFactoryRegistry.create(permissionConfig.ui)  ❌       │
│     → Always undefined, creates redundant factory           │
│  3. new PermissionManager(config, uiFactory)                │
└─────────────────────────────────────────────────────────────┘
```

#### After Refactor
```
┌─────────────────────────────────────────────────────────────┐
│                      cli.ts                                  │
│  1. uiType = env.CLAUDE_UI_TYPE || 'terminal'               │
│  2. UIFactoryRegistry.createUIFactory()                     │
│     → Single global UIFactory instance                      │
│  3. new Application(uiFactory) (required parameter)         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Application Constructor                     │
│  - Store this.uiFactory (no default parameter)              │
│  - Create parser = uiFactory.createParser()                 │
│  - Create output = uiFactory.createOutput()                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Application.initialize()                        │
│  1. Load PermissionConfig (without ui field)                │
│  2. Use this.uiFactory directly ✅                          │
│  3. new PermissionManager(config, this.uiFactory)           │
│     → PermissionManager internally extracts PermissionUI    │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Singleton Implementation

**UIFactoryRegistry Singleton Strategy**:
- **Scope**: Global single instance (one UIFactory for entire application)
- **Thread Safety**: Not needed (Node.js single-threaded model)
- **Implementation**:

```typescript
// src/ui/factories/UIFactoryRegistry.ts
class UIFactoryRegistry {
  private static instance: UIFactory | null = null;

  static createUIFactory(): UIFactory {
    if (!UIFactoryRegistry.instance) {
      const uiType = process.env.CLAUDE_UI_TYPE || 'terminal';

      // Validate UI type
      const validTypes = ['terminal']; // Future: ['terminal', 'web', 'json']
      if (!validTypes.includes(uiType)) {
        throw new Error(
          `Invalid CLAUDE_UI_TYPE: "${uiType}". ` +
          `Supported types: ${validTypes.join(', ')}`
        );
      }

      UIFactoryRegistry.instance = UIFactoryRegistry.createInstance(uiType);
    }
    return UIFactoryRegistry.instance;
  }

  private static createInstance(type: string): UIFactory {
    switch (type) {
      case 'terminal':
        return new TerminalUIFactory();
      default:
        throw new Error(`Unsupported UI type: ${type}`);
    }
  }

  // For testing: Reset singleton instance
  static resetForTesting(): void {
    UIFactoryRegistry.instance = null;
  }
}
```

### 3.3 Error Handling

**Invalid UI Type Handling**:
```typescript
// When CLAUDE_UI_TYPE has invalid value
// Example: CLAUDE_UI_TYPE=invalid npm start

// Expected behavior:
// 1. Throw error immediately at CLI entry
// 2. Display clear error message
// 3. Terminate process with exit code 1

Error: Invalid CLAUDE_UI_TYPE: "invalid". Supported types: terminal
    at UIFactoryRegistry.createUIFactory (UIFactoryRegistry.ts:25)
    at cli.ts:16
Process exited with code 1
```

### 3.4 Future Extensibility

**Reserved Extension Interface**:
```typescript
// src/permissions/PermissionManager.ts

export class PermissionManager {
  private readonly permissionUI: PermissionUIFactory;

  constructor(
    config: PermissionConfig,
    uiFactory: UIFactory,  // Accept full UIFactory
    toolRegistry: ToolRegistry
  ) {
    // Extract PermissionUIFactory internally
    // This design allows future flexibility:
    // - Option 1: Extract from uiFactory
    // - Option 2: Accept separate PermissionUIFactory parameter
    this.permissionUI = uiFactory.createPermissionUI();
    // ... rest of constructor
  }
}
```

**Future Multi-UI Support** (out of scope for this refactor):
```typescript
// Potential future enhancement (NOT implemented in this refactor)
// Allow different UI types for different subsystems

interface ApplicationOptions {
  mainUI?: UIFactory;           // For main CLI interaction
  permissionUI?: UIFactory;     // For permission prompts
  outputUI?: UIFactory;         // For output formatting
}
```

---

## 4. Implementation Plan

### 4.1 Refactor Steps

#### Step 1: Unify UIConfig Interface Definition

**Files to Modify**:
- `src/permissions/PermissionManager.ts`
- `src/config/SDKConfigLoader.ts`

**Changes**:
1. Delete `UIConfig` interface from `PermissionManager.ts` (Line 58-63)
2. Add import: `import type { UIConfig } from '../ui/factories/UIFactoryRegistry';`
3. Delete `UIConfig` interface from `SDKConfigLoader.ts` (Line 177-182)
4. Add import: `import type { UIConfig } from '../ui/factories/UIFactoryRegistry';`

**Rationale**: `UIFactoryRegistry.ts` is the core UI factory module and should be the single source of truth for `UIConfig`.

---

#### Step 2: Remove ui Field from PermissionConfig and ProjectConfig

**Files to Modify**:
- `src/permissions/PermissionManager.ts`
- `src/config/SDKConfigLoader.ts`
- `src/config/ConfigManager.ts`

**Changes**:
1. Delete `ui?: UIConfig` field from `PermissionConfig` interface (`PermissionManager.ts:82`)
2. Delete `ui?: UIConfig` field from `ProjectConfig` interface (`SDKConfigLoader.ts:203`)
3. Delete related comment (`SDKConfigLoader.ts:202`)
4. Remove `UIConfig` export from `ConfigManager.ts` (Line 45)

**Rationale**:
- UI type only configured via `CLAUDE_UI_TYPE` environment variable
- PermissionManager only needs the created PermissionUIFactory, not UI config
- Remove unused fields to avoid confusion
- `buildPermissionConfigOnly()` already doesn't return this field

---

#### Step 3: Simplify CLI Entry Logic

**Files to Modify**:
- `src/cli.ts`

**Changes**: No changes needed (already implemented correctly)

**Current Implementation**:
```typescript
const uiFactory = UIFactoryRegistry.createUIFactory();
const app = new Application(uiFactory);
```

**Rationale**:
- User chose "environment variable only" configuration
- Current implementation already follows this approach
- `createUIFactory()` with no arguments uses `process.env.CLAUDE_UI_TYPE || 'terminal'`

---

#### Step 4: Remove Application Constructor Default Parameter

**Files to Modify**:
- `src/main.ts`

**Changes**:
1. Remove default value from `uiFactory` parameter (Line 75)
2. Store `uiFactory` as instance variable

**Before**:
```typescript
constructor(uiFactory: UIFactory = UIFactoryRegistry.createUIFactory()) {
  this.parser = uiFactory.createParser();
  this.output = uiFactory.createOutput();
  // ...
}
```

**After**:
```typescript
private readonly uiFactory: UIFactory;

constructor(uiFactory: UIFactory) {
  this.uiFactory = uiFactory;
  this.parser = uiFactory.createParser();
  this.output = uiFactory.createOutput();
  // ...
}
```

**Rationale**:
- UIFactory should be created at CLI entry, not inside Application
- Force caller to provide UIFactory, clarify dependency
- Store as instance variable for later use

---

#### Step 5: Use Existing uiFactory for PermissionUIFactory

**Files to Modify**:
- `src/main.ts`

**Changes**:
1. Delete Line 153: `const uiFactory = UIFactoryRegistry.create(permissionConfig.ui);`
2. Use `this.uiFactory` to create PermissionManager

**Before**:
```typescript
const workingDir = process.cwd();
const permissionConfig = await this.configManager.loadPermissionConfig(options, workingDir);

const uiFactory = UIFactoryRegistry.create(permissionConfig.ui);

this.permissionManager = new PermissionManager(permissionConfig, uiFactory, this.toolRegistry);
```

**After**:
```typescript
const workingDir = process.cwd();
const permissionConfig = await this.configManager.loadPermissionConfig(options, workingDir);

// Use the UIFactory instance from constructor
this.permissionManager = new PermissionManager(
  permissionConfig,
  this.uiFactory,  // Pass full UIFactory, let PermissionManager extract PermissionUI
  this.toolRegistry
);
```

**Rationale**:
- Avoid duplicate UIFactory creation
- Use the singleton instance created at CLI entry
- PermissionManager internally extracts the PermissionUIFactory it needs

---

#### Step 6: Clean Up ConfigManager (Optional)

**Files to Modify**:
- `src/config/ConfigManager.ts`

**Changes**: Add comment to `buildPermissionConfigOnly()` method

**Added Comment**:
```typescript
/**
 * Build permission configuration directly from CLI options and project config
 *
 * This is a simplified version of buildPermissionConfig that constructs permission
 * configuration directly from raw projectConfig, handling CLI option merging internally.
 *
 * Note: UI configuration (projectConfig.ui) is read at application startup to create
 * UIFactory, and is NOT passed through permission configuration to PermissionManager.
 *
 * @param options - Configuration override options from CLI
 * @param projectConfig - Raw project configuration (before CLI option merge)
 * @returns Permission configuration object
 */
buildPermissionConfigOnly(options: ConfigOverrides, projectConfig: ProjectConfig): PermissionConfig {
  // ...
}
```

**Rationale**:
- Clarify UI configuration flow, avoid future confusion
- No code logic changes, documentation only

---

#### Step 7: Implement UIFactoryRegistry Singleton

**Files to Modify**:
- `src/ui/factories/UIFactoryRegistry.ts`

**Changes**: Add singleton implementation with validation

**Implementation**:
```typescript
export class UIFactoryRegistry {
  private static instance: UIFactory | null = null;

  /**
   * Create or get the global UIFactory singleton instance
   * Validates UI type from CLAUDE_UI_TYPE environment variable
   */
  static createUIFactory(): UIFactory {
    if (!UIFactoryRegistry.instance) {
      const uiType = process.env.CLAUDE_UI_TYPE || 'terminal';

      // Validate UI type
      const validTypes = ['terminal'];
      if (!validTypes.includes(uiType)) {
        throw new Error(
          `Invalid CLAUDE_UI_TYPE: "${uiType}". ` +
          `Supported types: ${validTypes.join(', ')}`
        );
      }

      UIFactoryRegistry.instance = this.createInstance(uiType);
    }
    return UIFactoryRegistry.instance;
  }

  /**
   * Create UIFactory instance by type
   * @internal
   */
  private static createInstance(type: string): UIFactory {
    switch (type) {
      case 'terminal':
        return new TerminalUIFactory();
      default:
        throw new Error(`Unsupported UI type: ${type}`);
    }
  }

  /**
   * Reset singleton instance for testing purposes
   * @internal
   */
  static resetForTesting(): void {
    UIFactoryRegistry.instance = null;
  }
}
```

**Rationale**:
- Global single instance ensures UIFactory created only once
- Environment variable validation at startup prevents runtime errors
- `resetForTesting()` allows test isolation

---

#### Step 8: Create TestUIFactory for Tests

**Files to Create**:
- `tests/helpers/TestUIFactory.ts`

**Implementation**:
```typescript
/**
 * TestUIFactory - Minimal UIFactory implementation for testing
 *
 * Provides mock implementations of UIFactory interface methods
 * with support for test assertions and behavior customization.
 */

import type { UIFactory, ParserInterface, OutputInterface } from '../../src/ui/factories/UIFactory';

export class TestUIFactory implements UIFactory {
  private readonly mockParser: ParserInterface;
  private readonly mockOutput: OutputInterface;

  constructor() {
    // Create minimal mock implementations
    this.mockParser = {
      parse: jest.fn().mockReturnValue({}),
      // Add other ParserInterface methods as needed
    } as unknown as ParserInterface;

    this.mockOutput = {
      write: jest.fn(),
      writeLine: jest.fn(),
      // Add other OutputInterface methods as needed
    } as unknown as OutputInterface;
  }

  createParser(): ParserInterface {
    return this.mockParser;
  }

  createOutput(): OutputInterface {
    return this.mockOutput;
  }

  createPermissionUI(): PermissionUIFactory {
    // Return mock PermissionUIFactory
    return {
      promptForPermission: jest.fn().mockResolvedValue('allow'),
      // Add other PermissionUIFactory methods as needed
    } as unknown as PermissionUIFactory;
  }

  // Test helpers
  getMockParser(): ParserInterface {
    return this.mockParser;
  }

  getMockOutput(): OutputInterface {
    return this.mockOutput;
  }
}
```

**Rationale**:
- Minimal interface implementation reduces test complexity
- Mock behavior support enables assertion verification
- Isolated in `tests/` directory, not part of production code

---

#### Step 9: Update File Header Comments

**Files to Update**:
- All modified files from Steps 1-8

**Changes**: Synchronize file header comments with code changes

**Example** (`src/main.ts`):
```typescript
/**
 * Application - Main application orchestrator
 *
 * Core responsibilities:
 * - Initialize UIFactory (received from CLI entry)
 * - Manage application lifecycle
 * - Coordinate subsystems (Config, Permission, Session, etc.)
 * - Route messages between user and SDK
 *
 * Key exports:
 * - Application: Main application class
 */
```

**Rationale**: Keep documentation in sync with code changes per project guidelines

---

### 4.2 Implementation Order

**Single Atomic Commit** (as per user decision):

1. Execute Step 1: Unify UIConfig interface
2. Execute Step 2: Remove ui field from configs
3. Execute Step 3: Confirm CLI entry needs no changes
4. Execute Step 4: Remove Application constructor default parameter
5. Execute Step 5: Use existing uiFactory for PermissionManager
6. Execute Step 6: Clean up ConfigManager comments
7. Execute Step 7: Implement UIFactoryRegistry singleton
8. Execute Step 8: Create TestUIFactory
9. Execute Step 9: Update file header comments
10. Run full test suite
11. Manual testing of startup and permission flows
12. Commit all changes with message:

```
refactor(ui): simplify UI factory initialization and remove config redundancy

- Unify UIConfig interface definition in UIFactoryRegistry
- Remove unused ui fields from PermissionConfig and ProjectConfig
- Eliminate duplicate UIFactory creation in Application.initialize()
- Implement UIFactoryRegistry singleton pattern
- Add environment variable validation for CLAUDE_UI_TYPE
- Create TestUIFactory for test isolation
- Update file header comments to reflect changes

BREAKING CHANGE: Application constructor now requires UIFactory parameter
(internal change only, CLI entry already provides it)
```

---

## 5. Testing Strategy

### 5.1 Unit Tests

#### UIFactoryRegistry Tests
**File**: `tests/ui/factories/UIFactoryRegistry.test.ts`

```typescript
describe('UIFactoryRegistry', () => {
  beforeEach(() => {
    UIFactoryRegistry.resetForTesting();
  });

  it('should create terminal UIFactory by default', () => {
    delete process.env.CLAUDE_UI_TYPE;
    const factory = UIFactoryRegistry.createUIFactory();
    expect(factory).toBeInstanceOf(TerminalUIFactory);
  });

  it('should create UIFactory from CLAUDE_UI_TYPE env var', () => {
    process.env.CLAUDE_UI_TYPE = 'terminal';
    const factory = UIFactoryRegistry.createUIFactory();
    expect(factory).toBeInstanceOf(TerminalUIFactory);
  });

  it('should throw error for invalid UI type', () => {
    process.env.CLAUDE_UI_TYPE = 'invalid';
    expect(() => UIFactoryRegistry.createUIFactory()).toThrow(
      'Invalid CLAUDE_UI_TYPE: "invalid"'
    );
  });

  it('should return singleton instance on multiple calls', () => {
    const factory1 = UIFactoryRegistry.createUIFactory();
    const factory2 = UIFactoryRegistry.createUIFactory();
    expect(factory1).toBe(factory2);
  });
});
```

#### ConfigManager Tests
**File**: `tests/config/ConfigManager.test.ts`

```typescript
describe('ConfigManager', () => {
  it('should load ProjectConfig without ui field', async () => {
    const config = await configManager.loadProjectConfig();
    expect(config).not.toHaveProperty('ui');
  });

  it('should build PermissionConfig without ui field', () => {
    const permissionConfig = configManager.buildPermissionConfigOnly(
      {},
      projectConfig
    );
    expect(permissionConfig).not.toHaveProperty('ui');
  });

  it('should ignore ui field in old config files', async () => {
    // Old config file with ui field
    const oldConfig = {
      model: 'claude-sonnet-4-5-20250929',
      ui: { type: 'terminal' }  // Deprecated field
    };

    // Should load without error, ui field ignored
    const config = await configManager.loadConfig(oldConfig);
    expect(config).toBeDefined();
    expect(config.ui).toBeUndefined();
  });
});
```

#### Application Tests
**File**: `tests/main.test.ts`

```typescript
describe('Application', () => {
  let testUIFactory: TestUIFactory;

  beforeEach(() => {
    testUIFactory = new TestUIFactory();
  });

  it('should require UIFactory parameter in constructor', () => {
    expect(() => new Application()).toThrow();
  });

  it('should store UIFactory instance', () => {
    const app = new Application(testUIFactory);
    expect(app['uiFactory']).toBe(testUIFactory);
  });

  it('should use same UIFactory for PermissionManager', async () => {
    const app = new Application(testUIFactory);
    await app.initialize({});

    const permissionManager = app['permissionManager'];
    // Verify PermissionManager uses the same UIFactory
    expect(permissionManager['permissionUI']).toBeDefined();
  });
});
```

### 5.2 Integration Tests

#### Full Startup Flow Test
**File**: `tests/integration/startup.test.ts`

```typescript
describe('Application Startup Integration', () => {
  it('should initialize with default terminal UI', async () => {
    delete process.env.CLAUDE_UI_TYPE;
    UIFactoryRegistry.resetForTesting();

    const uiFactory = UIFactoryRegistry.createUIFactory();
    const app = new Application(uiFactory);

    await app.initialize({});

    expect(app['parser']).toBeDefined();
    expect(app['output']).toBeDefined();
    expect(app['permissionManager']).toBeDefined();
  });

  it('should fail initialization with invalid UI type', () => {
    process.env.CLAUDE_UI_TYPE = 'invalid';
    UIFactoryRegistry.resetForTesting();

    expect(() => UIFactoryRegistry.createUIFactory()).toThrow(
      'Invalid CLAUDE_UI_TYPE'
    );
  });
});
```

#### Permission Flow Test
**File**: `tests/integration/permission.test.ts`

```typescript
describe('Permission Flow Integration', () => {
  it('should use UIFactory for permission prompts', async () => {
    const uiFactory = UIFactoryRegistry.createUIFactory();
    const app = new Application(uiFactory);
    await app.initialize({});

    const permissionManager = app['permissionManager'];

    // Mock permission request
    const canUse = await permissionManager.checkToolPermission('Read', {
      file_path: '/test.txt'
    });

    expect(canUse).toBeDefined();
  });
});
```

### 5.3 Manual Testing Scenarios

#### Scenario 1: Default Startup
```bash
# Test: Start application with no environment variable
unset CLAUDE_UI_TYPE
npm run start -- --help

# Expected:
# - Application starts successfully
# - Uses terminal UI by default
# - Help message displays correctly
```

#### Scenario 2: Invalid UI Type
```bash
# Test: Start with invalid CLAUDE_UI_TYPE
CLAUDE_UI_TYPE=invalid npm run start

# Expected:
# - Application fails to start
# - Error message: "Invalid CLAUDE_UI_TYPE: "invalid". Supported types: terminal"
# - Process exits with code 1
```

#### Scenario 3: Permission Mode Switching
```bash
# Test: Switch permission modes during runtime
npm run start

# In interactive mode:
# 1. Press Shift+Tab to cycle through permission modes
# 2. Verify emoji indicators: 🟢 default, 🟡 acceptEdits, 🔴 bypassPermissions
# 3. Execute commands in each mode
# 4. Verify permission prompts work correctly

# Expected:
# - Mode switching works smoothly
# - Permission prompts appear/disappear based on mode
# - UI remains responsive
```

#### Scenario 4: Old Config File Compatibility
```bash
# Test: Load old config file with ui field
cat > .claude-replica/settings.json <<EOF
{
  "model": "claude-sonnet-4-5-20250929",
  "permissionMode": "acceptEdits",
  "ui": {
    "type": "terminal"
  }
}
EOF

npm run start -- --help

# Expected:
# - Application loads successfully
# - No warnings or errors about ui field
# - UI field silently ignored
# - Uses CLAUDE_UI_TYPE env var (or default 'terminal')
```

### 5.4 Test Execution Checklist

Before merging the refactor:

- [ ] `npm test` - All unit tests pass
- [ ] `npm run lint` - No lint errors or warnings
- [ ] `tsc --noEmit` - No TypeScript type errors
- [ ] Manual Scenario 1 - Default startup works
- [ ] Manual Scenario 2 - Invalid UI type fails correctly
- [ ] Manual Scenario 3 - Permission mode switching works
- [ ] Manual Scenario 4 - Old config compatibility works

---

## 6. Risks & Mitigation

### 6.1 Risk: Config File Field Removal

**Risk**: Removing `ProjectConfig.ui` field might confuse users with old configs

**Impact**: Low (field was never actually used)

**Mitigation**:
- JSON parser automatically ignores undefined fields (no errors)
- Add integration test verifying old configs load successfully
- Document that UI type is now environment variable only

**Validation**:
```typescript
// Test case in ConfigManager.test.ts
it('should ignore ui field in old config files', async () => {
  const oldConfig = { model: '...', ui: { type: 'terminal' } };
  const config = await configManager.loadConfig(oldConfig);
  expect(config).toBeDefined();
  expect(config.ui).toBeUndefined();
});
```

### 6.2 Risk: Application Constructor Parameter Change

**Risk**: Removing default parameter might break tests

**Impact**: Medium (requires updating all test files)

**Mitigation**:
- Search all `new Application()` call sites before refactor
- Create TestUIFactory helper for tests
- Update tests to pass TestUIFactory instance
- Run full test suite before commit

**Search Command**:
```bash
# Find all Application instantiation sites
grep -r "new Application(" --include="*.ts" --include="*.test.ts"
```

### 6.3 Risk: Singleton Instance Leakage Between Tests

**Risk**: Singleton instance persists between tests, causing state pollution

**Impact**: High (tests might pass/fail non-deterministically)

**Mitigation**:
- Implement `resetForTesting()` method in UIFactoryRegistry
- Call `resetForTesting()` in `beforeEach()` of all relevant tests
- Document this requirement for future test writers

**Test Setup Pattern**:
```typescript
describe('Test Suite', () => {
  beforeEach(() => {
    UIFactoryRegistry.resetForTesting();
    delete process.env.CLAUDE_UI_TYPE;  // Clean env var
  });

  it('test case', () => {
    // Test implementation
  });
});
```

### 6.4 Risk: PermissionManager Interface Change

**Risk**: Changing PermissionManager constructor parameter type might break existing code

**Impact**: Low (PermissionManager only instantiated in one place)

**Mitigation**:
- PermissionManager already accepts a factory-like object
- Change parameter from `PermissionUIFactory` to `UIFactory`
- Let PermissionManager extract `PermissionUI` internally
- This design preserves future extensibility

**Before**:
```typescript
new PermissionManager(config, permissionUIFactory, toolRegistry)
```

**After**:
```typescript
new PermissionManager(config, uiFactory, toolRegistry)
// PermissionManager internally calls: uiFactory.createPermissionUI()
```

### 6.5 Risk: Environment Variable Validation Too Strict

**Risk**: Throwing error on invalid `CLAUDE_UI_TYPE` might be too harsh

**Impact**: Medium (users might have typos in env vars)

**Mitigation**:
- Provide clear error message listing valid types
- Error appears at startup (fast failure, easy to fix)
- User selected this approach (throw error vs fallback)

**Error Message Format**:
```
Error: Invalid CLAUDE_UI_TYPE: "termnial" (possible typo)
Supported types: terminal
Did you mean: terminal?
```

---

## 7. File Modification Checklist

### 7.1 Files to Modify

| File | Lines to Change | Change Type | Description |
|------|----------------|-------------|-------------|
| `src/ui/factories/UIFactoryRegistry.ts` | Add singleton logic | Add | Implement singleton pattern with validation |
| `src/permissions/PermissionManager.ts` | 58-63 | Delete | Remove duplicate UIConfig interface |
| `src/permissions/PermissionManager.ts` | 82 | Delete | Remove `ui?: UIConfig` from PermissionConfig |
| `src/permissions/PermissionManager.ts` | Top | Add | Import UIConfig from UIFactoryRegistry |
| `src/config/SDKConfigLoader.ts` | 177-182 | Delete | Remove duplicate UIConfig interface |
| `src/config/SDKConfigLoader.ts` | 202-203 | Delete | Remove `ui?: UIConfig` from ProjectConfig |
| `src/config/SDKConfigLoader.ts` | Top | Add | Import UIConfig from UIFactoryRegistry |
| `src/config/ConfigManager.ts` | 45 | Delete | Remove UIConfig export |
| `src/config/ConfigManager.ts` | 153-166 | Add comment | Document UI config flow |
| `src/main.ts` | 75 | Modify | Remove uiFactory default parameter |
| `src/main.ts` | 75 | Add | Store uiFactory as instance variable |
| `src/main.ts` | 153 | Delete | Remove duplicate UIFactory creation |
| `src/main.ts` | 153-166 | Modify | Use this.uiFactory for PermissionManager |
| `src/cli.ts` | - | No change | Already implements correct flow |
| `tests/helpers/TestUIFactory.ts` | - | Create | Add TestUIFactory for tests |
| All modified files | File headers | Update | Synchronize comments with changes |

### 7.2 Files Not to Modify

| File | Reason |
|------|--------|
| `README.md` | Internal refactor, no user-facing changes |
| `.claude/CLAUDE.md` | Will be updated separately if needed |
| `CHANGELOG.md` | Backward compatible change, no migration needed |
| Configuration files (`.claude-replica/settings.json`, etc.) | Field removal handled by code, not config |

---

## 8. Success Criteria

### 8.1 Functional Requirements

- [x] UIFactory created only once at CLI entry
- [x] Environment variable `CLAUDE_UI_TYPE` controls UI type
- [x] Invalid UI type throws clear error at startup
- [x] Old config files with `ui` field load without error
- [x] PermissionManager uses the singleton UIFactory instance
- [x] No duplicate UIConfig interface definitions
- [x] No unused `ui` fields in config interfaces

### 8.2 Non-Functional Requirements

- [x] All existing tests pass
- [x] No new lint warnings
- [x] No TypeScript type errors
- [x] Code follows project patterns (Manager, Adapter, Strategy)
- [x] File header comments synchronized with code
- [x] TestUIFactory available for future test writing

### 8.3 Quality Gates

| Gate | Command | Expected Result |
|------|---------|-----------------|
| Unit Tests | `npm test` | All tests pass, no failures |
| Lint Check | `npm run lint` | No errors, no warnings |
| Type Check | `tsc --noEmit` | No type errors |
| Build | `npm run build` | Successful compilation |
| Manual Test | `npm run start -- --help` | Help displays correctly |
| Invalid UI Test | `CLAUDE_UI_TYPE=invalid npm run start` | Error thrown, process exits |

---

## 9. Rollback Plan

### 9.1 Rollback Trigger Conditions

Rollback if any of the following occur:

1. More than 5 test failures after refactor
2. TypeScript compilation fails
3. Application fails to start in default configuration
4. Permission prompts stop working
5. Critical bug discovered in production use within 24 hours

### 9.2 Rollback Procedure

**Single Commit Rollback** (since this is an atomic commit):

```bash
# 1. Identify the refactor commit
git log --oneline --grep="simplify UI factory initialization"

# 2. Revert the commit
git revert <commit-hash>

# 3. Verify rollback success
npm test
npm run build
npm run start -- --help

# 4. Push revert if on remote branch
git push origin main
```

### 9.3 Post-Rollback Actions

If rollback is necessary:

1. Create incident report documenting failure cause
2. Review test coverage gaps that allowed bug to slip through
3. Add regression tests for the discovered issue
4. Re-plan refactor with additional safeguards
5. Schedule retrospective to improve future refactors

---

## 10. Post-Refactor Actions

### 10.1 Immediate Actions (Day 1)

- [ ] Monitor application startup logs for unusual errors
- [ ] Watch for user reports of configuration issues
- [ ] Review CI/CD pipeline for any test flakiness
- [ ] Verify no performance regression in startup time

### 10.2 Short-Term Actions (Week 1)

- [ ] Check if any documentation needs updating (README, CLAUDE.md)
- [ ] Review code review feedback from team
- [ ] Address any minor issues or edge cases discovered
- [ ] Consider adding more integration tests if gaps found

### 10.3 Long-Term Actions (Month 1)

- [ ] Evaluate if singleton pattern meets all use cases
- [ ] Consider future support for multiple UI types (web, json)
- [ ] Review if any further simplifications possible
- [ ] Update architectural decision records (ADR) if maintained

---

## 11. Technical Debt Assessment

### 11.1 Debt Being Resolved

This refactor resolves the following technical debt:

| Debt Item | Severity | Impact | Resolution |
|-----------|----------|--------|------------|
| Duplicate UIConfig definitions | Medium | Maintenance burden, inconsistency risk | Unified in UIFactoryRegistry |
| Unused config fields (ui in ProjectConfig/PermissionConfig) | Low | Confusion, false documentation | Removed |
| Dual UIFactory creation | Medium | Performance waste, unclear ownership | Single creation at CLI entry |
| No singleton pattern | Medium | Multiple instances possible | Singleton implemented |
| Unclear UI configuration flow | High | Developer onboarding difficulty | Simplified to env var only |

### 11.2 Potential New Debt

This refactor may introduce the following new debt:

| Debt Item | Severity | Mitigation |
|-----------|----------|------------|
| Global singleton state | Low | Acceptable for this use case; `resetForTesting()` available |
| Hard dependency on env var | Low | Documented; future enhancement can add config file support if needed |
| TestUIFactory maintenance | Low | Simple mock, minimal maintenance burden |

### 11.3 Debt Avoided

By doing this refactor now, we avoid future debt:

- **Configuration complexity**: Prevents sprawl of UI config locations
- **Bug risk**: Eliminates edge cases from dual factory creation
- **Developer confusion**: Clear single source of truth for UI initialization
- **Testing difficulty**: Simplified flow easier to test and mock

---

## 12. Appendix

### 12.1 Reference Materials

- **Original Plan**: `/Users/wuwenjun/.claude/plans/glowing-scribbling-seal.md`
- **Project Documentation**: `.claude/CLAUDE.md`
- **Code Specification**: `.claude/rules/code-spec.md`
- **File Header Guidelines**: `.claude/rules/file-header-documentation.md`

### 12.2 Related Code Files

**Core Files**:
- `src/ui/factories/UIFactoryRegistry.ts` - UI factory registry
- `src/ui/factories/UIFactory.ts` - UIFactory interface
- `src/main.ts` - Application class
- `src/cli.ts` - CLI entry point

**Configuration Files**:
- `src/config/ConfigManager.ts` - Configuration management
- `src/config/SDKConfigLoader.ts` - SDK config loader
- `src/permissions/PermissionManager.ts` - Permission management

**Test Files**:
- `tests/ui/factories/UIFactoryRegistry.test.ts`
- `tests/config/ConfigManager.test.ts`
- `tests/main.test.ts`
- `tests/helpers/TestUIFactory.ts` (to be created)

### 12.3 Environment Variables

| Variable | Default | Valid Values | Description |
|----------|---------|--------------|-------------|
| `CLAUDE_UI_TYPE` | `terminal` | `terminal` (future: `web`, `json`) | UI type selection |

### 12.4 Key Interfaces

```typescript
// UIConfig (only in UIFactoryRegistry.ts)
export interface UIConfig {
  type: 'terminal' | 'web' | 'json';  // Future extensibility
}

// UIFactory (UIFactory.ts)
export interface UIFactory {
  createParser(): ParserInterface;
  createOutput(): OutputInterface;
  createPermissionUI(): PermissionUIFactory;
}

// PermissionConfig (after refactor)
export interface PermissionConfig {
  mode: PermissionMode;
  whitelist?: string[];
  blacklist?: string[];
  // ui field removed
}

// ProjectConfig (after refactor)
export interface ProjectConfig {
  model?: string;
  tools?: ToolConfig[];
  permissions?: PermissionMode;
  // ui field removed
}
```

### 12.5 Commit Message Template

```
refactor(ui): simplify UI factory initialization and remove config redundancy

Problem:
- Duplicate UIConfig interface definitions in 3 files
- Unused ui fields in PermissionConfig and ProjectConfig
- Dual UIFactory creation (cli.ts and main.ts)
- No singleton pattern for UIFactory

Changes:
- Unify UIConfig interface in UIFactoryRegistry
- Remove ui fields from PermissionConfig and ProjectConfig
- Eliminate duplicate UIFactory creation in Application.initialize()
- Implement UIFactoryRegistry singleton pattern
- Add CLAUDE_UI_TYPE environment variable validation
- Create TestUIFactory for test isolation
- Update file header comments

Testing:
- All unit tests pass
- Integration tests added for startup flow
- Manual testing of permission modes
- Old config file compatibility verified

BREAKING CHANGE: Application constructor now requires UIFactory parameter
(internal change only, CLI entry already provides it)

Closes #<issue-number>
```

---

## 13. Design Document Metadata

| Field | Value |
|-------|-------|
| **Document Version** | 1.0.0 |
| **Created Date** | 2026-01-16 |
| **Author** | Claude Sonnet 4.5 |
| **Project** | Claude Replica |
| **Refactor Title** | UI Factory Initialization Simplification |
| **Target Release** | Next patch version |
| **Estimated Effort** | 4-6 hours (development + testing) |
| **Risk Level** | Low-Medium |
| **Stakeholder** | Project maintainer |

---

## 14. Approval Sign-Off

This design document has been reviewed and incorporates stakeholder decisions from the requirements gathering interview conducted on 2026-01-16.

**Key Decisions Confirmed**:
- ✅ Environment variable only configuration (no config file support)
- ✅ Throw error on invalid UI type (no fallback)
- ✅ Global singleton UIFactory pattern
- ✅ Single atomic commit for all changes
- ✅ Create TestUIFactory for test isolation
- ✅ Update file header comments synchronously
- ✅ No documentation updates needed (internal refactor)

**Ready for Implementation**: Yes

---

**Document End**
