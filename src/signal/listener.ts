/**
 * Signal Listener - adapted from cantrip-integrations
 * Replaces Loria with database storage
 */

import type { Agent } from '../agent/service';
import type { DatabaseClient } from '../database/client';
import type { SignalContext, SignalMessage } from './context';
import type { BotConfig, Logger } from '../config';
import { generateId } from '../database/schema';
import { RateLimiter } from '../utils/security';

export interface SignalListenerOptions {
  signalContext: SignalContext;
  database: DatabaseClient;
  agent: Agent;
  config: BotConfig;
  logger: Logger;
}

/**
 * Derive chat ID from a Signal message
 */
function getChatId(msg: SignalMessage): string {
  const data = msg.envelope.dataMessage;
  if (data?.groupInfo?.groupId) {
    return data.groupInfo.groupId; // Group: use groupId
  }
  return msg.envelope.source; // DM: use sender UUID
}

/**
 * Signal listener that polls for messages and responds using the agent
 */
export class SignalListener {
  private signalContext: SignalContext;
  private database: DatabaseClient;
  private agent: Agent;
  private config: BotConfig;
  private logger: Logger;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private processedTimestamps = new Set<number>();
  private sentMessageTimestamps = new Set<number>();

  // Mutex to prevent concurrent request processing
  private requestLock: Promise<void> = Promise.resolve();
  private isProcessing = false;

  private botUuid: string | null = null;
  private botNames: string[];
  private rateLimiter: RateLimiter;

  constructor(options: SignalListenerOptions) {
    this.signalContext = options.signalContext;
    this.database = options.database;
    this.agent = options.agent;
    this.config = options.config;
    this.logger = options.logger;
    this.botNames = [...options.config.accessControl.botNames];
    this.rateLimiter = new RateLimiter({
      maxPerMinute: 10,
      maxPerHour: 100,
    });
  }

  /**
   * Check if a sender is allowed to interact with the bot
   */
  private isSenderAllowed(source: string, sourceNumber?: string): boolean {
    const allowed = this.config.accessControl.allowedSenders;
    if (allowed.length === 0) return true;
    return allowed.includes(source) || (!!sourceNumber && allowed.includes(sourceNumber));
  }

  /**
   * Check if a group is allowed
   */
  private isGroupAllowed(groupId: string): boolean {
    const allowed = this.config.accessControl.allowedGroups;
    if (allowed.length === 0) return false;
    return allowed.includes(groupId);
  }

  /**
   * Check if the bot is mentioned in a message
   */
  private isBotMentioned(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    for (const name of this.botNames) {
      if (lowerMessage.includes(name.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get or create a chat record in the database
   */
  private async getOrCreateChat(chatId: string, isGroup: boolean): Promise<string> {
    let chat = this.database.getChat(chatId);
    if (!chat) {
      chat = this.database.createChat(isGroup ? 'group' : 'dm', chatId);
    }
    return chat.id;
  }

  /**
   * Start listening for Signal messages
   */
  async start(): Promise<void> {
    if (this.pollTimer) {
      throw new Error('Signal listener already started');
    }

    // Fetch bot's UUID for mention detection
    try {
      const profile = await this.signalContext.getProfile();
      this.botUuid = profile.uuid;
      if (profile.name && !this.botNames.includes(profile.name)) {
        this.botNames.push(profile.name);
      }
    } catch (error) {
      this.logger.warn('Could not fetch bot profile for @mention detection');
      this.logger.warn('Bot will NOT respond to @mentions, only to name matches in text');
    }

    this.logger.info(`Starting Signal listener (polling every ${this.config.signal.pollInterval}ms)`);
    if (this.config.accessControl.allowedSenders.length > 0) {
      this.logger.info(`Allowed senders: ${this.config.accessControl.allowedSenders.join(', ')}`);
    } else {
      this.logger.warn('No allowed senders configured - bot will respond to anyone!');
    }

    if (this.config.accessControl.allowedGroups.length > 0) {
      this.logger.info(`Allowed groups: ${this.config.accessControl.allowedGroups.join(', ')}`);
    }

    if (this.botNames.length > 0) {
      this.logger.info(`Bot names: ${this.botNames.join(', ')}`);
    }

    // Initial poll
    await this.poll();

    // Start polling interval
    this.pollTimer = setInterval(() => this.poll(), this.config.signal.pollInterval);

    this.logger.info('Signal listener active');
  }

  /**
   * Poll for new messages
   */
  private async poll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const messages = await this.signalContext.receiveMessages();

      if (messages.length > 0) {
        this.logger.debug(`Received ${messages.length} message(s) from Signal API`);
      }

      for (const msg of messages) {
        await this.handleMessage(msg);
      }
    } catch (error) {
      this.logger.error('Error polling Signal messages:', error);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Handle an incoming Signal message
   */
  private async handleMessage(msg: SignalMessage): Promise<void> {
    const env = msg.envelope;
    const data = env.dataMessage;

    // Handle reactions separately
    if (data?.reaction) {
      await this.handleReaction(msg);
      if (!data.message || data.message.trim() === '') {
        return;
      }
    }

    // Skip non-text messages
    if (!data?.message) return;

    // Skip already processed (deduplication)
    if (this.processedTimestamps.has(env.timestamp)) return;
    this.processedTimestamps.add(env.timestamp);

    // Cleanup old timestamps (keep last 1000)
    if (this.processedTimestamps.size > 1000) {
      const arr = Array.from(this.processedTimestamps);
      arr.slice(0, arr.length - 1000).forEach((ts) => this.processedTimestamps.delete(ts));
    }

    const messageText = data.message;
    const senderName = env.sourceName || env.sourceNumber || env.source;
    const senderUuid = env.source;
    const senderPhone = env.sourceNumber;
    const isGroup = !!data.groupInfo;
    const groupId = data.groupInfo?.groupId;

    // Log ALL messages at INFO level (before access control) - like integrations-signal
    const groupPrefix = isGroup ? `[Group: ${groupId}] ` : '';
    this.logger.info(`${groupPrefix}Message from ${senderName}: "${messageText.slice(0, 50)}..."`);

    // Check access control
    if (isGroup) {
      if (!this.isGroupAllowed(groupId!)) {
        this.logger.info(`  └─ Ignoring (unauthorized group)`);
        return;
      }
    } else {
      if (!this.isSenderAllowed(senderUuid, senderPhone)) {
        this.logger.info(`  └─ Ignoring (unauthorized sender)`);
        return;
      }
    }

    // In groups, only respond if mentioned
    if (isGroup && !this.isBotMentioned(messageText)) {
      this.logger.info(`  └─ Skipping (bot not mentioned)`);
      return;
    }

    // Check rate limit
    const userId = senderPhone || senderUuid;
    const rateLimitCheck = this.rateLimiter.check(userId);
    if (!rateLimitCheck.allowed) {
      if (this.rateLimiter.shouldSendWarning(userId)) {
        const warningMessage =
          rateLimitCheck.reason === 'hourly_limit'
            ? 'Rate limit exceeded. Please try again later (hourly quota reached).'
            : 'Rate limit exceeded. Please slow down (too many messages per minute).';

        try {
          if (isGroup && groupId) {
            await this.signalContext.sendGroupMessage(groupId, warningMessage);
          } else {
            await this.signalContext.sendMessage([userId], warningMessage);
          }
        } catch (error) {
          this.logger.error(`Failed to send rate limit warning: ${error}`);
        }
      }
      this.logger.warn(`Rate limit exceeded for user ${userId}: ${rateLimitCheck.reason}`);
      return;
    }

    this.logger.info(`  └─ Responding...`);

    // Acquire mutex
    const previousLock = this.requestLock;
    let releaseLock: () => void = () => {};
    this.requestLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await previousLock;
    this.isProcessing = true;

    try {
      // Get or create chat
      const chatId = getChatId(msg);
      const dbChatId = await this.getOrCreateChat(chatId, isGroup);

      // Store incoming message in database
      this.database.addMessage(
        dbChatId,
        'incoming',
        senderPhone || senderUuid,
        messageText,
        env.timestamp,
        'text'
      );

      // Clean message (remove mention placeholders)
      let cleanedMessage = messageText.replace(/\uFFFC/g, '').trim();

      // Build context prompt
      const senderId = senderPhone || senderUuid;
      const contextPrompt = `
[CONTEXT - You are responding to a Signal message]
- From: ${senderName}
- ID: ${senderId}
${isGroup ? `- Group ID: ${groupId}` : '- Direct message'}
- Timestamp: ${new Date(env.timestamp).toISOString()}
- You can react using signal_send_reaction with recipient=${senderId}, target_timestamp=${env.timestamp}

Message: ${cleanedMessage}`;

      // Query agent with activity logging
      let response: string = '';
      if (this.config.enableActivityLogging) {
        const traceId = generateId();
        const rootActivityLog = this.database.createActivityTrace(dbChatId, traceId, {
          type: 'invocation',
          message: cleanedMessage,
          sender: senderName,
          timestamp: env.timestamp,
        });

        // Stream agent response
        const events = [];
        for await (const event of this.agent.queryStream(contextPrompt)) {
          events.push(event);
          if (event instanceof (await import('../agent/events')).FinalResponseEvent) {
            response = event.content;
          }
        }

        // Log events to database
        events.forEach((event, idx) => {
          this.database.addActivitySpan(
            dbChatId,
            traceId,
            rootActivityLog.id, // parent
            event.constructor.name.includes('Tool') ? 'tool_call' : 'response',
            idx + 1,
            { event: event.toString() }
          );
        });
      } else {
        response = await this.agent.query(contextPrompt);
      }

      // Validate response not empty
      if (!response || response.trim().length === 0) {
        this.logger.warn('Agent returned empty response');
        return;
      }

      // Send response
      const recipient = isGroup ? groupId! : senderId;
      const sendResult = isGroup
        ? await this.signalContext.sendGroupMessage(recipient, response)
        : await this.signalContext.sendMessage([recipient], response);

      // Store outgoing message in database
      this.database.addMessage(
        dbChatId,
        'outgoing',
        this.signalContext.getPhoneNumber(),
        response,
        Date.now(),
        'text'
      );

      // Track sent timestamp for reaction filtering
      if (sendResult?.timestamp || sendResult?.results?.[0]?.timestamp) {
        const sentTimestamp = sendResult.timestamp || sendResult.results[0].timestamp;
        this.sentMessageTimestamps.add(sentTimestamp);

        if (this.sentMessageTimestamps.size > 1000) {
          const arr = Array.from(this.sentMessageTimestamps);
          arr.slice(0, arr.length - 1000).forEach((ts) => this.sentMessageTimestamps.delete(ts));
        }
      }

      this.logger.info(`  └─ Response sent`);
    } catch (error) {
      this.logger.error('Error handling message:', error);

      // Clear history if corrupted
      if (
        error instanceof Error &&
        (error.message.includes('Expected toolResult') ||
          error.message.includes('not valid JSON'))
      ) {
        this.logger.error('Conversation history corrupted - clearing');
        this.agent.clearHistory();
      }

      // Try to send error message
      try {
        const errorMsg = `Sorry, I encountered an error: ${error instanceof Error ? error.message : String(error)}`;
        const senderId = senderPhone || senderUuid;
        const recipient = isGroup ? groupId! : senderId;
        isGroup
          ? await this.signalContext.sendGroupMessage(recipient, errorMsg)
          : await this.signalContext.sendMessage([recipient], errorMsg);
      } catch (sendError) {
        this.logger.error('Failed to send error message:', sendError);
      }
    } finally {
      this.isProcessing = false;
      releaseLock();
    }
  }

  /**
   * Handle an incoming reaction
   */
  private async handleReaction(msg: SignalMessage): Promise<void> {
    const env = msg.envelope;
    const data = env.dataMessage;
    const reaction = data?.reaction;

    if (!reaction) return;

    const senderName = env.sourceName || env.sourceNumber || env.source;
    const emoji = reaction.emoji;
    const targetTimestamp = reaction.targetTimestamp;

    if (!targetTimestamp || !this.sentMessageTimestamps.has(targetTimestamp)) {
      this.logger.debug(`Ignoring reaction to non-bot message`);
      return;
    }

    this.logger.info(`${senderName} reacted with ${emoji}`);

    // Log reaction to database
    if (this.config.enableActivityLogging) {
      try {
        const chatId = getChatId(msg);
        const dbChatId = await this.getOrCreateChat(chatId, !!data.groupInfo);

        this.database.addMessage(
          dbChatId,
          'incoming',
          senderName,
          emoji,
          Date.now(),
          'reaction',
          { targetTimestamp }
        );
      } catch (error) {
        this.logger.error('Error logging reaction:', error);
      }
    }
  }

  /**
   * Stop listening
   */
  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.processedTimestamps.clear();
    this.sentMessageTimestamps.clear();

    this.logger.info('Signal listener stopped');
  }
}
