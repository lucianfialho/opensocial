import { it, expect } from 'vitest'
import { pollUntil } from './poll.js'
import { ApiError } from './errors.js'

it('polls until done', async () => {
  let n = 0
  const out = await pollUntil(async () => ++n, (v) => v >= 3, { intervalMs: 1 })
  expect(out).toBe(3)
})

it('times out with ApiError mentioning label', async () => {
  await expect(
    pollUntil(async () => 'nope', () => false, { intervalMs: 1, timeoutMs: 10, label: 'tiktok processing' }),
  ).rejects.toThrow(/tiktok processing/)
})
