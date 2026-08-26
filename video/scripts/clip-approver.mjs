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
