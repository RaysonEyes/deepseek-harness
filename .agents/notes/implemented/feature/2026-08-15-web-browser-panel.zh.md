# Agent Note: Web 浏览器面板 —— 面板坞中的内嵌浏览器

Status: implemented

[English](2026-08-15-web-browser-panel.md) | 中文

## Problem

面板坞交付了五个标签页 —— 终端、浏览器、审查、辅助对话、文件 —— 但浏览器标签只渲染 "开发中" 占位符,而审查、文件与终端都已接入真实界面。web 能力仅作为面向模型的 `web_search`/`web_fetch` 工具存在,带 `card: 'web'` result view,因此没有任何东西让用户能在 GUI 内自行浏览网页。

## Decision

`BrowserPanel` 是一条独立内嵌页面的标签条:每页是地址栏加一个受沙箱约束的 `<iframe>`,渲染提交的 http(s) 网址,且每页在面板打开期间保持挂载,因此切换标签可恢复该页状态。导航是一段由 React 管理的本地历史栈;**后退**/**前进** 在栈上步进,**刷新** 通过递增 React `key` 重新挂载帧,**在新标签页打开** 是一个真正的 `<a target="_blank" rel="noopener noreferrer">`,让当前网址作为安全外链离开面板,遵守与 web result card 相同的 http(s)-only 规则。地址值由 `toHttpUrl` 归一化:带 scheme 的值仅当 scheme 为 `http:`/`https:` 时被接受,`javascript:`、`file:`、`data:`、`mailto:` 及任何其他 scheme 都返回 null 并显示本地化错误,无 scheme 的值则补 `https://`。帧带有 `sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"` 与 `referrerPolicy="no-referrer"`:脚本、表单、弹窗与下载可用;缺少 `allow-top-navigation` 使反框架脚本无法导航 GUI;缺少 `allow-same-origin` 使被框架页面运行在不透明源上,即使其网址与 GUI 同源也无法触及父级;GUI 源永不作为 referrer 发送。面板不读取 `api` 也不读取 `cwd`(不同于 Review/Files,它不与任何 Host 界面通信),并作为会话右侧的全高伴生面板打开,而非在底部宿主中打开,且不依赖 `cwd`,因为它不读取工作区。

## Consequences

换来:零 Host 改动的可用内嵌浏览器、确定且可测试的历史模型、以及与 web result card 一致的安全外链姿态。代价:跨源帧不透明,因此地址栏显示的是请求的网址而非重定向或页内导航后的最终网址;拒绝被框架的页面(`X-Frame-Options`/`frame-ancestors`)显示浏览器自身的拦截页,客户端无法可靠检测。不透明源沙箱使被嵌入页面没有持久 cookie 或存储,因此依赖它们的登录无法跨会话保持。

## Alternatives considered

- **Host 侧抓取并重新渲染页面的 web 代理。** 拒绝:它新增一个 apiproxy 域与一条 host 路由,还需安全评审,并把 "浏览网页" 变成 "读取抓取快照"。iframe 无需 Host 改动,且正是内嵌浏览器的字面含义。
- **复用面向模型的 `web_fetch` 能力。** 拒绝:该 seam 是带 result-view 约定的模型工具,不是面向用户的导航界面,客户端也没有通往它的 RPC 路径;接入它会把展示面板耦合到模型工具约定上。
- **使用 iframe 自身的历史实现后退/前进。** 拒绝:跨源帧不透明,地址栏无法跟踪当前网址;本地 React 历史栈确定、可测试,且能保持地址栏正确。

## Testing

`packages/client/ui-panels/tests/browser-panel.client.spec.tsx` 固定组件:空态提示与禁用控件、http(s) 归一化(无 scheme 补 `https://`、显式 http(s) 保持)、拒绝非 http(s) scheme 并显示错误文案、后退/前进步进本地历史、安全外链属性、以及刷新保持地址,外加一组标签测试:一个默认页面标签、添加标签并在切回时恢复上一标签的地址、以及关闭当前标签。`panels.client.spec.tsx` 从坞中打开面板并断言起始提示;其过时的 "终端占位符" 测试现在指向辅助对话占位符 —— 剩下的唯一占位符。

## Related

- [Web result card frontend](2026-07-30-web-result-card-frontend.md) —— 本面板所补充的安全外链规则与 `card: 'web'` result view。
- [Web workspace file links](2026-07-31-web-workspace-file-links.md) —— 记录了桌面端外壳 WebView 作为自有预览容器的未来归宿。
