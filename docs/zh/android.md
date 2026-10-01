# Android（Magisk / KernelSU / SuKiSU / ReSuKiSU）

hoyofall 在 Android 上以**一体化 Magisk 格式模块**形式发布。它在预编译的 Android
**Node** 上运行与其他平台相同的 `dist/index.js` 产物，用 **Node + Effect** 应用守护
自身，并额外打包与守护 **sing-box**，全部通过 KernelSU 系 **WebUI** 控制。它可原样安装在
Magisk、KernelSU、SuKiSU 与 ReSuKiSU 上——它们共享同一模块格式。

```
mihomo 订阅 (HTTPS)
        │  bin/node + index.js                 WebUI (KernelSU ksu.exec)
        ▼                                            │ supervisor.js control
/data/adb/hoyofall/hoyofall/out/fragment.json   (原子写)   ▼
        │  bin/sing-box run -c … -C out   ◄── supervisor.js service
        ▼
   tun / 混合代理
```

> 当前模块刻意保持**一体化**。未来的版本会把它拆成互相独立的模块（Node、通用
> Node + Effect 守护进程、hoyofall 应用、sing-box、WebUI）；预期的拆分方式、接口与
> 迁移注意事项见 [`android-future.md`](./android-future.md)，面向人类与智能体。

## 为什么用 Node，而不是重写

[Perry](https://github.com/PerryTS/perry) 能把 TypeScript 编译为原生代码，但它的
Android 目标产出的是 **JNI 应用**，而非 shell 守护进程；而且 `effect` 依赖 `Proxy`
与 Node 内部机制，Perry 只部分支持。围绕另一个运行时重写应用是移植，而不是一个构建
开关。移植 Node（它本就能运行这份产物）是更小、更稳妥的改动。

## 如何构建

模块由作为 fixed-output derivation 抓取的**预编译二进制**组装。唯一从源码构建的部分是
**tsnix**（WebUI 的 Nix 模式所用的无 store Nix 求值器）：`nix/tsnix-android.nix` 用 NDK
把它交叉编译到 Android bionic，从而让模块保持小巧。`nix/android.nix` 抓取：

| 组件 | 来源 |
|---|---|
| Node.js (aarch64) | Termux `nodejs` 包 |
| 运行时库 + CA 证书包 | Termux（`libc++`、`openssl`、`c-ares`、`libicu`、`libsqlite`、`zlib`、`libffi`、`ca-certificates`） |
| sing-box (arm64) | SagerNet Android 发布版 |
| tsnix (arm64) | 由 `nix/tsnix-android.nix` 从 `github:lialh4qwq/tsnix` 构建 |

它们都是 fixed-output derivation，因此所有下载都发生在构建之前，构建阶段可离线运行。
flake 会把模块载荷、hoyofall 产物与 JSON Schema、WebUI 产物与许可证文本分阶段放置，
然后写出 `result/module/` 与 `result/hoyofall-android-arm64.zip`：

```bash
nix build .#hoyofall-android
# -> result/module/ 和 result/hoyofall-android-arm64.zip
```

nixpkgs 的 `pkgsCross.aarch64-android*` 合集被刻意弃用：它们未缓存，且从源码构建时是
坏的（`compiler-rt`、`tzdata`……）。

`android/` 保存模块载荷
（[`module/`](https://github.com/LiAlH4qwq/hoyofall/tree/main/android/module)）、WebUI
源码（[`webui/`](https://github.com/LiAlH4qwq/hoyofall/tree/main/android/webui)），
以及
[`android/README.md`](https://github.com/LiAlH4qwq/hoyofall/blob/main/android/README.md)
中的概览。

## 安装

1. 在模块管理器中刷入 `hoyofall-android-arm64.zip` 并重启。
2. 预置的 `hoyofall.env` 把 `HOYOFALL_SUB_URL` 定义为一个占位值
   （`http://127.0.0.1:9/disabled`），使守护进程能启动、写出空片段，并在你配置期间
   **不会**重启循环。在 `/data/adb/hoyofall/hoyofall/hoyofall.env` 中设置你的订阅
   URL（`HOYOFALL_SUB_URL=https://…`）；token 永远不会落入 `config.yaml`。可在 WebUI
   的配置标签页或直接在磁盘上编辑它。
3. 如需不同的组，调整 `/data/adb/hoyofall/hoyofall/config.yaml`。
4. 如有需要，调整 `/data/adb/hoyofall/android.conf` 中的守护设置。

## WebUI

模块随附一个 `webroot/` React 应用，KernelSU 系管理器会把它显示为模块 UI。它通过
KernelSU WebUI API（`ksu.exec`）与系统交互，因此在 KernelSU / SuKiSU / ReSuKiSU 上
可从模块页面打开。**Magisk 没有内建的模块 WebUI**，因此建议 Magisk 用户安装独立的
KernelSU WebUI 实现——
[`KsuWebUIStandalone`](https://github.com/5ec1cff/KsuWebUIStandalone)（在 APatch 上
同样可用）——再从那里打开 hoyofall。两种方式都没有 Magisk 操作按钮。UI 包含一个
**仪表盘**、每个服务（hoyofall 与 sing-box）的 **Control / Config / Log** 页面，并
完全由守护进程的 `control` 命令支撑：

- **仪表盘**——各服务的实时状态与启动/停止/重启。
- **Control**——每个服务的状态（enabled/running/supervisor）与操作。启动/停止会写入/
  删除服务的 `disabled` 标志（例如 `/data/adb/hoyofall/hoyofall/disabled`、
  `/data/adb/hoyofall/sing-box/disabled`），守护进程会遵循它，因此变更立即生效，无需
  重启。
- **Config**——由守护进程的 `control` 命令支撑：
  - **Nix**（默认）：编辑 `config.nix` 源文档，由随附的 **tsnix**（无 store 的 Nix
    求值器）在设备上渲染为 YAML/JSON，并在替换生效配置前校验。`tsnix eval --io local`
    支持相对 `import`；store builtin 会被明确拒绝。渲染或校验失败时运行中的配置不受
    影响，源文档仍会保存。
  - **Form**（仅 hoyofall）：由守护进程所用的同一份 Effect `Config` schema 生成的表单，
    带内联校验与保留注释的 YAML 编辑。
  - **Raw**：带 YAML/JSON 高亮的 CodeMirror 编辑器。
  Nix 通过 `set-source`（base64）保存；Form/Raw 通过 `set-config` 保存。两者都会在原子
  提交前用服务自身的检查器校验候选配置。
- **Log**——智能日志视图（行过滤、跟随/自动滚动），通过守护进程的 `log` 动作读取最后
  300 行。

该应用用 TypeScript/TSX 写在 `android/webui/` 下，并由本仓库的 rolldown 打包为
`webroot/app.js`（`pnpm build:webui`，属于 `pnpm build` 的一部分）。它是一个 pnpm
工作区包（`android/webui/package.json`），使用 React、Effect 与 CodeMirror；在那里添加
更多包，rolldown 会把它们一并打包。

该守护进程与控制面位于 `android/supervisor/`（Node + Effect，是一个 pnpm 工作区包），
由 rolldown 打包为 `android/module/supervisor.js`（`pnpm build:supervisor`，属于
`pnpm build` 的一部分）；shim 会 `exec` `bin/node supervisor.js <command>`。

```bash
# 控制协议也可直接使用
su -c '/system/bin/env LD_LIBRARY_PATH=/data/adb/modules/hoyofall/lib /data/adb/modules/hoyofall/bin/node /data/adb/modules/hoyofall/supervisor.js control status sing-box'
```

`supervisor.js control <action> [service]` 的动作：`status`、`start`、`stop`、
`restart`、`config`、`config-source`、`set-config`（从 `HOYOFALL_CONFIG_B64` 取
base64）、`render-config`、`set-source`（同样从该变量取 base64）、`log`；`service` 为
`hoyofall` 或 `sing-box`（不带 service 的 `status` 会列出两者）。
`set-config`/`set-source` 在提交前会用服务自身的检查器校验候选配置，`render-config`
只渲染不写入（`hoyofall --check`；sing-box 没有独立检查器，因为它的配置会与片段合并）。
守护进程以 root 运行，与模块中的其他一切相同。

## sing-box

sing-box 随模块打包（`bin/sing-box`，上游 **Android arm64** 构建），并像 hoyofall
一样被守护。它的数据目录是 `/data/adb/hoyofall/sing-box/`：配置为 `config.json`
（预置一个安全默认值：一个 `127.0.0.1:7890` 混合入站与一个 `direct` 出站），日志为
`log/sing-box.log`，`cache/` 是它的工作目录（`-D`）——sing-box 的缓存以及它下载的任何
Clash-API 外部 UI 都落在这里。可在 WebUI 的 **sing-box** 标签页启动/停止/重启/编辑/
查看它。

守护进程运行
`sing-box run -c …/sing-box/config.json -C /data/adb/hoyofall/hoyofall/out -D /data/adb/hoyofall/sing-box/cache`，
因此 hoyofall 的片段目录会被自动合并进来；在 `config.json` 中设置 `route.final`
（以及入站）即可经某个 hoyofall 组路由。由于 sing-box 在启动时只读取一次配置，模块会在
**hoyofall 每次写出新片段时重启它**（在 `/data/adb/hoyofall/android.conf` 中设
`restart_singbox_on_change = false` 可退出该行为），或启用下面的外部监视器来喂给一个
独立的 sing-box 模块。

若要改为喂给一个*独立*的 sing-box 模块，守护进程还带有一个可选的监视器，会把
原子片段复制进那个模块的配置目录，并在变化时运行重载钩子——在
`/data/adb/hoyofall/android.conf`（TOML）中配置：

```toml
watch_singbox = true
singbox_dir = "/data/adb/box/conf"                 # 外部 sing-box 配置目录
singbox_target = "hoyofall.json"
singbox_reload = ["/system/bin/pkill", "-HUP", "sing-box"]
watch_interval_seconds = 5
```

`singbox_dir = ""` 会禁用注入；hoyofall 仍会写出
`/data/adb/hoyofall/hoyofall/out/fragment.json`。该监视器是幂等的：它对片段做哈希，
只在变化时采取行动。

## Shims

Magisk/KernelSU 模块 API 用系统 shell 执行 `customize.sh`、`post-fs-data.sh`、
`service.sh` 与 `uninstall.sh`，因此这四个文件是本仓库允许的**唯一** shell 脚本。每个
文件都以硬编码路径 `exec` 随附的 Node 运行时，且**没有任何逻辑**（预编译载荷的 `lib/`
通过 `/system/bin/env` 放进 `LD_LIBRARY_PATH`，因为 shim 在守护进程能设置它之前就运行了
`node`）：

```sh
#!/system/bin/sh
exec /system/bin/env LD_LIBRARY_PATH=/data/adb/modules/hoyofall/lib /data/adb/modules/hoyofall/bin/node /data/adb/modules/hoyofall/supervisor.js service
```

`customize.sh` 是唯一的例外：Magisk 安装器会应用默认模块权限（文件 `0644`），在任何
shim 运行之前就清除了 `bin/node` 与 `bin/sing-box` 的执行位，因此 `customize.sh` 用一条
`chmod` 恢复它：

```sh
#!/system/bin/sh
chmod 0755 "$MODPATH"/bin/* "$MODPATH"/*.sh
```

所有行为都存在于 `supervisor.js` 对应的子命令里，其源码位于 `android/supervisor/`。
`scripts/check-shell.ts` 恰好把这些文件列入白名单；其他任何文件都会被 `pnpm lint` 拒绝。

## 设备上的目录布局

| 路径 | 内容 |
|---|---|
| `/data/adb/modules/hoyofall/` | 仅代码：shim、`supervisor.js`、`bin/node`、`bin/sing-box`、`index.js`、`schema.json`、`lib/`、`webroot/`、预置 `config/`。 |
| `/data/adb/hoyofall/` | 全局数据目录。守护设置 `android.conf` 在此；每个应用拥有一个子目录。 |
| `/data/adb/hoyofall/android.conf` | 守护设置：外部 sing-box 监视器、重启策略、间隔（TOML）。 |
| `/data/adb/hoyofall/hoyofall/` | hoyofall 数据目录。 |
| `/data/adb/hoyofall/hoyofall/config.yaml` | hoyofall 配置（首次启动时预置）。 |
| `/data/adb/hoyofall/hoyofall/config.nix` | 供 WebUI Nix 模式使用的 Nix 源文档；渲染为 `config.yaml`。 |
| `/data/adb/hoyofall/hoyofall/hoyofall.env` | 订阅 token（`urlEnv`）。 |
| `/data/adb/hoyofall/hoyofall/out/fragment.json` | 原子聚合片段；也是 sing-box 的 `-C` 目录。 |
| `/data/adb/hoyofall/hoyofall/disabled` | 通过 WebUI/控制协议停止 hoyofall 时存在。 |
| `/data/adb/hoyofall/hoyofall/log/hoyofall.log` | hoyofall 的 stdout/stderr。 |
| `/data/adb/hoyofall/sing-box/` | sing-box 数据目录。 |
| `/data/adb/hoyofall/sing-box/config.json` | sing-box 配置（预置）。 |
| `/data/adb/hoyofall/sing-box/config.nix` | 供 WebUI Nix 模式使用的 Nix 源文档；渲染为 `config.json`。 |
| `/data/adb/hoyofall/sing-box/cache/` | sing-box 工作目录（`-D`）：缓存与任何 Clash-API 外部 UI。 |
| `/data/adb/hoyofall/sing-box/disabled` | sing-box 停止时存在。 |
| `/data/adb/hoyofall/sing-box/log/sing-box.log` | sing-box 的 stdout/stderr。 |

## 安全说明

- 模块以 **root** 运行（模块管理器的上下文）。Node 守护进程会抓取远程订阅，因此请保证
  模块管理器及其下载可信，并优先使用 `hoyofall.env` 中的 `urlEnv` token，而非
  `config.yaml`。
- HTTPS 使用 Node 的 CA 存储。Nix 构建的模块把 Termux 的 `ca-certificates` 打包为
  `module/etc/ssl/cert.pem`，守护进程通过 `SSL_CERT_FILE`/
  `NODE_EXTRA_CA_CERTS` 导出它；额外根证书也可通过
  `SSL_CERT_DIR=/system/etc/security/cacerts` 设置。不要在 shim 中硬编码它们。
- 模块把 Node 的共享库打包在 `module/lib/`；shim 把该目录放进 `LD_LIBRARY_PATH`。
- 片段采用原子写入（临时文件 + `rename`），因此即便守护进程在写入中途被杀，读取方也
  不会看到不完整的文件。

## 更新固定版本

`nix build .#hoyofall-android` 在 `nix/android.nix` 中固定预编译二进制：Termux 包
（`nodejsDeb`、运行时库与 CA 包）以及 `singbox`（上游 SagerNet Android 发布版）。
`tsnix` 不以哈希固定：它由 `tsnix` flake input 构建（`nix/tsnix-android.nix`），因此刷新
它意味着更新 `flake.lock` 中的该 input（`nix flake update tsnix`）。

刷新 Termux：在 Termux `stable` aarch64 索引
（`https://packages.termux.dev/apt/termux-main/dists/stable/main/binary-aarch64/Packages.gz`）
中查到当前的 `Version`、`Filename` 与 `SHA256`，把十六进制 SHA 转成 SRI
（`nix hash to-sri --type sha256 <hex>`），并更新 `deb` 调用；若某包的 `Depends` 行
变化，调整 `needed` 库列表。刷新 sing-box：在 `nix/android.nix` 中提升 `singbox`。

## 故障排查

- **`node` 立即退出**：查看
  `/data/adb/hoyofall/hoyofall/log/hoyofall.log`；缺失的 `LD_LIBRARY_PATH`
  （未分阶段放置 `lib/`）或未设置的 `urlEnv` 变量都会在那里出现。
- **片段始终不出现**：确认至少有一个订阅成功；失败的刷新会被记录，并在下一个间隔重试。
- **sing-box 从不重载**：检查 `android.conf` 中的 `singbox_dir` 与 `singbox_reload`；
  监视器会记录每次注入与钩子的结果。
- **应用补丁时构建失败**：随附的补丁与固定的 Node 版本绑定；请从匹配的 Termux 修订
  重新随附。
