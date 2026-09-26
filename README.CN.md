# hoyofall

[English](./README.md) · **简体中文**

> 把 mihomo（Clash.Meta）订阅持续、原子地转换为 sing-box `outbounds`
> ——无 WebUI。

hoyofall 是一个小巧的无头后台服务：按各自独立的间隔抓取任意数量的 mihomo
订阅，转换为 sing-box `outbounds`，并将可导入的片段写入磁盘（另可选 HTTP 端点，
供 GUI 与调试使用）。

为什么必须落盘？sing-box 核心**无法通过 HTTP 导入配置**——它只读取本地文件
（`-c`）或目录（`-C`）；多配置合并时对象按键覆盖、数组追加，因此片段的
`outbounds` 数组会直接拼进基础配置。

## 亮点

- **函数式且可证明。** 使用 TypeScript 与 [Effect](https://effect.website/)：无
  `let`、无循环、无 `try`/`catch`、无 `any`。`pnpm lint` 中的 AST 检查器会在出现
  任何违禁构造时让构建失败，因此整个程序都是纯数据流，所有失败都进入类型化错误通道。
- **安全内建。** 通过 `urlEnv` 让 token 不落入文件；NixOS 模块与随附 systemd
  单元以加固的 `DynamicUser` 运行；片段采用 `tmp` + `rename` 原子写入。
- **声明式 Nix 支持。** flake 提供包、overlay 与 NixOS 模块；模块在构建时用 JSON
  Schema 校验 `settings`，并可接管向 `services.sing-box` 的注入。
- **单实例，多订阅。** 每个订阅独立间隔刷新；结果合并，并可选地按正则生成
  `selector`/`urltest` 组。
- **随处可跑。** 为非 Nix 用户提供加固的 systemd 单元。

## 快速开始 —— NixOS

```nix
{
  inputs.hoyofall.url = "github:LiAlH4qwq/hoyofall";
  imports = [ inputs.hoyofall.nixosModules.default ];

  services.hoyofall = {
    enable = true;
    settings = {
      subscriptions.default = { urlEnv = "SUB_URL"; };
      groups.custom = {
        "hk-auto" = { type = "urltest"; includeRegexes = [ "HK" ]; };
        default = {
          type = "selector";
          includeProxies = false;
          includeCustomGroups = true;
          includeDirect = true;
        };
      };
    };
    environmentFile = "/run/secrets/hoyofall.env";
    singboxIntegration.enable = true;
  };
}
```

模块运行单个 `hoyofall.service`，在构建时用随包 JSON Schema 校验 `settings`，
并在启用 `singboxIntegration` 时把片段注入 `services.sing-box`、变更后重启它。
完整选项与注意事项见 [docs/nix.md](./docs/nix.md)（英文）。

## 快速开始 —— systemd（无 Nix）

```bash
git clone https://github.com/LiAlH4qwq/hoyofall && cd hoyofall
pnpm install && pnpm build                 # 产出 dist/index.js
sudo install -d /etc/hoyofall /usr/local/lib/hoyofall
sudo install -m 0644 dist/index.js /usr/local/lib/hoyofall/index.js
sudo install -m 0644 config.example.yaml /etc/hoyofall/config.yaml
```

用一行 `node` shim 包装为 `/usr/local/bin/hoyofall`，将
`output.file.path` 指向 `/var/lib/hoyofall/fragment.json`，再安装
[`contrib/systemd/hoyofall.service`](./contrib/systemd/hoyofall.service)：

```bash
sudo install -m 0644 contrib/systemd/hoyofall.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hoyofall.service
```

含可选 sing-box 刷新单元的逐步说明见 [docs/systemd.md](./docs/systemd.md)（英文）。

## 仅安装包

```bash
nix build github:LiAlH4qwq/hoyofall        # ./result/bin/hoyofall
# 或
nix profile install github:LiAlH4qwq/hoyofall
```

```bash
hoyofall --config /etc/hoyofall/config.yaml
hoyofall --print-schema          # 打印配置 JSON Schema
hoyofall --help
```

## 文档

| 页面 | 内容 |
|---|---|
| [Configuration](./docs/configuration.md) | 每个选项、类型与默认值。 |
| [Usage](./docs/usage.md) | CLI、HTTP 端点、导入 sing-box。 |
| [Nix](./docs/nix.md) | flake 输出与 NixOS 模块。 |
| [systemd](./docs/systemd.md) | 不使用 Nix 的运行方式。 |
| [Design](./docs/design.md) | 函数式保证及其强制方式。 |
| [Development](./docs/development.md) | 构建、测试与 AST 规则。 |

（文档正文为英文。）

## 支持的转换

代理：`ss`、`vmess`、`vless`、`trojan`、`hysteria`、`hysteria2`、`tuic`、
`wireguard`、`http`、`socks5`、`anytls`。

分组：由实例级 `groups.custom`（推荐）或订阅内分组，通过正则与类型化成员匹配
订阅名与实体名生成。native `proxy-groups`（`groups.native.enable`）映射
`select → selector`、`url-test → urltest`、`fallback → urltest`、
`load-balance → selector`。

其余类型会作为类型化警告跳过；设置 `onUnsupported: fail` 可让整个订阅失败。

## 许可证

[MIT](./LICENSE)
