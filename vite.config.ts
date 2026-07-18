import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Electron loads the production UI with file://, so packaged assets must be
  // relative to index.html rather than rooted at /.
  base: './',
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/dist-electron/**', '**/release/**']
  }
});
