// Daily automation: pick today's best unpublished story, render the
// narrated reel, publish it to Instagram via the opensocial CLI, and
// remember what was published so reruns are safe.
//
// Usage: node scripts/publish-daily.mjs [--dry]
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {envValue} from './tts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..', '..');
const API = 'https://oagentico.com.br/api/v1';
const STATE_FILE = join(homedir(), '.config', 'opensocial', 'oagentico-published.json');
const dry = process.argv.includes('--dry');

const log = (msg) => console.log(`[publish-daily ${new Date().toISOString()}] ${msg}`);

const token = envValue('OAGENTICO_TOKEN');
if (!token) throw new Error('OAGENTICO_TOKEN missing');

const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {};

const today = new Date().toISOString().slice(0, 10);
const since = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);
const res = await fetch(`${API}/eventos?desde=${since}&limite=20`, {
  headers: {Authorization: `Bearer ${token}`},
});
if (!res.ok) throw new Error(`API ${res.status}`);
const {dados} = await res.json();

// newest first, best-confirmed first among same freshness, skip published
const candidates = dados
  .filter((e) => !state[e.id])
  .sort((a, b) => b.independentSources - a.independentSources);

if (candidates.length === 0) {
  log('nada novo para publicar — encerrando.');
  process.exit(0);
}

const story = candidates[0];
log(`selecionado #${story.id} [${story.independentSources} fontes]: ${story.title}`);

log('renderizando reel…');
execFileSync('node', ['scripts/news-video.mjs', `--id=${story.id}`], {
  cwd: root,
  stdio: 'inherit',
});

const video = join(root, 'out', `news-${story.id}.mp4`);
const caption = readFileSync(join(root, 'out', `news-${story.id}.caption.txt`), 'utf8');

if (dry) {
  log(`--dry: pulando publicação de ${video}`);
  process.exit(0);
}

log('publicando no Instagram…');
execFileSync(
  'node',
  [join(repoRoot, 'packages', 'cli', 'dist', 'index.js'), 'post', '--to', 'instagram', '--text', caption, '--media', video],
  {stdio: 'inherit'},
);

mkdirSync(dirname(STATE_FILE), {recursive: true});
state[story.id] = {publishedAt: new Date().toISOString(), title: story.title, day: today};
writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
log(`publicado e registrado: #${story.id}`);
