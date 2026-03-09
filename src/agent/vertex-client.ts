/**
 * Vertex AI (Google Cloud) LLM Client for Signal Bot
 * Implements the LLMClient interface for Vertex AI Gemini models
 */

import * as crypto from 'crypto';
import type { LLMClient, Message, ToolDefinition, LLMResponse } from './llm-client';

// ============================================================================
// Types
// ============================================================================

export interface VertexClientOptions {
  apiKey?: string;
  baseURL?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  maxRetries?: number;
  retryableStatusCodes?: number[];
  retryBaseDelay?: number;
  retryMaxDelay?: number;
}

interface GoogleContent {
  role: 'user' | 'model';
  parts: any[];
}

interface GoogleToolDefinition {
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: any;
  }>;
}

// ============================================================================
// Vertex AI Client
// ============================================================================

export class VertexClient implements LLMClient {
  private apiKey: string;
  private baseURL: string;
  private temperature: number;
  private topP: number | null;
  private maxOutputTokens: number;
  private maxRetries: number;
  private retryableStatusCodes: number[];
  private retryBaseDelay: number;
  private retryMaxDelay: number;

  constructor(options: VertexClientOptions = {}) {
    // Use GOOGLE_CLOUD_API_KEY for Vertex AI authentication
    this.apiKey = options.apiKey ?? process.env.GOOGLE_CLOUD_API_KEY ?? '';

    if (!this.apiKey) {
      throw new Error('GOOGLE_CLOUD_API_KEY is required for Vertex AI client');
    }

    // Default to Vertex AI base URL
    this.baseURL = (options.baseURL ?? 'https://aiplatform.googleapis.com/v1/publishers/google/models').replace(/\/$/, '');

    this.temperature = options.temperature ?? 0.5;
    this.topP = options.topP ?? null;
    this.maxOutputTokens = options.maxOutputTokens ?? 8096;
    this.maxRetries = options.maxRetries ?? 5;
    this.retryableStatusCodes = options.retryableStatusCodes ?? [429, 500, 502, 503, 504];
    this.retryBaseDelay = options.retryBaseDelay ?? 1.0;
    this.retryMaxDelay = options.retryMaxDelay ?? 60.0;
  }

  async createMessage(params: {
    model: string;
    max_tokens: number;
    system?: string;
    messages: Message[];
    tools?: ToolDefinition[];
  }): Promise<LLMResponse> {
    // Convert messages to Vertex AI format
    const { contents, systemInstruction } = this.serializeMessages(params.messages, params.system);

    // Build generation config
    const generationConfig: Record<string, any> = {
      temperature: this.temperature,
      maxOutputTokens: params.max_tokens,
    };

    if (this.topP !== null) {
      generationConfig.topP = this.topP;
    }

    // Build request body
    const body: Record<string, any> = {
      contents,
      generationConfig,
    };

    // Add system instruction if present
    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    // Add tools if present
    if (params.tools && params.tools.length > 0) {
      body.tools = this.serializeTools(params.tools);
      body.toolConfig = {
        functionCallingConfig: { mode: 'AUTO' },
      };
    }

    // Make request with retries
    return await this.makeRequestWithRetries(params.model, body);
  }

  /**
   * Convert our message format to Vertex AI format
   */
  private serializeMessages(
    messages: Message[],
    systemPrompt?: string
  ): { contents: GoogleContent[]; systemInstruction?: string } {
    const contents: GoogleContent[] = [];
    let systemInstruction: string | undefined = systemPrompt;

    for (const message of messages) {
      // Handle system messages
      if (message.role === 'system') {
        const text = typeof message.content === 'string'
          ? message.content
          : JSON.stringify(message.content);
        systemInstruction = text;
        continue;
      }

      // Handle user messages
      if (message.role === 'user') {
        const parts = this.serializeContent(message.content);
        if (parts.length > 0) {
          contents.push({ role: 'user', parts });
        }
        continue;
      }

      // Handle assistant messages
      if (message.role === 'assistant') {
        const parts = this.serializeContent(message.content);
        if (parts.length > 0) {
          contents.push({ role: 'model', parts });
        }
        continue;
      }
    }

    return { contents, systemInstruction };
  }

  /**
   * Convert content to Vertex AI parts format
   */
  private serializeContent(content: string | any[]): any[] {
    if (typeof content === 'string') {
      return [{ text: content }];
    }

    if (!Array.isArray(content)) {
      return [];
    }

    const parts: any[] = [];

    for (const item of content) {
      // Handle text content
      if (item.type === 'text') {
        if (item.text) {
          parts.push({ text: item.text });
        }
      }
      // Handle tool use (Anthropic format -> Vertex AI format)
      else if (item.type === 'tool_use') {
        const args = typeof item.input === 'string'
          ? this.safeParseJson(item.input)
          : item.input;
        parts.push({
          functionCall: {
            name: item.name,
            args,
          },
        });
      }
      // Handle tool result (Anthropic format -> Vertex AI format)
      else if (item.type === 'tool_result') {
        const resultData = item.is_error
          ? { error: item.content }
          : this.safeJsonOrResult(item.content);

        parts.push({
          functionResponse: {
            name: item.tool_use_id, // Use tool_use_id as name for response
            response: resultData,
          },
        });
      }
      // Handle image content
      else if (item.type === 'image_url') {
        const { mimeType, data } = this.parseDataUrl(item.image_url?.url || '');
        if (data && mimeType) {
          parts.push({ inlineData: { mimeType, data } });
        }
      }
    }

    return parts;
  }

  /**
   * Convert our tool definitions to Vertex AI format
   */
  private serializeTools(tools: ToolDefinition[]): GoogleToolDefinition[] {
    const functionDeclarations = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: this.fixGeminiSchema(tool.input_schema),
    }));

    return [{ functionDeclarations }];
  }

  /**
   * Fix schema to be compatible with Gemini/Vertex AI
   * - Remove $defs and resolve $ref
   * - Remove additionalProperties, default, and metadata title
   * - Add placeholder for empty objects
   */
  private fixGeminiSchema(schema: Record<string, any>): Record<string, any> {
    const result = JSON.parse(JSON.stringify(schema));

    // Handle $defs resolution
    if (result.$defs) {
      const defs = result.$defs;
      delete result.$defs;

      const resolveRefs = (obj: any): any => {
        if (Array.isArray(obj)) return obj.map(resolveRefs);
        if (!obj || typeof obj !== 'object') return obj;

        if (obj.$ref) {
          const refName = obj.$ref.split('/').pop();
          if (refName && defs[refName]) {
            const merged = { ...defs[refName], ...obj };
            delete merged.$ref;
            return resolveRefs(merged);
          }
        }

        const out: any = {};
        for (const [key, value] of Object.entries(obj)) {
          out[key] = resolveRefs(value);
        }
        return out;
      };

      return this.cleanSchema(resolveRefs(result));
    }

    return this.cleanSchema(result);
  }

  /**
   * Clean schema by removing unsupported fields
   */
  private cleanSchema(obj: any, parentKey?: string): any {
    if (Array.isArray(obj)) return obj.map((item) => this.cleanSchema(item, parentKey));
    if (!obj || typeof obj !== 'object') return obj;

    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const isMetadataTitle = key === 'title' && parentKey !== 'properties';
      if (key === 'additionalProperties' || key === 'default' || isMetadataTitle) {
        continue;
      }
      cleaned[key] = this.cleanSchema(value, key);
    }

    // Add placeholder for empty object properties
    if (
      typeof cleaned.type === 'string' &&
      cleaned.type.toUpperCase() === 'OBJECT' &&
      cleaned.properties &&
      typeof cleaned.properties === 'object' &&
      Object.keys(cleaned.properties).length === 0
    ) {
      cleaned.properties = { _placeholder: { type: 'string' } };
    }

    return cleaned;
  }

  /**
   * Make HTTP request with retry logic
   */
  private async makeRequestWithRetries(model: string, body: any): Promise<LLMResponse> {
    const makeRequest = async (): Promise<LLMResponse> => {
      const url = `${this.baseURL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        const error: any = new Error(text || `Vertex AI error (${response.status})`);
        error.status = response.status;
        throw error;
      }

      const data: any = await response.json();

      // Extract content, tool calls, and usage
      const content = this.extractContent(data);
      const usage = this.extractUsage(data);

      return {
        content,
        stop_reason: data?.candidates?.[0]?.finishReason ?? undefined,
        usage,
      };
    };

    // Retry loop
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await makeRequest();
      } catch (err: any) {
        const status = err?.status ?? null;
        const retryable = status && this.retryableStatusCodes.includes(status);

        if (retryable && attempt < this.maxRetries - 1) {
          const delay = Math.min(this.retryBaseDelay * 2 ** attempt, this.retryMaxDelay);
          const jitter = Math.random() * delay * 0.1;
          const totalDelay = delay + jitter;
          await new Promise((resolve) => setTimeout(resolve, totalDelay * 1000));
          continue;
        }

        throw new Error(`Vertex AI error: ${err.message}`);
      }
    }

    throw new Error('Retry loop completed without return or exception');
  }

  /**
   * Extract content from Vertex AI response and convert to our format
   */
  private extractContent(response: any): Array<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: any }> {
    const content: any[] = [];
    const parts = response?.candidates?.[0]?.content?.parts ?? [];

    for (const part of parts) {
      // Extract text content
      if (part.text) {
        content.push({
          type: 'text',
          text: part.text,
        });
      }

      // Extract function calls (tool use)
      if (part.functionCall) {
        const fc = part.functionCall;
        const toolCallId = fc.id || `call_${crypto.randomBytes(12).toString('hex')}`;

        content.push({
          type: 'tool_use',
          id: toolCallId,
          name: fc.name,
          input: fc.args || {},
        });
      }
    }

    return content;
  }

  /**
   * Extract usage information from Vertex AI response
   */
  private extractUsage(response: any): { input_tokens: number; output_tokens: number } | undefined {
    const usage = response?.usageMetadata;
    if (!usage) return undefined;

    return {
      input_tokens: usage.promptTokenCount ?? 0,
      output_tokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
    };
  }

  /**
   * Parse JSON safely
   */
  private safeParseJson(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw || '{}') as Record<string, unknown>;
    } catch {
      return { raw_arguments: raw };
    }
  }

  /**
   * Parse content to JSON or wrap in result object
   * Gemini requires response to be an object, not an array or primitive
   */
  private safeJsonOrResult(text: string): Record<string, unknown> {
    if (typeof text !== 'string') {
      return { result: text };
    }

    try {
      const parsed = JSON.parse(text);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { result: parsed };
      }
      return parsed;
    } catch {
      return { result: text };
    }
  }

  /**
   * Parse data URL for image content
   */
  private parseDataUrl(url: string): { mimeType: string | null; data: string | null } {
    if (!url.startsWith('data:')) return { mimeType: null, data: null };

    const [header, data] = url.split(',', 2);
    if (!header || !data) return { mimeType: null, data: null };

    const mimeType = header.split(';')[0].replace('data:', '');
    return { mimeType: mimeType || null, data };
  }
}
