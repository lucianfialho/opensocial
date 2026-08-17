// Hourly publishing tick: unfolds each news event into several content
// pieces (reel + resumo carousel + claim carousels), then publishes ONE
// piece per tick, respecting daily caps and a minimum gap.
//
// Usage: node scripts/publish-tick.mjs [--dry] [--force]
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {envValue} from './tts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, '..', 'cli', 'dist', 'index.js');
const API = 'https://oagentico.com.br/api/v1';
const STATE_FILE = join(homedir(), '.config', 'opensocial', 'oagentico-queue.json');

// pacing knobs — the ceiling is Meta's action block, not hardware, so ramp
// in steps (6 → 8 → 12) watching for 2207051. Overridable per machine via
// env/.env so a ramp step is a unit edit, not a deploy.
const ACTIVE_HOURS = [8, 22]; // local time window
const REELS_PER_DAY = Number(envValue('OPENSOCIAL_REELS_PER_DAY') ?? 4);
const POSTS_PER_DAY = Number(envValue('OPENSOCIAL_POSTS_PER_DAY') ?? 6);
const MIN_GAP_MINUTES = Number(envValue('OPENSOCIAL_MIN_GAP_MINUTES') ?? 50);
// Machine slice: which content types THIS machine ingests and publishes.
// Set OPENSOCIAL_TICK_TYPES=reel (desktop) or =carousel (VPS) in the unit
// or packages/video/.env; unset = both (single-machine mode).
const TICK_TYPES = new Set(
  (envValue('OPENSOCIAL_TICK_TYPES') ?? 'reel,carousel')
    .split(',').map((s) => s.trim()).filter(Boolean),
);

const dry = process.argv.includes('--dry');
const force = process.argv.includes('--force');
const log = (m) => console.log(`[tick ${new Date().toISOString()}] ${m}`);

const token = envValue('OAGENTICO_TOKEN');
const state = existsSync(STATE_FILE)
  ? JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  : {seen: {}, published: {}, queue: []};
const save = () => {
  mkdirSync(dirname(STATE_FILE), {recursive: true});
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
};

// Write-ahead recovery: a pending marker means a previous tick died between
// media_publish and the state save. Republishing could duplicate the post,
// so treat it as published (worst case: one lost post, never a double).
if (state.pending) {
  log(`RECUPERAÇÃO: tick anterior morreu publicando ${state.pending.key} — marcando como publicado por segurança (verificar o feed).`);
  state.published[state.pending.key] = {
    day: (state.pending.at ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    type: state.pending.item?.type,
    at: state.pending.at,
    title: state.pending.item?.title,
    via: 'recovered-after-crash',
  };
  const pendingKey = state.pending.key;
  state.queue = state.queue.filter(
    (i) => `${i.type}:${i.mode ?? ''}:${i.chunk ?? 0}:${i.id}` !== pendingKey,
  );
  delete state.pending;
  save();
}

// Machine slice: drop queue items that belong to the other machine.
{
  const before = state.queue.length;
  state.queue = state.queue.filter((i) => TICK_TYPES.has(i.type));
  if (state.queue.length !== before) {
    log(`fatia [${[...TICK_TYPES]}]: ${before - state.queue.length} itens de outros tipos removidos da fila.`);
    save();
  }
}

const hour = new Date().getHours();
if (!force && (hour < ACTIVE_HOURS[0] || hour >= ACTIVE_HOURS[1])) {
  log(`fora da janela ${ACTIVE_HOURS[0]}h-${ACTIVE_HOURS[1]}h — encerrando.`);
  process.exit(0);
}

// 1. refresh queue with unseen events. No `desde` filter: it cut by cluster
// BIRTH date, hiding developing stories in old clusters (the exact failure
// the API's activity ordering fixed) — the top-20 by activity IS the window.
const res = await fetch(`${API}/eventos?limite=20`, {
  headers: {Authorization: `Bearer ${token}`},
});
if (!res.ok) throw new Error(`API ${res.status}`);
const {dados} = await res.json();
// The API is the editorial authority: /eventos comes ordered by recent
// activity (capped at 3 days), so we consume it AS DELIVERED — no local
// re-sorting by source count or cluster id (id order buried developing
// stories whose cluster was born days earlier).
const fresh = [];
for (const event of dados) {
  if (state.seen[event.id]) continue;
  // one piece per type per event: a reel and ONE carousel — the LLM-scripted
  // resumo already tells the whole story, and a second claims carousel of
  // the same event reads as a duplicate post in the feed
  const pieces = [
    {type: 'reel', id: event.id, title: event.title},
    {type: 'carousel', mode: 'resumo', id: event.id, title: event.title},
  ];
  fresh.push(...pieces.filter((p) => TICK_TYPES.has(p.type)));
  state.seen[event.id] = new Date().toISOString();
  log(`evento novo #${event.id} → fila (ordem editorial da API)`);
}
// fresh batch jumps the line, keeping the API's order within the batch:
// news value decays fast and the backlog can wait — but "newest" now means
// most recent ACTIVITY, and the site decides that, not us.
state.queue.unshift(...fresh);
save();

// 2. caps
const today = new Date().toISOString().slice(0, 10);
const publishedToday = Object.values(state.published).filter((p) => p.day === today);
const reelsToday = publishedToday.filter((p) => p.type === 'reel').length;
const minutesSinceLast = state.lastPublishedAt
  ? (Date.now() - new Date(state.lastPublishedAt).getTime()) / 60000
  : Infinity;

if (!force && publishedToday.length >= POSTS_PER_DAY) {
  log(`cap diário atingido (${POSTS_PER_DAY}) — encerrando.`);
  process.exit(0);
}
if (!force && minutesSinceLast < MIN_GAP_MINUTES) {
  log(`último post há ${minutesSinceLast.toFixed(0)}min (< ${MIN_GAP_MINUTES}) — encerrando.`);
  process.exit(0);
}

// 3. pick the first eligible item
const idx = state.queue.findIndex((item) => {
  if (!TICK_TYPES.has(item.type)) return false;
  if (item.type === 'reel') return force || reelsToday < REELS_PER_DAY;
  return true;
});
if (idx === -1) {
  log('fila vazia ou sem item elegível — encerrando.');
  process.exit(0);
}
const item = state.queue[idx];
const key = `${item.type}:${item.mode ?? ''}:${item.chunk ?? 0}:${item.id}`;
log(`publicando ${key} — ${item.title}`);

// 4. render + publish
let media;
let caption;
if (item.type === 'reel') {
  execFileSync('node', ['scripts/news-split.mjs', `--id=${item.id}`], {cwd: root, stdio: 'inherit'});
  media = [join(root, 'out', `split-${item.id}.mp4`)];
  caption = readFileSync(join(root, 'out', `split-${item.id}.caption.txt`), 'utf8');
} else {
  const cargs = ['scripts/news-carousel.mjs', `--id=${item.id}`, `--mode=${item.mode}`];
  if (item.mode === 'claims') cargs.push(`--chunk=${item.chunk}`);
  execFileSync('node', cargs, {cwd: root, stdio: 'inherit'});
  const slug = `news-${item.id}-${item.mode}${item.mode === 'claims' ? item.chunk : ''}`;
  const manifest = JSON.parse(readFileSync(join(root, 'out', 'carousel', `${slug}.manifest.json`), 'utf8'));
  media = manifest.files;
  caption = readFileSync(manifest.captionFile, 'utf8');
}

if (dry) {
  log(`--dry: pulando publicação de ${media.length} arquivo(s).`);
  process.exit(0);
}
// write-ahead: if we die between media_publish and the post-success save,
// the next tick finds this marker and does NOT republish.
state.pending = {key, at: new Date().toISOString(), item};
save();
try {
  execFileSync('node', [cli, 'post', '--to', 'instagram', '--text', caption, '--media', ...media], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
} catch (err) {
  delete state.pending;
  const output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  if (output.includes('2207051') || output.includes('Application request limit')) {
    // account/app action block — not the item's fault; keep it in place and
    // let the next hourly tick try again after the block lifts
    log('conta com action block (2207051) — item mantido, tentando na próxima hora.');
    save();
    process.exit(0);
  }
  // genuine item failure: send to the back, discard after 3 strikes
  log(`erro do item: ${output.slice(-300)}`);
  state.queue.splice(idx, 1);
  if ((item.retries ?? 0) + 1 >= 3) {
    log(`item ${key} falhou 3x — descartado da fila. Saída: ${output.slice(-200)}`);
  } else {
    state.queue.push({...item, retries: (item.retries ?? 0) + 1});
    log(`item ${key} falhou — movido pro fim da fila (tentativa ${(item.retries ?? 0) + 1}/3).`);
  }
  save();
  process.exit(0);
}

delete state.pending;
state.queue.splice(idx, 1);
state.published[key] = {day: today, type: item.type, at: new Date().toISOString(), title: item.title};
state.lastPublishedAt = new Date().toISOString();
save();
log(`publicado: ${key}`);
