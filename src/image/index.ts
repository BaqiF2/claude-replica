/**
 * 图像处理模块
 *
 * 提供图像加载、编码、验证和格式转换功能
 * 支持 PNG、JPEG、GIF、WebP 格式
 *
 * @module image
 */

export {
  ImageHandler,
  ImageData,
  ImageContentBlock,
  ImageProcessOptions,
  ImageError,
  ImageErrorCode,
  ImageFormat,
  SUPPORTED_IMAGE_FORMATS,
  IMAGE_MIME_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_IMAGE_DIMENSION,
} from './ImageHandler';
