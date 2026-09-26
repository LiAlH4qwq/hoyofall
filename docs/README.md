# hoyofall documentation

The [README](../README.md) is the quick tour. These pages are the reference.

| Page | Contents |
|---|---|
| [configuration.md](./configuration.md) | Every option, its type, default and meaning. |
| [usage.md](./usage.md) | CLI, HTTP endpoints, and importing the fragment into sing-box. |
| [nix.md](./nix.md) | Flake outputs, the NixOS module, and `singboxIntegration`. |
| [systemd.md](./systemd.md) | Running hoyofall as a systemd service without Nix. |
| [design.md](./design.md) | Functional guarantees and how they are enforced. |
| [development.md](./development.md) | Building, testing and the code-style rules. |

The machine-readable source of truth for configuration is the JSON Schema:

```bash
hoyofall --print-schema          # to stdout
# or, from a package: share/hoyofall/schema.json
```
