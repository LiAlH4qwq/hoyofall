# Design & guarantees

hoyofall is deliberately small and strict. The goal is a **provably type-safe**
daemon whose behaviour is easy to reason about and to verify, with no hidden
state and no untyped failure paths.

## Functional core

The code is written in TypeScript on [Effect](https://effect.website/) under a
strict functional discipline. There is no `let` or `var`, no `while`/`for`
loops, no `try`/`catch`, no `throw`, no `async`/`await`, no `any`, and no
mutation of objects or arrays. `const`, `Array.map` / `filter` / `reduce` /
`flatMap`, `Match`, `Effect.all`, and `Effect.try` / `Effect.tryPromise` replace
them.

This is not a convention that reviewers have to police: `pnpm lint` runs
`scripts/check-ast.ts`, which parses the AST of `src/`, `test/` and `scripts/`
with the TypeScript compiler API and **fails the build** on any forbidden
construct. The full list is in [development.md](./development.md).

## Typed failures

Every failure is modelled with a specific Effect `Data.TaggedError`, so the
error channel is never `unknown` or `any`. At the boundaries — reading the
config file, parsing YAML, fetching a subscription, decoding its payload,
writing files — input is parsed with `Schema` and decoded once, then handled
explicitly with `Effect.catchTag` / `Effect.catchTags` / `Effect.match`.

Unsupported proxy or group types are not exceptions: they are collected as
`warnings` and either skipped or escalated per subscription with
`onUnsupported: skip | fail`. A single failing subscription does not take down
the others.

The outbound graph must be a DAG: custom groups may only reference groups of a
strictly lower `level`, invalid references and level violations fail at config
validation, and a cycle that reaches conversion is a typed `GroupCycleError`.

## Sessions, not cells

State is functional: a subscription's latest conversion is carried in a
`Stream.scan` pipeline and published through a `PubSub`. There is no `Ref` and
no mutable cache. The HTTP routes read the same published snapshots the file
writer does.

## Shell discipline

Bash is banned. Authored logic is **TypeScript** (the hoyofall app and the
Android supervisor, run on Node) or [Nushell](https://www.nushell.sh/)
(`.nu`: dev/orchestration scripts and generated systemd units). `pnpm lint` runs
`scripts/check-shell.ts`, which fails on any `*.sh` / `*.bash` / `*.bats` file or
bash/POSIX shebang outside a two-entry allowlist:

- the **Android module bootstrap shims** (`customize.sh`, `post-fs-data.sh`,
  `service.sh`, `uninstall.sh`), which the Magisk/KernelSU module API requires to
  be shell — each is a single `exec` of the bundled Node runtime
  (`bin/node supervisor.js <command>`, optionally via `/system/bin/env` to
  hardcode `LD_LIBRARY_PATH`), except `customize.sh`, which is a single
  `chmod 0755` to restore the exec bit the installer strips; and
- **Nix `stdenv` build phases**, which run under bash by construction; keep them
  minimal.

Nushell (dev/systemd) is not POSIX shell: compose structured data through
Nushell's own pipelines (`where`, `each`, `reduce`, `get`, `from json`, …), not
through external text utilities. The Android supervisor instead composes typed
`Effect`s; see `android/supervisor/`.

## Secure by construction

- **Tokens stay out of files.** `urlEnv` reads the subscription URL from an
  environment variable, so `config.yaml` contains no secrets. The NixOS module
  pairs this with `environmentFile`.
- **Least privilege.** The NixOS module and the shipped systemd unit run the
  service as a `DynamicUser` with `ProtectSystem=strict`, `ProtectHome=true`,
  `PrivateTmp=true`, `NoNewPrivileges=true`, and a restricted set of address
  families.
- **Atomic output.** Fragments are written to a temporary file and `rename`d
  into place, so readers (including sing-box) never observe a partial file.
- **No dynamic evaluation.** Configuration is decoded and validated against a
  JSON Schema; there is no embedded scripting or templating.

## Why file output

sing-box core cannot import configuration over HTTP. It reads local files
(`-c/--config`) or a local directory (`-C/--config-directory`), and
`sing-box merge` combines files where objects override by key and arrays append.
hoyofall therefore writes the fragment to disk; the optional HTTP endpoint exists
for GUIs and debugging.

See [`AGENTS.md`](https://github.com/LiAlH4qwq/hoyofall/blob/main/AGENTS.md) for
the normative rules an agent or contributor must follow.
