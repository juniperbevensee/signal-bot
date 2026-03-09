/**
 * Log Reading Tools
 * Allows the bot to read its own activity logs from the database
 */

import { z } from 'zod';
import { tool, Tool } from '../agent/tools';
import type { Database as BetterSqlite3 } from 'better-sqlite3';

// ============================================================================
// Types
// ============================================================================

interface ActivityLog {
  id: number;
  timestamp: string;
  sender: string;
  group_id: string | null;
  message_type: string;
  content: string;
  tool_name: string | null;
  tool_input: string | null;
  tool_output: string | null;
  response: string | null;
  tokens_used: number | null;
  processing_time_ms: number | null;
}

// ============================================================================
// Tools Factory
// ============================================================================

export function createLogTools(db: BetterSqlite3): Tool[] {
  const tools: Tool[] = [];

  // Get Recent Activity
  tools.push(
    tool(
      'Get recent activity logs showing messages received and responses sent.',
      async (args) => {
        const limit = Math.min(args.limit || 20, 100);
        const stmt = db.prepare(`
          SELECT id, timestamp, sender, group_id, message_type, content, response, tokens_used, processing_time_ms
          FROM activity_logs
          WHERE message_type IN ('message_received', 'response_sent')
          ORDER BY timestamp DESC
          LIMIT ?
        `);

        const logs = stmt.all(limit) as ActivityLog[];

        if (logs.length === 0) {
          return 'No activity logs found';
        }

        const formatted = logs.map((log) => {
          const time = new Date(log.timestamp).toLocaleString();
          const location = log.group_id ? `group:${log.group_id.substring(0, 8)}...` : 'DM';

          if (log.message_type === 'message_received') {
            return `[${time}] RECEIVED from ${log.sender} (${location}):\n  ${log.content}`;
          } else {
            const tokens = log.tokens_used ? ` [${log.tokens_used} tokens]` : '';
            const time_ms = log.processing_time_ms ? ` [${log.processing_time_ms}ms]` : '';
            return `[${time}] SENT${tokens}${time_ms}:\n  ${log.response?.substring(0, 200)}${(log.response?.length || 0) > 200 ? '...' : ''}`;
          }
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

  // Get Tool Usage
  tools.push(
    tool(
      'Get logs of tool calls made by the bot.',
      async (args) => {
        const limit = Math.min(args.limit || 20, 100);
        let query = `
          SELECT id, timestamp, tool_name, tool_input, tool_output, processing_time_ms
          FROM activity_logs
          WHERE message_type = 'tool_call'
        `;
        const params: any[] = [];

        if (args.tool_name) {
          query += ` AND tool_name = ?`;
          params.push(args.tool_name);
        }

        query += ` ORDER BY timestamp DESC LIMIT ?`;
        params.push(limit);

        const stmt = db.prepare(query);
        const logs = stmt.all(...params) as ActivityLog[];

        if (logs.length === 0) {
          return args.tool_name ? `No tool calls found for "${args.tool_name}"` : 'No tool calls found';
        }

        const formatted = logs.map((log) => {
          const time = new Date(log.timestamp).toLocaleString();
          const duration = log.processing_time_ms ? ` (${log.processing_time_ms}ms)` : '';
          const input = log.tool_input ? JSON.parse(log.tool_input) : {};
          const inputStr = JSON.stringify(input, null, 2).substring(0, 200);
          const outputStr = (log.tool_output || '').substring(0, 200);

          return `[${time}] ${log.tool_name}${duration}\n  Input: ${inputStr}\n  Output: ${outputStr}${(log.tool_output?.length || 0) > 200 ? '...' : ''}`;
        });

        return formatted.reverse().join('\n\n');
      },
      {
        name: 'logs_tool_usage',
        zodSchema: z.object({
          tool_name: z.string().optional().describe('Filter by specific tool name'),
          limit: z.number().optional().describe('Maximum number of logs to return (default 20, max 100)'),
        }),
      }
    )
  );

  // Get Statistics
  tools.push(
    tool(
      'Get bot usage statistics including message counts and token usage.',
      async (args) => {
        const hours = args.hours || 24;
        const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

        // Message counts
        const msgStmt = db.prepare(`
          SELECT
            COUNT(CASE WHEN message_type = 'message_received' THEN 1 END) as messages_received,
            COUNT(CASE WHEN message_type = 'response_sent' THEN 1 END) as responses_sent,
            COUNT(CASE WHEN message_type = 'tool_call' THEN 1 END) as tool_calls
          FROM activity_logs
          WHERE timestamp >= ?
        `);
        const msgStats = msgStmt.get(since) as any;

        // Token usage
        const tokenStmt = db.prepare(`
          SELECT
            SUM(tokens_used) as total_tokens,
            AVG(tokens_used) as avg_tokens,
            AVG(processing_time_ms) as avg_processing_time
          FROM activity_logs
          WHERE timestamp >= ? AND tokens_used IS NOT NULL
        `);
        const tokenStats = tokenStmt.get(since) as any;

        // Unique users
        const userStmt = db.prepare(`
          SELECT COUNT(DISTINCT sender) as unique_users
          FROM activity_logs
          WHERE timestamp >= ? AND sender IS NOT NULL
        `);
        const userStats = userStmt.get(since) as any;

        // Top tools
        const toolStmt = db.prepare(`
          SELECT tool_name, COUNT(*) as count
          FROM activity_logs
          WHERE timestamp >= ? AND message_type = 'tool_call'
          GROUP BY tool_name
          ORDER BY count DESC
          LIMIT 5
        `);
        const topTools = toolStmt.all(since) as any[];

        const stats = {
          period: `Last ${hours} hours`,
          messages: {
            received: msgStats?.messages_received || 0,
            sent: msgStats?.responses_sent || 0,
            tool_calls: msgStats?.tool_calls || 0,
          },
          tokens: {
            total: Math.round(tokenStats?.total_tokens || 0),
            average_per_response: Math.round(tokenStats?.avg_tokens || 0),
          },
          performance: {
            avg_processing_time_ms: Math.round(tokenStats?.avg_processing_time || 0),
          },
          unique_users: userStats?.unique_users || 0,
          top_tools: topTools.map((t) => `${t.tool_name}: ${t.count}`),
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

  // Search Logs
  tools.push(
    tool(
      'Search activity logs by content or sender.',
      async (args) => {
        const limit = Math.min(args.limit || 20, 100);
        let query = `
          SELECT id, timestamp, sender, group_id, message_type, content, response
          FROM activity_logs
          WHERE 1=1
        `;
        const params: any[] = [];

        if (args.query) {
          query += ` AND (content LIKE ? OR response LIKE ?)`;
          params.push(`%${args.query}%`, `%${args.query}%`);
        }

        if (args.sender) {
          query += ` AND sender = ?`;
          params.push(args.sender);
        }

        query += ` ORDER BY timestamp DESC LIMIT ?`;
        params.push(limit);

        const stmt = db.prepare(query);
        const logs = stmt.all(...params) as ActivityLog[];

        if (logs.length === 0) {
          return 'No matching logs found';
        }

        const formatted = logs.map((log) => {
          const time = new Date(log.timestamp).toLocaleString();
          const content = log.content || log.response || '';
          return `[${time}] ${log.message_type} - ${log.sender || 'system'}\n  ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`;
        });

        return formatted.reverse().join('\n\n');
      },
      {
        name: 'logs_search',
        zodSchema: z.object({
          query: z.string().optional().describe('Search term to find in message content or responses'),
          sender: z.string().optional().describe('Filter by sender phone number'),
          limit: z.number().optional().describe('Maximum number of results (default 20, max 100)'),
        }),
      }
    )
  );

  return tools;
}
