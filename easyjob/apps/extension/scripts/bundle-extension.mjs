/**
 * Bundle background (ESM) + content (IIFE) via Vite's programmatic `build()`.
 * Avoids the broken hoisted `esbuild` CLI (exit 126 / "cannot execute binary file").
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

const shared = () => ({
  configFile: false,
  root,
  publicDir: false,
  resolve: {
    alias: {
      "@easyjob/shared": path.resolve(root, "../../packages/shared/src/index.ts"),
    },
  },
  plugins: [],
});

await build({
  ...shared(),
  build: {
    emptyOutDir: false,
    lib: {
      entry: path.join(root, "src/background.ts"),
      name: "easyjobBackground",
      formats: ["es"],
      fileName: () => "background",
    },
    outDir: dist,
    rollupOptions: {
      output: {
        entryFileNames: "background.js",
      },
    },
  },
});

await build({
  ...shared(),
  build: {
    emptyOutDir: false,
    lib: {
      entry: path.join(root, "src/content.ts"),
      name: "easyjobContent",
      formats: ["iife"],
      fileName: () => "content",
    },
    outDir: dist,
    rollupOptions: {
      output: {
        entryFileNames: "content.js",
      },
    },
  },
});
