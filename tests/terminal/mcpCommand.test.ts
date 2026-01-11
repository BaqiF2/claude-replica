/**
 * 终端交互测试（使用 node-pty 模拟），验证 /mcp 命令在交互式 CLI 中的行为。
 */

jest.mock('node-pty', () => require('../mocks/node-pty'));

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'node-pty';

const stripAnsi = (value: string): string => value.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

const CLI_PATH = path.join(__dirname, '..', '..', 'dist', 'cli.js');

const createWorkspace = async (suffix: string): Promise<string> => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), `claude-terminal-${suffix}-`));
  await fs.mkdir(path.join(workspace, '.git'));
  return workspace;
};

const prepareCliEnv = async (workspace: string) => {
  const sessionDir = path.join(workspace, '.claude-replica', 'sessions');
  const claudeDir = path.join(workspace, '.claude');
  const debugDir = path.join(claudeDir, 'debug');

  await fs.mkdir(sessionDir, { recursive: true });
  await fs.mkdir(debugDir, { recursive: true });

  return {
    CLAUDE_REPLICA_SESSIONS_DIR: sessionDir,
    CLAUDE_CONFIG_DIR: claudeDir,
    CLAUDE_CODE_DEBUG_LOGS_DIR: debugDir,
  };
};

const startCliSession = (workspace: string, env: Record<string, string> = {}) => {
  return spawn(process.execPath, [CLI_PATH], {
    cwd: workspace,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      ...env,
    },
    cols: 120,
    rows: 30,
  });
};

const sendCommand = (session: ReturnType<typeof startCliSession>, command: string) => {
  session.write(`${command}\r`);
};

const waitForOutput = (
  session: ReturnType<typeof startCliSession>,
  substring: string,
  timeout = 10000
): Promise<string> => {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const subscription = session.onData((chunk) => {
      buffer += stripAnsi(chunk);
      if (buffer.includes(substring)) {
        cleanup();
        resolve(buffer);
      }
    });

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for "${substring}"`));
    }, timeout);

    const cleanup = () => {
      subscription.dispose();
      clearTimeout(timeoutId);
    };
  });
};

const closeSession = async (session: ReturnType<typeof startCliSession>) => {
  sendCommand(session, 'exit');
  await new Promise<void>((resolve) => {
    const subscription = session.onExit(() => {
      subscription.dispose();
      resolve();
    });
  });
};

describe('/mcp interactive commands', () => {
  jest.setTimeout(20000);

  it('/mcp list shows configured servers', async () => {
    const workspace = await createWorkspace('list');
    const configPath = path.join(workspace, '.mcp.json');
    await fs.writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          filesystem: {
            command: 'echo',
            args: ['hello'],
          },
          'remote-api': {
            type: 'sse',
            url: 'https://example.com/mcp',
          },
        },
      })
    );

    const sessionEnv = await prepareCliEnv(workspace);
    const session = startCliSession(workspace, sessionEnv);
    try {
      await waitForOutput(session, 'Claude Code Replica');
      sendCommand(session, '/mcp list');
      const output = await waitForOutput(session, 'Transport: sse');
      const plain = stripAnsi(output);
      expect(plain).toContain('filesystem');
      expect(plain).toContain('Transport: stdio');
      expect(plain).toContain('remote-api');
      expect(plain).toContain('Transport: sse');
    } finally {
      await closeSession(session);
      await fs.rm(workspace, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it('/mcp validate reports errors', async () => {
    const workspace = await createWorkspace('validate');
    const configPath = path.join(workspace, '.mcp.json');
    await fs.writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          broken: {
            type: 'sse',
          },
        },
      })
    );

    const sessionEnv = await prepareCliEnv(workspace);
    const session = startCliSession(workspace, sessionEnv);
    try {
      await waitForOutput(session, 'Claude Code Replica');
      sendCommand(session, '/mcp validate');
      await waitForOutput(session, 'MCP configuration is invalid.');
      const output = await waitForOutput(session, 'url must be a non-empty string');
      const plain = stripAnsi(output);
      expect(plain).toContain('broken');
      expect(plain).toContain('url must be a non-empty string');
    } finally {
      await closeSession(session);
      await fs.rm(workspace, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it('/mcp edit opens the configured editor', async () => {
    const workspace = await createWorkspace('edit');
    const editorScript = path.join(workspace, 'noop-editor.js');
    await fs.writeFile(editorScript, 'process.exit(0);\n', 'utf-8');

    const sessionEnv = await prepareCliEnv(workspace);
    const session = startCliSession(workspace, {
      ...sessionEnv,
      EDITOR: `node ${editorScript}`,
    });
    try {
      await waitForOutput(session, 'Claude Code Replica');
      sendCommand(session, '/mcp edit');
      const updatedOutput = await waitForOutput(session, 'MCP configuration updated:');
      const reloadOutput = await waitForOutput(
        session,
        'Reload the application to apply the updated configuration.'
      );
      const plainReload = stripAnsi(reloadOutput);
      expect(stripAnsi(updatedOutput)).toContain('MCP configuration updated:');
      expect(plainReload).toContain('Reload the application to apply the updated configuration.');
    } finally {
      await closeSession(session);
      await fs.rm(workspace, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
