/**
 * Database client for Signal Bot
 * Provides a simple interface for SQLite operations
 */

import Database from 'better-sqlite3';
import {
  Chat,
  Message,
  ActivityLog,
  ApprovedUser,
  BotConfig,
  SCHEMA_SQL,
  generateId,
  now,
  stringifyMetadata,
} from './schema';
import { escapeLikePattern } from '../utils/security';

// ============================================================================
// Database Client Interface
// ============================================================================

export interface DatabaseClient {
  // Chat operations
  getChat(signalChatId: string): Chat | null;
  createChat(chatType: 'dm' | 'group', signalChatId: string, displayName?: string): Chat;
  updateChat(chatId: string, updates: Partial<Pick<Chat, 'display_name' | 'metadata'>>): void;
  listChats(limit?: number): Chat[];

  // Message operations
  addMessage(
    chatId: string,
    direction: 'incoming' | 'outgoing',
    sender: string,
    content: string | null,
    signalTimestamp: number,
    messageType?: 'text' | 'reaction' | 'attachment' | 'other',
    metadata?: any
  ): Message;
  getMessages(chatId: string, limit?: number, offset?: number): Message[];
  searchMessages(chatId: string, query: string, limit?: number): Message[];
  messageExists(signalTimestamp: number, sender: string): boolean;

  // Activity log operations
  createActivityTrace(chatId: string, traceId: string, content: any): ActivityLog;
  addActivitySpan(
    chatId: string,
    traceId: string,
    parentId: string,
    logType: 'tool_call' | 'tool_result' | 'response' | 'error',
    stepNumber: number,
    content: any
  ): ActivityLog;
  getActivityTrace(traceId: string): ActivityLog[];
  getRecentActivity(chatId: string, limit?: number): ActivityLog[];

  // Access control operations
  isUserApproved(phoneNumber: string, chatId?: string): boolean;
  approveUser(
    phoneNumber: string,
    approvalType: 'global' | 'chat_specific',
    chatId?: string,
    approvedBy?: string,
    notes?: string
  ): ApprovedUser;
  listApprovedUsers(): ApprovedUser[];

  // Config operations
  getConfig(key: string): string | null;
  setConfig(key: string, value: string): void;

  // Lifecycle
  close(): void;
}

// ============================================================================
// SQLite Client Implementation
// ============================================================================

export class SQLiteClient implements DatabaseClient {
  private _db: Database.Database;

  constructor(dbPath: string) {
    this._db = new Database(dbPath);
    this._db.pragma('journal_mode = WAL'); // Better concurrency
    this._db.pragma('foreign_keys = ON'); // Enforce foreign keys
    this.initialize();
  }

  /** Get the underlying better-sqlite3 database instance */
  get db(): Database.Database {
    return this._db;
  }

  private initialize(): void {
    // Run schema SQL to create tables and indexes
    this._db.exec(SCHEMA_SQL);

    // Set initial schema version if not exists
    const version = this.getConfig('schema_version');
    if (!version) {
      this.setConfig('schema_version', '1');
    }
  }

  // ==========================================================================
  // Chat Operations
  // ==========================================================================

  getChat(signalChatId: string): Chat | null {
    const stmt = this._db.prepare(
      'SELECT * FROM chats WHERE signal_chat_id = ?'
    );
    return stmt.get(signalChatId) as Chat | null;
  }

  createChat(
    chatType: 'dm' | 'group',
    signalChatId: string,
    displayName?: string
  ): Chat {
    const id = generateId();
    const timestamp = now();

    const stmt = this._db.prepare(`
      INSERT INTO chats (id, chat_type, signal_chat_id, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, chatType, signalChatId, displayName || null, timestamp, timestamp);

    return {
      id,
      chat_type: chatType,
      signal_chat_id: signalChatId,
      display_name: displayName || null,
      created_at: timestamp,
      updated_at: timestamp,
      metadata: null,
    };
  }

  updateChat(
    chatId: string,
    updates: Partial<Pick<Chat, 'display_name' | 'metadata'>>
  ): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.display_name !== undefined) {
      fields.push('display_name = ?');
      values.push(updates.display_name);
    }

    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(updates.metadata);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(now());
    values.push(chatId);

    const stmt = this._db.prepare(
      `UPDATE chats SET ${fields.join(', ')} WHERE id = ?`
    );
    stmt.run(...values);
  }

  listChats(limit: number = 50): Chat[] {
    const stmt = this._db.prepare(`
      SELECT * FROM chats
      ORDER BY updated_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as Chat[];
  }

  // ==========================================================================
  // Message Operations
  // ==========================================================================

  addMessage(
    chatId: string,
    direction: 'incoming' | 'outgoing',
    sender: string,
    content: string | null,
    signalTimestamp: number,
    messageType: 'text' | 'reaction' | 'attachment' | 'other' = 'text',
    metadata?: any
  ): Message {
    const id = generateId();
    const timestamp = now();

    const stmt = this._db.prepare(`
      INSERT INTO messages (
        id, chat_id, direction, sender, content,
        timestamp, signal_timestamp, message_type, metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      chatId,
      direction,
      sender,
      content,
      timestamp,
      signalTimestamp,
      messageType,
      stringifyMetadata(metadata)
    );

    // Update chat's updated_at timestamp
    this._db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(timestamp, chatId);

    return {
      id,
      chat_id: chatId,
      direction,
      sender,
      content,
      timestamp,
      signal_timestamp: signalTimestamp,
      message_type: messageType,
      metadata: stringifyMetadata(metadata),
    };
  }

  getMessages(chatId: string, limit: number = 50, offset: number = 0): Message[] {
    const stmt = this._db.prepare(`
      SELECT * FROM messages
      WHERE chat_id = ?
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(chatId, limit, offset) as Message[];
  }

  searchMessages(chatId: string, query: string, limit: number = 20): Message[] {
    const stmt = this._db.prepare(`
      SELECT * FROM messages
      WHERE chat_id = ? AND content LIKE ? ESCAPE '\\'
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const escapedQuery = escapeLikePattern(query);
    return stmt.all(chatId, `%${escapedQuery}%`, limit) as Message[];
  }

  messageExists(signalTimestamp: number, sender: string): boolean {
    const stmt = this._db.prepare(
      'SELECT 1 FROM messages WHERE signal_timestamp = ? AND sender = ? LIMIT 1'
    );
    return stmt.get(signalTimestamp, sender) !== undefined;
  }

  // ==========================================================================
  // Activity Log Operations
  // ==========================================================================

  createActivityTrace(chatId: string, traceId: string, content: any): ActivityLog {
    const id = generateId();
    const timestamp = now();

    const stmt = this._db.prepare(`
      INSERT INTO activity_logs (
        id, chat_id, trace_id, parent_id, log_type, step_number, content, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      chatId,
      traceId,
      null, // Root trace has no parent
      'invocation',
      0, // Step 0 is the initial invocation
      JSON.stringify(content),
      timestamp
    );

    return {
      id,
      chat_id: chatId,
      trace_id: traceId,
      parent_id: null,
      log_type: 'invocation',
      step_number: 0,
      content: JSON.stringify(content),
      created_at: timestamp,
      metadata: null,
    };
  }

  addActivitySpan(
    chatId: string,
    traceId: string,
    parentId: string,
    logType: 'tool_call' | 'tool_result' | 'response' | 'error',
    stepNumber: number,
    content: any
  ): ActivityLog {
    const id = generateId();
    const timestamp = now();

    const stmt = this._db.prepare(`
      INSERT INTO activity_logs (
        id, chat_id, trace_id, parent_id, log_type, step_number, content, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      chatId,
      traceId,
      parentId,
      logType,
      stepNumber,
      JSON.stringify(content),
      timestamp
    );

    return {
      id,
      chat_id: chatId,
      trace_id: traceId,
      parent_id: parentId,
      log_type: logType,
      step_number: stepNumber,
      content: JSON.stringify(content),
      created_at: timestamp,
      metadata: null,
    };
  }

  getActivityTrace(traceId: string): ActivityLog[] {
    const stmt = this._db.prepare(`
      SELECT * FROM activity_logs
      WHERE trace_id = ?
      ORDER BY step_number ASC
    `);
    return stmt.all(traceId) as ActivityLog[];
  }

  getRecentActivity(chatId: string, limit: number = 20): ActivityLog[] {
    const stmt = this._db.prepare(`
      SELECT * FROM activity_logs
      WHERE chat_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(chatId, limit) as ActivityLog[];
  }

  // ==========================================================================
  // Access Control Operations
  // ==========================================================================

  isUserApproved(phoneNumber: string, chatId?: string): boolean {
    // Check for global approval
    const globalStmt = this._db.prepare(`
      SELECT 1 FROM approved_users
      WHERE phone_number = ? AND approval_type = 'global'
      LIMIT 1
    `);
    if (globalStmt.get(phoneNumber)) {
      return true;
    }

    // Check for chat-specific approval if chatId provided
    if (chatId) {
      const chatStmt = this._db.prepare(`
        SELECT 1 FROM approved_users
        WHERE phone_number = ? AND approval_type = 'chat_specific' AND chat_id = ?
        LIMIT 1
      `);
      if (chatStmt.get(phoneNumber, chatId)) {
        return true;
      }
    }

    return false;
  }

  approveUser(
    phoneNumber: string,
    approvalType: 'global' | 'chat_specific',
    chatId?: string,
    approvedBy: string = 'system',
    notes?: string
  ): ApprovedUser {
    const id = generateId();
    const timestamp = now();

    const stmt = this._db.prepare(`
      INSERT INTO approved_users (
        id, phone_number, approval_type, chat_id, approved_by, approved_at, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(phone_number, approval_type, chat_id) DO UPDATE SET
        approved_by = excluded.approved_by,
        approved_at = excluded.approved_at,
        notes = excluded.notes
    `);

    stmt.run(
      id,
      phoneNumber,
      approvalType,
      chatId || null,
      approvedBy,
      timestamp,
      notes || null
    );

    return {
      id,
      phone_number: phoneNumber,
      approval_type: approvalType,
      chat_id: chatId || null,
      approved_by: approvedBy,
      approved_at: timestamp,
      notes: notes || null,
    };
  }

  listApprovedUsers(): ApprovedUser[] {
    const stmt = this._db.prepare('SELECT * FROM approved_users ORDER BY approved_at DESC');
    return stmt.all() as ApprovedUser[];
  }

  // ==========================================================================
  // Config Operations
  // ==========================================================================

  getConfig(key: string): string | null {
    const stmt = this._db.prepare('SELECT value FROM bot_config WHERE key = ?');
    const result = stmt.get(key) as { value: string } | undefined;
    return result?.value || null;
  }

  setConfig(key: string, value: string): void {
    const timestamp = now();
    const stmt = this._db.prepare(`
      INSERT INTO bot_config (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `);
    stmt.run(key, value, timestamp);
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  close(): void {
    this._db.close();
  }
}
