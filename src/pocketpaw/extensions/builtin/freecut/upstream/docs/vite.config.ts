import { defineConfig } from "vite";
import mdx from "fumadocs-mdx/vite";
import * as MdxConfig from "./source.config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// Normalize the base path – must start and end with "/"
function getBase(): string {
  const raw = process.env.BASE_PATH;
  if (!raw) return "/";
  // Strip leading/trailing whitespace, ensure leading & trailing slashes
  let p = raw.trim().replace(/\\/g, "/");
  if (!p.startsWith("/")) p = "/" + p;
  if (!p.endsWith("/")) p = p + "/";
  return p;
}

export default defineConfig({
  // Use BASE_PATH env for GitHub Pages (/freecut/), default to / for local/Netlify
  base: getBase(),
  plugins: [react(), tsconfigPaths(), mdx(MdxConfig)],
});
