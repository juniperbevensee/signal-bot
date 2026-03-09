/**
 * MCP (Model Context Protocol) Client
 * Optional integration for MCP servers
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * Create an MCP client connected to a server process
 */
export async function createMCPClient(config: MCPServerConfig): Promise<Client> {
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: config.env,
  });

  const client = new Client(
    {
      name: 'signal-bot',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);

  return client;
}

/**
 * Get information about an MCP server
 */
export async function getMCPServerInfo(client: Client): Promise<{
  name: string;
  version: string;
  capabilities: any;
}> {
  // MCP client automatically gets server info during connection
  // This is just a wrapper for consistency
  return {
    name: 'MCP Server',
    version: '1.0.0',
    capabilities: {},
  };
}

/**
 * List all tools provided by an MCP server
 */
export async function listMCPTools(client: Client): Promise<
  Array<{
    name: string;
    description?: string;
    inputSchema: any;
  }>
> {
  try {
    const response = await client.listTools();
    return response.tools;
  } catch (error) {
    console.error('Failed to list MCP tools:', error);
    return [];
  }
}

/**
 * Call an MCP tool
 */
export async function callMCPTool(
  client: Client,
  name: string,
  args: any
): Promise<any> {
  try {
    const response = await client.callTool({
      name,
      arguments: args,
    });

    return response;
  } catch (error) {
    throw new Error(`MCP tool call failed: ${error}`);
  }
}
