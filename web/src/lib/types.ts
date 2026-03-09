// Shared TypeScript types for the web UI

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  messageCount: number;
  lastActivity: string | null;
}

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  schedule: string;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, any> | null;
}

export interface TaskHistory {
  id: string;
  taskId: string;
  executedAt: string;
  success: boolean;
  error: string | null;
  duration: number;
  result: string | null;
}

export interface Message {
  id: string;
  chat_id: string;
  direction: 'incoming' | 'outgoing';
  sender: string;
  content: string | null;
  timestamp: string;
  signal_timestamp: number;
  message_type: 'text' | 'reaction' | 'attachment' | 'other';
  metadata: string | null;
  chat_name?: string;
}

export interface ActivityLog {
  id: string;
  chat_id: string;
  trace_id: string;
  parent_id: string | null;
  log_type: 'invocation' | 'tool_call' | 'tool_result' | 'response' | 'error';
  step_number: number;
  content: string;
  created_at: string;
  metadata: string | null;
  chat_name?: string;
}

export interface Chat {
  id: string;
  chat_type: 'dm' | 'group';
  signal_chat_id: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
  metadata: string | null;
}

export interface DashboardStats {
  messagesReceived: number;
  messagesSent: number;
  totalMessages: number;
  activeChats: number;
  toolCallsToday: number;
  errorsToday: number;
  scheduledTasks: {
    total: number;
    enabled: number;
  };
  uptime: number;
  lastActivity: string | null;
  timestamp: string;
}

export interface StreamEvent {
  type: 'session' | 'text' | 'tool_call' | 'tool_result' | 'thinking' | 'final' | 'complete' | 'error';
  sessionId?: string;
  text?: string;
  tool?: string;
  input?: any;
  result?: any;
  error?: string;
  messageId?: string;
}
