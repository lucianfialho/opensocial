import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, getAppCredentials, configDir } from './config.js'
import { ConfigError } from './errors.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'opensocial-'))
  process.env.OPENSOCIAL_CONFIG_DIR = dir
  delete process.env.OPENSOCIAL_INSTAGRAM_CLIENT_ID
  delete process.env.OPENSOCIAL_INSTAGRAM_CLIENT_SECRET
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.OPENSOCIAL_CONFIG_DIR
})

it('configDir honors env override', () => expect(configDir()).toBe(dir))

it('loadConfig returns {} when file missing', () => expect(loadConfig()).toEqual({}))

it('reads credentials from file', () => {
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ instagram: { clientId: 'a', clientSecret: 'b' } }))
  expect(getAppCredentials(loadConfig(), 'instagram')).toEqual({ clientId: 'a', clientSecret: 'b' })
})

it('env vars take precedence over file', () => {
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ instagram: { clientId: 'file', clientSecret: 'file' } }))
  process.env.OPENSOCIAL_INSTAGRAM_CLIENT_ID = 'env-id'
  process.env.OPENSOCIAL_INSTAGRAM_CLIENT_SECRET = 'env-secret'
  expect(getAppCredentials(loadConfig(), 'instagram')).toEqual({ clientId: 'env-id', clientSecret: 'env-secret' })
})

it('throws ConfigError with setup hint when missing', () => {
  expect(() => getAppCredentials({}, 'tiktok')).toThrow(ConfigError)
  expect(() => getAppCredentials({}, 'tiktok')).toThrow(/config.json|OPENSOCIAL_TIKTOK_CLIENT_ID/)
})
