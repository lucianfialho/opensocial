import { readFileSync, statSync } from 'node:fs'
import type { PlatformAdapter } from '../adapter.js'
import type { Account, Fetch, PublishResult, ValidationIssue } from '../types.js'
import { ApiError, MediaRejectedError } from '../errors.js'
import { mediaKind } from '../post.js'
import { pollUntil } from '../poll.js'

const API = 'https://open.tiktokapis.com/v2'
const MAX_VIDEO_BYTES = 64 * 1024 * 1024

export async function tiktokJson<T>(res: Response, context: string): Promise<T> {
  if (!res.ok) throw new ApiError(`TikTok ${context} failed (${res.status}): ${await res.text()}`, res.status)
  const body = (await res.json()) as { data?: T; error?: { code: string; message: string }; access_token?: string }
  if (body.error && body.error.code !== 'ok') {
    throw new ApiError(`TikTok ${context} failed: ${body.error.code} — ${body.error.message}`, res.status)
  }
  // token endpoint responde flat (sem wrapper data/error)
  return (body.data ?? (body as unknown)) as T
}

async function waitForPublish(publishId: string, token: string, fetchImpl: Fetch): Promise<void> {
  const final = await pollUntil(
    async () => tiktokJson<{ status: string; fail_reason?: string }>(
      await fetchImpl(`${API}/post/publish/status/fetch/`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ publish_id: publishId }),
      }),
      'status fetch',
    ),
    (s) => !['PROCESSING_UPLOAD', 'PROCESSING_DOWNLOAD'].includes(s.status),
    { intervalMs: Number(process.env.OPENSOCIAL_POLL_INTERVAL_MS ?? 2000), label: 'tiktok publish processing' },
  )
  if (final.status === 'FAILED') {
    throw new MediaRejectedError(`TikTok rejected the post: ${final.fail_reason ?? 'unknown reason'}`)
  }
}

export const tiktokAdapter: PlatformAdapter = {
  platform: 'tiktok',
  mediaIngestion: { image: 'public-url', video: 'direct-upload' },

  authorizeUrl(creds, redirectUri, state) {
    const u = new URL('https://www.tiktok.com/v2/auth/authorize/')
    u.searchParams.set('client_key', creds.clientId)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('scope', 'user.info.basic,video.publish')
    u.searchParams.set('redirect_uri', redirectUri)
    u.searchParams.set('state', state)
    return u.toString()
  },

  async exchangeCode(creds, code, redirectUri, fetchImpl = globalThis.fetch) {
    const tok = await tiktokJson<{ access_token: string; refresh_token: string; expires_in: number; open_id: string }>(
      await fetchImpl(`${API}/oauth/token/`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: creds.clientId, client_secret: creds.clientSecret,
          code, grant_type: 'authorization_code', redirect_uri: redirectUri,
        }),
      }),
      'token exchange',
    )
    const info = await tiktokJson<{ user: { open_id: string; display_name: string } }>(
      await fetchImpl(`${API}/user/info/?fields=open_id,display_name`, {
        headers: { authorization: `Bearer ${tok.access_token}` },
      }),
      'user info',
    )
    return {
      platform: 'tiktok', id: tok.open_id, username: info.user.display_name,
      accessToken: tok.access_token, refreshToken: tok.refresh_token,
      expiresAt: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    }
  },

  async refreshToken(creds, account, fetchImpl = globalThis.fetch) {
    const tok = await tiktokJson<{ access_token: string; refresh_token: string; expires_in: number }>(
      await fetchImpl(`${API}/oauth/token/`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: creds.clientId, client_secret: creds.clientSecret,
          grant_type: 'refresh_token', refresh_token: account.refreshToken ?? '',
        }),
      }),
      'token refresh',
    )
    return {
      ...account, accessToken: tok.access_token, refreshToken: tok.refresh_token,
      expiresAt: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    }
  },

  validate(post): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const kinds = post.media.map((m) => mediaKind(m.source))
    const videos = kinds.filter((k) => k === 'video').length
    const images = kinds.filter((k) => k === 'image').length
    if (videos > 0 && images > 0) issues.push({ platform: 'tiktok', message: 'TikTok does not allow mixing video and photos in one post.' })
    else if (videos > 1) issues.push({ platform: 'tiktok', message: 'TikTok accepts a single video per post.' })
    else if (videos === 0 && images === 0) issues.push({ platform: 'tiktok', message: 'TikTok requires one video or 1-35 photos.' })
    else if (images > 35) issues.push({ platform: 'tiktok', message: `Photo post has ${images} images; TikTok allows at most 35.` })
    if (post.text.length > 2200) issues.push({ platform: 'tiktok', message: `Title is ${post.text.length} chars; TikTok allows at most 2200.` })
    return issues
  },

  async publish(account, post, options, fetchImpl = globalThis.fetch): Promise<PublishResult> {
    const token = account.accessToken
    const privacy = options.tiktokPrivacyLevel ?? 'SELF_ONLY'
    const video = post.media.find((m) => m.kind === 'video')

    if (video) {
      const size = statSync(video.filePath!).size
      if (size > MAX_VIDEO_BYTES) {
        throw new MediaRejectedError(`Video is ${(size / 1024 / 1024).toFixed(1)}MB; v1 supports videos up to 64MB (single-chunk upload).`)
      }
      const init = await tiktokJson<{ publish_id: string; upload_url: string }>(
        await fetchImpl(`${API}/post/publish/video/init/`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            post_info: { title: post.text, privacy_level: privacy },
            source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 },
          }),
        }),
        'video init',
      )
      const bytes = readFileSync(video.filePath!)
      const up = await fetchImpl(init.upload_url, {
        method: 'PUT',
        headers: { 'content-range': `bytes 0-${size - 1}/${size}`, 'content-type': 'video/mp4' },
        body: bytes,
      })
      if (!up.ok) throw new ApiError(`TikTok video upload failed (${up.status})`, up.status)
      await waitForPublish(init.publish_id, token, fetchImpl)
      return { platform: 'tiktok', id: init.publish_id, url: undefined }
    }

    const init = await tiktokJson<{ publish_id: string }>(
      await fetchImpl(`${API}/post/publish/content/init/`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          post_info: { title: post.text, privacy_level: privacy },
          source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: post.media.map((m) => m.url) },
          post_mode: 'DIRECT_POST',
          media_type: 'PHOTO',
        }),
      }),
      'photo init',
    )
    await waitForPublish(init.publish_id, token, fetchImpl)
    return { platform: 'tiktok', id: init.publish_id, url: undefined }
  },
}
