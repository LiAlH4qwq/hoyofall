# android/webui

The KernelSU WebUI source. TypeScript + React, bundled by the repository's
rolldown into `../module/webroot/app.js` (run `pnpm build:webui`, or `pnpm build`).

It is a pnpm workspace package (`android/webui/package.json`) with its own
dependencies; `pnpm install` at the repository root installs them.

## Source

| File | Role |
|---|---|
| `src/main.tsx` | Entry point: mounts `<App />` into `#root`. |
| `src/App.tsx` | The UI: a **Dashboard** plus a **Control / Config / Log** page per service (hoyofall and sing-box). |
| `src/api.ts` | Typed `Effect` wrappers over the module's `control.nu` actions. |
| `src/ksu.ts` | The KernelSU WebUI bridge (`window.ksu.exec`) as an `Effect`. |
| `rolldown.config.ts` | Outputs an IIFE bundle to `../module/webroot/app.js`. |

It calls the module's `control.nu` through the KernelSU WebUI API with
`LD_LIBRARY_PATH` set to the module's `lib/`. On KernelSU / SuKiSU / ReSuKiSU it
opens from the module page; on Magisk (and APatch) use the standalone
[`KsuWebUIStandalone`](https://github.com/5ec1cff/KsuWebUIStandalone) app.
Runtime dependencies are React, react-dom, Effect, CodeMirror and
`@uiw/react-codemirror`; add more to `package.json` and rolldown bundles them.

The static `index.html` and `style.css` live in `../module/webroot/` and are
committed; `app.js` is generated and gitignored.
