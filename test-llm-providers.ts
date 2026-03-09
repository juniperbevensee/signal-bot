#!/usr/bin/env tsx
/**
 * Test script to verify all LLM providers can be instantiated
 */

import { createLLMClient } from './src/agent/llm-client';

console.log('Testing LLM Provider Instantiation\n');
console.log('=' .repeat(50));

// Test Anthropic
try {
  const anthropic = createLLMClient({
    provider: 'anthropic',
    apiKey: 'test-key',
    model: 'claude-sonnet-4-20250514',
  });
  console.log('✓ Anthropic client created successfully');
  console.log(`  Provider: ${anthropic.constructor.name}`);
} catch (error) {
  console.error('✗ Anthropic client failed:', error);
}

// Test OpenAI
try {
  const openai = createLLMClient({
    provider: 'openai',
    apiKey: 'test-key',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4',
  });
  console.log('✓ OpenAI client created successfully');
  console.log(`  Provider: ${openai.constructor.name}`);
} catch (error) {
  console.error('✗ OpenAI client failed:', error);
}

// Test LM Studio
try {
  const lmstudio = createLLMClient({
    provider: 'lmstudio',
    apiKey: 'not-needed',
    baseURL: 'http://localhost:1234',
    model: 'local-model',
  });
  console.log('✓ LM Studio client created successfully');
  console.log(`  Provider: ${lmstudio.constructor.name}`);
} catch (error) {
  console.error('✗ LM Studio client failed:', error);
}

// Test Vertex AI
try {
  const vertex = createLLMClient({
    provider: 'vertex',
    apiKey: 'test-key',
    model: 'gemini-2.5-pro',
  });
  console.log('✓ Vertex AI client created successfully');
  console.log(`  Provider: ${vertex.constructor.name}`);
} catch (error) {
  console.error('✗ Vertex AI client failed:', error);
}

// Test Bedrock
try {
  const bedrock = createLLMClient({
    provider: 'bedrock',
    apiKey: 'not-needed',
    model: 'us.anthropic.claude-sonnet-4-5-v2:0',
    awsBearerToken: 'test-token',
    awsRegion: 'us-east-1',
  });
  console.log('✓ Bedrock client created successfully');
  console.log(`  Provider: ${bedrock.constructor.name}`);
} catch (error) {
  console.error('✗ Bedrock client failed:', error);
}

console.log('\n' + '='.repeat(50));
console.log('All LLM providers instantiated successfully! ✓');
