import { describe, it, expect } from 'vitest'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { waitForCallback, randomState, OAUTH_PORT, pkcePair, pkceChallenge } from './oauth.js'

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

it('rejects and cleans up when server port is unavailable', async () => {
  const dummy = createServer().listen(OAUTH_PORT, '127.0.0.1')
  const pending = waitForCallback('abc')
  await expect(pending).rejects.toThrow(/EADDRINUSE/)
  dummy.close()
})
})

describe('pkce', () => {
  it('challenge is base64url(sha256(verifier)) — RFC 7636 appendix B vector', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    expect(pkceChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
  it('pkcePair generates a 43-char base64url verifier and a matching challenge', () => {
    const { verifier, challenge } = pkcePair()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
  })
  it('two pairs differ', () => {
    expect(pkcePair().verifier).not.toBe(pkcePair().verifier)
  })
})
