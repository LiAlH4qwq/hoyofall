# Nix

hoyofall ships a flake with:

| Output | Contents |
|---|---|
| `packages.<system>.hoyofall` (and `default`) | The Node bundle plus `share/hoyofall/schema.json`. |
| `packages.<system>.hoyofall-android` | All-in-one Magisk/KernelSU module for Android arm64 (hoyofall + sing-box + WebUI), assembled from prebuilt binaries. |
| `overlays.default` | Adds `pkgs.hoyofall`. |
| `nixosModules.default` | A single-instance `services.hoyofall` module. |

The NixOS module runs one `hoyofall.service`. The program itself is
single-instance and already handles many subscriptions, so one service is
enough.

## NixOS module

```nix
{
  inputs.hoyofall.url = "github:LiAlH4qwq/hoyofall";
  imports = [ inputs.hoyofall.nixosModules.default ];

  services.hoyofall = {
    enable = true;

    settings = {
      convert.emitBuiltinOutbounds = false;   # base defines direct/block
      subscriptions.default = {
        name = "default";
        urlEnv = "SUB_URL";
        intervalSeconds = 3600;
      };
      groups.custom = {
        "hk-auto" = { level = 1; type = "urltest"; includeRegexes = [ "HK" ]; };
        "us-auto" = { level = 1; type = "urltest"; includeRegexes = [ "US" ]; };
        # stable umbrella selector for sing-box to reference via route.final
        default = {
          level = 2;
          type = "selector";
          includeProxies = false;
          includeLevels = [ 1 ];
          includeDirect = true;
        };
      };
    };

    environmentFile = "/run/secrets/hoyofall.env";

    # let the module inject the fragment into services.sing-box
    singboxIntegration.enable = true;
  };

  services.sing-box = {
    enable = true;
    settings = {
      outbounds = [
        { type = "direct"; tag = "direct"; }
        { type = "block"; tag = "block"; }
      ];
      route.final = "default";   # provided by the hoyofall fragment
    };
  };

  # package only (without the module):
  # nixpkgs.overlays = [ inputs.hoyofall.overlays.default ];
  # environment.systemPackages = [ pkgs.hoyofall ];
}
```

### What the module does

- `hoyofall.service`: `DynamicUser`, `RuntimeDirectory=hoyofall` (0700),
  `WorkingDirectory=/run/hoyofall`. `settings` are validated against the shipped
  `schema.json` with `check-jsonschema` at build time. `output.file` defaults to
  `/run/hoyofall/hoyofall.json` / `/run/hoyofall`; other paths need
  `extraReadWritePaths`. `configFile` bypasses the output defaults.
- `singboxIntegration.enable`: installs a root oneshot that copies the fragment
  into sing-box's config directory (`-C` merge; objects override, arrays append),
  sets `RuntimeDirectoryPreserve=yes`, and adds a `systemd.paths` unit that
  re-injects and restarts sing-box when the fragment changes. It requires
  `services.sing-box.enable = true`.
- All generated scripts are **Nushell** (`pkgs.writers.writeNu`), never bash.

### Notes

- Keep `convert.emitBuiltinOutbounds = false` (the default) when the base
  `settings` define `direct`/`block`; duplicate tags make sing-box fail.
- Reference a stable umbrella group (as `default` above) instead of per-region
  groups that may be absent; a missing referenced tag makes sing-box fail.
- Custom groups may reference other custom groups regardless of definition order
  (Nix attribute sets are sorted alphabetically).
- When the subscription URL comes from sops (`urlEnv` + `sops.templates`), add
  `systemd.services.hoyofall.requires` / `.after = [ "sops-install-secrets.service" ]`
  so `EnvironmentFile` exists on first activation.

## Android

`nix/android.nix` assembles the flashable all-in-one module from **prebuilt
binaries** — Termux aarch64 Node/Nushell and their shared libraries, plus the
upstream sing-box Android build — fetched as fixed-output derivations and
staged/zipped directly in the derivation:

```bash
nix build .#hoyofall-android   # result/{module,hoyofall-android-arm64.zip}
```

nixpkgs' `pkgsCross.aarch64-android*` sets are deliberately not used: they are
uncached and broken when built from source (compiler-rt, tzdata, …). Every Termux
package is a fixed-output download, so the build runs offline once fetched;
versions/hashes are pinned in `nix/android.nix`. Full guide:
[android.md](./android.md).

## Updating the package

`nix/package.nix` builds with pnpm + rolldown. pnpm's store format changes
between majors, so the flake pins `pnpm_12` and the dependency hash is a
per-system map (`pnpmDepsHashes`, with a `default`). Refresh it when
`pnpm-lock.yaml` or the pnpm major changes: set the hash to `lib.fakeHash`, run
`nix build .#hoyofall` on that system, and copy the reported `got: sha256-…`
value (add a system override if it differs from `default`).
