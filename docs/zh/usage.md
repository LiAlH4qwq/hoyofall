# 使用

## CLI

```bash
hoyofall --config /etc/hoyofall/config.yaml
hoyofall --config=/etc/hoyofall/config.yaml
hoyofall --check --config /etc/hoyofall/config.yaml   # 校验后退出
hoyofall --print-schema   # 打印配置 JSON Schema
hoyofall --help
hoyofall --version
```

运行必须提供 `--config`（或 `-c`）。进程保持前台运行，并持续刷新订阅，直到被停止。

`--check` 加载并校验配置（schema、DAG、正则、输出），在不启动服务、也不解析
`urlEnv` 密钥的情况下以 `0`/非零退出。Android 模块用它来在替换线上配置前校验候选
配置。

## HTTP 端点

用 `output.http.enabled = true` 启用：

| 路由 | 响应 |
|---|---|
| `GET /` | 服务元数据：订阅 id 与输出模式。 |
| `GET /health` | `{ "status": "ok" }`。 |
| `GET /outbounds` | 完整组装后的片段（含实例级组），外加 `warnings` 数组。 |
| `GET /sub/:id` | 单个订阅的 `{ "outbounds": [...] }`。 |
| `GET /sub/:id/raw` | 单个订阅的裸 `outbounds` 数组。 |

HTTP 端点的用途是 sing-box GUI 客户端与调试：sing-box 核心本身无法通过 HTTP 导入
配置。

## 把片段交给 sing-box

`sing-box` 读取本地文件（`-c`）或目录（`-C`）。合并多个配置时，**对象按键覆盖、数组
追加**，因此片段的 `outbounds` 数组会拼接到基础配置中。

```bash
# 每订阅模式
sing-box run -c base.json -C /run/hoyofall
# 聚合模式
sing-box run -c base.json -c /run/hoyofall/fragment.json
# 或先固化成一份
sing-box merge merged.json -c base.json -c /run/hoyofall/fragment.json
```

在 `convert.emitBuiltinOutbounds: false`（默认值）下，基础配置应定义被转换组引用的
`direct` / `block` 出站。重复定义会导致 sing-box 启动失败。

### 选择稳定的组 tag

`route.final`（及其他引用）应指向始终存在的组。在更高 `level` 定义一个总括
selector，设 `includeProxies: false` 并用 `includeLevels`（或显式 `customGroup`
成员），然后引用该 id。引用可能缺席的按地区组会让 sing-box 启动失败。

## 支持的转换

代理：`ss`、`vmess`、`vless`、`trojan`、`hysteria`、`hysteria2`、`tuic`、
`wireguard`、`http`、`socks5`、`anytls`。

组：由 `groups.custom`（实例级，推荐）或每订阅 `groups.custom` 构建，通过正则与显式
键匹配代理/组（sing-box 无法用正则匹配 `outbounds`）。原生组
（`groups.native.enable`）映射 `select → selector`、`url-test → urltest`、
`fallback → urltest`、`load-balance → selector`（可配置）。

其余一律作为类型化警告上报并跳过（或在 `onUnsupported: fail` 时令整个订阅失败）。
