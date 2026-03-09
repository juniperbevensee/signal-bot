import { useEffect, useState } from 'react';
import { getMessages, getActivityLogs, searchMessages, getChats } from '../lib/api';
import type { Message, ActivityLog, Chat } from '../lib/types';

type Tab = 'messages' | 'activity' | 'search';

function Logs() {
  const [activeTab, setActiveTab] = useState<Tab>('messages');
  const [messages, setMessages] = useState<Message[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const LIMIT = 20;

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    if (activeTab === 'messages') {
      loadMessages();
    } else if (activeTab === 'activity') {
      loadActivityLogs();
    }
  }, [activeTab, selectedChat, page]);

  const loadChats = async () => {
    try {
      const data = await getChats();
      setChats(data.chats);
    } catch (err) {
      console.error('Failed to load chats:', err);
    }
  };

  const loadMessages = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMessages({
        limit: LIMIT,
        offset: page * LIMIT,
        chatId: selectedChat || undefined,
      });
      setMessages(data.messages);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const loadActivityLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getActivityLogs({
        limit: LIMIT,
        offset: page * LIMIT,
        chatId: selectedChat || undefined,
      });
      setActivityLogs(data.logs);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity logs');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const data = await searchMessages(searchQuery, selectedChat || undefined, 50);
      setSearchResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString();
  };

  const parseLogContent = (content: string): any => {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  };

  const renderMessages = (messageList: Message[]) => (
    <div className="space-y-3">
      {messageList.map((msg) => (
        <div key={msg.id} className="p-4 rounded-xl border border-sand-200 hover:bg-sand-50 transition-colors">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sand-900">{msg.sender}</span>
              {msg.chat_name && (
                <span className="text-sm text-sand-500">in {msg.chat_name}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`badge ${msg.direction === 'incoming' ? 'badge-info' : 'badge-success'}`}>
                {msg.direction}
              </span>
              <span className="text-xs text-sand-500">{formatTimestamp(msg.timestamp)}</span>
            </div>
          </div>
          <p className="text-sand-700 whitespace-pre-wrap">{msg.content || '(no content)'}</p>
        </div>
      ))}
      {messageList.length === 0 && !loading && (
        <div className="empty-state py-12">
          <svg className="w-10 h-10 text-sand-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
          <p className="text-sand-500">No messages found</p>
        </div>
      )}
    </div>
  );

  const renderActivityLogs = () => (
    <div className="space-y-3">
      {activityLogs.map((log) => {
        const content = parseLogContent(log.content);
        return (
          <div key={log.id} className="p-4 rounded-xl border border-sand-200 hover:bg-sand-50 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`badge ${
                  log.log_type === 'error' ? 'badge-error' :
                  log.log_type === 'tool_call' ? 'badge-info' :
                  log.log_type === 'tool_result' ? 'badge-success' :
                  'badge-warning'
                }`}>
                  {log.log_type}
                </span>
                {log.chat_name && (
                  <span className="text-sm text-sand-500">{log.chat_name}</span>
                )}
              </div>
              <span className="text-xs text-sand-500">{formatTimestamp(log.created_at)}</span>
            </div>
            <div className="text-sm text-sand-700 font-mono bg-sand-100 p-3 rounded-lg mt-2 overflow-x-auto">
              {typeof content === 'object' ? JSON.stringify(content, null, 2) : content}
            </div>
            <div className="flex items-center gap-4 text-xs text-sand-500 mt-3">
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                </svg>
                Trace: {log.trace_id.slice(0, 8)}...
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5" />
                </svg>
                Step: {log.step_number}
              </span>
            </div>
          </div>
        );
      })}
      {activityLogs.length === 0 && !loading && (
        <div className="empty-state py-12">
          <svg className="w-10 h-10 text-sand-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <p className="text-sand-500">No activity logs found</p>
        </div>
      )}
    </div>
  );

  const tabs = [
    { id: 'messages' as Tab, label: 'Messages', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    )},
    { id: 'activity' as Tab, label: 'Activity', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    )},
    { id: 'search' as Tab, label: 'Search', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    )},
  ];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="card">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-sand-700 mb-2">Filter by Chat</label>
            <select
              value={selectedChat}
              onChange={(e) => {
                setSelectedChat(e.target.value);
                setPage(0);
              }}
              className="input w-full"
            >
              <option value="">All Chats</option>
              {chats.map((chat) => (
                <option key={chat.id} value={chat.id}>
                  {chat.display_name || chat.signal_chat_id}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card">
        <div className="border-b border-sand-200 mb-6">
          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setPage(0);
                }}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-sand-500 hover:text-sand-700 hover:border-sand-300'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Search Tab */}
        {activeTab === 'search' && (
          <div className="mb-6">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-sand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search messages..."
                  className="input pl-10"
                />
              </div>
              <button onClick={handleSearch} className="btn btn-primary" disabled={loading}>
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Searching</span>
                  </div>
                ) : (
                  'Search'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-4 flex items-center gap-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            Error: {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-sand-500">
              <div className="w-5 h-5 border-2 border-sand-300 border-t-primary-500 rounded-full animate-spin" />
              <span>Loading...</span>
            </div>
          </div>
        )}

        {!loading && activeTab === 'messages' && renderMessages(messages)}
        {!loading && activeTab === 'activity' && renderActivityLogs()}
        {!loading && activeTab === 'search' && renderMessages(searchResults)}

        {/* Pagination */}
        {activeTab !== 'search' && (
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-sand-200">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn btn-secondary"
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Previous
            </button>
            <span className="text-sm text-sand-600 font-medium">Page {page + 1}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore}
              className="btn btn-secondary"
            >
              Next
              <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Logs;
