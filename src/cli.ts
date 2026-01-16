#!/usr/bin/env node

/**
 * 文件功能：CLI 入口点，负责处理命令行参数并启动应用程序
 *
 * 核心方法：
 * - main(): 主程序入口点，委托给 main.ts 中的 Application 类处理
 */

import { Application } from './main';
import { UIFactoryRegistry } from './ui/factories/UIFactoryRegistry';

const EXIT_CODE_GENERAL_ERROR = parseInt(process.env.EXIT_CODE_GENERAL_ERROR || '1', 10);

// 运行主程序
const uiFactory = UIFactoryRegistry.createUIFactory();
const app = new Application(uiFactory);

app.run(process.argv.slice(2))
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(EXIT_CODE_GENERAL_ERROR);
  });
