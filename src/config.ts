/**
 * Configuration management for Signal Bot
 * Loads and validates environment variables
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env file (can be customized via ENV_FILE environment variable)
const envFile = process.env.ENV_FILE || '.env';
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile });
  console.log(`Loaded configuration from: ${envFile}`);
} else {
  dotenv.config(); // Fall back to default .env
}

// ============================================================================
// Configuration Interface
// ============================================================================

export interface BotConfig {
  // Database
  database: {
    type: 'sqlite' | 'postgres';
    path: string; // SQLite: file path, PostgreSQL: connection string
  };

  // Signal API
  signal: {
    apiUrl: string;
    phoneNumber: string;
    pollInterval: number; // milliseconds
  };

  // Access Control
  accessControl: {
    allowedSenders: string[]; // Phone numbers
    allowedGroups: string[]; // Group IDs
    botNames: string[]; // Names the bot responds to (for mentions)
  };

  // LLM
  llm: {
    provider: 'anthropic' | 'openai' | 'lmstudio' | 'vertex' | 'bedrock';
    apiKey: string;
    baseURL?: string; // For OpenAI-compatible APIs (LM Studio, etc.)
    model: string;
    maxTokens?: number;
    // AWS Bedrock specific
    awsBearerToken?: string;
    awsRegion?: string;
    // Vertex AI specific (uses apiKey for GOOGLE_CLOUD_API_KEY)
  };

  // Optional Features
  workspaceDir?: string;
  enableActivityLogging: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  // MCP (Model Context Protocol) - Optional
  mcp?: {
    enabled: boolean;
    servers: Array<{
      name: string;
      command: string;
      args: string[];
      env?: Record<string, string>;
    }>;
  };
}

// ============================================================================
// Configuration Validation
// ============================================================================

/**
 * Parse comma-separated list from environment variable
 */
function parseList(value: string | undefined, defaultValue: string[] = []): string[] {
  if (!value) return defaultValue;
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): BotConfig {
  const errors: string[] = [];

  // Required variables
  const SIGNAL_API_URL = process.env.SIGNAL_API_URL;
  const SIGNAL_PHONE_NUMBER = process.env.SIGNAL_PHONE_NUMBER;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!SIGNAL_API_URL) {
    errors.push('SIGNAL_API_URL is required');
  }

  if (!SIGNAL_PHONE_NUMBER) {
    errors.push('SIGNAL_PHONE_NUMBER is required');
  }

  if (!ANTHROPIC_API_KEY) {
    errors.push('ANTHROPIC_API_KEY is required');
  }

  // Database configuration
  const DATABASE_TYPE = (process.env.DATABASE_TYPE || 'sqlite') as 'sqlite' | 'postgres';
  let DATABASE_PATH = process.env.DATABASE_PATH || './data/signal-bot.db';

  if (DATABASE_TYPE === 'sqlite') {
    // Ensure data directory exists
    const dataDir = path.dirname(DATABASE_PATH);
    if (!path.isAbsolute(DATABASE_PATH)) {
      DATABASE_PATH = path.resolve(process.cwd(), DATABASE_PATH);
    }
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  // Access control
  const ALLOWED_SENDERS = parseList(process.env.SIGNAL_ALLOWED_SENDERS);
  const ALLOWED_GROUPS = parseList(process.env.SIGNAL_ALLOWED_GROUPS);
  const BOT_NAMES = parseList(process.env.SIGNAL_BOT_NAMES, ['Bot', 'Assistant']);

  if (ALLOWED_SENDERS.length === 0 && ALLOWED_GROUPS.length === 0) {
    errors.push(
      'At least one of SIGNAL_ALLOWED_SENDERS or SIGNAL_ALLOWED_GROUPS must be configured'
    );
  }

  // LLM configuration
  const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'anthropic') as 'anthropic' | 'openai' | 'lmstudio' | 'vertex' | 'bedrock';
  const LLM_BASE_URL = process.env.LLM_BASE_URL; // For OpenAI-compatible APIs
  const LLM_MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-20250514';
  const LLM_MAX_TOKENS = process.env.LLM_MAX_TOKENS
    ? parseInt(process.env.LLM_MAX_TOKENS, 10)
    : undefined;

  // AWS Bedrock specific
  const AWS_BEARER_TOKEN = process.env.AWS_BEARER_TOKEN_BEDROCK;
  const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

  // Vertex AI uses ANTHROPIC_API_KEY for backward compatibility, or GOOGLE_CLOUD_API_KEY
  const VERTEX_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;

  // Validate LLM configuration
  if (LLM_PROVIDER === 'openai' || LLM_PROVIDER === 'lmstudio') {
    if (!LLM_BASE_URL) {
      errors.push(`LLM_BASE_URL is required when using ${LLM_PROVIDER} provider`);
    }
  }

  if (LLM_PROVIDER === 'bedrock') {
    if (!AWS_BEARER_TOKEN) {
      errors.push('AWS_BEARER_TOKEN_BEDROCK is required when using bedrock provider');
    }
  }

  if (LLM_PROVIDER === 'vertex') {
    if (!VERTEX_API_KEY && !ANTHROPIC_API_KEY) {
      errors.push('GOOGLE_CLOUD_API_KEY is required when using vertex provider');
    }
  }

  // Optional configuration
  const WORKSPACE_DIR = process.env.WORKSPACE_DIR;
  const ENABLE_ACTIVITY_LOGGING = process.env.ENABLE_ACTIVITY_LOGGING !== 'false';
  const LOG_LEVEL = (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error';
  const SIGNAL_POLL_INTERVAL = parseInt(process.env.SIGNAL_POLL_INTERVAL || '5000', 10);

  // MCP (Model Context Protocol) - Optional
  let mcpConfig: BotConfig['mcp'] | undefined;
  const MCP_ENABLED = process.env.MCP_ENABLED === 'true';
  const MCP_CONFIG_FILE = process.env.MCP_CONFIG_FILE;

  if (MCP_ENABLED && MCP_CONFIG_FILE) {
    try {
      const mcpConfigPath = path.resolve(process.cwd(), MCP_CONFIG_FILE);
      if (fs.existsSync(mcpConfigPath)) {
        const mcpConfigContent = fs.readFileSync(mcpConfigPath, 'utf-8');
        const mcpData = JSON.parse(mcpConfigContent);

        if (mcpData.mcpServers && Array.isArray(mcpData.mcpServers)) {
          mcpConfig = {
            enabled: true,
            servers: mcpData.mcpServers,
          };
        }
      } else {
        console.warn(`MCP config file not found: ${mcpConfigPath}`);
      }
    } catch (error) {
      console.error(`Failed to load MCP config: ${error}`);
    }
  }

  // Throw if validation failed
  if (errors.length > 0) {
    throw new Error(
      `Configuration validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}\n\n` +
        `Please check your .env file or environment variables.`
    );
  }

  return {
    database: {
      type: DATABASE_TYPE,
      path: DATABASE_PATH,
    },
    signal: {
      apiUrl: SIGNAL_API_URL!,
      phoneNumber: SIGNAL_PHONE_NUMBER!,
      pollInterval: SIGNAL_POLL_INTERVAL,
    },
    accessControl: {
      allowedSenders: ALLOWED_SENDERS,
      allowedGroups: ALLOWED_GROUPS,
      botNames: BOT_NAMES,
    },
    llm: {
      provider: LLM_PROVIDER,
      apiKey: (LLM_PROVIDER === 'vertex' ? (VERTEX_API_KEY || ANTHROPIC_API_KEY) : ANTHROPIC_API_KEY)!,
      baseURL: LLM_BASE_URL,
      model: LLM_MODEL,
      maxTokens: LLM_MAX_TOKENS,
      awsBearerToken: AWS_BEARER_TOKEN,
      awsRegion: AWS_REGION,
    },
    workspaceDir: WORKSPACE_DIR,
    enableActivityLogging: ENABLE_ACTIVITY_LOGGING,
    logLevel: LOG_LEVEL,
    mcp: mcpConfig,
  };
}

// ============================================================================
// Logging Helpers
// ============================================================================

export function createLogger(config: BotConfig) {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const currentLevel = levels[config.logLevel];

  return {
    debug: (...args: any[]) => {
      if (currentLevel <= levels.debug) {
        console.log('[DEBUG]', ...args);
      }
    },
    info: (...args: any[]) => {
      if (currentLevel <= levels.info) {
        console.log('[INFO]', ...args);
      }
    },
    warn: (...args: any[]) => {
      if (currentLevel <= levels.warn) {
        console.warn('[WARN]', ...args);
      }
    },
    error: (...args: any[]) => {
      if (currentLevel <= levels.error) {
        console.error('[ERROR]', ...args);
      }
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
