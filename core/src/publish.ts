import type { Fetch, Platform, PlatformResult, Post, ValidationIssue, Account } from './types.js'
import { OpenSocialError, ApiError, RateLimitError } from './errors.js'
import { adapters } from './adapter.js'
import { effectivePost } from './post.js'
import { getAccount, saveAccount } from './accounts.js'
import { loadConfig, getAppCredentials } from './config.js'
import { S3MediaHost, resolveMedia } from './media.js'

export class ValidationError extends OpenSocialError {
  constructor(public issues: ValidationIssue[]) {
    super(`Validation failed:\n${issues.map((i) => `  [${i.platform}] ${i.message}`).join('\n')}`)
  }
}

export interface PublishDeps { fetchImpl?: Fetch }

export async function publishToAll(platforms: Platform[], post: Post, deps: PublishDeps = {}): Promise<PlatformResult[]> {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch
  const config = loadConfig()

  // fase 1: contas + validação de tudo, antes de qualquer rede
  const accounts = new Map<Platform, Account>()
  const issues: ValidationIssue[] = []
  for (const p of platforms) {
    accounts.set(p, getAccount(p))
    issues.push(...adapters[p].validate(effectivePost(post, p)))
  }
  if (issues.length > 0) throw new ValidationError(issues)

  const host = config.mediaHost ? new S3MediaHost(config.mediaHost, fetchImpl) : undefined
  const results: PlatformResult[] = []

  for (const p of platforms) {
    const adapter = adapters[p]
    const ep = effectivePost(post, p)
    const { media, cleanup } = await resolveMedia(ep.media, adapter.mediaIngestion, host)
    const options = { tiktokPrivacyLevel: config.tiktok?.privacyLevel }
    try {
      let account = accounts.get(p)!
      let result
      try {
        result = await adapter.publish(account, { text: ep.text, media }, options, fetchImpl)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          account = await adapter.refreshToken(getAppCredentials(config, p), account, fetchImpl)
          saveAccount(account)
          result = await adapter.publish(account, { text: ep.text, media }, options, fetchImpl)
        } else throw err
      }
      results.push({ platform: p, status: 'published', id: result.id, url: result.url })
    } catch (err) {
      const message =
        err instanceof RateLimitError
          ? `Rate limited by ${p}${err.retryAfterSeconds ? ` — retry after ${err.retryAfterSeconds}s` : ''}`
          : err instanceof Error ? err.message : String(err)
      results.push({ platform: p, status: 'failed', error: message })
    } finally {
      await cleanup()
    }
  }
  return results
}
