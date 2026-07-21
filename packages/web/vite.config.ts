import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` = '/CHORA-/' para funcionar no subcaminho do GitHub Pages.
export default defineConfig({
  plugins: [react()],
  base: process.env['VITE_BASE'] ?? '/CHORA-/',
  build: { outDir: 'dist', chunkSizeWarningLimit: 1200 },
});
