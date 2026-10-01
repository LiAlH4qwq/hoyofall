# 设计与保证

hoyofall 刻意保持小巧而严格。目标是构建一个**可证明的类型安全**守护进程，其行为
易于推理与验证，没有隐藏状态，也没有未类型化的失败路径。

## 函数式内核

代码使用 TypeScript 与 [Effect](https://effect.website/) 编写，遵循严格的函数式
纪律。没有 `let` 或 `var`，没有 `while`/`for` 循环，没有 `try`/`catch`，没有
`throw`，没有 `async`/`await`，没有 `any`，也不修改对象或数组。它们被 `const`、
`Array.map` / `filter` / `reduce` / `flatMap`、`Match`、`Effect.all` 以及
`Effect.try` / `Effect.tryPromise` 取代。

这不是需要审查者人工把关的约定：`pnpm lint` 会运行 `scripts/check-ast.ts`，后者用
TypeScript 编译器 API 解析 `src/`、`test/` 与 `scripts/` 的 AST，并在出现任何违禁
构造时**让构建失败**。完整清单见 [development.md](./development.md)。

## 类型化失败

每个失败都用具体的 Effect `Data.TaggedError` 建模，因此错误通道永远不会是
`unknown` 或 `any`。在边界处——读取配置文件、解析 YAML、抓取订阅、解码载荷、写入
文件——输入都会用 `Schema` 解析并一次性解码，然后用 `Effect.catchTag` /
`Effect.catchTags` / `Effect.match` 显式处理。

不支持的代理或组类型不是异常：它们会作为 `warnings` 收集，并按订阅以
`onUnsupported: skip | fail` 选择跳过或升级为失败。单个订阅失败不会拖垮其他订阅。

出站图必须是 DAG：自定义组只能引用 `level` 严格更低的组，非法引用与层级违规会在
配置校验阶段失败，而任何到达转换阶段的环都会成为类型化的 `GroupCycleError`。

## 会话，而非可变单元

状态是函数式的：某订阅的最新转换结果在 `Stream.scan` 管道中传递，并通过 `PubSub`
发布。没有 `Ref`，也没有可变缓存。HTTP 路由读取的快照与文件写入器所读的完全相同。

## Shell 纪律

Bash 被禁止。编写的逻辑是 **TypeScript**（hoyofall 应用与 Android supervisor，
运行于 Node），或 [Nushell](https://www.nushell.sh/)（`.nu`：开发/编排脚本与生成的
systemd 单元）。`pnpm lint` 会运行 `scripts/check-shell.ts`，在任何
`*.sh` / `*.bash` / `*.bats` 文件或 bash/POSIX shebang 出现在两处白名单之外时失败：

- **Android 模块引导 shim**（`customize.sh`、`post-fs-data.sh`、`service.sh`、
  `uninstall.sh`）——Magisk/KernelSU 模块 API 要求它们必须是 shell；除
  `customize.sh` 外，每个文件都是一次对随附 Node 运行时的 `exec`
  （`bin/node supervisor.js <command>`，可选经由 `/system/bin/env` 硬编码
  `LD_LIBRARY_PATH`），而 `customize.sh` 则是一条 `chmod 0755`，用于恢复安装器剥掉的
  执行位；以及
- **Nix `stdenv` 构建阶段**——它们按构造运行于 bash；请保持其精简。

Nushell（开发/systemd）不是 POSIX shell：应通过 Nushell 自己的管道组合结构化数据
（`where`、`each`、`reduce`、`get`、`from json` 等），而不是借助外部文本工具。
Android supervisor 则组合带类型的 `Effect`（见 `android/supervisor/`）。

## 安全内建

- **Token 不落入文件。** `urlEnv` 从环境变量读取订阅 URL，因此 `config.yaml` 不含
  任何密钥。NixOS 模块把它与 `environmentFile` 搭配使用。
- **最小权限。** NixOS 模块与随附 systemd 单元以 `DynamicUser` 运行服务，并启用
  `ProtectSystem=strict`、`ProtectHome=true`、`PrivateTmp=true`、
  `NoNewPrivileges=true`，以及受限的地址族集合。
- **原子输出。** 片段先写入临时文件，再 `rename` 到位，因此读取方（包括 sing-box）
  永远不会看到不完整的文件。
- **无动态求值。** 配置按 JSON Schema 解码与校验；没有内嵌脚本或模板。

## 为什么采用文件输出

sing-box 核心无法通过 HTTP 导入配置。它读取本地文件（`-c/--config`）或本地目录
（`-C/--config-directory`），而 `sing-box merge` 合并文件时对象按键覆盖、数组追加。
因此 hoyofall 把片段写入磁盘；可选的 HTTP 端点仅服务于 GUI 与调试。

智能体或贡献者必须遵循的规范性规则见
[`AGENTS.md`](https://github.com/LiAlH4qwq/hoyofall/blob/main/AGENTS.md)。
