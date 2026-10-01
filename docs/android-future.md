# Android: toward separated modules

> **Status:** the repository currently ships **one all-in-one module**
> (`hoyofall-android`). This page defines the intended decomposition so the move
> to separate modules is a mechanical refactor, and so agents and humans share
> the same target. It is a design document, not a description of today's code.

## Why

The all-in-one module bundles unrelated things:

1. a **runtime** (Node),
2. a **supervisor** (the Node + Effect service loop and control protocol),
3. **applications** (hoyofall, sing-box) plus their **WebUI**.

These have different release cadences and could be reused by other Android
module authors (a generic Node + Effect supervisor and WebUI are useful on their
own).
Splitting them reduces the module size per install and lets each part be updated
independently.

## Current all-in-one

| Piece | Files | Responsibility |
|---|---|---|
| Runtime payload | `bin/node`, `lib/*` | run `index.js` and `supervisor.js` |
| Supervisor | `supervisor/src/` → `supervisor.js` | restart services, honour stop flags, watch the fragment |
| App: hoyofall | `index.js`, `config/config.android.yaml`, `bin/node` | convert subscriptions |
| App: sing-box | `bin/sing-box`, `config/singbox.json` | proxy core |
| Control | `supervisor/src/control.ts` | start/stop/config/log, used by the WebUI |
| WebUI | `module/webroot/` (built from `webui/`) | KernelSU UI |
| Boot | `module/*.sh` (shims) + `supervisor/src/post-fs-data.ts`, `uninstall.ts` | Magisk/KernelSU entrypoints |

## Target decomposition

| Module | Owns | Depends on |
|---|---|---|
| `node-android` | `bin/node` + its `lib/*` + CA bundle | — |
| `node-supervisor` | `supervisor.js`, the shims | Node |
| `hoyofall` (app) | `index.js`, hoyofall config, a service spec | `node-android`, `node-supervisor` |
| `sing-box` (app) | `bin/sing-box`, sing-box config, a service spec | `node-supervisor` |
| `webui` | `webroot/` (React app) | `node-supervisor` |

Only `node-supervisor` and the runtime module need shims; app modules become
**data plus a spec**. A single `service.sh` (owned by `node-supervisor`) starts
one Node process that discovers and supervises every registered service, and
serves the control protocol.

### Shared paths

Each module keeps its own directory, but apps and runtimes need a stable way to
find each other. Proposed contract:

```
/data/adb/node/bin/node          # node-android
/data/adb/node-supervisor/       # supervisor.js + the shims
/data/adb/hoyofall/              # supervisor config (android.conf)
/data/adb/hoyofall/hoyofall/     # hoyofall app state (config, env, out, log) + spec
/data/adb/hoyofall/sing-box/     # sing-box app state (config, cache, log) + spec
```

Apps register a **service spec** rather than editing supervisor code:

- `node-supervisor` scans `/data/adb/*/service.json` (or an equivalent registry)
  and loads each spec.
- The spec record is what `android/supervisor/src/services.ts` returns today:
  `{ name, bin, args, match, config, format, check, log, flag }`.
- The supervisor's `control` command is the single control surface; the WebUI
  talks only to it (never to app-specific code).

## Stable interfaces (keep these names)

These are already used; splitting must preserve them or bump a protocol version.

- **Service spec** (`android/supervisor/src/services.ts`): `service-names`,
  `service-spec <name>`, `service-status <name>`, `stop-service <name>`,
  `pids <pattern>`. The spec record is
  `{ name, bin, args, match, config, format, check, log, flag }`: `match` is the
  `pgrep -f` pattern that identifies a running instance, `format` the render
  format, and `check` the validator command (empty = no standalone check).
- **Control protocol** (`supervisor.js control`):
  `supervisor.js control <action> [service]` where
  `action ∈ {status,start,stop,restart,config,set-config,log}` and the write
  action reads base64 from `HOYOFALL_CONFIG_B64`. `set-config` validates before
  committing. `status` returns compact JSON `{enabled,running,supervisor}` (or an
  array with `service`).
- **Supervision**: a service is a long-running `bin`+`args`, restarted on exit,
  with its `flag` file meaning "stopped"; the supervisor process itself never
  exits so `start` works without a reboot.
- **Environment**: binaries rely on `LD_LIBRARY_PATH` pointing at their `lib/`;
  HTTPS uses a bundled CA at `etc/ssl/cert.pem` exported as
  `SSL_CERT_FILE`/`NODE_EXTRA_CA_CERTS`.
- **Boot entrypoints**: `customize.sh` (exec bits), `post-fs-data.sh`,
  `service.sh`, `uninstall.sh` — exec-only shims, plus `customize.sh`'s chmod
  (see `AGENTS.md`).

## Migration plan

1. Extract `node-android` as a payload module; verify the binary runs from
   `/data/adb/node/` with `LD_LIBRARY_PATH`.
2. Extract `node-supervisor`: generalise the supervisor's service specs to
   discover apps; the current single-module version is the reference.
3. Turn hoyofall and sing-box into app modules that only ship state + a spec.
4. Make the WebUI talk to the supervisor's `control` command with a configurable
   base path instead of the hardcoded `/data/adb/modules/hoyofall`.
5. Keep the all-in-one package (`hoyofall-android`) as a convenience meta-module
   that stages all of the above, or deprecate it.

## For agents

- Keep the **service spec** shape and the **control protocol** stable; they are
  the seams.
- New services = a new arm in `service-spec` (all-in-one) or a new
  `/data/adb/<x>/service.json` spec (separated); never a new shim.
- Authored logic stays **TypeScript** (supervisor/WebUI); the only shell files
  are the Magisk entrypoints in the allowlist of `scripts/check-shell.ts`.
- The WebUI is a pnpm workspace package under `android/webui/`; it must not
  hardcode module paths once separation lands.
