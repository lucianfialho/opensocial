import { publishToAll, type Platform, type Post, adapters } from '@opensocial/core'
import { formatResults, exitCodeFor } from '../output.js'

interface PostFlags { to: string; text?: string; media?: string[]; json?: boolean; thumbOffset?: string }

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

export async function postCommand(flags: PostFlags): Promise<void> {
  const platforms = flags.to.split(',').map((s) => s.trim()) as Platform[]
  for (const p of platforms) {
    if (!(p in adapters)) throw new Error(`Unknown platform "${p}". Supported: ${Object.keys(adapters).join(', ')}`)
  }
  let post: Post
  if (flags.json) {
    if (flags.text || flags.media?.length) throw new Error('--json reads the post from stdin; do not combine with --text/--media.')
    post = JSON.parse(await readStdin()) as Post
  } else {
    post = { text: flags.text, media: flags.media?.map((source) => ({ source })), thumbOffsetMs: flags.thumbOffset ? Number(flags.thumbOffset) : undefined }
  }
  const results = await publishToAll(platforms, post)
  console.log(formatResults(results, flags.json ?? false))
  process.exitCode = exitCodeFor(results)
}
