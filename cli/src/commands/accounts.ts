import { listAccounts } from '@opensocial/core'

export function accountsCommand(): void {
  const accounts = listAccounts()
  if (accounts.length === 0) {
    console.log('No connected accounts. Run `opensocial connect <platform>`.')
    return
  }
  console.log('PLATFORM    USERNAME             ID                    EXPIRES')
  for (const a of accounts) {
    console.log(`${a.platform.padEnd(11)} ${a.username.padEnd(20)} ${a.id.padEnd(21)} ${a.expiresAt ?? '-'}`)
  }
}
