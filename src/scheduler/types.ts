/**
 * Scheduler types and interfaces for cron-based task management
 */

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  schedule: string; // Cron syntax (e.g., "0 */6 * * *")
  enabled: boolean;
  lastRun: string | null; // ISO 8601 timestamp
  nextRun: string | null; // ISO 8601 timestamp
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
  metadata: Record<string, any> | null;
}

export interface TaskHistory {
  id: string;
  taskId: string;
  executedAt: string; // ISO 8601 timestamp
  success: boolean;
  error: string | null;
  duration: number; // Milliseconds
  result: string | null; // JSON string with task-specific results
}

export interface TaskDefinition {
  name: string;
  description: string;
  schedule: string;
  handler: (context: TaskContext) => Promise<TaskResult>;
  enabled?: boolean;
  metadata?: Record<string, any>;
}

export interface TaskContext {
  taskId: string;
  taskName: string;
  executionTime: Date;
}

export interface TaskResult {
  success: boolean;
  message?: string;
  data?: any;
}

export interface TaskExecutionOptions {
  timeout?: number; // Milliseconds
  retryOnFailure?: boolean;
  retryCount?: number;
  retryDelay?: number; // Milliseconds
}
