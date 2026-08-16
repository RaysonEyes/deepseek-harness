# Agent Note: Web 终端面板 —— 面板坞中的实时 xterm 终端

Status: implemented

[English](2026-08-15-terminal-panel.md) | 中文

## Problem

面板坞把终端作为第五个标签页交付,但它只渲染"开发中"占位符。harness 的终端能力通过持久 PTY 会话(terminal seam)为模型服务,没有任何东西让用户能在 GUI 里打开实时宿主 shell:浏览器界面既没有双向终端通道,也没有终端视图。

## Decision

两部分:一个宿主侧载体,一个浏览器侧界面。浏览器侧 `TerminalPanel`(位于 `dsh-client-ui-panels`)已随面板坞移除(见 [移除 Web 面板坞](../simplification/2026-08-16-remove-web-panel-dock.md));本 note 保留依然存在的载体设计。

**`@deepseek-ai/dsh-terminal-web`** 在 web profile 的 `/api/terminal` 挂载 WebSocket 载体:一条连接拥有一个 node-pty 终端。原始输出以 `output` 帧流向浏览器;浏览器把 `input`、`resize`、`close` 帧回传(JSON 文本帧)。连接与设置平面、凭据平面完全一样,按回环 Host 头钉死——它启动的是宿主 shell,任何匿名局域网调用者都不能打开。终端语义(shell 选择、登录参数)属于消费界面;载体在 subprocess seam 之上保持 shell 无关,由 seam 提供 PTY 与会话级清理。`SubprocessTerminalHandle` 新增可选 `resize(cols, rows)`:本地 provider 把它转发给 PTY,载体把早于异步 spawn 到达的 resize 暂存起来,等终端创建后再应用,避免 PTY 一直停留在过时的默认尺寸。

## Consequences

Bought:GUI 里有了实时宿主终端,不涉及模型、也不需要新的 apiproxy 域——升级路由走现有 webserver,回环钉死与设置平面一致。Cost:宿主 shell 与设置平面同级权限(设计上仅回环;web profile 本来就拒绝非回环主机);每个打开的标签页占用一条 WebSocket 连接和一个 node-pty 实例;终端只是浏览器侧状态——不会进入会话日志或模型记录。

## Alternatives considered

- **复用模型的持久终端 seam。** 拒绝:那些会话是模型可见的工件(记入会话日志、可回放);用户的交互式 shell 不能进入模型记录。
- **新增 apiproxy 请求/响应域。** 拒绝:终端是双向流式,webserver 的升级路由才是合适的载体。
- **把终端放进会话日志流。** 拒绝:那会把展示层耦合进模型记录和回放机制。

## Testing

载体目前没有自动化覆盖:WebSocket 升级路径、帧协议、回环钉死、resize 暂存都只靠手工冒烟验证。载体测试是后续工作。原先驱动终端标签页的浏览器侧坞测试已随 `dsh-client-ui-panels` 移除(见 [移除 Web 面板坞](../simplification/2026-08-16-remove-web-panel-dock.md))。

## Related

- [移除 Web 面板坞](../simplification/2026-08-16-remove-web-panel-dock.md) —— 移除了消费本载体的浏览器侧 `TerminalPanel`。
- [Persistent PTY sessions](2026-07-16-persistent-pty-sessions.md) —— 载体消费的 terminal seam,负责 node-pty 生命周期。
