// Vox explainer generator: event synthesis → LLM beat script (PAS arc,
// element picks from the prop catalog) → narration (word-timed TTS when
// quota allows, synthetic timing otherwise) → Remotion render.
// Usage: node scripts/vox-explainer.mjs --id=<eventId> [--dry]
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {envValue, narrateContinuous} from './tts.mjs';
import {chatCompletion, parseJsonBlock} from './llm.mjs';
import {checkCopy} from './copy-check.mjs';
import {visualEntities} from './entities.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://oagentico.com.br/api/v1';
const MODEL = envValue('OPENSOCIAL_WRITER_MODEL') ?? 'anthropic/claude-sonnet-5';
const FPS = 30;

const id = Number(process.argv.find((a) => a.startsWith('--id='))?.split('=')[1]);
const dry = process.argv.includes('--dry');
if (!id) throw new Error('use --id=<eventId>');
const log = (m) => console.log(`[vox ${new Date().toISOString()}] ${m}`);

const token = envValue('OAGENTICO_TOKEN');
const detail = (await (await fetch(`${API}/eventos/${id}`, {headers: {Authorization: `Bearer ${token}`}})).json()).dados;
if (!detail?.title && !detail?.summary) throw new Error(`evento ${id} sem conteúdo`);

// prop menu for the writer: name + concepts, from the curated catalog
const catalog = JSON.parse(readFileSync(join(root, 'public', 'acervo', 'catalog.json'), 'utf8'));
const byName = new Map(catalog.map((c) => [c.nome, c]));
const menu = catalog.map((c) => `${c.nome}: ${(c.conceitos ?? []).join(', ')}`).join('\n');

const PROMPT = `Você roteiriza um reel explainer (estilo Vox) do "o agêntico", veículo brasileiro de notícias de IA/tech. Converta a síntese em BEATS de narração com elementos visuais.

AS 4 LEIS: arco PAS (beat 1 = TENSÃO, o fato mais surpreendente — nunca o título reescrito); cada beat acrescenta fato NOVO; números amarrados ao significado; escolha UMA emoção dominante e escreva nela. Clichês banidos: "o futuro está em jogo", "marco histórico", "divisor de águas".

FORMATO: 4 a 6 beats; narração total de 40 a 65 palavras; frases curtas, ritmo de fala, pt-BR.

Cada beat: {"texto": "frase(s) do beat", "destaques": ["trecho EXATO a marcar de amarelo, máx 4 palavras"], "numeroGigante": "token EXATO do texto que é número forte, ou null", "circulo": "palavra EXATA do texto pra circular à mão, ou null", "foto": true se este beat deve mostrar a foto da notícia, "prop": "nome de um sticker do catálogo abaixo que REFORÇA o beat, ou null", "ransom": "PALAVRA-IMPACTO em caps (≤12 letras) pra aparecer em letras de recorte, ou null"}

LIMITES DUROS: máx 1 numeroGigante no roteiro; máx 2 circulos; máx 2 props (só quando reforçam de verdade); máx 1 ransom; máx 1 foto (e beat com foto não leva prop nem ransom).

CATÁLOGO DE PROPS (nome: conceitos):
${menu}

caption: legenda do post (gancho + 2-3 linhas + "Siga @oagentico" + 4 hashtags).

Responda SÓ JSON:
{"beats": [...], "caption": "..."}`;

const synthesis = {titulo: detail.title, resumo: detail.summary, fatos: (detail.claims ?? []).map((c) => c.texto).slice(0, 8)};

let script = null;
for (let attempt = 1; attempt <= 2 && !script; attempt++) {
  try {
    const text = await chatCompletion({
      model: MODEL,
      max_tokens: 4096,
      messages: [
        {role: 'system', content: PROMPT},
        {role: 'user', content: JSON.stringify(synthesis)},
      ],
    });
    const out = parseJsonBlock(text);
    if (!Array.isArray(out.beats) || out.beats.length < 3) throw new Error('beats insuficientes');
    const words = out.beats.map((b) => b.texto).join(' ').split(/\s+/).filter(Boolean);
    if (words.length < 30 || words.length > 80) throw new Error(`narração com ${words.length} palavras`);
    const gate = checkCopy({headline: out.beats[0].texto.slice(0, 100), caption: out.caption});
    if (!gate.ok) throw new Error(`trava de qualidade: ${gate.motivo}`);
    for (const b of out.beats) {
      if (b.prop && !byName.has(b.prop)) b.prop = null; // pick inexistente: descarta
      for (const key of ['numeroGigante', 'circulo']) {
        if (b[key] && !b.texto.includes(b[key])) b[key] = null;
      }
    }
    script = out;
  } catch (err) {
    log(`roteiro inválido (${String(err).slice(0, 90)}) — tentativa ${attempt}`);
  }
}
if (!script) throw new Error('sem roteiro válido');
log(`roteiro: ${script.beats.length} beats (${MODEL})`);

// hero image (photo beat) — landscape-safe, local for staticFile
mkdirSync(join(root, 'public', 'vox'), {recursive: true});
const heroUrl = detail.imagem?.url ?? detail.artigos?.find((a) => a.imageUrl)?.imageUrl ?? null;
let heroRel = null;
if (heroUrl && script.beats.some((b) => b.foto)) {
  const buf = Buffer.from(await (await fetch(heroUrl)).arrayBuffer());
  heroRel = `vox/hero-${id}.jpg`;
  await sharp(buf).resize(1200, 900, {fit: 'cover'}).jpeg({quality: 88}).toFile(join(root, 'public', heroRel));
} else {
  for (const b of script.beats) b.foto = false; // sem imagem, sem beat de foto
}
const heroCredit = detail.imagem?.fonte ?? detail.artigos?.find((a) => a.imageUrl)?.sourceName ?? 'divulgação';

// entity sticker: the event's anchor company, logo from the entity bank
let entity = null;
const anchor = visualEntities(detail)[0];
if (anchor?.tipo === 'empresa' && anchor.imagem?.url) {
  try {
    const buf = Buffer.from(await (await fetch(anchor.imagem.url)).arrayBuffer());
    const meta = await sharp(buf).metadata();
    const ratio = meta.width / meta.height;
    const logoH = ratio > 1.6 ? 30 : 44;
    const logoW = Math.min(190, Math.round(logoH * ratio));
    const rel = `vox/logo-${anchor.slug}.png`;
    await sharp(buf).resize(logoW * 3, logoH * 3, {fit: 'inside'}).png().toFile(join(root, 'public', rel));
    entity = {nome: anchor.nome, logo: rel, logoW, logoH};
  } catch {}
} else if (anchor?.tipo === 'empresa') {
  entity = {nome: anchor.nome, logo: null};
}

// beats → component segments (prop placement alternates free corners)
let propCount = 0;
const segments = script.beats.map((b) => {
  const seg = {
    text: b.texto,
    highlights: (b.destaques ?? []).slice(0, 2),
    big: b.numeroGigante ?? null,
    circle: b.circulo ?? null,
    arrow: Boolean(b.foto),
    entity: null,
    prop: null,
    ransom: b.ransom ? String(b.ransom).toUpperCase().slice(0, 12) : null,
    image: b.foto ? heroRel : null,
    credit: b.foto ? heroCredit : null,
  };
  if (b.prop && !b.foto && !b.ransom) {
    const alto = propCount % 2 === 0;
    seg.prop = {src: `acervo/${byName.get(b.prop).arquivo}`, x: alto ? 620 : 600, y: alto ? 290 : 1180, w: 370, rot: alto ? 6 : -6};
    propCount += 1;
  }
  return seg;
});
// entity sticker lands on the first beat that names the company (else beat 2)
if (entity) {
  const idx = script.beats.findIndex((b) => b.texto.toLowerCase().includes(entity.nome.toLowerCase()));
  segments[idx >= 0 ? idx : Math.min(1, segments.length - 1)].entity = entity;
}

// narration: real TTS when the quota allows, synthetic timing otherwise
const NARRATION = script.beats.map((b) => b.texto).join(' ');
let clip;
try {
  clip = await narrateContinuous(id, NARRATION, envValue('ELEVENLABS_API_KEY'));
  log('narração: ElevenLabs (timing por palavra)');
} catch (err) {
  log(`tts indisponível (${String(err).slice(0, 60)}) — timing sintético, sem áudio`);
  const tokens = NARRATION.split(/\s+/).filter(Boolean);
  const WPS = 2.8;
  const words = tokens.map((text, i) => ({text, start: i / WPS + 0.4, end: (i + 1) / WPS + 0.3}));
  clip = {src: 'none', words, durationInFrames: Math.ceil((words.at(-1).end + 0.8) * FPS)};
}

const props = {
  brand: 'o agêntico',
  handle: '@oagentico',
  audioSrc: clip.src,
  durationInFrames: clip.durationInFrames + 45,
  words: clip.words,
  segments,
};
mkdirSync(join(root, 'out'), {recursive: true});
const propsPath = join(root, 'out', `vox-${id}.props.json`);
writeFileSync(propsPath, JSON.stringify(props, null, 2));
writeFileSync(join(root, 'out', `vox-${id}.caption.txt`), script.caption);

if (dry) {
  log(`--dry: props em ${propsPath}`);
  process.exit(0);
}
log('renderizando...');
execFileSync('npx', [
  'remotion', 'render', 'VoxExplainer', join(root, 'out', `vox-${id}.mp4`),
  `--props=${propsPath}`, '--codec=h264', '--timeout=120000',
], {cwd: root, stdio: 'inherit'});
log(`pronto: out/vox-${id}.mp4 (caption em out/vox-${id}.caption.txt)`);
