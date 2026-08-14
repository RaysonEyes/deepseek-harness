# @deepseek-ai/dsh-host-plugin-inventory

[English](README.md) | 中文

当前 Cordis Loader 树的 Host 投影,外加一条翻转单个条目有效启用状态的持久化路径。`PluginInventoryGateway` 注册 `pluginInventory` 服务,并发布两个由 Typert 生成的直接 Remote:`pluginInventory/list` 与 `pluginInventory/setEnabled`。每次 `list` 调用都直接读取 `ctx.loader.entries()`,跳过结构性的 group 行,再按 Loader 顺序返回其余条目,并且只包含 Loader 条目 id、模块标识、有效启用状态与当前根 Fiber 阶段。

阶段为 `pending`、`loading`、`active`、`failed` 或 `unloading`;条目没有存活的根 Fiber 时则为 `null`。该快照刻意只表示调用当下:Loader 仍是唯一的生命周期权威,本包不拥有缓存、历史、来源模型或事件流。公开 payload 类型位于 `./types`,Typert 生成由 `./typert` 与 `./remote` 导出的 Host 和 Client Remote 产物。

`setEnabled` 是本包拥有的唯一变更:它把目标行的 `disabled` 覆盖合并进该 profile 的 `cordis.patch.yml` 用户补丁层(因此重启后依然生效,现有的补丁 watcher 也会重新应用它),并立即刷新根 include 的补丁栈,让运行中的树停止或启动该条目。它从不改动 `cordis.yml`,从不触碰 bundle 层,并且拒绝它无法拥有的行(未知 id 以及引导 include 行本身)。

该服务仅供 Remote 使用,刻意不声明同进程 Cordis `Context` merge。Client 包通过显式的 `api-remotes` 组合消费它,而不导入 Host 实现。

## 模型体验

无,因为这个仅限 Host 的清单投影不注册提示词、工具、消息或提供方请求。

#### KV Cache 影响

无;本包从不组装模型输入。

## 已知限制与暂缓事项

- **仅表示调用当下** —— 结果不包含持久的失败历史或订阅;只要不存在存活的根 Fiber,就会报告 `null`,而不区分其原因。
- **无来源能力** —— 服务不识别条目由哪个 bundle、profile 或 override 引入。
- **有效启用状态可能滞后** —— 若条目被某个已停用的祖先 group 禁用,即使 `setEnabled` 翻转了该行自身的覆盖,其有效状态仍是停用;只有该行自身的选项会变化。
