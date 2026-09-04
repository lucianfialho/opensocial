import type {
  Account,
  AppCredentials,
  Fetch,
  IngestionMode,
  MediaKind,
  Platform,
  PreparedPost,
  PublishResult,
  ValidationIssue,
} from './types.js'
import { instagramAdapter } from './adapters/instagram.js'
import { tiktokAdapter } from './adapters/tiktok.js'
import { youtubeAdapter } from './adapters/youtube.js'

export interface PlatformAdapter {
  platform: Platform
  mediaIngestion: Record<MediaKind, IngestionMode>
  authorizeUrl(creds: AppCredentials, redirectUri: string, state: string): string
  exchangeCode(
    creds: AppCredentials,
    code: string,
    redirectUri: string,
    fetchImpl?: Fetch,
  ): Promise<Account>
  refreshToken(
    creds: AppCredentials,
    account: Account,
    fetchImpl?: Fetch,
  ): Promise<Account>
  validate(post: { text: string; media: { source: string; alt?: string }[] }): ValidationIssue[]
  publish(
    account: Account,
    post: PreparedPost,
    options: AdapterPublishOptions,
    fetchImpl?: Fetch,
  ): Promise<PublishResult>
}

export interface AdapterPublishOptions {
  tiktokPrivacyLevel?: string
  thumbOffsetMs?: number
}

export const adapters: Record<Platform, PlatformAdapter> = {
  instagram: instagramAdapter,
  tiktok: tiktokAdapter,
  youtube: youtubeAdapter,
}
