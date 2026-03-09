/**
 * Simplified Agent Service for Signal Bot
 * Supports multiple LLM providers via abstraction
 */

import type { LLMClient, Message } from './llm-client';
import type { Tool } from './tools';
import {
  TextEvent,
  ThinkingEvent,
  ToolCallEvent,
  ToolResultEvent,
  FinalResponseEvent,
  StepStartEvent,
  StepCompleteEvent,
  type AgentEvent,
} from './events';

// ============================================================================
// Types
// ============================================================================

export interface AgentOptions {
  llmClient: LLMClient;
  model: string;
  systemPrompt?: string;
  tools?: Tool[];
  maxIterations?: number;
  maxTokens?: number;
}

// ============================================================================
// Agent Class
// ============================================================================

export class Agent {
  private client: LLMClient;
  private model: string;
  private systemPrompt: string | undefined;
  private tools: Tool[];
  private toolMap: Map<string, Tool>;
  private maxIterations: number;
  private maxTokens: number;
  private messages: Message[] = [];

  constructor(options: AgentOptions) {
    this.client = options.llmClient;
    this.model = options.model;
    this.systemPrompt = options.systemPrompt;
    this.tools = options.tools || [];
    this.maxIterations = options.maxIterations || 50;
    this.maxTokens = options.maxTokens || 4096;

    // Build tool map for fast lookups
    this.toolMap = new Map();
    for (const tool of this.tools) {
      this.toolMap.set(tool.definition.name, tool);
    }
  }

  /**
   * Get conversation history
   */
  get history(): Message[] {
    return [...this.messages];
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.messages = [];
  }

  /**
   * Load conversation history
   */
  loadHistory(messages: Message[]): void {
    this.messages = [...messages];
  }

  /**
   * Query the agent and get a final response (non-streaming)
   */
  async query(userMessage: string): Promise<string> {
    // Add user message to history
    this.messages.push({
      role: 'user',
      content: userMessage,
    });

    let iterations = 0;

    while (iterations < this.maxIterations) {
      iterations++;

      // Call LLM API
      const response = await this.client.createMessage({
        model: this.model,
        max_tokens: this.maxTokens,
        system: this.systemPrompt,
        messages: this.messages,
        tools: this.tools.map((t) => t.definition),
      });

      // Add assistant message to history
      this.messages.push({
        role: 'assistant',
        content: response.content,
      });

      // Check if there are tool calls
      const toolCalls = response.content.filter((block) => block.type === 'tool_use');

      if (toolCalls.length === 0) {
        // No tool calls, extract text and return
        const textBlocks = response.content.filter((block) => block.type === 'text');
        const finalText = textBlocks.map((block) => (block as any).text).join('\n');
        return finalText;
      }

      // Execute tool calls
      const toolResults: any[] = [];

      for (const toolCall of toolCalls) {
        const toolUse = toolCall as any;
        const tool = this.toolMap.get(toolUse.name);

        if (!tool) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Error: Tool '${toolUse.name}' not found`,
            is_error: true,
          });
          continue;
        }

        try {
          const result = await tool.execute(toolUse.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result,
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Error executing tool: ${errorMsg}`,
            is_error: true,
          });
        }
      }

      // Add tool results to history
      this.messages.push({
        role: 'user',
        content: toolResults,
      });
    }

    // Max iterations reached
    return `Max iterations (${this.maxIterations}) reached. The task may be incomplete.`;
  }

  /**
   * Query the agent with streaming events
   */
  async *queryStream(userMessage: string): AsyncGenerator<AgentEvent> {
    // Add user message to history
    this.messages.push({
      role: 'user',
      content: userMessage,
    });

    let iterations = 0;

    while (iterations < this.maxIterations) {
      iterations++;

      // Call LLM API
      const response = await this.client.createMessage({
        model: this.model,
        max_tokens: this.maxTokens,
        system: this.systemPrompt,
        messages: this.messages,
        tools: this.tools.map((t) => t.definition),
      });

      // Add assistant message to history
      this.messages.push({
        role: 'assistant',
        content: response.content,
      });

      // Process response content
      const textBlocks: string[] = [];
      const toolCalls: any[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          textBlocks.push(block.text);
          yield new TextEvent(block.text);
        } else if (block.type === 'tool_use') {
          toolCalls.push(block);
        }
      }

      // If no tool calls, we're done
      if (toolCalls.length === 0) {
        const finalText = textBlocks.join('\n');
        yield new FinalResponseEvent(finalText);
        return;
      }

      // Execute tool calls
      const toolResults: any[] = [];
      let stepNumber = 0;

      for (const toolUse of toolCalls) {
        stepNumber++;
        const tool = this.toolMap.get(toolUse.name);

        yield new StepStartEvent(toolUse.id, toolUse.name, stepNumber);
        yield new ToolCallEvent(toolUse.name, toolUse.input as any, toolUse.id, toolUse.name);

        const startTime = Date.now();

        if (!tool) {
          const errorMsg = `Tool '${toolUse.name}' not found`;
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: errorMsg,
            is_error: true,
          });
          yield new ToolResultEvent(toolUse.name, errorMsg, toolUse.id, true);
          yield new StepCompleteEvent(toolUse.id, 'error', Date.now() - startTime);
          continue;
        }

        try {
          const result = await tool.execute(toolUse.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result,
          });
          yield new ToolResultEvent(toolUse.name, result, toolUse.id, false);
          yield new StepCompleteEvent(toolUse.id, 'completed', Date.now() - startTime);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Error executing tool: ${errorMsg}`,
            is_error: true,
          });
          yield new ToolResultEvent(toolUse.name, errorMsg, toolUse.id, true);
          yield new StepCompleteEvent(toolUse.id, 'error', Date.now() - startTime);
        }
      }

      // Add tool results to history
      this.messages.push({
        role: 'user',
        content: toolResults,
      });
    }

    // Max iterations reached
    const errorMsg = `Max iterations (${this.maxIterations}) reached. The task may be incomplete.`;
    yield new FinalResponseEvent(errorMsg);
  }
}
