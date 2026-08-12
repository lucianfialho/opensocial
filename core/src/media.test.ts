import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { S3MediaHost, resolveMedia, isUrl } from './media.js'
import { ConfigError } from './errors.js'
import { jsonResponse, sequenceFetch } from './test-helpers.js'

const cfg = {
  endpoint: 'https://s3.example.com', region: 'auto', bucket: 'bkt',
  accessKeyId: 'AK', secretAccessKey: 'SK', publicBaseUrl: 'https://cdn.example.com',
}

function tmpImage(): string {
  const p = join(mkdtempSync(join(tmpdir(), 'osm-')), 'pic.jpg')
  writeFileSync(p, Buffer.from([0xff, 0xd8]))
  return p
}

it('isUrl distinguishes urls from paths', () => {
  expect(isUrl('https://a.com/x.jpg')).toBe(true)
  expect(isUrl('./x.jpg')).toBe(false)
})

it('upload PUTs to endpoint/bucket/key and returns public url', async () => {
  const { fetch, calls } = sequenceFetch([new Response(null, { status: 200 })])
  const host = new S3MediaHost(cfg, fetch)
  const out = await host.upload(tmpImage())
  expect(calls[0].url).toMatch(/^https:\/\/s3\.example\.com\/bkt\/opensocial\/\d+-pic\.jpg$/)
  expect(calls[0].init?.method).toBe('PUT')
  expect(out.url).toBe(`https://cdn.example.com/${out.key}`)
})

it('resolveMedia passes urls through and uploads paths needing public-url', async () => {
  const { fetch, calls } = sequenceFetch([new Response(null, { status: 200 }), new Response(null, { status: 204 })])
  const host = new S3MediaHost(cfg, fetch)
  const { media, cleanup } = await resolveMedia(
    [{ source: 'https://a.com/x.jpg' }, { source: tmpImage() }],
    { image: 'public-url', video: 'public-url' },
    host,
  )
  expect(media[0]).toEqual({ kind: 'image', url: 'https://a.com/x.jpg', alt: undefined })
  expect(media[1].url).toMatch(/^https:\/\/cdn\.example\.com\/opensocial\//)
  await cleanup()
  expect(calls[1].init?.method).toBe('DELETE')
})

it('local path + direct-upload resolves to filePath', async () => {
  const p = tmpImage()
  const { media } = await resolveMedia([{ source: p }], { image: 'direct-upload', video: 'direct-upload' }, undefined)
  expect(media[0]).toEqual({ kind: 'image', filePath: p, alt: undefined })
})

it('local path + public-url without host throws helpful ConfigError', async () => {
  await expect(
    resolveMedia([{ source: tmpImage() }], { image: 'public-url', video: 'public-url' }, undefined),
  ).rejects.toThrow(/mediaHost|public URL/)
})

it('missing local file throws ConfigError', async () => {
  await expect(
    resolveMedia([{ source: '/nope/missing.jpg' }], { image: 'direct-upload', video: 'direct-upload' }, undefined),
  ).rejects.toThrow(ConfigError)
})
