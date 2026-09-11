// Telegram approval daemon: long-polls the bot for replies like
// "publica 3567" / "pula 3567", renders + publishes the approved
// TweetClip and answers with the Instagram link. Only messages from
// TELEGRAM_CHAT_ID are honored. Runs as a systemd service on the VPS.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {envValue} from './tts.mjs';
import {notify} from './clip-scout-lib.mjs';
import {checkCopy} from './copy-check.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANDS = join(homedir(), '.config', 'opensocial', 'clip-candidates.json');
const OFFSET = join(homedir(), '.config', 'opensocial', 'telegram-offset.json');
const TOKEN = envValue('TELEGRAM_BOT_TOKEN');
const CHAT = String(envValue('TELEGRAM_CHAT_ID') ?? '');
const log = (m) => console.log(`[approver ${new Date().toISOString()}] ${m}`);
if (!TOKEN || !CHAT) {
  console.error('TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID ausentes — nada a fazer.');
  process.exit(1);
}

const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);

function publish(cand) {
  const {best, headline, eventId} = cand;
  const creditGuess = cand.credit ?? ((best.title ?? '').split(/[|\-–]/)[0].trim().slice(0, 40) || 'fonte');
  const args = [
    'scripts/tweet-clip.mjs', `--url=${best.url}`, `--headline=${headline}`,
    `--credit=${creditGuess}`, '--max=60',
  ];
  if (cand.caption) args.push(`--caption=${cand.caption}`);
  execFileSync('node', args, {cwd: root, stdio: 'inherit', env: process.env, timeout: 30 * 60_000});
  const slug = createHash('md5').update(best.url).digest('hex').slice(0, 8);
  const caption = readFileSync(join(root, 'out', `tweetclip-${slug}.caption.txt`), 'utf8');
  const out = execFileSync('node', [
    join(root, '..', 'cli', 'dist', 'index.js'), 'post', '--to', 'instagram',
    '--text', caption, '--media', join(root, 'out', `tweetclip-${slug}.mp4`),
  ], {encoding: 'utf8', timeout: 30 * 60_000});
  const url = out.match(/https:\/\/www\.instagram\.com\S+/)?.[0] ?? '(sem link)';
  return url;
}

/** Beat script → Telegram-readable summary for the approval gate. */
function formatScript(eid) {
  const p = JSON.parse(readFileSync(join(root, 'out', `vox-${eid}-collage.props.json`), 'utf8'));
  const cap = existsSync(join(root, 'out', `vox-${eid}.caption.txt`)) ? readFileSync(join(root, 'out', `vox-${eid}.caption.txt`), 'utf8') : '';
  const lines = [`📝 ROTEIRO #${eid}`, ''];
  p.segments.forEach((sg, i) => {
    const el = [];
    if (sg.ransom) el.push(`RANSOM:${sg.ransom}`);
    if (sg.big) el.push(`número:${sg.big}`);
    if (sg.circle) el.push(`círculo:${sg.circle}`);
    if (sg.entity) el.push(`sticker:${sg.entity.nome}`);
    if (sg.poster) el.push('pôster');
    lines.push(`${i + 1}. ${sg.text}${el.length ? `  [${el.join(', ')}]` : ''}`);
  });
  lines.push('', `Legenda: ${cap.split('\n')[0]}`, '', `Responda "renderiza ${eid}" (colagem) ou "renderiza ${eid} cinetico". Pra refazer: "roteiro ${eid}".`);
  return lines.join('\n');
}

async function handle(text) {
  const t = text.trim().toLowerCase();
  // "busca" dispara uma rodada do scout na hora
  if (/^(busca|procura|scout)\b/.test(t)) {
    await notify('🔎 Caçando vídeos no top-15 editorial...');
    try {
      const out = execFileSync('node', ['scripts/clip-scout.mjs', '--top=15'],
        {cwd: root, encoding: 'utf8', timeout: 15 * 60_000});
      const judged = out.split('\n').filter((l) => / #\d+:|radar:/.test(l))
        .map((l) => l.replace(/^\[scout [^\]]+\] /, '').slice(0, 90));
      const tally = judged.length
        ? `Julgados:\n${judged.map((j) => `· ${j}`).join('\n')}`
        : 'Nenhum evento novo desde a última rodada — o top-15 inteiro já foi avaliado.';
      await notify(tally);
    } catch (err) {
      await notify(`❌ scout falhou: ${String(err.message).slice(0, 150)}`);
    }
    return;
  }
  // ---- explainer (reel Vox) gate: roteiro → renderiza → publica ----
  const ex = t.match(/^(roteiro|renderiza|publica-reel|publicareel)\s+#?(\d+)(?:\s+(cinetico|cinético|colagem))?/);
  if (ex) {
    const [, verb, eid, modo] = ex;
    const vidPath = join(root, 'out', `vox-${eid}-collage.mp4`);
    const vidPathK = join(root, 'out', `vox-${eid}.mp4`);
    if (verb === 'roteiro') {
      await notify(`✍️ Escrevendo o roteiro de #${eid}... (~1 min)`);
      try {
        execFileSync('node', ['scripts/vox-explainer.mjs', `--id=${eid}`, '--collage', '--dry'],
          {cwd: root, encoding: 'utf8', timeout: 10 * 60_000, env: process.env});
        await notify(formatScript(eid));
      } catch (err) {
        await notify(`❌ roteiro falhou: ${String(err.message).slice(0, 200)}`);
      }
      return;
    }
    if (verb === 'renderiza') {
      const collage = modo !== 'cinetico' && modo !== 'cinético';
      await notify(`🎬 Renderizando #${eid} (${collage ? 'colagem' : 'cinético'})... (~2 min)`);
      try {
        const args = ['scripts/vox-explainer.mjs', `--id=${eid}`];
        if (collage) args.push('--collage');
        execFileSync('node', args, {cwd: root, encoding: 'utf8', timeout: 20 * 60_000, env: process.env});
        const {loadConfig, createMediaHost} = await import(join(root, '..', 'core', 'dist', 'index.js'));
        const host = createMediaHost(loadConfig().mediaHost);
        const {url} = await host.upload(collage ? vidPath : vidPathK);
        await notify(`▶️ #${eid} pronto:\n${url}\n\nResponda "publica-reel ${eid}" pra subir, ou "roteiro ${eid}" pra refazer.`);
      } catch (err) {
        await notify(`❌ render falhou: ${String(err.message).slice(0, 200)}`);
      }
      return;
    }
    // publica-reel
    const file = existsSync(vidPath) ? vidPath : existsSync(vidPathK) ? vidPathK : null;
    if (!file) return notify(`#${eid} ainda não foi renderizado — manda "renderiza ${eid}" antes.`);
    const caption = readFileSync(join(root, 'out', `vox-${eid}.caption.txt`), 'utf8');
    const thumb = existsSync(join(root, 'out', `vox-${eid}.thumb.txt`)) ? readFileSync(join(root, 'out', `vox-${eid}.thumb.txt`), 'utf8').trim() : null;
    await notify(`📤 Publicando #${eid} no Instagram...`);
    try {
      const args = [join(root, '..', 'cli', 'dist', 'index.js'), 'post', '--to', 'instagram', '--text', caption, '--media', file];
      if (thumb) args.push('--thumb-offset', thumb);
      const out = execFileSync('node', args, {encoding: 'utf8', timeout: 30 * 60_000});
      const url = out.match(/https:\/\/www\.instagram\.com\S+/)?.[0] ?? '(sem link)';
      await notify(`✅ Reel #${eid} no ar: ${url}`);
    } catch (err) {
      await notify(`❌ publicação falhou: ${String(err.message).slice(0, 200)}`);
    }
    return;
  }

  const m = t.match(/^(publica|pula)\s+#?(\d+)/);
  if (!m) return;
  const [, verb, id] = m;
  const book = readJson(CANDS, {});
  const cand = book[id];
  if (!cand) return notify(`Não achei o candidato #${id} no livro.`);
  if (cand.status !== 'pending') return notify(`#${id} já está "${cand.status}".`);
  if (verb === 'pula') {
    cand.status = 'skipped';
    writeFileSync(CANDS, JSON.stringify(book, null, 2));
    return notify(`Ok, #${id} pulado.`);
  }
  if (!cand.best) return notify(`#${id} não tem vídeo direto — publica manualmente.`);
  const gate = checkCopy({headline: cand.headline, caption: cand.caption});
  if (!gate.ok) {
    return notify(`🚫 #${id} barrado na trava de qualidade: ${gate.motivo}. Corrija o candidato antes de publicar.`);
  }
  await notify(`Renderizando e publicando #${id}... (alguns minutos)`);
  try {
    const url = publish(cand);
    cand.status = 'published';
    cand.publishedAt = new Date().toISOString();
    writeFileSync(CANDS, JSON.stringify(book, null, 2));
    await notify(`✅ #${id} no ar: ${url}`);
    log(`#${id} publicado: ${url}`);
  } catch (err) {
    await notify(`❌ #${id} falhou: ${String(err.message).slice(0, 200)}`);
    log(`#${id} erro: ${err.message}`);
  }
}

log('escutando o Telegram...');
for (;;) {
  const offset = readJson(OFFSET, {last: 0}).last;
  let updates;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TOKEN}/getUpdates?timeout=50&offset=${offset + 1}`,
      {signal: AbortSignal.timeout(60_000)},
    );
    updates = (await res.json()).result ?? [];
  } catch {
    await new Promise((r) => setTimeout(r, 5000));
    continue;
  }
  for (const u of updates) {
    writeFileSync(OFFSET, JSON.stringify({last: u.update_id}));
    const msg = u.message;
    if (!msg || String(msg.chat?.id) !== CHAT || !msg.text) continue;
    log(`comando recebido: ${msg.text.slice(0, 60)}`);
    try {
      await handle(msg.text);
    } catch (err) {
      log(`handle falhou: ${err.message}`);
      await notify(`❌ deu ruim processando "${msg.text.slice(0, 30)}": ${String(err.message).slice(0, 120)}`);
    }
  }
}
