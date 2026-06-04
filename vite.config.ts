import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

const wrapContentScript = (): Plugin => ({
  name: "wrap-content-script",
  generateBundle(_options, bundle) {
    const chunk = bundle["content-script.js"];
    if (chunk?.type !== "chunk") {
      return;
    }

    chunk.code = [
      "(() => {",
      chunk.code,
      "})();"
    ].join("\n");
  }
});

export default defineConfig({
  plugins: [react(), wrapContentScript()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, "sidepanel.html"),
        "service-worker": resolve(__dirname, "src/extension/serviceWorker.ts"),
        "content-script": resolve(__dirname, "src/extension/contentScript.ts")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
