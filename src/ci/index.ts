/**
 * CI/CD 支持模块导出
 *
 * @module ci
 */

export {
  CISupport,
  CIDetector,
  StructuredLogger,
  TimeoutManager,
  TimeoutError,
  ExitCodes,
  type CIEnvironment,
  type LogLevel,
  type StructuredLogEntry,
  type TimeoutConfig,
  type CIConfig,
  type ExitCode,
} from './CISupport';
