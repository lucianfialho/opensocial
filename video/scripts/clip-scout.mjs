// Clip scout: scans the editorial top-5 for stories with an obvious video,
// hunts the clip (YouTube via yt-dlp search + X via Tavily), and delivers
// ready-to-run candidates for human approval. Publishing stays manual.
//
// Usage: node scripts/clip-scout.mjs [--top=5]
// State: ~/.config/opensocial/clips-seen.json
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {envValue} from './tts.mjs';
import {judgeEvent, searchYouTube, searchTavily, searchRadarX, judgeRadarFind, canDownload, notify} from './clip-scout-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://oagentico.com.br/api/v1';
const STATE = join(homedir(), '.config', 'opensocial', 'clips-seen.json');
const token = envValue('OAGENTICO_TOKEN');
const top = Number(process.argv.find((a) => a.startsWith('--top='))?.split('=')[1] ?? 5);

const seen = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const log = (m) => console.log(`[scout ${new Date().toISOString()}] ${m}`);

const res = await fetch(`${API}/eventos?limite=${top}`, {headers: {Authorization: `Bearer ${token}`}});
if (!res.ok) throw new Error(`API ${res.status}`);
const {dados} = await res.json();

const candidates = [];
for (const event of dados.slice(0, top)) {
  if (seen[event.id]) continue;
  const detail = await (
    await fetch(`${API}/eventos/${event.id}`, {headers: {Authorization: `Bearer ${token}`}})
  ).json();
  let verdict;
  try {
    verdict = await judgeEvent(event, detail.dados?.summary ?? '');
  } catch (err) {
    log(`#${event.id}: julgamento falhou (${err.message}) — tenta na próxima rodada`);
    continue;
  }
  seen[event.id] = new Date().toISOString();
  if (!verdict.temVideo) {
    log(`#${event.id}: sem vídeo óbvio — "${event.title.slice(0, 50)}"`);
    continue;
  }
  log(`#${event.id}: TEM VÍDEO → buscando "${verdict.query}"`);
  const yt = searchYouTube(verdict.query).filter((v) => v.duration >= 8 && v.duration <= 240);
  const x = await searchTavily(verdict.query);
  // best = highest-ranked candidate that THIS machine can actually download
  const pool = [...yt.sort((a, b) => b.views - a.views), ...x];
  let best = null;
  for (const cand of pool.slice(0, 6)) {
    if (canDownload(cand.url)) { best = cand; break; }
    log(`#${event.id}: ${cand.url.slice(0, 60)} não baixa daqui — tentando próximo`);
  }
  if (!best && pool.length === 0) {
    log(`#${event.id}: nada encontrado`);
    continue;
  }
  candidates.push({
    eventId: event.id,
    title: event.title,
    headline: verdict.headline,
    caption: verdict.caption,
    best,
    alternatives: [...yt.slice(0, 3), ...x.slice(0, 2)],
  });
}

// ---- RADAR: vídeos bombando no X, independente da cobertura do site ----
// verificação editorial aqui é HUMANA — os candidatos chegam marcados 🌐
let radarCount = 0;
const finds = await searchRadarX();
const novos = finds.filter((f) => !seen[f.url]).length;
log(`radar: ${finds.length} achados, ${novos} novos`);
for (const find of finds) {
  if (radarCount >= 2) break; // máx 2 por rodada, sem spam
  if (seen[find.url]) continue;
  seen[find.url] = new Date().toISOString();
  let screen;
  try {
    screen = await judgeRadarFind(find.title, find.url);
  } catch { continue; }
  if (!screen.vale) {
    log(`radar: reprovado (${screen.motivo ?? 's/ motivo'}) — ${find.title.slice(0, 50)}`);
    continue;
  }
  if (!canDownload(find.url)) {
    log(`radar: não baixa daqui — ${find.url.slice(0, 60)}`);
    continue;
  }
  const radarId = 90000 + (Object.keys(seen).length % 9000);
  candidates.push({
    eventId: radarId,
    radar: true,
    title: find.title.slice(0, 90),
    headline: screen.headline,
    caption: screen.caption,
    best: {...find, views: 0, duration: 0},
    alternatives: [],
  });
  radarCount += 1;
  log(`radar: CANDIDATO #${radarId} — ${screen.headline}`);
}

writeFileSync(STATE, JSON.stringify(seen, null, 2));
// candidates persist with status so the Telegram approver can act on them
const CANDS = join(homedir(), '.config', 'opensocial', 'clip-candidates.json');
const book = existsSync(CANDS) ? JSON.parse(readFileSync(CANDS, 'utf8')) : {};
for (const c of candidates) {
  book[c.eventId] = {...c, status: 'pending', foundAt: new Date().toISOString()};
}
writeFileSync(CANDS, JSON.stringify(book, null, 2));

if (candidates.length === 0) {
  log('nenhum candidato nesta rodada.');
  process.exit(0);
}

for (const c of candidates) {
  const cmd = c.best
    ? `node scripts/tweet-clip.mjs --url="${c.best.url}" --headline="${c.headline}" --credit="${c.best.title.split('|')[0].trim().slice(0, 40)}" --max=60`
    : '(escolher URL manualmente entre as alternativas)';
  const msg = [
    c.radar ? `🌐 RADAR (fora do site) — #${c.eventId}` : `🎬 CANDIDATO A REEL — evento #${c.eventId}`,
    c.title,
    '',
    `Manchete sugerida: ${c.headline}`,
    c.best ? `Melhor vídeo: ${c.best.url} (${c.best.views.toLocaleString('pt-BR')} views, ${c.best.duration}s)` : 'Sem vídeo no YouTube; ver alternativas do X:',
    ...c.alternatives.slice(0, 3).map((a) => `· ${a.source}: ${a.url}`),
    '',
    c.radar ? '⚠️ Não coberto pelo site — a verificação é sua.' : '',
    c.best ? `Responda "publica ${c.eventId}" para postar, ou "pula ${c.eventId}".` : 'Sem vídeo direto — escolher URL manualmente.',
    '',
    `(manual: ${cmd})`,
  ].join('\n');
  log(`candidato: #${c.eventId} — ${c.headline}`);
  await notify(msg);
}
log(`${candidates.length} candidato(s) pendentes no livro de candidatos`);
