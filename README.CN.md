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
- 将 `proxies` 转换为 sing-box `outbounds`；当 `includeGroups: true` 时也转换
  `proxy-groups`（默认关闭）。
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

分组（仅在 `includeGroups: true` 时）：`select → selector`、`url-test → urltest`、
`fallback → urltest`、`load-balance → selector`（后两者可配置）。

其余类型会作为类型化警告记录并跳过（或通过 `onUnsupported: fail` 让整个订阅失败）。

## 配置

从 [`config.example.yaml`](./config.example.yaml) 开始（复制为 `config.yaml`，该文件已被
gitignore，避免本地订阅 token 进入版本库）。下面列出了每个选项及其默认值；生成的 JSON
Schema（`hoyofall --print-schema`，随包安装于 `share/hoyofall/schema.json`）是机器可读的
权威来源。

```yaml
convert:
  emitBuiltinOutbounds: false
  proxyNameFormat: "{sub}-{name}"
subscriptions:
  - id: airport
    urlEnv: AIRPORT_URL
    intervalSeconds: 3600
    convert:
      includeGroups: false
output:
  file:
    enabled: true
    mode: aggregate
    path: /run/hoyofall/fragment.json
```

### `convert`（实例级）

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `convert` | object | `{}` | 实例级转换选项。 |
| `convert.emitBuiltinOutbounds` | boolean | `false` | 是否输出 `direct`/`block` outbound。合并进已定义它们的 base 配置时保持 `false`。 |
| `convert.proxyNameFormat` | string | `"{sub}-{name}"` | 最终 outbound tag 的模板。`{sub}` = 订阅 `name`（或 `id`），`{name}` = 原始代理/分组名。 |

### `subscriptions[]`（必填，至少一个）

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `subscriptions[].id` | 非空字符串 | —（必填） | 订阅的唯一 id。 |
| `subscriptions[].name` | 非空字符串 | 等于 `id` | 用于 `{sub}` 的显示名。 |
| `subscriptions[].url` | 非空字符串 | — | 订阅链接。`url` 与 `urlEnv` 必须恰好设置一个。 |
| `subscriptions[].urlEnv` | 非空字符串 | — | 存放链接的环境变量名（避免 token 写入文件）。 |
| `subscriptions[].intervalSeconds` | 大于 0 的整数 | `3600` | 刷新间隔。 |
| `subscriptions[].userAgent` | string | 未设置 | 抓取时使用的 `User-Agent`。 |
| `subscriptions[].format` | `"auto"` \| `"clash"` \| `"base64"` | `"auto"` | 载荷格式；`auto` 会自动识别 base64。 |
| `subscriptions[].onUnsupported` | `"skip"` \| `"fail"` | `"skip"` | 对不支持/无法解析项是跳过（并警告）还是让整个订阅失败。 |
| `subscriptions[].convert` | object | `{}` | 每订阅的转换选项（见下）。 |

### `subscriptions[].convert`

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `includeGroups` | boolean | `false` | 是否把 mihomo `proxy-groups` 转为 sing-box `selector`/`urltest`。默认关闭，因为供应商的分组通常没有价值。 |
| `fallback` | `"urltest"` \| `"skip"` | `"urltest"` | mihomo `fallback` 分组的映射。 |
| `loadBalance` | `"selector"` \| `"urltest"` \| `"skip"` | `"selector"` | mihomo `load-balance` 分组的映射。 |
| `exclude` | 正则字符串数组 | `[]` | 名称匹配任一正则的项会被丢弃。 |

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
- `GET /sub/:id` —— `{ "outbounds": [...] }`
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

```nix
{
  inputs.hoyofall.url = "github:you/hoyofall";

  # 方式 A：NixOS 模块（多实例，类似 services.cloudflared）
  # 每个实例生成一个 `hoyofall-<name>` systemd 服务。
  imports = [ inputs.hoyofall.nixosModules.default ];
  services.hoyofall.instances.default = {
    settings = {
      subscriptions = [
        { id = "airport"; urlEnv = "AIRPORT_URL"; intervalSeconds = 3600; }
      ];
      # output.file.path / directory 默认指向
      # /run/hoyofall-default/hoyofall.json 与 /run/hoyofall-default
    };
    environmentFile = "/run/secrets/hoyofall-default.env";
  };

  # 方式 B：package + overlay
  # nixpkgs.overlays = [ inputs.hoyofall.overlays.default ];
  # environment.systemPackages = [ pkgs.hoyofall ];
}
```

实例配置在构建服务前会用 `check-jsonschema` 依据 `schema.json` 校验。

对于基于 `settings` 的实例，模块会把 `output.file.path` 默认设为
`/run/hoyofall-<name>/hoyofall.json`、`output.file.directory` 默认设为
`/run/hoyofall-<name>`——即实例的 systemd `RuntimeDirectory`，它同时也是
`WorkingDirectory`，并且默认是唯一可写路径。若要把输出指到别处，请显式设置
`output.file.path` / `output.file.directory`，并把该目录加入 `extraReadWritePaths`。
使用 `configFile` 时模块无法注入这些默认值，需要自行设置。

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
