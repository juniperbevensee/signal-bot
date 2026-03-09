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
        <div key={msg.id} className="p-4 rounded-lg border border-gray-200 hover:bg-gray-50">
          <div className="flex items-start justify-between mb-2">
            <div>
              <span className="font-medium text-gray-900">{msg.sender}</span>
              {msg.chat_name && (
                <span className="text-sm text-gray-500 ml-2">in {msg.chat_name}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`badge ${msg.direction === 'incoming' ? 'badge-info' : 'badge-success'}`}>
                {msg.direction}
              </span>
              <span className="text-xs text-gray-500">{formatTimestamp(msg.timestamp)}</span>
            </div>
          </div>
          <p className="text-gray-700 whitespace-pre-wrap">{msg.content || '(no content)'}</p>
        </div>
      ))}
      {messageList.length === 0 && !loading && (
        <p className="text-center text-gray-500 py-8">No messages found</p>
      )}
    </div>
  );

  const renderActivityLogs = () => (
    <div className="space-y-3">
      {activityLogs.map((log) => {
        const content = parseLogContent(log.content);
        return (
          <div key={log.id} className="p-4 rounded-lg border border-gray-200 hover:bg-gray-50">
            <div className="flex items-start justify-between mb-2">
              <div>
                <span className={`badge ${
                  log.log_type === 'error' ? 'badge-error' :
                  log.log_type === 'tool_call' ? 'badge-info' :
                  log.log_type === 'tool_result' ? 'badge-success' :
                  'badge-warning'
                }`}>
                  {log.log_type}
                </span>
                {log.chat_name && (
                  <span className="text-sm text-gray-500 ml-2">{log.chat_name}</span>
                )}
              </div>
              <span className="text-xs text-gray-500">{formatTimestamp(log.created_at)}</span>
            </div>
            <div className="text-sm text-gray-700 font-mono bg-gray-50 p-2 rounded mt-2 overflow-x-auto">
              {typeof content === 'object' ? JSON.stringify(content, null, 2) : content}
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Trace: {log.trace_id.slice(0, 8)}... | Step: {log.step_number}
            </div>
          </div>
        );
      })}
      {activityLogs.length === 0 && !loading && (
        <p className="text-center text-gray-500 py-8">No activity logs found</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="card">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Chat</label>
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
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-4">
            {(['messages', 'activity', 'search'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setPage(0);
                }}
                className={`px-4 py-2 border-b-2 font-medium transition-colors ${
                  activeTab === tab
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>

        {/* Search Tab */}
        {activeTab === 'search' && (
          <div className="mb-6">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search messages..."
                className="flex-1 input"
              />
              <button onClick={handleSearch} className="btn btn-primary" disabled={loading}>
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
            Error: {error}
          </div>
        )}

        {loading && (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        )}

        {!loading && activeTab === 'messages' && renderMessages(messages)}
        {!loading && activeTab === 'activity' && renderActivityLogs()}
        {!loading && activeTab === 'search' && renderMessages(searchResults)}

        {/* Pagination */}
        {activeTab !== 'search' && (
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn btn-secondary"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">Page {page + 1}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore}
              className="btn btn-secondary"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Logs;
