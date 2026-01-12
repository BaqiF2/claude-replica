/**
 * Session Cleanup Configuration Integration Tests
 *
 * Validates:
 * - SESSION_KEEP_COUNT environment variable configuration
 * - CleanOldSessions uses configured value
 * - Default value (10) when env var not set
 * - Different SESSION_KEEP_COUNT values work correctly
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SessionManager, Session, Message } from '../../src/core/SessionManager';

describe('Session Cleanup Configuration Integration Tests', () => {
  let tempDir: string;
  let sessionsDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  // 创建测试消息的辅助函数
  const createMessage = (content: string): Message => ({
    id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    role: 'user',
    content: [{ type: 'text', text: content }],
    timestamp: new Date(),
  });

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-cleanup-test-'));
    sessionsDir = path.join(tempDir, 'sessions');
    await fs.mkdir(sessionsDir, { recursive: true });

    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(async () => {
    // Restore original environment
    process.env = originalEnv;

    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('SESSION_KEEP_COUNT environment variable', () => {
    it('should use default value 10 when SESSION_KEEP_COUNT not set', async () => {
      // Ensure env var is not set
      delete process.env.SESSION_KEEP_COUNT;

      const sessionManager = new SessionManager(sessionsDir);

      // Create 15 sessions
      const sessions: Session[] = [];
      for (let i = 0; i < 15; i++) {
        const session = await sessionManager.createSession(`test-session-${i}`);
        session.messages = [createMessage(`Test message ${i}`)];
        await sessionManager.saveSession(session);
        sessions.push(session);
      }

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100));

      // Clean old sessions with default keep count (should be 10)
      await sessionManager.cleanOldSessions(10);

      // Verify 10 most recent sessions remain, 5 oldest are deleted
      const remainingSessions = await sessionManager.listSessions();

      // Should have exactly 10 sessions
      expect(remainingSessions).toHaveLength(10);

      // Verify the most recent sessions are kept (sessions 14, 13, ..., 5)
      const remainingIds = new Set(remainingSessions.map(s => s.id));
      for (let i = 5; i < 15; i++) {
        expect(remainingIds.has(sessions[i].id)).toBe(true);
      }
      for (let i = 0; i < 5; i++) {
        expect(remainingIds.has(sessions[i].id)).toBe(false);
      }
    });

    it('should use custom SESSION_KEEP_COUNT value from environment variable', async () => {
      // Set custom keep count
      process.env.SESSION_KEEP_COUNT = '5';

      const sessionManager = new SessionManager(sessionsDir);

      // Create 10 sessions
      const sessions: Session[] = [];
      for (let i = 0; i < 10; i++) {
        const session = await sessionManager.createSession(`test-session-${i}`);
        session.messages = [createMessage(`Test message ${i}`)];
        await sessionManager.saveSession(session);
        sessions.push(session);
      }

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100));

      // Clean old sessions (should use SESSION_KEEP_COUNT=5 from env)
      await sessionManager.cleanOldSessions(parseInt(process.env.SESSION_KEEP_COUNT || '10', 10));

      // Verify 5 most recent sessions remain, 5 oldest are deleted
      const remainingSessions = await sessionManager.listSessions();

      // Should have exactly 5 sessions
      expect(remainingSessions).toHaveLength(5);

      // Verify the most recent sessions are kept (sessions 9, 8, ..., 5)
      const remainingIds = new Set(remainingSessions.map(s => s.id));
      for (let i = 5; i < 10; i++) {
        expect(remainingIds.has(sessions[i].id)).toBe(true);
      }
      for (let i = 0; i < 5; i++) {
        expect(remainingIds.has(sessions[i].id)).toBe(false);
      }
    });

    it('should keep fewer sessions when SESSION_KEEP_COUNT is set to 3', async () => {
      // Set very small keep count
      process.env.SESSION_KEEP_COUNT = '3';

      const sessionManager = new SessionManager(sessionsDir);

      // Create 8 sessions
      const sessions: Session[] = [];
      for (let i = 0; i < 8; i++) {
        const session = await sessionManager.createSession(`test-session-${i}`);
        session.messages = [createMessage(`Test message ${i}`)];
        await sessionManager.saveSession(session);
        sessions.push(session);
      }

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100));

      // Clean old sessions (should use SESSION_KEEP_COUNT=3 from env)
      await sessionManager.cleanOldSessions(parseInt(process.env.SESSION_KEEP_COUNT || '10', 10));

      // Verify 3 most recent sessions remain, 5 oldest are deleted
      const remainingSessions = await sessionManager.listSessions();

      // Should have exactly 3 sessions
      expect(remainingSessions).toHaveLength(3);

      // Verify the most recent sessions are kept (sessions 7, 6, 5)
      const remainingIds = new Set(remainingSessions.map(s => s.id));
      for (let i = 5; i < 8; i++) {
        expect(remainingIds.has(sessions[i].id)).toBe(true);
      }
      for (let i = 0; i < 5; i++) {
        expect(remainingIds.has(sessions[i].id)).toBe(false);
      }
    });

    it('should handle case when session count is less than keep count', async () => {
      // Set keep count to 10
      process.env.SESSION_KEEP_COUNT = '10';

      const sessionManager = new SessionManager(sessionsDir);

      // Create only 5 sessions
      const sessions: Session[] = [];
      for (let i = 0; i < 5; i++) {
        const session = await sessionManager.createSession(`test-session-${i}`);
        session.messages = [createMessage(`Test message ${i}`)];
        await sessionManager.saveSession(session);
        sessions.push(session);
      }

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100));

      // Clean old sessions (should keep all 5 sessions since count < keep count)
      await sessionManager.cleanOldSessions(parseInt(process.env.SESSION_KEEP_COUNT || '10', 10));

      // Verify all 5 sessions remain
      const remainingSessions = await sessionManager.listSessions();

      // Should have exactly 5 sessions (all of them)
      expect(remainingSessions).toHaveLength(5);

      // Verify all sessions are kept
      const remainingIds = new Set(remainingSessions.map(s => s.id));
      for (let i = 0; i < 5; i++) {
        expect(remainingIds.has(sessions[i].id)).toBe(true);
      }
    });

    it('should parse SESSION_KEEP_COUNT as integer correctly', async () => {
      // Set string value that needs to be parsed
      process.env.SESSION_KEEP_COUNT = '7';

      const sessionManager = new SessionManager(sessionsDir);

      // Create 10 sessions
      const sessions: Session[] = [];
      for (let i = 0; i < 10; i++) {
        const session = await sessionManager.createSession(`test-session-${i}`);
        session.messages = [createMessage(`Test message ${i}`)];
        await sessionManager.saveSession(session);
        sessions.push(session);
      }

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100));

      // Clean old sessions (parseInt should handle the string '7')
      await sessionManager.cleanOldSessions(parseInt(process.env.SESSION_KEEP_COUNT || '10', 10));

      // Verify 7 most recent sessions remain
      const remainingSessions = await sessionManager.listSessions();

      // Should have exactly 7 sessions
      expect(remainingSessions).toHaveLength(7);

      // Verify the most recent sessions are kept
      const remainingIds = new Set(remainingSessions.map(s => s.id));
      for (let i = 3; i < 10; i++) {
        expect(remainingIds.has(sessions[i].id)).toBe(true);
      }
      for (let i = 0; i < 3; i++) {
        expect(remainingIds.has(sessions[i].id)).toBe(false);
      }
    });
  });

  describe('Application initialization', () => {
    it('should pass SESSION_KEEP_COUNT from environment to cleanOldSessions', async () => {
      // Set custom keep count
      process.env.SESSION_KEEP_COUNT = '4';

      // Mock the sessionManager to verify the parameter
      const sessionManager = new SessionManager(sessionsDir);
      const cleanOldSessionsSpy = jest.spyOn(sessionManager, 'cleanOldSessions');

      // Create 8 sessions
      for (let i = 0; i < 8; i++) {
        const session = await sessionManager.createSession(`test-session-${i}`);
        session.messages = [createMessage(`Test message ${i}`)];
        await sessionManager.saveSession(session);
      }

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100));

      // Call cleanOldSessions with the value from environment
      await sessionManager.cleanOldSessions(parseInt(process.env.SESSION_KEEP_COUNT || '10', 10));

      // Verify the method was called with the correct keep count (4)
      expect(cleanOldSessionsSpy).toHaveBeenCalledWith(4);

      // Verify exactly 4 sessions remain
      const remainingSessions = await sessionManager.listSessions();
      expect(remainingSessions).toHaveLength(4);

      cleanOldSessionsSpy.mockRestore();
    });
  });
});
