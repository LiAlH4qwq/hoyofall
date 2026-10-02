# 配置

hoyofall 通过单个 YAML 文件配置。请从
[`config.example.yaml`](https://github.com/LiAlH4qwq/hoyofall/blob/main/config.example.yaml)
开始，复制为 `config.yaml`（已被 gitignore，因此本地订阅 token 不会进入版本控制）。

下面记录每个选项的类型与默认值。生成的 JSON Schema（`hoyofall --print-schema`，
随包发布于 `share/hoyofall/schema.json`）是机器可读的唯一事实来源；NixOS 模块会在
构建时按其校验 `settings`。

```yaml
groups:
  custom:
    auto-hk:
      type: urltest
      includeRegexes: ["/HK"]
convert:
  emitBuiltinOutbounds: false
  proxyNameFormat: "{sub}-{name}"
subscriptions:
  airport:
    urlEnv: AIRPORT_URL
    intervalSeconds: 3600
output:
  file:
    enabled: true
    mode: aggregate
    path: /run/hoyofall/fragment.json
```

## `groups`（实例级，推荐）

自定义组会分别匹配**订阅名**与**实体名**，从所有订阅中挑选成员。sing-box 无法用
正则匹配 `outbounds`，因此 hoyofall 会把正则与类型化的 `members` 解析成显式 tag。
实例级组的最终 tag 就是它的 id 原样。

自定义组构成一个 **DAG**。作用域顺序为 `proxy` < `native group` < 每订阅自定义组 <
全局自定义组；在同一自定义作用域内，组只能引用 `level` 严格更低的组。更低层级永不
引用更高层级，不同订阅之间也不能互相引用。非法引用与层级违规会在配置校验阶段失败。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `groups.custom.<id>` | object | `{}` | 一个自定义组；`<id>` 即最终出站 tag。 |
| `.level` | 整数 > 0 | — | **必填。** 该组在其作用域内的顺序；被引用的自定义组必须严格更低。 |
| `.type` | `"selector"` \| `"urltest"` | `"selector"` | 组类型。 |
| `.includeProxies` | boolean | `true` | 是否纳入代理。 |
| `.includeNativeGroups` | boolean | `false` | 是否纳入转换后的原生组。 |
| `.includeSubRegexes` | 正则字符串数组 | `[]` | 保留 `name` 匹配任一正则的订阅中的候选；空 = 全部。仅实例级。 |
| `.excludeSubRegexes` | 正则字符串数组 | `[]` | 丢弃 `name` 匹配任一正则的订阅中的候选。仅实例级。 |
| `.includeRegexes` | 正则字符串数组 | `[]` | 保留匹配任一正则的实体名；空 = 全部。 |
| `.excludeRegexes` | 正则字符串数组 | `[]` | 丢弃匹配任一正则的实体名。 |
| `.includeLevels` | 整数数组 | `[]` | 纳入同作用域内这些层级（每个都必须 `< level`）的自定义组。 |
| `.members` | 类型化引用数组 | `[]` | 精确成员；见下。 |
| `.includeDirect` | boolean | `false` | 追加 `direct`。 |
| `.includeBlock` | boolean | `false` | 追加 `block`。 |
| `.onEmpty` | `"skip"` \| `"fail"` | `"skip"` | 无成员匹配时的行为。 |
| `.default` | string \| null | `null` | `selector` 的默认成员 tag；可指向已解析成员、另一个自定义组，或 `direct`/`block`。 |
| `.interruptExistConnections` | boolean | `false` | 映射到 `interrupt_exist_connections`。 |
| `.url` | string | `"http://www.gstatic.com/generate_204"` | `urltest` 探测 URL。 |
| `.intervalSeconds` | 整数 > 0 | `300` | `urltest` 间隔。 |
| `.tolerance` | 整数 | `50` | `urltest` 容差（毫秒）。 |
| `.idleTimeoutSeconds` | 整数 > 0 | `1800` | `urltest` 空闲超时。 |

`.members` 的条目是精确引用；它们绕过**所有** include/exclude 正则过滤
（`includeSubRegexes`、`excludeSubRegexes`、`includeRegexes`、`excludeRegexes`）
——只有基于正则的候选池才受这些过滤影响。`customGroup` 成员只有在全局作用域下才可
设置 `subscription`，用于指向某个每订阅自定义组：

```yaml
members:
  - { type: proxy,       subscription: default, name: "HK-01" }
  - { type: nativeGroup, subscription: default, name: "auto" }
  - { type: customGroup, name: hk-auto }                  # 全局，更低层级
  - { type: customGroup, subscription: default, name: x } # 每订阅自定义组
```

## `convert`（实例级）

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `convert` | object | `{}` | 实例级转换选项。 |
| `convert.emitBuiltinOutbounds` | boolean | `false` | 是否输出 `direct`/`block` 出站。合并进已定义它们的基础配置时保持 `false`。 |
| `convert.proxyNameFormat` | string | `"{sub}-{name}"` | 最终出站 tag 的模板。`{sub}` = 订阅 `name`（或 `id`），`{name}` = 原始代理/组名。 |

## `retry`（实例级）

刷新失败时，hoyofall 使用指数退避重试，而不是等待整整一个 `intervalSeconds`。
这样在抓取与网络启动竞争时（例如 `nixos-rebuild switch`）能快速恢复。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `retry` | object | `{ baseSeconds: 5, maxSeconds: 300 }` | 重试/退避策略。 |
| `retry.baseSeconds` | 整数 > 0 | `5` | 失败后的首次重试延迟；每次连续失败翻倍。 |
| `retry.maxSeconds` | 整数 > 0 | `300` | 退避延迟的上限；必须 `>= baseSeconds`。实际上限也不会超过该订阅的 `intervalSeconds`。 |

刷新成功后，订阅重新按正常的 `intervalSeconds` 间隔刷新。

## `subscriptions.<id>`（映射，必填，至少一个）

映射键即订阅 id——它同时是默认显示名与 `proxyNameFormat` 中的 `{sub}` 值。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `subscriptions.<id>.name` | 非空字符串 | 键本身 | 用于 `{sub}` 的显示名。 |
| `subscriptions.<id>.url` | 非空字符串 | — | 订阅 URL。`url` / `urlEnv` 必须且只能有一个。 |
| `subscriptions.<id>.urlEnv` | 非空字符串 | — | 保存 URL 的环境变量名（让 token 不落入文件）。 |
| `subscriptions.<id>.intervalSeconds` | 整数 > 0 | `3600` | 刷新间隔。 |
| `subscriptions.<id>.userAgent` | string | 未设置 | 抓取时使用的 `User-Agent` 头。 |
| `subscriptions.<id>.format` | `"auto"` \| `"clash"` \| `"base64"` | `"auto"` | 载荷格式；`auto` 会自动识别 base64。 |
| `subscriptions.<id>.onUnsupported` | `"skip"` \| `"fail"` | `"skip"` | 不支持/无法解析的条目是跳过（附警告）还是令整个订阅失败。 |
| `subscriptions.<id>.convert` | object | `{}` | 代理过滤（见下）。 |
| `subscriptions.<id>.groups` | object | `{}` | 高级的每订阅组（见下）。 |

### `subscriptions.<id>.convert`

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `exclude` | 正则字符串数组 | `[]` | 丢弃原始名匹配任一正则的代理与原生组。 |

### `subscriptions.<id>.groups`（高级）

每订阅组用于少数需要把组限定在单个订阅内的场景。大多数用户应改用实例级
`groups.custom`。匹配使用该订阅的原始名与 id；自定义组的最终 tag 是对其 id 应用
`proxyNameFormat`（例如 `{sub}-{id}`）。此处拒绝
`includeSubRegexes` / `excludeSubRegexes`（作用域已经就是单个订阅）。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `groups.native.enable` | boolean | `false` | 是否转换订阅自带的 `proxy-groups`。 |
| `groups.native.includeRegexes` | 正则字符串数组 | `[]` | 保留匹配的原生组名；空 = 全部。 |
| `groups.native.excludeRegexes` | 正则字符串数组 | `[]` | 丢弃匹配的原生组名。 |
| `groups.native.fallback` | `"urltest"` \| `"skip"` | `"urltest"` | mihomo `fallback` 组的映射。 |
| `groups.native.loadBalance` | `"selector"` \| `"urltest"` \| `"skip"` | `"selector"` | mihomo `load-balance` 组的映射。 |
| `groups.custom.<id>` | object | `{}` | 与实例级 `groups.custom.<id>` 字段相同，但去掉 `*SubRegexes`；按该订阅的名/id 匹配，并通过 `proxyNameFormat` 生成 tag。 |

## `output`（可选；`file` / `http` 至少启用一个）

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `output.file` | object | `{ enabled: true, mode: "aggregate", path: "hoyofall.json", directory: ".", permissions: "0644", pretty: true }` | 文件输出。 |
| `output.file.enabled` | boolean | `true` | 启用文件输出。 |
| `output.file.mode` | `"aggregate"` \| `"per-subscription"` \| `"both"` | `"aggregate"` | `aggregate` 写出一个合并的 `{ "outbounds": [...] }`；`per-subscription` 为 `sing-box -C` 写出 `<directory>/<id>.json`。 |
| `output.file.path` | string | `"hoyofall.json"` | 输出文件路径（用于 `aggregate` / `both`）。 |
| `output.file.directory` | string | `"."` | 输出目录（用于 `per-subscription` / `both`）。 |
| `output.file.permissions` | 八进制字符串 | `"0644"` | 写出片段的文件模式。 |
| `output.file.pretty` | boolean | `true` | 以 2 空格缩进美化 JSON。 |
| `output.file.emitEmptyFragment` | boolean | `false` | **不推荐。** 当所有订阅都失败且没有任何缓存片段时，仍写出只有组、没有出站的片段。保持 `false` 会保留上次写出的片段，避免 sing-box 没有任何代理。 |
| `output.http` | object | `{ enabled: false, listen: { host: "127.0.0.1", port: 9090 } }` | 可选 HTTP 端点。 |
| `output.http.enabled` | boolean | `false` | 启用 HTTP 服务器。 |
| `output.http.listen.host` | string | `"127.0.0.1"` | 绑定主机。 |
| `output.http.listen.port` | 整数 1–65535 | `9090` | 绑定端口。 |
