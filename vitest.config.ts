import { defineConfig } from 'vitest/config';

// Tests run real git commands against temporary repositories.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], testTimeout: 20000 },
});
