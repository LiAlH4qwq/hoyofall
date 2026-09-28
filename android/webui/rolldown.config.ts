import { defineConfig } from "rolldown"

// Builds the KernelSU WebUI (React + Effect + CodeMirror) into the module's
// webroot. Dependencies live in android/webui/package.json (pnpm workspace).
export default defineConfig({
  input: "android/webui/src/main.tsx",
  platform: "browser",
  transform: {
    jsx: "react-jsx",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  },
  output: {
    file: "android/module/webroot/app.js",
    format: "iife",
  },
})
