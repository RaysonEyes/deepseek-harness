/**
 * git domain contract: read-only Git status/diff review for the working tree.
 * The host runs `git` in the requested directory; the payload carries the
 * absolute working directory of the reviewed workspace (the client sends its
 * session's cwd). No protocol version: client and host ship together.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One change row of the review status. */
export interface GitReviewChange {
  /** Repository-relative path with forward slashes. */
  path: string
  /** Leading status letter resolved from the porcelain pair. */
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'conflicted' | 'untracked'
  /** Present in the index (staged). */
  staged: boolean
  /** Present in the working tree (unstaged). */
  unstaged: boolean
  /** Untracked file (porcelain `??`). */
  untracked: boolean
}

/** git.status response value. */
export interface GitReviewStatusValue {
  /** Absolute repository root resolved by `git rev-parse --show-toplevel`. */
  repoRoot: string
  /** Current branch name, or null when detached. */
  branch: string | null
  /** Every non-ignored change row in porcelain order. */
  changes: GitReviewChange[]
}

/** git.diff response value. */
export interface GitReviewDiffValue {
  /** Repository-relative path of the reviewed file. */
  path: string
  /** Whether the diff reflects the index (staged) or the working tree. */
  staged: boolean
  /** True when the path is untracked (no diff; raw content supplied). */
  untracked: boolean
  /** Unified diff text, or empty for untracked paths. */
  diff: string
  /** Raw file content for untracked paths; null otherwise. */
  content: string | null
}

/** Git review unary methods. */
export interface GitApi {
  /**
   * Working-tree status of the repository containing `cwd`. Fails with
   * `not-a-repo` when no repository is found, `cwd-invalid` when the
   * directory does not exist, and `git-failed` for other git failures.
   */
  status(
    request: RpcRequest<{ cwd: string }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<GitReviewStatusValue>>

  /**
   * Unified diff for one repository-relative path: the index (staged) or the
   * working tree. Untracked paths return the raw file content instead.
   * Fails with `not-a-repo`, `path-outside-repo`, or `git-failed`.
   */
  diff(
    request: RpcRequest<{ cwd: string; path: string; staged: boolean }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<GitReviewDiffValue>>
}
