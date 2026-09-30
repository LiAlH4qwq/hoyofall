# 开发

完整的代码风格规则（函数式 AST 规则、Effect 约定、边界类型）见
[`AGENTS.md`](https://github.com/LiAlH4qwq/hoyofall/blob/main/AGENTS.md)。简言之：
不使用命令式构造，在边界处转换进入 `Effect`，不使用宽泛的 `Effect.catchAll`，
绝不绕过类型系统。

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm typecheck:webui  # tsc --noEmit for android/webui
pnpm lint        # eslint + scripts/check-ast.ts + scripts/check-shell.ts
pnpm check:ast   # AST-level functional-rule enforcement only
pnpm test        # vitest
pnpm check       # typecheck + lint + ast + shell + test
pnpm build       # rolldown bundle + JSON schema
pnpm dev --config config.yaml
```

Android 模块由 Nix 从预编译二进制组装，而非交叉编译：

```bash
nix build .#hoyofall-android   # result/hoyofall-android-arm64.zip
```

## 目录结构

- `src/config/`——配置 `Schema`、加载与校验
- `src/mihomo/`——订阅解码（按代理/组类型定义 `Schema`）
- `src/convert/`——纯 mihomo → sing-box 转换
- `src/pipeline/`——刷新流、快照缓存（`Stream.scan` + `PubSub`）
- `src/output/`——原子文件输出
- `src/server/`——可选 HTTP 端点
- `src/singbox/`——sing-box `outbounds` 的 `Schema` 与类型
- `src/diagnostics.ts`——CLI 用法与友好的错误格式化
- `scripts/check-ast.ts`——函数式规则的 AST 强制执行
- `scripts/check-shell.ts`——禁止手写 bash / POSIX shell 脚本
- `android/webui/`——KernelSU WebUI 源码；`android/module/`——Magisk/KernelSU
  载荷（由 `nix/android.nix` 组装为可刷入模块）
- `nix/`——`package.nix`、`overlay.nix`、`android.nix`、`github.nix`（由 Nix
  生成 `.github`）、`website.nix`、NixOS `module.nix`；`flake.nix`
- `dev/`——flake-parts 的 `dev` 分区：仅开发用输入（工作流生成、git hook）、
  `docs/` 中的中英双语文档，以及 mdBook 站点源

## 强制执行的 AST 规则

`pnpm lint` 会运行 `scripts/check-ast.ts`（TypeScript 编译器 API），它在 `src/`、
`test/` 与 `scripts/` 中拒绝：

`var` / `let` / `using`，`while` / `do` / `for` / `for-in` / `for-of` / 标签 /
`break` / `continue`，`try` / `catch`，`throw`，`async` / `await`，
`Promise.then` / `Promise.finally`，`++` / `--`，`delete`，
`Array.prototype.forEach`，会修改数组的方法（`push`、`pop`、`shift`、
`unshift`、`splice`、`sort`、`reverse`、`fill`、`copyWithin`），
`Object.assign` / `defineProperty` / `setPrototypeOf` 以及
`Reflect.set` / `deleteProperty` / `defineProperty`，对对象或数组成员赋值，
`any` 关键字，以及 `as unknown as` 双重断言。

请改用 `const`、`Array.map` / `filter` / `reduce` / `flatMap`、`Effect.all`、
`Effect.try` / `Effect.tryPromise` 以及类型化错误。

## Shell 规则

Bash 被禁止；手写脚本使用 Nushell。`pnpm lint` 还会运行
`scripts/check-shell.ts`，它在任何 `.sh` / `.bash` / `.bats` 文件或 bash/POSIX
shebang 出现在白名单之外时失败。唯一的例外是仅执行 exec 的 Android 模块 shim
（见 [`android.md`](./android.md#shims)）与 Nix `stdenv` 构建阶段。完整理由见
[`design.md`](./design.md#shell-纪律)。

## 测试

`test/` 使用 `vitest`；有副作用的代码用 `Effect.runSync` / `runPromise` 运行。新的
代理/组映射需要一条 golden 测试，`test/example-config.test.ts` 则保持
`config.example.yaml` 有效——配置 schema 变更时要同步更新该示例。
