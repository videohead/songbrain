import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Base path for serving behind a reverse proxy subpath (e.g. Traefik routing
// /songbrain/ -> stripPrefix -> this app). Must start and end with '/'.
const base = process.env.SONGBRAIN_BASE_PATH ?? '/';
if (!base.startsWith('/') || !base.endsWith('/')) throw new Error('SONGBRAIN_BASE_PATH must start and end with /.');

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', sourcemap: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as any);
