/**
 * Signal tools for the bot
 * Adapted from cantrip-integrations, simplified for direct SignalContext injection
 */

import { z } from 'zod';
import { tool, type Tool } from '../agent/tools';
import type { SignalContext } from './context';
import { validateFilePath, isDangerousExtension } from '../utils/security';

/**
 * Create Signal tools with injected SignalContext
 */
export function createSignalTools(ctx: SignalContext, workspaceDir?: string, approvedUsers?: string[]): Tool[] {
  const signal_send_message = tool(
    'Send a NEW Signal message to one or more phone numbers. Can include image/file attachments. Use E.164 format (e.g., +14155551234). WARNING: Do NOT use this to reply to the current conversation - your response is sent automatically. Only use this to initiate new messages to different people.',
    async ({
      recipients,
      message,
      attachment_path,
    }: {
      recipients: string[];
      message: string;
      attachment_path?: string;
    }) => {
      let base64Attachments: string[] | undefined;

      if (attachment_path) {
        if (!workspaceDir) {
          return JSON.stringify({
            success: false,
            error: 'File attachments disabled: WORKSPACE_DIR not configured',
          }, null, 2);
        }

        // Security: Validate file path
        try {
          // If path is relative, treat it as relative to workspace directory
          const path = await import('path');
          const resolvedPath = path.isAbsolute(attachment_path)
            ? attachment_path
            : path.join(workspaceDir, attachment_path);

          const validatedPath = validateFilePath(resolvedPath, workspaceDir);

          // Security: Block dangerous file extensions
          if (isDangerousExtension(validatedPath)) {
            return JSON.stringify({
              success: false,
              error: `Security: File type not allowed for safety reasons`,
            }, null, 2);
          }

          const fs = await import('fs/promises');
          const buffer = await fs.readFile(validatedPath);
          base64Attachments = [buffer.toString('base64')];
        } catch (error) {
          return JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'File access error',
          }, null, 2);
        }
      }

      const result = await ctx.sendMessage(recipients, message, { base64Attachments });
      return JSON.stringify(
        {
          success: true,
          recipients,
          timestamp: Date.now(),
          attachment_sent: !!attachment_path,
          ...result,
        },
        null,
        2
      );
    },
    {
      name: 'signal_send_message',
      zodSchema: z.object({
        recipients: z
          .array(z.string())
          .describe('Phone numbers in E.164 format (e.g., +14155551234)'),
        message: z.string().describe('Message text to send'),
        attachment_path: z
          .string()
          .optional()
          .describe('Optional: path to image/file to attach, relative to workspace/sandbox (e.g., "chart.png")'),
      }),
    }
  );

  const signal_send_group_message = tool(
    'Send a NEW Signal message to a group. Can include image/file attachments. Use signal_list_groups to get group IDs. WARNING: Do NOT use this to reply to a group conversation - your response is sent automatically. Only use this to initiate new messages to different groups.',
    async ({
      group_id,
      message,
      attachment_path,
    }: {
      group_id: string;
      message: string;
      attachment_path?: string;
    }) => {
      let base64Attachments: string[] | undefined;

      if (attachment_path) {
        if (!workspaceDir) {
          return JSON.stringify({
            success: false,
            error: 'File attachments disabled: WORKSPACE_DIR not configured',
          }, null, 2);
        }

        // Security: Validate file path
        try {
          // If path is relative, treat it as relative to workspace directory
          const path = await import('path');
          const resolvedPath = path.isAbsolute(attachment_path)
            ? attachment_path
            : path.join(workspaceDir, attachment_path);

          const validatedPath = validateFilePath(resolvedPath, workspaceDir);

          // Security: Block dangerous file extensions
          if (isDangerousExtension(validatedPath)) {
            return JSON.stringify({
              success: false,
              error: `Security: File type not allowed for safety reasons`,
            }, null, 2);
          }

          const fs = await import('fs/promises');
          const buffer = await fs.readFile(validatedPath);
          base64Attachments = [buffer.toString('base64')];
        } catch (error) {
          return JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'File access error',
          }, null, 2);
        }
      }

      const result = await ctx.sendGroupMessage(group_id, message, { base64Attachments });
      return JSON.stringify(
        {
          success: true,
          group_id,
          timestamp: Date.now(),
          attachment_sent: !!attachment_path,
          ...result,
        },
        null,
        2
      );
    },
    {
      name: 'signal_send_group_message',
      zodSchema: z.object({
        group_id: z.string().describe('Group ID (from signal_list_groups)'),
        message: z.string().describe('Message text to send'),
        attachment_path: z
          .string()
          .optional()
          .describe('Optional: path to image/file to attach, relative to workspace/sandbox (e.g., "chart.png")'),
      }),
    }
  );

  const signal_list_groups = tool(
    "List all Signal groups you're a member of.",
    async () => {
      const groups = await ctx.listGroups();

      const formatted = groups.map((g) => ({
        id: g.id,
        name: g.name,
        member_count: g.members.length,
        admins: g.admins,
        blocked: g.blocked,
      }));

      return JSON.stringify(
        {
          count: groups.length,
          groups: formatted,
        },
        null,
        2
      );
    },
    {
      name: 'signal_list_groups',
      zodSchema: z.object({}),
    }
  );

  const signal_send_reaction = tool(
    'Send an emoji reaction to a Signal message. Use this to react to the current message you\'re responding to.',
    async ({
      recipient,
      emoji,
      target_timestamp,
    }: {
      recipient: string | number;
      emoji: string;
      target_timestamp: number;
    }) => {
      // Coerce recipient to string and ensure E.164 format
      let recipientStr = String(recipient);
      if (!recipientStr.startsWith('+') && !recipientStr.includes('-')) {
        // Looks like a phone number without +, add it
        recipientStr = '+' + recipientStr;
      }

      try {
        const result = await ctx.sendReaction(recipientStr, emoji, target_timestamp);
        return JSON.stringify(
          {
            success: true,
            recipient: recipientStr,
            emoji,
            target_timestamp,
            ...result,
          },
          null,
          2
        );
      } catch (error) {
        return JSON.stringify(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          null,
          2
        );
      }
    },
    {
      name: 'signal_send_reaction',
      zodSchema: z.object({
        recipient: z.union([z.string(), z.number()]).describe("Message sender's phone number (E.164 format, e.g. +14155551234) or UUID"),
        emoji: z.string().describe('Emoji to react with'),
        target_timestamp: z.number().describe('Timestamp of the message to react to'),
      }),
    }
  );

  const signal_get_identity = tool(
    'Get the phone number this Signal bot is registered with.',
    async () => {
      return JSON.stringify(
        {
          phone_number: ctx.getPhoneNumber(),
        },
        null,
        2
      );
    },
    {
      name: 'signal_get_identity',
      zodSchema: z.object({}),
    }
  );

  const signal_update_profile = tool(
    'Update the Signal profile name and/or avatar image for this bot. IMPORTANT: Only approved users can update the profile. Include sender_id from the context.',
    async ({
      sender_id,
      name,
      avatar_path,
    }: {
      sender_id: string;
      name?: string;
      avatar_path?: string;
    }) => {
      try {
        // Access control: Only approved users can update profile
        if (approvedUsers && approvedUsers.length > 0 && !approvedUsers.includes(sender_id)) {
          return JSON.stringify({
            success: false,
            error: 'Permission denied: Only approved users can update the bot profile',
          }, null, 2);
        }

        const options: { name?: string; avatarBase64?: string } = {};

        if (name) {
          options.name = name;
        }

        // Only process avatar if path is non-empty
        if (avatar_path && avatar_path.trim() !== '') {
          if (!workspaceDir) {
            return JSON.stringify({
              success: false,
              error: 'Avatar upload disabled: WORKSPACE_DIR not configured',
            }, null, 2);
          }

          // If path is relative, treat it as relative to workspace directory
          const path = await import('path');
          const resolvedPath = path.isAbsolute(avatar_path)
            ? avatar_path
            : path.join(workspaceDir, avatar_path);

          // Security: Validate file path
          const validatedPath = validateFilePath(resolvedPath, workspaceDir);

          // Only allow image files
          const ext = validatedPath.toLowerCase().split('.').pop();
          if (!['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
            return JSON.stringify({
              success: false,
              error: 'Avatar must be an image file (jpg, png, gif, webp)',
            }, null, 2);
          }

          const fs = await import('fs/promises');
          const buffer = await fs.readFile(validatedPath);
          options.avatarBase64 = buffer.toString('base64');
        }

        if (!options.name && !options.avatarBase64) {
          return JSON.stringify({
            success: false,
            error: 'Must provide at least one of: name, avatar_path',
          }, null, 2);
        }

        console.log(`[Tool] signal_update_profile called with:`, JSON.stringify(options));
        const result = await ctx.updateProfile(options);
        console.log(`[Tool] signal_update_profile result:`, JSON.stringify(result));
        return JSON.stringify(
          {
            success: true,
            updated_name: options.name || null,
            updated_avatar: !!options.avatarBase64,
            ...result,
          },
          null,
          2
        );
      } catch (error) {
        return JSON.stringify(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          null,
          2
        );
      }
    },
    {
      name: 'signal_update_profile',
      zodSchema: z.object({
        sender_id: z.string().describe('The sender ID from the context (required for permission check)'),
        name: z.string().optional().describe('The new profile name to set'),
        avatar_path: z.string().optional().describe('Path to image file for profile avatar (relative to workspace/sandbox directory, e.g., "avatar.png")'),
      }),
    }
  );

  return [
    signal_send_message,
    signal_send_group_message,
    signal_list_groups,
    signal_send_reaction,
    signal_get_identity,
    signal_update_profile,
  ];
}
