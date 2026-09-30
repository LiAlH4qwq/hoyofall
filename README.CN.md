# hoyofall

[English](./README.md) · **简体中文**

> 把 mihomo（Clash.Meta）订阅持续、原子地转换为 sing-box `outbounds`
> ——可证明的类型安全。

[![CI](https://github.com/LiAlH4qwq/hoyofall/actions/workflows/ci.yml/badge.svg)](https://github.com/LiAlH4qwq/hoyofall/actions/workflows/ci.yml)
[![Website](https://github.com/LiAlH4qwq/hoyofall/actions/workflows/pages.yml/badge.svg)](https://github.com/LiAlH4qwq/hoyofall/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

hoyofall 按各自独立的间隔抓取任意数量的 mihomo 订阅，转换为 sing-box
`outbounds`，并把可导入的片段写入磁盘（另可选 HTTP 与 WebUI 控制面，供 GUI 与调试
使用）。它是一个小巧、**可证明类型安全**的守护进程：使用 TypeScript 与
[Effect](https://effect.website/)，没有 `let`、循环、`try`/`catch` 或 `any`。
`pnpm lint` 中的 AST 检查器会在出现任何违禁构造时让构建失败，因此整个程序都是纯数据
流，所有失败都进入类型化错误通道。

## 安装

NixOS 模块：

```nix
{
  inputs.hoyofall.url = "github:LiAlH4qwq/hoyofall";
  imports = [ inputs.hoyofall.nixosModules.default ];

  services.hoyofall = {
    enable = true;
    settings.subscriptions.default = { urlEnv = "SUB_URL"; };
    environmentFile = "/run/secrets/hoyofall.env";
    singboxIntegration.enable = true;
  };
}
```

包 / 独立部署（`contrib/systemd/` 为非 Nix 用户提供加固单元）：

```bash
nix build github:LiAlH4qwq/hoyofall      # ./result/bin/hoyofall
nix profile install github:LiAlH4qwq/hoyofall
```

Android（一体化 Magisk/KernelSU 模块，从预编译二进制组装）：

```bash
nix build .#hoyofall-android             # result/hoyofall-android-arm64.zip
```

## 文档

完整文档见 **<https://LiAlH4qwq.github.io/hoyofall/zh/>**
（[English](https://LiAlH4qwq.github.io/hoyofall/en/)）：

- [配置](https://LiAlH4qwq.github.io/hoyofall/zh/configuration.html)——每个选项、类型与默认值。
- [使用](https://LiAlH4qwq.github.io/hoyofall/zh/usage.html)——CLI、HTTP 端点、导入 sing-box。
- [Nix](https://LiAlH4qwq.github.io/hoyofall/zh/nix.html)——flake 输出与 NixOS 模块。
- [systemd](https://LiAlH4qwq.github.io/hoyofall/zh/systemd.html)——不使用 Nix 的部署方式。
- [Android](https://LiAlH4qwq.github.io/hoyofall/zh/android.html)——Magisk/KernelSU 模块。
- [设计与保证](https://LiAlH4qwq.github.io/hoyofall/zh/design.html)——函数式纪律如何被强制执行。
- [开发](https://LiAlH4qwq.github.io/hoyofall/zh/development.html)——构建、测试与 AST 规则。

## 支持的转换

代理：`ss`、`vmess`、`vless`、`trojan`、`hysteria`、`hysteria2`、`tuic`、
`wireguard`、`http`、`socks5`、`anytls`。组：来自 `groups.custom` 的正则/类型化
selector 与 urltest，以及转换后的原生 `proxy-groups`。其余一律作为类型化警告跳过，
或在 `onUnsupported: fail` 时令订阅失败。

## 许可证

hoyofall 自身的代码为 [MIT](./LICENSE)。Android 模块还按其自身条款再分发第三方
二进制——最显著的是
[GPL-3.0-or-later](https://github.com/LiAlH4qwq/hoyofall/blob/main/licenses/GPL-3.0-or-later.txt)
的 sing-box——因此可刷入模块是聚合体，而非对 MIT 的重新许可。见
[THIRD_PARTY_LICENSES.md](https://github.com/LiAlH4qwq/hoyofall/blob/main/THIRD_PARTY_LICENSES.md)。
