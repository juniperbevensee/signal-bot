/**
 * Discord integration
 * Tools for interacting with Discord servers
 */

import { Client, GatewayIntentBits, ChannelType } from 'discord.js';
import { tool, type Tool } from '../../agent/tools';
import { z } from 'zod';

/**
 * Create Discord tools with the given token.
 * Returns an empty array if no token is provided (fails gracefully).
 */
export function createDiscordTools(token?: string, guildId?: string): Tool[] {
  if (!token) {
    return [];
  }

  // Create Discord client
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  let isReady = false;

  // Login and wait for ready
  client.login(token).then(() => {
    client.once('ready', () => {
      isReady = true;
      console.log(`Discord bot logged in as ${client.user?.tag}`);
    });
  }).catch(error => {
    console.error('Failed to login to Discord:', error);
  });

  // Helper to ensure client is ready
  const ensureReady = async () => {
    if (!isReady) {
      throw new Error('Discord client not ready. Please wait a moment and try again.');
    }
  };

  const discord_send_message = tool(
    'Send a message to a Discord channel. Requires channel ID.',
    async ({ channel_id, message }: { channel_id: string; message: string }) => {
      try {
        await ensureReady();

        const channel = await client.channels.fetch(channel_id);
        if (!channel || !channel.isTextBased()) {
          throw new Error('Channel not found or not a text channel');
        }

        if ('send' in channel) {
          await channel.send(message);
        } else {
          throw new Error('Channel does not support sending messages');
        }

        return JSON.stringify({
          success: true,
          channel_id,
          message_length: message.length,
        }, null, 2);
      } catch (error: any) {
        throw new Error(`Failed to send Discord message: ${error.message}`);
      }
    },
    {
      name: 'discord_send_message',
      zodSchema: z.object({
        channel_id: z.string().describe('Discord channel ID where to send the message'),
        message: z.string().describe('Message content to send'),
      }),
    }
  );

  const discord_list_channels = tool(
    'List all channels in a Discord server. If guild_id is not provided, uses the configured default guild.',
    async ({ guild_id }: { guild_id?: string }) => {
      try {
        await ensureReady();

        const targetGuildId = guild_id || guildId;
        if (!targetGuildId) {
          throw new Error('No guild_id provided and no default guild configured');
        }

        const guild = await client.guilds.fetch(targetGuildId);
        const channels = await guild.channels.fetch();

        const channelList = Array.from(channels.values())
          .filter(ch => ch && ch.type === ChannelType.GuildText)
          .map(ch => ({
            id: ch!.id,
            name: ch!.name,
            type: 'text',
          }));

        return JSON.stringify({
          guild_id: targetGuildId,
          guild_name: guild.name,
          channels: channelList,
        }, null, 2);
      } catch (error: any) {
        throw new Error(`Failed to list Discord channels: ${error.message}`);
      }
    },
    {
      name: 'discord_list_channels',
      zodSchema: z.object({
        guild_id: z.string().optional().describe('Discord guild (server) ID. If not provided, uses default.'),
      }),
    }
  );

  const discord_get_messages = tool(
    'Get recent messages from a Discord channel.',
    async ({ channel_id, limit }: { channel_id: string; limit?: number }) => {
      try {
        await ensureReady();

        const channel = await client.channels.fetch(channel_id);
        if (!channel || !channel.isTextBased()) {
          throw new Error('Channel not found or not a text channel');
        }

        const messages = await channel.messages.fetch({ limit: limit || 10 });

        const messageList = Array.from(messages.values()).map(msg => ({
          id: msg.id,
          author: msg.author.tag,
          content: msg.content,
          timestamp: msg.createdAt.toISOString(),
          attachments: msg.attachments.size,
        }));

        return JSON.stringify({
          channel_id,
          messages: messageList,
        }, null, 2);
      } catch (error: any) {
        throw new Error(`Failed to get Discord messages: ${error.message}`);
      }
    },
    {
      name: 'discord_get_messages',
      zodSchema: z.object({
        channel_id: z.string().describe('Discord channel ID'),
        limit: z.number().min(1).max(100).optional().describe('Number of messages to fetch (default: 10, max: 100)'),
      }),
    }
  );

  return [discord_send_message, discord_list_channels, discord_get_messages];
}
