# Agent Note: 移除 Web 面板坞(dsh-client-ui-panels)

Status: implemented

[English](2026-08-16-remove-web-panel-dock.md) | 中文

## 问题

web profile 内置了右上角面板坞(`@deepseek-ai/dsh-client-ui-panels`),由会话旁的单个 `PanelDock` 渲染五个标签页——终端、浏览器、审查、辅助对话、文件。坞内的界面与一个可安装的侧边栏插件提供的功能重复,而后者体验更好、表面更少:文件渲染与编辑、终端、Git、浏览器集成在同一工作台中。同时保留两套重叠的浏览器界面意味着两套代码库、两套测试、更重的默认 web bundle——而面板坞是较弱的那一套。

## 决策

移除内置 Web 面板坞:删除 `packages/client/ui-panels` 及其在 web-app bundle patch 中的 `ui-panels` 挂载行。`terminal-web` 载体(`@deepseek-ai/dsh-terminal-web`)保留——它是宿主侧 WebSocket 传输,不是浏览器界面,未来任何浏览器终端仍可使用。需要坞内功能的用户改为向自己的 profile 安装侧边栏插件(例如 dsh-better-sidebar)。

web profile 不再组合 `ui-panels`;组合树、tsconfig client 聚合与 web-app 依赖都移除该包。用户 profile 的 `cordis.patch.yml` 中针对该行的 `ui-panels` 禁用行(在行仍存在时添加)也一并移除,使 profile 不再引用已删除的条目。

本次移除合并了 [Web 浏览器面板 feature note](2026-08-15-web-browser-panel.md),该 note 的唯一主题就是坞内的 `BrowserPanel`。其决策在此保留,以免丢失依据:

- **沙箱姿态。** 每页是地址栏加一个受沙箱约束的 `<iframe>`;`sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"` 且 `referrerPolicy="no-referrer"`,无 `allow-top-navigation`(反框架脚本无法导航 GUI),也无 `allow-same-origin`(被框架页面运行在不透明源上,即使其网址与 GUI 同源也无法触及父级)。GUI 源永不作为 referrer 发送。
- **地址归一化。** `toHttpUrl` 只接受 `http:`/`https:` scheme;`javascript:`、`file:`、`data:`、`mailto:` 及任何其他 scheme 都返回 null 并显示本地化错误;无 scheme 的值补 `https://`。**在新标签页打开** 是真正的 `<a target="_blank" rel="noopener noreferrer">`,遵守与 web result card 相同的 http(s)-only 规则。
- **历史模型。** 导航是一段由 React 管理的本地历史栈——后退/前进步进栈,刷新通过递增 React `key` 重新挂载帧——因为跨源帧不透明,iframe 自身的历史无法驱动地址栏。
- **已知限制。** 跨源帧不透明(地址栏显示请求的网址而非重定向后的最终网址);拒绝被框架的页面显示浏览器自身的拦截页;不透明源沙箱使被嵌入页面没有持久 cookie 或存储,依赖它们的登录无法跨会话保持。
- **当时拒绝、现在仍拒绝的替代方案。** Host 侧抓取并重新渲染页面的 web 代理(新增 apiproxy 域 + 安全评审;"浏览网页"变成"读取抓取快照");复用面向模型的 `web_fetch` 能力(带 result-view 约定的模型工具,不是面向用户的导航界面);用 iframe 自身历史驱动后退/前进(不透明帧无法跟踪网址)。

## 范围:删了什么、没删什么

已移除:

- `packages/client/ui-panels` —— 整个包:`PanelDock`、`TerminalPanel`、`BrowserPanel`、`ReviewPanel`、`FilesPanel`、stores、locale、CSS、invariant companion 及其测试(`browser-panel.client.spec.tsx`、`panels.client.spec.tsx`、`invariant.client.spec.ts`)。
- `packages/bundle/web-app/cordis.patch.yml` 中的 `ui-panels` 行。
- `packages/bundle/web-app/package.json` 中的 `@deepseek-ai/dsh-client-ui-panels` workspace 依赖、tsconfig client 聚合条目、以及包 README model-experience allowlist 条目。
- 用户 profile 的 `cordis.patch.yml` 中的 `ui-panels` 禁用行。

保留:

- `@deepseek-ai/dsh-terminal-web` —— WebSocket 终端载体继续挂载在 `terminal-web`;消费它的浏览器端(`TerminalPanel`)已删除,但载体是宿主侧传输,不在本次界面移除范围内。
- 其余所有 web browser roster 行与 profile 中的 `dsh-files` bundle 插件。

## 备选方案

- **让坞保持休眠(禁用)而非删除。** 拒绝:休眠的表面仍随 bundle 发布,仍承担依赖与测试负担,仍会在日后诱使重新启用较弱的重复品。这些功能完全由可安装插件提供,没有休眠坞需要覆盖的能力缺口。
- **把坞拆成独立 bundle 层。** 拒绝:那会让用户已不再使用的界面继续承担维护与测试负担,并把面板拆成又一个需要组合的层。
- **只保留内置浏览器面板。** 拒绝:浏览器只是坞的一个标签,而坞的其他标签(终端、Git 审查、文件)已被侧边栏插件取代;保留一个标签意味着保留整个包与坞,即本次移除要消除的较弱重复品。

## 后果

默认 web bundle 更小,浏览器 roster 少一个界面。需要坞内功能的用户改为向 profile 安装侧边栏插件;profile 级安装路径正是替代品被挂载的方式。`terminal-web` 载体失去了唯一的内置浏览器消费者——未来的浏览器终端要么复用它、要么替换它,terminal-panel Agent Note 记录了该载体的设计。此处描述的嵌入式浏览器安全姿态(http(s)-only、受沙箱约束的不透明 iframe)是未来任何 GUI 内浏览器界面的参考。

## 测试

包自身的测试随包删除。组合后的 web profile 树通过 `--dump-config` 验证不含 `ui-panels` 行;仓库级 grep `dsh-client-ui-panels` /`ui-panels`(排除 node_modules、lib、dist)只命中删除本身、web-app bundle 移除与本 note。缺席即验证:当前文档不再把坞描述为可用,也没有测试把它当作受支持的行为来练习。

## 相关

- [Web 终端面板](2026-08-15-terminal-panel.md) —— 本次移除后失去内置浏览器消费者的载体。
