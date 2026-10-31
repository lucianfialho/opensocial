import open from 'open'
import {
  adapters, ensureLocalTlsCert, getAppCredentials, loadConfig, randomState, pkcePair,
  waitForCallback, REDIRECT_URI, SECURE_REDIRECT_URI, saveAccount,
  type Platform, type PlatformAdapter, type Account, type AppCredentials,
} from '@opensocial/core'

// Meta rejects http:// redirect URIs, so Instagram uses the https callback
// with a self-signed localhost cert (the browser shows a warning once —
// choose Advanced > Continue). LinkedIn and X accept http://localhost.
const NEEDS_TLS: Record<Platform, boolean> = { instagram: true, tiktok: false, youtube: false, linkedin: false, x: false }

export interface ConnectDeps {
  adapters: Record<string, PlatformAdapter>
  getCreds: (platform: Platform) => AppCredentials
  waitForCallback: (state: string, timeoutMs?: number, tls?: ReturnType<typeof ensureLocalTlsCert>) => Promise<string>
  open: (url: string) => Promise<unknown>
  saveAccount: (account: Account) => void
  log: (line: string) => void
  /** Override for platforms (TikTok) that refuse localhost redirect URIs. */
  redirectUri?: string
  tls?: ReturnType<typeof ensureLocalTlsCert>
}

export async function connectWith(platform: string, deps: ConnectDeps): Promise<Account> {
  if (!Object.hasOwn(deps.adapters, platform)) throw new Error(`Unknown platform "${platform}". Supported: ${Object.keys(deps.adapters).join(', ')}`)
  const adapter = deps.adapters[platform]
  const p = platform as Platform
  const creds = deps.getCreds(p)
  const state = randomState()
  const redirectUri = deps.redirectUri ?? (deps.tls ? SECURE_REDIRECT_URI : REDIRECT_URI)
  const pkce = adapter.pkce ? pkcePair() : undefined
  const url = adapter.authorizeUrl(creds, redirectUri, state, pkce ? { codeChallenge: pkce.challenge } : undefined)
  deps.log(`Opening browser for ${p} authorization...\nIf it does not open, visit:\n${url}\n`)
  if (deps.tls) deps.log('Note: the browser will warn about the self-signed localhost certificate — choose Advanced > Continue.\n')
  const pendingCode = deps.waitForCallback(state, undefined, deps.tls)
  await deps.open(url)
  const code = await pendingCode
  const account = await adapter.exchangeCode(creds, code, redirectUri, undefined, pkce ? { codeVerifier: pkce.verifier } : undefined)
  deps.saveAccount(account)
  deps.log(`Connected @${account.username} (${p}).`)
  return account
}

export async function connectCommand(platform: string): Promise<void> {
  const p = platform as Platform
  const tls = p in NEEDS_TLS && NEEDS_TLS[p] ? ensureLocalTlsCert() : undefined
  await connectWith(platform, {
    adapters,
    getCreds: (pl) => getAppCredentials(loadConfig(), pl),
    waitForCallback,
    open,
    saveAccount,
    log: (line) => console.log(line),
    redirectUri: process.env.OPENSOCIAL_REDIRECT_URI,
    tls,
  })
}
