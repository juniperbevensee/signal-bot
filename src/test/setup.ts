/**
 * Test setup file
 * Runs before all tests
 */

import { beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  // Setup before all tests
  console.log('Setting up tests...');
});

afterAll(() => {
  // Cleanup after all tests
  console.log('Cleaning up tests...');
});
