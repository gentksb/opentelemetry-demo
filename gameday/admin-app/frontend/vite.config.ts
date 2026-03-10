import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [preact()],
  root: '.',
  resolve: {
    alias: {
      '@gameday-shared': resolve(__dirname, '../src/constants'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        team: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
});
