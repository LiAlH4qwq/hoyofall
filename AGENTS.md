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
pnpm lint        # eslint . && tsx scripts/check-ast.ts
pnpm check:ast   # AST-level functional-rule enforcement only
pnpm test        # vitest
pnpm check       # typecheck + lint + ast + test
pnpm build       # rolldown bundle + JSON schema (dist/)
pnpm dev --config config.yaml
```

## Layout

- `src/config/` – configuration `Schema`, loading and validation
- `src/mihomo/` – subscription decoding (Schema per proxy/group type)
- `src/convert/` – pure mihomo → sing-box conversion
- `src/pipeline/` – refresh streams, snapshot cache (`Stream.scan` + `PubSub`)
- `src/output/` – atomic file output; `src/server/` – optional HTTP endpoints
- `src/diagnostics.ts` – CLI usage and friendly error formatting
- `scripts/check-ast.ts` – AST enforcement of the rules below
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

Replace the forbidden constructs with `const`, `Array.map` / `filter` /
`reduce` / `flatMap`, `Effect.all`, `Effect.try` / `Effect.tryPromise`,
`Match`, and typed errors.

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

- `flake-parts`: `perSystem.packages.hoyofall` (and `default`), `overlays`,
  `nixosModules`.
- `nix/package.nix` builds with pnpm + rolldown; if a dependency changes, the
  `pnpmDeps.hash` in `nix/package.nix` must be refreshed (build, then copy the
  `got:` hash from the mismatch).
- `nix/module.nix` generates one `hoyofall-<name>` systemd service per
  `services.hoyofall.instances.<name>` and validates settings against the
  shipped `schema.json` with `check-jsonschema`. For `settings`-based instances
  it defaults `output.file.path` / `output.file.directory` to
  `/run/hoyofall-<name>/hoyofall.json` and `/run/hoyofall-<name>` (the service
  RuntimeDirectory and WorkingDirectory); other output paths require
  `extraReadWritePaths`.
