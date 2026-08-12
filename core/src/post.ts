import type { MediaItem, MediaKind, Platform, Post } from './types.js'
import { MediaRejectedError } from './errors.js'

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp'])
const VIDEO_EXT = new Set(['mp4', 'mov'])

export function effectivePost(post: Post, platform: Platform): { text: string; media: MediaItem[] } {
  const o = post.overrides?.[platform]
  return { text: o?.text ?? post.text ?? '', media: o?.media ?? post.media ?? [] }
}

export function mediaKind(source: string): MediaKind {
  const path = source.split('?')[0].split('#')[0]
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (IMAGE_EXT.has(ext)) return 'image'
  if (VIDEO_EXT.has(ext)) return 'video'
  throw new MediaRejectedError(`Unsupported media type ".${ext}" in "${source}" (supported: jpg, jpeg, png, webp, mp4, mov)`)
}
