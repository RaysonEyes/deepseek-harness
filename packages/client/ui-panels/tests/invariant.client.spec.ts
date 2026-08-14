// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, inject, name } from '../src/invariant.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

describe('ui-panels invariant', () => {
  it('registers package ownership without a runtime invariant', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const registrations = new Map<string, () => void>()
    ctx.provide('invariants', {
      register: (packageName: string, install: () => void) => {
        registrations.set(packageName, install)
        return () => { registrations.delete(packageName) }
      },
    })
    await apply(ctx)
    expect(inject).toEqual(['invariants'])
    expect(name).toBe('client-ui-panels-invariant')
    expect(registrations.has('@deepseek-ai/dsh-client-ui-panels')).toBe(true)
    expect(() => registrations.get('@deepseek-ai/dsh-client-ui-panels')?.()).not.toThrow()
  })
})
