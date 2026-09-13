import type { Fetch } from './types.js'

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export function sequenceFetch(responses: Response[]) {
  const calls: { url: string; init?: RequestInit }[] = []
  const queue = [...responses]
  const fetchImpl: Fetch = async (input, init) => {
    calls.push({ url: String(input instanceof Request ? input.url : input), init })
    const next = queue.shift()
    if (!next) throw new Error(`sequenceFetch exhausted (call #${calls.length}: ${calls.at(-1)!.url})`)
    return next
  }
  return { fetch: fetchImpl, calls }
}
