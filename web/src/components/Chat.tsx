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
          <h3 className="font-semibold">Sessions</h3>
          <button onClick={handleNewChat} className="text-primary-600 hover:text-primary-700">
            + New
          </button>
        </div>
        <div className="flex-1 overflow-auto space-y-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`p-3 rounded-lg cursor-pointer flex items-center justify-between group ${
                currentSessionId === session.id
                  ? 'bg-primary-100 border-primary-500'
                  : 'hover:bg-gray-100'
              }`}
              onClick={() => setCurrentSessionId(session.id)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">Session {session.id.slice(0, 8)}</p>
                <p className="text-xs text-gray-500">{session.messageCount} messages</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteSession(session.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-700 ml-2"
              >
                ×
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No sessions yet</p>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 card flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-auto mb-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] rounded-lg px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                <p
                  className={`text-xs mt-1 ${
                    message.role === 'user' ? 'text-primary-100' : 'text-gray-500'
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
              <div className="max-w-[70%] rounded-lg px-4 py-3 bg-gray-100 text-gray-900">
                <p className="whitespace-pre-wrap">{streamingText}</p>
                <div className="mt-2 flex items-center text-xs text-gray-500">
                  <div className="animate-pulse">Typing...</div>
                </div>
              </div>
            </div>
          )}

          {/* Tool Calls */}
          {toolCalls.length > 0 && (
            <div className="flex justify-start">
              <div className="max-w-[70%] rounded-lg px-4 py-3 bg-blue-50 text-blue-900 border border-blue-200">
                {toolCalls.map((call, index) => (
                  <p key={index} className="text-sm">
                    🔧 {call}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2">
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
            {isStreaming ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Chat;
