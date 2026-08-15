// Thin wrapper over the magnific-cli-anything CLI (Magnific MCP).
// Generates the reporter lip-sync clip for a narration audio file.
// CLI path: MAGNIFIC_CLI env var, or the default local install.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI =
  process.env.MAGNIFIC_CLI ??
  '/Users/lucianfialho/orca/magnific-cli-anything/.venv/bin/cli-anything-magnific';

// The reporter pose creation (bancada branca, mic com o cubo do "o").
export const POSE_CREATION = 'vQFjkHka47';

function call(tool, args) {
  const out = execFileSync(CLI, ['call', tool, '--args', JSON.stringify(args)], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const parsed = JSON.parse(out.slice(out.indexOf('{')));
  const text = parsed.content?.[0]?.text ?? '';
  if (parsed.isError) throw new Error(`magnific ${tool}: ${text.slice(0, 300)}`);
  if (parsed.structuredContent) return parsed.structuredContent;
  try {
    return JSON.parse(text.slice(text.indexOf('{')));
  } catch {
    return {raw: text};
  }
}

async function uploadAudio(filePath) {
  const req = call('creations_request_upload', {mimeType: 'audio/mpeg'});
  const res = await fetch(req.proxyUploadUrl, {
    method: 'PUT',
    headers: {'content-type': 'audio/mpeg'},
    body: readFileSync(filePath),
  });
  if (!res.ok) throw new Error(`upload PUT ${res.status}`);
  return call('creations_finalize_upload', {path: req.path}).identifier;
}

function waitCreation(identifier, {tries = 30, delayMs = 20_000} = {}) {
  for (let i = 0; i < tries; i++) {
    const out = call('creations_wait', {identifiers: [identifier]});
    const result = out.results?.[0];
    if (result?.status === 'completed') return result.results.url;
    if (result?.status === 'failed') throw new Error(`magnific creation ${identifier} failed`);
    execFileSync('sleep', [String(delayMs / 1000)]);
  }
  throw new Error(`magnific creation ${identifier} timed out`);
}

/**
 * Lip-sync clip of the reporter speaking `audioPath`, cached in
 * public/persona by audio content hash. Returns the staticFile-relative path.
 */
export async function personaClip(eventId, audioPath) {
  mkdirSync(join(root, 'public', 'persona'), {recursive: true});
  const hash = createHash('md5').update(readFileSync(audioPath)).digest('hex').slice(0, 8);
  const rel = `persona/news-${eventId}-${hash}.mp4`;
  const abs = join(root, 'public', rel);
  if (existsSync(abs)) return rel;

  console.log('magnific: subindo áudio da narração');
  const audioId = await uploadAudio(audioPath);
  console.log('magnific: gerando lip-sync (veed-fabric)');
  const speak = call('video_speak', {
    imageUrl: POSE_CREATION,
    audioUrl: audioId,
    mode: 'veed-fabric-1.0',
    resolution: '720p',
  });
  const speakId = speak.creation?.identifier ?? speak.creations?.[0]?.identifier;
  if (!speakId) throw new Error(`video_speak sem identifier: ${JSON.stringify(speak).slice(0, 200)}`);
  const url = waitCreation(speakId);
  const video = await fetch(url);
  writeFileSync(abs, Buffer.from(await video.arrayBuffer()));
  console.log(`magnific: pronto -> ${rel}`);
  return rel;
}
