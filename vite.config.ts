import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@mediapipe/pose': fileURLToPath(new URL('./src/lib/pose/mediapipePoseShim.ts', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
  },
  test: {
    environment: 'node',
    globals: true,
  },
});
