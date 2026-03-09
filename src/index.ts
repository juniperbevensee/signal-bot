/**
 * Signal Bot - Main Entry Point
 * Community-hosted Signal bot with local database storage
 */

import { loadConfig, createLogger } from './config';
import { SQLiteClient } from './database/client';
import { SignalContext } from './signal/context';
import { SignalListener } from './signal/listener';
import { Agent } from './agent/service';
import { createLLMClient } from './agent/llm-client';
import { initMemoryFile, loadMemoryForPrompt, memoryTools } from './agent/memory';
import { createSignalTools } from './signal/tools';
import { createChatHistoryTools } from './tools/chat-history';
import { createSandboxTools } from './tools/sandbox-fs';
import { createBrowserTools } from './tools/browser';
import { createLogTools } from './tools/logs';

async function main() {
  // Load configuration
  const config = loadConfig();
  const logger = createLogger(config);

  logger.info('Starting Signal Bot');
  logger.info(`Database: ${config.database.type} at ${config.database.path}`);
  logger.info(`Model: ${config.llm.model}`);

  // Initialize database
  const db = new SQLiteClient(config.database.path);
  logger.info('Database initialized');

  // Initialize memory file
  if (config.workspaceDir) {
    await initMemoryFile(config.workspaceDir);
    logger.info(`Memory file initialized at ${config.workspaceDir}/persistent_memory.md`);
  }

  // Create Signal context
  const signalContext = await SignalContext.create({
    apiUrl: config.signal.apiUrl,
    phoneNumber: config.signal.phoneNumber,
  });
  logger.info(`Connected to Signal API as ${config.signal.phoneNumber}`);

  // Load memory for system prompt
  const memory = await loadMemoryForPrompt(config.workspaceDir);
  const systemPrompt = `You are a helpful AI assistant accessible via Signal messaging.

${memory ? `\n${memory}\n` : ''}

## Your Capabilities

You have access to the following tools:
- **Memory tools**: Store and retrieve preferences
- **Signal tools**: Send messages, reactions, list groups
- **Chat history**: Search and retrieve previous messages
- **Browser tools**: Fetch web pages, search the web, retrieve JSON APIs
- **Log tools**: View your own activity logs, statistics, and tool usage

## Response Guidelines

1. Be concise and helpful in your responses
2. Signal messages should be clear and readable on mobile devices
3. Use formatting sparingly (Signal has limited markdown support)
4. When uncertain, ask clarifying questions
5. Remember user preferences and refer to your memory

## Security

- Only respond to approved users (access control is enforced)
- Do not execute arbitrary code or commands
- File operations are sandboxed to workspace directory
- Be cautious with sensitive information

Current chat context will be provided with each message.`;

  // Create LLM client
  const llmClient = createLLMClient({
    provider: config.llm.provider,
    apiKey: config.llm.apiKey,
    baseURL: config.llm.baseURL,
    awsBearerToken: config.llm.awsBearerToken,
    awsRegion: config.llm.awsRegion,
    model: config.llm.model,
    slowMode: config.llm.slowMode,
    rateLimitTPM: config.llm.rateLimitTPM,
  });
  logger.info(`LLM provider: ${config.llm.provider}`);
  if (config.llm.slowMode) {
    logger.info(`Slow mode enabled (rate limit: ${config.llm.rateLimitTPM} TPM)`);
  }

  // Create tools
  const signalTools = createSignalTools(signalContext, config.workspaceDir);
  const browserTools = createBrowserTools();
  const logTools = createLogTools(db.db);

  const allTools = [
    ...signalTools,
    ...memoryTools,
    ...browserTools,
    ...logTools,
    // Note: chat history tools are created per-message with current chat ID
  ];

  // Add sandbox tools if configured
  if (config.sandboxDir) {
    const sandboxTools = createSandboxTools(config.sandboxDir);
    allTools.push(...sandboxTools);
    logger.info(`Sandbox tools enabled at ${config.sandboxDir}`);
  }

  // Load MCP tools if enabled (optional)
  if (config.mcp?.enabled && config.mcp.servers.length > 0) {
    try {
      logger.info('Loading MCP tools...');
      const { createMCPToolsFromConfig } = await import('./mcp/adapter');
      const mcpTools = await createMCPToolsFromConfig(config.mcp.servers);

      if (mcpTools.length > 0) {
        allTools.push(...mcpTools);
        logger.info(`Loaded ${mcpTools.length} MCP tools`);
      }
    } catch (error) {
      logger.error(`Failed to load MCP tools: ${error}`);
      logger.warn('Continuing without MCP tools...');
    }
  }

  // Create agent
  const agent = new Agent({
    llmClient,
    model: config.llm.model,
    systemPrompt,
    tools: allTools,
    maxIterations: 50,
    maxTokens: config.llm.maxTokens,
  });
  logger.info('Agent initialized');

  // Create listener
  const listener = new SignalListener({
    signalContext,
    database: db,
    agent,
    config,
    logger,
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await listener.stop();
    db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start listening
  await listener.start();

  logger.info('Signal bot is running. Press Ctrl+C to stop.');
}

// Run main and handle errors
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
