# hoyofall

**可证明的类型安全**：把 [mihomo](https://github.com/MetaCubeX/mihomo)（Clash.Meta）
订阅转换为 [sing-box](https://sing-box.sagernet.org/) 的 `outbounds`。

hoyofall 按各自独立的间隔抓取任意数量的 mihomo 订阅，转换为 sing-box
`outbounds`，并把可导入的片段写入磁盘（另可选 HTTP 与 WebUI 控制面，供 GUI 与
调试使用）。

为什么必须落盘？sing-box 核心**无法通过 HTTP 导入配置**——它只读取本地文件
（`-c`）或目录（`-C`）；多配置合并时对象按键覆盖、数组追加，因此片段的
`outbounds` 数组会直接拼进基础配置。

## 亮点

- **可证明的类型安全。** 使用 TypeScript 与 [Effect](https://effect.website/)：无
  `let`、无循环、无 `try`/`catch`、无 `any`。`pnpm lint` 中的 AST 检查器会在出现
  任何违禁构造时让构建失败，因此整个程序都是纯数据流，所有失败都进入类型化错误通道。
- **安全内建。** 通过 `urlEnv` 让 token 不落入文件；NixOS 模块与随附 systemd
  单元以加固的 `DynamicUser` 运行；片段采用 `tmp` + `rename` 原子写入。
- **声明式 Nix 支持。** flake 提供包、overlay 与 NixOS 模块；模块在构建时用 JSON
  Schema 校验 `settings`，并可接管向 `services.sing-box` 的注入。
- **单实例，多订阅。** 每个订阅独立间隔刷新；结果合并，并可选地按正则生成
  `selector`/`urltest` 组。
- **随处可跑。** 为非 Nix 用户提供加固的 systemd 单元，并提供一体化
  Magisk/KernelSU 模块，在 Android 上运行同一份产物。

## 从这里开始

- [配置](configuration.md)——每一个选项、类型与默认值。
- [使用](usage.md)——CLI、HTTP 端点、导入 sing-box。
- [Nix](nix.md)——flake 输出与 NixOS 模块。
- [systemd](systemd.md)——不使用 Nix 的部署方式。
- [Android](android.md)——Magisk/KernelSU 模块。
- [设计与保证](design.md)——函数式纪律如何被强制执行。
- [开发](development.md)——构建、测试与 AST 规则。

简版说明见仓库 [README](https://github.com/LiAlH4qwq/hoyofall#readme)。
