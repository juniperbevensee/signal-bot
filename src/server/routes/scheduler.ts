/**
 * Scheduler API routes for task management
 */

import { Router, type Request, type Response } from 'express';
import type { ServerDependencies } from '../app';
import cron from 'node-cron';

export function createSchedulerRouter(deps: ServerDependencies): Router {
  const router = Router();

  /**
   * GET /api/scheduler/tasks
   * List all scheduled tasks
   */
  router.get('/tasks', (req: Request, res: Response) => {
    try {
      const tasks = deps.scheduler.getAllTasks();
      res.json({ tasks });
    } catch (error) {
      console.error('Failed to get tasks:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get tasks',
      });
    }
  });

  /**
   * GET /api/scheduler/tasks/:id
   * Get a specific task
   */
  router.get('/tasks/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const task = deps.scheduler.getTask(id);

      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      res.json({ task });
    } catch (error) {
      console.error('Failed to get task:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get task',
      });
    }
  });

  /**
   * PATCH /api/scheduler/tasks/:id
   * Update a task (enable/disable, change schedule)
   */
  router.patch('/tasks/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { enabled, schedule, description } = req.body;

      // Validate task exists
      const task = deps.scheduler.getTask(id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Validate schedule if provided
      if (schedule && !cron.validate(schedule)) {
        return res.status(400).json({ error: 'Invalid cron syntax' });
      }

      // Update task
      const updates: any = {};
      if (enabled !== undefined) updates.enabled = enabled;
      if (schedule !== undefined) updates.schedule = schedule;
      if (description !== undefined) updates.description = description;

      deps.scheduler.updateTask(id, updates);

      // Return updated task
      const updatedTask = deps.scheduler.getTask(id);
      res.json({ task: updatedTask });
    } catch (error) {
      console.error('Failed to update task:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to update task',
      });
    }
  });

  /**
   * POST /api/scheduler/tasks/:id/execute
   * Execute a task manually (outside of schedule)
   */
  router.post('/tasks/:id/execute', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const task = deps.scheduler.getTask(id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Execute task
      const result = await deps.scheduler.executeTask(id);

      res.json({
        success: result.success,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      console.error('Failed to execute task:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to execute task',
      });
    }
  });

  /**
   * GET /api/scheduler/history/:taskId
   * Get execution history for a task
   */
  router.get('/history/:taskId', (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      const history = deps.scheduler.getHistory(taskId, limit);

      res.json({ history });
    } catch (error) {
      console.error('Failed to get task history:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get task history',
      });
    }
  });

  /**
   * POST /api/scheduler/validate
   * Validate cron syntax without creating a task
   */
  router.post('/validate', (req: Request, res: Response) => {
    try {
      const { schedule } = req.body;

      if (!schedule || typeof schedule !== 'string') {
        return res.status(400).json({ error: 'Schedule is required' });
      }

      const valid = cron.validate(schedule);

      res.json({
        valid,
        message: valid ? 'Valid cron syntax' : 'Invalid cron syntax',
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to validate schedule',
      });
    }
  });

  return router;
}
