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
import { linkedinAdapter } from './adapters/linkedin.js'
import { xAdapter } from './adapters/x.js'

export interface AuthorizeExtra {
  codeChallenge?: string
  /** LinkedIn only: authorize as a person ('member') or an organization page
   *  (the default, see exchangeCode). Other adapters ignore this. */
  as?: 'member' | 'organization'
}
export interface ExchangeExtra {
  codeVerifier?: string
  /** LinkedIn only: must match the `as` passed to authorizeUrl. Other adapters ignore this. */
  as?: 'member' | 'organization'
  /** LinkedIn only: organization id to pick when the member administers more than one page. */
  org?: string
}

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
  validate(post: { text: string; media: { source: string; alt?: string }[] }, options?: AdapterPublishOptions): ValidationIssue[]
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
  /** Instagram only — see Post.story. */
  story?: boolean
}

export const adapters: Record<Platform, PlatformAdapter> = {
  instagram: instagramAdapter,
  tiktok: tiktokAdapter,
  youtube: youtubeAdapter,
  linkedin: linkedinAdapter,
  x: xAdapter,
}
