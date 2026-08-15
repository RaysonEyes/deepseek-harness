# @deepseek-ai/dsh-client-ui-panels

[English](README.md) | 中文

右上角面板切换器:会话头部的一个五标签页坞 —— 终端、浏览器、审查、辅助对话、文件。浏览器、审查、文件作为全高、可调整宽度的伴生面板在会话右侧打开;终端与辅助对话占位符在下方可调整高度的宿主中打开,两个座位相互独立,因此右侧面板与终端可以同时打开。审查通过 `git` apiproxy 域列出按暂存状态分组的 Git 工作区变更,并为每个文件渲染统一差异。文件通过 `host.listDirectory`/`workspace.listDirectory` 能力浏览工作区目录并读取文本文件。终端在 `/api/terminal` WebSocket 上挂载一条独立 xterm 界面的标签条,跨标签切换保持存活,并在主动关闭前跨坞切换保持保留。浏览器是一条独立页面的标签条 —— 每页是地址栏加受沙箱约束的 `<iframe>`,带进程本地的后退/前进历史与安全外链 —— 跨标签切换保持存活。辅助对话仍渲染 "开发中" 占位符。审查与文件仅在所选会话具有 `cwd` 时渲染;浏览器与终端对任何会话都渲染。

## Model Experience

None, as the panel dock is browser chrome; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **内嵌浏览器无法渲染拒绝被框架的页面** —— 发送 `X-Frame-Options` 或 `frame-ancestors` 的站点会显示浏览器自身的拦截页,而由于帧是跨源的,客户端无法可靠检测。
- **地址栏显示的是请求的网址,而非最终网址** —— 跨源帧无法被内省,因此重定向与页内导航不会更新地址栏,浏览器使用进程本地历史而非帧自身的历史。
- **被嵌入页面运行在不透明源上** —— 沙箱省略 `allow-same-origin`,因此被嵌入页面没有持久 cookie 或存储,依赖它们的登录无法跨会话保持。
- **辅助对话标签页尚未实现** —— 它仍渲染占位符。
