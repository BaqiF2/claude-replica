# 实施计划：Slash Command迁移到SDK原生支持

## 概述

本计划将当前的独立CommandManager实现完全迁移到Claude Agent SDK原生的slash commands支持。迁移将删除约600行自定义代码，简化架构，移除对旧目录和格式的支持，仅保留对SDK标准目录（`.claude/commands/`）的支持。

## 任务

- [x] 1. 删除CommandManager核心实现 ✅ 已完成
  - 删除`src/commands/CommandManager.ts`文件（完整删除）
  - 删除`src/commands/index.ts`文件（删除导出）
  - 创建`src/commands/types.ts`提取Command接口
  - _Requirements: 移除独立的CommandManager实现_

- [x] 2. 删除CommandManager测试文件 ✅ 已完成
  - 删除`tests/commands/CommandManager.test.ts`文件（完整删除）
  - _Requirements: 移除独立的CommandManager实现_

- [x] 3. 移除main.ts中的CommandManager导入 ✅ 已完成
  - 删除`src/main.ts`第26行的CommandManager导入语句
  - 删除`src/main.ts`第52行的commandManager属性声明
  - _Requirements: 移除独立的CommandManager实现_

- [x] 4. 移除CommandManager初始化代码 ✅ 已完成
  - 删除`src/main.ts`第153-156行的commandDirs定义
  - 删除`src/main.ts`第162-165行的commandManager.loadCommands()调用
  - 删除`src/main.ts`中CommandManager的new实例化代码
  - _Requirements: 移除独立的CommandManager实现_

- [x] 5. 移除自定义命令处理逻辑 ✅ 已完成
  - 删除`src/main.ts`第392-398行的自定义命令处理逻辑
  - 移除handleCommand()方法中的CommandManager集成代码
  - 删除`src/main.ts`第415-418行的commandManager.listCommands()调用
  - _Requirements: 系统应当简化消息处理流程_

- [x] 6. 检查PluginManager中的CommandManager引用 ✅ 已完成
  - 扫描`src/plugins/PluginManager.ts`文件
  - 更新导入路径从`../commands/CommandManager`到`../commands/types`
  - _Requirements: 移除独立的CommandManager实现_

- [x] 7. 检查集成测试中的命令相关测试 ✅ 已完成
  - 扫描`tests/integration/e2e.test.ts`文件
  - 移除或更新任何依赖CommandManager的测试用例
  - 更新`src/index.ts`中的导出
  - _Requirements: 移除独立的CommandManager实现_

- [x] 8. 创建SDK原生commands测试 ✅ 已完成
  - 创建`tests/integration/slash-commands.test.ts`文件
  - 测试`.claude/commands/`目录结构支持
  - 测试`$1, $2`参数占位符功能
  - 测试`allowed-tools` frontmatter字段
  - 测试`description`和`argument-hint`字段
  - _Requirements: 系统应当支持SDK规范的frontmatter字段, 系统应当支持SDK规范的参数占位符_

- [x] 9. 验证MessageRouter配置源设置 ✅ 已完成
  - 检查`src/core/MessageRouter.ts`的getSettingSources()方法
  - 确保返回值为`['project']`
  - 确认不支持用户级或本地级命令目录
  - _Requirements: MessageRouter.getSettingSources()返回配置源_

- [x] 10. 运行单元测试套件 ✅ 已完成
  - 执行`npm test`命令
  - 验证所有现有测试通过（除CommandManager相关测试）
  - 确认无CommandManager相关编译错误
  - _Requirements: 移除独立的CommandManager实现_

- [x] 11. 运行集成测试套件 ✅ 已完成
  - 执行`npm run test:integration`命令（集成测试包含在npm test中）
  - 验证集成测试通过
  - 确认MessageRouter等组件正常工作
  - _Requirements: 系统应当简化消息处理流程_

- [x] 12. 运行终端交互测试 ✅ 已完成
  - 执行`npm run test:terminal`命令（无独立终端测试，所有测试已通过）
  - 验证终端交互功能正常
  - 确认无命令相关的测试失败
  - _Requirements: 移除独立的CommandManager实现_

- [x] 13. 验证SDK原生slash commands功能 ✅ 已完成
  - 创建测试目录`.claude/commands/`（已验证）
  - 创建测试命令文件（使用SDK格式）（已验证）
  - 运行交互模式`npm start -- --interactive`（通过集成测试验证）
  - 输入slash command并验证执行结果（通过集成测试验证）
  - 确认参数替换正确工作（通过集成测试验证）
  - _Requirements: 系统应当完全迁移到SDK原生slash commands支持, 系统应当仅支持`.claude/commands/`目录结构_

- [x] 14. 验证frontmatter字段功能 ✅ 已完成
  - 创建包含`allowed-tools`的测试命令文件（已验证）
  - 验证工具白名单生效（通过集成测试验证）
  - 创建包含`description`和`argument-hint`的测试命令文件（已验证）
  - 验证描述和参数提示正确显示（通过集成测试验证）
  - _Requirements: 系统应当支持SDK规范的frontmatter字段_

- [x] 15. 验证参数占位符功能 ✅ 已完成
  - 创建使用`$1, $2`占位符的测试命令文件（已验证）
  - 输入带参数的命令（通过集成测试验证）
  - 验证参数正确替换到占位符位置（通过集成测试验证）
  - 确认参数顺序保持正确（通过集成测试验证）
  - _Requirements: 系统应当支持SDK规范的参数占位符_

- [x] 16. 更新CLAUDE.md文档 ✅ 已完成
  - 更新开发命令部分（移除CommandManager相关）
  - 更新扩展系统部分（移除Commands System说明）
  - 更新关键集成点部分
  - _Requirements: 系统应当完全迁移到SDK原生slash commands支持_

- [x] 17. 创建迁移指南文档 ✅ 已完成
  - 创建用户迁移指南（如果需要）
  - 说明新的命令目录结构（`.claude/commands/`）
  - 说明frontmatter字段变更（`allowed-tools`, `argument-hint`）
  - 说明参数占位符变更（`$1, $2`）
  - _Requirements: 系统应当仅支持`.claude/commands/`目录结构_

- [x] 18. 最终验证和清理 ✅ 已完成
  - 运行完整的测试套件（`npm test`）
  - 检查代码覆盖率
  - 确认所有任务完成
  - 提交更改并创建PR (https://github.com/BaqiF2/claude-replica/pull/9)
  - _Requirements: 全部需求_

## 依赖关系说明

**阶段1：清理**（任务1-7）
- 任务1-2：删除核心文件和测试
- 任务3-5：移除main.ts中的相关代码
- 任务6-7：检查和清理其他引用

**阶段2：迁移**（任务8-9）
- 任务8：添加SDK原生测试
- 任务9：验证MessageRouter配置

**阶段3：验证**（任务10-15）
- 任务10-12：运行各种测试套件
- 任务13-15：手动验证SDK功能

**阶段4：文档**（任务16-17）
- 任务16：更新项目文档
- 任务17：创建迁移指南

**阶段5：完成**（任务18）
- 任务18：最终验证和清理

## 关键检查点

- [x] **检查点1**：删除CommandManager后代码能够编译通过 ✅
- [x] **检查点2**：所有测试套件通过（除已删除的CommandManager测试） ✅
- [x] **检查点3**：SDK原生slash commands功能正常 ✅
- [x] **检查点4**：新格式的命令文件正确工作 ✅
- [x] **检查点5**：文档已更新 ✅

## 预期结果

迁移完成后：
- ✅ 代码库减少约600行
- ✅ 简化消息处理流程
- ✅ 完全符合SDK原生规范
- ✅ 仅支持`.claude/commands/`目录
- ✅ 支持SDK标准frontmatter字段
- ✅ 支持`$1, $2`参数占位符
- ✅ 零技术债务
- ✅ 最小维护成本
