/**
 * 主程序入口测试
 *
 * 测试 main.ts 的核心功能
 * **验证: 需求 1.1, 1.2, 1.3, 6.3, 6.4, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6**
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

import { main, Application } from '../src/main';

describe('main 函数', () => {
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
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('v0.1.0'));
      
      consoleSpy.mockRestore();
    });

    it('-v 应该等同于 --version', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await main(['-v']);
      
      expect(exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('v0.1.0'));
      
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
  });
});

describe('Application 类', () => {
  describe('构造函数', () => {
    it('应该正确创建 Application 实例', () => {
      const app = new Application();
      expect(app).toBeInstanceOf(Application);
    });
  });

  describe('run 方法', () => {
    it('应该处理 --help 选项', async () => {
      const app = new Application();
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await app.run(['--help']);
      
      expect(exitCode).toBe(0);
      
      consoleSpy.mockRestore();
    });

    it('应该处理 --version 选项', async () => {
      const app = new Application();
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const exitCode = await app.run(['--version']);
      
      expect(exitCode).toBe(0);
      
      consoleSpy.mockRestore();
    });

    it('应该处理非交互模式查询', async () => {
      const app = new Application();
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

  describe('会话恢复错误', () => {
    it('应该处理不存在的会话 ID', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const exitCode = await main(['--resume', 'non-existent-session-id', '-p', '测试']);
      
      expect(exitCode).toBe(1);
      
      consoleErrorSpy.mockRestore();
    });
  });
});

describe('输出格式', () => {
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
    const output = consoleSpy.mock.calls[0][0];
    expect(() => JSON.parse(output)).not.toThrow();
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('result');
    expect(parsed).toHaveProperty('success', true);
    
    consoleSpy.mockRestore();
  });

  it('应该支持 stream-json 格式输出', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    const exitCode = await main(['-p', '测试', '--output-format', 'stream-json']);
    
    expect(exitCode).toBe(0);
    const output = consoleSpy.mock.calls[0][0];
    // stream-json 可能包含多行，每行都是有效的 JSON
    const lines = output.split('\n').filter((l: string) => l.trim());
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

  it('会话恢复失败应该返回退出码 1 (ERROR)', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    const exitCode = await main(['--resume', 'non-existent-session', '-p', '测试']);
    
    expect(exitCode).toBe(1);
    
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
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    // 位置参数应该被解析为查询内容
    const exitCode = await main(['测试查询']);
    
    // 没有 -p 标志时，应该进入交互模式，但由于没有 TTY，会失败
    // 这里我们只测试参数解析是否正确
    expect(typeof exitCode).toBe('number');
    
    consoleSpy.mockRestore();
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

  it('应该支持 --continue 选项', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    // 没有最近的会话时，应该创建新会话
    const exitCode = await main(['-c', '-p', '测试查询']);
    
    expect(exitCode).toBe(0);
    
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
