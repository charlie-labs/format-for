// @ts-check
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'c8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/markdown/renderers/**/*.ts',
        'src/markdown/plugins/**/*.ts',
        'src/markdown/utils/transformOutsideCode.ts',
        'src/markdown/utils/slackEscape.ts',
      ],
      exclude: ['**/*.test.ts'],
      thresholds: {
        lines: 95,
        statements: 95,
        branches: 95,
        functions: 95,
      },
    },
  },
});
