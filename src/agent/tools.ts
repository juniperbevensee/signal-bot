/**
 * Simple tool system for Signal Bot
 * Provides a decorator pattern for creating Claude-compatible tools
 */

import { z } from 'zod';

// ============================================================================
// Tool Types
// ============================================================================

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface Tool {
  definition: ToolDefinition;
  execute: (args: any) => Promise<string>;
}

// ============================================================================
// Tool Decorator
// ============================================================================

/**
 * Create a tool from a Zod schema and handler function
 */
export function tool<T extends z.ZodType>(
  description: string,
  handler: (args: z.infer<T>) => Promise<string>,
  options: {
    name: string;
    zodSchema: T;
  }
): Tool {
  // Convert Zod schema to Claude's input_schema format
  const zodShape = (options.zodSchema as any)._def;
  const properties: Record<string, any> = {};
  const required: string[] = [];

  if (zodShape.typeName === 'ZodObject') {
    const shape = zodShape.shape();
    for (const [key, value] of Object.entries(shape)) {
      const zodField = value as z.ZodType;
      properties[key] = zodToJsonSchema(zodField);

      // Check if field is required (not optional)
      if (!(zodField as any).isOptional?.()) {
        required.push(key);
      }
    }
  }

  return {
    definition: {
      name: options.name,
      description,
      input_schema: {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      },
    },
    execute: async (args: any) => {
      // Validate args with Zod
      const parsed = options.zodSchema.parse(args);
      return await handler(parsed);
    },
  };
}

/**
 * Convert Zod schema to JSON Schema (simplified version)
 */
function zodToJsonSchema(zodType: z.ZodType): any {
  const def = (zodType as any)._def;

  switch (def.typeName) {
    case 'ZodString':
      return {
        type: 'string',
        description: def.description || undefined,
      };
    case 'ZodNumber':
      return {
        type: 'number',
        description: def.description || undefined,
      };
    case 'ZodBoolean':
      return {
        type: 'boolean',
        description: def.description || undefined,
      };
    case 'ZodArray':
      return {
        type: 'array',
        items: zodToJsonSchema(def.type),
        description: def.description || undefined,
      };
    case 'ZodObject':
      const properties: Record<string, any> = {};
      const required: string[] = [];
      const shape = def.shape();
      for (const [key, value] of Object.entries(shape)) {
        const zodField = value as z.ZodType;
        properties[key] = zodToJsonSchema(zodField);
        if (!(zodField as any).isOptional?.()) {
          required.push(key);
        }
      }
      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
        description: def.description || undefined,
      };
    case 'ZodOptional':
      return zodToJsonSchema(def.innerType);
    case 'ZodNullable':
      return zodToJsonSchema(def.innerType);
    case 'ZodEnum':
      return {
        type: 'string',
        enum: def.values,
        description: def.description || undefined,
      };
    default:
      return { type: 'string' }; // Fallback
  }
}
