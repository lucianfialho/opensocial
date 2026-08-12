import type { PlatformAdapter, AdapterPublishOptions } from '../adapter.js'
import type { Account, AppCredentials, Fetch, PreparedPost, PublishResult, ValidationIssue } from '../types.js'
import { ApiError } from '../errors.js'
import { mediaKind } from '../post.js'

const GRAPH = 'https://graph.instagram.com'
const API_VERSION = 'v21.0'

async function json<T>(res: Response, context: string): Promise<T> {
  if (!res.ok) {
    const body = await res.text()
    throw new ApiError(`Instagram ${context} failed (${res.status}): ${body}`, res.status)
  }
  return res.json() as Promise<T>
}

export const instagramAdapter: PlatformAdapter = {
  platform: 'instagram',
  mediaIngestion: { image: 'public-url', video: 'public-url' },

  authorizeUrl(creds, redirectUri, state) {
    const u = new URL('https://www.instagram.com/oauth/authorize')
    u.searchParams.set('client_id', creds.clientId)
    u.searchParams.set('redirect_uri', redirectUri)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('scope', 'instagram_business_basic,instagram_business_content_publish')
    u.searchParams.set('state', state)
    return u.toString()
  },

  async exchangeCode(creds, code, redirectUri, fetchImpl = globalThis.fetch) {
    const form = new URLSearchParams({
      client_id: creds.clientId, client_secret: creds.clientSecret,
      grant_type: 'authorization_code', redirect_uri: redirectUri, code,
    })
    const short = await json<{ access_token: string; user_id: number }>(
      await fetchImpl('https://api.instagram.com/oauth/access_token', { method: 'POST', body: form }),
      'code exchange',
    )
    const long = await json<{ access_token: string; expires_in: number }>(
      await fetchImpl(`${GRAPH}/access_token?grant_type=ig_exchange_token&client_secret=${creds.clientSecret}&access_token=${short.access_token}`),
      'long-lived token exchange',
    )
    const me = await json<{ user_id: string; username: string }>(
      await fetchImpl(`${GRAPH}/${API_VERSION}/me?fields=user_id,username&access_token=${long.access_token}`),
      'profile fetch',
    )
    return {
      platform: 'instagram', id: String(me.user_id), username: me.username,
      accessToken: long.access_token,
      expiresAt: new Date(Date.now() + long.expires_in * 1000).toISOString(),
    }
  },

  async refreshToken(_creds, account, fetchImpl = globalThis.fetch) {
    const out = await json<{ access_token: string; expires_in: number }>(
      await fetchImpl(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${account.accessToken}`),
      'token refresh',
    )
    return { ...account, accessToken: out.access_token, expiresAt: new Date(Date.now() + out.expires_in * 1000).toISOString() }
  },

  validate(post): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const kinds = post.media.map((m) => mediaKind(m.source))
    if (post.media.length === 0) issues.push({ platform: 'instagram', message: 'Instagram requires at least one media item (text-only posts are not supported).' })
    if (post.text.length > 2200) issues.push({ platform: 'instagram', message: `Caption is ${post.text.length} chars; Instagram allows at most 2200.` })
    if (post.media.length > 10) issues.push({ platform: 'instagram', message: `Carousel has ${post.media.length} items; Instagram allows at most 10.` })
    if (kinds.includes('video') && post.media.length > 1) issues.push({ platform: 'instagram', message: 'Video must be a single video (Reel); it cannot be mixed with other media.' })
    return issues
  },

  async publish(account, post, options, fetchImpl = globalThis.fetch): Promise<PublishResult> {
    throw new ApiError('not implemented yet', 501) // Task 10
  },
}
