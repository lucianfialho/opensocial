import { readFileSync, existsSync } from 'node:fs'
import { basename } from 'node:path'
import { AwsClient } from 'aws4fetch'
import { put as blobPut, del as blobDel } from '@vercel/blob'
import type { Fetch, IngestionMode, MediaItem, MediaKind, ResolvedMediaItem } from './types.js'
import type { MediaHostConfig, S3MediaHostConfig } from './config.js'
import { ApiError, ConfigError } from './errors.js'
import { mediaKind } from './post.js'

export function isUrl(source: string): boolean {
  return /^https?:\/\//.test(source)
}

/** Anything that can host a local file at a public URL for platform ingestion. */
export interface MediaHost {
  upload(filePath: string): Promise<{ url: string; key: string }>
  remove(key: string): Promise<void>
}

/** Vercel Blob host — `key` is the blob URL itself. */
export class VercelBlobMediaHost implements MediaHost {
  constructor(private token: string) {}

  async upload(filePath: string): Promise<{ url: string; key: string }> {
    const blob = await blobPut(
      `opensocial/${Date.now()}-${basename(filePath)}`,
      readFileSync(filePath),
      { access: 'public', token: this.token },
    )
    return { url: blob.url, key: blob.url }
  }

  async remove(key: string): Promise<void> {
    await blobDel(key, { token: this.token })
  }
}

export function createMediaHost(cfg: MediaHostConfig, fetchImpl?: Fetch): MediaHost {
  if (cfg.provider === 'vercel-blob') return new VercelBlobMediaHost(cfg.token)
  return new S3MediaHost(cfg, fetchImpl)
}

export class S3MediaHost implements MediaHost {
  private aws: AwsClient
  constructor(private cfg: S3MediaHostConfig, private fetchImpl: Fetch = globalThis.fetch) {
    this.aws = new AwsClient({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      region: cfg.region,
      service: 's3',
    })
  }

  private objectUrl(key: string): string {
    return `${this.cfg.endpoint}/${this.cfg.bucket}/${key}`
  }

  private async send(method: 'PUT' | 'DELETE', key: string, body?: Buffer): Promise<void> {
    const bodyUint8Array = body ? new Uint8Array(body) : undefined
    const signed = await this.aws.sign(this.objectUrl(key), { method, body: bodyUint8Array })
    const res = await this.fetchImpl(signed.url, {
      method,
      headers: Object.fromEntries(signed.headers.entries()),
      body: bodyUint8Array,
    })
    if (!res.ok) throw new ApiError(`Media host ${method} failed (${res.status}) for ${key}`, res.status)
  }

  async upload(filePath: string): Promise<{ url: string; key: string }> {
    const key = `opensocial/${Date.now()}-${basename(filePath)}`
    await this.send('PUT', key, readFileSync(filePath))
    return { url: `${this.cfg.publicBaseUrl}/${key}`, key }
  }

  async remove(key: string): Promise<void> {
    await this.send('DELETE', key)
  }
}

export async function resolveMedia(
  items: MediaItem[],
  ingestion: Record<MediaKind, IngestionMode>,
  host: MediaHost | undefined,
): Promise<{ media: ResolvedMediaItem[]; cleanup: () => Promise<void> }> {
  const media: ResolvedMediaItem[] = []
  const uploadedKeys: string[] = []
  for (const item of items) {
    const kind = mediaKind(item.source)
    if (isUrl(item.source)) {
      media.push({ kind, url: item.source, alt: item.alt })
      continue
    }
    if (!existsSync(item.source)) throw new ConfigError(`Media file not found: ${item.source}`)
    if (ingestion[kind] === 'direct-upload') {
      media.push({ kind, filePath: item.source, alt: item.alt })
      continue
    }
    if (!host) {
      throw new ConfigError(
        `This platform requires a public URL for ${kind} media, but "${item.source}" is a local file. ` +
          `Either pass a public URL, or configure "mediaHost" (S3-compatible bucket) in config.json.`,
      )
    }
    const { url, key } = await host.upload(item.source)
    uploadedKeys.push(key)
    media.push({ kind, url, alt: item.alt })
  }
  const cleanup = async () => {
    for (const key of uploadedKeys) {
      try { await host!.remove(key) } catch { /* best-effort cleanup */ }
    }
  }
  return { media, cleanup }
}
