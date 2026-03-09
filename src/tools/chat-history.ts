/**
 * Chat history tools for accessing message logs
 * Replaces Loria-based chat log tools with database queries
 */

import { z } from 'zod';
import { tool, type Tool } from '../agent/tools';
import type { DatabaseClient } from '../database/client';

/**
 * Create chat history tools with injected database client
 */
export function createChatHistoryTools(db: DatabaseClient, currentChatId: string): Tool[] {
  const get_chat_logs = tool(
    'Get recent messages and activity from the current chat. Returns conversation history including user messages and bot responses.',
    async ({ limit = 20 }: { limit?: number }) => {
      const messages = db.getMessages(currentChatId, limit);

      const formatted = messages.reverse().map((msg) => ({
        direction: msg.direction,
        sender: msg.sender,
        content: msg.content,
        timestamp: msg.timestamp,
        type: msg.message_type,
      }));

      return JSON.stringify(
        {
          chat_id: currentChatId,
          message_count: messages.length,
          messages: formatted,
        },
        null,
        2
      );
    },
    {
      name: 'get_chat_logs',
      zodSchema: z.object({
        limit: z.number().optional().describe('Number of recent messages to retrieve (default: 20)'),
      }),
    }
  );

  const search_chat_logs = tool(
    'Search for messages in the current chat by content. Useful for finding previous discussions about specific topics.',
    async ({ query, limit = 10 }: { query: string; limit?: number }) => {
      const messages = db.searchMessages(currentChatId, query, limit);

      const formatted = messages.map((msg) => ({
        direction: msg.direction,
        sender: msg.sender,
        content: msg.content,
        timestamp: msg.timestamp,
      }));

      return JSON.stringify(
        {
          query,
          result_count: messages.length,
          results: formatted,
        },
        null,
        2
      );
    },
    {
      name: 'search_chat_logs',
      zodSchema: z.object({
        query: z.string().describe('Search query to find in message content'),
        limit: z.number().optional().describe('Maximum number of results (default: 10)'),
      }),
    }
  );

  return [get_chat_logs, search_chat_logs];
}
