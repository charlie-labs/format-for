import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    environment: 'node',
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json'],
      all: true,
      include: [
        'src/markdown/renderers/**/*.ts',
        'src/markdown/plugins/**/*.ts',
      ],
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        'src/index.test.ts',
        'src/markdown/types.ts',
        'src/markdown/utils/**/*.ts',
      ],
      thresholds: {
        statements: 90,
        branches: 65,
        functions: 95,
        lines: 90,
      },
    },
  },
});
