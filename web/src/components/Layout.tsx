import { Link, Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { healthCheck } from '../lib/api';

function Layout() {
  const location = useLocation();
  const [isHealthy, setIsHealthy] = useState(true);

  useEffect(() => {
    // Check health status periodically
    const checkHealth = async () => {
      try {
        await healthCheck();
        setIsHealthy(true);
      } catch (error) {
        setIsHealthy(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/chat', label: 'Chat', icon: '💬' },
    { path: '/scheduler', label: 'Scheduler', icon: '⏰' },
    { path: '/logs', label: 'Logs', icon: '📝' },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-6 border-b border-gray-700">
          <h1 className="text-2xl font-bold">Signal Bot</h1>
          <div className="mt-2 flex items-center text-sm">
            <div className={`w-2 h-2 rounded-full mr-2 ${isHealthy ? 'bg-green-400' : 'bg-red-400'}`}></div>
            <span className="text-gray-400">{isHealthy ? 'Online' : 'Offline'}</span>
          </div>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-primary-600 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    <span className="text-xl mr-3">{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-700 text-sm text-gray-400">
          <p>Signal Bot v1.0.0</p>
          <p className="mt-1">Web UI</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-8 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-gray-800">
              {navItems.find((item) => item.path === location.pathname)?.label || 'Dashboard'}
            </h2>
            <div className="text-sm text-gray-500">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default Layout;
