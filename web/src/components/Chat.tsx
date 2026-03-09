import { useState, useRef, useEffect } from 'react';
import { streamMessage, getChatSessions, deleteChatSession } from '../lib/api';
import type { ChatMessage, StreamEvent } from '../lib/types';

function Chat() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [toolCalls, setToolCalls] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadSessions = async () => {
    try {
      const data = await getChatSessions();
      setSessions(data.sessions);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isStreaming) return;

    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: inputValue,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsStreaming(true);
    setStreamingText('');
    setToolCalls([]);

    cleanupRef.current = streamMessage(
      userMessage.content,
      currentSessionId,
      (event: StreamEvent) => {
        if (event.type === 'session' && event.sessionId) {
          setCurrentSessionId(event.sessionId);
        } else if (event.type === 'text' && event.text) {
          setStreamingText((prev) => prev + event.text);
        } else if (event.type === 'tool_call' && event.tool) {
          setToolCalls((prev) => [...prev, `Calling tool: ${event.tool}`]);
        } else if (event.type === 'final' && event.text) {
          setStreamingText(event.text);
        } else if (event.type === 'complete' && event.messageId) {
          const assistantMessage: ChatMessage = {
            id: event.messageId,
            role: 'assistant',
            content: streamingText,
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          setStreamingText('');
          setToolCalls([]);
          setIsStreaming(false);
          loadSessions();
        } else if (event.type === 'error') {
          console.error('Stream error:', event.error);
          setIsStreaming(false);
          setStreamingText('');
          setToolCalls([]);
        }
      },
      (error) => {
        console.error('Stream error:', error);
        setIsStreaming(false);
        setStreamingText('');
        setToolCalls([]);
      },
      () => {
        // Completion handled in 'complete' event
      }
    );
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setCurrentSessionId(undefined);
    setMessages([]);
    setStreamingText('');
    setToolCalls([]);
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this chat session?')) return;

    try {
      await deleteChatSession(sessionId);
      if (currentSessionId === sessionId) {
        handleNewChat();
      }
      loadSessions();
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);

  return (
    <div className="h-full flex gap-6">
      {/* Sessions Sidebar */}
      <div className="w-64 card flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="section-title">Sessions</h3>
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New
          </button>
        </div>
        <div className="flex-1 overflow-auto space-y-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`p-3 rounded-xl cursor-pointer flex items-center justify-between group transition-all duration-200 ${
                currentSessionId === session.id
                  ? 'bg-primary-50 border border-primary-200'
                  : 'hover:bg-sand-50 border border-transparent'
              }`}
              onClick={() => setCurrentSessionId(session.id)}
            >
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${
                  currentSessionId === session.id ? 'text-primary-700' : 'text-sand-800'
                }`}>
                  Session {session.id.slice(0, 8)}
                </p>
                <p className="text-xs text-sand-500">{session.messageCount} messages</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteSession(session.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-sand-400 hover:text-red-500 ml-2 transition-all duration-200"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="empty-state py-8">
              <svg className="w-8 h-8 text-sand-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
              <p className="text-sm text-sand-500">No sessions yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 card flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-auto mb-4 space-y-4">
          {messages.length === 0 && !isStreaming && (
            <div className="empty-state h-full">
              <svg className="w-12 h-12 text-sand-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
              <p className="text-sand-500">Start a conversation</p>
              <p className="text-sm text-sand-400 mt-1">Send a message to begin chatting</p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-primary-600 text-white'
                    : 'bg-sand-100 text-sand-900'
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                <p
                  className={`text-xs mt-2 ${
                    message.role === 'user' ? 'text-primary-200' : 'text-sand-500'
                  }`}
                >
                  {new Date(message.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}

          {/* Streaming Message */}
          {isStreaming && streamingText && (
            <div className="flex justify-start">
              <div className="max-w-[70%] rounded-2xl px-4 py-3 bg-sand-100 text-sand-900">
                <p className="whitespace-pre-wrap">{streamingText}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-sand-500">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" style={{ animationDelay: '0.2s' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" style={{ animationDelay: '0.4s' }} />
                  </div>
                  <span>Typing</span>
                </div>
              </div>
            </div>
          )}

          {/* Tool Calls */}
          {toolCalls.length > 0 && (
            <div className="flex justify-start">
              <div className="max-w-[70%] rounded-2xl px-4 py-3 bg-bark-50 text-bark-800 border border-bark-200">
                {toolCalls.map((call, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 text-bark-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                    </svg>
                    <span>{call}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex gap-3 pt-4 border-t border-sand-100">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            className="flex-1 input resize-none"
            rows={3}
            disabled={isStreaming}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isStreaming}
            className="btn btn-primary self-end"
          >
            {isStreaming ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Sending</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
                <span>Send</span>
              </div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Chat;
