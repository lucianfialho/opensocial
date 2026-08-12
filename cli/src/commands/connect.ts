import open from 'open'
import {
  adapters, getAppCredentials, loadConfig, randomState, waitForCallback,
  REDIRECT_URI, saveAccount, type Platform,
} from '@opensocial/core'

export async function connectCommand(platform: string): Promise<void> {
  if (!(platform in adapters)) throw new Error(`Unknown platform "${platform}". Supported: ${Object.keys(adapters).join(', ')}`)
  const p = platform as Platform
  const creds = getAppCredentials(loadConfig(), p)
  const state = randomState()
  const url = adapters[p].authorizeUrl(creds, REDIRECT_URI, state)
  console.log(`Opening browser for ${p} authorization...\nIf it does not open, visit:\n${url}\n`)
  const pendingCode = waitForCallback(state)
  await open(url)
  const code = await pendingCode
  const account = await adapters[p].exchangeCode(creds, code, REDIRECT_URI)
  saveAccount(account)
  console.log(`Connected @${account.username} (${p}).`)
}
