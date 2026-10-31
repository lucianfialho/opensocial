import { readFileSync } from 'node:fs'
import type { PlatformAdapter } from '../adapter.js'
import type { Account, Fetch, PublishResult, ValidationIssue } from '../types.js'
import { ApiError, AuthExpiredError, MediaRejectedError } from '../errors.js'
import { mediaKind } from '../post.js'
import { isUrl } from '../media.js'

const AUTH = 'https://www.linkedin.com/oauth/v2'
const API = 'https://api.linkedin.com'
const VERSION = '202601'
const MAX_TEXT = 3000

/** LinkedIn's "little text format" reserves these characters for mentions,
 *  hashtags and templates; unescaped they silently mangle the post. URLs are
 *  passed through untouched (escaping inside a URL breaks it), and `#` is left
 *  alone when it starts a hashtag (followed by a letter/digit) so hashtags
 *  still linkify — it is escaped in every other position. */
export function escapeLinkedInLittleText(text: string): string {
  const urlPattern = /https?:\/\/\S+/g
  let result = ''
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = urlPattern.exec(text))) {
    result += escapeSegment(text.slice(lastIndex, match.index))
    result += match[0]
    lastIndex = match.index + match[0].length
  }
  result += escapeSegment(text.slice(lastIndex))
  return result
}

function escapeSegment(segment: string): string {
  return segment.replace(/[\\|{}@\[\]()<>*_~]|#(?![\p{L}\p{N}])/gu, '\\$&')
}

function restHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'LinkedIn-Version': VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
  }
}

async function ensureOk(res: Response, context: string): Promise<Response> {
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300)
    throw new ApiError(`LinkedIn ${context} failed (${res.status}): ${body}`, res.status)
  }
  return res
}

async function tokenRequest(form: URLSearchParams, fetchImpl: Fetch, context: string) {
  const res = await ensureOk(
    await fetchImpl(`${AUTH}/accessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    }),
    context,
  )
  return res.json() as Promise<{ access_token: string; expires_in: number; refresh_token?: string }>
}

export const linkedinAdapter: PlatformAdapter = {
  platform: 'linkedin',
  pkce: false,
  mediaIngestion: { image: 'direct-upload', video: 'direct-upload' },

  authorizeUrl(creds, redirectUri, state) {
    const u = new URL(`${AUTH}/authorization`)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('client_id', creds.clientId)
    u.searchParams.set('redirect_uri', redirectUri)
    u.searchParams.set('scope', 'openid profile w_member_social')
    u.searchParams.set('state', state)
    return u.toString()
  },

  async exchangeCode(creds, code, redirectUri, fetchImpl = globalThis.fetch) {
    const tok = await tokenRequest(
      new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: redirectUri,
        client_id: creds.clientId, client_secret: creds.clientSecret,
      }),
      fetchImpl,
      'code exchange',
    )
    const me = await (await ensureOk(
      await fetchImpl(`${API}/v2/userinfo`, { headers: { Authorization: `Bearer ${tok.access_token}` } }),
      'userinfo fetch',
    )).json() as { sub: string; name?: string; given_name?: string; family_name?: string }
    const username = me.name ?? (`${me.given_name ?? ''} ${me.family_name ?? ''}`.trim() || me.sub)
    return {
      platform: 'linkedin', id: me.sub, username,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAt: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    }
  },

  async refreshToken(creds, account, fetchImpl = globalThis.fetch) {
    if (!account.refreshToken) {
      throw new AuthExpiredError('LinkedIn token expired and no refresh token is stored; run `opensocial connect linkedin`')
    }
    const tok = await tokenRequest(
      new URLSearchParams({
        grant_type: 'refresh_token', refresh_token: account.refreshToken,
        client_id: creds.clientId, client_secret: creds.clientSecret,
      }),
      fetchImpl,
      'token refresh',
    )
    return {
      ...account,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token ?? account.refreshToken,
      expiresAt: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    }
  },

  validate(post): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    if (!post.text.trim() && post.media.length === 0) issues.push({ platform: 'linkedin', message: 'LinkedIn post needs text or one image.' })
    const escapedLength = escapeLinkedInLittleText(post.text).length
    if (escapedLength > MAX_TEXT) issues.push({ platform: 'linkedin', message: `Text is ${escapedLength} chars after escaping; LinkedIn allows at most 3000.` })
    const images = post.media.filter((m) => mediaKind(m.source) === 'image')
    if (images.length > 1) issues.push({ platform: 'linkedin', message: `Post has ${images.length} images; this version supports at most 1 image.` })
    if (post.media.some((m) => mediaKind(m.source) === 'video')) issues.push({ platform: 'linkedin', message: 'LinkedIn: vídeo não suportado nesta versão.' })
    if (post.media.some((m) => isUrl(m.source))) issues.push({ platform: 'linkedin', message: 'LinkedIn: image must be a local file path (public URLs are not supported for direct upload)' })
    return issues
  },

  async publish(account, post, _options, fetchImpl = globalThis.fetch): Promise<PublishResult> {
    const token = account.accessToken
    const author = `urn:li:person:${account.id}`
    const image = post.media.find((m) => m.kind === 'image')
    let content: { media: { id: string; altText?: string } } | undefined

    if (image) {
      if (!image.filePath) throw new MediaRejectedError('LinkedIn image must be a local file (direct upload)')
      const init = await (await ensureOk(
        await fetchImpl(`${API}/rest/images?action=initializeUpload`, {
          method: 'POST', headers: restHeaders(token),
          body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
        }),
        'image initializeUpload',
      )).json() as { value: { uploadUrl: string; image: string } }
      await ensureOk(
        await fetchImpl(init.value.uploadUrl, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
          body: readFileSync(image.filePath),
        }),
        'image upload',
      )
      content = { media: { id: init.value.image, ...(image.alt ? { altText: image.alt } : {}) } }
    }

    const res = await ensureOk(
      await fetchImpl(`${API}/rest/posts`, {
        method: 'POST', headers: restHeaders(token),
        body: JSON.stringify({
          author,
          commentary: escapeLinkedInLittleText(post.text),
          visibility: 'PUBLIC',
          distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
          lifecycleState: 'PUBLISHED',
          isReshareDisabledByAuthor: false,
          ...(content ? { content } : {}),
        }),
      }),
      'post creation',
    )
    const urn = res.headers.get('x-restli-id')
    if (!urn) throw new ApiError('LinkedIn did not return the post URN (x-restli-id header missing)', 500)
    return { platform: 'linkedin', id: urn, url: `https://www.linkedin.com/feed/update/${urn}` }
  },
}
