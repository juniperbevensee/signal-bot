import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboardStats, getPerformanceStats } from '../lib/api';
import type { DashboardStats } from '../lib/types';

function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [performance, setPerformance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
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
        <div className="flex items-center gap-3 text-sand-500">
          <div className="w-5 h-5 border-2 border-sand-300 border-t-primary-500 rounded-full animate-spin" />
          <span>Loading dashboard...</span>
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

  if (!stats) return null;

  const statCards = [
    {
      label: 'Messages Received',
      value: stats.messagesReceived,
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
      ),
      color: 'bg-primary-100 text-primary-600',
    },
    {
      label: 'Messages Sent',
      value: stats.messagesSent,
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
        </svg>
      ),
      color: 'bg-sky-100 text-sky-600',
    },
    {
      label: 'Active Chats',
      value: stats.activeChats,
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
        </svg>
      ),
      color: 'bg-amber-100 text-amber-600',
    },
    {
      label: 'Tool Calls Today',
      value: stats.toolCallsToday,
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
        </svg>
      ),
      color: 'bg-bark-100 text-bark-600',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className={`stat-icon ${stat.color}`}>
              {stat.icon}
            </div>
            <div>
              <p className="stat-value">{stat.value}</p>
              <p className="stat-label">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* System Status & Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="section-title mb-4">System Status</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-sand-100">
              <span className="text-sand-600">Uptime</span>
              <span className="font-medium text-sand-900">{formatUptime(stats.uptime)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-sand-100">
              <span className="text-sand-600">Last Activity</span>
              <span className="font-medium text-sand-900">
                {stats.lastActivity
                  ? new Date(stats.lastActivity).toLocaleString()
                  : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-sand-100">
              <span className="text-sand-600">Errors Today</span>
              <span className={`badge ${stats.errorsToday > 0 ? 'badge-error' : 'badge-success'}`}>
                {stats.errorsToday}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sand-600">Scheduled Tasks</span>
              <span className="font-medium text-sand-900">
                {stats.scheduledTasks.enabled} / {stats.scheduledTasks.total} enabled
              </span>
            </div>
          </div>
        </div>

        {performance && (
          <div className="card">
            <h3 className="section-title mb-4">Performance</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-sand-100">
                <span className="text-sand-600">Database Size</span>
                <span className="font-medium text-sand-900">{performance.database.sizeMB} MB</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-sand-100">
                <span className="text-sand-600">Avg Response Time</span>
                <span className="font-medium text-sand-900">
                  {performance.averageResponseTime
                    ? `${performance.averageResponseTime}ms`
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-sand-100">
                <span className="text-sand-600">Memory (Heap)</span>
                <span className="font-medium text-sand-900">
                  {performance.memory.heapUsedMB} / {performance.memory.heapTotalMB} MB
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sand-600">Memory (RSS)</span>
                <span className="font-medium text-sand-900">{performance.memory.rssMB} MB</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h3 className="section-title mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <Link to="/chat" className="btn btn-primary">
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
            Start Chat
          </Link>
          <Link to="/scheduler" className="btn btn-secondary">
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Manage Tasks
          </Link>
          <Link to="/logs" className="btn btn-secondary">
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            View Logs
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
