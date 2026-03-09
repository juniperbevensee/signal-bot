-- Initial schema for Signal Bot
-- This file is for reference - the schema is applied automatically by SQLiteClient

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

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp
  ON messages(chat_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_trace
  ON activity_logs(trace_id, step_number);

CREATE INDEX IF NOT EXISTS idx_activity_logs_chat
  ON activity_logs(chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_signal_timestamp
  ON messages(signal_timestamp, sender);

CREATE INDEX IF NOT EXISTS idx_approved_users_phone
  ON approved_users(phone_number, approval_type);
