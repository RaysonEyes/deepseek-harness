# Agent Note: skill provider with a missing `name` fails at registration, not at first `list()`

Status: implemented

English | [中文](2026-08-17-skill-provider-name-early-validation.zh.md)

## Problem

A third-party skill bundle registered a `SkillProvider` whose `name` field was absent. The registry took the registration, and the failure surfaced from `validateCandidate` with a template that interpolated the owner string:

```
skill provider "undefined" returned skill "chinese-traditional-wisdom-ai-agent-workflow" with a non-string provider
```

The skill name in the middle is useful; the surrounding `"undefined"` is the provider's own `name` slot, coerced to a string by the template and so rendered as the literal four characters. The reader sees a confusing error: it names the skill, blames a provider called `undefined`, and gives no signal that the provider failed to declare itself. The discard is also wrong: the failure point is `list()` during discovery, not the registration itself, so the provider accepts every call up to the first discovery after the invalidation `registerProvider` issued and only then throws.

This bundle is also a real one in this repository's installed profile tree (`@dhicoc/dsh-chinese-traditional-wisdom-skill` in `~/.dsh/profiles/web/node_modules/`), so the regression is reproducible here. The harness's own providers (`dsh-skill-badge`, `dsh-skill-filesystem`) carry a non-empty `name` string, so the missing field is plugin-bundle drift, not a registry contract gap. The contract still needs to defend itself, because every public-facing validator this side already turns a missing scalar into a quoted string eventually.

## Decision

`registerProvider` validates `provider.name` immediately after the factory returns, before the reserved-name check and before the layer effect. A `name` that is not a non-empty string throws a `TypeError` that names the missing field, the same way the existing reserved-name check names the reserved value:

```ts
if (typeof name !== 'string' || name.length === 0) {
  throw new TypeError('skill provider must have a non-empty string \'name\' field')
}
```

The thrown error rides the same `try`/`catch` the factory failure and the reserved-name check already share, so it aborts the registration's `lifecycle` signal and reaches the caller as the original synchronous throw. The disposal path is unchanged: a registered provider disposes through its layer entry, and a refused registration never published one.

`validateCandidate`'s `non-string provider` check stays. `candidate.provider` is a value the provider chose to attach to its candidate, and a future loader that sets it to a non-string (or a JSON-roundtripped object) still needs to lose, with the same diagnostics it has today. The new check is the upstream gate the candidate field was missing; the existing check is the downstream defense for the field itself.

The runtime `register()` path is unaffected. `SkillRegistration.provider` is optional and falls back to the reserved `runtime` name at definition time, so the early guard on `registerProvider` cannot fire from a runtime contribution.

## Alternatives considered

**Making `name` optional and synthesizing one from the factory function's identity.** It would accept every bundle that forgot the field and push the failure to a name collision or a JSON-roundtrip — neither failure names the actual mistake. The TypeScript type already promises `readonly name: string`, so an "optional" guard here would be a silent relaxation of the published contract rather than a defensive one.

**Failing at the `SkillProvider` type level only.** TypeScript already enforces it; the failure here is a JavaScript bundle with no compilation step. Strengthening the type does not reach the bundle, and the runtime check is the seam that does.

**Renaming the field in `validateCandidate`'s message so the reader sees "declared" instead of `"undefined"`.** It would make the existing error readable without changing when the failure happens. The fix here is upstream of that — the error should not happen at discovery in the first place — and a renamed message would still let the provider into the registry, where its next discovery would mis-behave in tests that enumerate providers.

**Logging the refusal and continuing with a generated name.** Fail-loud is the established posture at registration boundaries (`reserved`, `duplicate`). Logging-and-continuing turns the registry into the resolver's fallback store and hides the drift until two bundles collide.

## Consequences

The registry now refuses a malformed provider synchronously at `registerProvider`, with an error message that says what is missing. The actual failure mode in the reproducer — `@dhicoc/dsh-chinese-traditional-wisdom-skill/lib/index.js` exporting a provider object without `name` — would have thrown at plugin apply instead of throwing during the first `skills.list()` after the registry had already cached the registration.

The bundle side is fixed in this change: the provider carries a `name` constant and the candidate's `provider` field is the same string, so both the upstream guard and the downstream `candidate.provider === providerName` invariant pass. The fix lives in the installed `node_modules` copy because the profile's bundle is loaded by reference rather than by source tree; the bundle's own publish is the durable answer, and that change is recorded here so the next reconciliation can lift it.

A profile reinstall on 2026-08-17 (about 09:53, dshmarket/pnpm) overwrote that installed-copy patch with the published bundle and the next run failed again with the old `validateCandidate` error. Two facts make the failure reach every runtime: `@deepseek-ai/dsh-skill`'s `exports` resolve runtime imports to `lib/`, so the `src/` guard is inert until `pnpm run build:lib` runs, and the desktop app's packaged backend (`apps/desktop/dist-app/**/backend/node_modules`, which `~/.dsh/profiles/node_modules` symlinks into) carries its own pre-fix copy until the next app build. Recovery on 2026-08-17: re-applied the bundle patch and rebuilt `lib/`; until the bundle publishes the fix, any profile reinstall wipes the patch again. The failure then outlived the disk fixes once more because `dsh web` runs as a long-lived daemon (`scripts/daemon-dsh-web.sh`, port 3080): the process started 2026-08-16 23:18 held the pre-fix bundle module in memory, so every session kept failing until the process was restarted and tsx reloaded the patched files.

Fail-loud discovery then surfaced the next latent defects one at a time. `@dhicoc/dsh-wuyun-liuqi` shipped five SKILL.md files whose frontmatter `name` was the Chinese study-guide title; the registry's kebab-case grammar rejected the first of them at `list()`. The installed copy now uses each file's directory slug as the name (`liejing-tuyi-yunqi`, `suwen-rushi-yunqi-lunao`, `sanyin-sitiansi-yunqi-fang`, `yizong-jinjian-yunqi-yaojue`, `yunqi-zhengzhi-gejue`) with the Chinese title moved to the head of `description`. Separately, `dsh-skill-pack-security` (installed from the market at 2026-08-17 11:01) mounts `@perrylink/dsh-skill-pack-security-provider`, whose npm publish ships only `lib/index.js` while importing `lib/vet/*.js`; both published versions (1.3.0, 2.0.0) are broken. Removing the bundle from `dsh.profile.bundles` turned out not to stick — dshmarket re-added it (with `@nanmicoder/dsh-agent-teams`) at 11:23, and the packaged desktop backend then exited before printing its URL. The durable local repair: the market package ships the provider's TypeScript source under `provider/src/`; building it with the repo's `tsc -p tsconfig.json` and copying the emitted `lib/vet/*.js` into the installed `@perrylink` package makes both the source and packaged backends boot. Until PerryLink republishes with the runtime files, a provider reinstall wipes those files again; rebuild with the same one command.

The new check rejects empty strings, not just `undefined`. A `SkillProvider` should be addressable by name, and an empty string would be defensible only if the registry agreed to treat it as a special value — which it does not. The reserved-name check still runs on the same value, so `registerProvider(..., name: 'runtime')` is rejected with the existing `"runtime" is reserved` message.

## Testing

`packages/skill/skill/tests/skill.spec.ts` exercises every entry the new guard rejects — `undefined`, empty string, a number, and a non-string object — and asserts the synchronous throw carries the new message and that the registered provider's `lifecycle` signal lands in the aborted state. The existing tests for reserved names, factory failures, and effect-registration failures stay green.

`packages/skill/skill-filesystem/tests/`, `packages/skill/skill-badge/tests/`, and `packages/skill/tool-skill/tests/` cover the downstream consumers. The full `packages/skill/**` suite is 101 tests across 5 files, all passing.
