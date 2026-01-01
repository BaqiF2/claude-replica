/**
 * ANSI 解析器单元测试
 *
 * 测试 ANSIParser 类的核心功能
 * 包括常见 ANSI 序列、边界情况等
 *
 * _Requirements: 1.4_
 */

import { ANSIParser, createANSIParser } from '../../src/testing/ANSIParser';

describe('ANSIParser', () => {
  let parser: ANSIParser;

  beforeEach(() => {
    parser = new ANSIParser();
  });

  describe('strip()', () => {
    describe('颜色序列', () => {
      it('应该去除前景色序列', () => {
        expect(parser.strip('\x1b[31mRed Text\x1b[0m')).toBe('Red Text');
        expect(parser.strip('\x1b[32mGreen\x1b[0m')).toBe('Green');
        expect(parser.strip('\x1b[33mYellow\x1b[0m')).toBe('Yellow');
        expect(parser.strip('\x1b[34mBlue\x1b[0m')).toBe('Blue');
      });

      it('应该去除背景色序列', () => {
        expect(parser.strip('\x1b[41mRed BG\x1b[0m')).toBe('Red BG');
        expect(parser.strip('\x1b[42mGreen BG\x1b[0m')).toBe('Green BG');
      });

      it('应该去除 256 色序列', () => {
        expect(parser.strip('\x1b[38;5;196mColor 196\x1b[0m')).toBe('Color 196');
        expect(parser.strip('\x1b[48;5;21mBG 21\x1b[0m')).toBe('BG 21');
      });

      it('应该去除 RGB 颜色序列', () => {
        expect(parser.strip('\x1b[38;2;255;0;0mRGB Red\x1b[0m')).toBe('RGB Red');
        expect(parser.strip('\x1b[48;2;0;255;0mRGB Green BG\x1b[0m')).toBe('RGB Green BG');
      });

      it('应该去除亮色序列', () => {
        expect(parser.strip('\x1b[91mBright Red\x1b[0m')).toBe('Bright Red');
        expect(parser.strip('\x1b[97mBright White\x1b[0m')).toBe('Bright White');
      });
    });

    describe('样式序列', () => {
      it('应该去除粗体序列', () => {
        expect(parser.strip('\x1b[1mBold\x1b[0m')).toBe('Bold');
        expect(parser.strip('\x1b[1mBold\x1b[22mNormal')).toBe('BoldNormal');
      });

      it('应该去除斜体序列', () => {
        expect(parser.strip('\x1b[3mItalic\x1b[0m')).toBe('Italic');
      });

      it('应该去除下划线序列', () => {
        expect(parser.strip('\x1b[4mUnderline\x1b[0m')).toBe('Underline');
      });

      it('应该去除闪烁序列', () => {
        expect(parser.strip('\x1b[5mBlink\x1b[0m')).toBe('Blink');
      });

      it('应该去除反显序列', () => {
        expect(parser.strip('\x1b[7mInverse\x1b[0m')).toBe('Inverse');
      });

      it('应该去除删除线序列', () => {
        expect(parser.strip('\x1b[9mStrikethrough\x1b[0m')).toBe('Strikethrough');
      });

      it('应该去除组合样式序列', () => {
        expect(parser.strip('\x1b[1;31;4mBold Red Underline\x1b[0m')).toBe('Bold Red Underline');
      });
    });

    describe('光标控制序列', () => {
      it('应该去除光标移动序列', () => {
        expect(parser.strip('\x1b[5AUp 5')).toBe('Up 5');
        expect(parser.strip('\x1b[3BDown 3')).toBe('Down 3');
        expect(parser.strip('\x1b[10CRight 10')).toBe('Right 10');
        expect(parser.strip('\x1b[2DLeft 2')).toBe('Left 2');
      });

      it('应该去除光标定位序列', () => {
        expect(parser.strip('\x1b[10;20HPosition')).toBe('Position');
        expect(parser.strip('\x1b[1;1HHome')).toBe('Home');
      });

      it('应该去除清屏序列', () => {
        expect(parser.strip('\x1b[2JClear Screen')).toBe('Clear Screen');
        expect(parser.strip('\x1b[KClear Line')).toBe('Clear Line');
      });
    });

    describe('边界情况', () => {
      it('应该处理空字符串', () => {
        expect(parser.strip('')).toBe('');
      });

      it('应该处理 null/undefined', () => {
        expect(parser.strip(null as unknown as string)).toBe('');
        expect(parser.strip(undefined as unknown as string)).toBe('');
      });

      it('应该处理无 ANSI 的纯文本', () => {
        expect(parser.strip('Hello World')).toBe('Hello World');
        expect(parser.strip('No ANSI here!')).toBe('No ANSI here!');
      });

      it('应该处理纯 ANSI 序列（无文本）', () => {
        expect(parser.strip('\x1b[31m\x1b[0m')).toBe('');
        expect(parser.strip('\x1b[1;2;3;4m')).toBe('');
      });

      it('应该处理连续的 ANSI 序列', () => {
        expect(parser.strip('\x1b[31m\x1b[1m\x1b[4mText\x1b[0m')).toBe('Text');
      });

      it('应该处理多行文本', () => {
        const input = '\x1b[31mLine 1\x1b[0m\n\x1b[32mLine 2\x1b[0m';
        expect(parser.strip(input)).toBe('Line 1\nLine 2');
      });

      it('应该保留特殊字符', () => {
        expect(parser.strip('\x1b[31m你好世界\x1b[0m')).toBe('你好世界');
        expect(parser.strip('\x1b[31m🎉 Emoji\x1b[0m')).toBe('🎉 Emoji');
      });
    });
  });

  describe('parse()', () => {
    it('应该解析简单的颜色序列', () => {
      const tokens = parser.parse('\x1b[31mRed\x1b[0m');

      expect(tokens).toHaveLength(3);
      expect(tokens[0].type).toBe('escape');
      expect(tokens[0].style?.foreground).toBe('red');
      expect(tokens[1].type).toBe('text');
      expect(tokens[1].content).toBe('Red');
      expect(tokens[2].type).toBe('escape');
    });

    it('应该解析粗体样式', () => {
      const tokens = parser.parse('\x1b[1mBold\x1b[0m');

      expect(tokens[0].style?.bold).toBe(true);
    });

    it('应该解析组合样式', () => {
      const tokens = parser.parse('\x1b[1;31;4mStyled\x1b[0m');

      expect(tokens[0].style?.bold).toBe(true);
      expect(tokens[0].style?.foreground).toBe('red');
      expect(tokens[0].style?.underline).toBe(true);
    });

    it('应该解析 256 色', () => {
      const tokens = parser.parse('\x1b[38;5;196mColor\x1b[0m');

      expect(tokens[0].style?.foreground).toBe('color-196');
    });

    it('应该解析 RGB 颜色', () => {
      const tokens = parser.parse('\x1b[38;2;255;128;0mOrange\x1b[0m');

      expect(tokens[0].style?.foreground).toBe('rgb(255,128,0)');
    });

    it('应该处理空字符串', () => {
      expect(parser.parse('')).toEqual([]);
    });

    it('应该处理纯文本', () => {
      const tokens = parser.parse('Plain text');

      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe('text');
      expect(tokens[0].content).toBe('Plain text');
    });

    it('应该保留原始转义序列', () => {
      const tokens = parser.parse('\x1b[31mRed\x1b[0m');

      expect(tokens[0].raw).toBe('\x1b[31m');
      expect(tokens[2].raw).toBe('\x1b[0m');
    });
  });

  describe('extractText()', () => {
    it('应该提取纯文本', () => {
      expect(parser.extractText('\x1b[31mHello\x1b[0m World')).toBe('Hello World');
    });

    it('应该规范化换行符', () => {
      expect(parser.extractText('Line1\r\nLine2')).toBe('Line1\nLine2');
      expect(parser.extractText('Line1\rLine2')).toBe('Line1Line2');
    });

    it('应该去除控制字符', () => {
      expect(parser.extractText('Hello\x00World')).toBe('HelloWorld');
      expect(parser.extractText('Tab\tOK')).toBe('Tab\tOK'); // 保留制表符
    });

    it('应该处理空字符串', () => {
      expect(parser.extractText('')).toBe('');
    });

    it('应该处理复杂的混合内容', () => {
      const input = '\x1b[1;31mError:\x1b[0m File not found\r\n\x1b[33mWarning:\x1b[0m Check path';
      expect(parser.extractText(input)).toBe('Error: File not found\nWarning: Check path');
    });
  });

  describe('hasAnsi()', () => {
    it('应该检测 ANSI 序列', () => {
      expect(parser.hasAnsi('\x1b[31mRed\x1b[0m')).toBe(true);
      expect(parser.hasAnsi('\x1b[1mBold')).toBe(true);
      expect(parser.hasAnsi('\x1b[2J')).toBe(true);
    });

    it('应该对纯文本返回 false', () => {
      expect(parser.hasAnsi('Plain text')).toBe(false);
      expect(parser.hasAnsi('No ANSI here')).toBe(false);
    });

    it('应该处理空字符串', () => {
      expect(parser.hasAnsi('')).toBe(false);
    });

    it('应该处理 null/undefined', () => {
      expect(parser.hasAnsi(null as unknown as string)).toBe(false);
      expect(parser.hasAnsi(undefined as unknown as string)).toBe(false);
    });

    it('应该检测单独的重置序列', () => {
      expect(parser.hasAnsi('\x1b[0m')).toBe(true);
    });
  });

  describe('createANSIParser()', () => {
    it('应该创建 ANSIParser 实例', () => {
      const instance = createANSIParser();
      expect(instance).toBeInstanceOf(ANSIParser);
    });

    it('创建的实例应该正常工作', () => {
      const instance = createANSIParser();
      expect(instance.strip('\x1b[31mTest\x1b[0m')).toBe('Test');
    });
  });
});
