/**
 * MCP to Signal Bot Tool Adapter
 * Converts MCP server tools to Signal bot tool format
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { z } from 'zod';
import { tool, type Tool } from '../agent/tools';
import { listMCPTools, callMCPTool } from './client';

/**
 * Convert JSON Schema to Zod schema (simplified version)
 * Full conversion would be complex - this handles common cases
 */
function jsonSchemaToZod(schema: any): z.ZodTypeAny {
  if (!schema || typeof schema !== 'object') {
    return z.any();
  }

  const { type, properties, required = [], items } = schema;

  switch (type) {
    case 'object':
      if (!properties) {
        return z.object({}).passthrough();
      }

      const shape: Record<string, z.ZodTypeAny> = {};

      for (const [key, prop] of Object.entries(properties as Record<string, any>)) {
        const propSchema = jsonSchemaToZod(prop);
        shape[key] = required.includes(key) ? propSchema : propSchema.optional();
      }

      return z.object(shape);

    case 'array':
      return z.array(items ? jsonSchemaToZod(items) : z.any());

    case 'string':
      return z.string();

    case 'number':
    case 'integer':
      return z.number();

    case 'boolean':
      return z.boolean();

    default:
      return z.any();
  }
}

/**
 * Convert MCP tools to Signal bot tools
 */
export async function convertMCPTools(client: Client): Promise<Tool[]> {
  const mcpTools = await listMCPTools(client);

  if (mcpTools.length === 0) {
    console.warn('No MCP tools found');
    return [];
  }

  console.log(`Converting ${mcpTools.length} MCP tools...`);

  return mcpTools.map((mcpTool) => {
    const zodSchema = jsonSchemaToZod(mcpTool.inputSchema);

    return tool(
      mcpTool.description || `MCP tool: ${mcpTool.name}`,
      async (input: any) => {
        try {
          const result = await callMCPTool(client, mcpTool.name, input);

          // MCP tools return { content: [...] }
          // Extract text content and return as JSON string
          if (result.content && Array.isArray(result.content)) {
            const textContent = result.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join('\n');

            return JSON.stringify({
              success: true,
              result: textContent || result.content,
            });
          }

          return JSON.stringify({
            success: true,
            result,
          });
        } catch (error) {
          return JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      {
        name: `mcp_${mcpTool.name}`,
        zodSchema: zodSchema as z.ZodObject<any>,
      }
    );
  });
}

/**
 * Create MCP tools from configuration
 * Handles multiple MCP servers
 */
export async function createMCPToolsFromConfig(
  servers: Array<{
    name: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
  }>
): Promise<Tool[]> {
  const allTools: Tool[] = [];

  for (const serverConfig of servers) {
    try {
      console.log(`Connecting to MCP server: ${serverConfig.name}...`);

      const { createMCPClient } = await import('./client');
      const client = await createMCPClient({
        command: serverConfig.command,
        args: serverConfig.args,
        env: serverConfig.env,
      });

      const tools = await convertMCPTools(client);

      console.log(`✓ Loaded ${tools.length} tools from ${serverConfig.name}`);

      allTools.push(...tools);
    } catch (error) {
      console.error(`Failed to load MCP server ${serverConfig.name}:`, error);
      console.error('Continuing without this server...');
    }
  }

  return allTools;
}
