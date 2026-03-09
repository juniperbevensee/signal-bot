import { useEffect, useState } from 'react';
import { getTasks, updateTask, executeTask, getTaskHistory, validateCronSchedule } from '../lib/api';
import type { ScheduledTask, TaskHistory } from '../lib/types';

function Scheduler() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<ScheduledTask | null>(null);
  const [history, setHistory] = useState<TaskHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<string>('');
  const [scheduleValid, setScheduleValid] = useState<boolean | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    loadTasks();
  }, []);

  useEffect(() => {
    if (selectedTask) {
      loadTaskHistory(selectedTask.id);
    }
  }, [selectedTask]);

  const loadTasks = async () => {
    try {
      const data = await getTasks();
      setTasks(data.tasks);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const loadTaskHistory = async (taskId: string) => {
    try {
      const data = await getTaskHistory(taskId, 10);
      setHistory(data.history);
    } catch (err) {
      console.error('Failed to load task history:', err);
    }
  };

  const handleToggleEnabled = async (task: ScheduledTask) => {
    try {
      await updateTask(task.id, { enabled: !task.enabled });
      await loadTasks();
      if (selectedTask?.id === task.id) {
        setSelectedTask((prev) => prev ? { ...prev, enabled: !prev.enabled } : null);
      }
    } catch (err) {
      alert(`Failed to update task: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleExecuteTask = async (taskId: string) => {
    if (!confirm('Execute this task now?')) return;

    try {
      const result = await executeTask(taskId);
      alert(`Task executed: ${result.message}`);
      await loadTasks();
      if (selectedTask?.id === taskId) {
        await loadTaskHistory(taskId);
      }
    } catch (err) {
      alert(`Failed to execute task: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleValidateSchedule = async (schedule: string) => {
    if (!schedule.trim()) {
      setScheduleValid(null);
      return;
    }

    try {
      const result = await validateCronSchedule(schedule);
      setScheduleValid(result.valid);
    } catch (err) {
      setScheduleValid(false);
    }
  };

  const handleSaveSchedule = async () => {
    if (!selectedTask || !editingSchedule.trim()) return;

    try {
      await updateTask(selectedTask.id, { schedule: editingSchedule });
      await loadTasks();
      setSelectedTask((prev) => prev ? { ...prev, schedule: editingSchedule } : null);
      setIsEditing(false);
      setEditingSchedule('');
      setScheduleValid(null);
    } catch (err) {
      alert(`Failed to update schedule: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="h-full flex gap-6">
      {/* Tasks List */}
      <div className="w-2/5 card">
        <h3 className="text-lg font-semibold mb-4">Scheduled Tasks</h3>
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                selectedTask?.id === task.id
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => setSelectedTask(task)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{task.name}</h4>
                  <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                  <p className="text-xs text-gray-500 mt-2 font-mono">{task.schedule}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleEnabled(task);
                    }}
                    className={`badge ${task.enabled ? 'badge-success' : 'badge-error'}`}
                  >
                    {task.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {tasks.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">No scheduled tasks</p>
          )}
        </div>
      </div>

      {/* Task Details */}
      <div className="flex-1 space-y-6">
        {selectedTask ? (
          <>
            <div className="card">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold">{selectedTask.name}</h3>
                  <p className="text-gray-600 mt-1">{selectedTask.description}</p>
                </div>
                <button
                  onClick={() => handleExecuteTask(selectedTask.id)}
                  className="btn btn-primary"
                >
                  Execute Now
                </button>
              </div>

              <div className="space-y-3 border-t border-gray-200 pt-4">
                <div className="flex justify-between">
                  <span className="text-gray-600">Status</span>
                  <span className={`badge ${selectedTask.enabled ? 'badge-success' : 'badge-error'}`}>
                    {selectedTask.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">Schedule</span>
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <input
                          type="text"
                          value={editingSchedule}
                          onChange={(e) => {
                            setEditingSchedule(e.target.value);
                            handleValidateSchedule(e.target.value);
                          }}
                          className={`input font-mono text-sm w-40 ${
                            scheduleValid === false ? 'border-red-500' : ''
                          }`}
                          placeholder="* * * * *"
                        />
                        <button onClick={handleSaveSchedule} className="btn btn-primary text-sm">
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setIsEditing(false);
                            setEditingSchedule('');
                            setScheduleValid(null);
                          }}
                          className="btn btn-secondary text-sm"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="font-mono text-sm">{selectedTask.schedule}</span>
                        <button
                          onClick={() => {
                            setIsEditing(true);
                            setEditingSchedule(selectedTask.schedule);
                          }}
                          className="text-primary-600 hover:text-primary-700 text-sm"
                        >
                          Edit
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">Last Run</span>
                  <span className="text-sm">{formatDate(selectedTask.lastRun)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">Next Run</span>
                  <span className="text-sm">{formatDate(selectedTask.nextRun)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">Created</span>
                  <span className="text-sm">{formatDate(selectedTask.createdAt)}</span>
                </div>
              </div>
            </div>

            {/* Execution History */}
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">Execution History</h3>
              <div className="space-y-2">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`badge ${entry.success ? 'badge-success' : 'badge-error'}`}>
                          {entry.success ? 'Success' : 'Failed'}
                        </span>
                        <span className="text-sm text-gray-600">
                          {formatDate(entry.executedAt)}
                        </span>
                      </div>
                      <span className="text-sm text-gray-600">
                        {formatDuration(entry.duration)}
                      </span>
                    </div>
                    {entry.error && (
                      <p className="text-sm text-red-600 mt-2 font-mono">{entry.error}</p>
                    )}
                    {entry.result && (
                      <p className="text-sm text-gray-600 mt-2">{entry.result}</p>
                    )}
                  </div>
                ))}
                {history.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">No execution history</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="card text-center py-12">
            <p className="text-gray-500">Select a task to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Scheduler;
