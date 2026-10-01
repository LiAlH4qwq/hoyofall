# Development

See [`AGENTS.md`](https://github.com/LiAlH4qwq/hoyofall/blob/main/AGENTS.md) for
the full code-style rules (functional AST
rules, Effect conventions, boundary typing). In short: no imperative constructs,
convert into `Effect` at boundaries, no broad `Effect.catchAll`, and never bypass
the type system.

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm typecheck:webui  # tsc --noEmit for android/webui
pnpm lint        # eslint + scripts/check-ast.ts + scripts/check-shell.ts
pnpm check:ast   # AST-level functional-rule enforcement only
pnpm test        # vitest
pnpm check       # typecheck + lint + ast + shell + test
pnpm build       # rolldown bundle + JSON schema
pnpm dev --config config.yaml
```

The Android module is assembled from prebuilt binaries by Nix, not cross-compiled:

```bash
nix build .#hoyofall-android   # result/hoyofall-android-arm64.zip
```

## Layout

- `src/config/` – configuration `Schema`, loading and validation
- `src/mihomo/` – subscription decoding (Schema per proxy/group type)
- `src/convert/` – pure mihomo → sing-box conversion
- `src/pipeline/` – refresh streams, snapshot cache (`Stream.scan` + `PubSub`)
- `src/output/` – atomic file output
- `src/server/` – optional HTTP endpoints
- `src/singbox/` – sing-box `outbounds` `Schema` and types
- `src/diagnostics.ts` – CLI usage and friendly error formatting
- `scripts/check-ast.ts` – AST enforcement of the functional rules
- `scripts/check-shell.ts` – bans authored bash / POSIX shell scripts
- `android/webui/` – KernelSU WebUI source; `android/module/` – Magisk/KernelSU
  payload (assembled into the flashable module by `nix/android.nix`)
- `nix/` – `package.nix`, `overlay.nix`, `android.nix`, `github.nix` (generates
  `.github/`), `website.nix`, NixOS `module.nix`; `flake.nix`
- `dev/` – the flake-parts `dev` partition: development-only inputs
  (`github-actions-nix`, `git-hooks`, `tsnix`), the git hooks, and the dev shell
- `docs/` – the English mdBook source; `docs/zh/` – the 简体中文 translation

## CI, workflows and the website

GitHub Actions workflows and `dependabot.yml` are **generated from Nix**, not
hand-written. `nix/github.nix` declares the workflows with
[`github-actions-nix`](https://github.com/synapdeck/github-actions-nix) and
renders dependabot with `yq`; a Nushell app copies the results into `.github/`:

```bash
nix run .#write-github -- . --stage   # write and `git add` the .github files
nix run .#check-github -- .           # fail if the committed files are stale
nix flake check                       # includes the github-up-to-date check
```

The `dev` flake partition keeps these inputs out of a consumer's lock file.
`git-hooks.nix` installs a pre-commit hook that runs `write-github` whenever
`flake.nix`, `flake.lock` or `nix/**` changes, plus `actionlint` and
`nixfmt-rfc-style`. Hooks are installed on `nix develop`.

The documentation site is an mdBook build of `docs/` (English) and `docs/zh/`
(中文), assembled by `nix/website.nix` and deployed to GitHub Pages by the
generated `pages` workflow:

```bash
nix build .#website     # -> result/{index.html,en/,zh/}
```

## Enforced AST rules

`pnpm lint` runs `scripts/check-ast.ts` (TypeScript compiler API), which rejects,
in `src/`, `test/` and `scripts/`:

`var` / `let` / `using`, `while` / `do` / `for` / `for-in` / `for-of` /
labels / `break` / `continue`, `try` / `catch`, `throw`, `async` / `await`,
`Promise.then` / `Promise.finally`, `++` / `--`, `delete`,
`Array.prototype.forEach`, mutating array methods (`push`, `pop`, `shift`,
`unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin`),
`Object.assign` / `defineProperty` / `setPrototypeOf` and
`Reflect.set` / `deleteProperty` / `defineProperty`, assignment to object or
array members, the `any` keyword, and `as unknown as` double assertions.

Use `const`, `Array.map` / `filter` / `reduce` / `flatMap`, `Effect.all`,
`Effect.try` / `Effect.tryPromise`, and typed errors instead.

## Shell rule

Bash is banned; authored logic is TypeScript (the app, the Android supervisor)
or Nushell (dev/orchestration scripts and generated systemd units). `pnpm lint` also runs
`scripts/check-shell.ts`, which fails on any `.sh` / `.bash` / `.bats` file or
bash/POSIX shebang outside the allowlist. The only exceptions are the exec-only
Android module shims (see [`android.md`](./android.md#shims)) and Nix `stdenv`
build phases. Full rationale: [`design.md`](./design.md#shell-discipline).

## Tests

`test/` uses `vitest`; effectful code is run with `Effect.runSync` /
`runPromise`. New proxy/group mappings need a golden test, and
`test/example-config.test.ts` keeps `config.example.yaml` valid — update the
example whenever the config schema changes.
