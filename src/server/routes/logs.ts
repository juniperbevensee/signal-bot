/**
 * Logs API routes for viewing messages and activity
 */

import { Router, type Request, type Response } from 'express';
import type { ServerDependencies } from '../app';

export function createLogsRouter(deps: ServerDependencies): Router {
  const router = Router();

  /**
   * GET /api/logs/messages
   * Get message history
   */
  router.get('/messages', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const chatId = req.query.chatId as string;

      let messages;
      let total = 0;

      if (chatId) {
        // Get messages for specific chat
        messages = deps.db.getMessages(chatId, limit, offset);

        // Get total count for pagination
        const countStmt = deps.db.db.prepare('SELECT COUNT(*) as count FROM messages WHERE chat_id = ?');
        const countResult = countStmt.get(chatId) as { count: number };
        total = countResult.count;
      } else {
        // Get all messages across all chats
        const stmt = deps.db.db.prepare(`
          SELECT m.*, c.display_name as chat_name
          FROM messages m
          LEFT JOIN chats c ON m.chat_id = c.id
          ORDER BY m.timestamp DESC
          LIMIT ? OFFSET ?
        `);
        messages = stmt.all(limit, offset);

        // Get total count
        const countStmt = deps.db.db.prepare('SELECT COUNT(*) as count FROM messages');
        const countResult = countStmt.get() as { count: number };
        total = countResult.count;
      }

      res.json({
        messages,
        total,
        limit,
        offset,
        hasMore: offset + messages.length < total,
      });
    } catch (error) {
      console.error('Failed to get messages:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get messages',
      });
    }
  });

  /**
   * GET /api/logs/activity
   * Get activity logs
   */
  router.get('/activity', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const chatId = req.query.chatId as string;
      const traceId = req.query.traceId as string;

      let logs;
      let total = 0;

      if (traceId) {
        // Get specific trace
        logs = deps.db.getActivityTrace(traceId);
        total = logs.length;
      } else if (chatId) {
        // Get activity for specific chat
        logs = deps.db.getRecentActivity(chatId, limit);

        const countStmt = deps.db.db.prepare('SELECT COUNT(*) as count FROM activity_logs WHERE chat_id = ?');
        const countResult = countStmt.get(chatId) as { count: number };
        total = countResult.count;
      } else {
        // Get all recent activity
        const stmt = deps.db.db.prepare(`
          SELECT al.*, c.display_name as chat_name
          FROM activity_logs al
          LEFT JOIN chats c ON al.chat_id = c.id
          ORDER BY al.created_at DESC
          LIMIT ? OFFSET ?
        `);
        logs = stmt.all(limit, offset);

        const countStmt = deps.db.db.prepare('SELECT COUNT(*) as count FROM activity_logs');
        const countResult = countStmt.get() as { count: number };
        total = countResult.count;
      }

      res.json({
        logs,
        total,
        limit,
        offset,
        hasMore: offset + logs.length < total,
      });
    } catch (error) {
      console.error('Failed to get activity logs:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get activity logs',
      });
    }
  });

  /**
   * GET /api/logs/search
   * Search messages by content
   */
  router.get('/search', (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      const chatId = req.query.chatId as string;
      const limit = parseInt(req.query.limit as string) || 20;

      if (!query) {
        return res.status(400).json({ error: 'Search query is required' });
      }

      let results;

      if (chatId) {
        results = deps.db.searchMessages(chatId, query, limit);
      } else {
        // Search across all chats
        const stmt = deps.db.db.prepare(`
          SELECT m.*, c.display_name as chat_name
          FROM messages m
          LEFT JOIN chats c ON m.chat_id = c.id
          WHERE m.content LIKE ? ESCAPE '\\'
          ORDER BY m.timestamp DESC
          LIMIT ?
        `);

        // Escape special characters for LIKE
        const escapedQuery = query.replace(/[%_\\]/g, '\\$&');
        results = stmt.all(`%${escapedQuery}%`, limit);
      }

      res.json({ results, query, count: results.length });
    } catch (error) {
      console.error('Search failed:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Search failed',
      });
    }
  });

  /**
   * GET /api/logs/chats
   * List all chats
   */
  router.get('/chats', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const chats = deps.db.listChats(limit);

      res.json({ chats });
    } catch (error) {
      console.error('Failed to get chats:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get chats',
      });
    }
  });

  /**
   * GET /api/logs/stats
   * Get log statistics
   */
  router.get('/stats', (req: Request, res: Response) => {
    try {
      // Message counts
      const messageStmt = deps.db.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN direction = 'incoming' THEN 1 ELSE 0 END) as incoming,
          SUM(CASE WHEN direction = 'outgoing' THEN 1 ELSE 0 END) as outgoing
        FROM messages
      `);
      const messages = messageStmt.get() as { total: number; incoming: number; outgoing: number };

      // Chat counts
      const chatStmt = deps.db.db.prepare('SELECT COUNT(*) as count FROM chats');
      const chats = chatStmt.get() as { count: number };

      // Activity log counts by type
      const activityStmt = deps.db.db.prepare(`
        SELECT
          log_type,
          COUNT(*) as count
        FROM activity_logs
        GROUP BY log_type
      `);
      const activityCounts = activityStmt.all() as Array<{ log_type: string; count: number }>;

      // Recent activity (last 24 hours)
      const recentStmt = deps.db.db.prepare(`
        SELECT COUNT(*) as count
        FROM messages
        WHERE timestamp > datetime('now', '-1 day')
      `);
      const recentMessages = recentStmt.get() as { count: number };

      res.json({
        messages,
        chats: chats.count,
        activityByType: Object.fromEntries(activityCounts.map(a => [a.log_type, a.count])),
        recentMessages: recentMessages.count,
      });
    } catch (error) {
      console.error('Failed to get log stats:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get log stats',
      });
    }
  });

  return router;
}
