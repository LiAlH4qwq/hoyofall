# AGENTS.md

Instructions for agents (and humans) working on **hoyofall**, a provably
type-safe converter from mihomo (Clash.Meta) subscriptions to sing-box
`outbounds` fragments, written in TypeScript with
[Effect](https://effect.website/).

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
pnpm typecheck:webui  # tsc --noEmit for android/webui
pnpm lint        # eslint . && tsx scripts/check-ast.ts && tsx scripts/check-shell.ts
pnpm check:ast   # AST-level functional-rule enforcement only
pnpm test        # vitest
pnpm check       # typecheck + lint + ast + shell + test
pnpm build       # rolldown bundle + JSON schema (dist/)
pnpm dev --config config.yaml
```

The Android module is assembled from prebuilt binaries by Nix:

```
nix build .#hoyofall-android   # result/hoyofall-android-arm64.zip
```

The dev partition (hooks, workflow generation, the docs website) is entered
with `nix develop`; `.github/` is generated from Nix and never hand-edited:

```
nix flake check                      # checks, incl. github-up-to-date
nix run .#write-github -- . --stage  # regenerate .github/ and stage it
nix run .#check-github -- .          # fail if .github/ is stale
nix build .#website                  # -> result/{index.html,en/,zh/}
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
- `android/` – Android module: `webui/` source, `module/` (Magisk/KernelSU
  payload); assembled from prebuilt binaries by `nix/android.nix`
- `nix/` – `package.nix`, `overlay.nix`, `android.nix`, `github.nix` (generates
  `.github/`), `website.nix`, NixOS `module.nix`; `flake.nix`
- `dev/` – the flake-parts `dev` partition: development-only inputs, the
  `git-hooks.nix` hook config, and the dev shell
- `docs/` – English mdBook source; `docs/zh/` – 简体中文; both build to the site

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

## CI and the website (hard rule)

`.github/` is **generated from Nix** and must never be hand-edited. The
workflows are declared with
[`github-actions-nix`](https://github.com/synapdeck/github-actions-nix) in
`nix/github.nix`; `dependabot.yml` is rendered from Nix with `yq`. A **Nushell**
app (`pkgs.writers.writeNuBin`, no bash `cp`) copies the generated files into
`.github/`:

- `nix run .#write-github -- . --stage` regenerates and stages them;
- `nix run .#check-github -- .` / `nix flake check` fail when they are stale.

`git-hooks.nix` (in the `dev` partition, installed by `nix develop`) runs
`write-github` on relevant changes plus `actionlint` and `nixfmt-rfc-style`.

The documentation site is an mdBook build of `docs/` (English) and `docs/zh/`
(简体中文), assembled by `nix/website.nix` and deployed to GitHub Pages by the
generated `pages` workflow. The README stays short; long-form docs live in
`docs/` and on the site. When you add a page, add it to both `SUMMARY.md` files
and translate it.

## Shells and scripts (hard rule)

**bash is banned.** Do not add `*.sh`, `*.bash` or `*.bats` files, and do not
use a bash/POSIX shebang. Authored logic is **TypeScript** (the hoyofall app and
the Android supervisor) or **Nushell** (dev/orchestration scripts and generated
systemd units); never shell.

`pnpm lint` runs `scripts/check-shell.ts`, which walks the tree and fails on any
shell file or `#!/bin/bash` / `#!/bin/sh` shebang outside the allowlist below.

Two deliberate exceptions:

- **Android module bootstrap shims.** The Magisk/KernelSU module API executes
  `customize.sh`, `post-fs-data.sh`, `service.sh` and `uninstall.sh` with the
  system shell, so these files are the *only* permitted shell scripts. Their
  whole body must be a single `exec` of the bundled Node runtime
  (`bin/node supervisor.js <command>`, optionally via `/system/bin/env` to
  hardcode `LD_LIBRARY_PATH` to the module's `lib/`) with the module path
  hardcoded; no logic, conditionals, or variable expansion. `customize.sh` is
  the one exception — a single `chmod 0755` restoring the exec bits the module
  installer strips from `bin/node`, `bin/sing-box` and the shims (it uses
  Magisk's `$MODPATH` for that one command). Everything else lives in
  `android/supervisor/`.
- **Nix `stdenv` build phases.** Nix builders run their phases under bash by
  construction. Keep phase logic minimal.

## Android module

`android/` holds the Magisk/KernelSU module payload, the supervisor and the
WebUI source. The prebuilt runtimes (Node, sing-box) are fetched as fixed-output
derivations; see the cross-compilation note under [Nix](#nix).

- `android/module/` – the Magisk-format module: exec-only `.sh` shims (plus the
  `customize.sh` chmod), the bundled `supervisor.js` (built from
  `android/supervisor/`), default configs (hoyofall + sing-box), and the
  KernelSU `webroot/`.
- `android/supervisor/` – the supervisor, control protocol and boot hooks: a
  Node + Effect pnpm workspace package bundled by rolldown into
  `android/module/supervisor.js`. It is enforced by the functional/AST rules
  (`scripts/check-ast.ts`, ESLint) like `src/`.
- `android/webui/` – the KernelSU WebUI source (React + Effect + CodeMirror,
  a pnpm workspace package with its own deps), bundled by rolldown into
  `android/module/webroot/app.js`; it controls services and edits config/log
  only through the supervisor's `control` command.
- `nix/android.nix` – fetches the pinned Termux aarch64 Node packages (with
  their libraries and a CA bundle) and the upstream SagerNet sing-box build,
  then stages and zips the module.

The module is intentionally **all-in-one** for now; the planned split into
separate runtime / supervisor / app / WebUI modules, their stable interfaces and
the migration plan are in [`docs/android-future.md`](./docs/android-future.md)
(kept current for humans and agents).

Rules: pin every tool version and patch (no floating downloads); authored logic
is TypeScript (supervisor/WebUI) or Nushell (dev/systemd); the sing-box
integration is configured, never hardcoded to one module layout. See
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
- Custom groups form a DAG: every group needs a `level`, and may only reference
  custom groups of a strictly lower level (same scope) or a lower tier
  (`proxy` < native group < per-subscription custom < global custom).
  `includeLevels` bulk-includes lower same-scope groups. Explicit `members`
  bypass every include/exclude regex filter.

## Versioning

The **only** hand-edited version is `"version"` in the root `package.json`.
Everything else derives from it: the CLI (`src/version.ts`), the Nix derivation
(`nix/package.nix`), and the Android `module.prop` `version`/`versionCode`
(injected by `nix/android.nix`).

hoyofall is pre-1.0 (`0.y.z`): while the major is `0`, the public API is **not**
stable. Bump with `pnpm version` on every change:

- `patch` (`0.y.Z+1`): fixes, docs, internal refactors — no observable change.
- `minor` (`0.Y+1.0`): a new feature **or** any observable/breaking change to a
  public surface (CLI flags, config schema, HTTP routes, on-device layout).
- `1.0.0`: only when those public surfaces are declared stable.

No pre-release suffixes are used. The Android `versionCode` is derived as
`major*10000 + minor*100 + patch` and must stay monotonic.

## Nix

- `flake-parts`: `perSystem.packages.hoyofall` (and `default`),
  `packages.hoyofall-android` (`nix/android.nix`: the flashable module assembled
  from **prebuilt Termux aarch64 binaries**, fetched as fixed-output
  derivations, then staged/zipped in the derivation), `devShells.default`,
  `overlays`, `nixosModules`. nixpkgs' `pkgsCross.aarch64-android*` sets are
  intentionally unused (uncached and broken from source).
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
