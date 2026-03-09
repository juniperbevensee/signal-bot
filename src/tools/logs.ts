/**
 * Log Reading Tools
 * Allows the bot to read its own activity from the database
 *
 * NOTE: Adapted to work with messages table (for message history)
 * and activity_logs table (for hierarchical trace data)
 */

import { z } from 'zod';
import { tool, Tool } from '../agent/tools';
import type { Database as BetterSqlite3 } from 'better-sqlite3';

// ============================================================================
// Tools Factory
// ============================================================================

export function createLogTools(db: BetterSqlite3): Tool[] {
  const tools: Tool[] = [];

  // Get Recent Activity (from messages table)
  tools.push(
    tool(
      'Get recent message history showing conversations. IMPORTANT: In group chats, always provide the chat_id to scope logs to only that group. In DMs with approved users, omit chat_id to see all logs.',
      async (args) => {
        const limit = Math.min(args.limit || 20, 100);

        let query = `
          SELECT
            m.id,
            m.timestamp,
            m.sender,
            m.direction,
            m.content,
            c.chat_type,
            c.signal_chat_id
          FROM messages m
          JOIN chats c ON m.chat_id = c.id
        `;
        const params: any[] = [];

        // Filter by chat_id if provided (for privacy in group chats)
        if (args.chat_id) {
          query += ` WHERE c.id = ?`;
          params.push(args.chat_id);
        }

        query += ` ORDER BY m.timestamp DESC LIMIT ?`;
        params.push(limit);

        const stmt = db.prepare(query);
        const logs = stmt.all(...params) as any[];

        if (logs.length === 0) {
          return 'No message history found';
        }

        const formatted = logs.map((log) => {
          const time = new Date(log.timestamp).toLocaleString();
          const location = log.chat_type === 'group' ? `group` : 'DM';
          const direction = log.direction === 'incoming' ? 'RECEIVED' : 'SENT';
          const content = (log.content || '').substring(0, 200);
          const truncated = (log.content?.length || 0) > 200 ? '...' : '';

          return `[${time}] ${direction} (${location})${log.direction === 'incoming' ? ` from ${log.sender}` : ''}:\n  ${content}${truncated}`;
        });

        return formatted.reverse().join('\n\n');
      },
      {
        name: 'logs_recent_activity',
        zodSchema: z.object({
          chat_id: z.string().optional().describe('Database chat ID to scope logs to (REQUIRED in group chats for privacy, omit in DMs to see all)'),
          limit: z.number().optional().describe('Maximum number of logs to return (default 20, max 100)'),
        }),
      }
    )
  );

  // Get Tool Usage (from activity_logs trace data)
  tools.push(
    tool(
      'Get logs of recent activity traces including tool calls. IMPORTANT: In group chats, always provide the chat_id to scope logs to only that group. In DMs with approved users, omit chat_id to see all logs.',
      async (args) => {
        const limit = Math.min(args.limit || 10, 50);

        let query = `
          SELECT
            al.id,
            al.created_at,
            al.log_type,
            al.content,
            al.trace_id,
            al.chat_id
          FROM activity_logs al
          WHERE al.log_type IN ('tool_call', 'tool_result')
        `;
        const params: any[] = [];

        // Filter by chat_id if provided (for privacy in group chats)
        if (args.chat_id) {
          query += ` AND al.chat_id = ?`;
          params.push(args.chat_id);
        }

        query += ` ORDER BY al.created_at DESC LIMIT ?`;
        params.push(limit);

        const stmt = db.prepare(query);
        const logs = stmt.all(...params) as any[];

        if (logs.length === 0) {
          return 'No activity traces found. This likely means activity logging is disabled.';
        }

        const formatted = logs.map((log) => {
          const time = new Date(log.created_at).toLocaleString();
          let content;
          try {
            content = JSON.parse(log.content);
          } catch {
            content = log.content;
          }
          const contentStr = typeof content === 'object'
            ? JSON.stringify(content, null, 2).substring(0, 300)
            : String(content).substring(0, 300);
          const truncated = contentStr.length >= 300 ? '...' : '';

          return `[${time}] ${log.log_type.toUpperCase()}\n${contentStr}${truncated}`;
        });

        return formatted.reverse().join('\n\n');
      },
      {
        name: 'logs_tool_usage',
        zodSchema: z.object({
          chat_id: z.string().optional().describe('Database chat ID to scope logs to (REQUIRED in group chats for privacy, omit in DMs to see all)'),
          limit: z.number().optional().describe('Maximum number of logs to return (default 10, max 50)'),
        }),
      }
    )
  );

  // Get Statistics
  tools.push(
    tool(
      'Get bot usage statistics including message counts. IMPORTANT: In group chats, always provide the chat_id to scope stats to only that group. In DMs with approved users, omit chat_id to see global stats.',
      async (args) => {
        const hours = args.hours || 24;
        const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

        // Message counts
        let msgQuery = `
          SELECT
            COUNT(CASE WHEN direction = 'incoming' THEN 1 END) as messages_received,
            COUNT(CASE WHEN direction = 'outgoing' THEN 1 END) as responses_sent
          FROM messages m
          WHERE m.timestamp >= ?
        `;
        const msgParams: any[] = [since];

        if (args.chat_id) {
          msgQuery += ` AND m.chat_id = ?`;
          msgParams.push(args.chat_id);
        }

        const msgStmt = db.prepare(msgQuery);
        const msgStats = msgStmt.get(...msgParams) as any;

        // Activity log counts
        let activityQuery = `
          SELECT
            COUNT(CASE WHEN log_type = 'invocation' THEN 1 END) as invocations,
            COUNT(CASE WHEN log_type = 'tool_call' THEN 1 END) as tool_calls,
            COUNT(CASE WHEN log_type = 'error' THEN 1 END) as errors
          FROM activity_logs al
          WHERE al.created_at >= ?
        `;
        const activityParams: any[] = [since];

        if (args.chat_id) {
          activityQuery += ` AND al.chat_id = ?`;
          activityParams.push(args.chat_id);
        }

        const activityStmt = db.prepare(activityQuery);
        const activityStats = activityStmt.get(...activityParams) as any;

        // Unique users
        let userQuery = `
          SELECT COUNT(DISTINCT sender) as unique_users
          FROM messages m
          WHERE m.timestamp >= ? AND m.direction = 'incoming'
        `;
        const userParams: any[] = [since];

        if (args.chat_id) {
          userQuery += ` AND m.chat_id = ?`;
          userParams.push(args.chat_id);
        }

        const userStmt = db.prepare(userQuery);
        const userStats = userStmt.get(...userParams) as any;

        const stats = {
          period: `Last ${hours} hours`,
          messages: {
            received: msgStats?.messages_received || 0,
            sent: msgStats?.responses_sent || 0,
          },
          activity: {
            invocations: activityStats?.invocations || 0,
            tool_calls: activityStats?.tool_calls || 0,
            errors: activityStats?.errors || 0,
          },
          unique_users: userStats?.unique_users || 0,
        };

        return JSON.stringify(stats, null, 2);
      },
      {
        name: 'logs_statistics',
        zodSchema: z.object({
          chat_id: z.string().optional().describe('Database chat ID to scope stats to (REQUIRED in group chats for privacy, omit in DMs to see global stats)'),
          hours: z.number().optional().describe('Time period in hours (default 24)'),
        }),
      }
    )
  );

  // Search Messages
  tools.push(
    tool(
      'Search message history by content or sender. IMPORTANT: In group chats, always provide the chat_id to scope search to only that group. In DMs with approved users, omit chat_id to search all.',
      async (args) => {
        const limit = Math.min(args.limit || 20, 100);
        let query = `
          SELECT
            m.id,
            m.timestamp,
            m.sender,
            m.direction,
            m.content,
            c.chat_type
          FROM messages m
          JOIN chats c ON m.chat_id = c.id
          WHERE 1=1
        `;
        const params: any[] = [];

        // Filter by chat_id if provided (for privacy in group chats)
        if (args.chat_id) {
          query += ` AND c.id = ?`;
          params.push(args.chat_id);
        }

        if (args.query) {
          query += ` AND m.content LIKE ?`;
          params.push(`%${args.query}%`);
        }

        if (args.sender) {
          query += ` AND m.sender = ?`;
          params.push(args.sender);
        }

        query += ` ORDER BY m.timestamp DESC LIMIT ?`;
        params.push(limit);

        const stmt = db.prepare(query);
        const logs = stmt.all(...params) as any[];

        if (logs.length === 0) {
          return 'No matching messages found';
        }

        const formatted = logs.map((log) => {
          const time = new Date(log.timestamp).toLocaleString();
          const content = (log.content || '').substring(0, 200);
          const truncated = (log.content?.length || 0) > 200 ? '...' : '';
          return `[${time}] ${log.direction} - ${log.sender}\n  ${content}${truncated}`;
        });

        return formatted.reverse().join('\n\n');
      },
      {
        name: 'logs_search',
        zodSchema: z.object({
          chat_id: z.string().optional().describe('Database chat ID to scope search to (REQUIRED in group chats for privacy, omit in DMs to see all)'),
          query: z.string().optional().describe('Search term to find in message content'),
          sender: z.string().optional().describe('Filter by sender phone number'),
          limit: z.number().optional().describe('Maximum number of results (default 20, max 100)'),
        }),
      }
    )
  );

  return tools;
}
