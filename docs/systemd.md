# Deploying with systemd (no Nix)

Nix users should use the [NixOS module](./nix.md) instead; it wires all of this
up declaratively. This page is for everyone else.

Ready-made units live in [`contrib/systemd/`](../contrib/systemd/):

| File | Purpose |
|---|---|
| `hoyofall.service` | Runs the daemon as a hardened `DynamicUser`. |
| `hoyofall.env.example` | Template for `urlEnv` subscription tokens. |
| `hoyofall-singbox.service` | Copies the fragment into sing-box's config directory and restarts sing-box. |
| `hoyofall-singbox.path` | Triggers the above whenever the fragment changes. |

## 1. Install the binary

The build output `dist/index.js` is self-contained (Node builtins only) and
already carries a `#!/usr/bin/env node` shebang, so it can be installed as an
executable (Node >= 26):

```bash
pnpm install && pnpm build
sudo install -m 0755 dist/index.js /usr/local/bin/hoyofall
```

Alternatively, build the package with `nix build` (see [nix.md](./nix.md)) and
copy `result/bin/hoyofall` and its `lib/` / `share/` trees. The shipped unit
expects `/usr/local/bin/hoyofall`; edit `ExecStart` if yours differs.

## 2. Configure

```bash
sudo install -d -m 0755 /etc/hoyofall
sudo cp config.example.yaml /etc/hoyofall/config.yaml
sudo install -m 0640 contrib/systemd/hoyofall.env.example /etc/hoyofall/hoyofall.env
```

Edit `/etc/hoyofall/config.yaml` so that `output.file` points at the service's
state directory, which the unit creates and owns:

```yaml
output:
  file:
    enabled: true
    mode: aggregate
    path: /var/lib/hoyofall/fragment.json
```

Prefer `urlEnv` over `url` and put the secret in the environment file:

```yaml
subscriptions:
  airport:
    urlEnv: AIRPORT_URL
```

```bash
# /etc/hoyofall/hoyofall.env
AIRPORT_URL=https://example.com/subscribe?token=REPLACE_ME
```

## 3. Run

```bash
sudo install -m 0644 contrib/systemd/hoyofall.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hoyofall.service
```

## 4. Feed the fragment to sing-box

sing-box reads local files (`-c`) or a directory (`-C`); when merging, objects
override by key and arrays append. To copy the fragment into sing-box's config
directory on every change, edit `hoyofall-singbox.service` so the source,
destination and `install` path match your system, then install both units:

```bash
sudo install -m 0644 contrib/systemd/hoyofall-singbox.service /etc/systemd/system/
sudo install -m 0644 contrib/systemd/hoyofall-singbox.path    /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hoyofall-singbox.path
```

Finally, make sure sing-box is started with `-C /etc/sing-box/config.d` (or merge
the fragment manually) and keep `convert.emitBuiltinOutbounds = false` when your
base config already defines `direct` / `block`.

If you would rather not copy files, skip the integration units, point
`output.file.path` directly inside sing-box's own config directory, and watch
that directory with your own `.path` unit that restarts sing-box.
