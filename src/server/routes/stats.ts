/**
 * Statistics API routes for dashboard
 */

import { Router, type Request, type Response } from 'express';
import type { ServerDependencies } from '../app';

// Track server start time for uptime calculation
const serverStartTime = Date.now();

export function createStatsRouter(deps: ServerDependencies): Router {
  const router = Router();

  /**
   * GET /api/stats/dashboard
   * Get overview statistics for the dashboard
   */
  router.get('/dashboard', (req: Request, res: Response) => {
    try {
      // Message counts
      const messageStmt = deps.db.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN direction = 'incoming' THEN 1 ELSE 0 END) as received,
          SUM(CASE WHEN direction = 'outgoing' THEN 1 ELSE 0 END) as sent
        FROM messages
      `);
      const messages = messageStmt.get() as { total: number; received: number; sent: number };

      // Active chats (chats with activity in last 24 hours)
      const activeChatsStmt = deps.db.db.prepare(`
        SELECT COUNT(DISTINCT chat_id) as count
        FROM messages
        WHERE timestamp > datetime('now', '-1 day')
      `);
      const activeChats = activeChatsStmt.get() as { count: number };

      // Tool calls today
      const toolCallsStmt = deps.db.db.prepare(`
        SELECT COUNT(*) as count
        FROM activity_logs
        WHERE log_type = 'tool_call'
        AND created_at > datetime('now', '-1 day')
      `);
      const toolCalls = toolCallsStmt.get() as { count: number };

      // Last activity
      const lastActivityStmt = deps.db.db.prepare(`
        SELECT MAX(timestamp) as last_activity FROM messages
      `);
      const lastActivity = lastActivityStmt.get() as { last_activity: string | null };

      // Error count (last 24 hours)
      const errorsStmt = deps.db.db.prepare(`
        SELECT COUNT(*) as count
        FROM activity_logs
        WHERE log_type = 'error'
        AND created_at > datetime('now', '-1 day')
      `);
      const errors = errorsStmt.get() as { count: number };

      // Scheduled tasks status
      const tasksStmt = deps.db.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as enabled
        FROM scheduled_tasks
      `);
      const tasks = tasksStmt.get() as { total: number; enabled: number };

      // Uptime in seconds
      const uptime = Math.floor((Date.now() - serverStartTime) / 1000);

      res.json({
        messagesReceived: messages.received || 0,
        messagesSent: messages.sent || 0,
        totalMessages: messages.total || 0,
        activeChats: activeChats.count || 0,
        toolCallsToday: toolCalls.count || 0,
        errorsToday: errors.count || 0,
        scheduledTasks: {
          total: tasks.total || 0,
          enabled: tasks.enabled || 0,
        },
        uptime,
        lastActivity: lastActivity.last_activity,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to get dashboard stats:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get dashboard stats',
      });
    }
  });

  /**
   * GET /api/stats/timeline
   * Get activity timeline (messages per hour/day)
   */
  router.get('/timeline', (req: Request, res: Response) => {
    try {
      const period = req.query.period as string || 'day';
      const limit = parseInt(req.query.limit as string) || 24;

      let stmt;
      if (period === 'hour') {
        // Last N hours
        stmt = deps.db.db.prepare(`
          SELECT
            strftime('%Y-%m-%d %H:00:00', timestamp) as period,
            COUNT(*) as count,
            SUM(CASE WHEN direction = 'incoming' THEN 1 ELSE 0 END) as incoming,
            SUM(CASE WHEN direction = 'outgoing' THEN 1 ELSE 0 END) as outgoing
          FROM messages
          WHERE timestamp > datetime('now', '-${limit} hours')
          GROUP BY period
          ORDER BY period DESC
        `);
      } else {
        // Last N days
        stmt = deps.db.db.prepare(`
          SELECT
            strftime('%Y-%m-%d', timestamp) as period,
            COUNT(*) as count,
            SUM(CASE WHEN direction = 'incoming' THEN 1 ELSE 0 END) as incoming,
            SUM(CASE WHEN direction = 'outgoing' THEN 1 ELSE 0 END) as outgoing
          FROM messages
          WHERE timestamp > datetime('now', '-${limit} days')
          GROUP BY period
          ORDER BY period DESC
        `);
      }

      const timeline = stmt.all();

      res.json({ timeline, period, limit });
    } catch (error) {
      console.error('Failed to get timeline:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get timeline',
      });
    }
  });

  /**
   * GET /api/stats/tools
   * Get tool usage statistics
   */
  router.get('/tools', (req: Request, res: Response) => {
    try {
      const stmt = deps.db.db.prepare(`
        SELECT
          json_extract(content, '$.tool') as tool_name,
          COUNT(*) as count
        FROM activity_logs
        WHERE log_type = 'tool_call'
        AND created_at > datetime('now', '-7 days')
        GROUP BY tool_name
        ORDER BY count DESC
        LIMIT 20
      `);

      const toolStats = stmt.all() as Array<{ tool_name: string; count: number }>;

      res.json({ tools: toolStats });
    } catch (error) {
      console.error('Failed to get tool stats:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get tool stats',
      });
    }
  });

  /**
   * GET /api/stats/performance
   * Get performance metrics
   */
  router.get('/performance', (req: Request, res: Response) => {
    try {
      // Database size
      const sizeStmt = deps.db.db.prepare(
        "SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()"
      );
      const sizeResult = sizeStmt.get() as { size: number };
      const dbSizeMB = sizeResult.size / (1024 * 1024);

      // Average response time (approximate from activity logs)
      const avgResponseStmt = deps.db.db.prepare(`
        SELECT AVG(
          (julianday(
            (SELECT created_at FROM activity_logs WHERE trace_id = a.trace_id AND log_type = 'response' LIMIT 1)
          ) - julianday(a.created_at)) * 86400000
        ) as avg_ms
        FROM activity_logs a
        WHERE a.log_type = 'invocation'
        AND a.created_at > datetime('now', '-1 day')
      `);
      const avgResponse = avgResponseStmt.get() as { avg_ms: number | null };

      // Memory usage (Node.js process)
      const memoryUsage = process.memoryUsage();

      res.json({
        database: {
          sizeMB: parseFloat(dbSizeMB.toFixed(2)),
        },
        averageResponseTime: avgResponse.avg_ms ? Math.round(avgResponse.avg_ms) : null,
        memory: {
          heapUsedMB: parseFloat((memoryUsage.heapUsed / 1024 / 1024).toFixed(2)),
          heapTotalMB: parseFloat((memoryUsage.heapTotal / 1024 / 1024).toFixed(2)),
          rssMB: parseFloat((memoryUsage.rss / 1024 / 1024).toFixed(2)),
        },
      });
    } catch (error) {
      console.error('Failed to get performance stats:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get performance stats',
      });
    }
  });

  return router;
}
