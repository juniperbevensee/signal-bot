# Database Structure and Activity Logging

This document explains what logs to the SQLite database and how it's structured.

## Overview

The Signal bot uses SQLite to store:
1. **Chat metadata** - Information about conversations (DM or group)
2. **Messages** - All incoming and outgoing messages
3. **Activity logs** - Detailed trace of agent invocations, tool calls, and responses
4. **Access control** - Approved users and permissions
5. **Configuration** - Bot settings and schema version

## Database Schema

### Table: `chats`

Stores metadata about each conversation.

```sql
CREATE TABLE chats (
  id TEXT PRIMARY KEY,                    -- UUID
  chat_type TEXT NOT NULL,                 -- 'dm' or 'group'
  signal_chat_id TEXT NOT NULL UNIQUE,    -- Phone number or group ID
  display_name TEXT,                       -- User/group name
  created_at TEXT NOT NULL,                -- ISO 8601 timestamp
  updated_at TEXT NOT NULL,                -- ISO 8601 timestamp
  metadata TEXT                            -- JSON blob
);
```

**What logs here:**
- One row per chat (DM or group)
- Created when first message is received
- `signal_chat_id` is the phone number (for DM) or group ID (for groups)

**Example:**
```json
{
  "id": "chat_abc123",
  "chat_type": "group",
  "signal_chat_id": "group.V2_abc123def456",
  "display_name": "Project Team",
  "created_at": "2026-03-09T10:00:00Z",
  "updated_at": "2026-03-09T14:30:00Z"
}
```

### Table: `messages`

Stores all incoming and outgoing messages.

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,                    -- UUID
  chat_id TEXT NOT NULL,                  -- Foreign key to chats.id
  direction TEXT NOT NULL,                -- 'incoming' or 'outgoing'
  sender TEXT NOT NULL,                   -- Phone number or UUID
  content TEXT NOT NULL,                  -- Message text
  timestamp TEXT NOT NULL,                -- ISO 8601 timestamp
  signal_timestamp INTEGER NOT NULL,      -- Signal's timestamp (ms)
  message_type TEXT DEFAULT 'text',       -- 'text', 'reaction', 'attachment'
  metadata TEXT,                          -- JSON blob
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_chat_timestamp ON messages(chat_id, timestamp DESC);
CREATE INDEX idx_messages_signal_ts ON messages(signal_timestamp, sender);
```

**What logs here:**
- Every incoming message from Signal
- Every outgoing message sent by the bot
- Reactions (emoji reactions to messages)
- Messages with attachments

**Example incoming message:**
```json
{
  "id": "msg_xyz789",
  "chat_id": "chat_abc123",
  "direction": "incoming",
  "sender": "+14155551234",
  "content": "What's the weather today?",
  "timestamp": "2026-03-09T10:00:00Z",
  "signal_timestamp": 1709982000000,
  "message_type": "text"
}
```

**Example outgoing message:**
```json
{
  "id": "msg_xyz790",
  "chat_id": "chat_abc123",
  "direction": "outgoing",
  "sender": "+14155559999",
  "content": "The weather in San Francisco is 65°F and sunny.",
  "timestamp": "2026-03-09T10:00:05Z",
  "signal_timestamp": 1709982005000,
  "message_type": "text"
}
```

### Table: `activity_logs`

**This is the key table for tracking agent behavior.**

Stores a hierarchical trace of agent invocations, tool calls, and responses.

```sql
CREATE TABLE activity_logs (
  id TEXT PRIMARY KEY,                    -- UUID
  chat_id TEXT NOT NULL,                  -- Foreign key to chats.id
  trace_id TEXT NOT NULL,                 -- Groups related activities
  parent_id TEXT,                         -- Self-referential FK for hierarchy
  log_type TEXT NOT NULL,                 -- 'invocation', 'tool_call', 'tool_result', 'response'
  step_number INTEGER NOT NULL,           -- Order within trace
  content TEXT NOT NULL,                  -- JSON blob with details
  created_at TEXT NOT NULL,               -- ISO 8601 timestamp
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES activity_logs(id) ON DELETE CASCADE
);

CREATE INDEX idx_activity_logs_trace ON activity_logs(trace_id, step_number);
CREATE INDEX idx_activity_logs_chat ON activity_logs(chat_id, created_at DESC);
```

**What logs here:**

#### 1. `invocation` (Root of trace)

Created when user sends a message and agent starts processing.

```json
{
  "id": "log_001",
  "chat_id": "chat_abc123",
  "trace_id": "trace_xyz",
  "parent_id": null,
  "log_type": "invocation",
  "step_number": 0,
  "content": {
    "user_message": "What's the weather today?",
    "timestamp": 1709982000000
  },
  "created_at": "2026-03-09T10:00:00Z"
}
```

#### 2. `tool_call` (Child of invocation)

Created when agent decides to call a tool.

```json
{
  "id": "log_002",
  "chat_id": "chat_abc123",
  "trace_id": "trace_xyz",
  "parent_id": "log_001",
  "log_type": "tool_call",
  "step_number": 1,
  "content": {
    "tool_name": "get_weather",
    "tool_input": {
      "city": "San Francisco"
    },
    "tool_call_id": "toolu_abc123"
  },
  "created_at": "2026-03-09T10:00:01Z"
}
```

#### 3. `tool_result` (Child of tool_call)

Created when tool execution completes.

```json
{
  "id": "log_003",
  "chat_id": "chat_abc123",
  "trace_id": "trace_xyz",
  "parent_id": "log_002",
  "log_type": "tool_result",
  "step_number": 2,
  "content": {
    "tool_name": "get_weather",
    "tool_call_id": "toolu_abc123",
    "result": {
      "temperature": 65,
      "conditions": "sunny"
    },
    "success": true
  },
  "created_at": "2026-03-09T10:00:03Z"
}
```

#### 4. `response` (Child of invocation)

Created when agent generates final response.

```json
{
  "id": "log_004",
  "chat_id": "chat_abc123",
  "trace_id": "trace_xyz",
  "parent_id": "log_001",
  "log_type": "response",
  "step_number": 3,
  "content": {
    "response_text": "The weather in San Francisco is 65°F and sunny.",
    "stop_reason": "end_turn"
  },
  "created_at": "2026-03-09T10:00:05Z"
}
```

### Hierarchical Structure

The `parent_id` and `step_number` fields create a nested structure:

```
invocation (step 0)
├── tool_call (step 1)
│   └── tool_result (step 2)
├── tool_call (step 3)
│   └── tool_result (step 4)
└── response (step 5)
```

This allows you to:
- Query all activities for a trace: `WHERE trace_id = ?`
- Get invocation details: `WHERE log_type = 'invocation'`
- Get tool usage: `WHERE log_type IN ('tool_call', 'tool_result')`
- Reconstruct execution flow: `ORDER BY step_number`

## Comparison to Loria Structure

### What Changed

| Loria (Old) | Signal Bot (New) |
|-------------|------------------|
| `Biome` (global) | `Database` (file) |
| `Rhizome` (per chat) | `Chat` row |
| `Node` (message) | `Message` row |
| `Node` (trace) | `ActivityLog` row |
| `parent` edge | `parent_id` column |
| DHT/p2p sync | Local only |

### What Stayed the Same

✅ **Hierarchical trace structure** - invocation → tool_call → tool_result → response
✅ **Per-chat isolation** - Each chat has its own logs
✅ **Timestamp ordering** - All events are timestamped
✅ **Tool call tracking** - Full tool execution history
✅ **Nested relationships** - Parent/child via `parent_id`

### What's Better

✅ **Simpler** - No DHT complexity, just SQL queries
✅ **Faster** - Indexed queries, no network hops
✅ **Standard** - Any SQL tool can read it
✅ **Portable** - Single .db file, easy backups
✅ **Inspectable** - Use sqlite3 CLI or DB Browser

## Access Control and Chat Isolation

### Per-Chat Logs

**Each group chat's logs are isolated by `chat_id`:**

```sql
-- Get all activity for a specific chat
SELECT * FROM activity_logs WHERE chat_id = 'chat_abc123' ORDER BY created_at DESC;

-- Get invocations only for a chat
SELECT * FROM activity_logs WHERE chat_id = 'chat_abc123' AND log_type = 'invocation';
```

The bot automatically:
- Creates a unique `chat_id` for each DM and group
- Associates all messages and logs with that `chat_id`
- Tool `get_chat_logs` only returns logs from the current chat

### Admin Access

**Approved users can analyze logs from any chat:**

```sql
-- Table: approved_users
CREATE TABLE approved_users (
  id TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL UNIQUE,
  approval_type TEXT NOT NULL,           -- 'global' or 'chat_specific'
  chat_id TEXT,                          -- NULL for global, specific for chat
  created_at TEXT NOT NULL,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);
```

**Access levels:**

1. **Global approval** - User can interact with bot in any chat they're part of
   ```sql
   INSERT INTO approved_users (id, phone_number, approval_type, chat_id)
   VALUES ('user_001', '+14155551234', 'global', NULL);
   ```

2. **Chat-specific approval** - User can only interact in specific chat
   ```sql
   INSERT INTO approved_users (id, phone_number, approval_type, chat_id)
   VALUES ('user_002', '+14155555678', 'chat_specific', 'chat_abc123');
   ```

**Example: Admin analyzing any chat:**

```sql
-- Admin (global approval) can query any chat's logs
SELECT
  al.trace_id,
  al.log_type,
  al.content,
  al.created_at,
  c.display_name AS chat_name
FROM activity_logs al
JOIN chats c ON al.chat_id = c.id
WHERE al.created_at > datetime('now', '-7 days')
ORDER BY al.created_at DESC;
```

## Querying Examples

### Get all messages in a chat

```sql
SELECT * FROM messages WHERE chat_id = 'chat_abc123' ORDER BY timestamp DESC LIMIT 50;
```

### Get full trace for an invocation

```sql
-- Get all activity for a specific trace
SELECT * FROM activity_logs WHERE trace_id = 'trace_xyz' ORDER BY step_number;

-- Pretty print the hierarchy
WITH RECURSIVE trace_tree AS (
  SELECT
    id,
    parent_id,
    log_type,
    step_number,
    content,
    0 AS depth
  FROM activity_logs
  WHERE trace_id = 'trace_xyz' AND parent_id IS NULL

  UNION ALL

  SELECT
    al.id,
    al.parent_id,
    al.log_type,
    al.step_number,
    al.content,
    tt.depth + 1
  FROM activity_logs al
  JOIN trace_tree tt ON al.parent_id = tt.id
)
SELECT
  printf('%*s%s', depth * 2, '', log_type) AS hierarchy,
  step_number,
  json_extract(content, '$') AS details
FROM trace_tree
ORDER BY step_number;
```

### Get tool usage statistics

```sql
SELECT
  json_extract(content, '$.tool_name') AS tool,
  COUNT(*) AS usage_count,
  AVG(CAST((julianday(
    (SELECT created_at FROM activity_logs al2
     WHERE al2.parent_id = al.id AND al2.log_type = 'tool_result' LIMIT 1)
  ) - julianday(al.created_at)) * 86400 AS REAL)) AS avg_execution_seconds
FROM activity_logs al
WHERE log_type = 'tool_call'
GROUP BY tool
ORDER BY usage_count DESC;
```

### Find failed tool calls

```sql
SELECT
  al1.created_at,
  json_extract(al1.content, '$.tool_name') AS tool,
  json_extract(al2.content, '$.result') AS error
FROM activity_logs al1
LEFT JOIN activity_logs al2 ON al1.id = al2.parent_id
WHERE al1.log_type = 'tool_call'
  AND al2.log_type = 'tool_result'
  AND json_extract(al2.content, '$.success') = false;
```

## Enabling/Disabling Logging

Activity logging is **enabled by default** but can be disabled:

```bash
# In .env
ENABLE_ACTIVITY_LOGGING=false
```

When disabled:
- Messages are still stored (for chat history tools)
- Activity logs are **not** created
- Reduces database writes by ~70%
- Loses tool call visibility and debugging info

## Database File Location

Default: `./data/signal-bot.db`

Configure with:
```bash
DATABASE_PATH=/custom/path/to/bot.db
```

## Backup and Export

```bash
# Backup entire database
sqlite3 data/signal-bot.db ".backup backup-$(date +%Y%m%d).db"

# Export logs as JSON
sqlite3 data/signal-bot.db "SELECT json_object(
  'trace_id', trace_id,
  'type', log_type,
  'content', json(content),
  'timestamp', created_at
) FROM activity_logs WHERE chat_id = 'chat_abc123'" > logs.json

# Export all chats
sqlite3 data/signal-bot.db -json "SELECT * FROM chats" > chats.json
```

## Comparison Table: Loria vs SQLite

| Feature | Loria | SQLite Signal Bot |
|---------|-------|-------------------|
| **Storage** | DHT (distributed) | Local file |
| **Chat isolation** | Rhizome per chat | `chat_id` column |
| **Message history** | Nodes in rhizome | `messages` table |
| **Activity traces** | Child nodes | `activity_logs` with `parent_id` |
| **Querying** | DHT traversal | SQL queries |
| **Backup** | Export to JSON | Copy .db file |
| **Inspection** | Custom tools | sqlite3, DB Browser |
| **Sync** | P2P | None (local only) |
| **Complexity** | High | Low |

## Migration from Loria

If you have existing Loria data, you can migrate:

```bash
# Export from Loria (hypothetical)
node export-loria-data.js > loria-export.json

# Import to SQLite
node scripts/import-from-loria.js loria-export.json
```

The migration maps:
- Each Rhizome → Chat row
- Message nodes → Message rows
- Trace nodes → ActivityLog rows (preserving parent/child structure)
- Timestamps preserved

## Summary

✅ **Messages**: Every incoming/outgoing message logged
✅ **Activity**: Full trace of invocations, tool calls, and results
✅ **Hierarchy**: Parent/child relationships via `parent_id`
✅ **Isolation**: Each chat has its own logs
✅ **Timestamps**: Everything is timestamped for ordering
✅ **Admin access**: Global approvals can query any chat
✅ **Performance**: Indexed for fast queries
✅ **Inspectable**: Standard SQL, easy to explore

The structure maintains the same hierarchical trace logging as Loria but in a simpler, more standard format.
