/**
 * ImageHandler 单元测试
 *
 * 测试图像处理器的核心功能：
 * - 图像文件加载
 * - Base64 编码/解码
 * - @ 语法解析
 * - 格式检测和验证
 * - 错误处理
 *
 * @module ImageHandler.test
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  ImageHandler,
  ImageError,
  ImageErrorCode,
  SUPPORTED_IMAGE_FORMATS,
  IMAGE_MIME_TYPES,
  MAX_IMAGE_SIZE_BYTES,
} from '../../src/image/ImageHandler';

describe('ImageHandler', () => {
  let testDir: string;
  let handler: ImageHandler;

  // 创建测试用的图像数据
  // PNG 文件头 (最小有效 PNG)
  const PNG_HEADER = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG 签名
    0x00, 0x00, 0x00, 0x0d, // IHDR 长度
    0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, // 宽度 1
    0x00, 0x00, 0x00, 0x01, // 高度 1
    0x08, 0x02, // 位深度 8, 颜色类型 RGB
    0x00, 0x00, 0x00, // 压缩、过滤、隔行
    0x90, 0x77, 0x53, 0xde, // CRC
  ]);

  // JPEG 文件头
  const JPEG_HEADER = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, // SOI + APP0
    0x00, 0x10, // 长度
    0x4a, 0x46, 0x49, 0x46, 0x00, // JFIF
    0x01, 0x01, // 版本
    0x00, // 单位
    0x00, 0x01, // X 密度
    0x00, 0x01, // Y 密度
    0x00, 0x00, // 缩略图
  ]);

  // GIF 文件头 (GIF89a)
  const GIF_HEADER = Buffer.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
    0x01, 0x00, // 宽度 1
    0x01, 0x00, // 高度 1
    0x00, // 全局颜色表标志
    0x00, // 背景色索引
    0x00, // 像素宽高比
  ]);

  // WebP 文件头
  const WEBP_HEADER = Buffer.from([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x24, 0x00, 0x00, 0x00, // 文件大小
    0x57, 0x45, 0x42, 0x50, // WEBP
    0x56, 0x50, 0x38, 0x20, // VP8
    0x18, 0x00, 0x00, 0x00, // 块大小
    0x30, 0x01, 0x00, 0x9d, // VP8 数据
    0x01, 0x2a, 0x01, 0x00,
    0x01, 0x00, 0x02, 0x00,
    0x34, 0x25, 0xa4, 0x00,
    0x03, 0x70, 0x00, 0xfe,
    0xfb, 0x94, 0x00, 0x00,
  ]);

  beforeAll(async () => {
    // 创建临时测试目录
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-handler-test-'));
    handler = new ImageHandler(testDir);
  });

  afterAll(async () => {
    // 清理测试目录
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('构造函数', () => {
    it('应该使用默认选项创建实例', () => {
      const h = new ImageHandler('/test');
      expect(h).toBeInstanceOf(ImageHandler);
    });

    it('应该接受自定义选项', () => {
      const h = new ImageHandler('/test', {
        maxSize: 1024,
        maxDimension: 100,
        validateFormat: false,
      });
      expect(h).toBeInstanceOf(ImageHandler);
    });
  });

  describe('loadFromFile', () => {
    it('应该成功加载 PNG 图像', async () => {
      const filePath = path.join(testDir, 'test.png');
      await fs.writeFile(filePath, PNG_HEADER);

      const result = await handler.loadFromFile('test.png');

      expect(result.format).toBe('png');
      expect(result.mimeType).toBe('image/png');
      expect(result.sourcePath).toBe(filePath);
      expect(result.originalSize).toBe(PNG_HEADER.length);
      expect(result.data).toBe(PNG_HEADER.toString('base64'));
    });

    it('应该成功加载 JPEG 图像', async () => {
      const filePath = path.join(testDir, 'test.jpg');
      await fs.writeFile(filePath, JPEG_HEADER);

      const result = await handler.loadFromFile('test.jpg');

      expect(result.format).toBe('jpeg');
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('应该成功加载 GIF 图像', async () => {
      const filePath = path.join(testDir, 'test.gif');
      await fs.writeFile(filePath, GIF_HEADER);

      const result = await handler.loadFromFile('test.gif');

      expect(result.format).toBe('gif');
      expect(result.mimeType).toBe('image/gif');
    });

    it('应该成功加载 WebP 图像', async () => {
      const filePath = path.join(testDir, 'test.webp');
      await fs.writeFile(filePath, WEBP_HEADER);

      const result = await handler.loadFromFile('test.webp');

      expect(result.format).toBe('webp');
      expect(result.mimeType).toBe('image/webp');
    });

    it('应该处理绝对路径', async () => {
      const filePath = path.join(testDir, 'absolute.png');
      await fs.writeFile(filePath, PNG_HEADER);

      const result = await handler.loadFromFile(filePath);

      expect(result.sourcePath).toBe(filePath);
    });

    it('应该在文件不存在时抛出错误', async () => {
      await expect(handler.loadFromFile('nonexistent.png')).rejects.toThrow(ImageError);
      await expect(handler.loadFromFile('nonexistent.png')).rejects.toMatchObject({
        code: ImageErrorCode.FILE_NOT_FOUND,
      });
    });

    it('应该在格式不支持时抛出错误', async () => {
      const filePath = path.join(testDir, 'test.txt');
      await fs.writeFile(filePath, 'not an image');

      await expect(handler.loadFromFile('test.txt')).rejects.toThrow(ImageError);
      await expect(handler.loadFromFile('test.txt')).rejects.toMatchObject({
        code: ImageErrorCode.UNSUPPORTED_FORMAT,
      });
    });

    it('应该在文件过大时抛出错误', async () => {
      const smallHandler = new ImageHandler(testDir, { maxSize: 10 });
      const filePath = path.join(testDir, 'large.png');
      await fs.writeFile(filePath, PNG_HEADER);

      await expect(smallHandler.loadFromFile('large.png')).rejects.toThrow(ImageError);
      await expect(smallHandler.loadFromFile('large.png')).rejects.toMatchObject({
        code: ImageErrorCode.FILE_TOO_LARGE,
      });
    });
  });

  describe('loadFromBase64', () => {
    it('应该成功加载 Base64 编码的 PNG', () => {
      const base64 = PNG_HEADER.toString('base64');

      const result = handler.loadFromBase64(base64);

      expect(result.format).toBe('png');
      expect(result.mimeType).toBe('image/png');
      expect(result.data).toBe(base64);
    });

    it('应该处理 Data URL 格式', () => {
      const base64 = PNG_HEADER.toString('base64');
      const dataUrl = `data:image/png;base64,${base64}`;

      const result = handler.loadFromBase64(dataUrl);

      expect(result.format).toBe('png');
      expect(result.data).toBe(base64);
    });

    it('应该接受自定义 MIME 类型', () => {
      const base64 = PNG_HEADER.toString('base64');

      const result = handler.loadFromBase64(base64, 'image/custom');

      expect(result.mimeType).toBe('image/custom');
    });

    it('应该在格式不支持时抛出错误', () => {
      const invalidData = Buffer.from('not an image').toString('base64');

      expect(() => handler.loadFromBase64(invalidData)).toThrow(ImageError);
    });
  });

  describe('parseImageReference', () => {
    beforeAll(async () => {
      // 创建测试图像
      await fs.writeFile(path.join(testDir, 'ref.png'), PNG_HEADER);
      await fs.mkdir(path.join(testDir, 'subdir'), { recursive: true });
      await fs.writeFile(path.join(testDir, 'subdir', 'nested.png'), PNG_HEADER);
    });

    it('应该解析 @./image.png 语法', async () => {
      const result = await handler.parseImageReference('@./ref.png');

      expect(result).not.toBeNull();
      expect(result!.format).toBe('png');
    });

    it('应该解析 @image.png 语法', async () => {
      const result = await handler.parseImageReference('@ref.png');

      expect(result).not.toBeNull();
      expect(result!.format).toBe('png');
    });

    it('应该解析嵌套路径', async () => {
      const result = await handler.parseImageReference('@./subdir/nested.png');

      expect(result).not.toBeNull();
      expect(result!.format).toBe('png');
    });

    it('应该对非 @ 语法返回 null', async () => {
      const result = await handler.parseImageReference('ref.png');

      expect(result).toBeNull();
    });

    it('应该对非图像文件返回 null', async () => {
      const result = await handler.parseImageReference('@./test.txt');

      expect(result).toBeNull();
    });
  });

  describe('extractImageReferences', () => {
    it('应该提取单个图像引用', () => {
      const text = '请分析这张图片 @./screenshot.png';

      const refs = handler.extractImageReferences(text);

      expect(refs).toEqual(['@./screenshot.png']);
    });

    it('应该提取多个图像引用', () => {
      const text = '比较 @./before.png 和 @./after.jpg 的差异';

      const refs = handler.extractImageReferences(text);

      expect(refs).toHaveLength(2);
      expect(refs).toContain('@./before.png');
      expect(refs).toContain('@./after.jpg');
    });

    it('应该支持所有图像格式', () => {
      const text = '@a.png @b.jpg @c.jpeg @d.gif @e.webp';

      const refs = handler.extractImageReferences(text);

      expect(refs).toHaveLength(5);
    });

    it('应该处理嵌套路径', () => {
      const text = '查看 @./images/ui/button.png';

      const refs = handler.extractImageReferences(text);

      expect(refs).toEqual(['@./images/ui/button.png']);
    });

    it('应该在没有引用时返回空数组', () => {
      const text = '这是一段普通文本';

      const refs = handler.extractImageReferences(text);

      expect(refs).toEqual([]);
    });
  });

  describe('processTextWithImages', () => {
    beforeAll(async () => {
      await fs.writeFile(path.join(testDir, 'process.png'), PNG_HEADER);
    });

    it('应该处理包含图像引用的文本', async () => {
      const text = '请分析 @./process.png 这张图片';

      const result = await handler.processTextWithImages(text);

      expect(result.images).toHaveLength(1);
      expect(result.images[0].format).toBe('png');
      expect(result.text).toBe('请分析 这张图片');
    });

    it('应该收集加载错误', async () => {
      const text = '查看 @./nonexistent.png';

      const result = await handler.processTextWithImages(text);

      expect(result.images).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].reference).toBe('@./nonexistent.png');
    });

    it('应该处理没有图像引用的文本', async () => {
      const text = '这是普通文本';

      const result = await handler.processTextWithImages(text);

      expect(result.images).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.text).toBe('这是普通文本');
    });
  });

  describe('toContentBlock', () => {
    it('应该转换为正确的内容块格式', async () => {
      const filePath = path.join(testDir, 'block.png');
      await fs.writeFile(filePath, PNG_HEADER);

      const imageData = await handler.loadFromFile('block.png');
      const block = handler.toContentBlock(imageData);

      expect(block.type).toBe('image');
      expect(block.source.type).toBe('base64');
      expect(block.source.media_type).toBe('image/png');
      expect(block.source.data).toBe(imageData.data);
    });
  });

  describe('toContentBlocks', () => {
    it('应该转换多个图像为内容块数组', async () => {
      const filePath1 = path.join(testDir, 'multi1.png');
      const filePath2 = path.join(testDir, 'multi2.png');
      await fs.writeFile(filePath1, PNG_HEADER);
      await fs.writeFile(filePath2, PNG_HEADER);

      const images = [
        await handler.loadFromFile('multi1.png'),
        await handler.loadFromFile('multi2.png'),
      ];
      const blocks = handler.toContentBlocks(images);

      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe('image');
      expect(blocks[1].type).toBe('image');
    });
  });

  describe('isImagePath', () => {
    it('应该识别支持的图像格式', () => {
      expect(handler.isImagePath('test.png')).toBe(true);
      expect(handler.isImagePath('test.jpg')).toBe(true);
      expect(handler.isImagePath('test.jpeg')).toBe(true);
      expect(handler.isImagePath('test.gif')).toBe(true);
      expect(handler.isImagePath('test.webp')).toBe(true);
    });

    it('应该拒绝不支持的格式', () => {
      expect(handler.isImagePath('test.txt')).toBe(false);
      expect(handler.isImagePath('test.pdf')).toBe(false);
      expect(handler.isImagePath('test.svg')).toBe(false);
    });

    it('应该处理路径中的目录', () => {
      expect(handler.isImagePath('/path/to/image.png')).toBe(true);
      expect(handler.isImagePath('./relative/image.jpg')).toBe(true);
    });
  });

  describe('isSupportedMimeType', () => {
    it('应该识别支持的 MIME 类型', () => {
      expect(handler.isSupportedMimeType('image/png')).toBe(true);
      expect(handler.isSupportedMimeType('image/jpeg')).toBe(true);
      expect(handler.isSupportedMimeType('image/gif')).toBe(true);
      expect(handler.isSupportedMimeType('image/webp')).toBe(true);
    });

    it('应该拒绝不支持的 MIME 类型', () => {
      expect(handler.isSupportedMimeType('image/svg+xml')).toBe(false);
      expect(handler.isSupportedMimeType('application/pdf')).toBe(false);
      expect(handler.isSupportedMimeType('text/plain')).toBe(false);
    });
  });

  describe('getSupportedFormats', () => {
    it('应该返回所有支持的格式', () => {
      const formats = handler.getSupportedFormats();

      expect(formats).toContain('png');
      expect(formats).toContain('jpeg');
      expect(formats).toContain('jpg');
      expect(formats).toContain('gif');
      expect(formats).toContain('webp');
    });
  });

  describe('getMimeType', () => {
    it('应该返回正确的 MIME 类型', () => {
      expect(handler.getMimeType('png')).toBe('image/png');
      expect(handler.getMimeType('jpeg')).toBe('image/jpeg');
      expect(handler.getMimeType('jpg')).toBe('image/jpeg');
      expect(handler.getMimeType('gif')).toBe('image/gif');
      expect(handler.getMimeType('webp')).toBe('image/webp');
    });
  });

  describe('常量导出', () => {
    it('应该导出支持的格式列表', () => {
      expect(SUPPORTED_IMAGE_FORMATS).toContain('png');
      expect(SUPPORTED_IMAGE_FORMATS).toContain('jpeg');
      expect(SUPPORTED_IMAGE_FORMATS).toContain('gif');
      expect(SUPPORTED_IMAGE_FORMATS).toContain('webp');
    });

    it('应该导出 MIME 类型映射', () => {
      expect(IMAGE_MIME_TYPES.png).toBe('image/png');
      expect(IMAGE_MIME_TYPES.jpeg).toBe('image/jpeg');
    });

    it('应该导出最大文件大小常量', () => {
      expect(MAX_IMAGE_SIZE_BYTES).toBe(20 * 1024 * 1024);
    });
  });
});
