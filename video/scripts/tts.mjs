// ElevenLabs narration with per-clip cache in public/audio/.
// Voice: reporter pool (3 native pt-BR voices, picked per event) unless
// ELEVENLABS_VOICE_ID forces one. Model eleven_v3, speed 1.2, pt-BR
// pronunciation dictionary for English tech terms.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 30;
const SPEED = 1.2; // ElevenLabs API cap
const TEMPO = 1.25; // ffmpeg atempo on top → 1.2 × 1.25 = 1.5x effective
const MODEL = 'eleven_v3';
// The reporter pool: three native pt-BR voices, rotated per event so each
// story keeps a consistent voice across re-renders (cache-friendly).
// `pose` is the Magnific creation of each reporter at the news desk —
// voice and face always travel together.
const REPORTERS = [
  {id: 'Qrdut83w0Cr152Yb4Xn3', name: 'Paulo', pose: 'MBouBmIDCm'},
  {id: 'cyD08lEy76q03ER1jZ7y', name: 'Scheila', pose: 'lJO2JNagv9'},
  {id: 'RGymW84CSmfVugnA5tvA', name: 'Roberta', pose: 'vQFjkHka47'},
];
// pinned by scripts/sync-pronuncia.mjs (edit pronuncia.json, run the sync)
const lockPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'pronuncia.lock.json');
const PRONUNCIATION_DICTIONARY = existsSync(lockPath)
  ? JSON.parse(readFileSync(lockPath, 'utf8'))
  : {pronunciation_dictionary_id: 'OtVajeC5RdDnSY4sMZgk', version_id: '3lWnwTlUpbZqEKD0LuFK'};

export const envValue = (name) => {
  if (process.env[name]) return process.env[name];
  const envFile = join(root, '.env');
  if (!existsSync(envFile)) return undefined;
  return readFileSync(envFile, 'utf8').match(new RegExp(`${name}=(.+)`))?.[1]?.trim();
};

export const reporterFor = (eventId) => {
  const forced = envValue('ELEVENLABS_VOICE_ID');
  if (forced) return {id: forced, name: 'custom', pose: undefined};
  return REPORTERS[Number(eventId) % REPORTERS.length];
};
const voiceFor = reporterFor;

/** with-timestamps: audio + per-character alignment → per-word timings. */
async function tts(text, outPath, apiKey, voice) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}/with-timestamps`,
    {
      method: 'POST',
      headers: {'xi-api-key': apiKey, 'content-type': 'application/json'},
      body: JSON.stringify({
        text,
        model_id: MODEL,
        language_code: 'pt',
        apply_text_normalization: 'on',
        pronunciation_dictionary_locators: [PRONUNCIATION_DICTIONARY],
        voice_settings: {speed: SPEED, stability: Number(envValue('OPENSOCIAL_TTS_STABILITY') ?? 0.5), similarity_boost: 0.75},
      }),
    },
  );
  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (TEMPO === 1) {
    writeFileSync(outPath, Buffer.from(data.audio_base64, 'base64'));
  } else {
    const rawPath = `${outPath}.raw.mp3`;
    writeFileSync(rawPath, Buffer.from(data.audio_base64, 'base64'));
    execFileSync(
      'npx',
      ['remotion', 'ffmpeg', '-i', rawPath, '-filter:a', `atempo=${TEMPO}`, outPath, '-y'],
      {cwd: root, stdio: 'ignore'},
    );
    rmSync(rawPath);
  }

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
  const voice = voiceFor(eventId);
  const hash = createHash('md5')
    .update(`v5|${MODEL}|${voice.id}|${SPEED}|${TEMPO}|${PRONUNCIATION_DICTIONARY.version_id}|${fullText}`)
    .digest('hex')
    .slice(0, 8);
  const rel = `audio/news-${eventId}-full-${hash}.mp3`;
  const abs = join(root, 'public', rel);
  if (!existsSync(abs) || !existsSync(`${abs}.json`)) {
    console.log(`tts: narração contínua (${fullText.length} chars) — repórter: ${voice.name}`);
    await tts(fullText, abs, apiKey, voice);
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
