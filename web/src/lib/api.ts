// API client functions for the web UI

import type {
  ChatMessage,
  ChatSession,
  ScheduledTask,
  TaskHistory,
  Message,
  ActivityLog,
  Chat,
  DashboardStats,
  StreamEvent,
} from './types';

const API_BASE = '/api';

// ============================================================================
// Error Handling
// ============================================================================

class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'APIError';
  }
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new APIError(response.status, error.error || 'Request failed');
  }

  return response.json();
}

// ============================================================================
// Chat API
// ============================================================================

export async function sendMessage(message: string, sessionId?: string): Promise<{
  reply: string;
  sessionId: string;
  messageId: string;
}> {
  return fetchJSON('/chat/message', {
    method: 'POST',
    body: JSON.stringify({ message, sessionId }),
  });
}

export function streamMessage(
  message: string,
  sessionId: string | undefined,
  onEvent: (event: StreamEvent) => void,
  onError: (error: Error) => void,
  onComplete: () => void
): () => void {
  const params = new URLSearchParams();
  params.append('message', message);
  if (sessionId) {
    params.append('sessionId', sessionId);
  }

  const eventSource = new EventSource(`${API_BASE}/chat/stream?${params}`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as StreamEvent;
      onEvent(data);

      if (data.type === 'complete') {
        eventSource.close();
        onComplete();
      }
    } catch (error) {
      console.error('Failed to parse stream event:', error);
    }
  };

  eventSource.onerror = (error) => {
    console.error('Stream error:', error);
    eventSource.close();
    onError(new Error('Stream connection failed'));
  };

  // Return cleanup function
  return () => {
    eventSource.close();
  };
}

export async function getChatHistory(sessionId: string): Promise<{
  messages: ChatMessage[];
}> {
  return fetchJSON(`/chat/history/${sessionId}`);
}

export async function getChatSessions(): Promise<{ sessions: ChatSession[] }> {
  return fetchJSON('/chat/sessions');
}

export async function deleteChatSession(sessionId: string): Promise<{ success: boolean }> {
  return fetchJSON(`/chat/session/${sessionId}`, { method: 'DELETE' });
}

// ============================================================================
// Scheduler API
// ============================================================================

export async function getTasks(): Promise<{ tasks: ScheduledTask[] }> {
  return fetchJSON('/scheduler/tasks');
}

export async function getTask(id: string): Promise<{ task: ScheduledTask }> {
  return fetchJSON(`/scheduler/tasks/${id}`);
}

export async function updateTask(
  id: string,
  updates: { enabled?: boolean; schedule?: string; description?: string }
): Promise<{ task: ScheduledTask }> {
  return fetchJSON(`/scheduler/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function executeTask(id: string): Promise<{
  success: boolean;
  message: string;
  data: any;
}> {
  return fetchJSON(`/scheduler/tasks/${id}/execute`, { method: 'POST' });
}

export async function getTaskHistory(taskId: string, limit?: number): Promise<{
  history: TaskHistory[];
}> {
  const params = limit ? `?limit=${limit}` : '';
  return fetchJSON(`/scheduler/history/${taskId}${params}`);
}

export async function validateCronSchedule(schedule: string): Promise<{
  valid: boolean;
  message: string;
}> {
  return fetchJSON('/scheduler/validate', {
    method: 'POST',
    body: JSON.stringify({ schedule }),
  });
}

// ============================================================================
// Logs API
// ============================================================================

export async function getMessages(params?: {
  limit?: number;
  offset?: number;
  chatId?: string;
}): Promise<{
  messages: Message[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}> {
  const query = new URLSearchParams();
  if (params?.limit) query.append('limit', params.limit.toString());
  if (params?.offset) query.append('offset', params.offset.toString());
  if (params?.chatId) query.append('chatId', params.chatId);

  return fetchJSON(`/logs/messages?${query}`);
}

export async function getActivityLogs(params?: {
  limit?: number;
  offset?: number;
  chatId?: string;
  traceId?: string;
}): Promise<{
  logs: ActivityLog[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}> {
  const query = new URLSearchParams();
  if (params?.limit) query.append('limit', params.limit.toString());
  if (params?.offset) query.append('offset', params.offset.toString());
  if (params?.chatId) query.append('chatId', params.chatId);
  if (params?.traceId) query.append('traceId', params.traceId);

  return fetchJSON(`/logs/activity?${query}`);
}

export async function searchMessages(query: string, chatId?: string, limit?: number): Promise<{
  results: Message[];
  query: string;
  count: number;
}> {
  const params = new URLSearchParams();
  params.append('q', query);
  if (chatId) params.append('chatId', chatId);
  if (limit) params.append('limit', limit.toString());

  return fetchJSON(`/logs/search?${params}`);
}

export async function getChats(limit?: number): Promise<{ chats: Chat[] }> {
  const params = limit ? `?limit=${limit}` : '';
  return fetchJSON(`/logs/chats${params}`);
}

// ============================================================================
// Stats API
// ============================================================================

export async function getDashboardStats(): Promise<DashboardStats> {
  return fetchJSON('/stats/dashboard');
}

export async function getTimeline(period: 'hour' | 'day', limit?: number): Promise<{
  timeline: Array<{
    period: string;
    count: number;
    incoming: number;
    outgoing: number;
  }>;
  period: string;
  limit: number;
}> {
  const params = new URLSearchParams();
  params.append('period', period);
  if (limit) params.append('limit', limit.toString());

  return fetchJSON(`/stats/timeline?${params}`);
}

export async function getToolStats(): Promise<{
  tools: Array<{
    tool_name: string;
    count: number;
  }>;
}> {
  return fetchJSON('/stats/tools');
}

export async function getPerformanceStats(): Promise<{
  database: {
    sizeMB: number;
  };
  averageResponseTime: number | null;
  memory: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
  };
}> {
  return fetchJSON('/stats/performance');
}

// ============================================================================
// Health Check
// ============================================================================

export async function healthCheck(): Promise<{ status: string; timestamp: string }> {
  const response = await fetch('/health');
  return response.json();
}
