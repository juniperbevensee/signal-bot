/**
 * Database schema types and SQL definitions for Signal Bot
 */

// ============================================================================
// TypeScript Types
// ============================================================================

export interface Chat {
  id: string; // UUID
  chat_type: 'dm' | 'group';
  signal_chat_id: string; // Phone number for DM, group ID for groups
  display_name: string | null;
  created_at: string; // ISO 8601 timestamp
  updated_at: string; // ISO 8601 timestamp
  metadata: string | null; // JSON string for extensibility
}

export interface Message {
  id: string; // UUID
  chat_id: string; // Foreign key to chats.id
  direction: 'incoming' | 'outgoing';
  sender: string; // Phone number
  content: string | null;
  timestamp: string; // ISO 8601 timestamp
  signal_timestamp: number; // Original Signal message timestamp (milliseconds)
  message_type: 'text' | 'reaction' | 'attachment' | 'other';
  metadata: string | null; // JSON string for reactions, attachments, etc.
}

export interface ActivityLog {
  id: string; // UUID
  chat_id: string; // Foreign key to chats.id
  trace_id: string; // Groups related activities (one user query = one trace)
  parent_id: string | null; // For hierarchical traces
  log_type: 'invocation' | 'tool_call' | 'tool_result' | 'response' | 'error';
  step_number: number; // Order within trace
  content: string; // JSON string with event details
  created_at: string; // ISO 8601 timestamp
  metadata: string | null; // JSON string for extensibility
}

export interface ApprovedUser {
  id: string; // UUID
  phone_number: string; // E.164 format
  approval_type: 'global' | 'chat_specific';
  chat_id: string | null; // NULL for global, specific chat_id for chat-specific
  approved_by: string | null; // Phone number or 'system'
  approved_at: string; // ISO 8601 timestamp
  notes: string | null;
}

export interface BotConfig {
  key: string; // Primary key (e.g., 'schema_version', 'last_migration')
  value: string; // JSON string or simple value
  updated_at: string; // ISO 8601 timestamp
}

export interface ScheduledTask {
  id: string; // UUID
  name: string;
  description: string;
  schedule: string; // Cron syntax
  enabled: number; // SQLite boolean (0 or 1)
  last_run: string | null; // ISO 8601 timestamp
  next_run: string | null; // ISO 8601 timestamp
  created_at: string; // ISO 8601 timestamp
  updated_at: string; // ISO 8601 timestamp
  metadata: string | null; // JSON string
}

export interface TaskHistory {
  id: string; // UUID
  task_id: string; // Foreign key to scheduled_tasks.id
  executed_at: string; // ISO 8601 timestamp
  success: number; // SQLite boolean (0 or 1)
  error: string | null;
  duration: number; // Milliseconds
  result: string | null; // JSON string
}

// ============================================================================
// SQL Schema
// ============================================================================

export const SCHEMA_SQL = `
-- Chats table: One row per Signal conversation (DM or group)
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  chat_type TEXT NOT NULL CHECK (chat_type IN ('dm', 'group')),
  signal_chat_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata TEXT
);

-- Messages table: All incoming/outgoing messages
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  sender TEXT NOT NULL,
  content TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  signal_timestamp INTEGER NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'reaction', 'attachment', 'other')),
  metadata TEXT
);

-- Activity logs: Replaces Loria's trace structure
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  trace_id TEXT NOT NULL,
  parent_id TEXT REFERENCES activity_logs(id) ON DELETE CASCADE,
  log_type TEXT NOT NULL CHECK (log_type IN ('invocation', 'tool_call', 'tool_result', 'response', 'error')),
  step_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata TEXT
);

-- Approved users: Access control
CREATE TABLE IF NOT EXISTS approved_users (
  id TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL,
  approval_type TEXT NOT NULL CHECK (approval_type IN ('global', 'chat_specific')),
  chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,
  approved_by TEXT,
  approved_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT,
  UNIQUE(phone_number, approval_type, chat_id)
);

-- Bot config: Runtime settings and migration tracking
CREATE TABLE IF NOT EXISTS bot_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Scheduled tasks: Cron-based recurring tasks
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  schedule TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run TEXT,
  next_run TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata TEXT
);

-- Task execution history: Records of task runs
CREATE TABLE IF NOT EXISTS task_history (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
  executed_at TEXT NOT NULL DEFAULT (datetime('now')),
  success INTEGER NOT NULL,
  error TEXT,
  duration INTEGER NOT NULL,
  result TEXT
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Fast chat history retrieval
CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp
  ON messages(chat_id, timestamp DESC);

-- Fast trace retrieval
CREATE INDEX IF NOT EXISTS idx_activity_logs_trace
  ON activity_logs(trace_id, step_number);

-- Per-chat activity logs
CREATE INDEX IF NOT EXISTS idx_activity_logs_chat
  ON activity_logs(chat_id, created_at DESC);

-- Signal message deduplication
CREATE INDEX IF NOT EXISTS idx_messages_signal_timestamp
  ON messages(signal_timestamp, sender);

-- Approved user lookups
CREATE INDEX IF NOT EXISTS idx_approved_users_phone
  ON approved_users(phone_number, approval_type);

-- Task history lookup by task
CREATE INDEX IF NOT EXISTS idx_task_history_task
  ON task_history(task_id, executed_at DESC);

-- Enabled scheduled tasks
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_enabled
  ON scheduled_tasks(enabled, next_run);
`;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a UUID v4 (random)
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Get current ISO 8601 timestamp
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Parse JSON metadata safely
 */
export function parseMetadata<T = any>(metadata: string | null): T | null {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata) as T;
  } catch {
    return null;
  }
}

/**
 * Stringify metadata safely
 */
export function stringifyMetadata(metadata: any): string | null {
  if (!metadata) return null;
  try {
    return JSON.stringify(metadata);
  } catch {
    return null;
  }
}
