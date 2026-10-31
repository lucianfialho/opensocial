import { describe, it, expect, vi } from 'vitest'
import { connectWith, type ConnectDeps } from './connect.js'

function makeDeps(pkce: boolean) {
  const adapter = {
    platform: 'fake' as never,
    pkce,
    mediaIngestion: { image: 'public-url', video: 'public-url' },
    authorizeUrl: vi.fn((_c: unknown, redirect: string, state: string, extra?: { codeChallenge?: string }) =>
      `https://auth.example/?state=${state}&redirect=${encodeURIComponent(redirect)}&cc=${extra?.codeChallenge ?? ''}`),
    exchangeCode: vi.fn(async () => ({ platform: 'fake' as never, id: '1', username: 'u', accessToken: 't' })),
    refreshToken: vi.fn(),
    validate: vi.fn(() => []),
    publish: vi.fn(),
  }
  const deps: ConnectDeps = {
    adapters: { fake: adapter } as never,
    getCreds: () => ({ clientId: 'CID', clientSecret: 'CSEC' }),
    waitForCallback: vi.fn(async () => 'CODE'),
    open: vi.fn(async () => {}),
    saveAccount: vi.fn(),
    log: () => {},
  }
  return { adapter, deps }
}

describe('connectWith', () => {
  it('passes a PKCE challenge and verifier when the adapter asks for it', async () => {
    const { adapter, deps } = makeDeps(true)
    await connectWith('fake', deps)
    const [, , , authExtra] = adapter.authorizeUrl.mock.calls[0]
    const [, , , , exchangeExtra] = adapter.exchangeCode.mock.calls[0] as unknown[]
    expect(authExtra?.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect((exchangeExtra as { codeVerifier?: string }).codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(deps.saveAccount).toHaveBeenCalledWith(expect.objectContaining({ username: 'u' }))
  })
  it('passes no PKCE material when the adapter does not ask', async () => {
    const { adapter, deps } = makeDeps(false)
    await connectWith('fake', deps)
    expect(adapter.authorizeUrl.mock.calls[0][3]).toBeUndefined()
    expect((adapter.exchangeCode.mock.calls[0] as unknown[])[4]).toBeUndefined()
  })
  it('rejects unknown platforms', async () => {
    const { deps } = makeDeps(false)
    await expect(connectWith('nope', deps)).rejects.toThrow(/Unknown platform "nope"/)
  })
  it('rejects inherited-prototype property names like "constructor" as unknown platforms', async () => {
    const { deps } = makeDeps(false)
    await expect(connectWith('constructor', deps)).rejects.toThrow(/Unknown platform/)
  })
  it('passes --as and --org through to authorizeUrl and exchangeCode extras', async () => {
    const { adapter, deps } = makeDeps(false)
    await connectWith('fake', deps, { as: 'member', org: '143109039' })
    const authExtra = adapter.authorizeUrl.mock.calls[0][3] as { as?: string } | undefined
    const exchangeExtra = (adapter.exchangeCode.mock.calls[0] as unknown[])[4] as { as?: string; org?: string } | undefined
    expect(authExtra?.as).toBe('member')
    expect(exchangeExtra?.as).toBe('member')
    expect(exchangeExtra?.org).toBe('143109039')
  })
  it('passes no as/org extras when neither option is given', async () => {
    const { adapter, deps } = makeDeps(false)
    await connectWith('fake', deps)
    expect(adapter.authorizeUrl.mock.calls[0][3]).toBeUndefined()
    expect((adapter.exchangeCode.mock.calls[0] as unknown[])[4]).toBeUndefined()
  })
})
