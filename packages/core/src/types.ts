export type Platform = 'instagram' | 'tiktok' | 'youtube'
export type Fetch = typeof globalThis.fetch
export type MediaKind = 'image' | 'video'
export type IngestionMode = 'direct-upload' | 'public-url'

export interface MediaItem { source: string; alt?: string }

export interface Post {
  text?: string
  media?: MediaItem[]
  /** Reel cover frame, in ms from the start (Instagram thumb_offset). */
  thumbOffsetMs?: number
  overrides?: Partial<Record<Platform, { text?: string; media?: MediaItem[] }>>
}

export interface AppCredentials { clientId: string; clientSecret: string }

export interface Account {
  platform: Platform
  id: string
  username: string
  accessToken: string
  refreshToken?: string
  expiresAt?: string
}

export interface ValidationIssue { platform: Platform; message: string }
export interface PublishResult { platform: Platform; id: string; url?: string; note?: string }

export type PlatformResult =
  | { platform: Platform; status: 'published'; id: string; url?: string }
  | { platform: Platform; status: 'failed'; error: string }

export interface ResolvedMediaItem { kind: MediaKind; url?: string; filePath?: string; alt?: string }
export interface PreparedPost { text: string; media: ResolvedMediaItem[] }
