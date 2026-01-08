# Implementation Plan: System Prompt Append Config

## Overview

此计划根据 `.self_spec/2026-01-08-system-prompt-append-config/design.md` 与对应 spec 拆解成可执行任务，目标是采用 Claude Agent SDK 预设提示词与项目级 CLAUDE.md 自动加载机制，并限制 append 仅用于技能指令。

## Tasks

- [ ] 1. 移除旧的系统提示词拼接逻辑
  - 删除 `buildSystemPrompt()`、`getDefaultSystemInstructions()` 等遗留方法
  - 清理不再需要的常量/字符串模板
  - _Requirements: Claude Code Preset System Prompt_

- [ ] 2. 实现 `getSystemPromptOptions()` helper
  - 返回 `{ type: 'preset', preset: 'claude_code', append?: string }`
  - 确保不会拼接 CLAUDE.md，append 引用 `buildAppendPrompt()`
  - _Requirements: Claude Code Preset System Prompt, Append Prompt Content Scope_

- [ ] 3. 实现 `buildAppendPrompt()` 以加载技能指令
  - 聚合启用技能与动态指令，输出 Markdown 片段
  - 无附加内容时返回 `undefined`
  - _Requirements: Append Prompt Content Scope_

- [ ] 4. 实现 `getSettingSources()` 并限制为项目级
  - 确认返回 `['project']`
  - 在任何场景下都不加入 `user` 级来源
  - _Requirements: Project-Only CLAUDE.md Loading_

- [ ] 5. 更新 `buildQueryOptions()` 使用新 helper
  - 注入 `systemPrompt` 与 `settingSources`
  - 确保 Query Options 其余结构保持原行为
  - _Requirements: Query Options Refactor_

- [ ] 6. 回归与新增测试
  - 覆盖系统提示配置、append 构造与 settingSources
  - 确认未再访问用户级 CLAUDE.md
  - _Requirements: 全部_
