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
        <div className="flex items-center gap-3 text-sand-500">
          <div className="w-5 h-5 border-2 border-sand-300 border-t-primary-500 rounded-full animate-spin" />
          <span>Loading tasks...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card bg-red-50 border-red-100">
        <div className="flex items-center gap-3 text-red-700">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span>Error: {error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex gap-6">
      {/* Tasks List */}
      <div className="w-2/5 card">
        <h3 className="section-title mb-4">Scheduled Tasks</h3>
        <div className="space-y-3">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                selectedTask?.id === task.id
                  ? 'border-primary-300 bg-primary-50'
                  : 'border-sand-200 hover:border-sand-300 hover:bg-sand-50'
              }`}
              onClick={() => setSelectedTask(task)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className={`font-medium ${
                    selectedTask?.id === task.id ? 'text-primary-900' : 'text-sand-900'
                  }`}>
                    {task.name}
                  </h4>
                  <p className="text-sm text-sand-600 mt-1">{task.description}</p>
                  <p className="text-xs text-sand-500 mt-2 font-mono bg-sand-100 px-2 py-1 rounded inline-block">
                    {task.schedule}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleEnabled(task);
                    }}
                    className={`badge transition-colors ${task.enabled ? 'badge-success' : 'badge-error'}`}
                  >
                    {task.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {tasks.length === 0 && (
            <div className="empty-state py-12">
              <svg className="w-10 h-10 text-sand-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sand-500">No scheduled tasks</p>
            </div>
          )}
        </div>
      </div>

      {/* Task Details */}
      <div className="flex-1 space-y-6">
        {selectedTask ? (
          <>
            <div className="card">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-xl font-semibold text-sand-900">{selectedTask.name}</h3>
                  <p className="text-sand-600 mt-1">{selectedTask.description}</p>
                </div>
                <button
                  onClick={() => handleExecuteTask(selectedTask.id)}
                  className="btn btn-primary"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                  Execute Now
                </button>
              </div>

              <div className="space-y-4 border-t border-sand-100 pt-6">
                <div className="flex justify-between items-center py-2 border-b border-sand-100">
                  <span className="text-sand-600">Status</span>
                  <span className={`badge ${selectedTask.enabled ? 'badge-success' : 'badge-error'}`}>
                    {selectedTask.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-2 border-b border-sand-100">
                  <span className="text-sand-600">Schedule</span>
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
                            scheduleValid === false ? 'input-error' : ''
                          }`}
                          placeholder="* * * * *"
                        />
                        <button onClick={handleSaveSchedule} className="btn btn-primary btn-sm">
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setIsEditing(false);
                            setEditingSchedule('');
                            setScheduleValid(null);
                          }}
                          className="btn btn-secondary btn-sm"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="font-mono text-sm bg-sand-100 px-2 py-1 rounded">{selectedTask.schedule}</span>
                        <button
                          onClick={() => {
                            setIsEditing(true);
                            setEditingSchedule(selectedTask.schedule);
                          }}
                          className="text-primary-600 hover:text-primary-700 text-sm font-medium transition-colors"
                        >
                          Edit
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center py-2 border-b border-sand-100">
                  <span className="text-sand-600">Last Run</span>
                  <span className="text-sm text-sand-900">{formatDate(selectedTask.lastRun)}</span>
                </div>

                <div className="flex justify-between items-center py-2 border-b border-sand-100">
                  <span className="text-sand-600">Next Run</span>
                  <span className="text-sm text-sand-900">{formatDate(selectedTask.nextRun)}</span>
                </div>

                <div className="flex justify-between items-center py-2">
                  <span className="text-sand-600">Created</span>
                  <span className="text-sm text-sand-900">{formatDate(selectedTask.createdAt)}</span>
                </div>
              </div>
            </div>

            {/* Execution History */}
            <div className="card">
              <h3 className="section-title mb-4">Execution History</h3>
              <div className="space-y-3">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-4 rounded-xl border border-sand-200 hover:bg-sand-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`badge ${entry.success ? 'badge-success' : 'badge-error'}`}>
                          {entry.success ? 'Success' : 'Failed'}
                        </span>
                        <span className="text-sm text-sand-600">
                          {formatDate(entry.executedAt)}
                        </span>
                      </div>
                      <span className="text-sm text-sand-500 font-mono">
                        {formatDuration(entry.duration)}
                      </span>
                    </div>
                    {entry.error && (
                      <p className="text-sm text-red-600 mt-3 font-mono bg-red-50 p-2 rounded-lg">{entry.error}</p>
                    )}
                    {entry.result && (
                      <p className="text-sm text-sand-600 mt-3">{entry.result}</p>
                    )}
                  </div>
                ))}
                {history.length === 0 && (
                  <div className="empty-state py-8">
                    <svg className="w-8 h-8 text-sand-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-sand-500">No execution history</p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="card">
            <div className="empty-state py-16">
              <svg className="w-12 h-12 text-sand-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sand-500">Select a task to view details</p>
              <p className="text-sm text-sand-400 mt-1">Choose from the list on the left</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Scheduler;
