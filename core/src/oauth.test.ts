import { describe, it, expect } from 'vitest'
import { waitForCallback, randomState, OAUTH_PORT } from './oauth.js'

describe.sequential('OAuth', () => {
it('randomState returns 32 hex chars, unique', () => {
  const s = randomState()
  expect(s).toMatch(/^[0-9a-f]{32}$/)
  expect(randomState()).not.toBe(s)
})

it('resolves with code when state matches', async () => {
  const pending = waitForCallback('abc')
  const res = await fetch(`http://localhost:${OAUTH_PORT}/callback?code=THECODE&state=abc`)
  expect(res.status).toBe(200)
  await expect(pending).resolves.toBe('THECODE')
})

it('rejects on state mismatch', async () => {
  const pending = waitForCallback('abc')
  await fetch(`http://localhost:${OAUTH_PORT}/callback?code=x&state=WRONG`)
  await expect(pending).rejects.toThrow(/state/i)
})

it('rejects when provider returns error param', async () => {
  const pending = waitForCallback('abc')
  await fetch(`http://localhost:${OAUTH_PORT}/callback?error=access_denied&state=abc`)
  await expect(pending).rejects.toThrow(/access_denied/)
})
})
