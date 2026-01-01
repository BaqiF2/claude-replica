/**
 * 测试框架集成模块
 * 
 * 提供测试框架检测、执行、解析和分析功能
 */

export {
  TestFrameworkIntegration,
  createTestFrameworkIntegration,
  type TestFramework,
  type TestStatus,
  type TestCase,
  type TestSuite,
  type TestResult,
  type CoverageReport,
  type FailureAnalysis,
  type TestSuggestion,
  type TestFrameworkConfig,
} from './TestFrameworkIntegration';
