/**
 * Security utilities for Signal Bot
 */

import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// Path Validation
// ============================================================================

/**
 * Validate that a file path is within the allowed workspace directory
 * Prevents path traversal attacks
 */
export function validateFilePath(filePath: string, workspaceDir: string): string {
  if (!workspaceDir) {
    throw new Error('Workspace directory not configured. Set WORKSPACE_DIR to enable file operations.');
  }

  // Resolve to absolute paths
  const normalized = path.resolve(filePath);
  const workspace = path.resolve(workspaceDir);

  // Check if the normalized path is within workspace
  if (!normalized.startsWith(workspace + path.sep) && normalized !== workspace) {
    throw new Error(
      `Security: File access denied. Path "${filePath}" is outside the allowed workspace directory.`
    );
  }

  // Additional check: ensure the file exists or its parent directory exists
  const fileExists = fs.existsSync(normalized);
  const parentExists = fs.existsSync(path.dirname(normalized));

  if (!fileExists && !parentExists) {
    throw new Error(`File path does not exist: ${filePath}`);
  }

  return normalized;
}

/**
 * Validate file extension against allowlist
 */
export function validateFileExtension(filePath: string, allowedExtensions: string[]): void {
  const ext = path.extname(filePath).toLowerCase();

  if (!allowedExtensions.includes(ext)) {
    throw new Error(
      `File type ${ext} not allowed. Allowed types: ${allowedExtensions.join(', ')}`
    );
  }
}

/**
 * Dangerous file extensions that should never be executed
 */
export const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif',
  '.sh', '.bash', '.zsh', '.ps1', '.vbs', '.js', '.jar',
  '.app', '.dmg', '.pkg', '.deb', '.rpm',
]);

/**
 * Check if file extension is dangerous
 */
export function isDangerousExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return DANGEROUS_EXTENSIONS.has(ext);
}

// ============================================================================
// Rate Limiting
// ============================================================================

export interface RateLimitConfig {
  maxPerMinute: number;
  maxPerHour: number;
  windowMs: number;
}

export class RateLimiter {
  private userCounts = new Map<string, { count: number; resetTime: number; hourlyCount: number; hourlyResetTime: number }>();
  private warningsSent = new Map<string, number>();
  private readonly config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      maxPerMinute: config?.maxPerMinute || 10,
      maxPerHour: config?.maxPerHour || 100,
      windowMs: config?.windowMs || 60000, // 1 minute
    };
  }

  /**
   * Check if a user is within rate limits
   * Returns true if allowed, false if rate limited
   */
  check(userId: string): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const record = this.userCounts.get(userId);

    // Initialize or reset if window expired
    if (!record || now > record.resetTime) {
      // Check if we need to reset hourly count
      const newHourlyCount = record && now < record.hourlyResetTime
        ? record.hourlyCount + 1
        : 1;
      const newHourlyResetTime = record && now < record.hourlyResetTime
        ? record.hourlyResetTime
        : now + 3600000; // 1 hour

      this.userCounts.set(userId, {
        count: 1,
        resetTime: now + this.config.windowMs,
        hourlyCount: newHourlyCount,
        hourlyResetTime: newHourlyResetTime,
      });

      // Check hourly limit
      if (newHourlyCount > this.config.maxPerHour) {
        return { allowed: false, reason: 'hourly_limit' };
      }

      return { allowed: true };
    }

    // Check per-minute limit
    if (record.count >= this.config.maxPerMinute) {
      return { allowed: false, reason: 'minute_limit' };
    }

    // Check hourly limit
    if (record.hourlyCount >= this.config.maxPerHour) {
      return { allowed: false, reason: 'hourly_limit' };
    }

    // Increment counters
    record.count++;
    record.hourlyCount++;

    return { allowed: true };
  }

  /**
   * Check if we should send a rate limit warning to this user
   * Prevents spamming users with warnings
   */
  shouldSendWarning(userId: string): boolean {
    const now = Date.now();
    const lastWarning = this.warningsSent.get(userId);

    // Only send warning once per minute
    if (!lastWarning || now - lastWarning > 60000) {
      this.warningsSent.set(userId, now);
      return true;
    }

    return false;
  }

  /**
   * Get remaining quota for a user (for informational purposes)
   */
  getRemainingQuota(userId: string): { perMinute: number; perHour: number } {
    const record = this.userCounts.get(userId);
    const now = Date.now();

    if (!record || now > record.resetTime) {
      return {
        perMinute: this.config.maxPerMinute,
        perHour: this.config.maxPerHour,
      };
    }

    return {
      perMinute: Math.max(0, this.config.maxPerMinute - record.count),
      perHour: Math.max(0, this.config.maxPerHour - record.hourlyCount),
    };
  }

  /**
   * Clear all rate limit data (for testing)
   */
  clear(): void {
    this.userCounts.clear();
    this.warningsSent.clear();
  }
}

// ============================================================================
// Input Sanitization
// ============================================================================

/**
 * Sanitize text for inclusion in prompts to prevent injection
 */
export function sanitizeForPrompt(text: string): string {
  return text
    // Remove control characters (except tab, newline, carriage return)
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '')
    // Remove common injection markers
    .replace(/\[SYSTEM\]|\[INST\]|\[\/INST\]/gi, '')
    // Limit consecutive newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Validate message content
 */
export function validateMessageContent(
  content: string,
  maxLength: number = 10000
): { valid: boolean; error?: string } {
  if (content.length === 0) {
    return { valid: false, error: 'Message is empty' };
  }

  if (content.length > maxLength) {
    return { valid: false, error: `Message too long (${content.length} chars, max ${maxLength})` };
  }

  return { valid: true };
}

/**
 * Escape LIKE pattern wildcards for SQL
 */
export function escapeLikePattern(pattern: string): string {
  return pattern
    .replace(/\\/g, '\\\\')  // Escape backslash
    .replace(/%/g, '\\%')    // Escape %
    .replace(/_/g, '\\_');   // Escape _
}
