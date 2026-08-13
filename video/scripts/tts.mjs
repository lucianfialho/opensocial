// ElevenLabs narration with per-clip cache in public/audio/.
// Voice: ELEVENLABS_VOICE_ID env (default: Daniel), model multilingual v2,
// speed 1.2 (API max) — news-anchor pacing.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 30;
const SPEED = 1.2; // ElevenLabs API cap
const TEMPO = 1.0833; // ffmpeg atempo on top → 1.2 × 1.083 ≈ 1.3x effective
const MODEL = 'eleven_multilingual_v2';
const DEFAULT_VOICE = 'cjVigY5qzO86Huf0OWal'; // Eric

export const envValue = (name) => {
  if (process.env[name]) return process.env[name];
  const envFile = join(root, '.env');
  if (!existsSync(envFile)) return undefined;
  return readFileSync(envFile, 'utf8').match(new RegExp(`${name}=(.+)`))?.[1]?.trim();
};

const voiceId = () => envValue('ELEVENLABS_VOICE_ID') ?? DEFAULT_VOICE;

/** with-timestamps: audio + per-character alignment → per-word timings. */
async function tts(text, outPath, apiKey) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId()}/with-timestamps`,
    {
      method: 'POST',
      headers: {'xi-api-key': apiKey, 'content-type': 'application/json'},
      body: JSON.stringify({
        text,
        model_id: MODEL,
        voice_settings: {speed: SPEED, stability: 0.5, similarity_boost: 0.75},
      }),
    },
  );
  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const rawPath = `${outPath}.raw.mp3`;
  writeFileSync(rawPath, Buffer.from(data.audio_base64, 'base64'));
  execFileSync(
    'npx',
    ['remotion', 'ffmpeg', '-i', rawPath, '-filter:a', `atempo=${TEMPO}`, outPath, '-y'],
    {cwd: root, stdio: 'ignore'},
  );
  rmSync(rawPath);

  const al = data.alignment;
  const words = [];
  let current = null;
  al.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      current = null;
      return;
    }
    if (!current) {
      current = {text: '', start: al.character_start_times_seconds[i] / TEMPO, end: 0};
      words.push(current);
    }
    current.text += ch;
    current.end = al.character_end_times_seconds[i] / TEMPO;
  });
  writeFileSync(`${outPath}.json`, JSON.stringify(words));
}

function durationInFrames(file) {
  const out = execFileSync(
    'npx',
    ['remotion', 'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
     '-of', 'default=noprint_wrappers=1:nokey=1', file],
    {cwd: root, encoding: 'utf8'},
  );
  return Math.ceil(parseFloat(out.trim()) * FPS);
}

/** One continuous clip for the whole reel; cached by voice+speed+text. */
export async function narrateContinuous(eventId, fullText, apiKey) {
  mkdirSync(join(root, 'public', 'audio'), {recursive: true});
  const hash = createHash('md5')
    .update(`v3|${voiceId()}|${SPEED}|${TEMPO}|${fullText}`)
    .digest('hex')
    .slice(0, 8);
  const rel = `audio/news-${eventId}-full-${hash}.mp3`;
  const abs = join(root, 'public', rel);
  if (!existsSync(abs) || !existsSync(`${abs}.json`)) {
    console.log(`tts: narração contínua (${fullText.length} chars)`);
    await tts(fullText, abs, apiKey);
  }
  const words = JSON.parse(readFileSync(`${abs}.json`, 'utf8'));
  return {src: rel, durationInFrames: durationInFrames(abs), words};
}

/**
 * Splits the continuous track back into per-sentence frame durations by
 * counting words (alignment and sentence texts share whitespace splitting).
 */
export function sentenceCuts(clip, sentenceTexts, fps = 30) {
  const counts = sentenceTexts.map((t) => t.split(/\s+/).filter(Boolean).length);
  const starts = [];
  let idx = 0;
  for (const count of counts) {
    starts.push(clip.words[idx]?.start ?? null);
    idx += count;
  }
  const totalEnd = clip.words[clip.words.length - 1].end;
  const ends = [...starts.slice(1), totalEnd];
  return sentenceTexts.map((_, i) =>
    Math.max(1, Math.round((ends[i] - starts[i]) * fps)),
  );
}
