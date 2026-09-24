import { defineConfig } from "rolldown"

export default defineConfig({
  input: "src/index.ts",
  platform: "node",
  output: {
    dir: "dist",
    format: "esm",
    entryFileNames: "index.js",
    banner: "#!/usr/bin/env node",
    sourcemap: true,
  },
})
