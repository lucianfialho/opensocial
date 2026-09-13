import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Account, Platform } from './types.js'
import { ConfigError } from './errors.js'
import { configDir } from './config.js'

function accountsFile(): string {
  return join(configDir(), 'accounts.json')
}

export function listAccounts(): Account[] {
  if (!existsSync(accountsFile())) return []
  return JSON.parse(readFileSync(accountsFile(), 'utf8')) as Account[]
}

export function getAccount(platform: Platform): Account {
  const found = listAccounts().find((a) => a.platform === platform)
  if (!found) throw new ConfigError(`No connected ${platform} account. Run \`opensocial connect ${platform}\` first.`)
  return found
}

export function saveAccount(account: Account): void {
  mkdirSync(configDir(), { recursive: true })
  const rest = listAccounts().filter((a) => !(a.platform === account.platform && a.id === account.id))
  writeFileSync(accountsFile(), JSON.stringify([...rest, account], null, 2), { mode: 0o600 })
}
