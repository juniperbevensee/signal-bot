/**
 * LLM Client abstraction supporting both Anthropic and OpenAI-compatible APIs
 * Enables use of LM Studio for local models
 */

import Anthropic from '@anthropic-ai/sdk';
import { VertexClient } from './vertex-client';
import { BedrockClient } from './bedrock-client';

// ============================================================================
// Types
// ============================================================================

export type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string | any[];
};

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
};

export type ToolCall = {
  id: string;
  type: 'tool_use';
  name: string;
  input: any;
};

export type LLMResponse = {
  content: Array<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: any }>;
  stop_reason?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
};

export interface LLMClient {
  createMessage(params: {
    model: string;
    max_tokens: number;
    system?: string;
    messages: Message[];
    tools?: ToolDefinition[];
  }): Promise<LLMResponse>;
}

// ============================================================================
// Anthropic Client
// ============================================================================

export class AnthropicClient implements LLMClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async createMessage(params: {
    model: string;
    max_tokens: number;
    system?: string;
    messages: Message[];
    tools?: ToolDefinition[];
  }): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: params.model,
      max_tokens: params.max_tokens,
      system: params.system,
      messages: params.messages as Anthropic.MessageParam[],
      tools: params.tools as Anthropic.Tool[],
    });

    return {
      content: response.content as any,
      stop_reason: response.stop_reason as any,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };
  }
}

// ============================================================================
// OpenAI-Compatible Client (for LM Studio, etc.)
// ============================================================================

export class OpenAICompatibleClient implements LLMClient {
  private baseURL: string;
  private apiKey: string;

  constructor(baseURL: string, apiKey: string = 'not-needed') {
    this.baseURL = baseURL.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  async createMessage(params: {
    model: string;
    max_tokens: number;
    system?: string;
    messages: Message[];
    tools?: ToolDefinition[];
  }): Promise<LLMResponse> {
    // Convert messages to OpenAI format
    const openaiMessages: any[] = [];

    if (params.system) {
      openaiMessages.push({
        role: 'system',
        content: params.system,
      });
    }

    for (const msg of params.messages) {
      openaiMessages.push({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      });
    }

    // Convert tools to OpenAI format
    const tools = params.tools?.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }));

    // Make request to OpenAI-compatible API
    const requestBody: any = {
      model: params.model,
      messages: openaiMessages,
      max_tokens: params.max_tokens,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }

    const response = await fetch(`${this.baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${text}`);
    }

    const data: any = await response.json();
    const choice = data.choices[0];

    // Convert OpenAI response to our format
    const content: any[] = [];

    if (choice.message.content) {
      content.push({
        type: 'text',
        text: choice.message.content,
      });
    }

    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments),
        });
      }
    }

    return {
      content,
      stop_reason: choice.finish_reason,
      usage: data.usage ? {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens,
      } : undefined,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================
// Note: VertexClient and BedrockClient are dynamically loaded in the factory
// to avoid import issues when they're not needed

export function createLLMClient(config: {
  provider: 'anthropic' | 'openai' | 'lmstudio' | 'vertex' | 'bedrock';
  apiKey: string;
  baseURL?: string;
  awsBearerToken?: string;
  awsRegion?: string;
  model?: string;
}): LLMClient {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicClient(config.apiKey);
    case 'openai':
    case 'lmstudio':
      if (!config.baseURL) {
        throw new Error(`baseURL required for ${config.provider} provider`);
      }
      return new OpenAICompatibleClient(config.baseURL, config.apiKey);
    case 'vertex':
      return new VertexClient({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      });
    case 'bedrock': {
      if (!config.awsBearerToken) {
        throw new Error('awsBearerToken required for bedrock provider');
      }
      if (!config.model) {
        throw new Error('model required for bedrock provider');
      }
      return new BedrockClient({
        bearerToken: config.awsBearerToken,
        region: config.awsRegion || 'us-east-1',
        model: config.model,
      });
    }
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
