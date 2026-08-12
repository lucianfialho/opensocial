export class OpenSocialError extends Error {}
export class ConfigError extends OpenSocialError {}
export class AuthExpiredError extends OpenSocialError {}
export class MediaRejectedError extends OpenSocialError {}
export class ApiError extends OpenSocialError {
  constructor(message: string, public status: number) { super(message) }
}
export class RateLimitError extends OpenSocialError {
  constructor(message: string, public retryAfterSeconds?: number) { super(message) }
}
