import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    cssMinify: 'esbuild',
  },
  css: {
    transformer: 'postcss',
  },
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      generatedRouteTree: './src/renderer/routeTree.gen.ts',
      routesDirectory: './src/renderer/routes',
    }),
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
