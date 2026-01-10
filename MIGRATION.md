# Migration Guide: Slash Commands Migration to SDK Native Support

## Overview

This guide explains how to migrate from the old CommandManager-based commands system to the new SDK native slash commands support in Claude Replica v2.0.

## What Changed

### Removed Components
- **CommandManager** (`src/commands/CommandManager.ts`) - Fully removed
- Old command processing logic in `main.ts`
- Custom command handling methods

### New Architecture
- Uses Claude Agent SDK's native slash commands support
- Simplified message processing flow
- Zero custom command processing code

## Migration Steps

### 1. Command Directory Structure

**Old Structure:**
```
.claude-replica/commands/
  ├── user/
  │   └── my-command.command.md
  └── project/
      └── another-command.command.md
```

**New Structure:**
```
.claude/commands/
  └── my-command.md
  └── another-command.md
```

**Action Required:**
- Move command files from `.claude-replica/commands/user/` and `.claude-replica/commands/project/` to `.claude/commands/`
- Rename files from `*.command.md` to `*.md`

### 2. Frontmatter Fields

**Old Format:**
```yaml
---
name: My Command
description: A custom command
parameters:
  - name: arg1
    description: First argument
  - name: arg2
    description: Second argument
allowed_tools:
  - Read
  - Write
---
```

**New Format:**
```yaml
---
name: My Command
description: A custom command
allowed_tools:
  - Read
  - Write
argument-hint: <arg1> <arg2>
---
```

**Changes:**
- `parameters` field removed
- Add `argument-hint` field to show users expected arguments
- `allowed_tools` remains the same
- `description` remains the same

### 3. Parameter Substitution

**Old Format:**
```markdown
# My Command

This command does something with $ARGUMENTS

$ARGUMENTS will be replaced with all arguments passed to the command
```

**New Format:**
```markdown
# My Command

This command does something with $1 and $2

$1 will be replaced with the first argument
$2 will be replaced with the second argument
```

**Changes:**
- `$ARGUMENTS` (all arguments) → use individual `$1`, `$2`, `$3`, etc.
- No special syntax for embedded command output
- Simple positional parameter substitution

### 4. Invocation Method

**Old Invocation:**
```
/user:my-command arg1 arg2
/project:another-command arg1
```

**New Invocation:**
```
/my-command arg1 arg2
/another-command arg1
```

**Changes:**
- Remove `/user:` and `/project:` prefixes
- Commands are now invoked directly with `/command-name`
- All commands are project-level (no user-level commands)

### 5. Command Content Format

**Old Format:**
```markdown
---
name: Build Project
description: Build the project with custom flags
parameters:
  - name: flags
    description: Build flags to pass
allowed_tools:
  - Bash
---
# Build Project

Run the build command with the following flags:

```bash
npm run build $FLAGS
```
```

**New Format:**
```markdown
---
name: Build Project
description: Build the project with custom flags
allowed_tools:
  - Bash
argument-hint: <flags>
---
# Build Project

Run the build command with the following flags:

```bash
npm run build $1
```
```

## Complete Example

### Old Command File: `.claude-replica/commands/user/test.command.md`
```yaml
---
name: Test Command
description: A test command for demonstration
parameters:
  - name: input
    description: Input text
  - name: count
    description: Number of times to repeat
allowed_tools:
  - Read
  - Write
---
# Test Command

This is a test command that processes input text.

Input: $INPUT
Repeat: $COUNT times

Process: $ARGUMENTS
```

### New Command File: `.claude/commands/test.md`
```yaml
---
name: Test Command
description: A test command for demonstration
allowed_tools:
  - Read
  - Write
argument-hint: <input> <count>
---
# Test Command

This is a test command that processes input text.

Input: $1
Repeat: $2 times

Process: $1 $2
```

### Usage

**Old Usage:**
```
/user:test "hello world" 5
```

**New Usage:**
```
/test "hello world" 5
```

## Benefits of Migration

1. **Simplified Architecture**: ~600 lines of custom code removed
2. **SDK Native Support**: Uses official Claude Agent SDK slash commands
3. **Reduced Maintenance**: No custom command processing logic to maintain
4. **Better Integration**: Seamlessly integrated with SDK features
5. **Standardization**: Follows Claude Code conventions

## Testing Your Migration

After migrating your commands:

1. Build the project:
   ```bash
   npm run build
   ```

2. Run tests:
   ```bash
   npm test
   ```

3. Test in interactive mode:
   ```bash
   npm start -- --interactive
   ```

4. Try your migrated commands:
   ```
   /your-command-name arg1 arg2
   ```

## Troubleshooting

### Commands Not Found
- Verify files are in `.claude/commands/` directory
- Check file extension is `.md` (not `.command.md`)
- Ensure frontmatter has `name` field

### Parameter Substitution Not Working
- Use `$1`, `$2`, etc. instead of `$ARGUMENTS`
- Check `argument-hint` field matches actual parameters

### Tools Not Allowed
- Verify `allowed_tools` frontmatter field is present
- Check tool names match exactly (case-sensitive)

## Support

For issues or questions about the migration:
- Check the test file: `tests/integration/slash-commands.test.ts`
- Review SDK documentation: https://docs.anthropic.com/claude-agent-sdk
- Submit issues to the project repository

## Summary

The migration from CommandManager to SDK native slash commands significantly simplifies the codebase while providing better integration with Claude Agent SDK. The key changes are:

1. **Directory**: `.claude-replica/commands/` → `.claude/commands/`
2. **Files**: `*.command.md` → `*.md`
3. **Parameters**: `$ARGUMENTS` → `$1`, `$2`, `$3`...
4. **Invocation**: `/user:command` → `/command`
5. **Frontmatter**: Remove `parameters`, add `argument-hint`

This migration reduces technical debt and aligns with Claude Code's native command structure.
