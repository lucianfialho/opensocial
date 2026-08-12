import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publishToAll, ValidationError } from './publish.js'
import { saveAccount } from './accounts.js'
import { adapters } from './adapter.js'
import { ApiError } from './errors.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ospub-'))
  process.env.OPENSOCIAL_CONFIG_DIR = dir
  saveAccount({ platform: 'instagram', id: 'IG', username: 'u', accessToken: 'T' })
  saveAccount({ platform: 'tiktok', id: 'TK', username: 'u', accessToken: 'T' })
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.OPENSOCIAL_CONFIG_DIR
  vi.restoreAllMocks()
})

it('validation failure on ANY platform publishes NOTHING', async () => {
  const igSpy = vi.spyOn(adapters.instagram, 'publish')
  // instagram ok (has media), tiktok invalid (mixes photo+video)
  await expect(
    publishToAll(['instagram', 'tiktok'], { text: 'x', media: [{ source: 'https://c/a.jpg' }, { source: 'https://c/b.mp4' }] }),
  ).rejects.toThrow(ValidationError)
  expect(igSpy).not.toHaveBeenCalled()
})

it('partial failure: one platform fails, other still publishes', async () => {
  vi.spyOn(adapters.instagram, 'publish').mockResolvedValue({ platform: 'instagram', id: 'M1', url: 'https://ig/p' })
  vi.spyOn(adapters.tiktok, 'publish').mockRejectedValue(new ApiError('TikTok exploded', 500))
  const results = await publishToAll(['instagram', 'tiktok'], { text: 'x', media: [{ source: 'https://c/a.mp4' }] })
  expect(results).toEqual([
    { platform: 'instagram', status: 'published', id: 'M1', url: 'https://ig/p' },
    { platform: 'tiktok', status: 'failed', error: 'TikTok exploded' },
  ])
})

it('401 triggers refresh + single retry and persists refreshed account', async () => {
  vi.spyOn(adapters.instagram, 'publish')
    .mockRejectedValueOnce(new ApiError('expired', 401))
    .mockResolvedValueOnce({ platform: 'instagram', id: 'M2', url: undefined })
  vi.spyOn(adapters.instagram, 'refreshToken').mockResolvedValue({
    platform: 'instagram', id: 'IG', username: 'u', accessToken: 'NEW',
  })
  process.env.OPENSOCIAL_INSTAGRAM_CLIENT_ID = 'a'
  process.env.OPENSOCIAL_INSTAGRAM_CLIENT_SECRET = 'b'
  const results = await publishToAll(['instagram'], { text: 'x', media: [{ source: 'https://c/a.jpg' }] })
  expect(results[0].status).toBe('published')
  const { getAccount } = await import('./accounts.js')
  expect(getAccount('instagram').accessToken).toBe('NEW')
  delete process.env.OPENSOCIAL_INSTAGRAM_CLIENT_ID
  delete process.env.OPENSOCIAL_INSTAGRAM_CLIENT_SECRET
})

it('missing account fails before anything publishes', async () => {
  rmSync(join(dir, 'accounts.json'))
  const igSpy = vi.spyOn(adapters.instagram, 'publish')
  await expect(publishToAll(['instagram'], { text: 'x', media: [{ source: 'https://c/a.jpg' }] })).rejects.toThrow(/connect instagram/)
  expect(igSpy).not.toHaveBeenCalled()
})
