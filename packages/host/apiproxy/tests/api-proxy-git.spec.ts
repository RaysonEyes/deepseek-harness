import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { ApiProxy, RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'

let nextRpc = 1
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId(`git-${String(nextRpc++)}`), payload }
}

async function harness(): Promise<{ api: ApiProxy }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  const api = createApiProxy(ctx, { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' })
  return { api }
}

function git(dir: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd: dir, encoding: 'utf8' }).trim()
}

/** Create a scratch repository with one committed file, one unstaged edit, and one untracked file. */
function seedRepo(): { dir: string; repoRoot: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-git-review-'))
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'test'])
  writeFileSync(join(dir, 'tracked.txt'), 'one\n')
  git(dir, ['add', 'tracked.txt'])
  git(dir, ['commit', '-q', '-m', 'init'])
  writeFileSync(join(dir, 'tracked.txt'), 'one\ntwo\n')
  writeFileSync(join(dir, 'new.txt'), 'brand new\n')
  return { dir, repoRoot: realpathSync(dir) }
}

describe('git review domain', () => {
  it('lists unstaged and untracked changes with the repository root and branch', async () => {
    const seed = seedRepo()
    try {
      const { api } = await harness()
      const response = await api.git.status(request({ cwd: seed.dir }))
      expect(response.result.ok).toBe(true)
      if (!response.result.ok) return
      expect(response.result.value.repoRoot).toBe(seed.repoRoot)
      expect(response.result.value.branch).not.toBeNull()
      const tracked = response.result.value.changes.find(change => change.path === 'tracked.txt')
      expect(tracked).toMatchObject({ path: 'tracked.txt', status: 'modified', staged: false, unstaged: true, untracked: false })
      const added = response.result.value.changes.find(change => change.path === 'new.txt')
      expect(added).toMatchObject({ path: 'new.txt', status: 'untracked', staged: false, unstaged: false, untracked: true })
    } finally {
      rmSync(seed.dir, { recursive: true, force: true })
    }
  })

  it('returns the unified diff for a tracked change and raw content for an untracked file', async () => {
    const seed = seedRepo()
    try {
      const { api } = await harness()
      const diffResponse = await api.git.diff(request({ cwd: seed.dir, path: 'tracked.txt', staged: false }))
      expect(diffResponse.result.ok).toBe(true)
      if (!diffResponse.result.ok) return
      expect(diffResponse.result.value.untracked).toBe(false)
      expect(diffResponse.result.value.diff).toContain('+two')
      expect(diffResponse.result.value.content).toBeNull()

      const untrackedResponse = await api.git.diff(request({ cwd: seed.dir, path: 'new.txt', staged: false }))
      expect(untrackedResponse.result.ok).toBe(true)
      if (!untrackedResponse.result.ok) return
      expect(untrackedResponse.result.value.untracked).toBe(true)
      expect(untrackedResponse.result.value.content).toBe('brand new\n')
      expect(untrackedResponse.result.value.diff).toBe('')
    } finally {
      rmSync(seed.dir, { recursive: true, force: true })
    }
  })

  it('fails with not-a-repo outside a repository', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-git-review-plain-'))
    try {
      const { api } = await harness()
      const response = await api.git.status(request({ cwd: dir }))
      expect(response.result.ok).toBe(false)
      if (response.result.ok) return
      expect(response.result.error.code).toBe('not-a-repo')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
