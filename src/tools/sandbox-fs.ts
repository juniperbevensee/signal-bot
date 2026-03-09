/**
 * Sandboxed Filesystem Tools
 * Provides safe file operations within a designated sandbox directory
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { tool, Tool } from '../agent/tools';

// ============================================================================
// Sandbox Security
// ============================================================================

function ensureSandboxPath(sandboxDir: string, filePath: string): string {
  const resolvedSandbox = path.resolve(sandboxDir);
  const resolvedPath = path.resolve(sandboxDir, filePath);

  // Prevent path traversal attacks
  if (!resolvedPath.startsWith(resolvedSandbox)) {
    throw new Error(`Access denied: Path must be within sandbox directory`);
  }

  return resolvedPath;
}

// ============================================================================
// Tools Factory
// ============================================================================

export function createSandboxTools(sandboxDir: string): Tool[] {
  // Ensure sandbox directory exists
  if (!fs.existsSync(sandboxDir)) {
    fs.mkdirSync(sandboxDir, { recursive: true });
  }

  const tools: Tool[] = [];

  // Read File
  tools.push(
    tool(
      'Read a file from the sandbox directory. Returns the file contents.',
      async (args) => {
        const fullPath = ensureSandboxPath(sandboxDir, args.path);

        if (!fs.existsSync(fullPath)) {
          return `Error: File not found: ${args.path}`;
        }

        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          return `Error: Path is a directory, not a file: ${args.path}`;
        }

        const content = fs.readFileSync(fullPath, 'utf-8');
        return content;
      },
      {
        name: 'sandbox_read_file',
        zodSchema: z.object({
          path: z.string().describe('Path to file within sandbox (relative to sandbox root)'),
        }),
      }
    )
  );

  // Write File
  tools.push(
    tool(
      'Write content to a file in the sandbox directory. Creates parent directories if needed.',
      async (args) => {
        const fullPath = ensureSandboxPath(sandboxDir, args.path);
        const dir = path.dirname(fullPath);

        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(fullPath, args.content, 'utf-8');
        return `Successfully wrote ${args.content.length} characters to ${args.path}`;
      },
      {
        name: 'sandbox_write_file',
        zodSchema: z.object({
          path: z.string().describe('Path to file within sandbox (relative to sandbox root)'),
          content: z.string().describe('Content to write to the file'),
        }),
      }
    )
  );

  // List Directory
  tools.push(
    tool(
      'List files and directories in a sandbox path.',
      async (args) => {
        const fullPath = ensureSandboxPath(sandboxDir, args.path || '.');

        if (!fs.existsSync(fullPath)) {
          return `Error: Directory not found: ${args.path || '.'}`;
        }

        const stats = fs.statSync(fullPath);
        if (!stats.isDirectory()) {
          return `Error: Path is a file, not a directory: ${args.path}`;
        }

        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        const listing = entries.map((entry) => {
          const type = entry.isDirectory() ? 'd' : 'f';
          return `[${type}] ${entry.name}`;
        });

        return listing.length > 0 ? listing.join('\n') : '(empty directory)';
      },
      {
        name: 'sandbox_list_dir',
        zodSchema: z.object({
          path: z.string().optional().describe('Path to list (relative to sandbox root, defaults to root)'),
        }),
      }
    )
  );

  // Delete File
  tools.push(
    tool(
      'Delete a file from the sandbox directory.',
      async (args) => {
        const fullPath = ensureSandboxPath(sandboxDir, args.path);

        if (!fs.existsSync(fullPath)) {
          return `Error: File not found: ${args.path}`;
        }

        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          return `Error: Cannot delete directory with this tool. Path is a directory: ${args.path}`;
        }

        fs.unlinkSync(fullPath);
        return `Successfully deleted ${args.path}`;
      },
      {
        name: 'sandbox_delete_file',
        zodSchema: z.object({
          path: z.string().describe('Path to file to delete (relative to sandbox root)'),
        }),
      }
    )
  );

  // File Info
  tools.push(
    tool(
      'Get information about a file or directory in the sandbox.',
      async (args) => {
        const fullPath = ensureSandboxPath(sandboxDir, args.path);

        if (!fs.existsSync(fullPath)) {
          return `Error: Path not found: ${args.path}`;
        }

        const stats = fs.statSync(fullPath);
        const info = {
          path: args.path,
          type: stats.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          modified: stats.mtime.toISOString(),
          created: stats.birthtime.toISOString(),
        };

        return JSON.stringify(info, null, 2);
      },
      {
        name: 'sandbox_file_info',
        zodSchema: z.object({
          path: z.string().describe('Path to file or directory (relative to sandbox root)'),
        }),
      }
    )
  );

  return tools;
}
