import { describe, it, expect } from 'vitest'
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
