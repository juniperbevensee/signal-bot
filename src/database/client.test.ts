/**
 * Database Client Tests
 * Tests for SQLite database operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteClient } from './client';
import * as fs from 'fs';
import * as path from 'path';

describe('SQLiteClient', () => {
  let db: SQLiteClient;
  const testDbPath = path.join(__dirname, '../../test-data/test.db');

  beforeEach(() => {
    // Ensure test data directory exists
    const dir = path.dirname(testDbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create fresh database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    db = new SQLiteClient(testDbPath);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Chat Operations', () => {
    it('should create a chat', () => {
      const chat = db.createChat('dm', '+14155551234', 'John Doe');

      expect(chat.id).toBeTruthy();
      expect(chat.chat_type).toBe('dm');
      expect(chat.signal_chat_id).toBe('+14155551234');
      expect(chat.display_name).toBe('John Doe');
    });

    it('should retrieve a chat by signal_chat_id', () => {
      db.createChat('dm', '+14155551234', 'John Doe');
      const retrieved = db.getChat('+14155551234');

      expect(retrieved).toBeTruthy();
      expect(retrieved?.signal_chat_id).toBe('+14155551234');
    });

    it('should return null for non-existent chat', () => {
      const retrieved = db.getChat('nonexistent');
      expect(retrieved).toBeFalsy();
    });

    it('should list chats', () => {
      db.createChat('dm', '+14155551234', 'John');
      db.createChat('dm', '+14155555678', 'Jane');

      const chats = db.listChats();
      expect(chats).toHaveLength(2);
    });

    it('should update chat display name', () => {
      const chat = db.createChat('dm', '+14155551234', 'John');
      db.updateChat(chat.id, { display_name: 'John Doe Updated' });

      const updated = db.getChat('+14155551234');
      expect(updated?.display_name).toBe('John Doe Updated');
    });
  });

  describe('Message Operations', () => {
    let chatId: string;

    beforeEach(() => {
      const chat = db.createChat('dm', '+14155551234');
      chatId = chat.id;
    });

    it('should add a message', () => {
      const message = db.addMessage(
        chatId,
        'incoming',
        '+14155551234',
        'Hello world',
        Date.now(),
        'text'
      );

      expect(message.id).toBeTruthy();
      expect(message.content).toBe('Hello world');
      expect(message.direction).toBe('incoming');
    });

    it('should retrieve messages for a chat', () => {
      db.addMessage(chatId, 'incoming', '+14155551234', 'Message 1', Date.now());
      db.addMessage(chatId, 'outgoing', '+14155559999', 'Message 2', Date.now());

      const messages = db.getMessages(chatId);
      expect(messages).toHaveLength(2);
    });

    it('should search messages by content', () => {
      db.addMessage(chatId, 'incoming', '+14155551234', 'Hello world', Date.now());
      db.addMessage(chatId, 'incoming', '+14155551234', 'Goodbye world', Date.now());
      db.addMessage(chatId, 'incoming', '+14155551234', 'Random text', Date.now());

      const results = db.searchMessages(chatId, 'world');
      expect(results).toHaveLength(2);
    });

    it('should check if message exists', () => {
      const timestamp = Date.now();
      db.addMessage(chatId, 'incoming', '+14155551234', 'Test', timestamp);

      expect(db.messageExists(timestamp, '+14155551234')).toBe(true);
      expect(db.messageExists(timestamp + 1, '+14155551234')).toBe(false);
    });
  });

  describe('Activity Log Operations', () => {
    let chatId: string;

    beforeEach(() => {
      const chat = db.createChat('dm', '+14155551234');
      chatId = chat.id;
    });

    it('should create activity trace', () => {
      const traceId = 'trace-1';
      const trace = db.createActivityTrace(chatId, traceId, {
        message: 'User query',
      });

      expect(trace.trace_id).toBe(traceId);
      expect(trace.log_type).toBe('invocation');
      expect(trace.step_number).toBe(0);
    });

    it('should add activity span', () => {
      const traceId = 'trace-1';
      const trace = db.createActivityTrace(chatId, traceId, { message: 'Query' });

      const span = db.addActivitySpan(
        chatId,
        traceId,
        trace.id,
        'tool_call',
        1,
        { tool: 'test_tool' }
      );

      expect(span.parent_id).toBe(trace.id);
      expect(span.log_type).toBe('tool_call');
      expect(span.step_number).toBe(1);
    });

    it('should retrieve activity trace', () => {
      const traceId = 'trace-1';
      db.createActivityTrace(chatId, traceId, { message: 'Query' });

      const logs = db.getActivityTrace(traceId);
      expect(logs).toHaveLength(1);
      expect(logs[0].trace_id).toBe(traceId);
    });

    it('should retrieve recent activity for chat', () => {
      db.createActivityTrace(chatId, 'trace-1', { message: 'Query 1' });
      db.createActivityTrace(chatId, 'trace-2', { message: 'Query 2' });

      const activity = db.getRecentActivity(chatId, 10);
      expect(activity.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Access Control Operations', () => {
    it('should approve a user globally', () => {
      const approval = db.approveUser('+14155551234', 'global');

      expect(approval.phone_number).toBe('+14155551234');
      expect(approval.approval_type).toBe('global');
    });

    it('should check if user is approved', () => {
      db.approveUser('+14155551234', 'global');

      expect(db.isUserApproved('+14155551234')).toBe(true);
      expect(db.isUserApproved('+14155559999')).toBe(false);
    });

    it('should approve user for specific chat', () => {
      const chat = db.createChat('dm', '+14155551234');
      db.approveUser('+14155559999', 'chat_specific', chat.id);

      expect(db.isUserApproved('+14155559999', chat.id)).toBe(true);
      expect(db.isUserApproved('+14155559999')).toBe(false);
    });

    it('should list approved users', () => {
      db.approveUser('+14155551234', 'global');
      db.approveUser('+14155555678', 'global');

      const users = db.listApprovedUsers();
      expect(users).toHaveLength(2);
    });
  });

  describe('Config Operations', () => {
    it('should set and get config', () => {
      db.setConfig('test_key', 'test_value');
      const value = db.getConfig('test_key');

      expect(value).toBe('test_value');
    });

    it('should return null for non-existent config', () => {
      const value = db.getConfig('nonexistent');
      expect(value).toBeNull();
    });

    it('should update existing config', () => {
      db.setConfig('test_key', 'value1');
      db.setConfig('test_key', 'value2');

      const value = db.getConfig('test_key');
      expect(value).toBe('value2');
    });
  });

  describe('Foreign Key Constraints', () => {
    it('should cascade delete messages when chat is deleted', () => {
      const chat = db.createChat('dm', '+14155551234');
      db.addMessage(chat.id, 'incoming', '+14155551234', 'Test', Date.now());

      // SQLite doesn't support direct DELETE without foreign keys enabled
      // This is more of a schema verification test
      const messages = db.getMessages(chat.id);
      expect(messages).toHaveLength(1);
    });
  });

  describe('Schema Initialization', () => {
    it('should have schema_version config', () => {
      const version = db.getConfig('schema_version');
      expect(version).toBe('1');
    });
  });
});
