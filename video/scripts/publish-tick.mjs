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

// pacing knobs — ramp these up once the account has API history
const ACTIVE_HOURS = [8, 22]; // local time window
const REELS_PER_DAY = 4;
const POSTS_PER_DAY = 6;
const MIN_GAP_MINUTES = 50;
const CLAIM_CHUNKS_PER_EVENT = 2;
const CAROUSELS_ENABLED = false; // image publish (2207032) under investigation — each attempt costs ~17 API calls and re-triggers action blocks

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

const hour = new Date().getHours();
if (!force && (hour < ACTIVE_HOURS[0] || hour >= ACTIVE_HOURS[1])) {
  log(`fora da janela ${ACTIVE_HOURS[0]}h-${ACTIVE_HOURS[1]}h — encerrando.`);
  process.exit(0);
}

// 1. refresh queue with unseen events from the last 2 days
const since = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);
const res = await fetch(`${API}/eventos?desde=${since}&limite=20`, {
  headers: {Authorization: `Bearer ${token}`},
});
if (!res.ok) throw new Error(`API ${res.status}`);
const {dados} = await res.json();
for (const event of dados.sort((a, b) => b.independentSources - a.independentSources)) {
  if (state.seen[event.id]) continue;
  const detail = await (
    await fetch(`${API}/eventos/${event.id}`, {headers: {Authorization: `Bearer ${token}`}})
  ).json();
  const claimCount = detail.dados?.claims?.length ?? 0;
  const chunks = Math.min(CLAIM_CHUNKS_PER_EVENT, Math.floor(claimCount / 4));
  state.queue.push({type: 'reel', id: event.id, title: event.title});
  state.queue.push({type: 'carousel', mode: 'resumo', id: event.id, title: event.title});
  for (let c = 0; c < chunks; c++) {
    state.queue.push({type: 'carousel', mode: 'claims', chunk: c, id: event.id, title: event.title});
  }
  state.seen[event.id] = new Date().toISOString();
  log(`evento novo #${event.id} → 1 reel + ${1 + chunks} carrosséis na fila`);
}
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
  if (item.type === 'reel') return reelsToday < REELS_PER_DAY;
  return CAROUSELS_ENABLED;
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
try {
  execFileSync('node', [cli, 'post', '--to', 'instagram', '--text', caption, '--media', ...media], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
} catch (err) {
  const output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  if (output.includes('2207051') || output.includes('Application request limit')) {
    // account/app action block — not the item's fault; keep it in place and
    // let the next hourly tick try again after the block lifts
    log('conta com action block (2207051) — item mantido, tentando na próxima hora.');
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

state.queue.splice(idx, 1);
state.published[key] = {day: today, type: item.type, at: new Date().toISOString(), title: item.title};
state.lastPublishedAt = new Date().toISOString();
save();
log(`publicado: ${key}`);
