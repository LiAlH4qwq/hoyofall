# Development

See [`AGENTS.md`](../AGENTS.md) for the full code-style rules (functional AST
rules, Effect conventions, boundary typing). In short: no imperative constructs,
convert into `Effect` at boundaries, no broad `Effect.catchAll`, and never bypass
the type system.

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint + scripts/check-ast.ts
pnpm check:ast   # AST-level functional-rule enforcement only
pnpm test        # vitest
pnpm check       # typecheck + lint + ast + test
pnpm build       # rolldown bundle + JSON schema
pnpm dev --config config.yaml
```

## Layout

- `src/config/` – configuration `Schema`, loading and validation
- `src/mihomo/` – subscription decoding (Schema per proxy/group type)
- `src/convert/` – pure mihomo → sing-box conversion
- `src/pipeline/` – refresh streams, snapshot cache (`Stream.scan` + `PubSub`)
- `src/output/` – atomic file output
- `src/server/` – optional HTTP endpoints
- `src/diagnostics.ts` – CLI usage and friendly error formatting
- `scripts/check-ast.ts` – AST enforcement of the rules below
- `nix/` – `package.nix`, `overlay.nix`, NixOS `module.nix`; `flake.nix`

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

## Tests

`test/` uses `vitest`; effectful code is run with `Effect.runSync` /
`runPromise`. New proxy/group mappings need a golden test, and
`test/example-config.test.ts` keeps `config.example.yaml` valid — update the
example whenever the config schema changes.
