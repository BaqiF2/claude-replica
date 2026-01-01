# Implementation Plan: SDK Integration

## Overview

本实现计划将 Claude Replica 项目中的模拟响应替换为真实的 Claude Agent SDK 调用。实现将分阶段进行，从核心 SDK 执行器开始，逐步集成到现有架构中。

## Tasks

- [x] 1. 创建 SDKQueryExecutor 核心组件
  - [x] 1.1 创建 `src/sdk/SDKQueryExecutor.ts` 文件
    - 定义 SDKQueryOptions 接口
    - 定义 SDKQueryResult 接口
    - 实现 SDKQueryExecutor 类骨架
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 实现 SDK query() 函数调用
    - 导入 `@anthropic-ai/claude-agent-sdk` 的 query 函数
    - 实现 execute() 方法调用 SDK
    - 处理 AsyncGenerator 迭代
    - _Requirements: 1.1, 1.3_

  - [x] 1.3 编写属性测试：消息流消费
    - **Property 2: Message Stream Consumption**
    - **Validates: Requirements 1.3**

  - [x] 1.4 实现消息处理逻辑
    - 处理 SDKAssistantMessage 提取文本
    - 处理 SDKResultMessage 判断成功/失败
    - 累积响应文本
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 1.5 编写属性测试：文本累积
    - **Property 3: Text Accumulation from Assistant Messages**
    - **Validates: Requirements 2.1**

- [x] 2. 实现选项映射和配置传递
  - [x] 2.1 创建选项映射函数
    - 实现 mapToSDKOptions() 函数
    - 映射所有 QueryOptions 字段到 SDK Options
    - _Requirements: 1.2, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 2.2 编写属性测试：SDK 选项完整性
    - **Property 1: SDK Options Completeness**
    - **Validates: Requirements 1.2, 6.1, 6.2, 6.3, 6.4, 6.5**

  - [x] 2.3 创建 SDK 模块导出文件
    - 创建 `src/sdk/index.ts`
    - 导出 SDKQueryExecutor 和相关类型
    - _Requirements: 1.1_

- [x] 3. Checkpoint - 确保核心组件测试通过
  - 确保所有测试通过，如有问题请询问用户

- [x] 4. 实现错误处理
  - [x] 4.1 创建错误分类系统
    - 定义 SDKErrorType 枚举
    - 实现 classifySDKError() 函数
    - 定义错误消息映射
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 4.2 编写属性测试：错误类型分类
    - **Property 7: Error Type Classification**
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [x] 4.3 实现中断处理
    - 添加 AbortController 支持
    - 实现 interrupt() 方法
    - 处理 AbortError
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 5. 集成到 Application 类
  - [x] 5.1 修改 Application 类添加 SDKQueryExecutor
    - 在构造函数中初始化 SDKQueryExecutor
    - 添加 currentAbortController 属性
    - _Requirements: 1.1_

  - [x] 5.2 重写 executeQuery() 方法
    - 移除模拟响应代码
    - 调用 SDKQueryExecutor.execute()
    - 处理返回结果
    - _Requirements: 1.1, 2.2, 2.3_

  - [x] 5.3 编写属性测试：成功结果返回
    - **Property 4: Success Result Returns Accumulated Response**
    - **Validates: Requirements 2.2**

  - [x] 5.4 编写属性测试：错误结果抛出异常
    - **Property 5: Error Result Throws Exception**
    - **Validates: Requirements 2.3**

  - [x] 5.5 更新中断处理逻辑
    - 修改 handleInterrupt() 调用 AbortController
    - 更新 UI 显示中断状态
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 6. 实现会话消息同步
  - [x] 6.1 更新会话存储逻辑
    - 确保用户消息和助手响应都被存储
    - 添加 usage 统计信息记录
    - _Requirements: 3.1, 3.3_

  - [x] 6.2 编写属性测试：会话消息持久化
    - **Property 6: Session Message Persistence**
    - **Validates: Requirements 3.1**

  - [x] 6.3 实现会话恢复支持
    - 在恢复会话时传递历史消息
    - 验证历史消息格式兼容
    - _Requirements: 3.2_

- [x] 7. Checkpoint - 确保集成测试通过
  - 确保所有测试通过，如有问题请询问用户

- [x] 8. 更新 StreamingMessageProcessor 兼容性
  - [x] 8.1 更新消息类型定义
    - 对齐 SDK 的 SDKMessage 类型
    - 更新 ContentBlock 类型定义
    - _Requirements: 2.1_

  - [x] 8.2 增强流式输出支持
    - 支持 SDKPartialAssistantMessage 处理
    - 优化 UI 更新频率
    - _Requirements: 2.4_

- [x] 9. Final Checkpoint - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户

## Notes

- 所有任务都是必需的，包括属性测试
- 每个任务都引用了具体的需求编号以便追溯
- Checkpoint 任务用于确保增量验证
- 属性测试验证通用正确性属性
- 单元测试验证具体示例和边界情况
