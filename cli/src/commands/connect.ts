import open from 'open'
import {
  adapters, ensureLocalTlsCert, getAppCredentials, loadConfig, randomState,
  waitForCallback, REDIRECT_URI, SECURE_REDIRECT_URI, saveAccount, type Platform,
} from '@opensocial/core'

// Meta rejects http:// redirect URIs, so Instagram uses the https callback
// with a self-signed localhost cert (the browser shows a warning once —
// choose Advanced > Continue).
const NEEDS_TLS: Record<Platform, boolean> = { instagram: true, tiktok: false, youtube: false }

export async function connectCommand(platform: string): Promise<void> {
  if (!(platform in adapters)) throw new Error(`Unknown platform "${platform}". Supported: ${Object.keys(adapters).join(', ')}`)
  const p = platform as Platform
  const creds = getAppCredentials(loadConfig(), p)
  const state = randomState()
  const tls = NEEDS_TLS[p] ? ensureLocalTlsCert() : undefined
  // Some platforms (TikTok) refuse localhost redirect URIs. Register a page
  // on a real domain that forwards its query string to localhost:8976 and
  // point OPENSOCIAL_REDIRECT_URI at it — the local callback server still
  // receives the code.
  const redirectUri = process.env.OPENSOCIAL_REDIRECT_URI ?? (tls ? SECURE_REDIRECT_URI : REDIRECT_URI)
  const url = adapters[p].authorizeUrl(creds, redirectUri, state)
  console.log(`Opening browser for ${p} authorization...\nIf it does not open, visit:\n${url}\n`)
  if (tls) console.log('Note: the browser will warn about the self-signed localhost certificate — choose Advanced > Continue.\n')
  const pendingCode = waitForCallback(state, undefined, tls)
  await open(url)
  const code = await pendingCode
  const account = await adapters[p].exchangeCode(creds, code, redirectUri)
  saveAccount(account)
  console.log(`Connected @${account.username} (${p}).`)
}
