import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { linkedinAdapter, escapeLinkedInLittleText } from './linkedin.js'
import { jsonResponse, rawResponse, sequenceFetch } from '../test-helpers.js'
import { ApiError, AuthExpiredError, ConfigError, MediaRejectedError } from '../errors.js'

const creds = { clientId: 'CID', clientSecret: 'CSEC' }
const redirect = 'http://localhost:8976/callback'
const account = { platform: 'linkedin' as const, id: 'SUB123', username: 'Lucian Fialho', accessToken: 'TOK', refreshToken: 'REF' }

function tmpJpg(): string {
  const dir = mkdtempSync(join(tmpdir(), 'li-'))
  const p = join(dir, 'card.jpg')
  writeFileSync(p, Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
  return p
}

describe('escapeLinkedInLittleText', () => {
  it('escapes reserved characters, but not a # that starts a hashtag', () => {
    expect(escapeLinkedInLittleText('a (b) #c @d [e] {f} *g* _h_ ~i~ <j> |k| \\l')).toBe(
      'a \\(b\\) #c \\@d \\[e\\] \\{f\\} \\*g\\* \\_h\\_ \\~i\\~ \\<j\\> \\|k\\| \\\\l',
    )
  })
  it('leaves a URL untouched even though it contains reserved characters', () => {
    const text = 'veja https://x.com/path_with(parens)?q=1 aqui'
    expect(escapeLinkedInLittleText(text)).toBe(text)
  })
  it('keeps #IA as a linkifiable hashtag', () => {
    expect(escapeLinkedInLittleText('#IA')).toBe('#IA')
  })
  it('escapes a standalone # that is not a hashtag', () => {
    expect(escapeLinkedInLittleText('a # b')).toBe('a \\# b')
  })
})

describe('authorizeUrl', () => {
  it('defaults to the organization scope', () => {
    const url = new URL(linkedinAdapter.authorizeUrl(creds, redirect, 'st1'))
    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/oauth/v2/authorization')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('CID')
    expect(url.searchParams.get('redirect_uri')).toBe(redirect)
    expect(url.searchParams.get('scope')).toBe('w_organization_social r_organization_admin')
    expect(url.searchParams.get('state')).toBe('st1')
  })
  it('uses the member scope when extra.as is "member"', () => {
    const url = new URL(linkedinAdapter.authorizeUrl(creds, redirect, 'st1', { as: 'member' }))
    expect(url.searchParams.get('scope')).toBe('openid profile w_member_social')
  })
})

describe('exchangeCode', () => {
  it('organization (default): exchanges the code and picks the sole administered page', async () => {
    const { fetch, calls } = sequenceFetch([
      jsonResponse({ access_token: 'AT', expires_in: 5184000, refresh_token: 'RT' }),
      jsonResponse({
        elements: [
          { organization: 'urn:li:organization:143109039', 'organization~': { localizedName: 'Agêntico', vanityName: 'o-agentico' } },
        ],
      }),
    ])
    const acc = await linkedinAdapter.exchangeCode(creds, 'CODE', redirect, fetch)
    expect(calls[0].url).toBe('https://www.linkedin.com/oauth/v2/accessToken')
    const form = new URLSearchParams(String(calls[0].init?.body))
    expect(form.get('grant_type')).toBe('authorization_code')
    expect(form.get('code')).toBe('CODE')
    expect(form.get('redirect_uri')).toBe(redirect)
    expect(form.get('client_secret')).toBe('CSEC')
    expect(calls[1].url).toBe(
      'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&projection=(elements*(organization~(localizedName,vanityName)))',
    )
    const headers = calls[1].init?.headers as Record<string, string>
    expect(headers['LinkedIn-Version']).toBe('202601')
    expect(headers['X-Restli-Protocol-Version']).toBe('2.0.0')
    expect(acc).toMatchObject({ platform: 'linkedin', kind: 'organization', id: '143109039', username: 'Agêntico', accessToken: 'AT', refreshToken: 'RT' })
    expect(new Date(acc.expiresAt!).getTime()).toBeGreaterThan(Date.now())
  })
  function twoAclsFetch() {
    return sequenceFetch([
      jsonResponse({ access_token: 'AT', expires_in: 5184000, refresh_token: 'RT' }),
      jsonResponse({
        elements: [
          { organization: 'urn:li:organization:143109039', 'organization~': { localizedName: 'Agêntico' } },
          { organization: 'urn:li:organization:999', 'organization~': { localizedName: 'Other Page' } },
        ],
      }),
    ])
  }
  it('organization: rejects with both ids and --org when the member administers more than one page', async () => {
    const { fetch } = twoAclsFetch()
    const err = await linkedinAdapter.exchangeCode(creds, 'CODE', redirect, fetch).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConfigError)
    expect((err as Error).message).toMatch(/143109039/)
    expect((err as Error).message).toMatch(/999/)
    expect((err as Error).message).toMatch(/--org/)
  })
  it('organization: picks the chosen one when --org matches one of several ACLs', async () => {
    const { fetch } = twoAclsFetch()
    const acc = await linkedinAdapter.exchangeCode(creds, 'CODE', redirect, fetch, { org: '143109039' })
    expect(acc).toMatchObject({ kind: 'organization', id: '143109039', username: 'Agêntico' })
  })
  it('organization: rejects when --org does not match any administered page', async () => {
    const { fetch } = twoAclsFetch()
    await expect(linkedinAdapter.exchangeCode(creds, 'CODE', redirect, fetch, { org: '000' })).rejects.toMatchObject({
      message: expect.stringMatching(/not an administrator of organization 000/),
    })
  })
  it('organization: rejects with --as member guidance when the member administers no pages', async () => {
    const { fetch } = sequenceFetch([
      jsonResponse({ access_token: 'AT', expires_in: 5184000, refresh_token: 'RT' }),
      jsonResponse({ elements: [] }),
    ])
    await expect(linkedinAdapter.exchangeCode(creds, 'CODE', redirect, fetch)).rejects.toMatchObject({
      message: expect.stringMatching(/--as member/),
    })
  })
  it('member ({as: "member"}): exchanges the code and reads userinfo', async () => {
    const { fetch, calls } = sequenceFetch([
      jsonResponse({ access_token: 'AT', expires_in: 5184000, refresh_token: 'RT' }),
      jsonResponse({ sub: 'SUB123', name: 'Lucian Fialho' }),
    ])
    const acc = await linkedinAdapter.exchangeCode(creds, 'CODE', redirect, fetch, { as: 'member' })
    expect(calls[0].url).toBe('https://www.linkedin.com/oauth/v2/accessToken')
    const form = new URLSearchParams(String(calls[0].init?.body))
    expect(form.get('grant_type')).toBe('authorization_code')
    expect(form.get('code')).toBe('CODE')
    expect(form.get('redirect_uri')).toBe(redirect)
    expect(form.get('client_secret')).toBe('CSEC')
    expect(calls[1].url).toBe('https://api.linkedin.com/v2/userinfo')
    expect(acc).toMatchObject({ platform: 'linkedin', kind: 'member', id: 'SUB123', username: 'Lucian Fialho', accessToken: 'AT', refreshToken: 'RT' })
    expect(new Date(acc.expiresAt!).getTime()).toBeGreaterThan(Date.now())
  })
})

describe('refreshToken', () => {
  it('refreshes with the stored refresh token', async () => {
    const { fetch, calls } = sequenceFetch([jsonResponse({ access_token: 'AT2', expires_in: 100, refresh_token: 'RT2' })])
    const acc = await linkedinAdapter.refreshToken(creds, account, fetch)
    const form = new URLSearchParams(String(calls[0].init?.body))
    expect(form.get('grant_type')).toBe('refresh_token')
    expect(form.get('refresh_token')).toBe('REF')
    expect(acc.accessToken).toBe('AT2')
    expect(acc.refreshToken).toBe('RT2')
  })
  it('throws AuthExpiredError without a refresh token', async () => {
    const { fetch } = sequenceFetch([])
    await expect(linkedinAdapter.refreshToken(creds, { ...account, refreshToken: undefined }, fetch)).rejects.toBeInstanceOf(AuthExpiredError)
  })
})

describe('validate', () => {
  it('rejects empty post, long text, two images and video', () => {
    expect(linkedinAdapter.validate({ text: '', media: [] })[0].message).toMatch(/text or one image/i)
    expect(linkedinAdapter.validate({ text: 'x'.repeat(3001), media: [] })[0].message).toMatch(/3,?000/)
    expect(linkedinAdapter.validate({ text: 'ok', media: [{ source: 'a.jpg' }, { source: 'b.jpg' }] })[0].message).toMatch(/at most 1 image/i)
    expect(linkedinAdapter.validate({ text: 'ok', media: [{ source: 'a.mp4' }] })[0].message).toMatch(/vídeo não suportado nesta versão/)
  })
  it('accepts text only and text + one image', () => {
    expect(linkedinAdapter.validate({ text: 'ok', media: [] })).toEqual([])
    expect(linkedinAdapter.validate({ text: 'ok', media: [{ source: 'a.jpg' }] })).toEqual([])
  })
  it('measures the 3000-char limit on the escaped text, not the raw text', () => {
    // "(x)" repeated raw chars escape to "\(x\)" (5 chars per 3 raw chars), so a raw
    // length of 2900 built from this pattern crosses 3000 once escaped.
    const text = '(x)'.repeat(967).slice(0, 2900)
    expect(text.length).toBe(2900)
    expect(linkedinAdapter.validate({ text, media: [] })[0].message).toMatch(/3,?000/)
  })
  it('accepts 2900 plain chars (no reserved chars, so escaping does not change the length)', () => {
    const text = 'x'.repeat(2900)
    expect(linkedinAdapter.validate({ text, media: [] })).toEqual([])
  })
  it('rejects a URL-sourced image (public URLs are not supported for direct upload)', () => {
    expect(linkedinAdapter.validate({ text: 'ok', media: [{ source: 'https://x/y.jpg' }] })[0].message).toMatch(
      /image must be a local file path/,
    )
  })
})

describe('publish', () => {
  it('posts text with escaped commentary and returns the urn from x-restli-id', async () => {
    const { fetch, calls } = sequenceFetch([rawResponse(null, 201, { 'x-restli-id': 'urn:li:share:999' })])
    const out = await linkedinAdapter.publish(account, { text: 'Olá (mundo) #tag', media: [] }, {}, fetch)
    expect(calls[0].url).toBe('https://api.linkedin.com/rest/posts')
    const headers = calls[0].init?.headers as Record<string, string>
    expect(headers['LinkedIn-Version']).toBe('202601')
    expect(headers['X-Restli-Protocol-Version']).toBe('2.0.0')
    expect(headers['Authorization']).toBe('Bearer TOK')
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.author).toBe('urn:li:person:SUB123')
    expect(body.commentary).toBe('Olá \\(mundo\\) #tag')
    expect(body.lifecycleState).toBe('PUBLISHED')
    expect(body.content).toBeUndefined()
    expect(out).toEqual({ platform: 'linkedin', id: 'urn:li:share:999', url: 'https://www.linkedin.com/feed/update/urn:li:share:999' })
  })
  it('posts as the organization when account.kind is "organization"', async () => {
    const orgAccount = { ...account, kind: 'organization' as const, id: '143109039' }
    const { fetch, calls } = sequenceFetch([rawResponse(null, 201, { 'x-restli-id': 'urn:li:share:1000' })])
    await linkedinAdapter.publish(orgAccount, { text: 'ok', media: [] }, {}, fetch)
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.author).toBe('urn:li:organization:143109039')
  })
  it('uploads the image as the organization owner when account.kind is "organization"', async () => {
    const orgAccount = { ...account, kind: 'organization' as const, id: '143109039' }
    const { fetch, calls } = sequenceFetch([
      jsonResponse({ value: { uploadUrl: 'https://www.linkedin.com/dms-uploads/abc', image: 'urn:li:image:IMG1' } }),
      rawResponse(null, 201),
      rawResponse(null, 201, { 'x-restli-id': 'urn:li:ugcPost:6' }),
    ])
    await linkedinAdapter.publish(orgAccount, { text: 'legenda', media: [{ kind: 'image', filePath: tmpJpg(), alt: 'card' }] }, {}, fetch)
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ initializeUploadRequest: { owner: 'urn:li:organization:143109039' } })
  })
  it('uploads the image then posts with content.media.id', async () => {
    const { fetch, calls } = sequenceFetch([
      jsonResponse({ value: { uploadUrl: 'https://www.linkedin.com/dms-uploads/abc', image: 'urn:li:image:IMG1' } }),
      rawResponse(null, 201),
      rawResponse(null, 201, { 'x-restli-id': 'urn:li:ugcPost:5' }),
    ])
    const out = await linkedinAdapter.publish(account, { text: 'legenda', media: [{ kind: 'image', filePath: tmpJpg(), alt: 'card' }] }, {}, fetch)
    expect(calls[0].url).toBe('https://api.linkedin.com/rest/images?action=initializeUpload')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ initializeUploadRequest: { owner: 'urn:li:person:SUB123' } })
    expect(calls[1].url).toBe('https://www.linkedin.com/dms-uploads/abc')
    expect(calls[1].init?.method).toBe('PUT')
    expect((calls[1].init?.headers as Record<string, string>)['Content-Type']).toBe('application/octet-stream')
    const body = JSON.parse(String(calls[2].init?.body))
    expect(body.content).toEqual({ media: { id: 'urn:li:image:IMG1', altText: 'card' } })
    expect(out.id).toBe('urn:li:ugcPost:5')
  })
  it('wraps non-2xx into ApiError with status', async () => {
    const { fetch } = sequenceFetch([rawResponse('{"message":"nope"}', 403)])
    await expect(linkedinAdapter.publish(account, { text: 'x', media: [] }, {}, fetch)).rejects.toMatchObject({ status: 403 })
    const { fetch: f2 } = sequenceFetch([rawResponse('{"message":"nope"}', 403)])
    await expect(linkedinAdapter.publish(account, { text: 'x', media: [] }, {}, f2)).rejects.toBeInstanceOf(ApiError)
  })
  it('fails when x-restli-id is missing', async () => {
    const { fetch } = sequenceFetch([rawResponse(null, 201)])
    await expect(linkedinAdapter.publish(account, { text: 'x', media: [] }, {}, fetch)).rejects.toThrow(/did not return the post URN/)
  })
  it('rejects a URL-sourced image at publish time with MediaRejectedError', async () => {
    const { fetch } = sequenceFetch([])
    await expect(
      linkedinAdapter.publish(account, { text: 'x', media: [{ kind: 'image', url: 'https://x/y.jpg' }] }, {}, fetch),
    ).rejects.toBeInstanceOf(MediaRejectedError)
  })
})
