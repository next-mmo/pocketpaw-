import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5180,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:9876",
        changeOrigin: true,
      },
      "/static": {
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
