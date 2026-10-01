import { defineConfig } from "rolldown"

// Builds the Node + Effect supervisor (service loop, control protocol, boot
// hooks) into a single ES module the Magisk/KernelSU shims exec. Source lives
// in android/supervisor/src; dependencies are declared in its package.json.
export default defineConfig({
  input: "android/supervisor/src/main.ts",
  platform: "node",
  output: {
    file: "android/module/supervisor.js",
    format: "esm",
    banner: "#!/usr/bin/env node",
  },
})
