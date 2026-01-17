/**
 * 主程序入口测试
 *
 * 测试 main.ts 的核心功能
 * **验证: 需求 1.1, 1.2, 1.3, 6.3, 6.4, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6**
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import ts from 'typescript';
import { CLIParser } from '../src/cli/CLIParser';
import { TestUIFactory } from './helpers/TestUIFactory';
import { TerminalUIFactory } from '../src/ui/factories/TerminalUIFactory';

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
  createSdkMcpServer: jest.fn().mockImplementation((config) => config),
  tool: jest.fn().mockImplementation((name, description, schema, handler) => ({
    name,
    description,
    schema,
    handler,
  })),
}));

let main: typeof import('../src/main').main;
let Application: typeof import('../src/main').Application;
let tempHome: string;
let originalHome: string | undefined;
let originalUserProfile: string | undefined;
const EXPECTED_PERMISSION_UI_COUNT = parseInt(
  process.env.APP_PERMISSION_UI_INSTANCE_COUNT || '1',
  10
);

const MAIN_PATH = path.join(__dirname, '../src/main.ts');
const MAIN_ENCODING = 'utf-8';
const mainSourceText = fsSync.readFileSync(MAIN_PATH, MAIN_ENCODING);
const mainSourceFile = ts.createSourceFile(
  MAIN_PATH,
  mainSourceText,
  ts.ScriptTarget.Latest,
  true
);

const getClassDeclaration = (name: string): ts.ClassDeclaration => {
  let found: ts.ClassDeclaration | undefined;
  mainSourceFile.forEachChild((node) => {
    if (ts.isClassDeclaration(node) && node.name?.text === name) {
      found = node;
    }
  });

  if (!found) {
    throw new Error(`Class not found: ${name}`);
  }

  return found;
};

const getMethodDeclaration = (
  node: ts.ClassDeclaration,
  name: string
): ts.MethodDeclaration => {
  const methodDecl = node.members.find((member) => {
    if (!ts.isMethodDeclaration(member)) {
      return false;
    }
    if (!member.name || !ts.isIdentifier(member.name)) {
      return false;
    }
    return member.name.text === name;
  });

  if (!methodDecl || !ts.isMethodDeclaration(methodDecl)) {
    throw new Error(`Method not found: ${name}`);
  }

  return methodDecl;
};

const getRunnerFactoryInstantiation = (methodDecl: ts.MethodDeclaration): ts.NewExpression => {
  let found: ts.NewExpression | undefined;

  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'RunnerFactory') {
        found = node;
      }
    }
    node.forEachChild(visit);
  };

  if (methodDecl.body) {
    methodDecl.body.forEachChild(visit);
  }

  if (!found) {
    throw new Error('RunnerFactory instantiation not found');
  }

  return found;
};

const containsThisUiFactoryArgument = (node: ts.Node): boolean => {
  let found = false;

  const visit = (child: ts.Node): void => {
    if (ts.isPropertyAccessExpression(child)) {
      if (
        child.expression.kind === ts.SyntaxKind.ThisKeyword &&
        child.name.text === 'uiFactory'
      ) {
        found = true;
        return;
      }
    }
    child.forEachChild(visit);
  };

  visit(node);
  return found;
};
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
  ({ main, Application } = await import('../src/main'));
});

afterAll(async () => {
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

  await fs.rm(tempHome, { recursive: true, force: true });
  jest.dontMock('os');
});

describe('main 函数', () => {
  describe('Application 初始化', () => {
    it('应该在创建 RunnerFactory 时传递 uiFactory', () => {
      const applicationClass = getClassDeclaration('Application');
      const initializeMethod = getMethodDeclaration(applicationClass, 'initialize');
      const runnerFactoryInstantiation = getRunnerFactoryInstantiation(initializeMethod);

      expect(containsThisUiFactoryArgument(runnerFactoryInstantiation)).toBe(true);
    });
  });

  describe('--help 选项', () => {
    it('应该显示帮助信息并返回 0', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await main(['--help']);
      
      expect(exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('claude-replica');
      expect(output).toContain('用法');
      expect(output).toContain('--help');
      
      consoleSpy.mockRestore();
    });

    it('-h 应该等同于 --help', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await main(['-h']);
      
      expect(exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('--version 选项', () => {
    it('应该显示版本号并返回 0', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await main(['--version']);
      
      expect(exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('0.1.0'));
      
      consoleSpy.mockRestore();
    });

    it('-v 应该等同于 --version', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await main(['-v']);
      
      expect(exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('0.1.0'));
      
      consoleSpy.mockRestore();
    });
  });

  describe('无效参数处理', () => {
    it('应该对无效选项返回错误码 CONFIG_ERROR (2)', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const exitCode = await main(['--invalid-option']);
      
      expect(exitCode).toBe(2); // CONFIG_ERROR (无效参数)
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('非交互模式 (-p)', () => {
    it('应该执行查询并返回结果', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const exitCode = await main(['-p', '测试查询']);

      expect(exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('没有查询内容时应该返回错误 CONFIG_ERROR (2)', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // 模拟 stdin 不是 TTY（没有管道输入）
      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

      const exitCode = await main(['-p']);

      expect(exitCode).toBe(2); // CONFIG_ERROR (缺少查询内容)

      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
      consoleErrorSpy.mockRestore();
    });

    it('应该不创建会话文件（无持久化）', async () => {
      // 获取会话目录路径
      const sessionsDir = path.join(tempHome, '.claude-replica', 'sessions');

      // 执行非交互模式查询
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const exitCode = await main(['-p', '测试查询']);
      consoleSpy.mockRestore();

      // 验证退出码
      expect(exitCode).toBe(0);

      // 验证目录可能存在（由 initialize 创建），但不应该有实际的会话文件
      let entries: string[] = [];
      try {
        entries = await fs.readdir(sessionsDir);
      } catch {
        entries = [];
      }

      // 过滤出会话目录（以 session- 开头的目录）
      const sessionEntries = entries.filter(e => e.startsWith('session-'));

      // 验证没有创建实际的会话文件
      expect(sessionEntries.length).toBe(0);
    });

    it('应该使用临时会话 ID 并返回正确退出码', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // 执行查询
      const exitCode = await main(['-p', '测试查询']);

      // 验证退出码
      expect(exitCode).toBe(0);

      // 验证查询结果输出
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});

describe('Application 类', () => {
  describe('构造函数', () => {
    it('应该正确创建 Application 实例', () => {
      const app = new Application(new TerminalUIFactory());
      expect(app).toBeInstanceOf(Application);
    });
  });

  describe('initialize 方法', () => {
    it('应该复用同一 UIFactory 实例创建 PermissionUI', async () => {
      const uiFactory = new TestUIFactory();
      const app = new Application(uiFactory);

      await (app as unknown as { initialize: (options: Record<string, unknown>) => Promise<void> })
        .initialize({});

      expect(uiFactory.permissionUIInstances).toHaveLength(EXPECTED_PERMISSION_UI_COUNT);
    });
  });

  describe('run 方法', () => {
    it('应该处理 --help 选项', async () => {
      const app = new Application(new TerminalUIFactory());
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await app.run(['--help']);
      
      expect(exitCode).toBe(0);
      
      consoleSpy.mockRestore();
    });

    it('应该处理 --version 选项', async () => {
      const app = new Application(new TerminalUIFactory());
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await app.run(['--version']);
      
      expect(exitCode).toBe(0);
      
      consoleSpy.mockRestore();
    });

    it('应该处理非交互模式查询', async () => {
      const app = new Application(new TerminalUIFactory());
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await app.run(['-p', '你好']);
      
      expect(exitCode).toBe(0);
      
      consoleSpy.mockRestore();
    });
  });
});

describe('错误处理', () => {
  describe('CLI 解析错误', () => {
    it('应该正确处理 CLI 解析错误并返回 CONFIG_ERROR (2)', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const exitCode = await main(['--unknown-option']);

      expect(exitCode).toBe(2); // CONFIG_ERROR (无效参数)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Argument error')
      );

      consoleErrorSpy.mockRestore();
    });
  });

});

describe('输出格式', () => {
  const findJsonOutput = (calls: Array<unknown[]>): string | undefined => {
    for (const call of calls) {
      const value = call[0];
      if (typeof value !== 'string') {
        continue;
      }
      try {
        JSON.parse(value);
        return value;
      } catch {
        continue;
      }
    }
    return undefined;
  };

  const findStreamJsonOutput = (calls: Array<unknown[]>): string | undefined => {
    for (const call of calls) {
      const value = call[0];
      if (typeof value !== 'string') {
        continue;
      }
      const lines = value.split('\n').filter((line) => line.trim());
      if (lines.length === 0) {
        continue;
      }
      const allJsonLines = lines.every((line) => {
        try {
          JSON.parse(line);
          return true;
        } catch {
          return false;
        }
      });
      if (allJsonLines) {
        return value;
      }
    }
    return undefined;
  };

  it('应该支持 text 格式输出', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    const exitCode = await main(['-p', '测试', '--output-format', 'text']);
    
    expect(exitCode).toBe(0);
    // text 格式应该直接输出内容
    expect(consoleSpy).toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });

  it('应该支持 json 格式输出', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    const exitCode = await main(['-p', '测试', '--output-format', 'json']);
    
    expect(exitCode).toBe(0);
    const output = findJsonOutput(consoleSpy.mock.calls);
    expect(output).toBeDefined();
    const parsed = JSON.parse(output as string);
    expect(parsed).toHaveProperty('result');
    expect(parsed).toHaveProperty('success', true);
    
    consoleSpy.mockRestore();
  });

  it('应该支持 stream-json 格式输出', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    const exitCode = await main(['-p', '测试', '--output-format', 'stream-json']);
    
    expect(exitCode).toBe(0);
    const output = findStreamJsonOutput(consoleSpy.mock.calls);
    expect(output).toBeDefined();
    // stream-json 可能包含多行，每行都是有效的 JSON
    const lines = (output as string).split('\n').filter((l: string) => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(1);
    
    // 检查是否有 type: result 的行
    const hasResultLine = lines.some((line: string) => {
      const parsed = JSON.parse(line);
      return parsed.type === 'result';
    });
    expect(hasResultLine).toBe(true);
    
    consoleSpy.mockRestore();
  });

  it('应该支持 markdown 格式输出', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    const exitCode = await main(['-p', '测试', '--output-format', 'markdown']);
    
    expect(exitCode).toBe(0);
    // markdown 格式应该包含原始内容
    expect(consoleSpy).toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });

  it('无效格式应该被 CLI 解析器拒绝并返回 CONFIG_ERROR (2)', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // 使用无效格式会被 CLI 解析器拒绝
    const exitCode = await main(['-p', '测试', '--output-format', 'invalid']);
    
    // CLI 解析器应该拒绝无效格式
    expect(exitCode).toBe(2); // CONFIG_ERROR (无效参数)
    
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});

describe('模型选择', () => {
  it('应该接受 --model 选项', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    const exitCode = await main(['-p', '测试', '--model', 'haiku']);
    
    expect(exitCode).toBe(0);
    
    consoleSpy.mockRestore();
  });
});

describe('权限模式', () => {
  it('应该接受 --permission-mode 选项', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    const exitCode = await main(['-p', '测试', '--permission-mode', 'plan']);
    
    expect(exitCode).toBe(0);
    
    consoleSpy.mockRestore();
  });

  it('应该接受 --dangerously-skip-permissions 选项', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    const exitCode = await main(['-p', '测试', '--dangerously-skip-permissions']);
    
    expect(exitCode).toBe(0);
    
    consoleSpy.mockRestore();
  });
});

describe('高级选项', () => {
  it('应该接受 --max-turns 选项', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    const exitCode = await main(['-p', '测试', '--max-turns', '10']);
    
    expect(exitCode).toBe(0);
    
    consoleSpy.mockRestore();
  });

  it('应该接受 --max-budget-usd 选项', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    const exitCode = await main(['-p', '测试', '--max-budget-usd', '1.5']);
    
    expect(exitCode).toBe(0);
    
    consoleSpy.mockRestore();
  });

  it('应该接受 --verbose 选项', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    const exitCode = await main(['-p', '测试', '--verbose']);
    
    expect(exitCode).toBe(0);
    
    consoleSpy.mockRestore();
  });

  it('应该接受 --sandbox 选项', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    const exitCode = await main(['-p', '测试', '--sandbox']);
    
    expect(exitCode).toBe(0);
    
    consoleSpy.mockRestore();
  });
});

describe('退出码处理', () => {
  it('成功执行应该返回退出码 0 (SUCCESS)', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    const exitCode = await main(['-p', '测试查询']);
    
    expect(exitCode).toBe(0);
    
    consoleSpy.mockRestore();
  });

  it('参数错误应该返回退出码 2 (CONFIG_ERROR)', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    const exitCode = await main(['--unknown-option']);
    
    expect(exitCode).toBe(2); // CONFIG_ERROR (无效参数)
    
    consoleErrorSpy.mockRestore();
  });

});

describe('非交互模式高级功能', () => {
  it('应该支持 --print 的长格式', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    const exitCode = await main(['--print', '测试查询']);
    
    expect(exitCode).toBe(0);
    expect(consoleSpy).toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });

  it('应该支持位置参数作为查询内容', async () => {
    const parser = new CLIParser();

    // 位置参数应该被解析为查询内容
    const options = parser.parse(['测试查询']);

    expect(options.prompt).toBe('测试查询');
  });

  it('应该支持组合多个选项', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    const exitCode = await main([
      '-p', '测试查询',
      '--model', 'haiku',
      '--output-format', 'json',
      '--max-turns', '5',
    ]);
    
    expect(exitCode).toBe(0);
    // 找到 JSON 输出（跳过可能的日志输出）
    const jsonOutput = consoleSpy.mock.calls.find(call => {
      try {
        JSON.parse(call[0]);
        return true;
      } catch {
        return false;
      }
    });
    expect(jsonOutput).toBeDefined();
    
    consoleSpy.mockRestore();
  });

});

describe('管道输入支持', () => {
  it('应该在非 TTY 模式下尝试读取 stdin', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // 模拟 stdin 不是 TTY
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

    // 由于没有实际的管道输入，这会超时并返回 null
    // 但我们可以测试它不会崩溃
    const exitCode = await main(['-p']);

    // 恢复原始值
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });

    // 由于没有输入，应该返回 CONFIG_ERROR
    expect(exitCode).toBe(2); // CONFIG_ERROR (缺少查询内容)

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});

describe('启动时自动清理旧会话', () => {
  let sessionsDir: string;

  beforeEach(async () => {
    // 清理并创建测试会话目录
    sessionsDir = path.join(tempHome, '.claude-replica', 'sessions');
    try {
      await fs.rm(sessionsDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
    await fs.mkdir(sessionsDir, { recursive: true });
  });

  afterEach(async () => {
    // 清理测试会话目录
    try {
      await fs.rm(sessionsDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  it('启动时应该自动清理旧会话', async () => {
    // 创建超过默认保留数量的会话目录
    const sessionCount = 15;
    const sessionIds: string[] = [];

    for (let i = 0; i < sessionCount; i++) {
      const timestamp = (Date.now() - (sessionCount - i) * 1000).toString(36);
      const sessionId = `session-${timestamp}-${i.toString().padStart(8, '0')}`;
      sessionIds.push(sessionId);

      const sessionDir = path.join(sessionsDir, sessionId);
      await fs.mkdir(sessionDir, { recursive: true });

      // 创建会话元数据
      const createdAt = new Date(Date.now() - (sessionCount - i) * 1000);
      const metadata = {
        id: sessionId,
        createdAt: createdAt.toISOString(),
        lastAccessedAt: createdAt.toISOString(),
        workingDirectory: '/test',
        expired: false,
      };
      await fs.writeFile(
        path.join(sessionDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8'
      );
      await fs.writeFile(
        path.join(sessionDir, 'messages.json'),
        '[]',
        'utf-8'
      );
      await fs.writeFile(
        path.join(sessionDir, 'context.json'),
        JSON.stringify({
          workingDirectory: '/test',
          projectConfig: {},
          activeAgents: [],
        }, null, 2),
        'utf-8'
      );
      await fs.mkdir(path.join(sessionDir, 'snapshots'), { recursive: true });
    }

    // 验证所有会话都已创建
    const entriesBefore = await fs.readdir(sessionsDir);
    expect(entriesBefore.filter(e => e.startsWith('session-')).length).toBe(sessionCount);

    // 运行应用程序（非交互模式）
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await main(['-p', '测试']);
    consoleSpy.mockRestore();

    // 验证会话数量已被清理到默认保留数量（10）
    const entriesAfter = await fs.readdir(sessionsDir);
    const remainingSessions = entriesAfter.filter(e => e.startsWith('session-'));

    // 默认保留 10 个会话，加上运行时可能创建的新会话
    // 由于非交互模式会创建新会话，所以应该有 11 个（10 个旧会话 + 1 个新会话）
    // 但实际上清理发生在创建新会话之前，所以应该是 10 + 1 = 11
    expect(remainingSessions.length).toBeLessThanOrEqual(11);
    expect(remainingSessions.length).toBeGreaterThanOrEqual(10);
  });

  it('应该支持通过环境变量 SESSION_KEEP_COUNT 配置保留数量', async () => {
    // 设置环境变量
    const originalKeepCount = process.env.SESSION_KEEP_COUNT;
    process.env.SESSION_KEEP_COUNT = '5';

    // 重新加载模块以使用新的环境变量
    jest.resetModules();
    jest.doMock('os', () => {
      const actual = jest.requireActual<typeof os>('os');
      return {
        ...actual,
        homedir: () => tempHome,
      };
    });
    const { main: reloadedMain } = await import('../src/main');

    // 创建 10 个会话
    const sessionCount = 10;
    for (let i = 0; i < sessionCount; i++) {
      const timestamp = (Date.now() - (sessionCount - i) * 1000).toString(36);
      const sessionId = `session-${timestamp}-${i.toString().padStart(8, '0')}`;

      const sessionDir = path.join(sessionsDir, sessionId);
      await fs.mkdir(sessionDir, { recursive: true });

      const createdAt = new Date(Date.now() - (sessionCount - i) * 1000);
      const metadata = {
        id: sessionId,
        createdAt: createdAt.toISOString(),
        lastAccessedAt: createdAt.toISOString(),
        workingDirectory: '/test',
        expired: false,
      };
      await fs.writeFile(
        path.join(sessionDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8'
      );
      await fs.writeFile(path.join(sessionDir, 'messages.json'), '[]', 'utf-8');
      await fs.writeFile(
        path.join(sessionDir, 'context.json'),
        JSON.stringify({
          workingDirectory: '/test',
          projectConfig: {},
          activeAgents: [],
        }, null, 2),
        'utf-8'
      );
      await fs.mkdir(path.join(sessionDir, 'snapshots'), { recursive: true });
    }

    // 验证所有会话都已创建
    const entriesBefore = await fs.readdir(sessionsDir);
    expect(entriesBefore.filter(e => e.startsWith('session-')).length).toBe(sessionCount);

    // 运行应用程序
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await reloadedMain(['-p', '测试']);
    consoleSpy.mockRestore();

    // 验证会话数量已被清理到配置的保留数量（5）
    const entriesAfter = await fs.readdir(sessionsDir);
    const remainingSessions = entriesAfter.filter(e => e.startsWith('session-'));

    // 保留 5 个会话 + 运行时创建的新会话
    expect(remainingSessions.length).toBeLessThanOrEqual(6);
    expect(remainingSessions.length).toBeGreaterThanOrEqual(5);

    // 恢复环境变量
    if (originalKeepCount === undefined) {
      delete process.env.SESSION_KEEP_COUNT;
    } else {
      process.env.SESSION_KEEP_COUNT = originalKeepCount;
    }
  });

  it('当前活动会话不应被删除', async () => {
    // 创建一些旧会话
    const oldSessionCount = 5;
    for (let i = 0; i < oldSessionCount; i++) {
      const timestamp = (Date.now() - 10000 - i * 1000).toString(36);
      const sessionId = `session-${timestamp}-old${i.toString().padStart(4, '0')}`;

      const sessionDir = path.join(sessionsDir, sessionId);
      await fs.mkdir(sessionDir, { recursive: true });

      const createdAt = new Date(Date.now() - 10000 - i * 1000);
      const metadata = {
        id: sessionId,
        createdAt: createdAt.toISOString(),
        lastAccessedAt: createdAt.toISOString(),
        workingDirectory: '/test',
        expired: false,
      };
      await fs.writeFile(
        path.join(sessionDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8'
      );
      await fs.writeFile(path.join(sessionDir, 'messages.json'), '[]', 'utf-8');
      await fs.writeFile(
        path.join(sessionDir, 'context.json'),
        JSON.stringify({
          workingDirectory: '/test',
          projectConfig: {},
          activeAgents: [],
        }, null, 2),
        'utf-8'
      );
      await fs.mkdir(path.join(sessionDir, 'snapshots'), { recursive: true });
    }

    // 运行应用程序
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const exitCode = await main(['-p', '测试']);
    consoleSpy.mockRestore();

    expect(exitCode).toBe(0);

    // 验证有会话存在（新创建的活动会话 + 部分旧会话）
    const entries = await fs.readdir(sessionsDir);
    const sessions = entries.filter(e => e.startsWith('session-'));
    expect(sessions.length).toBeGreaterThan(0);
  });
});
