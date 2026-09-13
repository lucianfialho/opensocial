import { ApiError } from './errors.js'

export async function pollUntil<T>(
  fn: () => Promise<T>,
  done: (t: T) => boolean,
  opts: { intervalMs?: number; timeoutMs?: number; label?: string } = {},
): Promise<T> {
  const { intervalMs = 2000, timeoutMs = 300_000, label = 'operation' } = opts
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const result = await fn()
    if (done(result)) return result
    if (Date.now() >= deadline) throw new ApiError(`Timed out waiting for ${label} after ${timeoutMs / 1000}s`, 408)
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}
