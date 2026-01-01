/**
 * 文档生成模块
 *
 * 提供代码变更检测、API 文档生成、README 生成、多格式输出和代码示例提取功能
 *
 * @module docs
 */

export {
  DocumentGenerator,
  createDocumentGenerator,
  // 类型导出
  DocumentFormat,
  ChangeType,
  FileChange,
  CodeExample,
  FunctionDoc,
  ParameterDoc,
  ReturnDoc,
  ClassDoc,
  PropertyDoc,
  ModuleDoc,
  TypeDoc,
  APIDoc,
  ReadmeConfig,
  DocumentGeneratorConfig,
} from './DocumentGenerator';
