/**
 * 上下文管理器测试
 *
 * 测试 ContextManager 的核心功能：
 * - Token 计数
 * - 消息重要性评分
 * - 历史消息压缩
 * - 文件片段提取
 * - 对话摘要生成
 * - 上下文窗口管理
 */

import {
  ContextManager,
} from '../../src/context/ContextManager';
import { Message } from '../../src/core/SessionManager';

describe('ContextManager', () => {
  let contextManager: ContextManager;

  // 创建测试消息的辅助函数
  const createMessage = (
    role: 'user' | 'assistant' | 'system',
    content: string,
    id?: string
  ): Message => ({
    id: id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    role,
    content,
    timestamp: new Date(),
  });

  beforeEach(() => {
    contextManager = new ContextManager({
      maxTokens: 10000,
      toolOutputReserveRatio: 0.2,
      compressionThreshold: 0.8,
      keepRecentMessages: 5,
    });
  });

  describe('Token 计数', () => {
    it('应该正确估算英文文本的 token 数', () => {
      const text = 'Hello, this is a test message.';
      const tokens = contextManager.estimateTokens(text);
      // 30 个字符，约 7-8 个 token
      expect(tokens).toBeGreaterThan(5);
      expect(tokens).toBeLessThan(15);
    });

    it('应该正确估算中文文本的 token 数', () => {
      const text = '你好，这是一条测试消息。';
      const tokens = contextManager.estimateTokens(text);
      // 中文字符通常每个约 1.5 个 token
      expect(tokens).toBeGreaterThan(10);
      expect(tokens).toBeLessThan(25);
    });

    it('应该正确估算混合文本的 token 数', () => {
      const text = 'Hello 你好 World 世界';
      const tokens = contextManager.estimateTokens(text);
      expect(tokens).toBeGreaterThan(5);
    });

    it('应该正确处理空文本', () => {
      expect(contextManager.estimateTokens('')).toBe(0);
    });

    it('应该正确计算消息的 token 数', () => {
      const message = createMessage('user', 'Hello, how are you?');
      const tokens = contextManager.estimateMessageTokens(message);
      // 包含角色标记的开销
      expect(tokens).toBeGreaterThan(4);
    });

    it('应该正确计算消息列表的总 token 数', () => {
      const messages = [
        createMessage('system', 'You are a helpful assistant.'),
        createMessage('user', 'Hello!'),
        createMessage('assistant', 'Hi there! How can I help you?'),
      ];

      const tokenCount = contextManager.countTokens(messages);

      expect(tokenCount.total).toBeGreaterThan(0);
      expect(tokenCount.messages).toBeGreaterThan(0);
      expect(tokenCount.systemPrompt).toBe(0); // 没有传入系统提示词
      expect(tokenCount.available).toBeLessThan(10000);
    });

    it('应该正确计算包含系统提示词的 token 数', () => {
      const messages = [createMessage('user', 'Hello!')];
      const systemPrompt = 'You are a helpful coding assistant.';

      const tokenCount = contextManager.countTokens(messages, systemPrompt);

      expect(tokenCount.systemPrompt).toBeGreaterThan(0);
      expect(tokenCount.total).toBe(tokenCount.systemPrompt + tokenCount.messages);
    });
  });

  describe('上下文窗口状态', () => {
    it('应该正确计算上下文窗口状态', () => {
      const messages = [
        createMessage('user', 'Hello!'),
        createMessage('assistant', 'Hi there!'),
      ];

      const state = contextManager.getContextWindowState(messages);

      expect(state.maxTokens).toBe(10000);
      expect(state.usedTokens).toBeGreaterThan(0);
      expect(state.usagePercent).toBeGreaterThan(0);
      expect(state.usagePercent).toBeLessThan(1);
      expect(state.nearLimit).toBe(false);
      expect(state.needsCompression).toBe(false);
    });

    it('应该在接近限制时标记需要压缩', () => {
      // 创建大量消息以接近限制
      const longContent = 'x'.repeat(30000); // 约 7500 个 token
      const messages = [createMessage('user', longContent)];

      const state = contextManager.getContextWindowState(messages);

      expect(state.nearLimit).toBe(true);
      expect(state.needsCompression).toBe(true);
    });
  });

  describe('消息重要性评分', () => {
    it('应该给系统消息最高分', () => {
      const messages = [
        createMessage('system', 'System instruction'),
        createMessage('user', 'User message'),
        createMessage('assistant', 'Assistant response'),
      ];

      const scored = contextManager.scoreMessages(messages);

      expect(scored[0].score).toBeGreaterThan(scored[1].score);
      expect(scored[0].importance).toBe('critical');
    });

    it('应该给最近的消息更高分', () => {
      const messages = [
        createMessage('user', 'Old message'),
        createMessage('assistant', 'Old response'),
        createMessage('user', 'Recent message'),
        createMessage('assistant', 'Recent response'),
      ];

      const scored = contextManager.scoreMessages(messages);

      // 最后一条消息应该比第一条分数高
      expect(scored[3].score).toBeGreaterThan(scored[0].score);
    });

    it('应该正确分类重要性级别', () => {
      const message = createMessage('system', 'Critical system message');
      const scored = contextManager.scoreMessage(message, 0, 1);

      expect(['critical', 'high', 'medium', 'low']).toContain(scored.importance);
    });

    it('应该包含估算的 token 数', () => {
      const message = createMessage('user', 'Test message');
      const scored = contextManager.scoreMessage(message, 0, 1);

      expect(scored.estimatedTokens).toBeGreaterThan(0);
    });
  });

  describe('消息压缩', () => {
    const createTestMessages = (count: number): Message[] => {
      const messages: Message[] = [];
      for (let i = 0; i < count; i++) {
        const role = i % 2 === 0 ? 'user' : 'assistant';
        messages.push(createMessage(role, `Message ${i}: ${'x'.repeat(100)}`, `msg-${i}`));
      }
      return messages;
    };

    it('应该使用 remove_old 策略压缩消息', () => {
      const messages = createTestMessages(20);

      const result = contextManager.compressMessages(messages, {
        strategy: 'remove_old',
        targetTokens: 500,
        keepRecentMessages: 5,
      });

      expect(result.messages.length).toBeLessThan(messages.length);
      expect(result.removedCount).toBeGreaterThan(0);
      expect(result.savedTokens).toBeGreaterThan(0);
    });

    it('应该使用 truncate 策略压缩消息', () => {
      const messages = createTestMessages(20);

      const result = contextManager.compressMessages(messages, {
        strategy: 'truncate',
        targetTokens: 500,
        keepRecentMessages: 5,
      });

      expect(result.messages.length).toBeLessThan(messages.length);
      expect(result.compressedTokens).toBeLessThanOrEqual(result.originalTokens);
    });

    it('应该使用 summarize 策略压缩消息并生成摘要', () => {
      const messages = createTestMessages(20);

      const result = contextManager.compressMessages(messages, {
        strategy: 'summarize',
        targetTokens: 1000,
        keepRecentMessages: 5,
        generateSummary: true,
      });

      expect(result.messages.length).toBeLessThan(messages.length);
      expect(result.summary).toBeDefined();
      expect(result.summary?.messageCount).toBeGreaterThan(0);
    });

    it('应该使用 smart 策略智能压缩消息', () => {
      const messages = [
        createMessage('system', 'System instruction', 'sys-1'),
        ...createTestMessages(15),
      ];

      const result = contextManager.compressMessages(messages, {
        strategy: 'smart',
        targetTokens: 800,
        keepRecentMessages: 5,
        keepSystemMessages: true,
      });

      // 应该保留系统消息
      const hasSystemMessage = result.messages.some((m) => m.role === 'system');
      expect(hasSystemMessage).toBe(true);
      expect(result.compressedTokens).toBeLessThanOrEqual(result.originalTokens);
    });

    it('应该保留系统消息', () => {
      const messages = [
        createMessage('system', 'Important system instruction', 'sys-1'),
        ...createTestMessages(10),
      ];

      const result = contextManager.compressMessages(messages, {
        strategy: 'remove_old',
        targetTokens: 300,
        keepRecentMessages: 3,
        keepSystemMessages: true,
      });

      const systemMessages = result.messages.filter((m) => m.role === 'system');
      expect(systemMessages.length).toBeGreaterThan(0);
    });
  });

  describe('对话摘要生成', () => {
    it('应该生成对话摘要', () => {
      const messages = [
        createMessage('user', '请帮我写一个排序函数'),
        createMessage('assistant', '好的，我来帮你写一个快速排序函数...'),
        createMessage('user', '能不能用冒泡排序？'),
        createMessage('assistant', '当然可以，冒泡排序实现如下...'),
      ];

      const summary = contextManager.generateSummary(messages);

      expect(summary.content).toBeTruthy();
      expect(summary.messageCount).toBe(4);
      expect(summary.summaryTokens).toBeLessThan(summary.originalTokens);
    });

    it('应该在摘要中包含关键信息', () => {
      const messages = [
        createMessage('user', '如何实现二叉树遍历？'),
        createMessage('assistant', '二叉树遍历有三种方式：前序、中序、后序...'),
      ];

      const summary = contextManager.generateSummary(messages);

      expect(summary.content).toContain('用户');
    });

    it('应该记录摘要创建时间', () => {
      const messages = [createMessage('user', 'Test message')];
      const summary = contextManager.generateSummary(messages);

      expect(summary.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('文件片段提取', () => {
    const sampleCode = `
import { useState } from 'react';

interface User {
  id: number;
  name: string;
  email: string;
}

function UserList({ users }: { users: User[] }) {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const handleSelect = (user: User) => {
    setSelectedUser(user);
  };

  return (
    <div>
      {users.map(user => (
        <div key={user.id} onClick={() => handleSelect(user)}>
          {user.name}
        </div>
      ))}
    </div>
  );
}

export function App() {
  const users: User[] = [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
  ];

  return <UserList users={users} />;
}
`.trim();

    it('应该提取与查询相关的代码片段', () => {
      const fragments = contextManager.extractFileFragments(
        sampleCode,
        'UserList.tsx',
        'UserList component',
        3,
        20
      );

      expect(fragments.length).toBeGreaterThan(0);
      expect(fragments[0].path).toBe('UserList.tsx');
      expect(fragments[0].content).toBeTruthy();
    });

    it('应该返回带有行号的片段', () => {
      const fragments = contextManager.extractFileFragments(
        sampleCode,
        'test.ts',
        'function',
        2,
        15
      );

      expect(fragments.length).toBeGreaterThan(0);
      expect(fragments[0].startLine).toBeGreaterThan(0);
      expect(fragments[0].endLine).toBeGreaterThanOrEqual(fragments[0].startLine);
    });

    it('应该返回相关性分数', () => {
      const fragments = contextManager.extractFileFragments(
        sampleCode,
        'test.ts',
        'User interface',
        3,
        20
      );

      expect(fragments.length).toBeGreaterThan(0);
      // 至少有一个片段应该有相关性分数
      const hasRelevantFragment = fragments.some((f) => f.relevanceScore >= 0);
      expect(hasRelevantFragment).toBe(true);
    });

    it('应该在没有匹配时返回文件开头', () => {
      const fragments = contextManager.extractFileFragments(
        sampleCode,
        'test.ts',
        'xyz123nonexistent',
        1,
        10
      );

      expect(fragments.length).toBe(1);
      expect(fragments[0].startLine).toBe(1);
    });

    it('应该限制片段数量', () => {
      const fragments = contextManager.extractFileFragments(
        sampleCode,
        'test.ts',
        'function const',
        2,
        10
      );

      expect(fragments.length).toBeLessThanOrEqual(2);
    });
  });

  describe('自动上下文管理', () => {
    it('应该在不需要压缩时返回原始消息', () => {
      const messages = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Hi there!'),
      ];

      const result = contextManager.autoManageContext(messages);

      expect(result.compressed).toBe(false);
      expect(result.messages).toEqual(messages);
      expect(result.result).toBeUndefined();
    });

    it('应该在需要时自动压缩', () => {
      // 创建大量消息以触发压缩
      const longContent = 'x'.repeat(30000);
      const messages = [
        createMessage('user', longContent),
        createMessage('assistant', longContent),
      ];

      const result = contextManager.autoManageContext(messages);

      expect(result.compressed).toBe(true);
      expect(result.result).toBeDefined();
    });
  });

  describe('配置管理', () => {
    it('应该返回当前配置', () => {
      const config = contextManager.getConfig();

      expect(config.maxTokens).toBe(10000);
      expect(config.compressionThreshold).toBe(0.8);
    });

    it('应该允许更新配置', () => {
      contextManager.updateConfig({ maxTokens: 20000 });
      const config = contextManager.getConfig();

      expect(config.maxTokens).toBe(20000);
    });

    it('应该使用默认配置', () => {
      const defaultManager = new ContextManager();
      const config = defaultManager.getConfig();

      expect(config.maxTokens).toBe(200000);
      expect(config.toolOutputReserveRatio).toBe(0.2);
    });
  });

  describe('摘要管理', () => {
    it('应该存储生成的摘要', () => {
      const messages = [
        createMessage('user', 'Test message 1'),
        createMessage('assistant', 'Response 1'),
        createMessage('user', 'Test message 2'),
        createMessage('assistant', 'Response 2'),
      ];

      // 使用 summarize 策略触发摘要生成
      contextManager.compressMessages(messages, {
        strategy: 'summarize',
        targetTokens: 100,
        keepRecentMessages: 1,
        generateSummary: true,
      });

      const summaries = contextManager.getSummaries();
      expect(summaries.length).toBeGreaterThan(0);
    });

    it('应该能够清除摘要历史', () => {
      const messages = [
        createMessage('user', 'Test'),
        createMessage('assistant', 'Response'),
      ];

      contextManager.compressMessages(messages, {
        strategy: 'summarize',
        targetTokens: 50,
        keepRecentMessages: 0,
        generateSummary: true,
      });

      contextManager.clearSummaries();
      const summaries = contextManager.getSummaries();

      expect(summaries.length).toBe(0);
    });
  });

  describe('needsCompression', () => {
    it('应该在上下文较小时返回 false', () => {
      const messages = [createMessage('user', 'Hello')];
      expect(contextManager.needsCompression(messages)).toBe(false);
    });

    it('应该在上下文较大时返回 true', () => {
      const longContent = 'x'.repeat(35000);
      const messages = [createMessage('user', longContent)];
      expect(contextManager.needsCompression(messages)).toBe(true);
    });
  });
});
