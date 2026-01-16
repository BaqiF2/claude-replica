/**
 * 文件功能：定义应用程序运行器接口，用于支持不同的运行模式（交互/非交互）。
 *
 * 核心接口：
 * - ApplicationRunner: 定义统一的运行器契约，支持策略模式。
 */

import type { ConfigOverrides } from '../config/ConfigOverrides';
import type { OptionsInterface } from '../ui/OptionsInterface';

/**
 * Application options type
 */
export type ApplicationOptions = OptionsInterface & ConfigOverrides & {
  print?: boolean;
  prompt?: string;
  outputFormat?: string;
};

/**
 * ApplicationRunner interface - defines the contract for different execution modes
 */
export interface ApplicationRunner {
  /**
   * Run the application with the given options
   * @param options - Application options
   * @returns Exit code (0 for success, non-zero for error)
   */
  run(options: ApplicationOptions): Promise<number>;
}
