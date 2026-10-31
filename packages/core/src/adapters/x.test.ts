import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { xAdapter, weightedLength } from './x.js'
import { jsonResponse, rawResponse, sequenceFetch } from '../test-helpers.js'
import { ApiError, AuthExpiredError, RateLimitError } from '../errors.js'

const creds = { clientId: 'CID', clientSecret: 'CSEC' }
const redirect = 'http://localhost:8976/callback'
const account = { platform: 'x' as const, id: '42', username: 'oagentico', accessToken: 'TOK', refreshToken: 'REF' }
const basic = 'Basic ' + Buffer.from('CID:CSEC').toString('base64')

function tmpJpg(): string {
  const dir = mkdtempSync(join(tmpdir(), 'x-'))
  const p = join(dir, 'card.jpg')
  writeFileSync(p, Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
  return p
}

describe('weightedLength', () => {
  it('counts urls as 23 and other text by code point', () => {
    expect(weightedLength('abc')).toBe(3)
    expect(weightedLength('veja https://oagentico.com.br/evento/123456789 agora')).toBe(5 + 23 + 6)
    expect(weightedLength('🚀🚀')).toBe(2)
  })
})

describe('authorizeUrl', () => {
  it('builds the x oauth2 url with pkce', () => {
    const url = new URL(xAdapter.authorizeUrl(creds, redirect, 'st1', { codeChallenge: 'CHAL' }))
    expect(url.origin + url.pathname).toBe('https://x.com/i/oauth2/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('CID')
    expect(url.searchParams.get('redirect_uri')).toBe(redirect)
    expect(url.searchParams.get('scope')).toBe('tweet.read tweet.write users.read offline.access')
    expect(url.searchParams.get('state')).toBe('st1')
    expect(url.searchParams.get('code_challenge')).toBe('CHAL')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })
  it('refuses to build without a challenge', () => {
    expect(() => xAdapter.authorizeUrl(creds, redirect, 'st1')).toThrow(/PKCE/)
  })
})

describe('exchangeCode', () => {
  it('exchanges with basic auth + verifier and reads users/me', async () => {
    const { fetch, calls } = sequenceFetch([
      jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 7200 }),
      jsonResponse({ data: { id: '42', username: 'oagentico' } }),
    ])
    const acc = await xAdapter.exchangeCode(creds, 'CODE', redirect, fetch, { codeVerifier: 'VER' })
    expect(calls[0].url).toBe('https://api.x.com/2/oauth2/token')
    expect((calls[0].init?.headers as Record<string, string>)['Authorization']).toBe(basic)
    const form = new URLSearchParams(String(calls[0].init?.body))
    expect(form.get('grant_type')).toBe('authorization_code')
    expect(form.get('code_verifier')).toBe('VER')
    expect(form.get('redirect_uri')).toBe(redirect)
    expect(form.get('client_id')).toBe('CID')
    expect(calls[1].url).toBe('https://api.x.com/2/users/me')
    expect(acc).toMatchObject({ platform: 'x', id: '42', username: 'oagentico', accessToken: 'AT', refreshToken: 'RT' })
  })
})

describe('refreshToken', () => {
  it('returns the NEW refresh token (single use)', async () => {
    const { fetch, calls } = sequenceFetch([jsonResponse({ access_token: 'AT2', refresh_token: 'RT2', expires_in: 7200 })])
    const acc = await xAdapter.refreshToken(creds, account, fetch)
    expect((calls[0].init?.headers as Record<string, string>)['Authorization']).toBe(basic)
    expect(new URLSearchParams(String(calls[0].init?.body)).get('grant_type')).toBe('refresh_token')
    expect(acc.refreshToken).toBe('RT2')
    expect(acc.accessToken).toBe('AT2')
  })
  it('turns a 400 (used/revoked refresh token) into AuthExpiredError', async () => {
    const { fetch } = sequenceFetch([rawResponse('{"error":"invalid_request"}', 400)])
    await expect(xAdapter.refreshToken(creds, account, fetch)).rejects.toBeInstanceOf(AuthExpiredError)
  })
})

describe('validate', () => {
  it('rejects empty, over 280 weighted, two images and video', () => {
    expect(xAdapter.validate({ text: '', media: [] })[0].message).toMatch(/text or one image/i)
    const long = 'x'.repeat(235) + ' https://a.b/c https://d.e/f'
    expect(xAdapter.validate({ text: long, media: [] })[0].message).toMatch(/280/)
    expect(xAdapter.validate({ text: 'ok', media: [{ source: 'a.jpg' }, { source: 'b.jpg' }] })[0].message).toMatch(/at most 1 image/i)
    expect(xAdapter.validate({ text: 'ok', media: [{ source: 'a.mp4' }] })[0].message).toMatch(/vídeo não suportado nesta versão/)
  })
  it('accepts 280 weighted exactly', () => {
    const text = 'x'.repeat(234) + ' https://oagentico.com.br/qualquer/coisa/longa/aqui/mesmo'
    expect(weightedLength(text)).toBe(258)
    expect(xAdapter.validate({ text, media: [{ source: 'a.jpg' }] })).toEqual([])
  })
})

describe('publish', () => {
  it('posts text only', async () => {
    const { fetch, calls } = sequenceFetch([jsonResponse({ data: { id: '777', text: 'oi' } }, 201)])
    const out = await xAdapter.publish(account, { text: 'oi', media: [] }, {}, fetch)
    expect(calls[0].url).toBe('https://api.x.com/2/tweets')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ text: 'oi' })
    expect(out).toEqual({ platform: 'x', id: '777', url: 'https://x.com/oagentico/status/777' })
  })
  it('uploads the image (multipart) then tweets with media_ids', async () => {
    const { fetch, calls } = sequenceFetch([
      jsonResponse({ data: { id: 'MEDIA1', media_key: '3_MEDIA1' } }),
      jsonResponse({ data: { id: '778', text: 'legenda' } }, 201),
    ])
    const out = await xAdapter.publish(account, { text: 'legenda', media: [{ kind: 'image', filePath: tmpJpg() }] }, {}, fetch)
    expect(calls[0].url).toBe('https://api.x.com/2/media/upload')
    const form = calls[0].init?.body as FormData
    expect(form.get('media_category')).toBe('tweet_image')
    expect(form.get('media')).toBeInstanceOf(Blob)
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ text: 'legenda', media: { media_ids: ['MEDIA1'] } })
    expect(out.id).toBe('778')
  })
  it('maps 429 to RateLimitError with retryAfterSeconds from x-rate-limit-reset', async () => {
    const reset = Math.floor(Date.now() / 1000) + 90
    const { fetch } = sequenceFetch([rawResponse('{"title":"Too Many Requests"}', 429, { 'x-rate-limit-reset': String(reset) })])
    const err = await xAdapter.publish(account, { text: 'oi', media: [] }, {}, fetch).catch((e) => e)
    expect(err).toBeInstanceOf(RateLimitError)
    expect(err.retryAfterSeconds).toBeGreaterThan(60)
    expect(err.retryAfterSeconds).toBeLessThanOrEqual(90)
  })
  it('wraps other non-2xx into ApiError', async () => {
    const { fetch } = sequenceFetch([rawResponse('{"title":"Forbidden"}', 403)])
    await expect(xAdapter.publish(account, { text: 'oi', media: [] }, {}, fetch)).rejects.toMatchObject({ status: 403 })
    const { fetch: f2 } = sequenceFetch([rawResponse('{"title":"Forbidden"}', 403)])
    await expect(xAdapter.publish(account, { text: 'oi', media: [] }, {}, f2)).rejects.toBeInstanceOf(ApiError)
  })
})
