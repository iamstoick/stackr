import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Local dev talks to the backend directly; in Docker, Nginx does this.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.jsx'],
    setupFiles: ['./src/test-setup.js'],
    restoreMocks: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Chunking is left to rolldown's defaults: Vite 8 no longer accepts the
    // object form of manualChunks, and the automatic split is already sensible.
  },
});
