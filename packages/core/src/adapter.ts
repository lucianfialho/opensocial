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

export interface AuthorizeExtra { codeChallenge?: string }
export interface ExchangeExtra { codeVerifier?: string }

export interface PlatformAdapter {
  platform: Platform
  mediaIngestion: Record<MediaKind, IngestionMode>
  /** true when the platform requires PKCE (S256); `connect` then passes
   *  `extra.codeChallenge` to authorizeUrl and `extra.codeVerifier` to exchangeCode. */
  pkce?: boolean
  authorizeUrl(creds: AppCredentials, redirectUri: string, state: string, extra?: AuthorizeExtra): string
  exchangeCode(
    creds: AppCredentials,
    code: string,
    redirectUri: string,
    fetchImpl?: Fetch,
    extra?: ExchangeExtra,
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
