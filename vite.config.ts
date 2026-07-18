import { defineConfig } from 'vite';

export default defineConfig({
  // Electron loads the production UI with file://, so packaged assets must be
  // relative to index.html rather than rooted at /.
  base: './'
});
