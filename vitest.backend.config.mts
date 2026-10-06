import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.join(import.meta.dirname, 'src') } },
  oxc: { jsx: { runtime: 'automatic' } },
  test: { environment: 'node', include: ['tests/backend/*.test.mjs'] },
});
