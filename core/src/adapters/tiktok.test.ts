import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tiktokAdapter } from './tiktok.js'
import { jsonResponse, sequenceFetch } from '../test-helpers.js'

const creds = { clientId: 'CKEY', clientSecret: 'CSEC' }

it('authorizeUrl uses client_key and scopes', () => {
  const url = new URL(tiktokAdapter.authorizeUrl(creds, 'http://localhost:8976/callback', 'st'))
  expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/')
  expect(url.searchParams.get('client_key')).toBe('CKEY')
  expect(url.searchParams.get('scope')).toContain('video.publish')
})

it('exchangeCode gets tokens then user info', async () => {
  const { fetch, calls } = sequenceFetch([
    jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 86400, open_id: 'OID', scope: 'video.publish' }),
    jsonResponse({ data: { user: { open_id: 'OID', display_name: 'Lucian' } }, error: { code: 'ok', message: '' } }),
  ])
  const acc = await tiktokAdapter.exchangeCode(creds, 'CODE', 'http://localhost:8976/callback', fetch)
  expect(calls[0].url).toBe('https://open.tiktokapis.com/v2/oauth/token/')
  expect(acc).toMatchObject({ platform: 'tiktok', id: 'OID', username: 'Lucian', accessToken: 'AT', refreshToken: 'RT' })
})

it('refreshToken posts grant_type=refresh_token', async () => {
  const { fetch, calls } = sequenceFetch([
    jsonResponse({ access_token: 'AT2', refresh_token: 'RT2', expires_in: 86400, open_id: 'OID' }),
  ])
  const acc = await tiktokAdapter.refreshToken(creds, {
    platform: 'tiktok', id: 'OID', username: 'Lucian', accessToken: 'old', refreshToken: 'RT',
  }, fetch)
  expect(String(calls[0].init?.body)).toContain('grant_type=refresh_token')
  expect(acc.accessToken).toBe('AT2')
})

describe('validate', () => {
  it('requires exactly one video or 1-35 photos', () => {
    expect(tiktokAdapter.validate({ text: 'x', media: [] })[0].message).toMatch(/one video|photo/i)
    expect(tiktokAdapter.validate({ text: 'x', media: [{ source: 'a.mp4' }, { source: 'b.mp4' }] })[0].message).toMatch(/single video/i)
    expect(tiktokAdapter.validate({ text: 'x', media: [{ source: 'a.jpg' }, { source: 'b.mp4' }] })[0].message).toMatch(/mix/i)
    expect(tiktokAdapter.validate({ text: 'x', media: [{ source: 'a.mp4' }] })).toEqual([])
    expect(tiktokAdapter.validate({ text: 'x', media: [{ source: 'a.jpg' }] })).toEqual([])
  })
  it('rejects title over 2200 chars', () => {
    expect(tiktokAdapter.validate({ text: 'x'.repeat(2201), media: [{ source: 'a.mp4' }] })[0].message).toMatch(/2,?200/)
  })
})

describe('publish', () => {
  const account = { platform: 'tiktok' as const, id: 'OID', username: 'u', accessToken: 'AT' }

  beforeEach(() => {
    process.env.OPENSOCIAL_POLL_INTERVAL_MS = '1'
  })

  afterEach(() => {
    delete process.env.OPENSOCIAL_POLL_INTERVAL_MS
  })

  function tmpVideo(bytes = 16): string {
    const p = join(mkdtempSync(join(tmpdir(), 'ostk-')), 'v.mp4')
    writeFileSync(p, Buffer.alloc(bytes, 1))
    return p
  }

  it('video: init -> upload chunk -> poll to complete', async () => {
    const { fetch, calls } = sequenceFetch([
      jsonResponse({ data: { publish_id: 'P1', upload_url: 'https://upload.tiktok.com/u1' }, error: { code: 'ok', message: '' } }),
      new Response(null, { status: 200 }),
      jsonResponse({ data: { status: 'PROCESSING_DOWNLOAD' }, error: { code: 'ok', message: '' } }),
      jsonResponse({ data: { status: 'PUBLISH_COMPLETE' }, error: { code: 'ok', message: '' } }),
    ])
    const out = await tiktokAdapter.publish(
      account, { text: 'title', media: [{ kind: 'video', filePath: tmpVideo(16) }] }, {}, fetch,
    )
    const initBody = JSON.parse(String(calls[0].init?.body))
    expect(initBody.post_info.privacy_level).toBe('SELF_ONLY')
    expect(initBody.source_info).toMatchObject({ source: 'FILE_UPLOAD', video_size: 16, total_chunk_count: 1 })
    expect(calls[1].url).toBe('https://upload.tiktok.com/u1')
    expect((calls[1].init?.headers as Record<string, string>)['content-range']).toBe('bytes 0-15/16')
    expect(out).toEqual({ platform: 'tiktok', id: 'P1', url: undefined })
  })

  it('video over 64MB is rejected before any network call', async () => {
    const { fetch, calls } = sequenceFetch([])
    const big = { kind: 'video' as const, filePath: tmpVideo(65 * 1024 * 1024) }
    await expect(tiktokAdapter.publish(account, { text: '', media: [big] }, {}, fetch)).rejects.toThrow(/64MB/)
    expect(calls).toHaveLength(0)
  })

  it('photos: content init with PULL_FROM_URL', async () => {
    const { fetch, calls } = sequenceFetch([
      jsonResponse({ data: { publish_id: 'P2' }, error: { code: 'ok', message: '' } }),
      jsonResponse({ data: { status: 'PUBLISH_COMPLETE' }, error: { code: 'ok', message: '' } }),
    ])
    await tiktokAdapter.publish(
      account, { text: 'pics', media: [{ kind: 'image', url: 'https://cdn/1.jpg' }] },
      { tiktokPrivacyLevel: 'PUBLIC_TO_EVERYONE' }, fetch,
    )
    const body = JSON.parse(String(calls[0].init?.body))
    expect(calls[0].url).toContain('/post/publish/content/init/')
    expect(body.source_info.photo_images).toEqual(['https://cdn/1.jpg'])
    expect(body.post_info.privacy_level).toBe('PUBLIC_TO_EVERYONE')
  })

  it('FAILED status raises MediaRejectedError with reason', async () => {
    const { fetch } = sequenceFetch([
      jsonResponse({ data: { publish_id: 'P3', upload_url: 'https://u' }, error: { code: 'ok', message: '' } }),
      new Response(null, { status: 200 }),
      jsonResponse({ data: { status: 'FAILED', fail_reason: 'video_too_long' }, error: { code: 'ok', message: '' } }),
    ])
    await expect(
      tiktokAdapter.publish(account, { text: '', media: [{ kind: 'video', filePath: tmpVideo(8) }] }, {}, fetch),
    ).rejects.toThrow(/video_too_long/)
  })
})
