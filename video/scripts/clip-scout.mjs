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
import {judgeEvent, searchYouTube, searchTavily, searchRadarX, searchNasaVideos, judgeRadarFind, canDownload, notify} from './clip-scout-lib.mjs';
import {checkCopy} from './copy-check.mjs';
import {judgeHeat} from './heat-judge.mjs';
import {execFileSync} from 'node:child_process';
import {API, BRAND, HANDLE, profile, stateFile, apiToken} from './profile.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const STATE = stateFile('clips-seen.json');
const token = apiToken();
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
  const gateEv = checkCopy({headline: verdict.headline, caption: verdict.caption});
  if (!gateEv.ok) {
    log(`#${event.id}: trava de qualidade (${gateEv.motivo}) — pulando`);
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
  const gate = checkCopy({headline: screen.headline, caption: screen.caption});
  if (!gate.ok) {
    log(`radar: trava de qualidade (${gate.motivo}) — ${find.title.slice(0, 40)}`);
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

// ---- NASA: vídeos recentes de domínio público — replicação 100% segura ----
let nasaCount = 0;
const nasaFinds = await searchNasaVideos();
log(`nasa: ${nasaFinds.length} vídeo(s) recente(s)`);
for (const find of nasaFinds) {
  if (nasaCount >= 1) break; // 1 por rodada — é tempero, não prato principal
  if (seen[find.url]) continue;
  seen[find.url] = new Date().toISOString();
  let screen;
  try {
    screen = await judgeRadarFind(find.title, find.url);
  } catch { continue; }
  if (!screen.vale) {
    log(`nasa: reprovado (${screen.motivo ?? 's/ motivo'}) — ${find.title.slice(0, 50)}`);
    continue;
  }
  const gate = checkCopy({headline: screen.headline, caption: screen.caption});
  if (!gate.ok) {
    log(`nasa: trava de qualidade (${gate.motivo}) — ${find.title.slice(0, 40)}`);
    continue;
  }
  if (!canDownload(find.url)) {
    log(`nasa: não baixa daqui — ${find.url.slice(0, 60)}`);
    continue;
  }
  const nasaId = 90000 + (Object.keys(seen).length % 9000);
  candidates.push({
    eventId: nasaId,
    radar: true,
    credit: 'NASA',
    title: find.title.slice(0, 90),
    headline: screen.headline,
    caption: screen.caption,
    best: {...find, views: 0, duration: 0},
    alternatives: [],
  });
  nasaCount += 1;
  log(`nasa: CANDIDATO #${nasaId} — ${screen.headline}`);
}

// ---- EXPLAINER GATE: só pauta MUITO quente (>= 9) vira sugestão de reel,
// e nunca sem passar o roteiro pelo humano — nada renderiza sozinho ----
const HOT = Number(envValue('OPENSOCIAL_REEL_HEAT_MIN') ?? 9);
for (const event of dados.slice(0, top)) {
  const key = `reel:${event.id}`;
  if (seen[key]) continue;
  let heat;
  try {
    const detail = await (await fetch(`${API}/eventos/${event.id}`, {headers: {Authorization: `Bearer ${token}`}})).json();
    heat = await judgeHeat(event, detail.dados?.summary ?? '');
  } catch { continue; }
  seen[key] = new Date().toISOString();
  if (heat.nota < HOT) continue;
  log(`🔥 pauta ${heat.nota}/10 (#${event.id}) — escrevendo roteiro pro gate`);
  try {
    execFileSync('node', ['scripts/vox-explainer.mjs', `--id=${event.id}`, '--resumo', '--collage', '--dry'],
      {cwd: root, encoding: 'utf8', timeout: 10 * 60_000, env: process.env});
    const p = JSON.parse(readFileSync(join(root, 'out', `vox-${event.id}-resumo-collage.props.json`), 'utf8'));
    const cap = readFileSync(join(root, 'out', `vox-${event.id}.caption.txt`), 'utf8').split('\n')[0];
    const beats = p.segments.map((sg, i) => `${i + 1}. ${sg.text}`).join('\n');
    await notify(`🔥 PAUTA MUITO QUENTE (${heat.nota}/10) — reel? #${event.id}\n${event.title}\n\n📝 ROTEIRO:\n${beats}\n\nLegenda: ${cap}\n\nResponda "renderiza ${event.id}" pra ver o vídeo, "roteiro ${event.id}" pra refazer, ou ignora.`);
  } catch (err) {
    log(`gate #${event.id}: roteiro falhou (${String(err).slice(0, 60)})`);
  }
}

writeFileSync(STATE, JSON.stringify(seen, null, 2));
// candidates persist with status so the Telegram approver can act on them
const CANDS = stateFile('clip-candidates.json');
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
