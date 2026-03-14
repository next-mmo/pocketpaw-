import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { codeInspectorPlugin } from "code-inspector-plugin";

export default defineConfig({
  plugins: [
    react(),
    codeInspectorPlugin({
      bundler: "vite",
      // Beta: keep inspector active even in production builds
      dev: () => true,
      // Show a floating toggle button for easy access
      showSwitch: true,
    }),
  ],
  base: "./",
  server: {
    port: 5179,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:9876",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "..",
    emptyOutDir: false,
    rollupOptions: {
      output: {
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
  },
});
