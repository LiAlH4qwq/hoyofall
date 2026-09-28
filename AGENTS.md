# AGENTS.md

Instructions for agents (and humans) working on **hoyofall**, a headless
converter from mihomo (Clash.Meta) subscriptions to sing-box `outbounds`
fragments, written in TypeScript with [Effect](https://effect.website/).

## Functional programming (strict)

**hoyofall is strictly functional.** When working in this repository, apply
functional-programming practices: pure functions, immutable data, total
functions, typed errors, effect composition, and referential transparency.
`pnpm lint` enforces most of this at the AST level, but the rules below cover
what a checker cannot see. If you are unsure, prefer the pure, declarative,
effect-based formulation.

## Commands

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint . && tsx scripts/check-ast.ts && tsx scripts/check-shell.ts
pnpm check:ast   # AST-level functional-rule enforcement only
pnpm test        # vitest
pnpm check       # typecheck + lint + ast + shell + test
pnpm build       # rolldown bundle + JSON schema (dist/)
pnpm dev --config config.yaml
```

Android cross-compilation has its own Nushell entrypoints (Nushell, not bash):

```
nu android/build.nu --arch arm64      # node + nushell + module payload
nu android/package.nu --arch arm64    # hoyofall-android-arm64.zip
```

## Layout

- `src/config/` – configuration `Schema`, loading and validation
- `src/mihomo/` – subscription decoding (Schema per proxy/group type)
- `src/convert/` – pure mihomo → sing-box conversion
- `src/pipeline/` – refresh streams, snapshot cache (`Stream.scan` + `PubSub`)
- `src/output/` – atomic file output; `src/server/` – optional HTTP endpoints
- `src/diagnostics.ts` – CLI usage and friendly error formatting
- `scripts/check-ast.ts` – AST enforcement of the rules below
- `scripts/check-shell.ts` – bans authored bash / POSIX shell scripts
- `android/` – Android subprojects: `node/` + `nushell/` cross-compilation,
  `singbox/` prebuilt fetch, `webui/` source, `module/` (Magisk/KernelSU
  payload), `build.nu`, `package.nu`
- `nix/` – `package.nix`, `overlay.nix`, NixOS `module.nix`; `flake.nix`

## Hard rules (enforced by `pnpm lint`)

`scripts/check-ast.ts` parses the AST of `src/`, `test/` and `scripts/` with the
TypeScript compiler API and fails on any of:

- `var`, `let`, `using`, `await using` declarations (use `const`)
- `while`, `do`, `for`, `for-in`, `for-of`, labels, `break`, `continue`
- `try` / `catch` statements, and `throw` statements
- `async` functions and `await` expressions
- `Promise.then(...)` / `Promise.finally(...)` chains
- `++` / `--`, `delete`
- `Array.prototype.forEach`
- mutating array methods: `push`, `pop`, `shift`, `unshift`, `splice`, `sort`,
  `reverse`, `fill`, `copyWithin`
- `Object.assign` / `defineProperty` / `defineProperties` / `setPrototypeOf`
  and `Reflect.set` / `deleteProperty` / `defineProperty` / `setPrototypeOf`
- assignment to object or array members (`x.y = ...`, `x[i] = ...`)
- the `any` keyword, and `as unknown as` double assertions

ESLint mirrors these with `no-restricted-syntax` and
`eslint-plugin-functional`, so editors surface them before CI.

The KernelSU WebUI (`android/webui/src`) is React/browser code: it follows the
same style where practical, but the no-mutation / no-promise rules cannot apply
to the DOM and the KernelSU `ksu.exec` callback bridge, so it is outside the AST
checker's roots.

Replace the forbidden constructs with `const`, `Array.map` / `filter` /
`reduce` / `flatMap`, `Effect.all`, `Effect.try` / `Effect.tryPromise`,
`Match`, and typed errors.

## Shells and scripts (hard rule)

**bash is banned.** Every script this repository authors or ships — build and
orchestration scripts, CI steps, generated service scripts, and the Android
module logic — is **Nushell** (`.nu`). Do not add `*.sh`, `*.bash` or `*.bats`
files, and do not use a bash/POSIX shebang.

`pnpm lint` runs `scripts/check-shell.ts`, which walks the tree and fails on any
shell file or `#!/bin/bash` / `#!/bin/sh` shebang outside the allowlist below.

Two deliberate exceptions:

- **Android module bootstrap shims.** The Magisk/KernelSU module API executes
  `customize.sh`, `post-fs-data.sh`, `service.sh` and `uninstall.sh` with the
  system shell, so these files are the *only* permitted shell scripts. Their
  whole body must be a single `exec` of the bundled Nushell (optionally via
  `/system/bin/env` to hardcode `LD_LIBRARY_PATH` to the module's `lib/`) with
  the module path hardcoded; no logic, conditionals, or variable expansion.
  `customize.sh` is the one exception — a single `chmod 0755` restoring the exec
  bits the module installer strips from `bin/node`, `bin/nu`, `bin/sing-box`
  and the shims (it uses Magisk's `$MODPATH` for that one command). Everything
  else lives in the matching `.nu` file.
- **Nix `stdenv` build phases.** Nix builders run their phases under bash by
  construction. Keep phase logic minimal and delegate to `nu -c '…'` / `.nu`
  scripts wherever practical.

Across the rest of the repository, port logic to Nushell rather than writing a
shell script.

## Android subprojects

`android/` holds two vendored cross-compilation subprojects plus the module
payload. They are part of this repository but are kept self-contained so they
can be split out later (the Nushell port in particular starts minimal and grows
toward a full build):

- `android/node/` – cross-compiles Node for Android (`aarch64-linux-android`
  and `x86_64-linux-android`). `versions.lock` pins the NDK and Node; `patches/`
  vendors the Termux `nodejs` patch set; `build.nu` drives Node's `./configure`
  + `make` against the NDK.
- `android/nushell/` – cross-compiles Nushell for Android. `versions.lock` pins
  Nushell; `patches/` vendors the Termux `sysinfo` patch; `build.nu` drives
  Cargo with the NDK linker and the reduced feature set.
- `android/singbox/` – fetches the pinned prebuilt sing-box for Android
  (`fetch.nu` + `versions.lock`); `nix/android.nix` uses a fixed-output
  derivation for the same tarball.
- `android/module/` – the Magisk-format module: exec-only `.sh` shims (plus the
  `customize.sh` chmod), `.nu` logic (`services.nu` service specs, `service.nu`
  supervisor, `control.nu` control protocol, `post-fs-data.nu`,
  `uninstall.nu`), default configs (hoyofall + sing-box), and the KernelSU
  `webroot/`.
- `android/webui/` – the KernelSU WebUI source (React + Effect + CodeMirror,
  a pnpm workspace package with its own deps), bundled by rolldown into
  `android/module/webroot/app.js`; it controls services and edits config/log
  only through `control.nu`.
- `android/build.nu` orchestrates node + nushell + sing-box + module;
  `android/package.nu` assembles `hoyofall-android-<arch>.zip`.

The module is intentionally **all-in-one** for now; the planned split into
separate runtime / supervisor / app / WebUI modules, their stable interfaces and
the migration plan are in [`docs/android-future.md`](./docs/android-future.md)
(kept current for humans and agents).

Rules: pin every tool version and patch (no floating downloads); scripts are
Nushell; the module's logic is Nushell with the shim exception above; the
sing-box integration is configured, never hardcoded to one module layout. See
[`docs/android.md`](./docs/android.md).

## Effect rules

Effect's own agent-oriented documentation is the reference:

- [`Effect-TS/effect` `LLMS.md`](https://github.com/Effect-TS/effect/blob/main/LLMS.md)
- [`Effect-TS/effect` `ai-docs/`](https://github.com/Effect-TS/effect/tree/main/ai-docs)
- <https://effect.website/docs>

### Convert non-Effect monads to `Effect` early

Do not operate on a non-Effect monad (`Option`, `Either`, `Array`, …) and only
convert at the end. Convert at the boundary, then continue in `Effect`
("convert-then-op", not "op-then-convert").

The most common — and worst — op-then-convert is a `Promise.then(...)` chain
(and its `await` / `async` sugar). A `Promise` is not even a lawful monad, so
work done inside `.then` cannot be typed, cannot be interrupted, and leaks
defects. **Never** build a pipeline with `Promise.then` / `.finally` /
`async` / `await`; convert the `Promise` to an `Effect` at the boundary and
compose with `Effect` combinators.

```ts
// prefer: convert once at the boundary, then compose in Effect
const response = yield* Effect.tryPromise(() => fetch(url))
const body = yield* Effect.tryPromise(() => response.text())

// avoid: op-then-convert (and untyped / uncancellable)
fetch(url).then((response) => response.text()).then(process)
```

Use `Effect.tryPromise`, `Effect.promise`, `Effect.fromOption`,
`Effect.fromEither`, `Effect.try`, or `Schema` decoding to cross the boundary
once.

### Do not emulate `try` / `catch` with a broad `Effect.catchAll`

Handle failures where they occur and name the error tags you recover from.
Use `Effect.catchTag` / `Effect.catchTags` / `Effect.match` / `Effect.catchReason`
instead of a wide `Effect.catchAll` wrapped around a large pipeline.

```ts
// prefer: explicit about what is recovered
effect.pipe(
  Effect.catchTags({
    FetchError: (error) => toFailedState(error),
    PayloadDecodeError: (error) => toFailedState(error),
  }),
)

// avoid: a big catchAll that swallows everything at the edge
effect.pipe(Effect.catchAll((error) => recover(error)))
```

A single, deliberate supervision boundary (for example: mark one subscription
as failed and keep serving the rest) is allowed, but it must enumerate the tags
it handles and be obvious from the call site.

### Never bypass the type system

No `any`, no `as unknown as`, no `@ts-ignore` / `@ts-expect-error` /
`@ts-nocheck`. Parse unknown input with `Schema` and decode at boundaries.
When a library API cannot be typed without a cast, isolate the cast in one
small helper and justify it in a comment.

### Style

- Use `Effect.gen` for inline effectful code; use `Effect.fn("name")` for
  reusable traced functions and `Effect.fnUntraced` for hot paths / library
  internals. Avoid functions that only wrap and return an `Effect.gen`.
- Model every failure with a specific `Data.TaggedError`; the error channel `E`
  must never be `unknown` or `any`.
- Format `Schema` parse failures with `ParseResult.ArrayFormatter`.
- Keep state functional: use `Stream`, `Stream.scan` and `PubSub`; do not
  introduce `Ref` or other mutable cells.
- Atomic file writes only: write a temp file, then `rename`.

## Tests

- `test/` with `vitest`; run effectful code via `Effect.runSync` / `runPromise`.
- Add a golden test for new proxy/group mappings.
- `test/example-config.test.ts` keeps `config.example.yaml` valid; update the
  example whenever the config schema changes.

## Configuration

- `config.example.yaml` is the canonical example; copy it to `config.yaml`.
- `config.yaml` (and `config.local.yaml`) are gitignored because they contain
  subscription tokens. Use `urlEnv` to pull tokens from the environment.

## Nix

- `flake-parts`: `perSystem.packages.hoyofall` (and `default`),
  `packages.hoyofall-android` (`nix/android.nix`: the flashable module assembled
  from **prebuilt Termux aarch64 binaries**, fetched as fixed-output
  derivations, then staged/zipped by `android/build.nu` / `android/package.nu`),
  `devShells.default`, `devShells.android` (host toolchain + NDK for building the
  pinned subprojects from source), `overlays`, `nixosModules`. nixpkgs'
  `pkgsCross.aarch64-android*` sets are intentionally unused (uncached and broken
  from source).
- `nix/package.nix` builds with pnpm + rolldown. The pnpm store format changes
  between pnpm majors, so `flake.nix` pins `pnpm_12` and the dependency hash
  lives in a per-system `pnpmDepsHashes` map (with a `default`); refresh it when
  `pnpm-lock.yaml` or the pnpm major changes by setting `lib.fakeHash`, building,
  and copying the `got:` hash. See the comment in `nix/package.nix`.
- `nix/module.nix` is **single-instance**: it generates `hoyofall.service` and
  validates `settings` against the shipped `schema.json` with
  `check-jsonschema`. It defaults `output.file.path` / `output.file.directory`
  to `/run/hoyofall/hoyofall.json` and `/run/hoyofall` (the service
  RuntimeDirectory and WorkingDirectory); other output paths require
  `extraReadWritePaths`.
- `services.hoyofall.singboxIntegration.enable = true` makes the module own the
  `services.sing-box` injection (root oneshot + `systemd.paths` refresh +
  `RuntimeDirectoryPreserve`); do not reimplement this in user configs.
- **No bash in module scripts.** Any generated systemd script must be Nushell
  via `pkgs.writers.writeNu`, preferring Nushell builtins
  (`mkdir`/`cp`/`path exists`/`hash sha256`/`sleep`) and only falling back to
  external commands (`^systemctl`, uutils) when there is no builtin. This is a
  special case of the repository-wide [shell rule](#shells-and-scripts-hard-rule).
