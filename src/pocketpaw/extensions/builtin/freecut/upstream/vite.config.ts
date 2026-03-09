import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Redirect any remaining `import('mediabunny')` calls to the backend-only
      // shim so Vite can resolve the module without crashing the dev server.
      // The shim throws a clear error if any code path tries to use it at runtime.
      mediabunny: path.resolve(__dirname, './src/lib/mediabunny-mock.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Logger must be in its own chunk to avoid circular chunk TDZ errors.
          // Without this, Rollup places it in composition-runtime which has a
          // circular import with media-library, causing "Cannot access before
          // initialization" in production builds.
          if (id.endsWith('src/lib/logger.ts')) {
            return 'core-logger';
          }

          // Application feature chunks
          if (id.includes('/src/features/timeline/')) {
            return 'feature-timeline';
          }
          if (id.includes('/src/features/media-library/')) {
            return 'feature-media-library';
          }
          if (id.includes('/src/features/effects/')) {
            return 'feature-effects';
          }
          if (id.includes('/src/lib/composition-runtime/')) {
            return 'feature-composition-runtime';
          }

          // React must be in its own chunk, loaded first to ensure proper initialization
          // This prevents "Cannot set properties of undefined" errors with React 19.2 features
          if (id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/react/')) {
            return 'react-vendor';
          }
          // Router framework
          if (id.includes('@tanstack/react-router')) {
            return 'router-vendor';
          }
          // State management
          if (
            id.includes('/node_modules/zustand/') ||
            id.includes('/node_modules/zundo/')
          ) {
            return 'state-vendor';
          }
          // Media processing - loaded on demand

          // Audio/video processing helpers
          if (id.includes('/node_modules/soundtouchjs/')) {
            return 'audio-processing';
          }
          if (id.includes('/node_modules/gifuct-js/')) {
            return 'gif-processing';
          }
          // UI framework
          if (id.includes('@radix-ui/')) {
            return 'vendor-ui';
          }
          // Icons - keep lucide-react in separate chunk for better caching
          if (id.includes('lucide-react')) {
            return 'vendor-icons';
          }
          return undefined;
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: [],
    // Pre-bundle lucide-react for faster dev startup (avoids analyzing 1500+ icons on each reload)
    include: ['lucide-react'],
  },
});
