# Agent Note：macOS 桌面应用 —— Web GUI 的 Electron 外壳

Status: implemented

[English](2026-08-15-macos-desktop-app.md) | 中文

## Problem

仓库交付两种用户界面：`dsh` 命令行和由 `dsh web` 提供的 Web GUI（`dsh-base` + `dsh-web-app` 之上的浏览器 profile）。非技术型 macOS 用户没有途径把 harness 当作原生应用打开：CLI 需要安装 Node，浏览器界面需要手动运行命令并保持终端存活。`dsh web` 已经是一个完整的自服务后端——它托管前端 dist、`/api` 网关、终端 WebSocket，并在 stdout 打印 `dsh web: http://127.0.0.1:PORT` 就绪行——因此桌面外壳不需要重新伺服任何东西；它需要接管后端进程的生命周期，并把界面放进原生窗口。

## Decision

### 一个托管已部署 `dsh` CLI 闭包的 Electron 外壳

`apps/desktop`（`@deepseek-ai/dsh-desktop`，private）是一个 Electron 应用，其主进程以 **`ELECTRON_RUN_AS_NODE`** 模式把构建好的 `dsh` CLI 的 `web` 模式作为应用自身二进制的子进程启动（`child_process.spawn(process.execPath, ...)`），并传入 `--port 0` 让 OS 分配空闲端口，外壳从就绪行解析实际端口。后端跑在自带二进制上，使用应用自带的 Node 运行时，因此分发的 .app 不需要系统 Node；窗口加载的一切都由 web profile 伺服。前端 dist 通过 `@deepseek-ai/dsh-web-app` 对 `@deepseek-ai/dsh-web-frontend` 的依赖进入闭包，外壳自身零前端资产。

### 后端闭包：复用 SDK 运行时部署路线

后端与 SDK 运行时分发完全相同的部署方式：`pnpm --filter @deepseek-ai/dsh deploy --legacy --prod --config.node-linker=hoisted --config.auto-install-peers=false --config.link-workspace-packages=true` 到 `resources/backend`，然后把每个暂存符号链接物化为真实字节（打包后的应用没有仓库也没有 pnpm store）。四个 deploy 标志的依据与 single-exe note 记录的是同一套测量。`node-pty` 的 darwin-arm64 预编译产物是 N-API addon（其符号表只有 N-API），因此可以在 Electron 的 Node 运行时下原样加载——无需重编译、无需 electron-rebuild，builder 配置里 `npmRebuild: false`。外壳以 `--expose-internals` 启动后端：web profile 会启动 cordis-plugin-hmr，其 loader 需要 Node 的内部模块加载器，而闭包里的 node-addon-require-builtin 回退在 Electron 的 Node 下无法提供（其依赖的 embedder 符号缺失）。Electron 的 `utilityProcess` 在打包应用里无法传入该标志——其 `IsAllowedOption` 拒绝 `--expose-internals`，除非设置了 `ELECTRON_RUN_AS_NODE`——因此 run-as-node 子进程是满足 loader 的唯一自带运行时路径。

### 打包与验证

electron-builder 为 arm64（Apple Silicon）产出 `.dmg` + `.zip` + `.app`，ad-hoc 签名（无 Developer ID；公证是后续分发事项）。三个由环境变量门控的钩子让外壳可以无头验证：`DSH_DESKTOP_CAPTURE` 在页面稳定后把窗口截图为 PNG，`DSH_DESKTOP_QUIT_AFTER_CAPTURE=1` 在截图后退出，`DSH_DESKTOP_NO_DIALOGS=1` 把致命错误对话框变成日志后退出，避免失败的后端把无头运行卡在无法点击的弹窗上。

## Consequences

Bought：一个无需 Node 前置、无端口冲突（`--port 0`）的可分发 macOS 应用，复用经过验证的闭包部署而不是发明第二条打包管线，以及一条不需要交互式显示器就能证明窗口加载的验证路径（截图）。Cost：.app 内嵌完整 CLI 闭包（数百 MB，和其他 Electron 应用一样）；数据与任何 CLI 安装共享 `~/.dsh`；本轮仅支持 macOS/arm64（web profile 本来就把绝非回环主机，因此面向局域网暴露的桌面构建是非目标）。

## Alternatives considered

- **Electron 主进程自己伺服前端。** 拒绝：那会复制 web profile 的 host 行（webserver、frontend-static、apiproxy、终端 websocket），并与浏览器界面漂移；fork 真实 CLI 保持"Web GUI 是什么"的唯一事实来源。
- **通过 `child_process.spawn` 用系统 `node`。** 拒绝：要求用户机器装有 Node >= 22.19，与"面向非技术用户的原生应用"矛盾。实际交付的 spawn 用的是 `process.execPath`（应用自身二进制）的 `ELECTRON_RUN_AS_NODE` 模式，保留了当初选择 utility process 所追求的"自带运行时"属性。
- **为 web CLI 做第二个 `pkg` 单文件可执行文件。** 拒绝：SDK 运行时 exe 只做 JSON-RPC；构建 web 模式 exe 是另一个分发议题，而普通闭包在 Electron 下已经可用。
- **Tauri。** 拒绝：为本质是 Web 界面的应用引入 Rust 工具链和 Node 后端的 sidecar 方案，相对 Electron 没有收益。

## Testing

冒烟运行：`electron .` 启动部署好的闭包，等待就绪行，加载 URL，截图（`DSH_DESKTOP_CAPTURE`），退出（`DSH_DESKTOP_QUIT_AFTER_CAPTURE`）；把截图与伺服出的 GUI 对照检查。打包后的 `.app` 二进制用同样的方式从 `dist-app/mac-arm64/` 运行，证明 extraResources 布局和内置运行时。闭包构建在完成前校验入口、前端 index 和 agent presets 存在。

## Related

- [Single-file executable SDK runtime distribution](2026-07-10-single-file-executable-sdk-runtime-distribution.md) —— 本应用复用的 deploy 标志、node-pty 处理与闭包物化。
- [Web workspace file links](2026-07-31-web-workspace-file-links.md) —— 记录桌面外壳 WebView 是未来自有预览容器的归宿；现在这个 Electron 外壳就是那个归宿。
