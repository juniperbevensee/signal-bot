import { useEffect, useState } from 'react';
import { getDashboardStats, getPerformanceStats } from '../lib/api';
import type { DashboardStats } from '../lib/types';

function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [performance, setPerformance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [statsData, perfData] = await Promise.all([
        getDashboardStats(),
        getPerformanceStats(),
      ]);
      setStats(statsData);
      setPerformance(perfData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
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

  if (!stats) return null;

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Messages Received</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.messagesReceived}</p>
            </div>
            <div className="text-4xl">📨</div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Messages Sent</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.messagesSent}</p>
            </div>
            <div className="text-4xl">📤</div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Chats</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.activeChats}</p>
            </div>
            <div className="text-4xl">💬</div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Tool Calls Today</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.toolCallsToday}</p>
            </div>
            <div className="text-4xl">🔧</div>
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">System Status</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Uptime</span>
              <span className="font-medium">{formatUptime(stats.uptime)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Last Activity</span>
              <span className="font-medium">
                {stats.lastActivity
                  ? new Date(stats.lastActivity).toLocaleString()
                  : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Errors Today</span>
              <span className={`font-medium ${stats.errorsToday > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {stats.errorsToday}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Scheduled Tasks</span>
              <span className="font-medium">
                {stats.scheduledTasks.enabled} / {stats.scheduledTasks.total} enabled
              </span>
            </div>
          </div>
        </div>

        {performance && (
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Performance</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Database Size</span>
                <span className="font-medium">{performance.database.sizeMB} MB</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Avg Response Time</span>
                <span className="font-medium">
                  {performance.averageResponseTime
                    ? `${performance.averageResponseTime}ms`
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Memory (Heap)</span>
                <span className="font-medium">
                  {performance.memory.heapUsedMB} / {performance.memory.heapTotalMB} MB
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Memory (RSS)</span>
                <span className="font-medium">{performance.memory.rssMB} MB</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <a href="/chat" className="btn btn-primary">
            Start Chat
          </a>
          <a href="/scheduler" className="btn btn-secondary">
            Manage Tasks
          </a>
          <a href="/logs" className="btn btn-secondary">
            View Logs
          </a>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
