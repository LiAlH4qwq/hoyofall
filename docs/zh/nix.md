# Nix

hoyofall 提供一个 flake，包含：

| 输出 | 内容 |
|---|---|
| `packages.<system>.hoyofall`（及 `default`） | Node 产物加上 `share/hoyofall/schema.json`。 |
| `packages.<system>.hoyofall-android` | 面向 Android arm64 的一体化 Magisk/KernelSU 模块（hoyofall + sing-box + WebUI），从预编译二进制组装。 |
| `overlays.default` | 添加 `pkgs.hoyofall`。 |
| `nixosModules.default` | 单实例 `services.hoyofall` 模块。 |

NixOS 模块只运行一个 `hoyofall.service`。程序本身是单实例的，已经能处理多个订阅，
因此一个服务足矣。

## NixOS 模块

```nix
{
  inputs.hoyofall.url = "github:LiAlH4qwq/hoyofall";
  imports = [ inputs.hoyofall.nixosModules.default ];

  services.hoyofall = {
    enable = true;

    settings = {
      convert.emitBuiltinOutbounds = false;   # 基础配置已定义 direct/block
      subscriptions.default = {
        name = "default";
        urlEnv = "SUB_URL";
        intervalSeconds = 3600;
      };
      groups.custom = {
        "hk-auto" = { level = 1; type = "urltest"; includeRegexes = [ "HK" ]; };
        "us-auto" = { level = 1; type = "urltest"; includeRegexes = [ "US" ]; };
        # 供 sing-box 通过 route.final 引用的稳定总括 selector
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

    # 让模块把片段注入 services.sing-box
    singboxIntegration.enable = true;
  };

  services.sing-box = {
    enable = true;
    settings = {
      outbounds = [
        { type = "direct"; tag = "direct"; }
        { type = "block"; tag = "block"; }
      ];
      route.final = "default";   # 由 hoyofall 片段提供
    };
  };

  # 只用包（不使用模块）：
  # nixpkgs.overlays = [ inputs.hoyofall.overlays.default ];
  # environment.systemPackages = [ pkgs.hoyofall ];
}
```

### 模块做了什么

- `hoyofall.service`：`DynamicUser`、`RuntimeDirectory=hoyofall`（0700）、
  `WorkingDirectory=/run/hoyofall`。`settings` 在构建时用 `check-jsonschema` 按随包
  的 `schema.json` 校验。`output.file` 默认为 `/run/hoyofall/hoyofall.json` /
  `/run/hoyofall`；其他路径需要 `extraReadWritePaths`。`configFile` 会绕过输出默认值。
- `singboxIntegration.enable`：安装一个 root oneshot，把片段复制进 sing-box 的配置
  目录（`-C` 合并；对象覆盖、数组追加），设置 `RuntimeDirectoryPreserve=yes`，并添加
  一个 `systemd.paths` 单元，在片段变化时重新注入并重启 sing-box。它要求
  `services.sing-box.enable = true`。
- 所有生成的脚本都是 **Nushell**（`pkgs.writers.writeNu`），绝不用 bash。

### 注意事项

- 当基础 `settings` 已定义 `direct`/`block` 时，保持
  `convert.emitBuiltinOutbounds = false`（默认值）；重复 tag 会让 sing-box 失败。
- 引用稳定的总括组（如上文的 `default`），而不要引用可能缺席的按地区组；引用缺失的
  tag 会让 sing-box 失败。
- 自定义组可以无视定义顺序互相引用（Nix attribute set 会按字母序排序）。
- 当订阅 URL 来自 sops（`urlEnv` + `sops.templates`）时，添加
  `systemd.services.hoyofall.requires` / `.after = [ "sops-install-secrets.service" ]`，
  以确保首次激活时 `EnvironmentFile` 已存在。

## Android

`nix/android.nix` 从**预编译二进制**组装可刷入的一体化模块——Termux aarch64 的
Node 及其共享库，加上上游 sing-box Android 构建——作为 fixed-output derivation 抓取，
再加一个交叉编译的 `tsnix`，并在 derivation 内直接分阶段打包/压缩：

```bash
nix build .#hoyofall-android   # result/{module,hoyofall-android-arm64.zip}
```

`tsnix` 由 `nix/tsnix-android.nix` 使用 nixpkgs 的
`pkgsCross.aarch64-android-prebuilt`（配合 NDK）从源码为 Android bionic 构建；模块其余
部分都是 fixed-output 下载，因此抓取后构建可离线运行；
抓取完成后构建可离线进行；版本/哈希固定在 `nix/android.nix`。完整指南见
[android.md](./android.md)。

## 更新包

`nix/package.nix` 使用 pnpm + rolldown 构建。pnpm 的 store 格式会跨大版本变化，因此
flake 固定 `pnpm_12`，依赖哈希是按系统分列的映射（`pnpmDepsHashes`，带 `default`）。
当 `pnpm-lock.yaml` 或 pnpm 大版本变化时刷新它：把哈希设为 `lib.fakeHash`，在该系统
上运行 `nix build .#hoyofall`，然后复制报告的 `got: sha256-…` 值（若与 `default`
不同则添加系统覆盖项）。
