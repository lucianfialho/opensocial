import { describe, it, expect } from 'vitest'
import { publishToAll } from './publish.js'

const live = process.env.OPENSOCIAL_LIVE_TEST === '1'

describe.skipIf(!live)('live smoke (requires real connected accounts)', () => {
  it('posts a real image to instagram', async () => {
    const results = await publishToAll(['instagram'], {
      text: `opensocial live smoke ${new Date().toISOString()}`,
      media: [{ source: process.env.OPENSOCIAL_LIVE_IMAGE_URL ?? '' }],
    })
    expect(results[0].status).toBe('published')
  }, 120_000)
})
