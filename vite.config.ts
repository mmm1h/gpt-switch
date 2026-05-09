import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: "src/background.ts",
        "content-script": "src/content-script.ts",
        popup: "src/popup/main.ts"
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
