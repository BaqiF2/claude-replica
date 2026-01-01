# Implementation Plan: Terminal Interaction Testing

## Overview

本实现计划将自动化终端交互测试系统分解为可执行的编码任务。采用增量开发方式，从基础设施开始，逐步构建完整的测试框架。使用 TypeScript 实现，集成 Jest 测试框架和 node-pty 库。

## Tasks

- [x] 1. 项目设置和依赖安装
  - 安装 node-pty 和相关类型定义
  - 安装 fast-check 用于属性测试
  - 更新 Jest 配置以支持终端测试
  - 创建 `tests/terminal/` 目录结构
  - _Requirements: 1.1, 9.5_

- [x] 2. 实现 ANSI 解析器
  - [x] 2.1 创建 ANSIParser 类
    - 实现 `strip()` 方法去除 ANSI 转义序列
    - 实现 `parse()` 方法解析为结构化数据
    - 实现 `extractText()` 方法提取纯文本
    - 创建文件 `src/testing/ANSIParser.ts`
    - _Requirements: 1.4_
  - [x] 2.2 编写 ANSI 解析器属性测试
    - **Property 3: ANSI Escape Sequence Parsing**
    - **Validates: Requirements 1.4**
  - [x] 2.3 编写 ANSI 解析器单元测试
    - 测试常见 ANSI 序列（颜色、样式、光标）
    - 测试边界情况（空字符串、无 ANSI、纯 ANSI）
    - _Requirements: 1.4_

- [ ] 3. 实现终端模拟器
  - [x] 3.1 创建 TerminalEmulator 类
    - 实现 PTY 会话创建和管理
    - 实现 `start()`, `write()`, `sendKey()` 方法
    - 实现 `waitFor()`, `waitForExit()` 方法
    - 实现 `getOutput()`, `getStrippedOutput()` 方法
    - 实现 `kill()`, `dispose()` 方法
    - 创建文件 `src/testing/TerminalEmulator.ts`
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_
  - [x] 3.2 编写终端模拟器属性测试
    - **Property 1: PTY Session Lifecycle**
    - **Property 2: Input/Output Round-Trip**
    - **Property 4: Timeout Enforcement**
    - **Property 5: Special Key Encoding**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6**
  - [x] 3.3 编写终端模拟器单元测试
    - 测试 PTY 创建和销毁
    - 测试输入输出捕获
    - 测试超时处理
    - 测试特殊按键发送
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_

- [x] 4. 检查点 - 确保基础设施测试通过
  - 确保所有测试通过，如有问题请询问用户

- [x] 5. 实现断言匹配器
  - [x] 5.1 创建 AssertionMatcher 类
    - 实现 `exactMatch()` 精确匹配
    - 实现 `containsMatch()` 包含匹配
    - 实现 `regexMatch()` 正则匹配
    - 实现 `jsonMatch()` JSON 匹配
    - 实现 `jsonSchemaMatch()` JSON Schema 验证
    - 实现 `assert()` 统一入口方法
    - 创建文件 `src/testing/AssertionMatcher.ts`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [x] 5.2 编写断言匹配器属性测试
    - **Property 10: Assertion Matching Correctness**
    - **Property 11: JSON Schema Validation**
    - **Property 12: ANSI Comparison Modes**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
  - [x] 5.3 编写断言匹配器单元测试
    - 测试各种匹配类型
    - 测试 ANSI 处理选项
    - 测试差异输出生成
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [-] 6. 实现测试夹具
  - [-] 6.1 创建 TestFixture 类
    - 实现 `setup()` 创建临时目录和配置
    - 实现 `teardown()` 清理资源
    - 实现 `createFile()`, `readFile()` 文件操作
    - 实现 `setEnv()`, `restoreEnv()` 环境变量管理
    - 实现扩展文件创建（技能、命令、代理）
    - 创建文件 `src/testing/TestFixture.ts`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  - [ ] 6.2 编写测试夹具属性测试
    - **Property 13: Fixture Lifecycle**
    - **Property 14: Fixture File Creation**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
  - [ ] 6.3 编写测试夹具单元测试
    - 测试临时目录创建和清理
    - 测试配置文件创建
    - 测试环境变量设置和恢复
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 7. 实现交互控制器
  - [ ] 7.1 创建 InteractionController 类
    - 实现 `execute()` 执行交互脚本
    - 实现 `executeStep()` 执行单个步骤
    - 实现步骤类型处理（send, sendKey, wait, assert, delay）
    - 实现结果收集和错误处理
    - 创建文件 `src/testing/InteractionController.ts`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  - [ ] 7.2 编写交互控制器属性测试
    - **Property 6: Multi-Turn Conversation State**
    - **Validates: Requirements 2.2, 2.6**
  - [ ] 7.3 编写交互控制器单元测试
    - 测试脚本执行流程
    - 测试各种步骤类型
    - 测试错误处理
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [ ] 8. 检查点 - 确保核心组件测试通过
  - 确保所有测试通过，如有问题请询问用户

- [ ] 9. 实现报告生成器
  - [ ] 9.1 创建 ReportGenerator 类
    - 实现 `generateJUnit()` JUnit XML 格式
    - 实现 `generateHTML()` HTML 格式
    - 实现 `generateJSON()` JSON 格式
    - 实现 `printConsole()` 控制台输出
    - 实现 `generate()` 统一入口
    - 创建文件 `src/testing/ReportGenerator.ts`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  - [ ] 9.2 编写报告生成器属性测试
    - **Property 21: Report Format Validity**
    - **Property 22: Report Timing Accuracy**
    - **Validates: Requirements 10.2, 10.4, 10.5**
  - [ ] 9.3 编写报告生成器单元测试
    - 测试 JUnit XML 格式正确性
    - 测试 HTML 格式正确性
    - 测试执行时间记录
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 10. 实现终端测试辅助函数
  - [ ] 10.1 创建测试辅助模块
    - 实现 `createTestTerminal()` 快速创建测试终端
    - 实现 `runCLI()` 运行 CLI 并返回结果
    - 实现 `expectOutput()` 输出断言辅助
    - 实现 `expectExitCode()` 退出码断言辅助
    - 创建文件 `tests/terminal/helpers.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  - [ ] 10.2 编写辅助函数属性测试
    - **Property 7: JSON Output Validity**
    - **Property 8: Stream-JSON Line Validity**
    - **Property 9: Exit Code Correctness**
    - **Validates: Requirements 3.2, 3.3, 3.5, 3.6**

- [ ] 11. 实现交互式模式测试用例
  - [ ] 11.1 编写交互式会话测试
    - 测试启动和欢迎消息
    - 测试 /help 命令
    - 测试 /exit 命令
    - 测试 Ctrl+C 中断
    - 测试多轮对话
    - 创建文件 `tests/terminal/interactive.test.ts`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [ ] 12. 实现非交互式模式测试用例
  - [ ] 12.1 编写非交互式查询测试
    - 测试 -p 选项基本查询
    - 测试 --output-format json
    - 测试 --output-format stream-json
    - 测试 --output-format markdown
    - 测试 --timeout 选项
    - 测试退出码
    - 创建文件 `tests/terminal/non-interactive.test.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [-] 13. 实现会话管理测试用例
  - [ ] 13.1 编写会话持久化测试
    - 测试会话创建和保存
    - 测试 --continue 选项
    - 测试 --resume 选项
    - 测试会话历史恢复
    - 测试不存在的会话错误
    - 创建文件 `tests/terminal/session.test.ts`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [ ] 13.2 编写会话属性测试
    - **Property 15: Session Persistence Round-Trip**
    - **Property 16: Non-Existent Session Error**
    - **Validates: Requirements 6.1, 6.3, 6.4, 6.5**

- [ ] 14. 检查点 - 确保核心测试用例通过
  - 确保所有测试通过，如有问题请询问用户

- [ ] 15. 实现扩展系统测试用例
  - [ ] 15.1 编写扩展加载测试
    - 测试技能文件加载
    - 测试自定义命令执行
    - 测试子代理调用
    - 测试钩子触发
    - 测试扩展加载错误处理
    - 创建文件 `tests/terminal/extensions.test.ts`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [ ] 15.2 编写扩展属性测试
    - **Property 17: Extension Loading**
    - **Property 18: Extension Error Handling**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

- [ ] 16. 实现错误处理测试用例
  - [ ] 16.1 编写错误场景测试
    - 测试无效参数错误（退出码 2）
    - 测试网络错误（退出码 4）
    - 测试认证错误（退出码 3）
    - 测试超时错误（退出码 5）
    - 测试未知错误（退出码 1）
    - 创建文件 `tests/terminal/errors.test.ts`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 17. 实现 CI/CD 集成测试用例
  - [ ] 17.1 编写 CI 模式测试
    - 测试 CI 环境变量检测
    - 测试非交互默认行为
    - 测试结构化日志输出
    - 测试退出码验证
    - 创建文件 `tests/terminal/ci.test.ts`
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [ ] 17.2 编写 CI 属性测试
    - **Property 19: CI Mode Detection**
    - **Property 20: Parallel Test Isolation**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.5**

- [ ] 18. 集成和导出
  - [ ] 18.1 创建测试框架入口
    - 导出所有测试组件
    - 创建便捷的测试 API
    - 更新 `src/testing/index.ts`
    - _Requirements: 所有_
  - [ ] 18.2 更新项目配置
    - 添加终端测试脚本到 package.json
    - 配置测试报告输出目录
    - _Requirements: 10.1, 10.4, 10.5_

- [ ] 19. 最终检查点 - 确保所有测试通过
  - 运行完整测试套件
  - 验证测试报告生成
  - 确保所有测试通过，如有问题请询问用户

## Notes

- 所有任务都是必需的，确保全面的测试覆盖
- 每个任务都引用了具体的需求以确保可追溯性
- 属性测试验证通用正确性，单元测试验证具体场景
- 检查点任务用于确保增量开发的稳定性
- 终端测试需要较长的超时时间（建议 30 秒）
