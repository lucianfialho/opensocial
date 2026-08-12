import { describe, it, expect } from 'vitest'
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
