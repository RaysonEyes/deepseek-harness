/**
 * git domain zod schemas (names derived from map keys).
 */

import { z } from 'zod'
import type { GitReviewChange } from './git.ts'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'

/** git.status request payload: the reviewed working directory. */
export const gitStatusRequestSchema = z.object({
  cwd: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'git.status'>>>

/** One change row of the review status. */
export const gitReviewChangeSchema = z.object({
  path: z.string(),
  status: z.enum(['modified', 'added', 'deleted', 'renamed', 'conflicted', 'untracked']),
  staged: z.boolean(),
  unstaged: z.boolean(),
  untracked: z.boolean(),
}) satisfies z.ZodType<Wire<GitReviewChange>>

/** git.status response value. */
export const gitStatusValueSchema = z.object({
  repoRoot: z.string(),
  branch: z.string().nullable(),
  changes: z.array(gitReviewChangeSchema),
}) satisfies z.ZodType<Wire<ResponseValue<'git.status'>>>

/** git.diff request payload. */
export const gitDiffRequestSchema = z.object({
  cwd: z.string().min(1),
  path: z.string().min(1),
  staged: z.boolean(),
}) satisfies z.ZodType<Wire<RequestPayload<'git.diff'>>>

/** git.diff response value. */
export const gitDiffValueSchema = z.object({
  path: z.string(),
  staged: z.boolean(),
  untracked: z.boolean(),
  diff: z.string(),
  content: z.string().nullable(),
}) satisfies z.ZodType<Wire<ResponseValue<'git.diff'>>>
