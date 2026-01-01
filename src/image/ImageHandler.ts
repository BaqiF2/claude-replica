/**
 * 图像处理器
 *
 * 负责处理图像的加载、编码、大小调整和格式验证
 * 支持 PNG、JPEG、GIF、WebP 格式
 * 支持 @./image.png 语法、粘贴和拖放
 *
 * @module ImageHandler
 * **验证: 需求 16.1, 16.2, 16.3, 16.4, 16.5, 16.6**
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 支持的图像格式
 */
export const SUPPORTED_IMAGE_FORMATS = ['png', 'jpeg', 'jpg', 'gif', 'webp'] as const;

/**
 * 图像格式类型
 */
export type ImageFormat = (typeof SUPPORTED_IMAGE_FORMATS)[number];

/**
 * 图像 MIME 类型映射
 */
export const IMAGE_MIME_TYPES: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/**
 * 图像魔数（文件头签名）
 */
const IMAGE_MAGIC_NUMBERS: Record<string, Buffer[]> = {
  png: [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  jpeg: [Buffer.from([0xff, 0xd8, 0xff])],
  gif: [
    Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]),
    Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
  ],
  webp: [Buffer.from([0x52, 0x49, 0x46, 0x46])], // RIFF header, need to check WEBP at offset 8
};

/**
 * API 图像大小限制（字节）
 * Claude API 限制单个图像最大 20MB
 */
export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;

/**
 * 推荐的最大图像尺寸（像素）
 * 超过此尺寸的图像将被调整大小
 */
export const MAX_IMAGE_DIMENSION = 4096;

/**
 * 图像数据接口
 */
export interface ImageData {
  /** Base64 编码的图像数据 */
  data: string;
  /** MIME 类型 */
  mimeType: string;
  /** 原始文件路径（如果有） */
  sourcePath?: string;
  /** 原始文件大小（字节） */
  originalSize: number;
  /** 图像格式 */
  format: ImageFormat;
}

/**
 * 图像内容块（用于消息）
 */
export interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

/**
 * 图像处理选项
 */
export interface ImageProcessOptions {
  /** 最大文件大小（字节） */
  maxSize?: number;
  /** 最大尺寸（像素） */
  maxDimension?: number;
  /** 是否验证格式 */
  validateFormat?: boolean;
}

/**
 * 图像处理错误
 */
export class ImageError extends Error {
  constructor(
    message: string,
    public readonly code: ImageErrorCode
  ) {
    super(message);
    this.name = 'ImageError';
  }
}

/**
 * 图像错误代码
 */
export enum ImageErrorCode {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_IMAGE = 'INVALID_IMAGE',
  READ_ERROR = 'READ_ERROR',
  ENCODE_ERROR = 'ENCODE_ERROR',
}

/**
 * 图像处理器类
 *
 * 提供图像加载、编码、验证和格式转换功能
 */
export class ImageHandler {
  /** 工作目录 */
  private readonly workingDirectory: string;
  /** 处理选项 */
  private readonly options: Required<ImageProcessOptions>;

  constructor(workingDirectory: string, options: ImageProcessOptions = {}) {
    this.workingDirectory = workingDirectory;
    this.options = {
      maxSize: options.maxSize ?? MAX_IMAGE_SIZE_BYTES,
      maxDimension: options.maxDimension ?? MAX_IMAGE_DIMENSION,
      validateFormat: options.validateFormat ?? true,
    };
  }

  /**
   * 从文件路径加载图像
   *
   * @param filePath - 图像文件路径（相对或绝对）
   * @returns 图像数据
   * @throws ImageError 如果文件不存在、格式不支持或文件过大
   */
  async loadFromFile(filePath: string): Promise<ImageData> {
    // 解析路径
    const absolutePath = this.resolvePath(filePath);

    // 检查文件是否存在
    try {
      await fs.access(absolutePath);
    } catch {
      throw new ImageError(`图像文件不存在: ${filePath}`, ImageErrorCode.FILE_NOT_FOUND);
    }

    // 读取文件
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(absolutePath);
    } catch (error) {
      throw new ImageError(
        `无法读取图像文件: ${filePath} - ${error instanceof Error ? error.message : '未知错误'}`,
        ImageErrorCode.READ_ERROR
      );
    }

    // 检查文件大小
    if (buffer.length > this.options.maxSize) {
      throw new ImageError(
        `图像文件过大: ${this.formatSize(buffer.length)}，最大允许 ${this.formatSize(this.options.maxSize)}`,
        ImageErrorCode.FILE_TOO_LARGE
      );
    }

    // 检测格式
    const format = this.detectFormat(buffer, filePath);
    if (!format) {
      throw new ImageError(
        `不支持的图像格式。支持的格式: ${SUPPORTED_IMAGE_FORMATS.join(', ')}`,
        ImageErrorCode.UNSUPPORTED_FORMAT
      );
    }

    // 验证图像格式
    if (this.options.validateFormat && !this.validateImageData(buffer, format)) {
      throw new ImageError(`无效的图像数据: ${filePath}`, ImageErrorCode.INVALID_IMAGE);
    }

    // 编码为 Base64
    const data = buffer.toString('base64');
    const mimeType = IMAGE_MIME_TYPES[format];

    return {
      data,
      mimeType,
      sourcePath: absolutePath,
      originalSize: buffer.length,
      format,
    };
  }

  /**
   * 从 Base64 数据加载图像
   *
   * @param base64Data - Base64 编码的图像数据
   * @param mimeType - MIME 类型（可选，将自动检测）
   * @returns 图像数据
   */
  loadFromBase64(base64Data: string, mimeType?: string): ImageData {
    // 移除可能的 data URL 前缀
    const cleanData = this.stripDataUrlPrefix(base64Data);

    // 解码 Base64
    let buffer: Buffer;
    try {
      buffer = Buffer.from(cleanData, 'base64');
    } catch {
      throw new ImageError('无效的 Base64 数据', ImageErrorCode.ENCODE_ERROR);
    }

    // 检查大小
    if (buffer.length > this.options.maxSize) {
      throw new ImageError(
        `图像数据过大: ${this.formatSize(buffer.length)}，最大允许 ${this.formatSize(this.options.maxSize)}`,
        ImageErrorCode.FILE_TOO_LARGE
      );
    }

    // 检测格式
    const format = this.detectFormatFromBuffer(buffer);
    if (!format) {
      throw new ImageError(
        `不支持的图像格式。支持的格式: ${SUPPORTED_IMAGE_FORMATS.join(', ')}`,
        ImageErrorCode.UNSUPPORTED_FORMAT
      );
    }

    const detectedMimeType = mimeType || IMAGE_MIME_TYPES[format];

    return {
      data: cleanData,
      mimeType: detectedMimeType,
      originalSize: buffer.length,
      format,
    };
  }

  /**
   * 解析 @ 语法引用的图像
   *
   * 支持的语法:
   * - @./image.png - 相对路径
   * - @/path/to/image.png - 绝对路径
   * - @image.png - 当前目录
   *
   * @param reference - 图像引用字符串
   * @returns 图像数据，如果不是图像引用则返回 null
   */
  async parseImageReference(reference: string): Promise<ImageData | null> {
    // 检查是否是 @ 语法
    if (!reference.startsWith('@')) {
      return null;
    }

    // 提取路径
    const filePath = reference.slice(1).trim();

    // 检查是否是图像文件
    if (!this.isImagePath(filePath)) {
      return null;
    }

    return this.loadFromFile(filePath);
  }

  /**
   * 从文本中提取所有图像引用
   *
   * @param text - 输入文本
   * @returns 图像引用列表
   */
  extractImageReferences(text: string): string[] {
    const references: string[] = [];
    // 匹配 @./path/to/image.ext 或 @path/to/image.ext
    const regex = /@(\.?\/)?[\w\-./]+\.(png|jpe?g|gif|webp)/gi;
    let match;

    while ((match = regex.exec(text)) !== null) {
      references.push(match[0]);
    }

    return references;
  }

  /**
   * 处理文本中的图像引用，返回处理后的文本和图像数据
   *
   * @param text - 输入文本
   * @returns 处理结果，包含清理后的文本和图像数据
   */
  async processTextWithImages(text: string): Promise<{
    text: string;
    images: ImageData[];
    errors: Array<{ reference: string; error: string }>;
  }> {
    const references = this.extractImageReferences(text);
    const images: ImageData[] = [];
    const errors: Array<{ reference: string; error: string }> = [];
    let processedText = text;

    for (const reference of references) {
      try {
        const imageData = await this.parseImageReference(reference);
        if (imageData) {
          images.push(imageData);
          // 从文本中移除图像引用
          processedText = processedText.replace(reference, '').trim();
        }
      } catch (error) {
        errors.push({
          reference,
          error: error instanceof Error ? error.message : '未知错误',
        });
      }
    }

    // 清理多余的空白
    processedText = processedText.replace(/\s+/g, ' ').trim();

    return { text: processedText, images, errors };
  }

  /**
   * 将图像数据转换为消息内容块
   *
   * @param imageData - 图像数据
   * @returns 图像内容块
   */
  toContentBlock(imageData: ImageData): ImageContentBlock {
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: imageData.mimeType,
        data: imageData.data,
      },
    };
  }

  /**
   * 将多个图像数据转换为消息内容块数组
   *
   * @param images - 图像数据数组
   * @returns 图像内容块数组
   */
  toContentBlocks(images: ImageData[]): ImageContentBlock[] {
    return images.map((img) => this.toContentBlock(img));
  }

  /**
   * 检查路径是否是图像文件
   *
   * @param filePath - 文件路径
   * @returns 是否是图像文件
   */
  isImagePath(filePath: string): boolean {
    const ext = this.getExtension(filePath);
    return SUPPORTED_IMAGE_FORMATS.includes(ext as ImageFormat);
  }

  /**
   * 检查 MIME 类型是否是支持的图像类型
   *
   * @param mimeType - MIME 类型
   * @returns 是否是支持的图像类型
   */
  isSupportedMimeType(mimeType: string): boolean {
    return Object.values(IMAGE_MIME_TYPES).includes(mimeType);
  }

  /**
   * 获取支持的图像格式列表
   */
  getSupportedFormats(): readonly string[] {
    return SUPPORTED_IMAGE_FORMATS;
  }

  /**
   * 获取图像格式的 MIME 类型
   *
   * @param format - 图像格式
   * @returns MIME 类型
   */
  getMimeType(format: ImageFormat): string {
    return IMAGE_MIME_TYPES[format];
  }

  /**
   * 解析文件路径
   */
  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(this.workingDirectory, filePath);
  }

  /**
   * 获取文件扩展名（小写）
   */
  private getExtension(filePath: string): string {
    return path.extname(filePath).slice(1).toLowerCase();
  }

  /**
   * 检测图像格式
   *
   * @param buffer - 图像数据
   * @param filePath - 文件路径（用于扩展名检测）
   * @returns 图像格式，如果无法检测则返回 null
   */
  private detectFormat(buffer: Buffer, filePath?: string): ImageFormat | null {
    // 首先尝试从文件头检测
    const formatFromBuffer = this.detectFormatFromBuffer(buffer);
    if (formatFromBuffer) {
      return formatFromBuffer;
    }

    // 如果无法从文件头检测，尝试从扩展名检测
    if (filePath) {
      const ext = this.getExtension(filePath);
      if (SUPPORTED_IMAGE_FORMATS.includes(ext as ImageFormat)) {
        return ext as ImageFormat;
      }
    }

    return null;
  }

  /**
   * 从 Buffer 检测图像格式
   */
  private detectFormatFromBuffer(buffer: Buffer): ImageFormat | null {
    // PNG
    if (this.matchMagicNumber(buffer, IMAGE_MAGIC_NUMBERS.png)) {
      return 'png';
    }

    // JPEG
    if (this.matchMagicNumber(buffer, IMAGE_MAGIC_NUMBERS.jpeg)) {
      return 'jpeg';
    }

    // GIF
    if (this.matchMagicNumber(buffer, IMAGE_MAGIC_NUMBERS.gif)) {
      return 'gif';
    }

    // WebP (RIFF....WEBP)
    if (
      this.matchMagicNumber(buffer, IMAGE_MAGIC_NUMBERS.webp) &&
      buffer.length >= 12 &&
      buffer.slice(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'webp';
    }

    return null;
  }

  /**
   * 匹配魔数
   */
  private matchMagicNumber(buffer: Buffer, magicNumbers: Buffer[]): boolean {
    return magicNumbers.some((magic) => {
      if (buffer.length < magic.length) {
        return false;
      }
      return buffer.slice(0, magic.length).equals(magic);
    });
  }

  /**
   * 验证图像数据
   */
  private validateImageData(buffer: Buffer, format: ImageFormat): boolean {
    // 基本验证：检查文件头
    switch (format) {
      case 'png':
        return this.matchMagicNumber(buffer, IMAGE_MAGIC_NUMBERS.png);
      case 'jpeg':
      case 'jpg':
        return this.matchMagicNumber(buffer, IMAGE_MAGIC_NUMBERS.jpeg);
      case 'gif':
        return this.matchMagicNumber(buffer, IMAGE_MAGIC_NUMBERS.gif);
      case 'webp':
        return (
          this.matchMagicNumber(buffer, IMAGE_MAGIC_NUMBERS.webp) &&
          buffer.length >= 12 &&
          buffer.slice(8, 12).toString('ascii') === 'WEBP'
        );
      default:
        return false;
    }
  }

  /**
   * 移除 Data URL 前缀
   */
  private stripDataUrlPrefix(data: string): string {
    const match = data.match(/^data:image\/[^;]+;base64,(.+)$/);
    return match ? match[1] : data;
  }

  /**
   * 格式化文件大小
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  }
}
