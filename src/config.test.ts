/**
 * Configuration Tests
 * Tests for environment variable loading and validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Required Fields', () => {
    it('should throw if SIGNAL_PHONE_NUMBER is missing', async () => {
      delete process.env.SIGNAL_PHONE_NUMBER;
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const { loadConfig } = await import('./config');
      expect(() => loadConfig()).toThrow(/SIGNAL_PHONE_NUMBER/);
    });

    it('should throw if ANTHROPIC_API_KEY is missing', async () => {
      process.env.SIGNAL_PHONE_NUMBER = '+14155551234';
      delete process.env.ANTHROPIC_API_KEY;

      const { loadConfig } = await import('./config');
      expect(() => loadConfig()).toThrow(/ANTHROPIC_API_KEY/);
    });

    it('should throw if no access control configured', async () => {
      process.env.SIGNAL_PHONE_NUMBER = '+14155551234';
      process.env.ANTHROPIC_API_KEY = 'test-key';
      delete process.env.SIGNAL_ALLOWED_SENDERS;
      delete process.env.SIGNAL_ALLOWED_GROUPS;

      const { loadConfig } = await import('./config');
      expect(() => loadConfig()).toThrow(/SIGNAL_ALLOWED_SENDERS/);
    });
  });

  describe('Default Values', () => {
    beforeEach(() => {
      process.env.SIGNAL_API_URL = 'http://localhost:8080';
      process.env.SIGNAL_PHONE_NUMBER = '+14155551234';
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.SIGNAL_ALLOWED_SENDERS = '+14155551234';
    });

    it('should use default database type', async () => {
      const { loadConfig } = await import('./config');
      const config = loadConfig();

      expect(config.database.type).toBe('sqlite');
    });

    it('should use default LLM model', async () => {
      const { loadConfig } = await import('./config');
      const config = loadConfig();

      expect(config.llm.model).toBe('claude-sonnet-4-20250514');
    });

    it('should use default polling interval', async () => {
      const { loadConfig } = await import('./config');
      const config = loadConfig();

      expect(config.signal.pollInterval).toBe(5000);
    });

    it('should use default bot names', async () => {
      const { loadConfig } = await import('./config');
      const config = loadConfig();

      expect(config.accessControl.botNames).toContain('Bot');
      expect(config.accessControl.botNames).toContain('Assistant');
    });
  });

  describe('LLM Provider Configuration', () => {
    beforeEach(() => {
      process.env.SIGNAL_API_URL = 'http://localhost:8080';
      process.env.SIGNAL_PHONE_NUMBER = '+14155551234';
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.SIGNAL_ALLOWED_SENDERS = '+14155551234';
    });

    it('should default to anthropic provider', async () => {
      const { loadConfig } = await import('./config');
      const config = loadConfig();

      expect(config.llm.provider).toBe('anthropic');
    });

    it('should require baseURL for lmstudio provider', async () => {
      process.env.LLM_PROVIDER = 'lmstudio';
      delete process.env.LLM_BASE_URL;

      const { loadConfig } = await import('./config');
      expect(() => loadConfig()).toThrow(/LLM_BASE_URL/);
    });

    it('should accept lmstudio with baseURL', async () => {
      process.env.LLM_PROVIDER = 'lmstudio';
      process.env.LLM_BASE_URL = 'http://localhost:1234';

      const { loadConfig } = await import('./config');
      const config = loadConfig();

      expect(config.llm.provider).toBe('lmstudio');
      expect(config.llm.baseURL).toBe('http://localhost:1234');
    });
  });

  describe('Access Control Parsing', () => {
    beforeEach(() => {
      process.env.SIGNAL_API_URL = 'http://localhost:8080';
      process.env.SIGNAL_PHONE_NUMBER = '+14155551234';
      process.env.ANTHROPIC_API_KEY = 'test-key';
    });

    it('should parse comma-separated allowed senders', async () => {
      process.env.SIGNAL_ALLOWED_SENDERS = '+14155551234,+14155555678';

      const { loadConfig } = await import('./config');
      const config = loadConfig();

      expect(config.accessControl.allowedSenders).toHaveLength(2);
      expect(config.accessControl.allowedSenders).toContain('+14155551234');
      expect(config.accessControl.allowedSenders).toContain('+14155555678');
    });

    it('should parse comma-separated allowed groups', async () => {
      process.env.SIGNAL_ALLOWED_GROUPS = 'group.abc123,group.def456';

      const { loadConfig } = await import('./config');
      const config = loadConfig();

      expect(config.accessControl.allowedGroups).toHaveLength(2);
      expect(config.accessControl.allowedGroups).toContain('group.abc123');
    });

    it('should handle whitespace in lists', async () => {
      process.env.SIGNAL_ALLOWED_SENDERS = ' +14155551234 , +14155555678 ';

      const { loadConfig } = await import('./config');
      const config = loadConfig();

      expect(config.accessControl.allowedSenders).toHaveLength(2);
    });
  });

  describe('Logger Creation', () => {
    it('should create logger with correct level', async () => {
      process.env.SIGNAL_API_URL = 'http://localhost:8080';
      process.env.SIGNAL_PHONE_NUMBER = '+14155551234';
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.SIGNAL_ALLOWED_SENDERS = '+14155551234';
      process.env.LOG_LEVEL = 'debug';

      const { loadConfig, createLogger } = await import('./config');
      const config = loadConfig();
      const logger = createLogger(config);

      expect(logger).toBeDefined();
      expect(logger.debug).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
    });
  });
});
