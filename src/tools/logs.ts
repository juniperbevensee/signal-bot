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
      'Get recent message history showing conversations.',
      async (args) => {
        const limit = Math.min(args.limit || 20, 100);
        const stmt = db.prepare(`
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
          ORDER BY m.timestamp DESC
          LIMIT ?
        `);

        const logs = stmt.all(limit) as any[];

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
          limit: z.number().optional().describe('Maximum number of logs to return (default 20, max 100)'),
        }),
      }
    )
  );

  // Get Tool Usage (from activity_logs trace data)
  tools.push(
    tool(
      'Get logs of recent activity traces including tool calls.',
      async (args) => {
        const limit = Math.min(args.limit || 10, 50);
        const stmt = db.prepare(`
          SELECT
            id,
            created_at,
            log_type,
            content,
            trace_id
          FROM activity_logs
          WHERE log_type IN ('tool_call', 'tool_result')
          ORDER BY created_at DESC
          LIMIT ?
        `);

        const logs = stmt.all(limit) as any[];

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
          limit: z.number().optional().describe('Maximum number of logs to return (default 10, max 50)'),
        }),
      }
    )
  );

  // Get Statistics
  tools.push(
    tool(
      'Get bot usage statistics including message counts.',
      async (args) => {
        const hours = args.hours || 24;
        const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

        // Message counts
        const msgStmt = db.prepare(`
          SELECT
            COUNT(CASE WHEN direction = 'incoming' THEN 1 END) as messages_received,
            COUNT(CASE WHEN direction = 'outgoing' THEN 1 END) as responses_sent
          FROM messages
          WHERE timestamp >= ?
        `);
        const msgStats = msgStmt.get(since) as any;

        // Activity log counts
        const activityStmt = db.prepare(`
          SELECT
            COUNT(CASE WHEN log_type = 'invocation' THEN 1 END) as invocations,
            COUNT(CASE WHEN log_type = 'tool_call' THEN 1 END) as tool_calls,
            COUNT(CASE WHEN log_type = 'error' THEN 1 END) as errors
          FROM activity_logs
          WHERE created_at >= ?
        `);
        const activityStats = activityStmt.get(since) as any;

        // Unique users
        const userStmt = db.prepare(`
          SELECT COUNT(DISTINCT sender) as unique_users
          FROM messages
          WHERE timestamp >= ? AND direction = 'incoming'
        `);
        const userStats = userStmt.get(since) as any;

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
          hours: z.number().optional().describe('Time period in hours (default 24)'),
        }),
      }
    )
  );

  // Search Messages
  tools.push(
    tool(
      'Search message history by content or sender.',
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
          query: z.string().optional().describe('Search term to find in message content'),
          sender: z.string().optional().describe('Filter by sender phone number'),
          limit: z.number().optional().describe('Maximum number of results (default 20, max 100)'),
        }),
      }
    )
  );

  return tools;
}
