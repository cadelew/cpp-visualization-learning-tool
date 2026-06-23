import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@shared': '/src/types',
      '@llm': '/src/llm',
    },
  },
});
