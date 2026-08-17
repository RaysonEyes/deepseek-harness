# Agent Note: skill provider 缺失 `name` 时在注册阶段失败，而非首次 `list()`

Status: implemented

[English](2026-08-17-skill-provider-name-early-validation.md) | 中文

## 问题

一个第三方 skill bundle 注册的 `SkillProvider` 缺少 `name` 字段。registry 接受了注册，失败后来自 `validateCandidate`，错误模板把"所属者"字符串做了内插：

```
skill provider "undefined" returned skill "chinese-traditional-wisdom-ai-agent-workflow" with a non-string provider
```

中间的 skill 名是有用的；两侧的 `"undefined"` 是 provider 自身的 `name` 槽位，被模板字符串化后渲染为字面四个字符。读者看到的错误令人困惑：它点出了 skill 名，怪罪一个叫 `undefined` 的 provider，并且没有任何迹象表明这个 provider 根本没有声明自己。丢弃也是错的：失败点发生在 `list()` 期间而不是注册本身，所以这个 provider 在 `registerProvider` 触发的失效之前的每次调用都会被接受，要等到首次发现时才抛。

这个 bundle 在本仓库已安装的 profile 树里也是真实存在的（`~/.dsh/profiles/web/node_modules/` 下的 `@dhicoc/dsh-chinese-traditional-wisdom-skill`），所以在此可以复现此回归。harness 自身的 provider（`dsh-skill-badge`、`dsh-skill-filesystem`）都携带非空 `name` 字符串，所以缺失字段是 plugin bundle 的漂移，不是 registry 的契约缺口。但契约仍然需要自我防御，因为这一侧所有面向用户的校验器最终都会把缺失的标量变成引号字符串。

## 决策

`registerProvider` 在工厂返回之后立即校验 `provider.name`，排在保留名校验之前、层 effect 之前。一个不是非空字符串的 `name` 抛出 `TypeError`，直接点出缺失字段，与现有保留名校验点出保留值的方式一致：

```ts
if (typeof name !== 'string' || name.length === 0) {
  throw new TypeError('skill provider must have a non-empty string \'name\' field')
}
```

抛出的错误走与工厂失败、保留名校验共同使用的同一 `try`/`catch`，因此它中止注册阶段的 `lifecycle` 信号，并以原始的同步抛出来到调用方。释放路径不变：已注册的 provider 通过其层条目释放，被拒绝的注册从未发布过任何条目。

`validateCandidate` 的 `non-string provider` 校验保留。`candidate.provider` 是 provider 选择附加在其候选项上的值，未来某个 loader 把它设为非字符串（或者经过 JSON 来回转的对象）依然需要失败，且需要保持现有诊断。新的校验是候选项字段所缺失的上游闸；现有校验是该字段自身的下游防御。

runtime 的 `register()` 路径不受影响。`SkillRegistration.provider` 是可选项，在定义时回退到保留名 `runtime`，所以这个新加在 `registerProvider` 的早校验不会从 runtime 贡献里触发。

## 备选方案

**让 `name` 变为可选，并依据工厂函数的标识合成一个。** 这会接受每一个忘记该字段的 bundle，把失败推迟到名字冲突或者 JSON 来回转——这些失败都不点出真正的错误。TypeScript 类型已经承诺 `readonly name: string`，所以这里的"可选"校验是一种对已发布契约的静默放宽，而非防御性放宽。

**仅在 `SkillProvider` 类型层面失败。** TypeScript 已经强制要求；本次失败的是没有任何编译步骤的 JavaScript bundle。强化类型不能触达 bundle，而运行时校验才是真正起到作用的闸口。

**改写 `validateCandidate` 中的错误信息，让读者看到"declared"而非 `"undefined"`。** 它会让现有错误可读，但不会改变失败发生的时机。这里的修复比它更靠上游——这种错误根本不该在发现阶段发生——而改名的错误信息依然会让 provider 进入 registry，使其在后续发现时在列举 provider 的测试里表现异常。

**记录拒绝并以生成名继续。** 注册边界处的姿态是"失败即响"（`reserved`、`duplicate`）。记录-继续会把 registry 变成 resolver 的兜底仓库，把漂移隐藏到两个 bundle 冲突时。

## 后果

registry 现在在 `registerProvider` 同步拒绝一个格式错误的 provider，错误信息直接说明缺什么。复现器中的实际失败模式——`@dhicoc/dsh-chinese-traditional-wisdom-skill/lib/index.js` 导出未带 `name` 的 provider 对象——本来会在 plugin `apply` 时抛出，而不是在 registry 已缓存注册之后的首次 `skills.list()` 抛出。

bundle 侧的修复合入本次改动：provider 携带一个 `name` 常量，候选项的 `provider` 字段使用同一字符串，所以上游闸和下游 `candidate.provider === providerName` 不变量都通过。修复位于已安装的 `node_modules` 副本，因为该 profile 的 bundle 是按引用而非按源代码树加载的；bundle 自身的发布版本是持久的答案，这一变更被记录在此以供下次协同时上提。

2026-08-17 上午（约 09:53）一次 profile 重装（dshmarket/pnpm）用已发布 bundle 覆盖了该安装副本补丁，下一次运行再次以旧的 `validateCandidate` 错误失败。两个事实使失败抵达每个运行时：`@deepseek-ai/dsh-skill` 的 `exports` 将运行时导入解析到 `lib/`，因此 `src/` 中的守卫在执行 `pnpm run build:lib` 之前不起作用；桌面 App 打包的 backend（`apps/desktop/dist-app/**/backend/node_modules`，`~/.dsh/profiles/node_modules` 软链指向它）携带自己的补丁前副本，直到下次 App 构建。2026-08-17 的恢复：重新应用 bundle 补丁并重建 `lib/`；在 bundle 发布修复之前，任何 profile 重装都会再次抹掉该补丁。此后失败又多存活了一轮，因为 `dsh web` 以长驻守护进程方式运行（`scripts/daemon-dsh-web.sh`，端口 3080）：2026-08-16 23:18 启动的进程在内存中持有补丁前的 bundle 模块，直到进程重启、tsx 重新加载补丁后的文件之前，每个会话都持续失败。

fail-loud 的发现随后逐一暴露了下一批潜伏缺陷。`@dhicoc/dsh-wuyun-liuqi` 携带五个 SKILL.md，其 frontmatter `name` 是中文研读标题；registry 的 kebab-case 语法在 `list()` 处拒绝了其中第一个。安装副本现在以各文件所在目录的 slug 作为名字（`liejing-tuyi-yunqi`、`suwen-rushi-yunqi-lunao`、`sanyin-sitiansi-yunqi-fang`、`yizong-jinjian-yunqi-yaojue`、`yunqi-zhengzhi-gejue`），中文标题移至 `description` 开头。另外，`dsh-skill-pack-security`（2026-08-17 11:01 从市场安装）挂载的 `@perrylink/dsh-skill-pack-security-provider` 在 npm 发布物中只含 `lib/index.js` 却 import `lib/vet/*.js`；两个已发布版本（1.3.0、2.0.0）均损坏。从 `dsh.profile.bundles` 移除该 bundle 并未持续生效——dshmarket 于 11:23 将其重新加回（连同 `@nanmicoder/dsh-agent-teams`），打包版桌面 backend 随即在打印 URL 前退出。持久的本地修复：市场包在 `provider/src/` 下携带 provider 的 TypeScript 源码，用仓库的 `tsc -p tsconfig.json` 构建并将产出的 `lib/vet/*.js` 拷入已安装的 `@perrylink` 包后，源码版与打包版 backend 均可启动。在 PerryLink 重新发布包含运行时文件的版本之前，provider 的任何重装都会再次抹掉这些文件；用同一条命令重建即可。

新校验同时拒绝空字符串，而不仅仅是 `undefined`。`SkillProvider` 应能按名寻址，而空字符串只有在 registry 同意将其视为特殊值时才可辩护——但 registry 并不同意。保留名校验依然对同一值运行，所以 `registerProvider(..., name: 'runtime')` 仍以现有的 `"runtime" is reserved` 错误信息被拒绝。

## 测试

`packages/skill/skill/tests/skill.spec.ts` 覆盖新校验拒绝的所有入口——`undefined`、空字符串、number、非字符串 object——并断言同步抛出携带新错误信息，且已注册 provider 的 `lifecycle` 信号处于中止状态。保留名、工厂失败、effect 注册失败的现有测试保持绿色。

`packages/skill/skill-filesystem/tests/`、`packages/skill/skill-badge/tests/` 与 `packages/skill/tool-skill/tests/` 覆盖下游消费者。整个 `packages/skill/**` 套件跨 5 个文件共 101 个测试全部通过。
