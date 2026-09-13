import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { instagramAdapter } from './instagram.js'
import { jsonResponse, sequenceFetch } from '../test-helpers.js'

const creds = { clientId: 'CID', clientSecret: 'CSEC' }

describe('authorizeUrl', () => {
  it('builds instagram oauth url with scopes and state', () => {
    const url = new URL(instagramAdapter.authorizeUrl(creds, 'http://localhost:8976/callback', 'st1'))
    expect(url.origin + url.pathname).toBe('https://www.instagram.com/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('CID')
    expect(url.searchParams.get('scope')).toContain('instagram_business_content_publish')
    expect(url.searchParams.get('state')).toBe('st1')
  })
})

describe('exchangeCode', () => {
  it('exchanges code -> short token -> long token -> profile', async () => {
    const { fetch, calls } = sequenceFetch([
      jsonResponse({ access_token: 'short', user_id: 17841400000000000 }),
      jsonResponse({ access_token: 'long', token_type: 'bearer', expires_in: 5183944 }),
      jsonResponse({ user_id: '17841400000000000', username: 'metricasboss' }),
    ])
    const acc = await instagramAdapter.exchangeCode(creds, 'CODE', 'http://localhost:8976/callback', fetch)
    expect(calls[0].url).toBe('https://api.instagram.com/oauth/access_token')
    expect(calls[1].url).toContain('grant_type=ig_exchange_token')
    expect(acc).toMatchObject({ platform: 'instagram', id: '17841400000000000', username: 'metricasboss', accessToken: 'long' })
    expect(new Date(acc.expiresAt!).getTime()).toBeGreaterThan(Date.now())
  })
})

describe('validate', () => {
  it('requires media', () => {
    const issues = instagramAdapter.validate({ text: 'hi', media: [] })
    expect(issues[0].message).toMatch(/requires at least one media/i)
  })
  it('rejects caption over 2200 chars and more than 10 items', () => {
    const media = Array.from({ length: 11 }, () => ({ source: 'a.jpg' }))
    const issues = instagramAdapter.validate({ text: 'x'.repeat(2201), media })
    expect(issues.map((i) => i.message).join()).toMatch(/2,?200/)
    expect(issues.map((i) => i.message).join()).toMatch(/10/)
  })
  it('rejects video mixed with images', () => {
    const issues = instagramAdapter.validate({ text: '', media: [{ source: 'a.jpg' }, { source: 'b.mp4' }] })
    expect(issues[0].message).toMatch(/single video/i)
  })
  it('accepts single image with caption', () => {
    expect(instagramAdapter.validate({ text: 'ok', media: [{ source: 'a.jpg' }] })).toEqual([])
  })
})

describe('publish', () => {
  const account = { platform: 'instagram' as const, id: 'IGID', username: 'u', accessToken: 'TOK' }
  beforeEach(() => {
    process.env.OPENSOCIAL_POLL_INTERVAL_MS = '1'
  })
  afterEach(() => {
    delete process.env.OPENSOCIAL_POLL_INTERVAL_MS
  })

  it('single image: container -> status poll -> publish -> permalink', async () => {
    const { fetch, calls } = sequenceFetch([
      jsonResponse({ id: 'C1' }),
      jsonResponse({ status_code: 'FINISHED' }),
      jsonResponse({ id: 'M1' }),
      jsonResponse({ permalink: 'https://www.instagram.com/p/xyz/' }),
    ])
    const out = await instagramAdapter.publish(
      account, { text: 'cap', media: [{ kind: 'image', url: 'https://cdn/x.jpg' }] }, {}, fetch,
    )
    expect(calls[0].url).toBe('https://graph.instagram.com/v23.0/IGID/media')
    expect(String(calls[0].init?.body)).toContain('image_url=')
    expect(calls[1].url).toContain('fields=status_code')
    expect(calls[2].url).toBe('https://graph.instagram.com/v23.0/IGID/media_publish')
    expect(out).toEqual({ platform: 'instagram', id: 'M1', url: 'https://www.instagram.com/p/xyz/' })
  })

  it('carousel: child containers, carousel container, status poll', async () => {
    const { fetch, calls } = sequenceFetch([
      jsonResponse({ id: 'A' }), jsonResponse({ id: 'B' }),
      jsonResponse({ id: 'CAR' }),
      jsonResponse({ status_code: 'FINISHED' }),
      jsonResponse({ id: 'M2' }),
      jsonResponse({ permalink: 'https://www.instagram.com/p/car/' }),
    ])
    await instagramAdapter.publish(
      account,
      { text: 'cap', media: [{ kind: 'image', url: 'https://cdn/1.jpg' }, { kind: 'image', url: 'https://cdn/2.jpg' }] },
      {}, fetch,
    )
    expect(String(calls[0].init?.body)).toContain('is_carousel_item=true')
    expect(String(calls[2].init?.body)).toContain('media_type=CAROUSEL')
    expect(String(calls[2].init?.body)).toContain('children%5B0%5D=A')
    expect(String(calls[2].init?.body)).toContain('children%5B1%5D=B')
    expect(calls[3].url).toContain('fields=status_code')
  })

  it('retries media_publish on "media not ready" (2207027)', async () => {
    const { fetch, calls } = sequenceFetch([
      jsonResponse({ id: 'C9' }),
      jsonResponse({ status_code: 'FINISHED' }),
      jsonResponse({ error: { message: 'Media ID is not available', code: 9007, error_subcode: 2207027 } }, 400),
      jsonResponse({ id: 'M9' }),
      jsonResponse({ permalink: 'https://www.instagram.com/p/retry/' }),
    ])
    const out = await instagramAdapter.publish(
      account, { text: 'cap', media: [{ kind: 'image', url: 'https://cdn/x.jpg' }] }, {}, fetch,
    )
    expect(calls.filter((c) => c.url.includes('media_publish'))).toHaveLength(2)
    expect(out.id).toBe('M9')
  })

  describe('reel', () => {
    beforeEach(() => {
      process.env.OPENSOCIAL_POLL_INTERVAL_MS = '1'
    })
    afterEach(() => {
      delete process.env.OPENSOCIAL_POLL_INTERVAL_MS
    })

    it('polls status until FINISHED before publishing', async () => {
      const { fetch, calls } = sequenceFetch([
        jsonResponse({ id: 'V1' }),
        jsonResponse({ status_code: 'IN_PROGRESS' }),
        jsonResponse({ status_code: 'FINISHED' }),
        jsonResponse({ id: 'M3' }),
        jsonResponse({ permalink: 'https://www.instagram.com/reel/abc/' }),
      ])
      const out = await instagramAdapter.publish(
        account, { text: 'reel!', media: [{ kind: 'video', url: 'https://cdn/v.mp4' }] }, {}, fetch,
      )
      expect(String(calls[0].init?.body)).toContain('media_type=REELS')
      expect(calls[1].url).toContain('fields=status_code')
      expect(out.id).toBe('M3')
    })
  })
})
