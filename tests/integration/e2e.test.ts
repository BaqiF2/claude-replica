/**
 * 端到端集成测试
 *
 * 测试完整的工作流程，包括：
 * - 交互式模式
 * - 非交互式模式
 * - 会话恢复
 * - 错误恢复
 *
 * @module tests/integration/e2e
 * **验证: 所有需求**
 */

// 模拟 SDK 模块 - 返回正确的 AsyncGenerator
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: jest.fn().mockImplementation(() => {
    // 返回一个 AsyncGenerator，模拟 SDK 的响应流
    async function* mockGenerator() {
      // 先返回一个助手消息
      yield {
        type: 'assistant',
        session_id: 'mock-session-id',
        message: {
          content: [
            {
              type: 'text',
              text: '这是模拟的 AI 响应',
            },
          ],
        },
      };
      // 然后返回成功结果
      yield {
        type: 'result',
        subtype: 'success',
        session_id: 'mock-session-id',
        result: '这是模拟的 AI 响应',
        total_cost_usd: 0.001,
        duration_ms: 100,
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
      };
    }
    return mockGenerator();
  }),
}));

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SessionManager } from '../../src/core/SessionManager';
import { ConfigManager } from '../../src/config/ConfigManager';
import { AgentRegistry } from '../../src/agents/AgentRegistry';
import { HookManager } from '../../src/hooks/HookManager';
import { MCPManager } from '../../src/mcp/MCPManager';
import { RewindManager } from '../../src/rewind/RewindManager';
import { ToolRegistry } from '../../src/tools/ToolRegistry';
import { PermissionManager } from '../../src/permissions/PermissionManager';
import { OutputFormatter } from '../../src/output/OutputFormatter';

describe('端到端集成测试', () => {
  let main: typeof import('../../src/main').main;
  let Application: typeof import('../../src/main').Application;
  let tempHome: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;
  let testDir: string;
  let sessionsDir: string;
  let configDir: string;

  beforeAll(async () => {
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-replica-home-'));
    process.env.HOME = tempHome;
    process.env.USERPROFILE = tempHome;

    jest.resetModules();
    jest.doMock('os', () => {
      const actual = jest.requireActual<typeof os>('os');
      return {
        ...actual,
        homedir: () => tempHome,
      };
    });
    ({ main, Application } = await import('../../src/main'));

    // 创建测试目录
    testDir = path.join(os.tmpdir(), `claude-replica-e2e-${Date.now()}`);
    sessionsDir = path.join(testDir, 'sessions');
    configDir = path.join(testDir, '.claude-replica');
    
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.mkdir(configDir, { recursive: true });
  });

  afterAll(async () => {
    // 清理测试目录
    try {
      await fs.rm(testDir, { recursive: true, force: true });
      await fs.rm(tempHome, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }

    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
    }

    jest.dontMock('os');
  });

  describe('非交互式模式工作流', () => {
    it('应该完成基本的查询工作流', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // 执行非交互式查询
      const exitCode = await main(['-p', '你好，这是一个测试']);
      
      expect(exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('应该支持 JSON 格式输出的完整工作流', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await main(['-p', '测试 JSON 输出', '--output-format', 'json']);
      
      expect(exitCode).toBe(0);
      
      // 验证 JSON 输出格式
      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('result');
      expect(parsed).toHaveProperty('success', true);
      
      consoleSpy.mockRestore();
    });

    it('应该支持 stream-json 格式输出的完整工作流', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await main(['-p', '测试流式输出', '--output-format', 'stream-json']);
      
      expect(exitCode).toBe(0);
      
      // 验证流式 JSON 输出
      const output = consoleSpy.mock.calls[0][0];
      const lines = output.split('\n').filter((l: string) => l.trim());
      expect(lines.length).toBeGreaterThanOrEqual(1);
      
      // 检查是否有 result 类型的行
      const hasResultLine = lines.some((line: string) => {
        const parsed = JSON.parse(line);
        return parsed.type === 'result';
      });
      expect(hasResultLine).toBe(true);
      
      consoleSpy.mockRestore();
    });

    it('应该支持 markdown 格式输出的完整工作流', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await main(['-p', '测试 Markdown 输出', '--output-format', 'markdown']);
      
      expect(exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('应该支持模型选择的完整工作流', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await main(['-p', '测试模型选择', '--model', 'haiku']);
      
      expect(exitCode).toBe(0);
      
      consoleSpy.mockRestore();
    });

    it('应该支持权限模式的完整工作流', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await main(['-p', '测试权限模式', '--permission-mode', 'plan']);
      
      expect(exitCode).toBe(0);
      
      consoleSpy.mockRestore();
    });

    it('应该支持高级选项的完整工作流', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await main([
        '-p', '测试高级选项',
        '--max-turns', '5',
        '--max-budget-usd', '1.0',
        '--verbose',
      ]);
      
      expect(exitCode).toBe(0);
      
      consoleSpy.mockRestore();
    });

    it('应该支持沙箱模式的完整工作流', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await main(['-p', '测试沙箱模式', '--sandbox']);
      
      expect(exitCode).toBe(0);
      
      consoleSpy.mockRestore();
    });
  });

  describe('会话管理工作流', () => {
    let sessionManager: SessionManager;
    let createdSessionId: string;

    beforeAll(() => {
      sessionManager = new SessionManager(sessionsDir);
    });

    it('应该创建新会话', async () => {
      const session = await sessionManager.createSession(testDir);
      
      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.id).toMatch(/^session-/);
      expect(session.expired).toBe(false);
      expect(session.workingDirectory).toBe(testDir);
      
      createdSessionId = session.id;
    });

    it('应该保存和加载会话', async () => {
      // 加载之前创建的会话
      const loadedSession = await sessionManager.loadSession(createdSessionId);
      
      expect(loadedSession).not.toBeNull();
      expect(loadedSession!.id).toBe(createdSessionId);
      expect(loadedSession!.workingDirectory).toBe(testDir);
    });

    it('应该添加消息到会话', async () => {
      const session = await sessionManager.loadSession(createdSessionId);
      expect(session).not.toBeNull();
      
      const message = await sessionManager.addMessage(session!, {
        role: 'user',
        content: '测试消息',
      });
      
      expect(message).toBeDefined();
      expect(message.id).toBeDefined();
      expect(message.role).toBe('user');
      expect(message.content).toBe('测试消息');
      
      // 重新加载会话验证消息已保存
      const reloadedSession = await sessionManager.loadSession(createdSessionId);
      expect(reloadedSession!.messages.length).toBeGreaterThan(0);
    });

    it('应该列出所有会话', async () => {
      const sessions = await sessionManager.listSessions();
      
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.some(s => s.id === createdSessionId)).toBe(true);
    });

    it('应该获取最近的会话', async () => {
      const recentSession = await sessionManager.getRecentSession();
      
      expect(recentSession).not.toBeNull();
      // 最近的会话应该是我们刚创建的
      expect(recentSession!.id).toBe(createdSessionId);
    });

    it('应该支持 --continue 选项继续最近会话', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await main(['-c', '-p', '继续会话测试']);
      
      expect(exitCode).toBe(0);
      
      consoleSpy.mockRestore();
    });
  });

  describe('会话恢复工作流', () => {
    let sessionManager: SessionManager;
    let testSessionId: string;
    // 使用与 Application 一致的会话目录（基于测试用的 HOME）
    let defaultSessionsDir: string;

    beforeAll(async () => {
      const baseHome = tempHome || testDir;
      defaultSessionsDir = path.join(baseHome, '.claude-replica', 'sessions');
      sessionManager = new SessionManager(defaultSessionsDir);
      
      // 创建一个测试会话
      const session = await sessionManager.createSession(testDir);
      testSessionId = session.id;
      
      // 添加一些消息
      await sessionManager.addMessage(session, {
        role: 'user',
        content: '第一条消息',
      });
      await sessionManager.addMessage(session, {
        role: 'assistant',
        content: '第一条回复',
      });
    });

    afterAll(async () => {
      // 清理测试会话
      try {
        await sessionManager.deleteSession(testSessionId);
      } catch {
        // 忽略清理错误
      }
    });

    it('应该恢复指定的会话', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await main(['--resume', testSessionId, '-p', '恢复会话测试']);
      
      expect(exitCode).toBe(0);
      
      consoleSpy.mockRestore();
    });

    it('应该处理不存在的会话 ID', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const exitCode = await main(['--resume', 'non-existent-session', '-p', '测试']);
      
      expect(exitCode).toBe(1);
      
      consoleErrorSpy.mockRestore();
    });

    it('应该验证会话恢复后消息历史完整', async () => {
      const session = await sessionManager.loadSession(testSessionId);
      
      expect(session).not.toBeNull();
      expect(session!.messages.length).toBeGreaterThanOrEqual(2);
      expect(session!.messages[0].content).toBe('第一条消息');
      expect(session!.messages[1].content).toBe('第一条回复');
    });
  });

  describe('错误恢复工作流', () => {
    it('应该处理无效的命令行参数', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const exitCode = await main(['--invalid-option']);
      
      expect(exitCode).toBe(2); // CONFIG_ERROR (无效参数)
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });

    it('应该处理无效的输出格式', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const exitCode = await main(['-p', '测试', '--output-format', 'invalid']);
      
      expect(exitCode).toBe(2); // CONFIG_ERROR (无效参数)
      
      consoleErrorSpy.mockRestore();
    });

    it('应该处理无效的权限模式', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const exitCode = await main(['-p', '测试', '--permission-mode', 'invalid']);
      
      expect(exitCode).toBe(2); // CONFIG_ERROR (无效参数)
      
      consoleErrorSpy.mockRestore();
    });

    it('应该处理缺少查询内容的情况', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // 模拟 stdin 是 TTY（没有管道输入）
      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      
      const exitCode = await main(['-p']);
      
      expect(exitCode).toBe(2); // CONFIG_ERROR (缺少查询内容)
      
      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
      consoleErrorSpy.mockRestore();
    });

    it('应该正确返回帮助信息', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await main(['--help']);
      
      expect(exitCode).toBe(0);
      const output = consoleSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('claude-replica');
      expect(output).toContain('用法');
      
      consoleSpy.mockRestore();
    });

    it('应该正确返回版本信息', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await main(['--version']);
      
      expect(exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('v0.1.0'));
      
      consoleSpy.mockRestore();
    });
  });

  describe('扩展系统集成工作流', () => {
    let agentsDir: string;

    beforeAll(async () => {
      agentsDir = path.join(configDir, 'agents');
      await fs.mkdir(agentsDir, { recursive: true });
    });

    it('应该加载代理文件', async () => {
      // 创建测试代理文件
      const agentContent = `---
description: 测试代理
model: sonnet
tools:
  - Read
  - Grep
---

你是一个测试代理。
`;
      await fs.writeFile(path.join(agentsDir, 'test-agent.agent.md'), agentContent);
      
      const agentRegistry = new AgentRegistry();
      await agentRegistry.loadAgents([agentsDir]);
      
      const agents = agentRegistry.listAgents();
      expect(agents.length).toBeGreaterThan(0);
      expect(agents.some(a => a.name === 'test-agent')).toBe(true);
    });
  });

  describe('组件集成工作流', () => {
    it('应该正确集成工具注册表和权限管理器', () => {
      const toolRegistry = new ToolRegistry();
      const permissionManager = new PermissionManager(
        { mode: 'default' },
        toolRegistry
      );
      
      // 验证默认工具
      const defaultTools = toolRegistry.getDefaultTools();
      expect(defaultTools.length).toBeGreaterThan(0);
      expect(defaultTools).toContain('Read');
      expect(defaultTools).toContain('Write');
      
      // 验证权限检查
      const isAllowed = permissionManager.isToolAllowed('Read');
      expect(isAllowed).toBe(true);
    });

    it('应该正确集成钩子管理器', () => {
      const hookManager = new HookManager();
      
      // 加载钩子配置
      hookManager.loadHooks({
        PostToolUse: [
          {
            matcher: 'Write',
            hooks: [
              {
                matcher: 'Write',
                type: 'command',
                command: 'echo "文件已写入"',
              },
            ],
          },
        ],
      });
      
      // 验证钩子已加载
      const hooksForSDK = hookManager.getHooksForSDK();
      expect(hooksForSDK.PostToolUse).toBeDefined();
      expect(hooksForSDK.PostToolUse!.length).toBeGreaterThan(0);
    });

    it('应该正确集成 MCP 管理器', async () => {
      const mcpManager = new MCPManager();
      
      // 添加测试服务器
      mcpManager.addServer('test-server', {
        command: 'echo',
        args: ['test'],
      });
      
      // 验证服务器已添加
      const servers = mcpManager.listServers();
      expect(servers).toContain('test-server');
      
      // 验证配置
      const config = mcpManager.getServersConfig();
      expect(config['test-server']).toBeDefined();
    });

    it('应该正确集成回退管理器', async () => {
      const rewindDir = path.join(testDir, 'rewind-test');
      await fs.mkdir(rewindDir, { recursive: true });
      
      const rewindManager = new RewindManager({ workingDir: rewindDir });
      await rewindManager.initialize();
      
      // 创建测试文件
      const testFile = path.join(rewindDir, 'test.txt');
      await fs.writeFile(testFile, '原始内容');
      
      // 捕获快照
      const snapshot = await rewindManager.captureSnapshot('测试快照', [testFile]);
      expect(snapshot).toBeDefined();
      expect(snapshot.id).toBeDefined();
      
      // 修改文件
      await fs.writeFile(testFile, '修改后的内容');
      
      // 恢复快照
      await rewindManager.restoreSnapshot(snapshot.id);
      
      // 验证文件已恢复
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('原始内容');
    });

    it('应该正确集成输出格式化器', () => {
      const formatter = new OutputFormatter();
      
      const result = {
        content: '测试内容',
        success: true,
        model: 'sonnet',
        totalCostUsd: 0.001,
      };
      
      // 测试各种格式
      const textOutput = formatter.format(result, 'text');
      expect(textOutput).toBe('测试内容');
      
      const jsonOutput = formatter.format(result, 'json');
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.result).toBe('测试内容');
      expect(parsed.success).toBe(true);
      
      const streamJsonOutput = formatter.format(result, 'stream-json');
      expect(streamJsonOutput).toContain('"type":"result"');
      
      const markdownOutput = formatter.format(result, 'markdown');
      expect(markdownOutput).toContain('测试内容');
    });
  });

  describe('配置系统集成工作流', () => {
    let configManager: ConfigManager;
    let userConfigDir: string;
    let projectConfigDir: string;

    beforeAll(async () => {
      configManager = new ConfigManager();
      userConfigDir = path.join(testDir, 'user-config');
      projectConfigDir = path.join(testDir, 'project-config', '.claude-replica');
      
      await fs.mkdir(userConfigDir, { recursive: true });
      await fs.mkdir(projectConfigDir, { recursive: true });
    });

    it('应该正确合并用户和项目配置', () => {
      const userConfig = {
        model: 'sonnet',
        maxTurns: 10,
      };
      
      const projectConfig = {
        model: 'haiku', // 项目配置覆盖用户配置
        maxBudgetUsd: 1.0,
      };
      
      const merged = configManager.mergeConfigs(userConfig, projectConfig);
      
      expect(merged.model).toBe('haiku'); // 项目配置优先
      expect(merged.maxTurns).toBe(10); // 用户配置保留
      expect(merged.maxBudgetUsd).toBe(1.0); // 项目配置添加
    });

    it('应该正确处理本地配置覆盖', () => {
      const userConfig = {
        model: 'sonnet',
      };
      
      const projectConfig = {
        model: 'haiku',
      };
      
      const localConfig = {
        model: 'opus', // 本地配置最高优先级
      };
      
      const merged = configManager.mergeConfigs(userConfig, projectConfig, localConfig);
      
      expect(merged.model).toBe('opus');
    });
  });

  describe('Application 类集成工作流', () => {
    it('应该正确创建和运行 Application 实例', async () => {
      const app = new Application();
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await app.run(['-p', '测试 Application']);
      
      expect(exitCode).toBe(0);
      
      consoleSpy.mockRestore();
    });

    it('应该支持多个选项组合', async () => {
      const app = new Application();
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await app.run([
        '-p', '组合选项测试',
        '--model', 'haiku',
        '--output-format', 'json',
        '--max-turns', '5',
        '--verbose',
      ]);
      
      expect(exitCode).toBe(0);
      
      consoleSpy.mockRestore();
    });
  });
});
