# 实施计划：SDK Agent Skills 迁移

## 概述

将项目从自定义 SkillManager 实现迁移到 Claude Agent SDK 官方 Agent Skills API，移除 492 行自定义代码，实现符合官方最佳实践的 Skills 管理机制。

## 任务

- [x] 1. 注册 Skill 工具到 ToolRegistry
  - 在 `src/tools/ToolRegistry.ts` 的 `initializeToolMetadata()` 方法中添加 Skill 工具注册
  - 设置 category 为 `ToolCategory.AGENT`，dangerous 为 `false`
  - _Requirements: Skill 工具启用_

- [x] 2. 修改 MessageRouter 的 buildAppendPrompt 方法
  - 将 `buildAppendPrompt()` 方法简化为返回 `undefined`
  - 移除 Skills 提示词构建逻辑
  - _Requirements: 移除 Skills 系统提示词注入_

- [x] 3. 删除 MessageRouter 的 buildSkillsPrompt 方法
  - 删除整个 `buildSkillsPrompt()` 方法（第 632-644 行）
  - _Requirements: 移除 Skills 系统提示词注入_

- [x] 4. 删除 MessageRouter 的 getSkillTools 方法
  - 删除整个 `getSkillTools()` 方法（第 652-664 行）
  - _Requirements: 移除 Skills 工具提取逻辑_

- [x] 5. 修改 MessageRouter 的 getEnabledToolNames 方法
  - 移除方法参数中的 `loadedSkills` 解构
  - 删除 Skills 工具提取逻辑（第 412-418 行）
  - 添加逻辑确保 'Skill' 工具默认包含在返回列表中
  - _Requirements: 移除 Skills 工具提取逻辑, Skill 工具启用_

- [x] 6. 验证 MessageRouter 的 getSettingSources 方法
  - 确认 `getSettingSources()` 返回 `['project']`
  - 添加注释说明仅支持项目级 Skills
  - _Requirements: SDK Skills 自动发现_

- [x] 7. 删除 SessionManager 中的 Skill 接口
  - 删除 `export interface Skill` 定义（第 65-72 行）
  - _Requirements: 移除 Skill 类型定义_

- [x] 8. 删除 SessionContext 中的 loadedSkills 字段
  - 从 `SessionContext` 接口中移除 `loadedSkills: Skill[]` 字段（第 92 行）
  - _Requirements: 移除 Skill 类型定义_

- [x] 9. 移除 main.ts 中的 SkillManager 导入
  - 删除 `import { SkillManager } from './skills/SkillManager'` 导入语句（第 26 行）
  - _Requirements: 移除 SkillManager 依赖_

- [x] 10. 移除 main.ts 中的 SkillManager 实例变量
  - 删除 `private readonly skillManager: SkillManager` 字段声明（第 53 行）
  - 删除构造函数中的 `this.skillManager = new SkillManager()` 初始化（第 79 行）
  - _Requirements: 移除 SkillManager 依赖_

- [x] 11. 简化 main.ts 中的 loadExtensions 方法
  - 删除 SkillManager 加载逻辑（第 151-167 行）
  - 将方法简化为空实现，添加注释说明 Skills 由 SDK 自动管理
  - _Requirements: 移除 SkillManager 依赖, SDK Skills 自动发现_

- [x] 12. 移除 index.ts 中的 SkillManager 导出
  - 删除 `export { SkillManager, Skill, SkillManagerConfig } from './skills'` 导出语句（第 76 行）
  - _Requirements: 公共 API 清理_

- [x] 13. 删除 Skills 源代码目录
  - 执行 `rm -rf src/skills/`
  - 确认删除 `src/skills/SkillManager.ts` (492 行)
  - 确认删除 `src/skills/index.ts`
  - _Requirements: 移除 Skills 实现文件_

- [x] 14. 删除 Skills 测试目录
  - 执行 `rm -rf tests/skills/`
  - 确认删除 `tests/skills/SkillManager.test.ts`
  - _Requirements: 移除 Skills 实现文件_

- [x] 15. 编译验证代码变更
  - 运行 `npm run build` 验证无类型错误
  - 修复任何编译错误
  - _Requirements: 所有核心需求_

- [x] 16. 更新 MessageRouter 单元测试
  - 修改 `tests/core/MessageRouter.test.ts`
  - 更新 `buildAppendPrompt` 测试验证返回 `undefined`
  - 更新 `getEnabledToolNames` 测试验证包含 'Skill'
  - 删除 `buildSkillsPrompt` 和 `getSkillTools` 的所有测试
  - _Requirements: 测试覆盖更新_

- [x] 17. 添加 ToolRegistry 的 Skill 工具测试
  - 在 `tests/tools/ToolRegistry.test.ts` 中添加新测试套件
  - 验证 'Skill' 工具已注册
  - 验证 Skill 工具 category 为 AGENT
  - 验证 Skill 工具 dangerous 为 false
  - _Requirements: 测试覆盖更新_

- [x] 18. 更新 SessionManager 单元测试
  - 修改 `tests/core/SessionManager.test.ts`
  - 删除所有涉及 `loadedSkills` 字段的测试
  - 删除所有涉及 `Skill` 接口的测试
  - _Requirements: 测试覆盖更新_

- [x] 19. 创建 SDK Skills 集成测试
  - 创建 `tests/integration/sdk-agent-skills.test.ts`
  - 实现临时目录创建和测试 Skill 准备
  - 验证 settingSources 包含 'project'
  - 验证 allowedTools 包含 'Skill'
  - 验证 buildAppendPrompt 返回 undefined
  - 验证 settingSources 仅包含 ['project']
  - _Requirements: 测试覆盖更新_

- [x] 20. 运行完整测试套件
  - 执行 `npm test` 验证所有测试通过
  - 修复任何测试失败
  - _Requirements: 测试覆盖更新_

- [x] 21. 验证现有 Skills 文件格式
  - 检查 `.claude/skills/*/SKILL.md` 文件
  - 确认所有文件包含 `description` 字段
  - 确认 frontmatter 格式正确
  - _Requirements: 现有 Skills 兼容性_

- [x] 22. 手动验证 Skills 自动发现
  - 启动应用并检查日志
  - 验证 SDK 能够发现项目级 Skills
  - 询问 Claude "What skills are available?"
  - 确认 Claude 能列出所有可用 Skills
  - _Requirements: SDK Skills 自动发现_

- [x] 23. 手动验证 Skills 调用
  - 触发特定 Skill（如 "How do I create a custom MCP tool?" 触发 agent-sdk-dev）
  - 确认 Claude 自动识别并使用对应 Skill
  - 验证回答质量与之前一致
  - _Requirements: SDK Skills 自动发现, 现有 Skills 兼容性_

- [x] 24. 手动验证 settingSources 配置传递
  - 启用调试日志（如果支持）
  - 检查日志确认 settingSources: ['project']
  - 验证配置正确传递给 SDK
  - _Requirements: SDK Skills 自动发现_

- [x] 25. 更新开发者文档
  - 更新 `docs/zh/DEVELOPER_GUIDE.md` 添加 SDK Skills 使用说明
  - 更新 `docs/en/DEVELOPER_GUIDE.md` 添加英文版本
  - 删除所有 SkillManager 相关文档
  - _Requirements: 所有核心需求_

- [x] 26. 更新 API 文档
  - 更新 `docs/zh/API.md` 移除 SkillManager API
  - 更新 `docs/en/API.md` 移除英文版本
  - _Requirements: 公共 API 清理_

- [x] 27. 创建迁移指南
  - 创建 `MIGRATION_SKILLS.md` 文档
  - 说明重大变更和影响范围
  - 提供技术变更对比和迁移检查清单
  - _Requirements: 所有核心需求_

- [x] 28创建 Pull Request
  - 推送分支到远程仓库
  - 创建 PR 并填写详细描述
  - 链接相关 issue 或设计文档
  - _Requirements: 所有核心需求_
