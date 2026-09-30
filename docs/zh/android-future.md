# Android：走向模块化拆分

> **状态：** 仓库当前发布的是**一个一体化模块**（`hoyofall-android`）。本页定义预期
> 的拆分方式，使向独立模块的迁移成为机械式重构，并让智能体与人类共享同一目标。它是
> 一份设计文档，而非对现状代码的描述。

## 为什么

一体化模块把四件互不相关的事打成一包：

1. 一个**运行时**（Node），
2. 一个**脚本运行时**（Nushell），
3. 一个**守护进程**（Nushell 服务循环），
4. **应用**（hoyofall、sing-box）及其 **WebUI**。

它们有着不同的发布节奏，也可被其他 Android 模块作者复用（一个通用的 Nushell 守护进程
与 WebUI 本身就有用）。拆开它们能降低每次安装的模块体积，并让各部分独立更新。

## 当前的一体化结构

| 部件 | 文件 | 职责 |
|---|---|---|
| 运行时载荷 | `bin/node`、`lib/*` | 运行 `index.js` |
| 脚本载荷 | `bin/nu` | 运行模块逻辑 |
| 守护进程 | `module/service.nu`、`module/services.nu` | 重启服务、遵循停止标志、监视片段 |
| 应用：hoyofall | `index.js`、`config/config.android.yaml`、`bin/node` | 转换订阅 |
| 应用：sing-box | `bin/sing-box`、`config/singbox.json` | 代理核心 |
| 控制 | `module/control.nu` | 启动/停止/配置/日志，供 WebUI 使用 |
| WebUI | `module/webroot/`（由 `webui/` 构建） | KernelSU UI |
| 启动 | `module/*.sh` + `module/post-fs-data.nu`、`uninstall.nu` | Magisk/KernelSU 入口 |

## 目标拆分

| 模块 | 拥有 | 依赖 |
|---|---|---|
| `node-android` | `bin/node` + 其 `lib/*` + CA 包 | — |
| `nushell-android` | `bin/nu` + 其 `lib/*` | — |
| `nu-supervisor` | `services.nu`、`service.nu`、`control.nu`、shim | 一个 shell（`nu`） |
| `hoyofall`（应用） | `index.js`、hoyofall 配置、一个服务 spec | `node-android`、`nu-supervisor` |
| `sing-box`（应用） | `bin/sing-box`、sing-box 配置、一个服务 spec | `nu-supervisor` |
| `webui` | `webroot/`（React 应用） | `nu-supervisor` |

只有 `nu-supervisor` 与运行时模块需要 shim；应用模块变成**数据加一个 spec**。单个
`service.sh`（由 `nu-supervisor` 拥有）启动一个 Nushell 进程，由它发现并守护每个已注册
的服务。

### 共享路径

每个模块保留自己的目录，但应用与运行时需要一种稳定方式找到彼此。拟议的契约：

```
/data/adb/node/bin/node          # node-android
/data/adb/nushell/bin/nu         # nushell-android
/data/adb/nu-supervisor/         # supervisor + control.nu + services.nu + lib.nu
/data/adb/hoyofall/              # supervisor 配置（android.conf）
/data/adb/hoyofall/hoyofall/     # hoyofall 应用状态（config、env、out、log）+ spec
/data/adb/hoyofall/sing-box/     # sing-box 应用状态（config、cache、log）+ spec
```

应用注册一个**服务 spec**，而不是编辑守护进程代码：

- `nu-supervisor` 扫描 `/data/adb/*/service.nu`（或一个 JSON 注册表），并调用每个
  spec 的 `export def spec []`。
- spec 记录正是今天 `android/module/services.nu` 返回的内容：
  `{ name, bin, args, config, log, flag }`。
- `nu-supervisor` 的 `control.nu` 是唯一控制面；WebUI 只与它对话（绝不与应用专属脚本
  对话）。

## 稳定接口（保留这些名称）

这些接口已在使用；拆分必须保留它们，或提升协议版本。

- **服务 spec**（`services.nu`）：`service-names`、`service-spec <name>`、
  `service-status <name>`、`stop-service <name>`、`pids <pattern>`。spec 记录为
  `{ name, bin, args, config, source, format, check, log, flag }`：`source` 是可选的
  Nushell 配置文档，`format` 是其渲染格式，`check` 是校验器命令（空 = 无独立检查）。
- **控制协议**（`control.nu`）：`control.nu <action> [service]`，其中
  `action ∈ {status,start,stop,restart,config,config-source,set-config,
  render-config,set-source,log}`，写入类动作从 `$env.HOYOFALL_CONFIG_B64` 读取
  base64。`set-config`/`set-source` 在提交前校验；`render-config` 渲染但不写入。
  `status` 返回紧凑 JSON `{enabled,running,supervisor}`（或带 `service` 的数组）。
- **守护**：一个服务就是一个长期运行的 `bin`+`args`，退出后重启，其 `flag` 文件表示
  “已停止”；守护进程本身永不退出，因此无需重启即可让 `start` 生效。
- **环境**：二进制依赖 `LD_LIBRARY_PATH` 指向各自的 `lib/`；HTTPS 使用打包的 CA
  `etc/ssl/cert.pem`，并以 `SSL_CERT_FILE`/`NODE_EXTRA_CA_CERTS` 导出。
- **启动入口**：`customize.sh`（执行位）、`post-fs-data.sh`、`service.sh`、
  `uninstall.sh`——仅执行 exec 的 shim，外加 `customize.sh` 的 chmod（见
  `AGENTS.md`）。

## 迁移计划

1. 把 `node-android` 与 `nushell-android` 抽成载荷模块；验证它们的二进制能在
   `/data/adb/<name>/` 下配合 `LD_LIBRARY_PATH` 运行。
2. 抽出 `nu-supervisor`：把 `service.nu`/`control.nu` 泛化为发现 spec；当前单模块版本
   即参考实现。
3. 把 hoyofall 与 sing-box 变成只发布状态 + spec 的应用模块。
4. 让 WebUI 与 `nu-supervisor` 的 `control.nu` 对话，基础路径可配置，而不再硬编码
   `/data/adb/modules/hoyofall`。
5. 保留一体化包（`hoyofall-android`）作为把上述全部内容分阶段放置的便捷元模块，或将其
   弃用。

## 给智能体

- 保持**服务 spec** 形状与**控制协议**稳定；它们是接缝。
- 新服务 = `service-spec` 中的新分支（一体化）或一个新的
  `/data/adb/<x>/service.nu` spec（拆分后）；绝不新增 shim。
- 所有脚本保持 **Nushell**；唯一的 shell 文件是
  `scripts/check-shell.ts` 白名单中的 Magisk 入口。
- WebUI 是 `android/webui/` 下的 pnpm 工作区包；拆分落地后它不得硬编码模块路径。
