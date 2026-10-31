import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import type { PlatformAdapter } from '../adapter.js'
import type { Fetch, PublishResult, ValidationIssue } from '../types.js'
import { ApiError, AuthExpiredError, RateLimitError } from '../errors.js'
import { mediaKind } from '../post.js'

const API = 'https://api.x.com/2'
const AUTHORIZE = 'https://x.com/i/oauth2/authorize'
const SCOPES = 'tweet.read tweet.write users.read offline.access'
const MAX_WEIGHTED = 280
const URL_WEIGHT = 23

/** X counts every URL as 23 chars and everything else by code point. */
export function weightedLength(text: string): number {
  let total = 0
  const rest = text.replace(/https?:\/\/\S+/g, () => { total += URL_WEIGHT; return '' })
  return total + [...rest].length
}

function basicAuth(creds: { clientId: string; clientSecret: string }): string {
  return 'Basic ' + Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')
}

function imageMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'application/octet-stream'
}

async function ensureOk(res: Response, context: string): Promise<Response> {
  if (res.ok) return res
  const body = (await res.text()).slice(0, 300)
  if (res.status === 429) {
    const reset = Number(res.headers.get('x-rate-limit-reset'))
    const retryAfter = reset ? Math.max(1, reset - Math.floor(Date.now() / 1000)) : undefined
    throw new RateLimitError(`X ${context} rate limited (429): ${body}`, retryAfter)
  }
  throw new ApiError(`X ${context} failed (${res.status}): ${body}`, res.status)
}

async function tokenRequest(creds: { clientId: string; clientSecret: string }, form: URLSearchParams, fetchImpl: Fetch, context: string) {
  const res = await ensureOk(
    await fetchImpl(`${API}/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: basicAuth(creds), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    }),
    context,
  )
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>
}

export const xAdapter: PlatformAdapter = {
  platform: 'x',
  pkce: true,
  mediaIngestion: { image: 'direct-upload', video: 'direct-upload' },

  authorizeUrl(creds, redirectUri, state, extra) {
    if (!extra?.codeChallenge) throw new Error('X requires PKCE: authorizeUrl needs extra.codeChallenge')
    const u = new URL(AUTHORIZE)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('client_id', creds.clientId)
    u.searchParams.set('redirect_uri', redirectUri)
    u.searchParams.set('scope', SCOPES)
    u.searchParams.set('state', state)
    u.searchParams.set('code_challenge', extra.codeChallenge)
    u.searchParams.set('code_challenge_method', 'S256')
    return u.toString()
  },

  async exchangeCode(creds, code, redirectUri, fetchImpl = globalThis.fetch, extra) {
    if (!extra?.codeVerifier) throw new Error('X requires PKCE: exchangeCode needs extra.codeVerifier')
    const tok = await tokenRequest(
      creds,
      new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: redirectUri,
        code_verifier: extra.codeVerifier, client_id: creds.clientId,
      }),
      fetchImpl,
      'code exchange',
    )
    const me = await (await ensureOk(
      await fetchImpl(`${API}/users/me`, { headers: { Authorization: `Bearer ${tok.access_token}` } }),
      'users/me fetch',
    )).json() as { data: { id: string; username: string } }
    return {
      platform: 'x', id: me.data.id, username: me.data.username,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAt: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    }
  },

  async refreshToken(creds, account, fetchImpl = globalThis.fetch) {
    if (!account.refreshToken) {
      throw new AuthExpiredError('X token expired and no refresh token is stored; run `opensocial connect x`')
    }
    let tok
    try {
      tok = await tokenRequest(
        creds,
        new URLSearchParams({ grant_type: 'refresh_token', refresh_token: account.refreshToken }),
        fetchImpl,
        'token refresh',
      )
    } catch (err) {
      // a refresh token is single-use: a 400 here means it was already spent or revoked
      if (err instanceof ApiError && err.status === 400) {
        throw new AuthExpiredError(`X refresh token rejected (${err.message}); run \`opensocial connect x\``)
      }
      throw err
    }
    return {
      ...account,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token ?? account.refreshToken,
      expiresAt: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    }
  },

  validate(post): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    if (!post.text.trim() && post.media.length === 0) issues.push({ platform: 'x', message: 'X post needs text or one image.' })
    const w = weightedLength(post.text)
    if (w > MAX_WEIGHTED) issues.push({ platform: 'x', message: `Text weighs ${w} chars (URLs count 23); X allows at most 280.` })
    const images = post.media.filter((m) => mediaKind(m.source) === 'image')
    if (images.length > 1) issues.push({ platform: 'x', message: `Post has ${images.length} images; this version supports at most 1 image.` })
    if (post.media.some((m) => mediaKind(m.source) === 'video')) issues.push({ platform: 'x', message: 'X: vídeo não suportado nesta versão.' })
    return issues
  },

  async publish(account, post, _options, fetchImpl = globalThis.fetch): Promise<PublishResult> {
    const token = account.accessToken
    const image = post.media.find((m) => m.kind === 'image')
    let mediaIds: string[] | undefined

    if (image) {
      if (!image.filePath) throw new ApiError('X image must be a local file (direct upload)', 400)
      const form = new FormData()
      form.append('media', new Blob([readFileSync(image.filePath)], { type: imageMime(image.filePath) }), basename(image.filePath))
      form.append('media_category', 'tweet_image')
      const up = await (await ensureOk(
        await fetchImpl(`${API}/media/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }),
        'media upload',
      )).json() as { data?: { id?: string; media_id_string?: string }; media_id_string?: string }
      const id = up.data?.id ?? up.data?.media_id_string ?? up.media_id_string
      if (!id) throw new ApiError('X media upload returned no media id', 500)
      mediaIds = [id]
    }

    const out = await (await ensureOk(
      await fetchImpl(`${API}/tweets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: post.text, ...(mediaIds ? { media: { media_ids: mediaIds } } : {}) }),
      }),
      'tweet creation',
    )).json() as { data: { id: string } }
    return { platform: 'x', id: out.data.id, url: `https://x.com/${account.username}/status/${out.data.id}` }
  },
}
