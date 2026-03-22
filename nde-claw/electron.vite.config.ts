import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { codeInspectorPlugin } from "code-inspector-plugin";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out/main",
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, "electron/main.ts"),
        },
        external: ["electron", "electron/main", "electron/common", /^node:/],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, "electron/preload.ts"),
        },
        external: ["electron", /^node:/],
      },
    },
  },
  renderer: {
    root: ".",
    build: {
      outDir: "out/renderer",
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, "index.html"),
        },
      },
      cssMinify: "esbuild",
    },
    css: {
      transformer: "postcss",
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src/renderer"),
        "@shared": path.resolve(__dirname, "src/shared"),
      },
    },
    plugins: [
      codeInspectorPlugin({
        bundler: "vite",
        editor: "antigravity",
      }),
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        generatedRouteTree: "./src/renderer/routeTree.gen.ts",
        routesDirectory: "./src/renderer/routes",
      }),
      tailwindcss(),
      react(),
    ],
  },
});
