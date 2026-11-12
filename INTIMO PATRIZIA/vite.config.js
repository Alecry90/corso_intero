import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const pages = ['index', 'chi-siamo', 'gallery', 'contatti', 'catalogo', 'accedi', 'admin', 'privacy', 'cookie', 'condizioni'];
export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: { input: Object.fromEntries(pages.map(name => [name, resolve(import.meta.dirname, `${name}.html`)])) }
  },
  server: {
    strictPort: true,
    proxy: process.env.INTIMO_API_PROXY ? { '/api': { target: process.env.INTIMO_API_PROXY, changeOrigin: true } } : undefined
  }
});
