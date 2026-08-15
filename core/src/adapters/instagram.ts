import type { PlatformAdapter, AdapterPublishOptions } from '../adapter.js'
import type { Account, AppCredentials, Fetch, PreparedPost, PublishResult, ValidationIssue } from '../types.js'
import { ApiError, MediaRejectedError } from '../errors.js'
import { mediaKind } from '../post.js'
import { pollUntil } from '../poll.js'

const GRAPH = 'https://graph.instagram.com'
const API_VERSION = 'v23.0'

async function json<T>(res: Response, context: string): Promise<T> {
  if (!res.ok) {
    const body = await res.text()
    throw new ApiError(`Instagram ${context} failed (${res.status}): ${body}`, res.status)
  }
  return res.json() as Promise<T>
}

function pollInterval(): number {
  return Number(process.env.OPENSOCIAL_POLL_INTERVAL_MS ?? 2000)
}

async function createContainer(
  accountId: string,
  token: string,
  params: Record<string, string | string[]>,
  fetchImpl: Fetch,
): Promise<string> {
  const body = new URLSearchParams({ access_token: token })
  for (const [key, value] of Object.entries(params)) {
    // array params (carousel children) must be sent as children[0], children[1]…
    // — a comma-joined value in the form body silently yields container id "0"
    if (Array.isArray(value)) value.forEach((item, i) => body.append(`${key}[${i}]`, item))
    else body.set(key, value)
  }
  const out = await json<{ id: string }>(
    await fetchImpl(`${GRAPH}/${API_VERSION}/${accountId}/media`, { method: 'POST', body }),
    'container creation',
  )
  if (!out.id || out.id === '0') {
    throw new ApiError('Instagram returned an invalid container id — check container params', 500)
  }
  return out.id
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

  async publish(account, post, _options, fetchImpl = globalThis.fetch): Promise<PublishResult> {
    const token = account.accessToken
    let creationId: string

    // Every container type (REELS, IMAGE, CAROUSEL) must reach FINISHED
    // before media_publish — images included: publishing an image container
    // too early fails with code 9007 / subcode 2207027 ("media not ready").
    const awaitFinished = async (id: string, label: string) => {
      const status = await pollUntil(
        async () => {
          const res = await fetchImpl(`${GRAPH}/${API_VERSION}/${id}?fields=status_code&access_token=${token}`)
          return json<{ status_code: string }>(res, 'container status')
        },
        (s) => s.status_code !== 'IN_PROGRESS',
        { intervalMs: pollInterval(), label },
      )
      if (status.status_code !== 'FINISHED') {
        throw new MediaRejectedError(`Instagram rejected the media (status ${status.status_code}). Check format/size/aspect-ratio limits.`)
      }
    }

    if (post.media.length === 1 && post.media[0].kind === 'video') {
      creationId = await createContainer(account.id, token, {
        media_type: 'REELS', video_url: post.media[0].url!, caption: post.text,
      }, fetchImpl)
      await awaitFinished(creationId, 'instagram video processing')
    } else if (post.media.length === 1) {
      creationId = await createContainer(account.id, token, { image_url: post.media[0].url!, caption: post.text }, fetchImpl)
      await awaitFinished(creationId, 'instagram image processing')
    } else {
      const children: string[] = []
      for (const m of post.media) {
        children.push(await createContainer(account.id, token, { image_url: m.url!, is_carousel_item: 'true' }, fetchImpl))
      }
      // Fresh child containers make the CAROUSEL container silently return
      // id "0" (their status reads FINISHED but they haven't settled — takes
      // anywhere from seconds to ~3 minutes for 4-5 children). Retry patiently.
      for (let attempt = 0; ; attempt++) {
        try {
          creationId = await createContainer(account.id, token, {
            media_type: 'CAROUSEL', children, caption: post.text,
          }, fetchImpl)
          break
        } catch (err) {
          const retryable =
            err instanceof ApiError && /invalid container id/.test(err.message) && attempt < 4
          if (!retryable) throw err
          await new Promise((r) => setTimeout(r, pollInterval() * 8))
        }
      }
      await awaitFinished(creationId, 'instagram carousel processing')
    }

    // Belt and suspenders: even a FINISHED container can briefly report
    // "media not ready" (9007/2207027) — retry that and transient 500s.
    let published: { id: string } | null = null
    for (let attempt = 0; ; attempt++) {
      try {
        published = await json<{ id: string }>(
          await fetchImpl(`${GRAPH}/${API_VERSION}/${account.id}/media_publish`, {
            method: 'POST', body: new URLSearchParams({ creation_id: creationId, access_token: token }),
          }),
          'media publish',
        )
        break
      } catch (err) {
        const retryable =
          err instanceof ApiError &&
          (err.status >= 500 || /2207027|not available/i.test(err.message)) &&
          attempt < 3
        if (!retryable) throw err
        await new Promise((r) => setTimeout(r, pollInterval() * 3))
      }
    }
    const perma = await json<{ permalink?: string }>(
      await fetchImpl(`${GRAPH}/${API_VERSION}/${published!.id}?fields=permalink&access_token=${token}`),
      'permalink fetch',
    )
    return { platform: 'instagram', id: published!.id, url: perma.permalink }
  },
}
