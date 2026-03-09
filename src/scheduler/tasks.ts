/**
 * Built-in scheduled tasks for the Signal bot
 */

import type { TaskDefinition, TaskContext, TaskResult } from './types';
import type { DatabaseClient } from '../database/client';
import { readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';

/**
 * Create built-in task definitions
 */
export function createBuiltInTasks(db: DatabaseClient, config: any): TaskDefinition[] {
  return [
    {
      name: 'cleanup_old_messages',
      description: 'Delete messages and activity logs older than configured retention period',
      schedule: '0 2 * * *', // Daily at 2 AM
      enabled: false, // Disabled by default
      metadata: {
        retentionDays: 90,
      },
      handler: async (context: TaskContext): Promise<TaskResult> => {
        const retentionDays = 90; // Default
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        const cutoffTimestamp = cutoffDate.toISOString();

        try {
          // Delete old messages
          const messagesStmt = db.db.prepare('DELETE FROM messages WHERE timestamp < ?');
          const messagesResult = messagesStmt.run(cutoffTimestamp);

          // Delete old activity logs
          const logsStmt = db.db.prepare('DELETE FROM activity_logs WHERE created_at < ?');
          const logsResult = logsStmt.run(cutoffTimestamp);

          // Delete old task history
          const historyStmt = db.db.prepare('DELETE FROM task_history WHERE executed_at < ?');
          const historyResult = historyStmt.run(cutoffTimestamp);

          return {
            success: true,
            message: `Cleaned up old data: ${messagesResult.changes} messages, ${logsResult.changes} activity logs, ${historyResult.changes} task history entries`,
            data: {
              messagesDeleted: messagesResult.changes,
              logsDeleted: logsResult.changes,
              historyDeleted: historyResult.changes,
            },
          };
        } catch (error) {
          return {
            success: false,
            message: `Failed to clean up old messages: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },

    {
      name: 'memory_backup',
      description: 'Backup persistent memory files to prevent data loss',
      schedule: '0 */6 * * *', // Every 6 hours
      enabled: false, // Disabled by default
      handler: async (context: TaskContext): Promise<TaskResult> => {
        try {
          const workspaceDir = config.workspaceDir || './workspace';
          const backupDir = join(workspaceDir, '.backups');
          const memoryDir = join(workspaceDir, '.memory');

          // Check if memory directory exists
          try {
            await stat(memoryDir);
          } catch {
            return {
              success: true,
              message: 'No memory directory found, skipping backup',
            };
          }

          // Create backup directory if it doesn't exist
          try {
            await stat(backupDir);
          } catch {
            const { mkdir } = await import('fs/promises');
            await mkdir(backupDir, { recursive: true });
          }

          // Copy memory files to backup with timestamp
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const files = await readdir(memoryDir);
          let backedUpCount = 0;

          for (const file of files) {
            const sourcePath = join(memoryDir, file);
            const backupPath = join(backupDir, `${file}.${timestamp}.bak`);

            const { copyFile } = await import('fs/promises');
            await copyFile(sourcePath, backupPath);
            backedUpCount++;
          }

          // Clean up old backups (keep last 10 for each file)
          const backupFiles = await readdir(backupDir);
          const fileGroups = new Map<string, string[]>();

          for (const file of backupFiles) {
            const baseName = file.split('.').slice(0, -2).join('.');
            if (!fileGroups.has(baseName)) {
              fileGroups.set(baseName, []);
            }
            fileGroups.get(baseName)!.push(file);
          }

          let deletedCount = 0;
          for (const [, files] of fileGroups) {
            if (files.length > 10) {
              // Sort by timestamp (embedded in filename) and keep last 10
              files.sort();
              const toDelete = files.slice(0, files.length - 10);

              for (const file of toDelete) {
                await unlink(join(backupDir, file));
                deletedCount++;
              }
            }
          }

          return {
            success: true,
            message: `Backed up ${backedUpCount} memory files, cleaned up ${deletedCount} old backups`,
            data: {
              backedUpCount,
              deletedCount,
            },
          };
        } catch (error) {
          return {
            success: false,
            message: `Failed to backup memory: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },

    {
      name: 'health_check',
      description: 'Check Signal API connectivity and database health',
      schedule: '*/15 * * * *', // Every 15 minutes
      enabled: false, // Disabled by default
      handler: async (context: TaskContext): Promise<TaskResult> => {
        try {
          // Check database connectivity
          const stmt = db.db.prepare('SELECT 1');
          stmt.get();

          // Check database size
          const sizeStmt = db.db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()");
          const sizeResult = sizeStmt.get() as { size: number };
          const dbSizeMB = sizeResult.size / (1024 * 1024);

          // Count recent errors
          const errorStmt = db.db.prepare(`
            SELECT COUNT(*) as count FROM activity_logs
            WHERE log_type = 'error'
            AND created_at > datetime('now', '-15 minutes')
          `);
          const errorResult = errorStmt.get() as { count: number };

          const healthy = errorResult.count < 10; // Arbitrary threshold

          return {
            success: healthy,
            message: healthy
              ? `System healthy: DB size ${dbSizeMB.toFixed(2)} MB, ${errorResult.count} recent errors`
              : `System unhealthy: ${errorResult.count} errors in last 15 minutes`,
            data: {
              dbSizeMB: parseFloat(dbSizeMB.toFixed(2)),
              recentErrors: errorResult.count,
              healthy,
            },
          };
        } catch (error) {
          return {
            success: false,
            message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },

    {
      name: 'stats_snapshot',
      description: 'Log daily usage statistics for monitoring',
      schedule: '0 0 * * *', // Daily at midnight
      enabled: false, // Disabled by default
      handler: async (context: TaskContext): Promise<TaskResult> => {
        try {
          // Get message counts
          const messagesStmt = db.db.prepare(`
            SELECT
              COUNT(*) as total,
              SUM(CASE WHEN direction = 'incoming' THEN 1 ELSE 0 END) as incoming,
              SUM(CASE WHEN direction = 'outgoing' THEN 1 ELSE 0 END) as outgoing
            FROM messages
            WHERE timestamp > datetime('now', '-1 day')
          `);
          const messages = messagesStmt.get() as { total: number; incoming: number; outgoing: number };

          // Get chat count
          const chatsStmt = db.db.prepare(`
            SELECT COUNT(*) as count FROM chats
            WHERE updated_at > datetime('now', '-1 day')
          `);
          const chats = chatsStmt.get() as { count: number };

          // Get tool call count
          const toolsStmt = db.db.prepare(`
            SELECT COUNT(*) as count FROM activity_logs
            WHERE log_type = 'tool_call'
            AND created_at > datetime('now', '-1 day')
          `);
          const tools = toolsStmt.get() as { count: number };

          // Store snapshot in config
          const snapshot = {
            date: new Date().toISOString().split('T')[0],
            messages: messages.total,
            incoming: messages.incoming,
            outgoing: messages.outgoing,
            activeChats: chats.count,
            toolCalls: tools.count,
          };

          db.setConfig(`stats_snapshot_${snapshot.date}`, JSON.stringify(snapshot));

          return {
            success: true,
            message: `Daily snapshot: ${messages.total} messages, ${chats.count} active chats, ${tools.count} tool calls`,
            data: snapshot,
          };
        } catch (error) {
          return {
            success: false,
            message: `Failed to create stats snapshot: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  ];
}
