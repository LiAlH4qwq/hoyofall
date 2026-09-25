# hoyofall

[English](./README.md) · **简体中文**

一个无 WebUI 的后台服务：按配置定期抓取 **mihomo**（Clash.Meta）订阅，并持续输出
**sing-box** 配置片段（`outbounds`）——既落盘（供 `sing-box` 核心使用），也可选地通过
HTTP 提供。

使用 TypeScript 与 [Effect](https://effect.website/) 编写：严格函数式，无 `let`/`var`、
无循环，所有失败都进入类型化的 Effect 错误通道。

## 为什么必须提供文件输出

`sing-box` 核心**无法通过 HTTP 导入配置**。它的 CLI 只读取本地文件或本地目录：

- `-c/--config <path>` —— 本地文件（或字面量 `stdin`）
- `-C/--config-directory <dir>` —— 目录下所有顶层 `*.json`
- `sing-box merge <out> -c a.json -c b.json` —— 合并为单个文件

多配置合并时，**对象按键覆盖、数组追加**，因此片段的 `outbounds` 数组会被拼接进基础配置。
所以 hoyofall 将片段写入磁盘；可选的 HTTP 端点主要用于 sing-box GUI 客户端与调试。

## 特性

- 以各自独立的间隔抓取任意数量的 mihomo 订阅链接。
- 将 `proxies` 转换为 sing-box `outbounds`，并可按正则/包含/排除规则（opt-in）或按订阅
  自带的 `proxy-groups`（`groups.native`，默认关闭）生成 `selector`/`urltest` 组。
- 重命名最终 outbound tag（默认 `subname-proxyname`）并相应重写分组引用，使多个订阅的
  片段可以合并。
- 文件输出（默认 `aggregate`，原子 `tmp` + `rename`），可选 `per-subscription` 目录模式
  以配合 `sing-box -C`。
- 可选的每实例 HTTP 端点。
- 对不支持的代理/分组类型支持 `skip`/`fail`。
- 多实例是 **NixOS 模块**能力（每个实例一个 `hoyofall-<name>` 服务）。程序本身是单实例，
  且已能处理多个订阅。

## 支持的转换

代理：`ss`、`vmess`、`vless`、`trojan`、`hysteria`、`hysteria2`、`tuic`、
`wireguard`、`http`、`socks5`、`anytls`。

分组：由实例级 `groups.custom`（推荐）或订阅内 `groups.custom` 通过正则与显式键从代理/
组中挑选成员生成（sing-box 无法对 `outbounds` 使用正则）。native 组
（`groups.native.enable`）映射 `select → selector`、`url-test → urltest`、
`fallback → urltest`、`load-balance → selector`（可配置）。

其余类型会作为类型化警告记录并跳过（或通过 `onUnsupported: fail` 让整个订阅失败）。

## 配置

从 [`config.example.yaml`](./config.example.yaml) 开始（复制为 `config.yaml`，该文件已被
gitignore，避免本地订阅 token 进入版本库）。下面列出了每个选项及其默认值；生成的 JSON
Schema（`hoyofall --print-schema`，随包安装于 `share/hoyofall/schema.json`）是机器可读的
权威来源。

```yaml
groups:
  custom:
    auto-hk:
      type: urltest
      includeRegexes: ["HK"]
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

### `groups`（实例级，推荐）

自定义组可跨所有订阅选择成员：分别用正则匹配**订阅名**与**实体名**。sing-box 无法用正则
匹配 `outbounds`，因此 hoyofall 会把正则与类型化的 `members` 解析为显式 tag。实例级组的
最终 tag 就是其 id 本身。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `groups.custom.<id>` | object | `{}` | 一个自定义组；`<id>` 即最终 outbound tag。 |
| `.type` | `"selector"` \| `"urltest"` | `"selector"` | 组类型。 |
| `.includeProxies` | boolean | `true` | 是否纳入代理。 |
| `.includeNativeGroups` | boolean | `false` | 是否纳入已转换的 native 组。 |
| `.includeCustomGroups` | boolean | `false` | 是否纳入订阅内自定义组与更早定义的实例级组。 |
| `.includeSubRegexes` | 正则字符串数组 | `[]` | 保留 `name` 匹配任一正则的订阅；空=全部。 |
| `.excludeSubRegexes` | 正则字符串数组 | `[]` | 丢弃 `name` 匹配任一正则的订阅。 |
| `.includeRegexes` | 正则字符串数组 | `[]` | 保留实体名匹配任一正则的候选；空=全部。 |
| `.excludeRegexes` | 正则字符串数组 | `[]` | 丢弃实体名匹配任一正则的候选。 |
| `.members` | 类型化引用数组 | `[]` | 精确成员，见下。 |
| `.includeDirect` | boolean | `false` | 追加 `direct`。 |
| `.includeBlock` | boolean | `false` | 追加 `block`。 |
| `.onEmpty` | `"skip"` \| `"fail"` | `"skip"` | 无成员时的行为。 |
| `.default` | string \| null | `null` | `selector` 的默认成员名。 |
| `.interruptExistConnections` | boolean | `false` | 映射到 `interrupt_exist_connections`。 |
| `.url` | string | `"http://www.gstatic.com/generate_204"` | `urltest` 探测地址。 |
| `.intervalSeconds` | 大于 0 的整数 | `300` | `urltest` 间隔。 |
| `.tolerance` | 整数 | `50` | `urltest` 容差（毫秒）。 |
| `.idleTimeoutSeconds` | 大于 0 的整数 | `1800` | `urltest` 空闲超时。 |

`.members` 是带标签的 struct 列表（精确匹配；订阅派生的成员仍受 `includeSubRegexes` 范围约束）：

```yaml
members:
  - { type: proxy,       subscription: default, name: "🇭🇰 HK-01" }
  - { type: nativeGroup, subscription: default, name: "auto" }
  - { type: customGroup, name: auto-hk }   # 另一个自定义组 id
```

### `convert`（实例级）

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `convert` | object | `{}` | 实例级转换选项。 |
| `convert.emitBuiltinOutbounds` | boolean | `false` | 是否输出 `direct`/`block` outbound。合并进已定义它们的 base 配置时保持 `false`。 |
| `convert.proxyNameFormat` | string | `"{sub}-{name}"` | 最终 outbound tag 的模板。`{sub}` = 订阅 `name`（或 `id`），`{name}` = 原始代理/分组名。 |

### `subscriptions.<id>`（映射，必填，至少一个）

映射的键即订阅 id，同时也是默认显示名与 `proxyNameFormat` 中 `{sub}` 的取值。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `subscriptions.<id>.name` | 非空字符串 | 键本身 | 用于 `{sub}` 的显示名。 |
| `subscriptions.<id>.url` | 非空字符串 | — | 订阅链接。`url` 与 `urlEnv` 必须恰好设置一个。 |
| `subscriptions.<id>.urlEnv` | 非空字符串 | — | 存放链接的环境变量名（避免 token 写入文件）。 |
| `subscriptions.<id>.intervalSeconds` | 大于 0 的整数 | `3600` | 刷新间隔。 |
| `subscriptions.<id>.userAgent` | string | 未设置 | 抓取时使用的 `User-Agent`。 |
| `subscriptions.<id>.format` | `"auto"` \| `"clash"` \| `"base64"` | `"auto"` | 载荷格式；`auto` 会自动识别 base64。 |
| `subscriptions.<id>.onUnsupported` | `"skip"` \| `"fail"` | `"skip"` | 对不支持/无法解析项是跳过（并警告）还是让整个订阅失败。 |
| `subscriptions.<id>.convert` | object | `{}` | 代理过滤（见下）。 |
| `subscriptions.<id>.groups` | object | `{}` | 高级的订阅内分组（见下）。 |

### `subscriptions.<id>.convert`

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `exclude` | 正则字符串数组 | `[]` | 丢弃原始名匹配任一正则的代理。 |

### `subscriptions.<id>.groups`（高级）

订阅内分组用于「只需按单个订阅建组」的少见场景，通常应改用实例级 `groups.custom`。
匹配使用该订阅的原始名与 id；自定义组的最终 tag 是对其 id 套用 `proxyNameFormat`
（如 `{sub}-{id}`）。此层级**拒绝** `includeSubRegexes` / `excludeSubRegexes`。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `groups.native.enable` | boolean | `false` | 是否转换订阅自带的 `proxy-groups`。 |
| `groups.native.includeRegexes` | 正则字符串数组 | `[]` | 保留匹配的 native 组名；空=全部。 |
| `groups.native.excludeRegexes` | 正则字符串数组 | `[]` | 丢弃匹配的 native 组名。 |
| `groups.native.fallback` | `"urltest"` \| `"skip"` | `"urltest"` | mihomo `fallback` 分组的映射。 |
| `groups.native.loadBalance` | `"selector"` \| `"urltest"` \| `"skip"` | `"selector"` | mihomo `load-balance` 分组的映射。 |
| `groups.custom.<id>` | object | `{}` | 字段同实例级 `groups.custom.<id>`，但匹配本订阅的名/id，tag 经 `proxyNameFormat` 生成。 |

### `output`（可选；`file` / `http` 至少启用一个）

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `output.file` | object | `{ enabled: true, mode: "aggregate", path: "hoyofall.json", directory: ".", permissions: "0644", pretty: true }` | 文件输出。 |
| `output.file.enabled` | boolean | `true` | 是否启用文件输出。 |
| `output.file.mode` | `"aggregate"` \| `"per-subscription"` \| `"both"` | `"aggregate"` | `aggregate` 写出一个合并的 `{ "outbounds": [...] }`；`per-subscription` 写出 `<directory>/<id>.json` 供 `sing-box -C` 使用。 |
| `output.file.path` | string | `"hoyofall.json"` | 输出文件路径（用于 `aggregate` / `both`）。 |
| `output.file.directory` | string | `"."` | 输出目录（用于 `per-subscription` / `both`）。 |
| `output.file.permissions` | 八进制字符串 | `"0644"` | 写出片段的文件权限。 |
| `output.file.pretty` | boolean | `true` | 是否以 2 空格缩进美化 JSON。 |
| `output.http` | object | `{ enabled: false, listen: { host: "127.0.0.1", port: 9090 } }` | 可选的 HTTP 端点。 |
| `output.http.enabled` | boolean | `false` | 是否启用 HTTP 服务。 |
| `output.http.listen.host` | string | `"127.0.0.1"` | 绑定地址。 |
| `output.http.listen.port` | 1–65535 的整数 | `9090` | 绑定端口。 |

## 用法

```bash
hoyofall --config /etc/hoyofall/config.yaml
hoyofall --config=/etc/hoyofall/config.yaml
hoyofall --print-schema   # 打印配置的 JSON Schema
hoyofall --help
hoyofall --version
```

HTTP 端点（当 `output.http.enabled` 时）：

- `GET /` —— 实例元信息
- `GET /health`
- `GET /outbounds` —— 完整组装片段（含实例级组，并附带 `warnings` 数组）
- `GET /sub/:id` —— `{ "outbounds": [...] }`（仅该订阅）
- `GET /sub/:id/raw` —— 仅 `outbounds` 数组

### 配合 sing-box 使用片段

```bash
# per-subscription 模式
sing-box run -c base.json -C /run/hoyofall
# aggregate 模式
sing-box run -c base.json -c /run/hoyofall/fragment.json
# 或者先固化
sing-box merge merged.json -c base.json -c /run/hoyofall/fragment.json
```

当 `emitBuiltinOutbounds: false` 时，base 配置需要定义被转换分组引用的
`direct`/`block` outbound。

## Nix

flake 输出 `packages.<system>.hoyofall`（及 `default`）、`overlays.default`、
`nixosModules.default`。NixOS 模块为**单实例**（一个 `hoyofall.service`）；
`singboxIntegration` 让模块负责注入 `services.sing-box`。

```nix
{
  inputs.hoyofall.url = "github:you/hoyofall";
  imports = [ inputs.hoyofall.nixosModules.default ];

  services.hoyofall = {
    enable = true;

    settings = {
      convert.emitBuiltinOutbounds = false;   # base 已定义 direct/block
      subscriptions.default = {
        name = "default";
        urlEnv = "SUB_URL";
        intervalSeconds = 3600;
      };
      groups.custom = {
        "hk-auto" = { type = "urltest"; includeRegexes = [ "🇭🇰" ]; };
        "us-auto" = { type = "urltest"; includeRegexes = [ "🇺🇸" ]; };
        # 供 sing-box 用 route.final 引用的稳定总选择器
        default = {
          type = "selector";
          includeProxies = false;
          includeCustomGroups = true;
          includeDirect = true;
        };
      };
    };

    environmentFile = "/run/secrets/hoyofall.env";

    # 由模块注入到 services.sing-box
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

  # 仅使用包（不经模块）：
  # nixpkgs.overlays = [ inputs.hoyofall.overlays.default ];
  # environment.systemPackages = [ pkgs.hoyofall ];
}
```

模块行为：

- `hoyofall.service`：`DynamicUser`、`RuntimeDirectory=hoyofall`(0700)、
  `WorkingDirectory=/run/hoyofall`；`settings` 在构建时用 `check-jsonschema`
  依据 `schema.json` 校验。`output.file` 默认 `/run/hoyofall/hoyofall.json` /
  `/run/hoyofall`；其他路径需 `extraReadWritePaths`；`configFile` 会绕过该默认。
- `singboxIntegration.enable`：安装一个 root oneshot，把片段拷进 sing-box 的配置目录
  （`-C` 合并；对象按键覆盖、数组追加），设置 `RuntimeDirectoryPreserve=yes`，并加一个
  `systemd.paths` 单元在片段变化时重注入并重启 sing-box。需要
  `services.sing-box.enable = true`。
- 所有生成脚本都是 **Nushell**（`pkgs.writers.writeNu`），绝不使用 bash。

注意：

- base `settings` 已定义 `direct`/`block` 时保持 `convert.emitBuiltinOutbounds = false`（默认）；
  重复 tag 会让 sing-box 报错。
- 只静态引用一个稳定总组（如上例 `default`），不要引用可能缺失的区域组——缺失的 tag 会让
  sing-box 启动失败。
- 自定义组可引用其它自定义组，且**与定义顺序无关**（Nix 属性集按字母序排序）。
- 订阅链接来自 sops（`urlEnv` + `sops.templates`）时，给服务加
  `systemd.services.hoyofall.requires/after = [ "sops-install-secrets.service" ]`，
  否则首次激活时 `EnvironmentFile` 尚不存在。

## 开发

完整的代码风格规则（函数式 AST 规则、Effect 约定、边界类型化）见
[`AGENTS.md`](./AGENTS.md)。简而言之：禁止命令式构造，在边界处转换进入 `Effect`，
不要使用宽泛的 `Effect.catchAll`，且绝不绕过类型系统。

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint + scripts/check-ast.ts
pnpm test        # vitest
pnpm build       # rolldown 打包 + JSON schema
pnpm dev --config config.yaml
```

`pnpm lint` 还会运行一个 AST 级检查器（`scripts/check-ast.ts`，基于 TypeScript 编译器
API），在 `src/`、`test/`、`scripts/` 中禁止：

`var` / `let` / `using`、`while` / `do` / `for` / `for-in` / `for-of`、label /
`break` / `continue`、`try` / `catch`、`throw`、`async` / `await`、
`Promise.then` / `Promise.finally`、`++` / `--`、`delete`、
`Array.prototype.forEach`、变更型数组方法（`push`、`pop`、`shift`、`unshift`、
`splice`、`sort`、`reverse`、`fill`、`copyWithin`）、
`Object.assign` / `defineProperty` / `setPrototypeOf` 以及
`Reflect.set` / `deleteProperty` / `defineProperty`、对对象或数组成员的赋值、
`any` 关键字，以及 `as unknown as` 双重断言。请改用 `const`、
`Array.map` / `filter` / `reduce` / `flatMap`、`Effect.all`、
`Effect.try` / `Effect.tryPromise` 和类型化错误。
