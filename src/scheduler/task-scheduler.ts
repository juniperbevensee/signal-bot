/**
 * Task Scheduler - Manages cron-based recurring tasks
 */

import cron from 'node-cron';
import type { DatabaseClient } from '../database/client';
import { generateId, now, stringifyMetadata, parseMetadata } from '../database/schema';
import type {
  ScheduledTask,
  TaskHistory,
  TaskDefinition,
  TaskContext,
  TaskResult,
} from './types';

interface CronJob {
  task: cron.ScheduledTask;
  definition: TaskDefinition;
}

export class TaskScheduler {
  private db: DatabaseClient;
  private jobs: Map<string, CronJob> = new Map();
  private taskHandlers: Map<string, TaskDefinition['handler']> = new Map();

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  /**
   * Register a task definition and create it in the database if it doesn't exist
   */
  async register(definition: TaskDefinition): Promise<string> {
    const taskId = generateId();
    const timestamp = now();

    // Store handler in memory
    this.taskHandlers.set(definition.name, definition.handler);

    // Check if task already exists by name
    const existing = this.getByName(definition.name);
    if (existing) {
      // Update handler and schedule if changed
      if (existing.schedule !== definition.schedule || definition.enabled !== undefined) {
        this.updateTask(existing.id, {
          schedule: definition.schedule,
          enabled: definition.enabled ?? existing.enabled,
        });
      }
      return existing.id;
    }

    // Create new task in database
    const stmt = this.db.db.prepare(`
      INSERT INTO scheduled_tasks (
        id, name, description, schedule, enabled, created_at, updated_at, metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      taskId,
      definition.name,
      definition.description,
      definition.schedule,
      definition.enabled !== false ? 1 : 0,
      timestamp,
      timestamp,
      stringifyMetadata(definition.metadata || null)
    );

    // Start the cron job if enabled
    if (definition.enabled !== false) {
      this.startJob(taskId, definition);
    }

    return taskId;
  }

  /**
   * Unregister a task (stop cron job and optionally delete from database)
   */
  unregister(taskId: string, deleteFromDb: boolean = false): void {
    this.stopJob(taskId);

    if (deleteFromDb) {
      const stmt = this.db.db.prepare('DELETE FROM scheduled_tasks WHERE id = ?');
      stmt.run(taskId);
    }
  }

  /**
   * Enable a task (start cron job)
   */
  enable(taskId: string): void {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const handler = this.taskHandlers.get(task.name);
    if (!handler) throw new Error(`No handler registered for task ${task.name}`);

    // Update database
    const stmt = this.db.db.prepare('UPDATE scheduled_tasks SET enabled = 1, updated_at = ? WHERE id = ?');
    stmt.run(now(), taskId);

    // Start cron job
    const definition: TaskDefinition = {
      name: task.name,
      description: task.description,
      schedule: task.schedule,
      handler,
      metadata: parseMetadata(task.metadata),
    };

    this.startJob(taskId, definition);
  }

  /**
   * Disable a task (stop cron job)
   */
  disable(taskId: string): void {
    const stmt = this.db.db.prepare('UPDATE scheduled_tasks SET enabled = 0, updated_at = ? WHERE id = ?');
    stmt.run(now(), taskId);

    this.stopJob(taskId);
  }

  /**
   * Update a task's schedule or enabled status
   */
  updateTask(taskId: string, updates: { schedule?: string; enabled?: boolean; description?: string }): void {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.schedule !== undefined) {
      // Validate cron syntax
      if (!cron.validate(updates.schedule)) {
        throw new Error(`Invalid cron syntax: ${updates.schedule}`);
      }
      fields.push('schedule = ?');
      values.push(updates.schedule);
    }

    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
    }

    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(now());
    values.push(taskId);

    const stmt = this.db.db.prepare(
      `UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?`
    );
    stmt.run(...values);

    // Restart job if schedule changed and task is enabled
    if (updates.schedule && task.enabled) {
      const handler = this.taskHandlers.get(task.name);
      if (handler) {
        this.stopJob(taskId);
        this.startJob(taskId, {
          name: task.name,
          description: updates.description || task.description,
          schedule: updates.schedule,
          handler,
          metadata: parseMetadata(task.metadata),
        });
      }
    }

    // Handle enable/disable
    if (updates.enabled !== undefined) {
      if (updates.enabled) {
        this.enable(taskId);
      } else {
        this.disable(taskId);
      }
    }
  }

  /**
   * Get all scheduled tasks
   */
  getAllTasks(): ScheduledTask[] {
    const stmt = this.db.db.prepare('SELECT * FROM scheduled_tasks ORDER BY name ASC');
    const rows = stmt.all() as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      schedule: row.schedule,
      enabled: row.enabled === 1,
      lastRun: row.last_run,
      nextRun: row.next_run,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: parseMetadata(row.metadata),
    }));
  }

  /**
   * Get a single task by ID
   */
  getTask(taskId: string): ScheduledTask | null {
    const stmt = this.db.db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?');
    const row = stmt.get(taskId) as any;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      schedule: row.schedule,
      enabled: row.enabled === 1,
      lastRun: row.last_run,
      nextRun: row.next_run,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: parseMetadata(row.metadata),
    };
  }

  /**
   * Get a task by name
   */
  getByName(name: string): ScheduledTask | null {
    const stmt = this.db.db.prepare('SELECT * FROM scheduled_tasks WHERE name = ?');
    const row = stmt.get(name) as any;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      schedule: row.schedule,
      enabled: row.enabled === 1,
      lastRun: row.last_run,
      nextRun: row.next_run,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: parseMetadata(row.metadata),
    };
  }

  /**
   * Get task execution history
   */
  getHistory(taskId: string, limit: number = 50): TaskHistory[] {
    const stmt = this.db.db.prepare(`
      SELECT * FROM task_history
      WHERE task_id = ?
      ORDER BY executed_at DESC
      LIMIT ?
    `);
    const rows = stmt.all(taskId, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      taskId: row.task_id,
      executedAt: row.executed_at,
      success: row.success === 1,
      error: row.error,
      duration: row.duration,
      result: row.result,
    }));
  }

  /**
   * Execute a task manually (outside of cron schedule)
   */
  async executeTask(taskId: string): Promise<TaskResult> {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const handler = this.taskHandlers.get(task.name);
    if (!handler) throw new Error(`No handler registered for task ${task.name}`);

    return this.runTask(taskId, task.name, handler);
  }

  /**
   * Start all enabled tasks on initialization
   */
  async startAll(): Promise<void> {
    const tasks = this.getAllTasks();

    for (const task of tasks) {
      if (task.enabled) {
        const handler = this.taskHandlers.get(task.name);
        if (handler) {
          this.startJob(task.id, {
            name: task.name,
            description: task.description,
            schedule: task.schedule,
            handler,
            metadata: task.metadata,
          });
        }
      }
    }
  }

  /**
   * Stop all running tasks
   */
  stopAll(): void {
    for (const [taskId] of this.jobs) {
      this.stopJob(taskId);
    }
  }

  /**
   * Start a cron job for a task
   */
  private startJob(taskId: string, definition: TaskDefinition): void {
    // Stop existing job if running
    this.stopJob(taskId);

    // Create and start new cron job
    const cronTask = cron.schedule(definition.schedule, async () => {
      await this.runTask(taskId, definition.name, definition.handler);
    });

    this.jobs.set(taskId, { task: cronTask, definition });
  }

  /**
   * Stop a cron job
   */
  private stopJob(taskId: string): void {
    const job = this.jobs.get(taskId);
    if (job) {
      job.task.stop();
      this.jobs.delete(taskId);
    }
  }

  /**
   * Run a task and record execution history
   */
  private async runTask(
    taskId: string,
    taskName: string,
    handler: TaskDefinition['handler']
  ): Promise<TaskResult> {
    const startTime = Date.now();
    const executionTime = new Date();
    const historyId = generateId();

    const context: TaskContext = {
      taskId,
      taskName,
      executionTime,
    };

    let result: TaskResult;
    let error: string | null = null;

    try {
      result = await handler(context);
    } catch (err) {
      result = {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      };
      error = err instanceof Error ? err.stack || err.message : String(err);
    }

    const duration = Date.now() - startTime;
    const timestamp = now();

    // Record in task history
    const historyStmt = this.db.db.prepare(`
      INSERT INTO task_history (id, task_id, executed_at, success, error, duration, result)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    historyStmt.run(
      historyId,
      taskId,
      timestamp,
      result.success ? 1 : 0,
      error,
      duration,
      stringifyMetadata(result.data || null)
    );

    // Update task's last_run timestamp
    const updateStmt = this.db.db.prepare(
      'UPDATE scheduled_tasks SET last_run = ?, updated_at = ? WHERE id = ?'
    );
    updateStmt.run(timestamp, timestamp, taskId);

    return result;
  }
}
