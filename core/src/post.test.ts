import { describe, it, expect } from 'vitest'
import { effectivePost, mediaKind } from './post.js'
import { MediaRejectedError } from './errors.js'

describe('effectivePost', () => {
  it('applies platform override over base', () => {
    const p = effectivePost(
      { text: 'base', media: [{ source: 'a.jpg' }], overrides: { tiktok: { text: 'tk' } } },
      'tiktok',
    )
    expect(p.text).toBe('tk')
    expect(p.media).toEqual([{ source: 'a.jpg' }])
  })
  it('defaults to empty text and media', () => {
    expect(effectivePost({}, 'instagram')).toEqual({ text: '', media: [] })
  })
})

describe('mediaKind', () => {
  it('detects by extension, case-insensitive, with query strings', () => {
    expect(mediaKind('foto.JPG')).toBe('image')
    expect(mediaKind('https://x.com/v.mp4?sig=1')).toBe('video')
  })
  it('rejects unknown extensions', () => {
    expect(() => mediaKind('doc.pdf')).toThrow(MediaRejectedError)
  })
})
