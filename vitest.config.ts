import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Mitigate CI hangs due to worker/thread contention by forcing a single worker.
    // The suite is small, so the runtime impact locally is negligible while improving stability across environments.
    maxWorkers: 1,
    minWorkers: 1,
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'lcov'],
      provider: 'v8',
      all: true,
      include: ['src/markdown/renderers/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        'src/index.ts',
        'src/markdown/format.ts',
        'src/markdown/types.ts',
      ],
      thresholds: {
        lines: 95,
        statements: 95,
        branches: 70,
        functions: 95,
      },
    },
  },
});
