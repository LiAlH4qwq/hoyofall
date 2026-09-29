# Android: toward separated modules

> **Status:** the repository currently ships **one all-in-one module**
> (`hoyofall-android`). This page defines the intended decomposition so the move
> to separate modules is a mechanical refactor, and so agents and humans share
> the same target. It is a design document, not a description of today's code.

## Why

The all-in-one module bundles four unrelated things:

1. a **runtime** (Node),
2. a **scripting runtime** (Nushell),
3. a **supervisor** (the Nushell service loop),
4. **applications** (hoyofall, sing-box) plus their **WebUI**.

Those have different release cadences and could be reused by other Android
module authors (a generic Nushell supervisor and WebUI are useful on their own).
Splitting them reduces the module size per install and lets each part be updated
independently.

## Current all-in-one

| Piece | Files | Responsibility |
|---|---|---|
| Runtime payload | `bin/node`, `lib/*` | run `index.js` |
| Scripting payload | `bin/nu` | run the module logic |
| Supervisor | `module/service.nu`, `module/services.nu` | restart services, honour stop flags, watch the fragment |
| App: hoyofall | `index.js`, `config/config.android.yaml`, `bin/node` | convert subscriptions |
| App: sing-box | `bin/sing-box`, `config/singbox.json` | proxy core |
| Control | `module/control.nu` | start/stop/config/log, used by the WebUI |
| WebUI | `module/webroot/` (built from `webui/`) | KernelSU UI |
| Boot | `module/*.sh` + `module/post-fs-data.nu`, `uninstall.nu` | Magisk/KernelSU entrypoints |

## Target decomposition

| Module | Owns | Depends on |
|---|---|---|
| `node-android` | `bin/node` + its `lib/*` + CA bundle | — |
| `nushell-android` | `bin/nu` + its `lib/*` | — |
| `nu-supervisor` | `services.nu`, `service.nu`, `control.nu`, the shims | a shell (`nu`) |
| `hoyofall` (app) | `index.js`, hoyofall config, a service spec | `node-android`, `nu-supervisor` |
| `sing-box` (app) | `bin/sing-box`, sing-box config, a service spec | `nu-supervisor` |
| `webui` | `webroot/` (React app) | `nu-supervisor` |

Only `nu-supervisor` and the runtime modules need shims; app modules become
**data plus a spec**. A single `service.sh` (owned by `nu-supervisor`) starts one
Nushell process that discovers and supervises every registered service.

### Shared paths

Each module keeps its own directory, but apps and runtimes need a stable way to
find each other. Proposed contract:

```
/data/adb/node/bin/node          # node-android
/data/adb/nushell/bin/nu         # nushell-android
/data/adb/nu-supervisor/         # supervisor + control.nu + services.nu + lib.nu
/data/adb/hoyofall/              # supervisor config (android.conf)
/data/adb/hoyofall/hoyofall/     # hoyofall app state (config, env, out, log) + spec
/data/adb/hoyofall/sing-box/     # sing-box app state (config, cache, log) + spec
```

Apps register a **service spec** rather than editing supervisor code:

- `nu-supervisor` scans `/data/adb/*/service.nu` (or a JSON registry) and calls
  each spec's `export def spec []`.
- The spec record is exactly what `android/module/services.nu` returns today:
  `{ name, bin, args, config, log, flag }`.
- `nu-supervisor`'s `control.nu` is the single control surface; the WebUI talks
  only to it (never to app-specific scripts).

## Stable interfaces (keep these names)

These are already used; splitting must preserve them or bump a protocol version.

- **Service spec** (`services.nu`): `service-names`, `service-spec <name>`,
  `service-status <name>`, `stop-service <name>`, `pids <pattern>`. The spec
  record is `{ name, bin, args, config, source, format, check, log, flag }`:
  `source` is the optional Nushell config document, `format` its render format,
  and `check` the validator command (empty = no standalone check).
- **Control protocol** (`control.nu`): `control.nu <action> [service]` where
  `action ∈ {status,start,stop,restart,config,config-source,set-config,
  render-config,set-source,log}` and the write actions read base64 from
  `$env.HOYOFALL_CONFIG_B64`. `set-config`/`set-source` validate before
  committing; `render-config` renders without writing. `status` returns compact
  JSON `{enabled,running,supervisor}` (or an array with `service`).
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

1. Extract `node-android` and `nushell-android` as payload modules; verify their
   binaries run from `/data/adb/<name>/` with `LD_LIBRARY_PATH`.
2. Extract `nu-supervisor`: generalise `service.nu`/`control.nu` to discover
   specs; the current single-module version is the reference implementation.
3. Turn hoyofall and sing-box into app modules that only ship state + a spec.
4. Make the WebUI talk to `nu-supervisor`'s `control.nu` with a configurable
   base path instead of the hardcoded `/data/adb/modules/hoyofall`.
5. Keep the all-in-one package (`hoyofall-android`) as a convenience meta-module
   that stages all of the above, or deprecate it.

## For agents

- Keep the **service spec** shape and the **control protocol** stable; they are
  the seams.
- New services = a new arm in `service-spec` (all-in-one) or a new
  `/data/adb/<x>/service.nu` spec (separated); never a new shim.
- All scripts stay **Nushell**; the only shell files are the Magisk entrypoints
  in the allowlist of `scripts/check-shell.ts`.
- The WebUI is a pnpm workspace package under `android/webui/`; it must not
  hardcode module paths once separation lands.
