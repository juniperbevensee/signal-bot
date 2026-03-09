/**
 * Tests for TaskScheduler
 * RED-GREEN-TDD: Tests written first, then implementation verified
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskScheduler } from './task-scheduler';
import { SQLiteClient } from '../database/client';
import type { TaskDefinition, TaskContext } from './types';
import { unlinkSync } from 'fs';

describe('TaskScheduler', () => {
  let db: SQLiteClient;
  let scheduler: TaskScheduler;
  const testDbPath = './test-scheduler.db';

  beforeEach(() => {
    // Create fresh database for each test
    db = new SQLiteClient(testDbPath);
    scheduler = new TaskScheduler(db);
  });

  afterEach(() => {
    // Cleanup
    scheduler.stopAll();
    db.close();
    try {
      unlinkSync(testDbPath);
      unlinkSync(`${testDbPath}-shm`);
      unlinkSync(`${testDbPath}-wal`);
    } catch (e) {
      // Ignore errors
    }
  });

  describe('Task Registration', () => {
    it('should register a new task', async () => {
      const taskDef: TaskDefinition = {
        name: 'test_task',
        description: 'Test task',
        schedule: '* * * * *',
        handler: async (ctx: TaskContext) => ({ success: true }),
        enabled: false,
      };

      const taskId = await scheduler.register(taskDef);

      expect(taskId).toBeDefined();
      expect(typeof taskId).toBe('string');

      const task = scheduler.getTask(taskId);
      expect(task).toBeDefined();
      expect(task?.name).toBe('test_task');
      expect(task?.description).toBe('Test task');
      expect(task?.schedule).toBe('* * * * *');
      expect(task?.enabled).toBe(false);
    });

    it('should not create duplicate tasks with same name', async () => {
      const taskDef: TaskDefinition = {
        name: 'unique_task',
        description: 'First',
        schedule: '* * * * *',
        handler: async () => ({ success: true }),
      };

      const id1 = await scheduler.register(taskDef);
      const id2 = await scheduler.register(taskDef);

      expect(id1).toBe(id2);

      const tasks = scheduler.getAllTasks();
      const uniqueTasks = tasks.filter(t => t.name === 'unique_task');
      expect(uniqueTasks.length).toBe(1);
    });
  });

  describe('Task Execution', () => {
    it('should execute a task manually', async () => {
      let executed = false;

      const taskDef: TaskDefinition = {
        name: 'manual_exec_task',
        description: 'Test manual execution',
        schedule: '* * * * *',
        handler: async (ctx: TaskContext) => {
          executed = true;
          return { success: true, message: 'Task executed' };
        },
        enabled: false,
      };

      const taskId = await scheduler.register(taskDef);
      const result = await scheduler.executeTask(taskId);

      expect(executed).toBe(true);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Task executed');
    });

    it('should record task execution history', async () => {
      const taskDef: TaskDefinition = {
        name: 'history_task',
        description: 'Test history recording',
        schedule: '* * * * *',
        handler: async () => ({ success: true }),
        enabled: false,
      };

      const taskId = await scheduler.register(taskDef);
      await scheduler.executeTask(taskId);

      const history = scheduler.getHistory(taskId, 10);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].success).toBe(true);
      expect(history[0].taskId).toBe(taskId);
    });

    it('should record failed task executions', async () => {
      const taskDef: TaskDefinition = {
        name: 'failing_task',
        description: 'Test failure recording',
        schedule: '* * * * *',
        handler: async () => {
          throw new Error('Task failed');
        },
        enabled: false,
      };

      const taskId = await scheduler.register(taskDef);
      const result = await scheduler.executeTask(taskId);

      expect(result.success).toBe(false);

      const history = scheduler.getHistory(taskId, 10);
      expect(history[0].success).toBe(false);
      expect(history[0].error).toContain('Task failed');
    });
  });

  describe('Task Management', () => {
    it('should enable and disable tasks', async () => {
      const taskDef: TaskDefinition = {
        name: 'toggle_task',
        description: 'Test enable/disable',
        schedule: '* * * * *',
        handler: async () => ({ success: true }),
        enabled: false,
      };

      const taskId = await scheduler.register(taskDef);

      scheduler.enable(taskId);
      let task = scheduler.getTask(taskId);
      expect(task?.enabled).toBe(true);

      scheduler.disable(taskId);
      task = scheduler.getTask(taskId);
      expect(task?.enabled).toBe(false);
    });

    it('should update task schedule', async () => {
      const taskDef: TaskDefinition = {
        name: 'update_task',
        description: 'Test schedule update',
        schedule: '* * * * *',
        handler: async () => ({ success: true }),
        enabled: false,
      };

      const taskId = await scheduler.register(taskDef);

      scheduler.updateTask(taskId, { schedule: '0 0 * * *' });

      const task = scheduler.getTask(taskId);
      expect(task?.schedule).toBe('0 0 * * *');
    });

    it('should reject invalid cron schedule', async () => {
      const taskDef: TaskDefinition = {
        name: 'invalid_schedule_task',
        description: 'Test invalid schedule',
        schedule: '* * * * *',
        handler: async () => ({ success: true }),
        enabled: false,
      };

      const taskId = await scheduler.register(taskDef);

      expect(() => {
        scheduler.updateTask(taskId, { schedule: 'invalid cron' });
      }).toThrow();
    });

    it('should unregister tasks', async () => {
      const taskDef: TaskDefinition = {
        name: 'unregister_task',
        description: 'Test unregister',
        schedule: '* * * * *',
        handler: async () => ({ success: true }),
        enabled: false,
      };

      const taskId = await scheduler.register(taskDef);
      scheduler.unregister(taskId, true);

      const task = scheduler.getTask(taskId);
      expect(task).toBeNull();
    });
  });

  describe('Task Querying', () => {
    it('should get all tasks', async () => {
      const tasks = [
        {
          name: 'task1',
          description: 'Task 1',
          schedule: '* * * * *',
          handler: async () => ({ success: true }),
        },
        {
          name: 'task2',
          description: 'Task 2',
          schedule: '0 0 * * *',
          handler: async () => ({ success: true }),
        },
      ];

      for (const task of tasks) {
        await scheduler.register(task);
      }

      const allTasks = scheduler.getAllTasks();
      expect(allTasks.length).toBeGreaterThanOrEqual(2);

      const taskNames = allTasks.map(t => t.name);
      expect(taskNames).toContain('task1');
      expect(taskNames).toContain('task2');
    });

    it('should get task by name', async () => {
      const taskDef: TaskDefinition = {
        name: 'named_task',
        description: 'Test get by name',
        schedule: '* * * * *',
        handler: async () => ({ success: true }),
      };

      await scheduler.register(taskDef);

      const task = scheduler.getByName('named_task');
      expect(task).toBeDefined();
      expect(task?.name).toBe('named_task');
    });
  });
});
