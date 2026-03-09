/**
 * File-based persistent memory system
 * Already Loria-independent - copied from cantrip-integrations
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { tool } from './tools';

const MEMORY_FILE = 'persistent_memory.md';
const PREFERENCES_HEADER = '# Learned Preferences';
const SESSION_HEADER = '# Session Notes';

/**
 * Get the path to the persistent memory file.
 */
function getMemoryPath(workspaceDir?: string): string {
  const baseDir = workspaceDir || process.env.WORKSPACE_DIR || process.cwd();
  return path.join(baseDir, MEMORY_FILE);
}

/**
 * Get the current memory file path (for display purposes).
 */
export function getMemoryFilePath(): string {
  return getMemoryPath();
}

/**
 * Initialize the memory file if it doesn't exist.
 */
export async function initMemoryFile(workspaceDir?: string): Promise<void> {
  const memoryPath = getMemoryPath(workspaceDir);

  try {
    await fs.access(memoryPath);
  } catch {
    // File doesn't exist, create it with template
    const template = `${PREFERENCES_HEADER}
<!-- Append-only: Add new preferences below, one per line with date -->

${SESSION_HEADER}
<!-- Ephemeral: Cleared on each restart -->

`;
    await fs.mkdir(path.dirname(memoryPath), { recursive: true });
    await fs.writeFile(memoryPath, template, 'utf-8');
  }
}

/**
 * Load the persistent memory content for inclusion in system prompt.
 * Clears session notes on load (they're ephemeral).
 */
export async function loadMemoryForPrompt(workspaceDir?: string): Promise<string> {
  const memoryPath = getMemoryPath(workspaceDir);

  try {
    let content = await fs.readFile(memoryPath, 'utf-8');

    // Clear session notes (everything after SESSION_HEADER until next header or EOF)
    const sessionIndex = content.indexOf(SESSION_HEADER);
    if (sessionIndex !== -1) {
      const afterSession = content.substring(sessionIndex + SESSION_HEADER.length);
      const nextHeaderMatch = afterSession.match(/\n#[^#]/);

      if (nextHeaderMatch) {
        // There's another section after session notes
        const nextHeaderIndex = sessionIndex + SESSION_HEADER.length + nextHeaderMatch.index!;
        content =
          content.substring(0, sessionIndex) +
          `${SESSION_HEADER}\n<!-- Ephemeral: Cleared on each restart -->\n\n` +
          content.substring(nextHeaderIndex);
      } else {
        // Session notes is the last section
        content =
          content.substring(0, sessionIndex) +
          `${SESSION_HEADER}\n<!-- Ephemeral: Cleared on each restart -->\n\n`;
      }

      // Write back the cleared content
      await fs.writeFile(memoryPath, content, 'utf-8');
    }

    return content.trim();
  } catch {
    // File doesn't exist, return empty
    return '';
  }
}

/**
 * Append a learned preference to the memory file.
 * This is append-only - existing preferences cannot be modified or deleted.
 */
export async function addPreference(
  preference: string,
  workspaceDir?: string
): Promise<{ success: boolean; error?: string }> {
  const memoryPath = getMemoryPath(workspaceDir);

  try {
    let content = await fs.readFile(memoryPath, 'utf-8');

    // Validate: preference shouldn't look like an instruction/command
    const suspiciousPatterns = [
      /ignore\s+(all\s+)?(previous|prior|above)/i,
      /disregard\s+(all\s+)?(previous|prior|above)/i,
      /forget\s+(all\s+)?(previous|prior|above)/i,
      /new\s+instructions?:/i,
      /system\s*prompt/i,
      /you\s+are\s+now/i,
      /override/i,
      /jailbreak/i,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(preference)) {
        return {
          success: false,
          error: `Preference rejected: looks like an instruction override attempt`,
        };
      }
    }

    // Find the preferences section and append
    const prefsIndex = content.indexOf(PREFERENCES_HEADER);
    const sessionIndex = content.indexOf(SESSION_HEADER);

    if (prefsIndex === -1) {
      return { success: false, error: 'Preferences section not found in memory file' };
    }

    // Format the entry with timestamp
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const entry = `- ${timestamp}: ${preference}\n`;

    // Insert before session notes or at end of preferences section
    const insertIndex = sessionIndex !== -1 ? sessionIndex : content.length;

    content = content.substring(0, insertIndex) + entry + content.substring(insertIndex);

    await fs.writeFile(memoryPath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Add a session note (ephemeral - cleared on restart).
 */
export async function addSessionNote(
  note: string,
  workspaceDir?: string
): Promise<{ success: boolean; error?: string }> {
  const memoryPath = getMemoryPath(workspaceDir);

  try {
    let content = await fs.readFile(memoryPath, 'utf-8');

    const sessionIndex = content.indexOf(SESSION_HEADER);
    if (sessionIndex === -1) {
      return { success: false, error: 'Session notes section not found in memory file' };
    }

    // Format the entry with timestamp
    const timestamp = new Date().toISOString();
    const entry = `- ${timestamp}: ${note}\n`;

    // Find the next header after session notes, or end of file
    const afterSession = content.substring(sessionIndex + SESSION_HEADER.length);
    const nextHeaderMatch = afterSession.match(/\n#[^#]/);

    const insertIndex = nextHeaderMatch
      ? sessionIndex + SESSION_HEADER.length + nextHeaderMatch.index!
      : content.length;

    content = content.substring(0, insertIndex) + entry + content.substring(insertIndex);

    await fs.writeFile(memoryPath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Remove a preference by matching text.
 */
export async function removePreference(
  matchText: string,
  workspaceDir?: string
): Promise<{ success: boolean; removed: number; error?: string }> {
  const memoryPath = getMemoryPath(workspaceDir);

  try {
    let content = await fs.readFile(memoryPath, 'utf-8');

    const prefsIndex = content.indexOf(PREFERENCES_HEADER);
    const sessionIndex = content.indexOf(SESSION_HEADER);

    if (prefsIndex === -1) {
      return { success: false, removed: 0, error: 'Preferences section not found' };
    }

    // Extract preferences section
    const prefsStart = prefsIndex + PREFERENCES_HEADER.length;
    const prefsEnd = sessionIndex !== -1 ? sessionIndex : content.length;
    const prefsContent = content.substring(prefsStart, prefsEnd);

    // Filter out lines matching the text
    const lines = prefsContent.split('\n');
    const matchLower = matchText.toLowerCase();
    let removed = 0;

    const filteredLines = lines.filter((line) => {
      if (line.toLowerCase().includes(matchLower)) {
        removed++;
        return false;
      }
      return true;
    });

    if (removed === 0) {
      return { success: true, removed: 0, error: 'No matching preferences found' };
    }

    // Rebuild content
    content =
      content.substring(0, prefsStart) + filteredLines.join('\n') + content.substring(prefsEnd);

    await fs.writeFile(memoryPath, content, 'utf-8');
    return { success: true, removed };
  } catch (error) {
    return {
      success: false,
      removed: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Memory Tools
// ============================================================================

export const add_preference = tool(
  'Add a learned preference to persistent memory. Preferences persist across restarts. Use for things like formatting preferences, communication styles, or user facts.',
  async ({ preference }: { preference: string }) => {
    const result = await addPreference(preference);
    return JSON.stringify(result, null, 2);
  },
  {
    name: 'add_preference',
    zodSchema: z.object({
      preference: z
        .string()
        .describe(
          "The preference to remember (e.g., 'User prefers no markdown in Signal messages')"
        ),
    }),
  }
);

export const remove_preference = tool(
  'Remove learned preferences that match the given text. Use to correct or remove outdated preferences.',
  async ({ match_text }: { match_text: string }) => {
    const result = await removePreference(match_text);
    return JSON.stringify(result, null, 2);
  },
  {
    name: 'remove_preference',
    zodSchema: z.object({
      match_text: z
        .string()
        .describe('Text to match - all preferences containing this text will be removed'),
    }),
  }
);

export const add_session_note = tool(
  'Add a session note that persists until the next restart. Use for temporary context that shouldn\'t be permanent.',
  async ({ note }: { note: string }) => {
    const result = await addSessionNote(note);
    return JSON.stringify(result, null, 2);
  },
  {
    name: 'add_session_note',
    zodSchema: z.object({
      note: z.string().describe('The note to remember for this session'),
    }),
  }
);

export const view_memory = tool(
  'View the current persistent memory contents (preferences and session notes). Also shows the file path.',
  async () => {
    const memoryPath = getMemoryPath();
    try {
      const content = await fs.readFile(memoryPath, 'utf-8');
      return `File: ${memoryPath}\n\n${content}`;
    } catch {
      return `No persistent memory file found at: ${memoryPath}`;
    }
  },
  {
    name: 'view_memory',
    zodSchema: z.object({}),
  }
);

export const memoryTools = [add_preference, remove_preference, add_session_note, view_memory];
