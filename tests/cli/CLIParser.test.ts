/**
 * CLIParser 单元测试
 * 
 * 测试命令行参数解析器的核心功能
 * **验证: 需求 1.1, 1.2, 1.3, 14.4, 17.1, 17.2, 17.3, 19.1, 19.2, 19.3**
 */

import { CLIParser, CLIParseError } from '../../src/cli/CLIParser';

describe('CLIParser', () => {
  let parser: CLIParser;

  beforeEach(() => {
    parser = new CLIParser();
  });

  describe('基本选项解析', () => {
    it('无参数时应返回默认选项', () => {
      const options = parser.parse([]);

      expect(options.print).toBeUndefined();
      expect(options.continue).toBeUndefined();
      expect(options.resume).toBeUndefined();
      expect(options.help).toBeUndefined();
      expect(options.version).toBeUndefined();
    });

    it('应解析 -p/--print 选项', () => {
      expect(parser.parse(['-p', 'query']).print).toBe(true);
      expect(parser.parse(['--print', 'query']).print).toBe(true);
    });

    it('应解析 -p 选项后的查询内容', () => {
      const options = parser.parse(['-p', 'hello world']);

      expect(options.print).toBe(true);
      expect(options.prompt).toBe('hello world');
    });

    it('应解析 -c/--continue 选项', () => {
      expect(parser.parse(['-c']).continue).toBe(true);
      expect(parser.parse(['--continue']).continue).toBe(true);
    });

    it('应解析 --resume 选项', () => {
      const options = parser.parse(['--resume', 'session-123']);

      expect(options.resume).toBe('session-123');
    });

    it('应解析 --help 选项', () => {
      expect(parser.parse(['--help']).help).toBe(true);
      expect(parser.parse(['-h']).help).toBe(true);
    });

    it('应解析 --version 选项', () => {
      expect(parser.parse(['--version']).version).toBe(true);
      expect(parser.parse(['-v']).version).toBe(true);
    });
  });

  describe('模型选择', () => {
    it('应解析 --model 选项', () => {
      const options = parser.parse(['--model', 'sonnet']);

      expect(options.model).toBe('sonnet');
    });

    it('应支持不同的模型名称', () => {
      expect(parser.parse(['--model', 'haiku']).model).toBe('haiku');
      expect(parser.parse(['--model', 'opus']).model).toBe('opus');
      expect(parser.parse(['--model', 'claude-sonnet-4-5-20250929']).model).toBe('claude-sonnet-4-5-20250929');
    });
  });

  describe('工具控制', () => {
    it('应解析 --allowed-tools 选项', () => {
      const options = parser.parse(['--allowed-tools', 'Read,Write,Bash']);

      expect(options.allowedTools).toEqual(['Read', 'Write', 'Bash']);
    });

    it('应解析 --disallowed-tools 选项', () => {
      const options = parser.parse(['--disallowed-tools', 'WebFetch,WebSearch']);

      expect(options.disallowedTools).toEqual(['WebFetch', 'WebSearch']);
    });

    it('应处理单个工具', () => {
      const options = parser.parse(['--allowed-tools', 'Read']);

      expect(options.allowedTools).toEqual(['Read']);
    });

    it('应处理带空格的工具列表', () => {
      const options = parser.parse(['--allowed-tools', 'Read, Write, Bash']);

      expect(options.allowedTools).toEqual(['Read', 'Write', 'Bash']);
    });
  });

  describe('权限模式', () => {
    it('应解析 --permission-mode 选项', () => {
      expect(parser.parse(['--permission-mode', 'default']).permissionMode).toBe('default');
      expect(parser.parse(['--permission-mode', 'acceptEdits']).permissionMode).toBe('acceptEdits');
      expect(parser.parse(['--permission-mode', 'bypassPermissions']).permissionMode).toBe('bypassPermissions');
      expect(parser.parse(['--permission-mode', 'plan']).permissionMode).toBe('plan');
    });

    it('应解析 --dangerously-skip-permissions 选项', () => {
      const options = parser.parse(['--dangerously-skip-permissions']);

      expect(options.allowDangerouslySkipPermissions).toBe(true);
    });

    it('无效的权限模式应抛出错误', () => {
      expect(() => parser.parse(['--permission-mode', 'invalid'])).toThrow(CLIParseError);
    });
  });

  describe('输出格式', () => {
    it('应解析 --output-format 选项', () => {
      expect(parser.parse(['--output-format', 'text']).outputFormat).toBe('text');
      expect(parser.parse(['--output-format', 'json']).outputFormat).toBe('json');
      expect(parser.parse(['--output-format', 'stream-json']).outputFormat).toBe('stream-json');
      expect(parser.parse(['--output-format', 'markdown']).outputFormat).toBe('markdown');
    });

    it('应解析 --verbose 选项', () => {
      expect(parser.parse(['--verbose']).verbose).toBe(true);
    });

    it('无效的输出格式应抛出错误', () => {
      expect(() => parser.parse(['--output-format', 'invalid'])).toThrow(CLIParseError);
    });
  });

  describe('扩展选项', () => {
    it('应解析 --agents 选项', () => {
      const agentsJson = '{"reviewer": {"description": "Code reviewer"}}';
      const options = parser.parse(['--agents', agentsJson]);

      expect(options.agents).toBe(agentsJson);
    });

    it('应解析 --plugin-dir 选项', () => {
      const options = parser.parse(['--plugin-dir', '/path/to/plugins']);

      expect(options.pluginDir).toBe('/path/to/plugins');
    });

    it('应解析 --setting-sources 选项', () => {
      const options = parser.parse(['--setting-sources', 'user,project,local']);

      expect(options.settingSources).toEqual(['user', 'project', 'local']);
    });

    it('应处理单个 setting source', () => {
      const options = parser.parse(['--setting-sources', 'project']);

      expect(options.settingSources).toEqual(['project']);
    });
  });

  describe('高级选项', () => {
    it('应解析 --max-turns 选项', () => {
      const options = parser.parse(['--max-turns', '10']);

      expect(options.maxTurns).toBe(10);
    });

    it('应解析 --max-budget-usd 选项', () => {
      const options = parser.parse(['--max-budget-usd', '5.50']);

      expect(options.maxBudgetUsd).toBe(5.50);
    });

    it('应解析 --sandbox 选项', () => {
      const options = parser.parse(['--sandbox']);

      expect(options.sandbox).toBe(true);
    });

    it('--max-turns 非数字应抛出错误', () => {
      expect(() => parser.parse(['--max-turns', 'abc'])).toThrow(CLIParseError);
    });

    it('--max-budget-usd 非数字应抛出错误', () => {
      expect(() => parser.parse(['--max-budget-usd', 'abc'])).toThrow(CLIParseError);
    });
  });

  describe('组合参数', () => {
    it('应正确解析多个参数组合', () => {
      const options = parser.parse([
        '-p', 'test query',
        '--model', 'sonnet',
        '--output-format', 'json',
        '--verbose',
        '--allowed-tools', 'Read,Write',
      ]);

      expect(options.print).toBe(true);
      expect(options.prompt).toBe('test query');
      expect(options.model).toBe('sonnet');
      expect(options.outputFormat).toBe('json');
      expect(options.verbose).toBe(true);
      expect(options.allowedTools).toEqual(['Read', 'Write']);
    });

    it('应正确解析会话恢复参数', () => {
      const options = parser.parse([
        '--resume', 'session-abc',
        '--model', 'haiku',
      ]);

      expect(options.resume).toBe('session-abc');
      expect(options.model).toBe('haiku');
    });

    it('应正确解析权限和工具参数', () => {
      const options = parser.parse([
        '--permission-mode', 'acceptEdits',
        '--allowed-tools', 'Read,Grep',
        '--disallowed-tools', 'Bash',
      ]);

      expect(options.permissionMode).toBe('acceptEdits');
      expect(options.allowedTools).toEqual(['Read', 'Grep']);
      expect(options.disallowedTools).toEqual(['Bash']);
    });
  });

  describe('错误处理', () => {
    it('缺少必需参数值时应抛出错误', () => {
      expect(() => parser.parse(['--model'])).toThrow(CLIParseError);
      expect(() => parser.parse(['--resume'])).toThrow(CLIParseError);
      expect(() => parser.parse(['--output-format'])).toThrow(CLIParseError);
    });

    it('未知选项应抛出错误', () => {
      expect(() => parser.parse(['--unknown-option'])).toThrow(CLIParseError);
    });

    it('错误应包含有用的信息', () => {
      try {
        parser.parse(['--unknown-option']);
      } catch (error) {
        expect(error).toBeInstanceOf(CLIParseError);
        expect((error as CLIParseError).message).toContain('unknown-option');
      }
    });
  });

  describe('帮助信息', () => {
    it('应生成帮助信息', () => {
      const helpText = parser.getHelpText();

      expect(helpText).toContain('claude-replica');
      expect(helpText).toContain('-p, --print');
      expect(helpText).toContain('-c, --continue');
      expect(helpText).toContain('--resume');
      expect(helpText).toContain('--model');
      expect(helpText).toContain('--output-format');
      expect(helpText).toContain('--permission-mode');
    });
  });

  describe('版本信息', () => {
    it('应返回版本号', () => {
      const version = parser.getVersion();

      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});
