import { it, expect } from 'vitest'
import { formatResults, exitCodeFor } from './output.js'

const results = [
  { platform: 'instagram' as const, status: 'published' as const, id: 'M1', url: 'https://ig/p/x' },
  { platform: 'tiktok' as const, status: 'failed' as const, error: 'boom' },
]

it('human table lists one line per platform with status', () => {
  const text = formatResults(results, false)
  expect(text).toContain('instagram')
  expect(text).toContain('published')
  expect(text).toContain('https://ig/p/x')
  expect(text).toContain('failed')
  expect(text).toContain('boom')
})

it('json mode emits parseable JSON', () => {
  expect(JSON.parse(formatResults(results, true))).toEqual(results)
})

it('exit code is 1 if any platform failed, 0 if all published', () => {
  expect(exitCodeFor(results)).toBe(1)
  expect(exitCodeFor([results[0]])).toBe(0)
})
