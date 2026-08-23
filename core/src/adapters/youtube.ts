import { readFileSync, statSync } from 'node:fs'
import type { PlatformAdapter } from '../adapter.js'
import { ApiError, MediaRejectedError } from '../errors.js'
import type { Account, Fetch, PublishResult } from '../types.js'

const OAUTH = 'https://oauth2.googleapis.com/token'
const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos'
const MAX_BYTES = 256 * 1024 * 1024 // generous cap for Shorts-length files

async function json<T>(res: Response, context: string): Promise<T> {
  if (!res.ok) throw new ApiError(`YouTube ${context} failed (${res.status}): ${await res.text()}`, res.status)
  return res.json() as Promise<T>
}

/** YouTube Data API v3. A vertical video under 3 minutes becomes a Short
 *  automatically — no special flag exists or is needed. */
export const youtubeAdapter: PlatformAdapter = {
  platform: 'youtube',
  mediaIngestion: { image: 'direct-upload', video: 'direct-upload' },

  authorizeUrl(creds, redirectUri, state) {
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    u.searchParams.set('client_id', creds.clientId)
    u.searchParams.set('redirect_uri', redirectUri)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('scope', 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly')
    u.searchParams.set('access_type', 'offline')
    u.searchParams.set('prompt', 'consent') // force refresh_token issuance
    u.searchParams.set('state', state)
    return u.toString()
  },

  async exchangeCode(creds, code, redirectUri, fetchImpl = globalThis.fetch) {
    const tok = await json<{ access_token: string; refresh_token: string; expires_in: number }>(
      await fetchImpl(OAUTH, {
        method: 'POST',
        body: new URLSearchParams({
          code, client_id: creds.clientId, client_secret: creds.clientSecret,
          redirect_uri: redirectUri, grant_type: 'authorization_code',
        }),
      }),
      'token exchange',
    )
    const ch = await json<{ items: Array<{ id: string; snippet: { title: string } }> }>(
      await fetchImpl('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
        headers: { authorization: `Bearer ${tok.access_token}` },
      }),
      'channel lookup',
    )
    const channel = ch.items?.[0]
    if (!channel) throw new ApiError('No YouTube channel on this Google account', 404)
    return {
      platform: 'youtube' as const,
      id: channel.id,
      username: channel.snippet.title,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAt: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    }
  },

  async refreshToken(creds, account, fetchImpl = globalThis.fetch) {
    const tok = await json<{ access_token: string; expires_in: number }>(
      await fetchImpl(OAUTH, {
        method: 'POST',
        body: new URLSearchParams({
          refresh_token: account.refreshToken ?? '',
          client_id: creds.clientId, client_secret: creds.clientSecret,
          grant_type: 'refresh_token',
        }),
      }),
      'token refresh',
    )
    return { ...account, accessToken: tok.access_token, expiresAt: new Date(Date.now() + tok.expires_in * 1000).toISOString() }
  },

  validate(post) {
    const issues = []
    const videos = post.media.filter((m) => /\.(mp4|mov|webm)$/i.test(m.source)).length
    if (videos !== 1 || post.media.length !== 1) {
      issues.push({ platform: 'youtube' as const, message: 'YouTube requires exactly one video per post.' })
    }
    if (post.text.length > 5000) issues.push({ platform: 'youtube' as const, message: 'Description over 5000 chars.' })
    return issues
  },

  async publish(account, post, _options, fetchImpl = globalThis.fetch): Promise<PublishResult> {
    const video = post.media.find((m) => m.kind === 'video')
    if (!video?.filePath) throw new MediaRejectedError('YouTube upload needs a local video file path')
    const size = statSync(video.filePath).size
    if (size > MAX_BYTES) throw new MediaRejectedError(`Video is ${(size / 1e6).toFixed(0)}MB; cap is 256MB`)

    const [titleLine, ...rest] = post.text.split('\n')
    const meta = {
      snippet: {
        title: titleLine.slice(0, 95) || 'o agêntico',
        description: post.text.slice(0, 4900),
        categoryId: '28', // Science & Technology
      },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    }
    const init = await fetchImpl(`${UPLOAD}?uploadType=resumable&part=snippet,status`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${account.accessToken}`,
        'content-type': 'application/json',
        'x-upload-content-type': 'video/mp4',
        'x-upload-content-length': String(size),
      },
      body: JSON.stringify(meta),
    })
    if (!init.ok) throw new ApiError(`YouTube upload init failed (${init.status}): ${await init.text()}`, init.status)
    const session = init.headers.get('location')
    if (!session) throw new ApiError('YouTube did not return an upload session', 500)

    const up = await fetchImpl(session, {
      method: 'PUT',
      headers: { 'content-type': 'video/mp4', 'content-length': String(size) },
      body: readFileSync(video.filePath),
    })
    const out = await json<{ id: string; status: { privacyStatus: string; uploadStatus: string } }>(up, 'upload')
    return { platform: 'youtube', id: out.id, url: `https://www.youtube.com/shorts/${out.id}` }
  },
}
