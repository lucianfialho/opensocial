import type { PlatformResult } from '@opensocial/core'

export function formatResults(results: PlatformResult[], json: boolean): string {
  if (json) return JSON.stringify(results, null, 2)
  return results
    .map((r) =>
      r.status === 'published'
        ? `${r.platform.padEnd(10)} published  ${r.id}${r.url ? `  ${r.url}` : ''}${r.note ? `  (${r.note})` : ''}`
        : `${r.platform.padEnd(10)} failed     ${r.error}`,
    )
    .join('\n')
}

export function exitCodeFor(results: PlatformResult[]): number {
  return results.every((r) => r.status === 'published') ? 0 : 1
}
