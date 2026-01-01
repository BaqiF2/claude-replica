#!/usr/bin/env node

/**
 * Claude Replica CLI 入口点
 *
 * 处理命令行参数并启动应用程序
 * 这是 npm bin 的入口文件，委托给 main.ts 处理
 *
 * @module cli
 */

import { main } from './main';

// 运行主程序
main()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('致命错误:', error);
    process.exit(1);
  });
