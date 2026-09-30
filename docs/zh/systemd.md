# 用 systemd 部署（不使用 Nix）

Nix 用户应改用 [NixOS 模块](./nix.md)；它会以声明方式把这一切接好。本页面向其他
用户。

现成单元位于
[`contrib/systemd/`](https://github.com/LiAlH4qwq/hoyofall/tree/main/contrib/systemd)：

| 文件 | 用途 |
|---|---|
| `hoyofall.service` | 以加固的 `DynamicUser` 运行守护进程。 |
| `hoyofall.env.example` | `urlEnv` 订阅 token 的模板。 |
| `hoyofall-singbox.service` | 把片段复制进 sing-box 配置目录并重启 sing-box。 |
| `hoyofall-singbox.path` | 片段变化时触发上述服务。 |

## 1. 安装可执行文件

构建产物 `dist/index.js` 是自包含的（仅依赖 Node 内置模块），并已带
`#!/usr/bin/env node` shebang，因此可作为可执行文件安装（Node >= 26）：

```bash
pnpm install && pnpm build
sudo install -m 0755 dist/index.js /usr/local/bin/hoyofall
```

或者用 `nix build` 构建包（见 [nix.md](./nix.md)），再复制 `result/bin/hoyofall`
及其 `lib/` / `share/` 目录树。随附单元期望 `/usr/local/bin/hoyofall`；若你的路径不同
请改 `ExecStart`。

## 2. 配置

```bash
sudo install -d -m 0755 /etc/hoyofall
sudo cp config.example.yaml /etc/hoyofall/config.yaml
sudo install -m 0640 contrib/systemd/hoyofall.env.example /etc/hoyofall/hoyofall.env
```

编辑 `/etc/hoyofall/config.yaml`，让 `output.file` 指向服务的状态目录（由单元创建并
拥有）：

```yaml
output:
  file:
    enabled: true
    mode: aggregate
    path: /var/lib/hoyofall/fragment.json
```

优先使用 `urlEnv` 而非 `url`，并把密钥放进环境文件：

```yaml
subscriptions:
  airport:
    urlEnv: AIRPORT_URL
```

```bash
# /etc/hoyofall/hoyofall.env
AIRPORT_URL=https://example.com/subscribe?token=REPLACE_ME
```

## 3. 运行

```bash
sudo install -m 0644 contrib/systemd/hoyofall.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hoyofall.service
```

## 4. 把片段喂给 sing-box

sing-box 读取本地文件（`-c`）或目录（`-C`）；合并时对象按键覆盖、数组追加。要在每次
变化时把片段复制进 sing-box 的配置目录，请编辑 `hoyofall-singbox.service`，使源、
目标与 `install` 路径与你的系统一致，然后安装这两个单元：

```bash
sudo install -m 0644 contrib/systemd/hoyofall-singbox.service /etc/systemd/system/
sudo install -m 0644 contrib/systemd/hoyofall-singbox.path    /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hoyofall-singbox.path
```

最后，确保 sing-box 以 `-C /etc/sing-box/config.d` 启动（或手动合并片段），并在基础
配置已定义 `direct` / `block` 时保持 `convert.emitBuiltinOutbounds = false`。

如果你不想复制文件，可跳过集成单元，让 `output.file.path` 直接落在 sing-box 自己的
配置目录内，并用自己的 `.path` 单元监视该目录以重启 sing-box。
