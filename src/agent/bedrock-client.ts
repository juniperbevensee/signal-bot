/**
 * AWS Bedrock LLM Client Implementation
 * Supports Claude models on AWS Bedrock via Converse API
 */

import type { LLMClient, Message, ToolDefinition, LLMResponse } from './llm-client';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sanitize a string to ensure it's valid for JSON serialization.
 * Removes control characters and problematic Unicode that can break JSON parsing.
 */
function sanitizeForJson(str: string): string {
  if (!str) return str;
  return str
    // Remove control characters except \t, \n, \r (which are valid in JSON strings)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    // Remove lone surrogates (invalid UTF-16)
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    // Remove other problematic Unicode (BOM, etc)
    .replace(/[\uFEFF\uFFFE\uFFFF]/g, '');
}

// ============================================================================
// Bedrock Client
// ============================================================================

export interface BedrockClientOptions {
  bearerToken: string;
  region: string;
  model: string;
  maxRetries?: number;
}

export class BedrockClient implements LLMClient {
  private bearerToken: string;
  private region: string;
  private baseURL: string;
  private defaultModel: string;
  private maxRetries: number;

  constructor(options: BedrockClientOptions) {
    this.bearerToken = options.bearerToken;
    this.region = options.region;
    this.baseURL = `https://bedrock-runtime.${this.region}.amazonaws.com`;
    this.defaultModel = options.model;
    this.maxRetries = options.maxRetries ?? 3;
  }

  /**
   * Extract model ID from ARN or return as-is
   * ARN format: arn:aws:bedrock:region:account:inference-profile/model-id
   */
  private extractModelId(model: string): string {
    if (model.startsWith('arn:')) {
      const parts = model.split('/');
      return parts[parts.length - 1];
    }
    return model;
  }

  /**
   * Serialize messages to Bedrock Converse API format
   * Handles grouping of consecutive tool results into single user messages
   */
  private serializeMessages(messages: Message[]): any[] {
    const result: any[] = [];
    const toolCallIds = new Set<string>();
    const toolResultIds = new Set<string>();

    let i = 0;
    while (i < messages.length) {
      const msg = messages[i];

      // Skip system messages (handled separately)
      if (msg.role === 'system') {
        i++;
        continue;
      }

      // Handle consecutive tool results - group into ONE user message
      if (Array.isArray(msg.content)) {
        const toolResults = msg.content.filter((block: any) => block.type === 'tool_result');

        if (toolResults.length > 0) {
          const content: any[] = [];

          for (const toolResult of toolResults) {
            toolResultIds.add(toolResult.tool_use_id);

            let toolResultContent;
            if (toolResult.is_error) {
              toolResultContent = [{ text: sanitizeForJson(toolResult.content || 'Error') }];
            } else {
              const sanitizedContent = sanitizeForJson(toolResult.content || '');

              // Try to parse as JSON
              try {
                const parsed = JSON.parse(sanitizedContent || '{}');
                // Bedrock requires plain object, not arrays or primitives
                if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                  toolResultContent = [{ json: parsed }];
                } else {
                  toolResultContent = [{ text: sanitizedContent }];
                }
              } catch {
                toolResultContent = [{ text: sanitizedContent }];
              }
            }

            const bedrockToolResult: any = {
              toolUseId: toolResult.tool_use_id,
              content: toolResultContent,
            };

            if (toolResult.is_error) {
              bedrockToolResult.status = 'error';
            }

            content.push({ toolResult: bedrockToolResult });
          }

          result.push({
            role: 'user',
            content,
          });
          i++;
          continue;
        }
      }

      // Build content array
      const content: any[] = [];

      // Handle string content
      if (typeof msg.content === 'string') {
        content.push({ text: sanitizeForJson(msg.content) });
      }
      // Handle array content (text and tool_use blocks)
      else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            content.push({ text: sanitizeForJson(block.text) });
          } else if (block.type === 'tool_use') {
            toolCallIds.add(block.id);
            content.push({
              toolUse: {
                toolUseId: block.id,
                name: block.name,
                input: block.input,
              },
            });
          }
        }
      }

      // Skip empty messages
      if (content.length === 0) {
        i++;
        continue;
      }

      result.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content,
      });
      i++;
    }

    // Validate: Check if all tool calls have matching results
    const missingResults = Array.from(toolCallIds).filter((id) => !toolResultIds.has(id));
    if (missingResults.length > 0) {
      console.error('Bedrock serialization error: Missing tool results');
      console.error(`  Tool calls: ${Array.from(toolCallIds).join(', ')}`);
      console.error(`  Tool results: ${Array.from(toolResultIds).join(', ')}`);
      console.error(`  Missing: ${missingResults.join(', ')}`);
      throw new Error(`Missing tool results for IDs: ${missingResults.join(', ')}`);
    }

    return result;
  }

  /**
   * Extract system messages for Bedrock format
   */
  private extractSystemMessage(messages: Message[]): any[] | undefined {
    const systemMsgs = messages.filter((m) => m.role === 'system');
    if (systemMsgs.length === 0) return undefined;

    return systemMsgs.map((m) => ({
      text: sanitizeForJson(typeof m.content === 'string' ? m.content : ''),
    }));
  }

  /**
   * Convert tools to Bedrock format
   */
  private serializeTools(tools: ToolDefinition[]): any[] {
    return tools.map((tool) => ({
      toolSpec: {
        name: tool.name,
        description: tool.description,
        inputSchema: {
          json: tool.input_schema,
        },
      },
    }));
  }

  /**
   * Make API request with retries
   */
  private async makeRequest(url: string, body: any, retryCount = 0): Promise<any> {
    try {
      // Serialize body with error handling
      let bodyJson: string;
      try {
        bodyJson = JSON.stringify(body);
      } catch (jsonError) {
        console.error('Failed to serialize request body to JSON:', jsonError);
        console.error('Body structure:', JSON.stringify(Object.keys(body)));
        throw jsonError;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.bearerToken}`,
        },
        body: bodyJson,
      });

      if (!response.ok) {
        const text = await response.text();

        // Handle rate limiting with exponential backoff
        if (response.status === 429 && retryCount < this.maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
          console.warn(`Rate limited by Bedrock. Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.makeRequest(url, body, retryCount + 1);
        }

        // Handle other retryable errors
        if (
          response.status >= 500 &&
          response.status < 600 &&
          retryCount < this.maxRetries
        ) {
          const delay = Math.pow(2, retryCount) * 1000;
          console.warn(`Server error (${response.status}). Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.makeRequest(url, body, retryCount + 1);
        }

        // Log JSON validation errors
        if (text.includes('not valid JSON')) {
          console.error('Bedrock rejected JSON. Body size:', bodyJson.length, 'chars');
          console.error('Message count:', body.messages?.length || 0);

          if (process.env.DEBUG_BEDROCK === '1') {
            const fs = require('fs');
            const dumpPath = `/tmp/bedrock-debug-${Date.now()}.json`;
            fs.writeFileSync(dumpPath, bodyJson);
            console.error(`Body dumped to: ${dumpPath}`);
          }
        }

        throw new Error(
          `Bedrock API error (${response.status}): ${text || 'Unknown error'}`
        );
      }

      return await response.json();
    } catch (error) {
      // Retry on network errors
      if (retryCount < this.maxRetries && error instanceof Error) {
        if (
          error.message.includes('fetch failed') ||
          error.message.includes('ECONNRESET') ||
          error.message.includes('ETIMEDOUT')
        ) {
          const delay = Math.pow(2, retryCount) * 1000;
          console.warn(`Network error: ${error.message}. Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.makeRequest(url, body, retryCount + 1);
        }
      }
      throw error;
    }
  }

  /**
   * Create a message using Bedrock Converse API
   */
  async createMessage(params: {
    model: string;
    max_tokens: number;
    system?: string;
    messages: Message[];
    tools?: ToolDefinition[];
  }): Promise<LLMResponse> {
    const model = params.model || this.defaultModel;
    const modelId = this.extractModelId(model);

    // Build system messages
    const systemMessages: any[] | undefined = params.system
      ? [{ text: sanitizeForJson(params.system) }]
      : this.extractSystemMessage(params.messages);

    // Serialize messages
    const serializedMessages = this.serializeMessages(params.messages);

    // Build request body
    const body: Record<string, unknown> = {
      messages: serializedMessages,
      inferenceConfig: {
        maxTokens: params.max_tokens,
      },
    };

    if (systemMessages) {
      body.system = systemMessages;
    }

    if (params.tools && params.tools.length > 0) {
      body.toolConfig = {
        tools: this.serializeTools(params.tools),
        toolChoice: { auto: {} }, // Always use auto for tool choice
      };
    }

    // Make request
    const url = `${this.baseURL}/model/${encodeURIComponent(modelId)}/converse`;
    const data = await this.makeRequest(url, body);

    // Extract response
    const content = data?.output?.message?.content ?? [];
    const responseBlocks: any[] = [];
    let hasToolUse = false;

    for (const block of content) {
      if (block.text) {
        responseBlocks.push({
          type: 'text',
          text: block.text,
        });
      } else if (block.toolUse) {
        hasToolUse = true;
        responseBlocks.push({
          type: 'tool_use',
          id: block.toolUse.toolUseId,
          name: block.toolUse.name,
          input: block.toolUse.input || {},
        });
      }
    }

    // Extract usage
    const usage = data?.usage
      ? {
          input_tokens: data.usage.inputTokens ?? 0,
          output_tokens: data.usage.outputTokens ?? 0,
        }
      : undefined;

    return {
      content: responseBlocks,
      stop_reason: data?.stopReason ?? undefined,
      usage,
    };
  }
}
