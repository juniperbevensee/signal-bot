import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'dist/**',
        'web/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        'vitest.config.ts',
      ],
    },
  },
});
