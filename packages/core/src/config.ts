import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AppCredentials, Platform } from './types.js'
import { ConfigError } from './errors.js'

export interface S3MediaHostConfig {
  provider?: 's3'
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  publicBaseUrl: string
}

export interface VercelBlobMediaHostConfig {
  provider: 'vercel-blob'
  token: string
}

export type MediaHostConfig = S3MediaHostConfig | VercelBlobMediaHostConfig

export interface AppConfig {
  instagram?: AppCredentials
  tiktok?: AppCredentials & { privacyLevel?: string }
  youtube?: AppCredentials
  linkedin?: AppCredentials
  x?: AppCredentials
  mediaHost?: MediaHostConfig
}

export function configDir(): string {
  return process.env.OPENSOCIAL_CONFIG_DIR ?? join(homedir(), '.config', 'opensocial')
}

export function loadConfig(): AppConfig {
  const file = join(configDir(), 'config.json')
  if (!existsSync(file)) return {}
  return JSON.parse(readFileSync(file, 'utf8')) as AppConfig
}

export function getAppCredentials(config: AppConfig, platform: Platform): AppCredentials {
  const upper = platform.toUpperCase()
  const envId = process.env[`OPENSOCIAL_${upper}_CLIENT_ID`]
  const envSecret = process.env[`OPENSOCIAL_${upper}_CLIENT_SECRET`]
  if (envId && envSecret) return { clientId: envId, clientSecret: envSecret }
  const fromFile = config[platform]
  if (fromFile?.clientId && fromFile?.clientSecret) {
    return { clientId: fromFile.clientId, clientSecret: fromFile.clientSecret }
  }
  throw new ConfigError(
    `No app credentials for ${platform}. Add "${platform}": {"clientId": "...", "clientSecret": "..."} to ` +
      `${join(configDir(), 'config.json')} or set OPENSOCIAL_${upper}_CLIENT_ID / OPENSOCIAL_${upper}_CLIENT_SECRET.`,
  )
}
