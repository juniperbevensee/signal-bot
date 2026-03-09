/**
 * Chat API routes for web UI
 */

import { Router, type Request, type Response } from 'express';
import type { ServerDependencies } from '../app';
import { generateId } from '../../database/schema';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// In-memory session storage (could be moved to database later)
const sessions = new Map<string, ChatMessage[]>();

export function createChatRouter(deps: ServerDependencies): Router {
  const router = Router();

  /**
   * POST /api/chat/message
   * Send a message and get a complete response (non-streaming)
   */
  router.post('/message', async (req: Request, res: Response) => {
    try {
      const { message, sessionId } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Get or create session
      const sid = sessionId || generateId();
      if (!sessions.has(sid)) {
        sessions.set(sid, []);
      }

      const session = sessions.get(sid)!;

      // Add user message
      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
      session.push(userMsg);

      // Get agent response
      const reply = await deps.agent.query(message);

      // Add assistant message
      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: reply,
        timestamp: new Date().toISOString(),
      };
      session.push(assistantMsg);

      res.json({
        reply,
        sessionId: sid,
        messageId: assistantMsg.id,
      });
    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to process message',
      });
    }
  });

  /**
   * GET /api/chat/stream
   * Send a message and stream the response using Server-Sent Events
   */
  router.get('/stream', async (req: Request, res: Response) => {
    try {
      const { message, sessionId } = req.query;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Setup SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Get or create session
      const sid = (sessionId as string) || generateId();
      if (!sessions.has(sid)) {
        sessions.set(sid, []);
      }

      const session = sessions.get(sid)!;

      // Add user message
      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
      session.push(userMsg);

      // Send session ID
      res.write(`data: ${JSON.stringify({ type: 'session', sessionId: sid })}\n\n`);

      let fullResponse = '';

      // Stream agent response
      for await (const event of deps.agent.queryStream(message)) {
        if (event.type === 'text') {
          fullResponse += event.text;
          res.write(`data: ${JSON.stringify({ type: 'text', text: event.text })}\n\n`);
        } else if (event.type === 'tool_call') {
          res.write(`data: ${JSON.stringify({ type: 'tool_call', tool: event.tool, input: event.input })}\n\n`);
        } else if (event.type === 'tool_result') {
          res.write(`data: ${JSON.stringify({ type: 'tool_result', tool: event.tool, result: event.result })}\n\n`);
        } else if (event.type === 'thinking') {
          res.write(`data: ${JSON.stringify({ type: 'thinking' })}\n\n`);
        } else if (event.type === 'final_response') {
          fullResponse = event.text;
          res.write(`data: ${JSON.stringify({ type: 'final', text: event.text })}\n\n`);
        }
      }

      // Add assistant message to history
      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date().toISOString(),
      };
      session.push(assistantMsg);

      // Send completion event
      res.write(`data: ${JSON.stringify({ type: 'complete', messageId: assistantMsg.id })}\n\n`);
      res.end();
    } catch (error) {
      console.error('Chat stream error:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Stream failed' })}\n\n`);
      res.end();
    }
  });

  /**
   * GET /api/chat/history/:sessionId
   * Get chat history for a session
   */
  router.get('/history/:sessionId', (req: Request, res: Response) => {
    const { sessionId } = req.params;

    if (!sessions.has(sessionId)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessions.get(sessionId)!;
    res.json({ messages: session });
  });

  /**
   * GET /api/chat/sessions
   * List all active sessions
   */
  router.get('/sessions', (req: Request, res: Response) => {
    const sessionList = Array.from(sessions.entries()).map(([id, messages]) => ({
      id,
      messageCount: messages.length,
      lastActivity: messages[messages.length - 1]?.timestamp || null,
    }));

    res.json({ sessions: sessionList });
  });

  /**
   * DELETE /api/chat/session/:sessionId
   * Clear a chat session
   */
  router.delete('/session/:sessionId', (req: Request, res: Response) => {
    const { sessionId } = req.params;

    if (!sessions.has(sessionId)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    sessions.delete(sessionId);
    res.json({ success: true });
  });

  return router;
}
