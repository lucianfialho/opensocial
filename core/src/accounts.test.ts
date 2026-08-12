import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listAccounts, getAccount, saveAccount } from './accounts.js'
import { ConfigError } from './errors.js'
import type { Account } from './types.js'

const acc: Account = { platform: 'instagram', id: '123', username: 'lu', accessToken: 't1' }

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'opensocial-'))
  process.env.OPENSOCIAL_CONFIG_DIR = dir
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.OPENSOCIAL_CONFIG_DIR
})

it('listAccounts returns [] when file missing', () => expect(listAccounts()).toEqual([]))

it('save + get roundtrip', () => {
  saveAccount(acc)
  expect(getAccount('instagram')).toEqual(acc)
})

it('saveAccount upserts by platform+id', () => {
  saveAccount(acc)
  saveAccount({ ...acc, accessToken: 't2' })
  expect(listAccounts()).toHaveLength(1)
  expect(getAccount('instagram').accessToken).toBe('t2')
})

it('accounts.json has 600 permissions', () => {
  saveAccount(acc)
  const mode = statSync(join(dir, 'accounts.json')).mode & 0o777
  expect(mode).toBe(0o600)
})

it('getAccount throws helpful ConfigError when missing', () => {
  expect(() => getAccount('tiktok')).toThrow(ConfigError)
  expect(() => getAccount('tiktok')).toThrow(/opensocial connect tiktok/)
})
