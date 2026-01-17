# 实施计划: UI 抽象层重构

## 概述
通过引入 InteractiveUIInterface 抽象层和工厂模式,消除 InteractiveRunner 对 InteractiveUI 具体实现的依赖,支持多种 UI 实现(Terminal、Web、Desktop),完成依赖注入链重构,并确保所有测试通过。

## Reference
- Design: [design.md](design.md)
- Specification: [spec.md](spec.md)

## 任务

### Phase 1: 接口定义和核心实现

#### Scenario 1: InteractiveUIInterface 定义完整的生命周期方法

- [x] 1. [测试] InteractiveUIInterface 生命周期方法 - 编写测试用例
   - 测试文件: `tests/ui/InteractiveUIInterface.test.ts`
   - 验证接口包含 start() 和 stop() 方法
   - _Requirements: 系统必须提供 InteractiveUIInterface 抽象接口_
   - _Scenario: InteractiveUIInterface 定义完整的生命周期方法_
   - _TaskGroup: 1_

- [x] 2. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/InteractiveUIInterface.test.ts`
   - 预期失败(接口未定义)
   - _Validates: 1_
   - _TaskGroup: 1_

- [x] 3. [实现] 创建 InteractiveUIInterface 接口
   - 实现文件: `src/ui/InteractiveUIInterface.ts`
   - 定义生命周期方法: `start(): Promise<void>`, `stop(): void`
   - 添加规范的文件头文档
   - _Requirements: 系统必须提供 InteractiveUIInterface 抽象接口_
   - _TaskGroup: 1_

- [x] 4. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/InteractiveUIInterface.test.ts`
   - 预期通过
   - _Validates: 3_
   - _TaskGroup: 1_

#### Scenario 2: InteractiveUIInterface 定义完整的消息显示方法

- [x] 5. [测试] InteractiveUIInterface 消息显示方法 - 编写测试用例
   - 测试文件: `tests/ui/InteractiveUIInterface.test.ts`
   - 验证接口包含 displayMessage、displayToolUse、displayToolResult 方法
   - _Requirements: 系统必须提供 InteractiveUIInterface 抽象接口_
   - _Scenario: InteractiveUIInterface 定义完整的消息显示方法_
   - _TaskGroup: 2_

- [x] 6. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/InteractiveUIInterface.test.ts`
   - 预期失败
   - _Validates: 5_
   - _TaskGroup: 2_

- [x] 7. [实现] 扩展 InteractiveUIInterface 接口
   - 实现文件: `src/ui/InteractiveUIInterface.ts`
   - 添加消息显示方法
   - _Requirements: 系统必须提供 InteractiveUIInterface 抽象接口_
   - _TaskGroup: 2_

- [x] 8. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/InteractiveUIInterface.test.ts`
   - 预期通过
   - _Validates: 7_
   - _TaskGroup: 2_

#### Scenario 3: InteractiveUIInterface 定义完整的进度指示方法

- [x] 9. [测试] InteractiveUIInterface 进度指示方法 - 编写测试用例
   - 测试文件: `tests/ui/InteractiveUIInterface.test.ts`
   - 验证接口包含 displayThinking、displayComputing、stopComputing、clearProgress 方法
   - _Requirements: 系统必须提供 InteractiveUIInterface 抽象接口_
   - _Scenario: InteractiveUIInterface 定义完整的进度指示方法_
   - _TaskGroup: 3_

- [x] 10. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/InteractiveUIInterface.test.ts`
   - 预期失败
   - _Validates: 9_
   - _TaskGroup: 3_

- [x] 11. [实现] 扩展 InteractiveUIInterface 接口
   - 实现文件: `src/ui/InteractiveUIInterface.ts`
   - 添加进度指示方法
   - _Requirements: 系统必须提供 InteractiveUIInterface 抽象接口_
   - _TaskGroup: 3_

- [x] 12. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/InteractiveUIInterface.test.ts`
   - 预期通过
   - _Validates: 11_
   - _TaskGroup: 3_

#### Scenario 4: InteractiveUIInterface 定义完整的状态通知方法

- [x] 13. [测试] InteractiveUIInterface 状态通知方法 - 编写测试用例
   - 测试文件: `tests/ui/InteractiveUIInterface.test.ts`
   - 验证接口包含 displayError、displayWarning、displaySuccess、displayInfo 方法
   - _Requirements: 系统必须提供 InteractiveUIInterface 抽象接口_
   - _Scenario: InteractiveUIInterface 定义完整的状态通知方法_
   - _TaskGroup: 4_

- [x] 14. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/InteractiveUIInterface.test.ts`
   - 预期失败
   - _Validates: 13_
   - _TaskGroup: 4_

- [x] 15. [实现] 扩展 InteractiveUIInterface 接口
   - 实现文件: `src/ui/InteractiveUIInterface.ts`
   - 添加状态通知方法
   - _Requirements: 系统必须提供 InteractiveUIInterface 抽象接口_
   - _TaskGroup: 4_

- [x] 16. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/InteractiveUIInterface.test.ts`
   - 预期通过
   - _Validates: 15_
   - _TaskGroup: 4_

#### Scenario 5: InteractiveUIInterface 定义完整的用户交互方法

- [x] 17. [测试] InteractiveUIInterface 用户交互方法 - 编写测试用例
   - 测试文件: `tests/ui/InteractiveUIInterface.test.ts`
   - 验证接口包含 promptConfirmation、showRewindMenu、showSessionMenu、showConfirmationMenu 方法
   - _Requirements: 系统必须提供 InteractiveUIInterface 抽象接口_
   - _Scenario: InteractiveUIInterface 定义完整的用户交互方法_
   - _TaskGroup: 5_

- [x] 18. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/InteractiveUIInterface.test.ts`
   - 预期失败
   - _Validates: 17_
   - _TaskGroup: 5_

- [x] 19. [实现] 扩展 InteractiveUIInterface 接口
   - 实现文件: `src/ui/InteractiveUIInterface.ts`
   - 添加用户交互方法
   - _Requirements: 系统必须提供 InteractiveUIInterface 抽象接口_
   - _TaskGroup: 5_

- [x] 20. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/InteractiveUIInterface.test.ts`
   - 预期通过
   - _Validates: 19_
   - _TaskGroup: 5_

#### Scenario 6: InteractiveUIInterface 定义完整的权限管理方法

- [x] 21. [测试] InteractiveUIInterface 权限管理方法 - 编写测试用例
   - 测试文件: `tests/ui/InteractiveUIInterface.test.ts`
   - 验证接口包含 setInitialPermissionMode、setPermissionMode、displayPermissionStatus 方法
   - _Requirements: 系统必须提供 InteractiveUIInterface 抽象接口_
   - _Scenario: InteractiveUIInterface 定义完整的权限管理方法_
   - _TaskGroup: 6_

- [x] 22. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/InteractiveUIInterface.test.ts`
   - 预期失败
   - _Validates: 21_
   - _TaskGroup: 6_

- [x] 23. [实现] 扩展 InteractiveUIInterface 接口
   - 实现文件: `src/ui/InteractiveUIInterface.ts`
   - 添加权限管理方法
   - _Requirements: 系统必须提供 InteractiveUIInterface 抽象接口_
   - _TaskGroup: 6_

- [x] 24. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/InteractiveUIInterface.test.ts`
   - 预期通过
   - _Validates: 23_
   - _TaskGroup: 6_

#### Scenario 7: InteractiveUIInterface 定义完整的处理状态管理方法

- [x] 25. [测试] InteractiveUIInterface 处理状态管理方法 - 编写测试用例
   - 测试文件: `tests/ui/InteractiveUIInterface.test.ts`
   - 验证接口包含 setProcessingState 方法
   - _Requirements: 系统必须提供 InteractiveUIInterface 抽象接口_
   - _Scenario: InteractiveUIInterface 定义完整的处理状态管理方法_
   - _TaskGroup: 7_

- [x] 26. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/InteractiveUIInterface.test.ts`
   - 预期失败
   - _Validates: 25_
   - _TaskGroup: 7_

- [x] 27. [实现] 扩展 InteractiveUIInterface 接口
   - 实现文件: `src/ui/InteractiveUIInterface.ts`
   - 添加处理状态管理方法
   - _Requirements: 系统必须提供 InteractiveUIInterface 抽象接口_
   - _TaskGroup: 7_

- [x] 28. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/InteractiveUIInterface.test.ts`
   - 预期通过
   - _Validates: 27_
   - _TaskGroup: 7_

#### Scenario 8: InteractiveUIInterface 定义完整的工具方法

- [x] 29. [测试] InteractiveUIInterface 工具方法 - 编写测试用例
   - 测试文件: `tests/ui/InteractiveUIInterface.test.ts`
   - 验证接口包含 formatRelativeTime、formatAbsoluteTime、formatStatsSummary 方法
   - _Requirements: 系统必须提供 InteractiveUIInterface 抽象接口_
   - _Scenario: InteractiveUIInterface 定义完整的工具方法_
   - _TaskGroup: 8_

- [x] 30. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/InteractiveUIInterface.test.ts`
   - 预期失败
   - _Validates: 29_
   - _TaskGroup: 8_

- [x] 31. [实现] 扩展 InteractiveUIInterface 接口
   - 实现文件: `src/ui/InteractiveUIInterface.ts`
   - 添加工具方法
   - _Requirements: 系统必须提供 InteractiveUIInterface 抽象接口_
   - _TaskGroup: 8_

- [x] 32. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/InteractiveUIInterface.test.ts`
   - 预期通过
   - _Validates: 31_
   - _TaskGroup: 8_

#### Scenario 9: InteractiveUICallbacks 定义所有必需回调

- [x] 33. [测试] InteractiveUICallbacks 必需回调 - 编写测试用例
   - 测试文件: `tests/ui/InteractiveUICallbacks.test.ts`
   - 验证接口包含 onMessage、onCommand、onInterrupt、onRewind 属性
   - _Requirements: 系统必须提供 InteractiveUICallbacks 回调接口_
   - _Scenario: InteractiveUICallbacks 定义所有必需回调_
   - _TaskGroup: 9_

- [x] 34. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/InteractiveUICallbacks.test.ts`
   - 预期失败
   - _Validates: 33_
   - _TaskGroup: 9_

- [x] 35. [实现] 定义 InteractiveUICallbacks 接口
   - 实现文件: `src/ui/InteractiveUIInterface.ts`
   - 添加必需回调属性
   - _Requirements: 系统必须提供 InteractiveUICallbacks 回调接口_
   - _TaskGroup: 9_

- [x] 36. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/InteractiveUICallbacks.test.ts`
   - 预期通过
   - _Validates: 35_
   - _TaskGroup: 9_

#### Scenario 10: InteractiveUICallbacks 定义可选回调

- [x] 37. [测试] InteractiveUICallbacks 可选回调 - 编写测试用例
   - 测试文件: `tests/ui/InteractiveUICallbacks.test.ts`
   - 验证接口包含 onPermissionModeChange、onQueueMessage 可选属性
   - _Requirements: 系统必须提供 InteractiveUICallbacks 回调接口_
   - _Scenario: InteractiveUICallbacks 定义可选回调_
   - _TaskGroup: 10_

- [x] 38. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/InteractiveUICallbacks.test.ts`
   - 预期失败
   - _Validates: 37_
   - _TaskGroup: 10_

- [x] 39. [实现] 扩展 InteractiveUICallbacks 接口
   - 实现文件: `src/ui/InteractiveUIInterface.ts`
   - 添加可选回调属性
   - _Requirements: 系统必须提供 InteractiveUICallbacks 回调接口_
   - _TaskGroup: 10_

- [x] 40. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/InteractiveUICallbacks.test.ts`
   - 预期通过
   - _Validates: 39_
   - _TaskGroup: 10_

#### Scenario 11: InteractiveUIConfig 定义所有配置项

- [x] 41. [测试] InteractiveUIConfig 配置项 - 编写测试用例
   - 测试文件: `tests/ui/InteractiveUIConfig.test.ts`
   - 验证接口包含 input、output、enableColors 可选属性
   - _Requirements: 系统必须提供 InteractiveUIConfig 配置接口_
   - _Scenario: InteractiveUIConfig 定义所有配置项_
   - _TaskGroup: 11_

- [x] 42. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/InteractiveUIConfig.test.ts`
   - 预期失败
   - _Validates: 41_
   - _TaskGroup: 11_

- [x] 43. [实现] 定义 InteractiveUIConfig 接口
   - 实现文件: `src/ui/InteractiveUIInterface.ts`
   - 添加配置项属性
   - _Requirements: 系统必须提供 InteractiveUIConfig 配置接口_
   - _TaskGroup: 11_

- [x] 44. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/InteractiveUIConfig.test.ts`
   - 预期通过
   - _Validates: 43_
   - _TaskGroup: 11_

#### Scenario 12: TerminalInteractiveUI 使用回调函数替代 EventEmitter

- [x] 45. [测试] TerminalInteractiveUI 不继承 EventEmitter - 编写测试用例
   - 测试文件: `tests/ui/TerminalInteractiveUI.test.ts`
   - 验证类不继承 EventEmitter,构造函数接收 InteractiveUICallbacks
   - _Requirements: 系统必须实现 TerminalInteractiveUI 类_
   - _Scenario: TerminalInteractiveUI 使用回调函数替代 EventEmitter_
   - _TaskGroup: 12_

- [x] 46. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/TerminalInteractiveUI.test.ts`
   - 预期失败
   - _Validates: 45_
   - _TaskGroup: 12_

- [x] 47. [实现] 创建 TerminalInteractiveUI 类
   - 实现文件: `src/ui/TerminalInteractiveUI.ts`
   - 实现 InteractiveUIInterface 接口
   - 构造函数接收 InteractiveUICallbacks 和 InteractiveUIConfig
   - 复制 InteractiveUI.ts 代码并移除 EventEmitter 继承
   - 添加规范的文件头文档
   - _Requirements: 系统必须实现 TerminalInteractiveUI 类_
   - _TaskGroup: 12_

- [x] 48. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/TerminalInteractiveUI.test.ts`
   - 预期通过
   - _Validates: 47_
   - _TaskGroup: 12_

#### Scenario 13: TerminalInteractiveUI 调用 onMessage 回调

- [x] 49. [测试] TerminalInteractiveUI onMessage 回调 - 编写测试用例
   - 测试文件: `tests/ui/TerminalInteractiveUI.test.ts`
   - 验证用户输入消息后调用 callbacks.onMessage
   - _Requirements: 系统必须实现 TerminalInteractiveUI 类_
   - _Scenario: TerminalInteractiveUI 调用 onMessage 回调_
   - _TaskGroup: 13_

- [x] 50. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/TerminalInteractiveUI.test.ts`
   - 预期失败
   - _Validates: 49_
   - _TaskGroup: 13_

- [x] 51. [实现] 替换 EventEmitter 调用为回调
   - 实现文件: `src/ui/TerminalInteractiveUI.ts`
   - 将 `this.emit('message')` 替换为 `this.callbacks.onMessage()`
   - _Requirements: 系统必须实现 TerminalInteractiveUI 类_
   - _TaskGroup: 13_

- [x] 52. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/TerminalInteractiveUI.test.ts`
   - 预期通过
   - _Validates: 51_
   - _TaskGroup: 13_

#### Scenario 14: TerminalInteractiveUI 调用 onCommand 回调

- [x] 53. [测试] TerminalInteractiveUI onCommand 回调 - 编写测试用例
   - 测试文件: `tests/ui/TerminalInteractiveUI.test.ts`
   - 验证用户输入命令后调用 callbacks.onCommand
   - _Requirements: 系统必须实现 TerminalInteractiveUI 类_
   - _Scenario: TerminalInteractiveUI 调用 onCommand 回调_
   - _TaskGroup: 14_

- [x] 54. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/TerminalInteractiveUI.test.ts`
   - 预期失败
   - _Validates: 53_
   - _TaskGroup: 14_

- [x] 55. [实现] 替换 EventEmitter 调用为回调
   - 实现文件: `src/ui/TerminalInteractiveUI.ts`
   - 将 `this.emit('command')` 替换为 `this.callbacks.onCommand()`
   - _Requirements: 系统必须实现 TerminalInteractiveUI 类_
   - _TaskGroup: 14_

- [x] 56. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/TerminalInteractiveUI.test.ts`
   - 预期通过
   - _Validates: 55_
   - _TaskGroup: 14_

#### Scenario 15: TerminalInteractiveUI 调用 onInterrupt 回调

- [x] 57. [测试] TerminalInteractiveUI onInterrupt 回调 - 编写测试用例
   - 测试文件: `tests/ui/TerminalInteractiveUI.test.ts`
   - 验证按 Esc 键后调用 callbacks.onInterrupt
   - _Requirements: 系统必须实现 TerminalInteractiveUI 类_
   - _Scenario: TerminalInteractiveUI 调用 onInterrupt 回调_
   - _TaskGroup: 15_

- [x] 58. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/TerminalInteractiveUI.test.ts`
   - 预期失败
   - _Validates: 57_
   - _TaskGroup: 15_

- [x] 59. [实现] 替换 EventEmitter 调用为回调
   - 实现文件: `src/ui/TerminalInteractiveUI.ts`
   - 将 `this.emit('interrupt')` 替换为 `this.callbacks.onInterrupt()`
   - _Requirements: 系统必须实现 TerminalInteractiveUI 类_
   - _TaskGroup: 15_

- [x] 60. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/TerminalInteractiveUI.test.ts`
   - 预期通过
   - _Validates: 59_
   - _TaskGroup: 15_

#### Scenario 16: TerminalInteractiveUI 调用 onRewind 回调

- [x] 61. [测试] TerminalInteractiveUI onRewind 回调 - 编写测试用例
   - 测试文件: `tests/ui/TerminalInteractiveUI.test.ts`
   - 验证双击 Esc 键后调用 callbacks.onRewind
   - _Requirements: 系统必须实现 TerminalInteractiveUI 类_
   - _Scenario: TerminalInteractiveUI 调用 onRewind 回调_
   - _TaskGroup: 16_

- [x] 62. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/TerminalInteractiveUI.test.ts`
   - 预期失败
   - _Validates: 61_
   - _TaskGroup: 16_

- [x] 63. [实现] 替换 EventEmitter 调用为回调
   - 实现文件: `src/ui/TerminalInteractiveUI.ts`
   - 将 `this.emit('rewind')` 替换为 `this.callbacks.onRewind()`
   - _Requirements: 系统必须实现 TerminalInteractiveUI 类_
   - _TaskGroup: 16_

- [x] 64. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/TerminalInteractiveUI.test.ts`
   - 预期通过
   - _Validates: 63_
   - _TaskGroup: 16_

#### Scenario 17: TerminalInteractiveUI 调用 onPermissionModeChange 回调

- [x] 65. [测试] TerminalInteractiveUI onPermissionModeChange 回调 - 编写测试用例
   - 测试文件: `tests/ui/TerminalInteractiveUI.test.ts`
   - 验证按 Shift+Tab 键后调用 callbacks.onPermissionModeChange
   - _Requirements: 系统必须实现 TerminalInteractiveUI 类_
   - _Scenario: TerminalInteractiveUI 调用 onPermissionModeChange 回调_
   - _TaskGroup: 17_

- [x] 66. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/TerminalInteractiveUI.test.ts`
   - 预期失败
   - _Validates: 65_
   - _TaskGroup: 17_

- [x] 67. [实现] 替换 EventEmitter 调用为回调
   - 实现文件: `src/ui/TerminalInteractiveUI.ts`
   - 将 `this.emit('permission-mode-change')` 替换为 `this.callbacks.onPermissionModeChange?.()`
   - _Requirements: 系统必须实现 TerminalInteractiveUI 类_
   - _TaskGroup: 17_

- [x] 68. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/TerminalInteractiveUI.test.ts`
   - 预期通过
   - _Validates: 67_
   - _TaskGroup: 17_

#### Scenario 18: TerminalInteractiveUI 调用 onQueueMessage 回调

- [x] 69. [测试] TerminalInteractiveUI onQueueMessage 回调 - 编写测试用例
   - 测试文件: `tests/ui/TerminalInteractiveUI.test.ts`
   - 验证处理中输入消息后调用 callbacks.onQueueMessage
   - _Requirements: 系统必须实现 TerminalInteractiveUI 类_
   - _Scenario: TerminalInteractiveUI 调用 onQueueMessage 回调_
   - _TaskGroup: 18_

- [x] 70. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/TerminalInteractiveUI.test.ts`
   - 预期失败
   - _Validates: 69_
   - _TaskGroup: 18_

- [x] 71. [实现] 替换 EventEmitter 调用为回调
   - 实现文件: `src/ui/TerminalInteractiveUI.ts`
   - 将 `this.emit('queue-message')` 替换为 `this.callbacks.onQueueMessage?.()`
   - _Requirements: 系统必须实现 TerminalInteractiveUI 类_
   - _TaskGroup: 18_

- [x] 72. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/TerminalInteractiveUI.test.ts`
   - 预期通过
   - _Validates: 71_
   - _TaskGroup: 18_

#### Scenario 19: TerminalInteractiveUI 保留终端特定功能

- [x] 73. [测试] TerminalInteractiveUI 终端特定功能 - 编写测试用例
   - 测试文件: `tests/ui/TerminalInteractiveUI.test.ts`
   - 验证保留 ANSI 颜色、TTY 检测、键盘监听、Readline 功能
   - _Requirements: 系统必须实现 TerminalInteractiveUI 类_
   - _Scenario: TerminalInteractiveUI 保留终端特定功能_
   - _TaskGroup: 19_

- [x] 74. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/TerminalInteractiveUI.test.ts`
   - 预期失败
   - _Validates: 73_
   - _TaskGroup: 19_

- [x] 75. [实现] 保留所有终端特定实现
   - 实现文件: `src/ui/TerminalInteractiveUI.ts`
   - 确保 ANSI 颜色系统、TTY 检测、键盘事件监听、Readline 处理全部保留
   - _Requirements: 系统必须实现 TerminalInteractiveUI 类_
   - _TaskGroup: 19_

- [x] 76. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/TerminalInteractiveUI.test.ts`
   - 预期通过
   - _Validates: 75_
   - _TaskGroup: 19_

#### Scenario 20: UIFactory 定义 createInteractiveUI 方法

- [x] 77. [测试] UIFactory createInteractiveUI 方法 - 编写测试用例
   - 测试文件: `tests/ui/factories/UIFactory.test.ts`
   - 验证接口包含 createInteractiveUI 方法
   - _Requirements: UIFactory 接口必须扩展支持创建 InteractiveUI_
   - _Scenario: UIFactory 定义 createInteractiveUI 方法_
   - _TaskGroup: 20_

- [x] 78. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/factories/UIFactory.test.ts`
   - 预期失败
   - _Validates: 77_
   - _TaskGroup: 20_

- [x] 79. [实现] 扩展 UIFactory 接口
   - 实现文件: `src/ui/factories/UIFactory.ts`
   - 添加 `createInteractiveUI(callbacks: InteractiveUICallbacks, config?: InteractiveUIConfig): InteractiveUIInterface` 方法
   - _Requirements: UIFactory 接口必须扩展支持创建 InteractiveUI_
   - _TaskGroup: 20_

- [x] 80. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/factories/UIFactory.test.ts`
   - 预期通过
   - _Validates: 79_
   - _TaskGroup: 20_

#### Scenario 21: TerminalUIFactory 实现 createInteractiveUI 方法

- [x] 81. [测试] TerminalUIFactory createInteractiveUI 实现 - 编写测试用例
   - 测试文件: `tests/ui/factories/TerminalUIFactory.test.ts`
   - 验证 createInteractiveUI 返回 TerminalInteractiveUI 实例
   - _Requirements: UIFactory 接口必须扩展支持创建 InteractiveUI_
   - _Scenario: TerminalUIFactory 实现 createInteractiveUI 方法_
   - _TaskGroup: 21_

- [x] 82. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/factories/TerminalUIFactory.test.ts`
   - 预期失败
   - _Validates: 81_
   - _TaskGroup: 21_

- [x] 83. [实现] 实现 TerminalUIFactory.createInteractiveUI
   - 实现文件: `src/ui/factories/TerminalUIFactory.ts`
   - 返回 `new TerminalInteractiveUI(callbacks, config)`
   - _Requirements: UIFactory 接口必须扩展支持创建 InteractiveUI_
   - _TaskGroup: 21_

- [x] 84. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/factories/TerminalUIFactory.test.ts`
   - 预期通过
   - _Validates: 83_
   - _TaskGroup: 21_

### Phase 2: 依赖注入链重构

#### Scenario 22: InteractiveRunner 构造函数接收 UIFactory 参数

- [x] 85. [测试] InteractiveRunner 构造函数 UIFactory 参数 - 编写测试用例
   - 测试文件: `tests/runners/InteractiveRunner.test.ts`
   - 验证构造函数包含 uiFactory 参数
   - _Requirements: InteractiveRunner 必须通过依赖注入使用 UIFactory_
   - _Scenario: InteractiveRunner 构造函数接收 UIFactory 参数_
   - _TaskGroup: 22_

- [x] 86. [验证] Red 阶段
   - 运行: `npm test -- tests/runners/InteractiveRunner.test.ts`
   - 预期失败
   - _Validates: 85_
   - _TaskGroup: 22_

- [x] 87. [实现] 修改 InteractiveRunner 构造函数
   - 实现文件: `src/runners/InteractiveRunner.ts`
   - 添加 `private readonly uiFactory: UIFactory` 参数
   - _Requirements: InteractiveRunner 必须通过依赖注入使用 UIFactory_
   - _TaskGroup: 22_

- [x] 88. [验证] Green 阶段
   - 运行: `npm test -- tests/runners/InteractiveRunner.test.ts`
   - 预期通过
   - _Validates: 87_
   - _TaskGroup: 22_

#### Scenario 23: InteractiveRunner 使用 UIFactory 创建 InteractiveUI

- [x] 89. [测试] InteractiveRunner 使用工厂创建 UI - 编写测试用例
   - 测试文件: `tests/runners/InteractiveRunner.test.ts`
   - 验证调用 uiFactory.createInteractiveUI() 创建 UI
   - _Requirements: InteractiveRunner 必须通过依赖注入使用 UIFactory_
   - _Scenario: InteractiveRunner 使用 UIFactory 创建 InteractiveUI_
   - _TaskGroup: 23_

- [x] 90. [验证] Red 阶段
   - 运行: `npm test -- tests/runners/InteractiveRunner.test.ts`
   - 预期失败
   - _Validates: 89_
   - _TaskGroup: 23_

- [x] 91. [实现] 使用工厂创建 UI 实例
   - 实现文件: `src/runners/InteractiveRunner.ts`
   - 替换 `new InteractiveUI(...)` 为 `this.uiFactory.createInteractiveUI(...)`
   - _Requirements: InteractiveRunner 必须通过依赖注入使用 UIFactory_
   - _TaskGroup: 23_

- [x] 92. [验证] Green 阶段
   - 运行: `npm test -- tests/runners/InteractiveRunner.test.ts`
   - 预期通过
   - _Validates: 91_
   - _TaskGroup: 23_

#### Scenario 24-29: InteractiveRunner 回调处理(onMessage, onCommand, onInterrupt, onRewind, onPermissionModeChange, onQueueMessage)

- [x] 93. [测试] InteractiveRunner 所有回调处理 - 编写测试用例
   - 测试文件: `tests/runners/InteractiveRunner.test.ts`
   - 验证所有回调正确处理对应事件
   - _Requirements: InteractiveRunner 必须通过依赖注入使用 UIFactory_
   - _Scenario: 多个回调处理场景_
   - _TaskGroup: 24_

- [x] 94. [验证] Red 阶段
   - 运行: `npm test -- tests/runners/InteractiveRunner.test.ts`
   - 预期失败
   - _Validates: 93_
   - _TaskGroup: 24_

- [x] 95. [实现] 实现所有回调函数
   - 实现文件: `src/runners/InteractiveRunner.ts`
   - 实现 onMessage、onCommand、onInterrupt、onRewind、onPermissionModeChange、onQueueMessage
   - _Requirements: InteractiveRunner 必须通过依赖注入使用 UIFactory_
   - _TaskGroup: 24_

- [x] 96. [验证] Green 阶段
   - 运行: `npm test -- tests/runners/InteractiveRunner.test.ts`
   - 预期通过
   - _Validates: 95_
   - _TaskGroup: 24_

#### Scenario 30: StreamingQueryManagerOptions 定义 ui 参数

- [x] 97. [测试] StreamingQueryManagerOptions ui 参数 - 编写测试用例
   - 测试文件: `tests/sdk/StreamingQueryManager.test.ts`
   - 验证接口包含 ui 可选属性
   - _Requirements: StreamingQueryManager 必须明确接收 UI 参数_
   - _Scenario: StreamingQueryManagerOptions 定义 ui 参数_
   - _TaskGroup: 25_

- [x] 98. [验证] Red 阶段
   - 运行: `npm test -- tests/sdk/StreamingQueryManager.test.ts`
   - 预期失败
   - _Validates: 97_
   - _TaskGroup: 25_

- [x] 99. [实现] 扩展 StreamingQueryManagerOptions 接口
   - 实现文件: `src/sdk/StreamingQueryManager.ts`
   - 添加 `ui?: InteractiveUIInterface` 属性
   - _Requirements: StreamingQueryManager 必须明确接收 UI 参数_
   - _TaskGroup: 25_

- [x] 100. [验证] Green 阶段
   - 运行: `npm test -- tests/sdk/StreamingQueryManager.test.ts`
   - 预期通过
   - _Validates: 99_
   - _TaskGroup: 25_

#### Scenario 31: InteractiveRunner 创建 StreamingQueryManager 时传递 ui

- [x] 101. [测试] StreamingQueryManager 接收 ui - 编写测试用例
   - 测试文件: `tests/runners/InteractiveRunner.test.ts`
   - 验证创建时传递 ui 参数
   - _Requirements: StreamingQueryManager 必须明确接收 UI 参数_
   - _Scenario: InteractiveRunner 创建 StreamingQueryManager 时传递 ui_
   - _TaskGroup: 26_

- [x] 102. [验证] Red 阶段
   - 运行: `npm test -- tests/runners/InteractiveRunner.test.ts`
   - 预期失败
   - _Validates: 101_
   - _TaskGroup: 26_

- [x] 103. [实现] 传递 ui 参数
   - 实现文件: `src/runners/InteractiveRunner.ts`
   - 在创建 StreamingQueryManager 时传递 `ui: this.ui`
   - _Requirements: StreamingQueryManager 必须明确接收 UI 参数_
   - _TaskGroup: 26_

- [x] 104. [验证] Green 阶段
   - 运行: `npm test -- tests/runners/InteractiveRunner.test.ts`
   - 预期通过
   - _Validates: 103_
   - _TaskGroup: 26_

#### Scenario 32: RunnerFactory 构造函数接收 UIFactory 参数

- [x] 105. [测试] RunnerFactory 构造函数 UIFactory 参数 - 编写测试用例
   - 测试文件: `tests/runners/RunnerFactory.test.ts`
   - 验证构造函数包含 uiFactory 参数
   - _Requirements: RunnerFactory 和 main.ts 必须传递 UIFactory_
   - _Scenario: RunnerFactory 构造函数接收 UIFactory 参数_
   - _TaskGroup: 27_

- [x] 106. [验证] Red 阶段
   - 运行: `npm test -- tests/runners/RunnerFactory.test.ts`
   - 预期失败
   - _Validates: 105_
   - _TaskGroup: 27_

- [x] 107. [实现] 修改 RunnerFactory 构造函数
   - 实现文件: `src/runners/RunnerFactory.ts`
   - 添加 `private readonly uiFactory: UIFactory` 参数
   - _Requirements: RunnerFactory 和 main.ts 必须传递 UIFactory_
   - _TaskGroup: 27_

- [x] 108. [验证] Green 阶段
   - 运行: `npm test -- tests/runners/RunnerFactory.test.ts`
   - 预期通过
   - _Validates: 107_
   - _TaskGroup: 27_

#### Scenario 33: RunnerFactory 创建 InteractiveRunner 时传递 UIFactory

- [x] 109. [测试] RunnerFactory 传递 UIFactory - 编写测试用例
   - 测试文件: `tests/runners/RunnerFactory.test.ts`
   - 验证创建 InteractiveRunner 时传递 uiFactory
   - _Requirements: RunnerFactory 和 main.ts 必须传递 UIFactory_
   - _Scenario: RunnerFactory 创建 InteractiveRunner 时传递 UIFactory_
   - _TaskGroup: 28_

- [x] 110. [验证] Red 阶段
   - 运行: `npm test -- tests/runners/RunnerFactory.test.ts`
   - 预期失败
   - _Validates: 109_
   - _TaskGroup: 28_

- [x] 111. [实现] 传递 uiFactory
   - 实现文件: `src/runners/RunnerFactory.ts`
   - 在 createRunner 中传递 `this.uiFactory`
   - _Requirements: RunnerFactory 和 main.ts 必须传递 UIFactory_
   - _TaskGroup: 28_

- [x] 112. [验证] Green 阶段
   - 运行: `npm test -- tests/runners/RunnerFactory.test.ts`
   - 预期通过
   - _Validates: 111_
   - _TaskGroup: 28_

#### Scenario 34: main.ts 创建 RunnerFactory 时传递 UIFactory

- [x] 113. [测试] main.ts 传递 UIFactory - 编写测试用例
   - 测试文件: `tests/main.test.ts`
   - 验证 Application 创建 RunnerFactory 时传递 uiFactory
   - _Requirements: RunnerFactory 和 main.ts 必须传递 UIFactory_
   - _Scenario: main.ts 创建 RunnerFactory 时传递 UIFactory_
   - _TaskGroup: 29_

- [x] 114. [验证] Red 阶段
   - 运行: `npm test -- tests/main.test.ts`
   - 预期失败
   - _Validates: 113_
   - _TaskGroup: 29_

- [x] 115. [实现] 传递 uiFactory
   - 实现文件: `src/main.ts`
   - 在创建 RunnerFactory 时传递 `this.uiFactory`
   - _Requirements: RunnerFactory 和 main.ts 必须传递 UIFactory_
   - _TaskGroup: 29_

- [x] 116. [验证] Green 阶段
   - 运行: `npm test -- tests/main.test.ts`
   - 预期通过
   - _Validates: 115_
   - _TaskGroup: 29_

### Phase 3: 导出更新和测试适配

#### Scenario 35: src/ui/index.ts 导出 InteractiveUIInterface

- [x] 117. [测试] src/ui/index.ts 导出检查 - 编写测试用例
   - 测试文件: `tests/ui/index.test.ts`
   - 验证导出 InteractiveUIInterface、InteractiveUICallbacks、InteractiveUIConfig、TerminalInteractiveUI
   - _Requirements: 系统必须更新公共导出和测试基础设施_
   - _Scenario: src/ui/index.ts 导出 InteractiveUIInterface_
   - _TaskGroup: 30_

- [x] 118. [验证] Red 阶段
   - 运行: `npm test -- tests/ui/index.test.ts`
   - 预期失败
   - _Validates: 117_
   - _TaskGroup: 30_

- [x] 119. [实现] 更新导出
   - 实现文件: `src/ui/index.ts`
   - 添加新接口和类的导出
   - _Requirements: 系统必须更新公共导出和测试基础设施_
   - _TaskGroup: 30_

- [x] 120. [验证] Green 阶段
   - 运行: `npm test -- tests/ui/index.test.ts`
   - 预期通过
   - _Validates: 119_
   - _TaskGroup: 30_

#### Scenario 36: MockInteractiveUI 实现 InteractiveUIInterface

- [x] 121. [测试] MockInteractiveUI 接口实现 - 编写测试用例
   - 测试文件: `tests/test-helpers/MockInteractiveUI.test.ts`
   - 验证 MockInteractiveUI 实现所有接口方法
   - _Requirements: 系统必须更新公共导出和测试基础设施_
   - _Scenario: MockInteractiveUI 实现 InteractiveUIInterface_
   - _TaskGroup: 31_

- [x] 122. [验证] Red 阶段
   - 运行: `npm test -- tests/test-helpers/MockInteractiveUI.test.ts`
   - 预期失败
   - _Validates: 121_
   - _TaskGroup: 31_

- [x] 123. [实现] 更新 MockInteractiveUI
   - 实现文件: `tests/test-helpers/MockInteractiveUI.ts`
   - 实现 InteractiveUIInterface 接口
   - _Requirements: 系统必须更新公共导出和测试基础设施_
   - _TaskGroup: 31_

- [x] 124. [验证] Green 阶段
   - 运行: `npm test -- tests/test-helpers/MockInteractiveUI.test.ts`
   - 预期通过
   - _Validates: 123_
   - _TaskGroup: 31_

#### Scenario 37: 测试用例适配新的 InteractiveUI API

- [x] 125. [测试] 所有测试通过检查
   - 测试文件: 所有测试
   - 验证所有测试适配新 API 并通过
   - _Requirements: 系统必须更新公共导出和测试基础设施_
   - _Scenario: 测试用例适配新的 InteractiveUI API_
   - _TaskGroup: 32_

- [x] 126. [验证] Red 阶段
   - 运行: `npm test`
   - 预期部分失败
   - _Validates: 125_
   - _TaskGroup: 32_

- [x] 127. [实现] 适配所有测试用例
   - 实现文件: `tests/integration/resume-command.test.ts`, `tests/ui/InteractiveUI.test.ts` 等
   - 更新测试代码以使用新接口
   - _Requirements: 系统必须更新公共导出和测试基础设施_
   - _TaskGroup: 32_

- [x] 128. [验证] Green 阶段
   - 运行: `npm test`
   - 预期全部通过
   - _Validates: 127_
   - _TaskGroup: 32_

### Phase 4: 清理和强制迁移

#### Scenario 38: 删除 InteractiveUI.ts 后编译通过

- [x] 129. [测试] 编译检查无 InteractiveUI 导入 - 编写测试用例
   - 测试文件: 编译时检查
   - 验证删除后编译通过且无导入
   - _Requirements: 系统必须删除旧的 InteractiveUI.ts 文件_
   - _Scenario: 删除 InteractiveUI.ts 后编译通过_
   - _TaskGroup: 33_

- [x] 130. [验证] Red 阶段
   - 运行: `npm run build`
   - 删除前编译通过
   - _Validates: 129_
   - _TaskGroup: 33_

- [x] 131. [实现] 删除 InteractiveUI.ts
   - 实现文件: `src/ui/InteractiveUI.ts`
   - 删除文件
   - _Requirements: 系统必须删除旧的 InteractiveUI.ts 文件_
   - _TaskGroup: 33_

- [x] 132. [验证] Green 阶段
   - 运行: `npm run build`
   - 预期编译通过
   - _Validates: 131_
   - _TaskGroup: 33_

#### Scenario 39: 删除 InteractiveUI.ts 后测试通过

- [x] 133. [测试] 测试套件完整性检查
   - 测试文件: 所有测试
   - 验证删除后所有测试通过
   - _Requirements: 系统必须删除旧的 InteractiveUI.ts 文件_
   - _Scenario: 删除 InteractiveUI.ts 后测试通过_
   - _TaskGroup: 34_

- [x] 134. [验证] Red 阶段
   - 运行: `npm test`
   - 删除前测试通过
   - _Validates: 133_
   - _TaskGroup: 34_

- [x] 135. [实现] 确保无遗留引用
   - 检查所有导入并更新
   - _Requirements: 系统必须删除旧的 InteractiveUI.ts 文件_
   - _TaskGroup: 34_

- [x] 136. [验证] Green 阶段
   - 运行: `npm test`
   - 预期全部通过
   - _Validates: 135_
   - _TaskGroup: 34_

### Phase 5: 完整验证

#### Scenario 40: 通过环境变量切换 Terminal UI

- [x] 137. [测试] 环境变量切换功能 - 编写集成测试
   - 测试文件: `tests/integration/ui-type-switching.test.ts`
   - 验证 CLAUDE_UI_TYPE=terminal 时使用 TerminalInteractiveUI
   - _Requirements: 系统必须支持多种 UI 实现类型_
   - _Scenario: 通过环境变量切换 Terminal UI_
   - _TaskGroup: 35_

- [x] 138. [验证] Red 阶段
   - 运行: `npm test -- tests/integration/ui-type-switching.test.ts`
   - 预期失败
   - _Validates: 137_
   - _TaskGroup: 35_

- [x] 139. [实现] 环境变量支持已在 UIFactoryRegistry 中实现
   - 验证现有实现正确性
   - _Requirements: 系统必须支持多种 UI 实现类型_
   - _TaskGroup: 35_

- [x] 140. [验证] Green 阶段
   - 运行: `npm test -- tests/integration/ui-type-switching.test.ts`
   - 预期通过
   - _Validates: 139_
   - _TaskGroup: 35_

#### Scenario 41: 未设置环境变量时使用默认 Terminal UI

- [x] 141. [测试] 默认 UI 类型 - 编写集成测试
   - 测试文件: `tests/integration/ui-type-switching.test.ts`
   - 验证未设置环境变量时使用 TerminalUIFactory
   - _Requirements: 系统必须支持多种 UI 实现类型_
   - _Scenario: 未设置环境变量时使用默认 Terminal UI_
   - _TaskGroup: 36_

- [x] 142. [验证] Red 阶段
   - 运行: `npm test -- tests/integration/ui-type-switching.test.ts`
   - 预期失败
   - _Validates: 141_
   - _TaskGroup: 36_

- [x] 143. [实现] 默认值已在 UIFactoryRegistry 中实现
   - 验证现有实现正确性
   - _Requirements: 系统必须支持多种 UI 实现类型_
   - _TaskGroup: 36_

- [x] 144. [验证] Green 阶段
   - 运行: `npm test -- tests/integration/ui-type-switching.test.ts`
   - 预期通过
   - _Validates: 143_
   - _TaskGroup: 36_

#### Scenario 42: 完整手动测试清单

- [ ] 145. [验证] 手动测试所有交互功能
   - 测试清单:
     - [ ] 交互模式启动
     - [ ] 消息输入和显示
     - [ ] 工具调用显示
     - [ ] 权限模式切换 (Shift+Tab)
     - [ ] Esc 中断功能
     - [ ] Esc+Esc 回退菜单
     - [ ] `/resume` 会话恢复
     - [ ] `/help` 命令
     - [ ] `/exit` 退出
   - _Requirements: 所有需求_
   - _Scenario: 完整验证_
   - _TaskGroup: 37_

- [ ] 146. [验证] 性能无退化
   - 对比重构前后启动时间和响应延迟
   - _Requirements: 所有需求_
   - _TaskGroup: 37_

- [x] 147. [实现] 更新文档
   - 更新 CLAUDE.md 和相关文档
   - _Requirements: 所有需求_
   - _TaskGroup: 37_

- [x] 148. [验证] 代码风格检查
   - 运行: `npm run lint && npm run format`
   - _Requirements: 所有需求_
   - _TaskGroup: 37_

## 完成标准

- [ ] 所有 148 个任务完成
- [ ] TypeScript 编译无错误: `npm run build`
- [ ] 所有测试通过: `npm test`
- [ ] 手动测试清单全部通过
- [ ] 性能无明显退化
- [ ] 文档已更新
- [ ] 代码风格检查通过: `npm run lint && npm run format`
