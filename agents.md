# Signal Bot: Technical Architecture

**Target Audience**: AI agents and developers extending this codebase.

**Purpose**: Comprehensive technical reference covering architecture, patterns, extension points, and implementation details.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [LLM Abstraction Layer](#llm-abstraction-layer)
4. [Tool System](#tool-system)
5. [Signal Integration](#signal-integration)
6. [Security Mechanisms](#security-mechanisms)
7. [Extension Patterns](#extension-patterns)
8. [API Integration Guide](#api-integration-guide)
9. [File Structure](#file-structure)
10. [Data Flow](#data-flow)

---

## Architecture Overview

### High-Level Design

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Signal    │◄────►│ Signal       │◄────►│   Agent     │
│   Users     │      │ Listener     │      │   Service   │
└─────────────┘      └──────┬───────┘      └──────┬──────┘
                            │                      │
                            ▼                      ▼
                     ┌──────────────┐      ┌─────────────┐
                     │   Database   │      │  LLM Client │
                     │   (SQLite)   │      │  (Abstract) │
                     └──────────────┘      └──────┬──────┘
                                                   │
                                    ┌──────────────┼──────────────┐
                                    ▼              ▼              ▼
                             ┌──────────┐  ┌──────────┐  ┌──────────┐
                             │Anthropic │  │ OpenAI   │  │LM Studio │
                             └──────────┘  └──────────┘  └──────────┘
```

### Core Components

1. **Signal Listener** (`src/signal/listener.ts`)
   - Polls signal-cli-rest-api for new messages
   - Enforces access control and rate limiting
   - Routes messages to agent
   - Stores all message history in database

2. **Agent Service** (`src/agent/service.ts`)
   - Manages conversation state
   - Executes tool calls
   - Interfaces with LLM provider
   - Handles multi-turn interactions

3. **Database Client** (`src/database/client.ts`)
   - SQLite by default (better-sqlite3)
   - Synchronous API for simplicity
   - All queries are parameterized (SQL injection safe)
   - Foreign key constraints enabled

4. **LLM Client** (`src/agent/llm-client.ts`)
   - Abstraction over multiple LLM providers
   - Unified interface for Anthropic, OpenAI, LM Studio
   - Automatic tool call format translation

5. **Security Layer** (`src/utils/security.ts`)
   - Path traversal prevention
   - Rate limiting (per-user quotas)
   - Input sanitization
   - SQL LIKE pattern escaping

---

## Database Schema

### Entity-Relationship Diagram

```
┌─────────────────────────┐
│        chats            │
├─────────────────────────┤
│ id (PK)                 │
│ chat_type               │
│ signal_chat_id (UNIQUE) │
│ display_name            │
│ created_at              │
│ updated_at              │
│ metadata (JSON)         │
└──────────┬──────────────┘
           │
           │ 1:N
           │
┌──────────▼──────────────┐
│       messages          │
├─────────────────────────┤
│ id (PK)                 │
│ chat_id (FK)            │◄──────────┐
│ direction               │           │
│ sender                  │           │
│ content                 │           │
│ timestamp               │           │
│ signal_timestamp        │           │
│ message_type            │           │
│ metadata (JSON)         │           │
└─────────────────────────┘           │
                                      │
┌─────────────────────────┐           │
│    activity_logs        │           │
├─────────────────────────┤           │
│ id (PK)                 │           │
│ chat_id (FK)            │───────────┘
│ trace_id                │
│ parent_id (self-FK)     │
│ log_type                │
│ step_number             │
│ content (JSON)          │
│ created_at              │
└─────────────────────────┘

┌─────────────────────────┐
│   approved_users        │
├─────────────────────────┤
│ id (PK)                 │
│ phone_number (UNIQUE)   │
│ approval_type           │
│ chat_id (FK, nullable)  │
│ created_at              │
└─────────────────────────┘

┌─────────────────────────┐
│     bot_config          │
├─────────────────────────┤
│ key (PK)                │
│ value                   │
│ updated_at              │
└─────────────────────────┘
```

### Key Indexes

```sql
-- Message retrieval optimization
CREATE INDEX idx_messages_chat_timestamp
  ON messages(chat_id, timestamp DESC);

-- Activity log traversal
CREATE INDEX idx_activity_logs_trace
  ON activity_logs(trace_id, step_number);

CREATE INDEX idx_activity_logs_chat
  ON activity_logs(chat_id, created_at DESC);

-- Deduplication lookup
CREATE INDEX idx_messages_signal_ts
  ON messages(signal_timestamp, sender);
```

### Schema Version Management

Schema version stored in `bot_config` table:

```typescript
db.getConfig('schema_version'); // Returns '1'
```

Future migrations should:
1. Check current version
2. Apply incremental changes
3. Update schema_version

---

## LLM Abstraction Layer

### Interface Definition

```typescript
export interface LLMClient {
  createMessage(params: {
    model: string;
    max_tokens: number;
    system?: string;
    messages: Message[];
    tools?: ToolDefinition[];
  }): Promise<LLMResponse>;
}

export interface LLMResponse {
  content: ContentBlock[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: any };
```

### Provider Implementations

#### Anthropic Client

Uses official SDK:

```typescript
new Anthropic({ apiKey });
const response = await anthropic.messages.create({
  model,
  max_tokens,
  system,
  messages,
  tools,
});
```

Tool format: Native Anthropic tool use blocks.

#### OpenAI-Compatible Client

Raw HTTP client using fetch:

```typescript
fetch(`${baseURL}/chat/completions`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model,
    max_tokens,
    messages: [
      { role: 'system', content: system },
      ...messages,
    ],
    tools: convertToOpenAITools(tools),
  }),
});
```

Tool format conversion:

```typescript
// Anthropic format
{
  name: 'get_weather',
  description: 'Get weather...',
  input_schema: { /* JSON Schema */ }
}

// OpenAI format
{
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Get weather...',
    parameters: { /* JSON Schema */ }
  }
}
```

Response transformation:

```typescript
// OpenAI tool call
choice.message.tool_calls[0] = {
  id: 'call_abc123',
  type: 'function',
  function: {
    name: 'get_weather',
    arguments: '{"city":"SF"}'
  }
}

// Transformed to Anthropic format
{
  type: 'tool_use',
  id: 'call_abc123',
  name: 'get_weather',
  input: { city: 'SF' }
}
```

#### AWS Bedrock Client

Uses AWS Bedrock Converse API with Claude models:

```typescript
fetch(`${baseURL}/model/${modelId}/converse`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${bearerToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    messages: serializeMessages(messages),
    system: [{ text: systemPrompt }],
    inferenceConfig: { maxTokens },
    toolConfig: { tools: serializeTools(tools) },
  }),
});
```

Key features:
- **Message serialization**: Groups consecutive tool results into single user messages
- **Tool format conversion**: Converts from Anthropic format to Bedrock toolSpec format
- **ARN support**: Handles both model IDs and ARNs
- **Retry logic**: Automatic retries with exponential backoff for rate limits and server errors
- **JSON sanitization**: Prevents serialization errors from invalid Unicode characters

Tool format conversion:

```typescript
// Anthropic format
{
  name: 'get_weather',
  description: 'Get weather...',
  input_schema: { /* JSON Schema */ }
}

// Bedrock format
{
  toolSpec: {
    name: 'get_weather',
    description: 'Get weather...',
    inputSchema: {
      json: { /* JSON Schema */ }
    }
  }
}
```

Response transformation:

```typescript
// Bedrock tool use
{
  toolUse: {
    toolUseId: 'toolu_abc123',
    name: 'get_weather',
    input: { city: 'SF' }
  }
}

// Transformed to Anthropic format
{
  type: 'tool_use',
  id: 'toolu_abc123',
  name: 'get_weather',
  input: { city: 'SF' }
}
```

### Adding New Providers

1. Implement `LLMClient` interface
2. Handle tool call format conversion
3. Register in `createLLMClient` factory
4. Update config schema

Example: Adding Ollama support

```typescript
export class OllamaClient implements LLMClient {
  constructor(private baseURL: string) {}

  async createMessage(params): Promise<LLMResponse> {
    const response = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      body: JSON.stringify({
        model: params.model,
        messages: this.formatMessages(params),
        // Ollama-specific options
      }),
    });

    return this.parseResponse(await response.json());
  }
}

// In createLLMClient
case 'ollama':
  return new OllamaClient(config.baseURL!);
```

---

## Tool System

### Tool Definition Structure

Tools use Zod schemas for type safety and automatic validation:

```typescript
import { z } from 'zod';
import { tool } from './tools';

const myTool = tool(
  'Description of what this tool does',
  async (input: { param1: string; param2: number }) => {
    // Tool implementation
    return JSON.stringify(result);
  },
  {
    name: 'my_tool',
    zodSchema: z.object({
      param1: z.string().describe('Purpose of param1'),
      param2: z.number().describe('Purpose of param2'),
    }),
  }
);
```

### Tool Interface

```typescript
export interface Tool {
  name: string;
  description: string;
  definition: ToolDefinition;  // For LLM
  execute: (input: any) => Promise<string>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}
```

### Built-in Tools

#### Signal Tools (`src/signal/tools.ts`)

1. **signal_send_message**
   - Sends DM to one or more recipients
   - Optional file attachments (with security checks)
   - Returns send confirmation

2. **signal_send_group_message**
   - Sends message to group by ID
   - Optional file attachments (with security checks)
   - Returns send confirmation

3. **signal_list_groups**
   - Lists all groups bot is member of
   - Returns group IDs, names, member counts

4. **signal_send_reaction**
   - Sends emoji reaction to specific message
   - Requires target message timestamp
   - Returns confirmation

5. **signal_get_identity**
   - Returns bot's phone number
   - No parameters

#### Memory Tools (`src/agent/memory.ts`)

1. **view_memory**
   - Reads persistent_memory.md
   - No parameters
   - Returns full memory content

2. **add_memory**
   - Appends to persistent_memory.md
   - Input: `{ entry: string }`
   - Sanitizes for prompt injection patterns

#### Chat History Tools (`src/tools/chat-history.ts`)

1. **get_chat_logs**
   - Retrieves recent messages from current chat
   - Input: `{ limit?: number }`
   - Returns formatted message history

2. **search_chat_logs**
   - Searches messages by content (LIKE query)
   - Input: `{ query: string; limit?: number }`
   - Uses `escapeLikePattern` for security
   - Returns matching messages

### Tool Execution Flow

```typescript
// In agent/service.ts
while (response.stopReason === 'tool_use') {
  // 1. Extract tool calls from response
  const toolCalls = response.content.filter(
    (block) => block.type === 'tool_use'
  );

  // 2. Execute each tool
  const results = await Promise.all(
    toolCalls.map(async (toolCall) => {
      const tool = this.tools.find((t) => t.name === toolCall.name);
      const result = await tool.execute(toolCall.input);

      return {
        type: 'tool_result',
        tool_use_id: toolCall.id,
        content: result,
      };
    })
  );

  // 3. Send results back to LLM
  this.messages.push({ role: 'assistant', content: toolCalls });
  this.messages.push({ role: 'user', content: results });

  // 4. Get next response
  response = await this.client.createMessage({...});
}
```

### Creating Custom Tools

Pattern for adding a new tool:

```typescript
// 1. Define in separate file (e.g., src/tools/weather.ts)
import { z } from 'zod';
import { tool } from '../agent/tools';

export const weatherTool = tool(
  'Get current weather for a city',
  async ({ city }: { city: string }) => {
    // Implement tool logic
    const response = await fetch(`https://api.weather.com?city=${city}`);
    const data = await response.json();

    return JSON.stringify({
      temperature: data.temp,
      conditions: data.conditions,
    });
  },
  {
    name: 'get_weather',
    zodSchema: z.object({
      city: z.string().describe('City name'),
    }),
  }
);

// 2. Register in src/index.ts
import { weatherTool } from './tools/weather';

const allTools = [
  ...signalTools,
  ...memoryTools,
  weatherTool,  // Add here
];
```

---

## Signal Integration

### SignalContext (`src/signal/context.ts`)

Wrapper around signal-cli-rest-api:

```typescript
export class SignalContext {
  constructor(
    private apiUrl: string,
    private phoneNumber: string
  ) {}

  // Send message to individuals
  async sendMessage(
    recipients: string[],
    message: string,
    options?: { base64Attachments?: string[] }
  ): Promise<{ timestamp: number }> {
    const response = await fetch(`${this.apiUrl}/v2/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: this.phoneNumber,
        recipients,
        message,
        base64_attachments: options?.base64Attachments,
      }),
    });
    return response.json();
  }

  // Send message to group
  async sendGroupMessage(
    groupId: string,
    message: string,
    options?: { base64Attachments?: string[] }
  ): Promise<{ timestamp: number }> {
    // Similar to sendMessage but with groupId
  }

  // Retrieve new messages
  async receive(): Promise<SignalMessage[]> {
    const response = await fetch(
      `${this.apiUrl}/v1/receive/${this.phoneNumber}`
    );
    return response.json();
  }

  // List groups
  async listGroups(): Promise<GroupInfo[]> {
    const response = await fetch(
      `${this.apiUrl}/v1/groups/${this.phoneNumber}`
    );
    return response.json();
  }

  // Send reaction
  async sendReaction(params: {
    recipient: string;
    emoji: string;
    target_author: string;
    target_timestamp: number;
  }): Promise<void> {
    await fetch(`${this.apiUrl}/v1/reactions/${this.phoneNumber}`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }
}
```

### Message Format

```typescript
interface SignalMessage {
  envelope: {
    source: string;          // Sender UUID
    sourceNumber: string;    // Sender phone (if available)
    sourceName: string;      // Sender display name
    timestamp: number;       // Message timestamp (ms)
    dataMessage: {
      message: string;       // Text content
      timestamp: number;
      groupInfo?: {
        groupId: string;
        type: string;
      };
      reaction?: {
        emoji: string;
        targetAuthor: string;
        targetTimestamp: number;
      };
    };
  };
}
```

### Listener Polling Loop

```typescript
async start(): Promise<void> {
  this.pollTimer = setInterval(async () => {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const messages = await this.signalContext.receive();

      for (const msg of messages) {
        await this.handleMessage(msg);
      }
    } catch (error) {
      this.logger.error(`Polling error: ${error}`);
    } finally {
      this.isPolling = false;
    }
  }, this.config.signal.pollInterval);
}
```

### Message Handling Pipeline

```typescript
private async handleMessage(msg: SignalMessage): Promise<void> {
  // 1. Handle reactions (separate from text messages)
  if (msg.envelope.dataMessage?.reaction) {
    await this.handleReaction(msg);
    if (!msg.envelope.dataMessage.message) return;
  }

  // 2. Skip non-text messages
  if (!msg.envelope.dataMessage?.message) return;

  // 3. Deduplication
  if (this.processedTimestamps.has(msg.envelope.timestamp)) return;
  this.processedTimestamps.add(msg.envelope.timestamp);

  // 4. Access control
  if (!this.isSenderAllowed(sender)) {
    this.logger.debug('Unauthorized sender');
    return;
  }

  // 5. Rate limiting
  const rateLimitCheck = this.rateLimiter.check(userId);
  if (!rateLimitCheck.allowed) {
    await this.sendRateLimitWarning(userId);
    return;
  }

  // 6. Group mention check
  if (isGroup && !this.isBotMentioned(message)) {
    return;
  }

  // 7. Get or create chat
  const chat = await this.getOrCreateChat(chatId);

  // 8. Store incoming message
  this.database.addMessage(chat.id, 'incoming', sender, message, timestamp);

  // 9. Query agent
  const response = await this.agent.query(contextPrompt);

  // 10. Send response
  await this.sendResponse(chat, response);

  // 11. Store outgoing message
  this.database.addMessage(chat.id, 'outgoing', botPhone, response, Date.now());
}
```

---

## Security Mechanisms

### 1. Path Traversal Prevention

```typescript
export function validateFilePath(filePath: string, workspaceDir: string): string {
  if (!workspaceDir) {
    throw new Error('Workspace directory not configured');
  }

  // Resolve to absolute paths
  const normalized = path.resolve(filePath);
  const workspace = path.resolve(workspaceDir);

  // Check containment
  if (!normalized.startsWith(workspace + path.sep) && normalized !== workspace) {
    throw new Error('Security: File access denied outside workspace');
  }

  // Verify path exists
  if (!fs.existsSync(normalized) && !fs.existsSync(path.dirname(normalized))) {
    throw new Error('File path does not exist');
  }

  return normalized;
}
```

**Attack prevented**: `../../etc/passwd` or `/etc/shadow`

### 2. Dangerous File Extension Blocking

```typescript
export const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif',
  '.sh', '.bash', '.zsh', '.ps1', '.vbs', '.js', '.jar',
  '.app', '.dmg', '.pkg', '.deb', '.rpm',
]);

export function isDangerousExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return DANGEROUS_EXTENSIONS.has(ext);
}
```

**Usage in tools**:

```typescript
const validatedPath = validateFilePath(attachment_path, workspaceDir);

if (isDangerousExtension(validatedPath)) {
  return JSON.stringify({
    success: false,
    error: 'Security: File type not allowed',
  });
}
```

### 3. Rate Limiting

Per-user quotas to prevent API abuse:

```typescript
export class RateLimiter {
  private userCounts = new Map<string, {
    count: number;
    resetTime: number;
    hourlyCount: number;
    hourlyResetTime: number;
  }>();

  check(userId: string): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const record = this.userCounts.get(userId);

    // Initialize new window
    if (!record || now > record.resetTime) {
      this.userCounts.set(userId, {
        count: 1,
        resetTime: now + 60000,  // 1 minute
        hourlyCount: 1,
        hourlyResetTime: now + 3600000,  // 1 hour
      });
      return { allowed: true };
    }

    // Check per-minute limit
    if (record.count >= 10) {
      return { allowed: false, reason: 'minute_limit' };
    }

    // Check hourly limit
    if (record.hourlyCount >= 100) {
      return { allowed: false, reason: 'hourly_limit' };
    }

    record.count++;
    record.hourlyCount++;
    return { allowed: true };
  }
}
```

**Configuration**:
- Default: 10 messages/minute, 100 messages/hour
- Customizable via constructor

### 4. SQL Injection Prevention

All queries use parameterized statements:

```typescript
// ✅ Safe
const stmt = this.db.prepare('SELECT * FROM messages WHERE chat_id = ?');
stmt.all(chatId);

// ❌ Unsafe (never do this)
const query = `SELECT * FROM messages WHERE chat_id = '${chatId}'`;
this.db.prepare(query).all();
```

LIKE queries escape wildcards:

```typescript
export function escapeLikePattern(pattern: string): string {
  return pattern
    .replace(/\\/g, '\\\\')  // Escape backslash
    .replace(/%/g, '\\%')    // Escape %
    .replace(/_/g, '\\_');   // Escape _
}

// Usage
const escapedQuery = escapeLikePattern(userInput);
stmt.all(chatId, `%${escapedQuery}%`);
```

### 5. Prompt Injection Protection

Memory preferences sanitized before storage:

```typescript
export function sanitizeForPrompt(text: string): string {
  return text
    // Remove control characters
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '')
    // Remove injection markers
    .replace(/\[SYSTEM\]|\[INST\]|\[\/INST\]/gi, '')
    // Limit consecutive newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
```

**Blocked patterns**: `[SYSTEM]`, `[INST]`, `[/INST]`, null bytes, excessive newlines

### 6. Access Control

**Fail-secure design**: Requires explicit allowlisting.

```typescript
// Config validation
if (SIGNAL_ALLOWED_SENDERS.length === 0 && SIGNAL_ALLOWED_GROUPS.length === 0) {
  throw new Error('Must configure at least SIGNAL_ALLOWED_SENDERS or SIGNAL_ALLOWED_GROUPS');
}

// Runtime check
private isSenderAllowed(uuid: string, phone?: string): boolean {
  const allowed = this.config.accessControl.allowedSenders;
  return allowed.includes(uuid) || (phone && allowed.includes(phone));
}
```

**No default allow**: Empty allowlist = no access.

---

## Extension Patterns

### Adding a New Tool

1. **Create tool file**: `src/tools/your-tool.ts`

```typescript
import { z } from 'zod';
import { tool } from '../agent/tools';

export const yourTool = tool(
  'Description for LLM',
  async (input: { param: string }) => {
    // Implementation
    const result = await doSomething(input.param);

    // Always return JSON string
    return JSON.stringify({ success: true, data: result });
  },
  {
    name: 'your_tool',
    zodSchema: z.object({
      param: z.string().describe('Parameter description'),
    }),
  }
);
```

2. **Register in index.ts**:

```typescript
import { yourTool } from './tools/your-tool';

const allTools = [
  ...signalTools,
  ...memoryTools,
  yourTool,
];
```

3. **Document in system prompt** (if needed):

```typescript
const systemPrompt = `
...
Available tools:
- your_tool: Use when you need to...
`;
```

### Adding Database Tables

1. **Update schema.ts**:

```typescript
export interface YourEntity {
  id: string;
  field1: string;
  created_at: string;
}

export const SCHEMA_SQL = `
...
CREATE TABLE IF NOT EXISTS your_entities (
  id TEXT PRIMARY KEY,
  field1 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;
```

2. **Add methods to DatabaseClient interface**:

```typescript
export interface DatabaseClient {
  // ...existing methods
  createYourEntity(field1: string): YourEntity;
  getYourEntity(id: string): YourEntity | null;
}
```

3. **Implement in SQLiteClient**:

```typescript
createYourEntity(field1: string): YourEntity {
  const id = generateId();
  const stmt = this.db.prepare(`
    INSERT INTO your_entities (id, field1, created_at)
    VALUES (?, ?, ?)
  `);
  stmt.run(id, field1, now());

  return { id, field1, created_at: now() };
}
```

4. **Write tests** in `src/database/client.test.ts`.

### Adding Environment Variables

1. **Update config.ts**:

```typescript
export interface BotConfig {
  // ...existing fields
  yourFeature: {
    apiKey: string;
    enabled: boolean;
  };
}

const YOUR_API_KEY = process.env.YOUR_API_KEY;
const YOUR_FEATURE_ENABLED = process.env.YOUR_FEATURE_ENABLED === 'true';

if (YOUR_FEATURE_ENABLED && !YOUR_API_KEY) {
  errors.push('YOUR_API_KEY required when YOUR_FEATURE_ENABLED=true');
}
```

2. **Update .env.example**:

```bash
# Your Feature
YOUR_FEATURE_ENABLED=false
YOUR_API_KEY=your-api-key-here
```

3. **Document in README.md** and **agents.md**.

---

## API Integration Guide

### General Pattern for External APIs

```typescript
// 1. Create API client in src/integrations/your-api/client.ts
export class YourAPIClient {
  constructor(
    private apiKey: string,
    private baseURL: string
  ) {}

  async makeRequest(endpoint: string, data: any): Promise<any> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }
}

// 2. Create tools in src/integrations/your-api/tools.ts
import { tool } from '../../agent/tools';
import { YourAPIClient } from './client';

export function createYourAPITools(client: YourAPIClient): Tool[] {
  const doSomething = tool(
    'Description',
    async ({ param }: { param: string }) => {
      const result = await client.makeRequest('/endpoint', { param });
      return JSON.stringify(result);
    },
    {
      name: 'your_api_do_something',
      zodSchema: z.object({
        param: z.string().describe('Description'),
      }),
    }
  );

  return [doSomething];
}

// 3. Initialize in src/index.ts
const yourAPIClient = new YourAPIClient(
  config.yourAPI.apiKey,
  config.yourAPI.baseURL
);

const yourAPITools = createYourAPITools(yourAPIClient);

const allTools = [
  ...signalTools,
  ...memoryTools,
  ...yourAPITools,
];
```

### Example: GitHub Integration

```typescript
// src/integrations/github/client.ts
export class GitHubClient {
  constructor(private token: string) {}

  async getRepository(owner: string, repo: string) {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );
    return response.json();
  }

  async createIssue(owner: string, repo: string, title: string, body: string) {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({ title, body }),
      }
    );
    return response.json();
  }
}

// src/integrations/github/tools.ts
export function createGitHubTools(client: GitHubClient): Tool[] {
  const createIssue = tool(
    'Create a GitHub issue in a repository',
    async (input: {
      owner: string;
      repo: string;
      title: string;
      body: string;
    }) => {
      const issue = await client.createIssue(
        input.owner,
        input.repo,
        input.title,
        input.body
      );

      return JSON.stringify({
        success: true,
        issue_number: issue.number,
        url: issue.html_url,
      });
    },
    {
      name: 'github_create_issue',
      zodSchema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        title: z.string().describe('Issue title'),
        body: z.string().describe('Issue body'),
      }),
    }
  );

  return [createIssue];
}
```

---

## File Structure

```
signal-bot/
├── src/
│   ├── index.ts                 # Entry point
│   ├── config.ts                # Configuration loader
│   │
│   ├── agent/
│   │   ├── service.ts           # Agent conversation manager
│   │   ├── llm-client.ts        # LLM provider abstraction
│   │   ├── tools.ts             # Tool decorator
│   │   ├── memory.ts            # Persistent memory tools
│   │   └── events.ts            # Event types for streaming
│   │
│   ├── database/
│   │   ├── schema.ts            # TypeScript types + SQL schema
│   │   ├── client.ts            # SQLite client implementation
│   │   └── client.test.ts       # Database tests
│   │
│   ├── signal/
│   │   ├── context.ts           # Signal API wrapper
│   │   ├── listener.ts          # Message polling loop
│   │   └── tools.ts             # Signal messaging tools
│   │
│   ├── tools/
│   │   └── chat-history.ts      # Chat search tools
│   │
│   ├── utils/
│   │   └── security.ts          # Security utilities
│   │
│   └── integrations/            # Optional: External API integrations
│       └── your-api/
│           ├── client.ts
│           └── tools.ts
│
├── data/                        # Runtime data
│   └── signal-bot.db            # SQLite database
│
├── workspace/                   # Sandboxed file operations
│   └── ...
│
├── persistent_memory.md         # User preferences
│
├── .env                         # Configuration
├── .env.example                 # Configuration template
│
├── docker-compose.yml           # Service definitions
├── Dockerfile                   # Bot container
│
├── package.json
├── tsconfig.json
│
├── README.md                    # User-facing docs
└── agents.md                    # This file
```

---

## Data Flow

### Message Reception Flow

```
Signal User Sends Message
        ↓
Signal CLI REST API (Docker container)
        ↓
SignalListener.receive() polls API
        ↓
handleMessage() pipeline:
  1. Deduplication check
  2. Access control check
  3. Rate limit check
  4. Group mention check (if group)
  5. Get/create chat in database
  6. Store incoming message
        ↓
Agent.query(message)
        ↓
LLMClient.createMessage()
  → Call LLM API (Anthropic/OpenAI/LM Studio)
  ← Receive response with tool calls
        ↓
Tool execution loop:
  For each tool call:
    - Find tool by name
    - Execute tool.execute(input)
    - Collect results
  Send tool results back to LLM
  Get next response
        ↓
Extract final text response
        ↓
SignalContext.sendMessage() or sendGroupMessage()
        ↓
Store outgoing message in database
        ↓
Message delivered to Signal user
```

### Tool Execution Flow

```
LLM Response contains tool_use block
        ↓
{
  type: 'tool_use',
  id: 'toolu_abc123',
  name: 'signal_send_message',
  input: { recipients: ['+1234'], message: 'Hello' }
}
        ↓
Agent finds tool by name
        ↓
Tool.execute(input) called
        ↓
Tool implementation runs:
  - Validates input (Zod schema)
  - Performs operation (API call, database query, etc.)
  - Returns JSON string result
        ↓
{
  type: 'tool_result',
  tool_use_id: 'toolu_abc123',
  content: '{"success": true, "timestamp": 1234567890}'
}
        ↓
Result sent back to LLM in next API call
        ↓
LLM uses result to formulate response
        ↓
Final text response returned to user
```

### Database Write Flow

```
New message received
        ↓
db.addMessage(
  chat_id,
  direction: 'incoming',
  sender: '+1234567890',
  content: 'Hello bot',
  timestamp: 1234567890,
  signal_timestamp: 1234567890,
  message_type: 'text'
)
        ↓
SQLite prepared statement:
  INSERT INTO messages (...)
  VALUES (?, ?, ?, ?, ?, ?, ?)
        ↓
Foreign key constraint check:
  - chat_id must exist in chats table
        ↓
Row inserted with auto-generated UUID
        ↓
Index automatically updated:
  - idx_messages_chat_timestamp
  - idx_messages_signal_ts
        ↓
Message now queryable:
  - getMessages(chat_id)
  - searchMessages(chat_id, query)
```

---

## Advanced Topics

### Activity Logging

Enable with `ENABLE_ACTIVITY_LOGGING=true`:

```typescript
// Creates trace for each user query
const trace = db.createActivityTrace(chatId, traceId, {
  user_message: message,
  timestamp: Date.now(),
});

// Logs each tool call as a span
const span = db.addActivitySpan(
  chatId,
  traceId,
  trace.id,  // parent_id
  'tool_call',
  stepNumber,
  {
    tool_name: toolCall.name,
    tool_input: toolCall.input,
  }
);

// Query full trace
const logs = db.getActivityTrace(traceId);
// Returns: [trace (parent), span1, span2, ...]
```

### Streaming Responses

Not yet implemented, but prepared in events.ts:

```typescript
export type AgentEvent =
  | TextEvent
  | ToolCallEvent
  | ToolResultEvent
  | FinalResponseEvent;

// Future: Agent.query_stream()
async *query_stream(message: string): AsyncGenerator<AgentEvent> {
  yield { type: 'text', text: 'Thinking...' };
  yield { type: 'tool_call', name: 'get_weather', input: {...} };
  yield { type: 'tool_result', result: {...} };
  yield { type: 'final_response', text: 'The weather is...' };
}
```

### Multi-Database Support

To add PostgreSQL:

1. Create `src/database/postgres-client.ts` implementing `DatabaseClient`
2. Update config to accept `DATABASE_TYPE=postgresql`
3. Add connection string parsing
4. Adapt queries (PostgreSQL uses `$1, $2` instead of `?`)

```typescript
// PostgreSQL client
import { Pool } from 'pg';

export class PostgresClient implements DatabaseClient {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async getChat(signalChatId: string): Promise<Chat | null> {
    const result = await this.pool.query(
      'SELECT * FROM chats WHERE signal_chat_id = $1',
      [signalChatId]
    );
    return result.rows[0] || null;
  }
}
```

### MCP (Model Context Protocol) Support

To add MCP server integration:

1. **Install MCP SDK**: `npm install @modelcontextprotocol/sdk`

2. **Create MCP client**: `src/mcp/client.ts`

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export async function createMCPClient(command: string, args: string[]) {
  const transport = new StdioClientTransport({
    command,
    args,
  });

  const client = new Client({
    name: 'signal-bot',
    version: '1.0.0',
  }, {
    capabilities: {}
  });

  await client.connect(transport);
  return client;
}
```

3. **Convert MCP tools to Signal bot tools**: `src/mcp/adapter.ts`

```typescript
export async function convertMCPTools(mcpClient: Client): Promise<Tool[]> {
  const mcpTools = await mcpClient.listTools();

  return mcpTools.tools.map((mcpTool) => {
    return tool(
      mcpTool.description || '',
      async (input: any) => {
        const result = await mcpClient.callTool({
          name: mcpTool.name,
          arguments: input,
        });

        return JSON.stringify(result.content);
      },
      {
        name: mcpTool.name,
        zodSchema: convertJSONSchemaToZod(mcpTool.inputSchema),
      }
    );
  });
}
```

4. **Initialize in index.ts**:

```typescript
if (config.mcp.enabled) {
  const mcpClient = await createMCPClient(
    config.mcp.command,
    config.mcp.args
  );

  const mcpTools = await convertMCPTools(mcpClient);

  allTools.push(...mcpTools);
}
```

5. **Configuration**:

```bash
# .env
MCP_ENABLED=true
MCP_SERVER_COMMAND=npx
MCP_SERVER_ARGS=-y,@modelcontextprotocol/server-filesystem,/path/to/files
```

---

## Testing Strategy

### Unit Tests

Test individual components in isolation:

```typescript
// src/database/client.test.ts
describe('SQLiteClient', () => {
  let db: SQLiteClient;

  beforeEach(() => {
    db = new SQLiteClient(':memory:');
  });

  it('should create and retrieve chat', () => {
    const chat = db.createChat('dm', '+1234567890');
    const retrieved = db.getChat('+1234567890');
    expect(retrieved?.id).toBe(chat.id);
  });
});
```

### Integration Tests

Test component interactions:

```typescript
// src/signal/listener.test.ts
describe('SignalListener', () => {
  let listener: SignalListener;
  let mockAgent: Agent;
  let mockSignalContext: SignalContext;

  beforeEach(() => {
    mockAgent = createMockAgent();
    mockSignalContext = createMockSignalContext();
    listener = new SignalListener({...});
  });

  it('should handle incoming message', async () => {
    const message = createMockMessage('+1234567890', 'Hello');
    await listener.handleMessage(message);

    expect(mockAgent.query).toHaveBeenCalledWith(...);
    expect(mockSignalContext.sendMessage).toHaveBeenCalled();
  });
});
```

### End-to-End Tests

Test full message flow (requires Signal API):

```typescript
// e2e/signal-flow.test.ts
describe('Signal Bot E2E', () => {
  it('should respond to message', async () => {
    // 1. Start bot
    const bot = await startBot();

    // 2. Send test message via Signal API
    await sendTestMessage('+1234567890', 'Hello bot');

    // 3. Wait for response
    const response = await waitForResponse();

    // 4. Assert response received
    expect(response).toBeDefined();
    expect(response.message).toContain('Hello');

    // 5. Cleanup
    await bot.stop();
  });
});
```

---

## Performance Considerations

### Database Optimization

1. **Indexes are critical**:
   - `idx_messages_chat_timestamp`: Fast message retrieval
   - `idx_activity_logs_trace`: Fast trace reconstruction

2. **WAL mode enabled**:
   - Allows concurrent reads during writes
   - Better performance on modern systems

3. **Prepared statements cached**:
   - better-sqlite3 automatically caches
   - No need for manual statement pooling

### Memory Management

1. **Conversation history truncation**:
   - Limit to last N messages (configurable)
   - Prevents unbounded memory growth

2. **Deduplication set cleanup**:
   ```typescript
   if (this.processedTimestamps.size > 1000) {
     const arr = Array.from(this.processedTimestamps);
     arr.slice(0, arr.length - 1000).forEach((ts) =>
       this.processedTimestamps.delete(ts)
     );
   }
   ```

3. **Rate limiter cleanup**:
   - Old entries auto-expire (not stored after window)

### API Rate Limits

1. **Anthropic**:
   - Tier 1: 5 requests/minute
   - Monitor usage, implement backoff if needed

2. **Signal API**:
   - Respect Signal's rate limits
   - Polling interval: 5 seconds (configurable)

---

## Deployment Best Practices

### Environment Variables

```bash
# Production .env
NODE_ENV=production
LOG_LEVEL=info  # or warn, error

# Database
DATABASE_PATH=/var/lib/signal-bot/signal-bot.db

# Security
WORKSPACE_DIR=/var/lib/signal-bot/workspace
SIGNAL_ALLOWED_SENDERS=+1234567890,+0987654321

# LLM
ANTHROPIC_API_KEY=sk-ant-...
LLM_MODEL=claude-sonnet-4-20250514
```

### Process Management

Use PM2 for auto-restart:

```bash
pm2 start npm --name signal-bot -- start
pm2 save
pm2 startup
```

### Monitoring

Log important events:

```typescript
logger.info('Bot started', { version: '1.0.0' });
logger.warn('Rate limit exceeded', { user: userId });
logger.error('Tool execution failed', { tool: name, error });
```

Integrate with logging service (e.g., Loki, CloudWatch).

### Backup Strategy

1. **Database backups**:
   ```bash
   sqlite3 data/signal-bot.db ".backup backup-$(date +%Y%m%d).db"
   ```

2. **Memory backup**:
   ```bash
   cp persistent_memory.md persistent_memory.$(date +%Y%m%d).md
   ```

3. **Automate with cron**:
   ```cron
   0 2 * * * /path/to/backup-script.sh
   ```

### Security Hardening

1. **Firewall rules**:
   - Block external access to port 8080 (Signal API)
   - Only allow localhost

2. **File permissions**:
   ```bash
   chmod 600 .env
   chmod 700 data/
   chmod 700 workspace/
   ```

3. **Docker network isolation**:
   ```yaml
   services:
     signal-api:
       networks:
         - internal
     bot:
       networks:
         - internal

   networks:
     internal:
       internal: true
   ```

---

## Troubleshooting

### Common Issues

1. **"Cannot connect to Signal API"**
   - Check Docker container: `docker ps`
   - Check logs: `docker logs signal-api`
   - Verify API URL: `curl http://localhost:8080/v1/about`

2. **"Database locked"**
   - WAL mode should prevent this
   - If persists, check for zombie processes
   - Restart bot

3. **"Tool execution timeout"**
   - Check network connectivity
   - Increase timeout in agent configuration
   - Log tool execution time

4. **"LLM API error"**
   - Check API key validity
   - Verify network access
   - Check rate limits

### Debug Mode

Enable verbose logging:

```bash
LOG_LEVEL=debug npm start
```

Logs will show:
- All incoming messages
- Tool call details
- Database queries
- API requests

---

## Contributing

### Code Style

- TypeScript strict mode
- ESLint + Prettier (if configured)
- Descriptive variable names
- JSDoc comments for public APIs

### Testing Requirements

- Unit tests for new database methods
- Integration tests for new tools
- Update existing tests if breaking changes

### Documentation

- Update README.md for user-facing changes
- Update agents.md for architecture changes
- Add inline comments for complex logic

---

## Appendix

### Zod Schema to JSON Schema Conversion

Zod schemas automatically convert to JSON Schema for LLM tools:

```typescript
z.object({
  name: z.string().describe('User name'),
  age: z.number().optional().describe('User age'),
})

// Converts to:
{
  type: 'object',
  properties: {
    name: { type: 'string', description: 'User name' },
    age: { type: 'number', description: 'User age' }
  },
  required: ['name']
}
```

### Signal API Endpoints Reference

```
GET  /v1/about                               # API info
GET  /v1/receive/:number                     # Poll messages
POST /v2/send                                 # Send message
GET  /v1/groups/:number                       # List groups
POST /v1/groups/:number                       # Create group
POST /v1/reactions/:number                    # Send reaction
GET  /v1/qrcodelink?device_name=:name        # Generate QR code
GET  /v1/identities/:number                   # List identities
```

### Environment Variable Reference

See `.env.example` for complete list with descriptions.

---

**End of agents.md**
