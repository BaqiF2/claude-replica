# 实施计划：权限系统重构

## 概述

基于 Claude Agent SDK 官方规范重构权限系统，实现持久权限显示、动态权限切换、canUseTool 回调、AskUserQuestion 支持，并清理旧代码以实现 UI 层与权限逻辑层的完全分离。

## Reference
- Design: [design.md](./design.md)
- Specification: [spec.md](./spec.md)

## 任务

- [x] 1. 定义类型和接口
  - 创建 `src/permissions/types.ts`，定义 `PermissionResult`、`SDKCanUseTool`、`ToolPermissionRequest`、`PermissionUIResult` 等核心类型
  - 创建 `src/permissions/PermissionUI.ts`，定义 `PermissionUI` 接口、`QuestionInput`、`QuestionAnswers` 类型
  - _Requirements: 系统必须实现符合 SDK 规范的 canUseTool 回调, 系统应当实现 UI 层和权限逻辑层的完全分离_

- [x] 2. 实现权限面板 UI 组件
  - 在 `src/permissions/PermissionUI.ts` 中实现 `PermissionPanel` 类
  - 实现 `show()` 方法：使用 ANSI 控制码在终端底部显示权限请求面板
  - 实现 `drawSeparator()` 和 `drawPanelContent()` 方法：渲染分隔线和工具信息
  - 实现 `waitForUserInput()` 方法：监听 y/n/Esc 键输入
  - 实现 `clear()` 方法：清除面板区域
  - 添加终端能力检测 (`process.stdout.isTTY`)，非 TTY 环境降级为序列显示
  - _Requirements: 系统应当通过独立面板显示工具权限请求, 系统应当支持 ANSI 控制码的终端分屏显示, 系统应当处理终端兼容性问题_

- [x] 3. 实现交互式菜单 UI 组件
  - 在 `src/permissions/PermissionUI.ts` 中实现 `QuestionMenu` 类
  - 实现 `show()` 方法：显示问题和选项列表
  - 实现 `render()` 方法：根据 multiSelect 模式渲染单选 (`▶`) 或多选 (`[ ]`/`[✓]`) 选项
  - 实现 `waitForSelection()` 方法：监听键盘事件 (↑↓ Space Enter Esc)
    - 上箭头 (`\x1b[A`)：移动选择到上一项
    - 下箭头 (`\x1b[B`)：移动选择到下一项
    - 空格：多选模式下切换选项
    - Enter：确认选择
    - Esc：取消
  - 实现 `clearAndRender()` 方法：清除旧菜单并重新渲染
  - 实现 `calculateLineCount()` 方法：计算菜单占用行数
  - 实现 `clear()` 方法：清除菜单显示
  - _Requirements: 系统必须支持 AskUserQuestion 工具的交互式菜单_

- [x] 4. 实现 PermissionUI 适配器
  - 创建 `src/ui/PermissionUIImpl.ts`，实现 `PermissionUI` 接口
  - 实现 `promptToolPermission()` 方法：委托给 `PermissionPanel.show()`
  - 实现 `promptUserQuestions()` 方法：遍历问题列表，依次调用 `QuestionMenu.show()` 收集答案
  - 适配返回值格式：`PermissionUIResult` 和 `QuestionAnswers`
  - _Requirements: 系统应当实现 UI 层和权限逻辑层的完全分离_

- [x] 5. 修改 InteractiveUI 添加权限 emoji 显示
  - 在 `src/ui/InteractiveUI.ts` 中新增 `getPermissionEmoji()` 私有方法
  - 定义 emoji 映射：`default: '🟢'`, `acceptEdits: '🟡'`, `bypassPermissions: '🔴'`, `plan: '🔵'`
  - 修改 `prompt()` 方法：在提示符中添加 emoji，格式为 `> ${emoji} `
  - 保持现有 `setupKeyListener()` 和 `cyclePermissionMode()` 逻辑不变
  - 修改权限切换通知：显示格式为 `ℹ️ Switched to: ${emoji} ${label}`
  - _Requirements: 系统必须支持持久权限状态显示, 系统应当支持通过 Shift+Tab 动态切换权限模式_

- [x] 6. 删除 PermissionManager 中的旧代码
  - 在 `src/permissions/PermissionManager.ts` 中删除权限历史相关代码：
    - 删除 `PermissionRecord` 接口定义
    - 删除 `permissionHistory: PermissionRecord[]` 字段
    - 删除 `maxHistorySize` 常量
    - 删除 `recordPermission()` 方法
    - 删除 `getPermissionHistory()` 方法
    - 删除 `clearPermissionHistory()` 方法
  - 删除旧回调机制：
    - 删除 `PromptUserCallback` 类型定义
    - 删除 `promptUserCallback` 字段
    - 删除 `setPromptUserCallback()` 方法
  - _Requirements: 系统应当删除权限历史记录功能, 系统应当删除旧的回调机制_

- [x] 7. 重构 PermissionManager.createCanUseToolHandler()
  - 修改返回类型：从 `CanUseTool` (返回 boolean) 改为 `SDKCanUseTool` (返回 `PermissionResult`)
  - 在构造函数中新增 `permissionUI: PermissionUI` 依赖注入参数
  - 在回调函数中添加 signal.aborted 检查：返回 `{behavior: 'deny', interrupt: true, toolUseID}`
  - 特殊处理 `AskUserQuestion` 工具：调用 `handleAskUserQuestion()` 并返回包含 updatedInput 的结果
  - 对其他工具：根据权限检查结果返回 `{behavior: 'allow'/'deny', message?, toolUseID}`
  - _Requirements: 系统必须实现符合 SDK 规范的 canUseTool 回调, 系统应当实现 UI 层和权限逻辑层的完全分离_

- [x] 8. 重构 PermissionManager.checkPermissionByMode()
  - 修改方法签名：新增 `input: any` 和 `toolUseID: string` 参数
  - 修改返回类型：从 `Promise<boolean>` 改为 `Promise<PermissionResult>`
  - 更新方法内部逻辑：
    - 黑名单检查 → 返回 `{behavior: 'deny', toolUseID}`
    - 白名单检查 → 返回 `{behavior: 'allow', toolUseID}`
    - bypass 模式 → 返回 `{behavior: 'allow', toolUseID}`
    - 需要用户确认 → 调用 `permissionUI.promptToolPermission()` 并构建 PermissionResult
  - _Requirements: 系统必须实现符合 SDK 规范的 canUseTool 回调_

- [x] 9. 新增 PermissionManager.handleAskUserQuestion()
  - 添加私有方法 `handleAskUserQuestion(input: AskUserQuestionInput, options: {toolUseID: string; signal: AbortSignal}): Promise<PermissionResult>`
  - 提取 `input.questions` 问题列表
  - 调用 `permissionUI.promptUserQuestions(questions)` 收集用户答案
  - 构建 PermissionResult：
    ```typescript
    {
      behavior: 'allow',
      updatedInput: {
        questions: input.questions,
        answers: collectedAnswers
      },
      toolUseID: options.toolUseID
    }
    ```
  - _Requirements: 系统必须为 AskUserQuestion 工具返回 updatedInput_

- [x] 10. 修改 MessageRouter 适配新 canUseTool 格式
  - 在 `src/core/MessageRouter.ts` 中修改 `createPermissionHandler()` 方法
  - 调用 `permissionManager.createCanUseToolHandler()` 获取 baseHandler
  - 直接返回 baseHandler 的 PermissionResult，移除旧的 boolean → PermissionResult 转换逻辑
  - 新增 `setPermissionMode(mode: PermissionMode)` 方法：调用 `permissionManager.setMode(mode)`
  - 新增 `queryInstance: Query | null` 字段存储 query 实例引用
  - 新增 `setQueryInstance(instance)` 方法
  - 在 `setPermissionMode()` 中调用 `queryInstance.setPermissionMode(mode)` (如果实例存在)
  - _Requirements: 系统必须实现符合 SDK 规范的 canUseTool 回调, 系统应当支持 SDK 异步权限模式切换_

- [x] 11. 修改 StreamingQueryManager 支持动态权限切换
  - 在 `src/sdk/StreamingQueryManager.ts` 中新增 `setPermissionMode(mode: PermissionMode)` 方法
  - 实现逻辑：
    1. 调用 `messageRouter.setPermissionMode(mode)` 本地同步更新
    2. 如果 `queryInstance` 存在，调用 `queryInstance.setPermissionMode(mode)` SDK 异步切换
  - 在 `startExecution()` 方法中保存 query 实例：
    ```typescript
    const queryGenerator = query({...});
    this.queryInstance = queryGenerator;
    this.messageRouter.setQueryInstance(queryGenerator);
    ```
  - _Requirements: 系统应当支持 SDK 异步权限模式切换_

- [x] 12. 修改 Application (main.ts) 集成新组件
  - 在 `initialize()` 方法中创建 `PermissionUIImpl` 实例
  - 修改 PermissionManager 初始化：注入 `permissionUI` 依赖
    ```typescript
    const permissionUI = new PermissionUIImpl();
    this.permissionManager = new PermissionManager(permissionConfig, permissionUI);
    ```
  - 删除旧回调设置代码：移除 `permissionManager.setPromptUserCallback()` 调用
  - 在 `runInteractive()` 方法中修改 `onPermissionModeChange` 回调：
    ```typescript
    onPermissionModeChange: async (mode) => {
      await this.streamingQueryManager.setPermissionMode(mode);
    }
    ```
  - _Requirements: 系统应当实现 UI 层和权限逻辑层的完全分离, 系统应当删除旧的回调机制_

- [x] 13. 修改默认权限模式配置
  - 在 `src/config/ConfigBuilder.ts` 中修改 `buildPermissionConfig()` 方法
  - 将默认 `permissionMode` 从 `default` 改为 `acceptEdits`
    ```typescript
    mode: options.permissionMode || config.permissionMode || 'acceptEdits'
    ```
  - _Requirements: 默认权限模式应当设置为 acceptEdits_

- [x] 14. 编写 PermissionManager 单元测试
  - 在 `tests/permissions/PermissionManager.test.ts` 中添加测试用例：
    - `createCanUseToolHandler()` 返回正确的 PermissionResult (allow/deny)
    - 黑名单工具始终返回 deny
    - 白名单工具始终返回 allow
    - `acceptEdits` 模式自动批准 Write/Edit 工具
    - `bypassPermissions` 模式批准所有工具
    - `handleAskUserQuestion()` 正确构建 updatedInput
    - signal.aborted 时返回 interrupt
  - _Requirements: 系统必须实现符合 SDK 规范的 canUseTool 回调, 系统必须为 AskUserQuestion 工具返回 updatedInput_

- [x] 15. 编写 PermissionUI 组件单元测试
  - 在 `tests/permissions/PermissionUI.test.ts` 中添加测试用例：
    - PermissionPanel 正确渲染工具名称和参数
    - PermissionPanel 响应 y/n/Esc 键输入
    - QuestionMenu 单选模式正确显示选项
    - QuestionMenu 多选模式支持 Space 切换
    - QuestionMenu 方向键导航功能
    - QuestionMenu Enter 确认返回正确标签
  - _Requirements: 系统应当通过独立面板显示工具权限请求, 系统必须支持 AskUserQuestion 工具的交互式菜单_

- [x] 16. 编写权限流程集成测试
  - 在 `tests/integration/permission-flow.test.ts` 中添加测试场景：
    - 完整权限流程：用户输入 → 触发工具 → 显示面板 → 用户批准/拒绝 → SDK 执行/拒绝
    - AskUserQuestion 流程：触发工具 → 显示菜单 → 用户选择 → 返回 updatedInput → 工具读取答案
    - 动态权限切换流程：切换模式 → 本地更新 → SDK 异步应用 → 下次工具调用生效
  - _Requirements: 系统必须实现符合 SDK 规范的 canUseTool 回调, 系统应当支持 SDK 异步权限模式切换, 系统必须为 AskUserQuestion 工具返回 updatedInput_

- [x] 17. 手动功能验证和 Bug 修复
  - 启动应用，验证提示符显示 `> 🟡`
  - 按 Shift+Tab，验证 emoji 循环变化和切换通知
  - 触发需要权限的工具 (如 Bash)，验证权限面板显示和用户交互
  - 让 Claude 提出选择问题，验证交互式菜单的单选和多选功能
  - 在流式会话中切换权限，验证新模式在当前工具完成后生效
  - 修复发现的问题和边界情况
  - **Bug 修复记录：**
    - **Bug 1: Plan 模式权限过于严格**
      - **问题：** plan 模式下所有工具都被禁止执行，但预期应允许只读工具（Read, Grep, Glob）和 ExitPlanMode
      - **修复位置：** `src/permissions/PermissionManager.ts:215-228`
      - **修复内容：** 在 plan 模式的 case 分支中，添加白名单判断，允许 `['Read', 'Grep', 'Glob', 'ExitPlanMode']` 工具通过
      - **测试验证：** 更新 `tests/permissions/PermissionManager.test.ts:164-189` 的测试用例，验证 plan 模式权限逻辑
      - **文档：** `.self_spec/2026-01-11-permission-refactor/task17-summary.md`
    - **Bug 2: Plan 模式缺少系统指导**
      - **问题：** Claude 不知道 plan 模式如何工作，盲目尝试被禁止的工具
      - **修复位置：** `src/core/MessageRouter.ts:567-600, 310-324`
      - **修复内容：**
        - `buildAppendPrompt()`: 在会话开始时添加 plan 模式的完整指导
        - `buildStreamMessage()`: 在每条消息前添加 plan 模式提示
      - **文档：** `.self_spec/2026-01-11-permission-refactor/plan-mode-fix-summary.md`
    - **Bug 3: ExitPlanMode 不切换权限模式**
      - **问题：** ExitPlanMode 工具执行成功但权限模式未切换，Claude 仍被拒绝使用实施工具
      - **根本原因：** SDK 不支持 plan 模式，ExitPlanMode 不是内置工具，需要应用层拦截并手动切换
      - **修复位置：**
        - `src/main.ts:259-279`: 在 onToolResult 回调中拦截 ExitPlanMode 并切换模式
        - `src/ui/InteractiveUI.ts:483-495`: 添加 setPermissionMode() 方法用于运行时更新
      - **修复逻辑：**
        1. 监听 onToolResult 回调
        2. 检测 ExitPlanMode 成功执行
        3. 调用 streamingQueryManager.setPermissionMode('acceptEdits')
        4. 更新 UI 显示和提示符
      - **文档：** `.self_spec/2026-01-11-permission-refactor/exitplanmode-fix-summary.md`
  - _Requirements: 所有核心需求的端到端验证_

- [x] 18. 更新相关文档
  - 更新 CLAUDE.md 中的权限系统架构描述
  - 添加 PermissionUI 接口和组件的说明
  - 更新权限模式切换流程图
  - 添加 AskUserQuestion 处理流程说明
  - 移除旧的权限历史和回调机制相关文档
  - _Requirements: 文档与实现保持同步_
