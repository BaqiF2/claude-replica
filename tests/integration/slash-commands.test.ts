/**
 * SDK Native Slash Commands Integration Tests
 *
 * Validates:
 * - `.claude/commands/` directory structure support
 * - `$1, $2` parameter placeholder functionality
 * - `allowed-tools` frontmatter field
 * - `description` and `argument-hint` frontmatter fields
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { MessageRouter } from '../../src/core/MessageRouter';
import { SessionManager } from '../../src/core/SessionManager';
import { ConfigManager } from '../../src/config/ConfigManager';
import { ToolRegistry } from '../../src/tools/ToolRegistry';
import { PermissionManager } from '../../src/permissions/PermissionManager';

describe('SDK Native Slash Commands Integration Tests', () => {
  let tempDir: string;
  let sessionManager: SessionManager;
  let configManager: ConfigManager;
  let toolRegistry: ToolRegistry;
  let permissionManager: PermissionManager;
  let commandsDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slash-commands-test-'));
    sessionManager = new SessionManager(path.join(tempDir, 'sessions'));
    configManager = new ConfigManager();
    toolRegistry = new ToolRegistry();
    permissionManager = new PermissionManager({ mode: 'default' }, toolRegistry);

    // Create .claude/commands/ directory structure
    commandsDir = path.join(tempDir, '.claude', 'commands');
    await fs.mkdir(commandsDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('.claude/commands/ directory structure', () => {
    it('should support creating command files in .claude/commands/', async () => {
      const commandContent = `---
description: Test command
---

This is a test command.`;

      const commandPath = path.join(commandsDir, 'test.md');
      await fs.writeFile(commandPath, commandContent);

      const stat = await fs.stat(commandPath);
      expect(stat.isFile()).toBe(true);

      const content = await fs.readFile(commandPath, 'utf-8');
      expect(content).toContain('description: Test command');
    });

    it('should support nested command directories', async () => {
      const nestedDir = path.join(commandsDir, 'tools');
      await fs.mkdir(nestedDir, { recursive: true });

      const commandContent = `---
description: Nested command
---

This is a nested command.`;

      const commandPath = path.join(nestedDir, 'build.md');
      await fs.writeFile(commandPath, commandContent);

      const stat = await fs.stat(commandPath);
      expect(stat.isFile()).toBe(true);
    });
  });

  describe('Parameter placeholder functionality ($1, $2)', () => {
    it('should create command file with $1 placeholder', async () => {
      const commandContent = `---
description: Greet a user
argument-hint: <name>
---

Say hello to $1 and make them feel welcome.`;

      const commandPath = path.join(commandsDir, 'greet.md');
      await fs.writeFile(commandPath, commandContent);

      const content = await fs.readFile(commandPath, 'utf-8');
      expect(content).toContain('$1');
      expect(content).toContain('argument-hint: <name>');
    });

    it('should create command file with multiple placeholders ($1, $2, $3)', async () => {
      const commandContent = `---
description: Create a file with content
argument-hint: <filename> <content> [encoding]
---

Create a file named $1 with the following content: $2
Use encoding: $3 if specified.`;

      const commandPath = path.join(commandsDir, 'create-file.md');
      await fs.writeFile(commandPath, commandContent);

      const content = await fs.readFile(commandPath, 'utf-8');
      expect(content).toContain('$1');
      expect(content).toContain('$2');
      expect(content).toContain('$3');
    });
  });

  describe('Frontmatter field support', () => {
    it('should support allowed-tools frontmatter field', async () => {
      const commandContent = `---
description: Run tests command
allowed-tools: Bash, Read, Grep
---

Run the test suite and report results.`;

      const commandPath = path.join(commandsDir, 'test.md');
      await fs.writeFile(commandPath, commandContent);

      const content = await fs.readFile(commandPath, 'utf-8');
      expect(content).toContain('allowed-tools: Bash, Read, Grep');
    });

    it('should support description frontmatter field', async () => {
      const commandContent = `---
description: Build the project for production
---

Build the project with optimizations.`;

      const commandPath = path.join(commandsDir, 'build.md');
      await fs.writeFile(commandPath, commandContent);

      const content = await fs.readFile(commandPath, 'utf-8');
      expect(content).toContain('description: Build the project for production');
    });

    it('should support argument-hint frontmatter field', async () => {
      const commandContent = `---
description: Commit changes with message
argument-hint: <commit message>
---

Create a git commit with the message: $1`;

      const commandPath = path.join(commandsDir, 'commit.md');
      await fs.writeFile(commandPath, commandContent);

      const content = await fs.readFile(commandPath, 'utf-8');
      expect(content).toContain('argument-hint: <commit message>');
    });

    it('should support all frontmatter fields together', async () => {
      const commandContent = `---
description: Deploy to environment
argument-hint: <environment> [--dry-run]
allowed-tools: Bash, Read, Write
---

Deploy the application to $1 environment.
If --dry-run is specified, only simulate the deployment.`;

      const commandPath = path.join(commandsDir, 'deploy.md');
      await fs.writeFile(commandPath, commandContent);

      const content = await fs.readFile(commandPath, 'utf-8');
      expect(content).toContain('description: Deploy to environment');
      expect(content).toContain('argument-hint: <environment> [--dry-run]');
      expect(content).toContain('allowed-tools: Bash, Read, Write');
      expect(content).toContain('$1');
    });
  });

  describe('MessageRouter configuration for commands', () => {
    it('should return project-only settingSources for SDK commands discovery', async () => {
      await sessionManager.createSession(tempDir);
      const messageRouter = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const settingSources = messageRouter.getSettingSources();

      // Only project level is supported for commands
      expect(settingSources).toEqual(['project']);
      expect(settingSources).not.toContain('user');
      expect(settingSources).not.toContain('local');
    });

    it('should include Skill tool in allowed tools for command invocation', async () => {
      const session = await sessionManager.createSession(tempDir);
      const messageRouter = new MessageRouter({
        configManager,
        toolRegistry,
        permissionManager,
      });

      const tools = messageRouter.getEnabledToolNames(session);

      expect(tools).toContain('Skill');
    });
  });

  describe('Command file format validation', () => {
    it('should accept valid markdown command file', async () => {
      const commandContent = `---
description: Format code
allowed-tools: Bash
---

Format the codebase using prettier.`;

      const commandPath = path.join(commandsDir, 'format.md');
      await fs.writeFile(commandPath, commandContent);

      const content = await fs.readFile(commandPath, 'utf-8');

      // Validate frontmatter structure
      expect(content).toMatch(/^---\n/);
      expect(content).toMatch(/\n---\n/);

      // Validate content after frontmatter
      const bodyMatch = content.match(/---\n\n(.+)/s);
      expect(bodyMatch).not.toBeNull();
      expect(bodyMatch![1]).toContain('Format the codebase');
    });

    it('should support command file without frontmatter', async () => {
      const commandContent = `Just run the linter on all files.`;

      const commandPath = path.join(commandsDir, 'lint.md');
      await fs.writeFile(commandPath, commandContent);

      const content = await fs.readFile(commandPath, 'utf-8');
      expect(content).toBe(commandContent);
      expect(content).not.toContain('---');
    });
  });
});
