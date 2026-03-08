import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    // Output directly to the plugin root so the iframe asset paths
    // resolve correctly (the extension serves from /extensions/llama-cpp/)
    outDir: "..",
    emptyOutDir: false,
    rollupOptions: {
      output: {
        // Put JS/CSS in an assets/ subfolder at plugin root
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
  },
});
