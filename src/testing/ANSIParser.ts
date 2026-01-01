/**
 * ANSI 转义序列解析器
 *
 * 提供 ANSI 转义序列的解析、去除和文本提取功能
 * 支持颜色、样式、光标控制等常见 ANSI 序列
 *
 * @module ANSIParser
 */

/**
 * ANSI 样式信息
 */
export interface ANSIStyle {
  /** 粗体 */
  bold?: boolean;
  /** 斜体 */
  italic?: boolean;
  /** 下划线 */
  underline?: boolean;
  /** 闪烁 */
  blink?: boolean;
  /** 反显 */
  inverse?: boolean;
  /** 隐藏 */
  hidden?: boolean;
  /** 删除线 */
  strikethrough?: boolean;
  /** 前景色 */
  foreground?: string;
  /** 背景色 */
  background?: string;
}

/**
 * ANSI Token 类型
 */
export type ANSITokenType = 'text' | 'escape';

/**
 * ANSI Token
 */
export interface ANSIToken {
  /** Token 类型 */
  type: ANSITokenType;
  /** Token 内容 */
  content: string;
  /** 样式信息（仅对 escape 类型有效） */
  style?: ANSIStyle;
  /** 原始转义序列（仅对 escape 类型有效） */
  raw?: string;
}

/**
 * ANSI 转义序列正则表达式
 * 匹配所有常见的 ANSI 转义序列：
 * - CSI (Control Sequence Introducer) 序列: ESC [ ... 最终字符
 * - OSC (Operating System Command) 序列: ESC ] ... ST
 * - 简单转义序列: ESC 后跟单个字符
 */
const ANSI_REGEX =
  // eslint-disable-next-line no-control-regex
  /\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b\][^\x1b]*\x1b\\|\x1b[PX^_][^\x1b]*\x1b\\|\x1b[@-Z\\-_]|\x1b\[[0-9;]*[ -/]*[@-~]/g;

/**
 * SGR (Select Graphic Rendition) 参数到样式的映射
 */
const SGR_STYLES: Record<number, Partial<ANSIStyle>> = {
  0: {}, // 重置
  1: { bold: true },
  2: {}, // 暗淡（不常用）
  3: { italic: true },
  4: { underline: true },
  5: { blink: true },
  7: { inverse: true },
  8: { hidden: true },
  9: { strikethrough: true },
  22: { bold: false },
  23: { italic: false },
  24: { underline: false },
  25: { blink: false },
  27: { inverse: false },
  28: { hidden: false },
  29: { strikethrough: false },
};

/**
 * 基本颜色名称映射
 */
const BASIC_COLORS: Record<number, string> = {
  30: 'black',
  31: 'red',
  32: 'green',
  33: 'yellow',
  34: 'blue',
  35: 'magenta',
  36: 'cyan',
  37: 'white',
  90: 'bright-black',
  91: 'bright-red',
  92: 'bright-green',
  93: 'bright-yellow',
  94: 'bright-blue',
  95: 'bright-magenta',
  96: 'bright-cyan',
  97: 'bright-white',
};

/**
 * 背景颜色偏移量
 */
const BG_OFFSET = 10;

/**
 * ANSI 解析器类
 *
 * 提供 ANSI 转义序列的解析和处理功能
 */
export class ANSIParser {
  /**
   * 去除字符串中的所有 ANSI 转义序列
   *
   * @param text - 包含 ANSI 转义序列的字符串
   * @returns 去除 ANSI 转义序列后的纯文本
   *
   * @example
   * ```typescript
   * const parser = new ANSIParser();
   * const result = parser.strip('\x1b[31mHello\x1b[0m');
   * console.log(result); // 'Hello'
   * ```
   */
  strip(text: string): string {
    if (!text) {
      return '';
    }
    return text.replace(ANSI_REGEX, '');
  }

  /**
   * 解析字符串为 ANSI Token 数组
   *
   * 将输入字符串分解为文本和转义序列的 Token 序列，
   * 保留原始内容和解析后的样式信息
   *
   * @param text - 包含 ANSI 转义序列的字符串
   * @returns ANSI Token 数组
   *
   * @example
   * ```typescript
   * const parser = new ANSIParser();
   * const tokens = parser.parse('\x1b[31mRed\x1b[0m Text');
   * // tokens[0]: { type: 'escape', content: '', style: { foreground: 'red' }, raw: '\x1b[31m' }
   * // tokens[1]: { type: 'text', content: 'Red' }
   * // tokens[2]: { type: 'escape', content: '', style: {}, raw: '\x1b[0m' }
   * // tokens[3]: { type: 'text', content: ' Text' }
   * ```
   */
  parse(text: string): ANSIToken[] {
    if (!text) {
      return [];
    }

    const tokens: ANSIToken[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    // 创建新的正则实例以避免状态问题
    const regex = new RegExp(ANSI_REGEX.source, 'g');

    while ((match = regex.exec(text)) !== null) {
      // 添加转义序列之前的文本
      if (match.index > lastIndex) {
        tokens.push({
          type: 'text',
          content: text.slice(lastIndex, match.index),
        });
      }

      // 解析转义序列
      const escapeSequence = match[0];
      const style = this.parseEscapeSequence(escapeSequence);

      tokens.push({
        type: 'escape',
        content: '',
        style,
        raw: escapeSequence,
      });

      lastIndex = regex.lastIndex;
    }

    // 添加剩余的文本
    if (lastIndex < text.length) {
      tokens.push({
        type: 'text',
        content: text.slice(lastIndex),
      });
    }

    return tokens;
  }

  /**
   * 提取字符串中的纯文本内容
   *
   * 与 strip() 方法类似，但会进行额外的清理：
   * - 去除 ANSI 转义序列
   * - 规范化换行符
   * - 去除控制字符
   *
   * @param text - 包含 ANSI 转义序列的字符串
   * @returns 提取的纯文本
   *
   * @example
   * ```typescript
   * const parser = new ANSIParser();
   * const result = parser.extractText('\x1b[31mHello\x1b[0m\r\nWorld');
   * console.log(result); // 'Hello\nWorld'
   * ```
   */
  extractText(text: string): string {
    if (!text) {
      return '';
    }

    // 先去除 ANSI 转义序列
    let result = this.strip(text);

    // 规范化换行符（将 \r\n 转换为 \n）
    result = result.replace(/\r\n/g, '\n');

    // 去除单独的 \r（回车符）
    result = result.replace(/\r/g, '');

    // 去除其他控制字符（保留换行和制表符）
    // eslint-disable-next-line no-control-regex
    result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    return result;
  }

  /**
   * 检查字符串是否包含 ANSI 转义序列
   *
   * @param text - 要检查的字符串
   * @returns 如果包含 ANSI 转义序列则返回 true
   */
  hasAnsi(text: string): boolean {
    if (!text) {
      return false;
    }
    // 创建新的正则实例以避免状态问题
    const regex = new RegExp(ANSI_REGEX.source, 'g');
    return regex.test(text);
  }

  /**
   * 解析单个 ANSI 转义序列
   *
   * @param sequence - ANSI 转义序列
   * @returns 解析后的样式信息
   */
  private parseEscapeSequence(sequence: string): ANSIStyle {
    const style: ANSIStyle = {};

    // 检查是否是 CSI SGR 序列 (ESC [ ... m)
    const sgrMatch = sequence.match(/\x1b\[([0-9;]*)m/);
    if (!sgrMatch) {
      return style;
    }

    const params = sgrMatch[1].split(';').map((p) => (p === '' ? 0 : parseInt(p, 10)));

    let i = 0;
    while (i < params.length) {
      const param = params[i];

      // 重置
      if (param === 0) {
        // 返回空样式表示重置
        i++;
        continue;
      }

      // 基本样式
      if (SGR_STYLES[param] !== undefined) {
        Object.assign(style, SGR_STYLES[param]);
        i++;
        continue;
      }

      // 前景色（30-37, 90-97）
      if (BASIC_COLORS[param]) {
        style.foreground = BASIC_COLORS[param];
        i++;
        continue;
      }

      // 背景色（40-47, 100-107）
      if (BASIC_COLORS[param - BG_OFFSET]) {
        style.background = BASIC_COLORS[param - BG_OFFSET];
        i++;
        continue;
      }

      // 256 色前景色 (38;5;n)
      if (param === 38 && params[i + 1] === 5 && params[i + 2] !== undefined) {
        style.foreground = `color-${params[i + 2]}`;
        i += 3;
        continue;
      }

      // 256 色背景色 (48;5;n)
      if (param === 48 && params[i + 1] === 5 && params[i + 2] !== undefined) {
        style.background = `color-${params[i + 2]}`;
        i += 3;
        continue;
      }

      // RGB 前景色 (38;2;r;g;b)
      if (
        param === 38 &&
        params[i + 1] === 2 &&
        params[i + 2] !== undefined &&
        params[i + 3] !== undefined &&
        params[i + 4] !== undefined
      ) {
        style.foreground = `rgb(${params[i + 2]},${params[i + 3]},${params[i + 4]})`;
        i += 5;
        continue;
      }

      // RGB 背景色 (48;2;r;g;b)
      if (
        param === 48 &&
        params[i + 1] === 2 &&
        params[i + 2] !== undefined &&
        params[i + 3] !== undefined &&
        params[i + 4] !== undefined
      ) {
        style.background = `rgb(${params[i + 2]},${params[i + 3]},${params[i + 4]})`;
        i += 5;
        continue;
      }

      // 默认前景色 (39)
      if (param === 39) {
        style.foreground = undefined;
        i++;
        continue;
      }

      // 默认背景色 (49)
      if (param === 49) {
        style.background = undefined;
        i++;
        continue;
      }

      // 未知参数，跳过
      i++;
    }

    return style;
  }
}

/**
 * 创建 ANSIParser 实例的工厂函数
 *
 * @returns 新的 ANSIParser 实例
 */
export function createANSIParser(): ANSIParser {
  return new ANSIParser();
}
