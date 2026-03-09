/**
 * Tests for Scheduler API Routes
 * RED-GREEN-TDD: Tests written first, then implementation verified
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSchedulerRouter } from './scheduler';
import { SQLiteClient } from '../../database/client';
import { TaskScheduler } from '../../scheduler/task-scheduler';
import type { TaskDefinition } from '../../scheduler/types';
import { unlinkSync } from 'fs';

describe('Scheduler API Routes', () => {
  let app: express.Application;
  let db: SQLiteClient;
  let scheduler: TaskScheduler;
  const testDbPath = './test-routes.db';

  beforeEach(async () => {
    // Setup
    db = new SQLiteClient(testDbPath);
    scheduler = new TaskScheduler(db);

    // Register a test task
    const testTask: TaskDefinition = {
      name: 'test_task',
      description: 'A test task',
      schedule: '0 0 * * *',
      handler: async () => ({ success: true, message: 'Test executed' }),
      enabled: false,
    };
    await scheduler.register(testTask);

    // Create Express app with scheduler routes
    app = express();
    app.use(express.json());
    app.use('/api/scheduler', createSchedulerRouter({
      db,
      scheduler,
      agent: null as any,
      config: {},
    }));
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

  describe('GET /api/scheduler/tasks', () => {
    it('should return all tasks', async () => {
      const response = await request(app)
        .get('/api/scheduler/tasks')
        .expect(200);

      expect(response.body).toHaveProperty('tasks');
      expect(Array.isArray(response.body.tasks)).toBe(true);
      expect(response.body.tasks.length).toBeGreaterThan(0);
    });

    it('should include task properties', async () => {
      const response = await request(app)
        .get('/api/scheduler/tasks')
        .expect(200);

      const task = response.body.tasks[0];
      expect(task).toHaveProperty('id');
      expect(task).toHaveProperty('name');
      expect(task).toHaveProperty('description');
      expect(task).toHaveProperty('schedule');
      expect(task).toHaveProperty('enabled');
    });
  });

  describe('GET /api/scheduler/tasks/:id', () => {
    it('should return a specific task', async () => {
      const tasks = scheduler.getAllTasks();
      const taskId = tasks[0].id;

      const response = await request(app)
        .get(`/api/scheduler/tasks/${taskId}`)
        .expect(200);

      expect(response.body).toHaveProperty('task');
      expect(response.body.task.id).toBe(taskId);
    });

    it('should return 404 for non-existent task', async () => {
      const response = await request(app)
        .get('/api/scheduler/tasks/non-existent-id')
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PATCH /api/scheduler/tasks/:id', () => {
    it('should update task enabled status', async () => {
      const tasks = scheduler.getAllTasks();
      const taskId = tasks[0].id;

      const response = await request(app)
        .patch(`/api/scheduler/tasks/${taskId}`)
        .send({ enabled: true })
        .expect(200);

      expect(response.body.task.enabled).toBe(true);
    });

    it('should update task schedule', async () => {
      const tasks = scheduler.getAllTasks();
      const taskId = tasks[0].id;

      const response = await request(app)
        .patch(`/api/scheduler/tasks/${taskId}`)
        .send({ schedule: '0 */6 * * *' })
        .expect(200);

      expect(response.body.task.schedule).toBe('0 */6 * * *');
    });

    it('should reject invalid cron schedule', async () => {
      const tasks = scheduler.getAllTasks();
      const taskId = tasks[0].id;

      const response = await request(app)
        .patch(`/api/scheduler/tasks/${taskId}`)
        .send({ schedule: 'invalid' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/scheduler/tasks/:id/execute', () => {
    it('should execute a task manually', async () => {
      const tasks = scheduler.getAllTasks();
      const taskId = tasks[0].id;

      const response = await request(app)
        .post(`/api/scheduler/tasks/${taskId}/execute`)
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body.success).toBe(true);
    });

    it('should return 404 for non-existent task', async () => {
      await request(app)
        .post('/api/scheduler/tasks/non-existent-id/execute')
        .expect(404);
    });
  });

  describe('GET /api/scheduler/history/:taskId', () => {
    it('should return task execution history', async () => {
      const tasks = scheduler.getAllTasks();
      const taskId = tasks[0].id;

      // Execute task to create history
      await scheduler.executeTask(taskId);

      const response = await request(app)
        .get(`/api/scheduler/history/${taskId}`)
        .expect(200);

      expect(response.body).toHaveProperty('history');
      expect(Array.isArray(response.body.history)).toBe(true);
      expect(response.body.history.length).toBeGreaterThan(0);
    });

    it('should respect limit parameter', async () => {
      const tasks = scheduler.getAllTasks();
      const taskId = tasks[0].id;

      const response = await request(app)
        .get(`/api/scheduler/history/${taskId}?limit=5`)
        .expect(200);

      expect(response.body.history.length).toBeLessThanOrEqual(5);
    });
  });

  describe('POST /api/scheduler/validate', () => {
    it('should validate correct cron syntax', async () => {
      const response = await request(app)
        .post('/api/scheduler/validate')
        .send({ schedule: '0 0 * * *' })
        .expect(200);

      expect(response.body.valid).toBe(true);
    });

    it('should reject invalid cron syntax', async () => {
      const response = await request(app)
        .post('/api/scheduler/validate')
        .send({ schedule: 'invalid cron' })
        .expect(200);

      expect(response.body.valid).toBe(false);
    });

    it('should return 400 if schedule is missing', async () => {
      await request(app)
        .post('/api/scheduler/validate')
        .send({})
        .expect(400);
    });
  });
});
