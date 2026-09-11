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
import {generatePoster} from './collage-posters.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// explainer voice: Raquel (conversational pt-BR) at expressive stability,
// overridable via env without touching the reporter bench
process.env.ELEVENLABS_VOICE_ID = process.env.OPENSOCIAL_VOX_VOICE_ID ?? 'GDzHdQOi6jjf8zaXhCYD';
process.env.OPENSOCIAL_TTS_STABILITY = process.env.OPENSOCIAL_TTS_STABILITY ?? '0.35';
const API = 'https://oagentico.com.br/api/v1';
const MODEL = envValue('OPENSOCIAL_WRITER_MODEL') ?? 'anthropic/claude-sonnet-5';
const FPS = 30;

const id = Number(process.argv.find((a) => a.startsWith('--id='))?.split('=')[1]);
const dry = process.argv.includes('--dry');
const collage = process.argv.includes('--collage');
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

NOME DO PRODUTO: cite o nome exato do produto/modelo da pauta pelo menos uma vez (o público precisa saber do que se fala — e o beat que o apresenta pode usar o cartão-título dele como foto).

REGISTRO DE VOZ — jornalístico SEMPRE. Repórter contando a história a um amigo inteligente: direto, falado, frases curtas, ritmo de conversa — mas ZERO gíria ("mano", "cara", "olha isso", "na cara dura" são PROIBIDOS), zero emoji, zero tom de stories. Declare em "registro" no topo do JSON:
- "sinistro" (pauta grave: armas, vigilância, vazamento, morte, crime, abuso): tensão contida, fatos secos que assustam por si, pense em documentário investigativo.
- "editorial" (todo o resto: produto, empresa, política, curiosidade, recorde): analítico e vivo, ironia fina permitida, empolgação contida — nunca infantil.
Em ambos: falado, não escrito; nunca tom de locutor de telejornal.

FORMATO: 4 a 6 beats; narração total de 40 a 65 palavras; frases curtas, ritmo de fala, pt-BR.

Cada beat: {"texto": "frase(s) do beat", "tom": "direção de voz do beat: excited | serious | curious | whispers | emphatic | dramatic", "foto": índice de uma imagem de imagensDisponiveis cuja descrição COMBINA com o texto deste beat, ou null, "destaques": ["trecho EXATO a marcar de amarelo, máx 4 palavras"], "numeroGigante": "token EXATO do texto que é número forte, ou null", "circulo": "palavra EXATA do texto pra circular à mão, ou null", "prop": "nome de um sticker do catálogo abaixo que REFORÇA o beat, ou null", "ransom": "PALAVRA-IMPACTO em caps (≤12 letras) pra aparecer em letras de recorte, ou null"}

O "tom" dirige a narração (ElevenLabs v3): varie com o arco — gancho tenso/excited, desenvolvimento serious/curious, revelação dramatic, fechamento emphatic. Use whispers com parcimônia (máx 1).

LIMITES DUROS: máx 1 numeroGigante no roteiro; máx 2 circulos; USE 1 a 2 props (mire em pelo menos 1 — beats sem foto/ransom são candidatos); máx 1 ransom (beat com ransom não leva prop); até 3 fotos — SEJA GENEROSO: pauta com imagens boas merece 2-3 beats de foto (imagem segura a atenção mais que texto); cada imagem no máximo 1 vez, e beat com foto não leva prop nem ransom.

REGRAS DE OURO DA FOTO: (1) só use se a descrição casa com o texto do beat — sem foto > foto errada; (2) logo/título do PRÓPRIO produto ou empresa da pauta pode ilustrar o beat que o apresenta pelo nome; logo de qualquer OUTRA marca nunca entra (foi assim que já erramos uma vez).

CATÁLOGO DE PROPS (nome: conceitos):
${menu}

${collage ? `MODO COLAGEM: cada beat ganha também "poster": {"cena": "3-5 peças recortadas descritas em inglês, cada uma um objeto/figura concreto (ex.: 'a halftone cutout of a scientist in a lab coat, a torn newspaper strip, a virus illustration, a red stamp'), SEM texto na cena", "manchete": "1-3 palavras em CAPS pt-BR que resumem o beat (vai impressa no pôster)", "bg": "cream|ink|yellow — varie entre beats, ink pro momento mais pesado"}. Nesse modo NÃO use foto nem prop (o pôster é a imagem).` : ''}

caption: legenda do post (gancho + 2-3 linhas + "Siga @oagentico" + 4 hashtags). SEM emoji.

Responda SÓ JSON:
{"registro": "sinistro|editorial", "beats": [{"texto": "...", "tom": "...", ${collage ? '"poster": {"cena": "...", "manchete": "...", "bg": "..."}, ' : ''}...}], "caption": "..."}${collage ? '\nOBRIGATÓRIO no modo colagem: TODO beat tem "poster" preenchido.' : ''}`;

// all candidate images, vision-described: the writer may stage a photo
// ONLY on a beat whose text matches the description (wrong photo under
// the wrong sentence is the one unforgivable edit)
const imgSeen = new Set();
const imgCands = [];
for (const cand of [
  detail.imagem?.url ? {url: detail.imagem.url, fonte: detail.imagem.fonte ?? 'divulgação'} : null,
  ...(detail.artigos ?? []).map((a) => (a.imageUrl ? {url: a.imageUrl, fonte: a.sourceName ?? 'divulgação'} : null)),
].filter(Boolean)) {
  if (imgSeen.has(cand.url) || imgCands.length >= 6) continue;
  imgSeen.add(cand.url);
  imgCands.push(cand);
}
const imagens = [];
for (const [i, cand] of imgCands.entries()) {
  try {
    const small = await sharp(Buffer.from(await (await fetch(cand.url)).arrayBuffer())).resize(384, 384, {fit: 'inside'}).jpeg({quality: 75}).toBuffer();
    const vtext = await chatCompletion({
      model: 'google/gemini-2.5-flash-lite',
      max_tokens: 200,
      messages: [{role: 'user', content: [
        {type: 'text', text: 'Descreva a imagem em 1 frase objetiva (o que/quem aparece, marcas visíveis). Responda SÓ JSON: {"descricao": "..."}'},
        {type: 'image_url', image_url: {url: 'data:image/jpeg;base64,' + small.toString('base64')}},
      ]}],
    });
    imagens.push({...cand, indice: i, descricao: parseJsonBlock(vtext).descricao ?? '(sem descrição)'});
    log(`imagem ${i}: ${imagens.at(-1).descricao.slice(0, 70)}`);
  } catch {}
}

const synthesis = {titulo: detail.title, resumo: detail.summary, fatos: (detail.claims ?? []).map((c) => c.texto).slice(0, 8), imagensDisponiveis: imagens.map((m) => ({indice: m.indice, descricao: m.descricao}))};

let script = null;
for (let attempt = 1; attempt <= 2 && !script; attempt++) {
  try {
    const text = await chatCompletion({
      model: MODEL,
      max_tokens: 8192,
      messages: [
        {role: 'system', content: PROMPT},
        {role: 'user', content: JSON.stringify(synthesis)},
      ],
    });
    globalThis.__lastRaw = text;
    writeFileSync(join(root, 'out', `vox-${id}.raw.txt`), text);
    writeFileSync(join(root, 'out', `vox-${id}.prompt.txt`), PROMPT);
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
    if (globalThis.__lastRaw) writeFileSync(join(root, 'out', `vox-${id}.raw-${attempt}.txt`), globalThis.__lastRaw);
  }
}
if (!script) throw new Error('sem roteiro válido');
log(`roteiro: ${script.beats.length} beats (${MODEL})`);

// download only the images the writer actually staged
mkdirSync(join(root, 'public', 'vox'), {recursive: true});
const fotoByIndice = new Map();
const usedIdx = new Set();
for (const b of script.beats) {
  const idx = Number.isInteger(b.foto) ? b.foto : null;
  b.foto = null;
  if (idx == null || !imagens[idx] || usedIdx.has(idx) || usedIdx.size >= 3) continue;
  if (/logotipo|logomarca|\blogo\b|letreiro|wordmark/i.test(imagens[idx].descricao)) {
    // a logo image may only illustrate a beat that names what the logo IS:
    // some capitalized token from the description must appear in the text
    const nomes = (imagens[idx].descricao.match(/[A-Z][\w]+/g) ?? []).filter((n) => n.length > 3);
    if (!nomes.some((n) => b.texto.includes(n))) continue;
  }
  usedIdx.add(idx);
  const img = imagens[idx];
  const rel = `vox/hero-${id}-${idx}.jpg`;
  const buf = Buffer.from(await (await fetch(img.url)).arrayBuffer());
  await sharp(buf).resize(1200, 900, {fit: 'cover'}).jpeg({quality: 88}).toFile(join(root, 'public', rel));
  fotoByIndice.set(idx, {rel, fonte: img.fonte});
  b.foto = idx;
}

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

// collage mode: one poster per beat (cached by prompt hash). Skipped on
// --dry: the approval gate must cost nothing beyond the script itself.
const posterByBeat = new Map();
if (collage && !dry) {
  for (const [i, b] of script.beats.entries()) {
    if (!b.poster?.cena) continue;
    try {
      const rel = await generatePoster(id, i, {scene: b.poster.cena, headline: b.poster.manchete, bg: b.poster.bg});
      posterByBeat.set(i, rel);
      log(`pôster ${i + 1}: "${b.poster.manchete}" (${b.poster.bg})`);
    } catch (err) {
      log(`pôster ${i + 1} falhou: ${String(err).slice(0, 60)}`);
    }
    b.foto = null; b.prop = null; // poster owns the frame
  }
}

// beats → component segments (prop placement alternates free corners)
let propCount = 0;
const segments = script.beats.map((b, bi) => {
  const seg = {
    poster: posterByBeat.get(bi) ?? null,
    text: b.texto,
    highlights: (b.destaques ?? []).slice(0, 2),
    big: b.numeroGigante ?? null,
    circle: b.circulo ?? null,
    arrow: b.foto != null,
    entity: null,
    prop: null,
    ransom: b.ransom ? String(b.ransom).toUpperCase().slice(0, 12) : null,
    image: b.foto != null ? fotoByIndice.get(b.foto).rel : null,
    credit: b.foto != null ? fotoByIndice.get(b.foto).fonte : null,
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

// narration: real TTS when the quota allows, synthetic timing otherwise.
// v3 audio tags carry the per-beat voice direction; they are consumed by
// the model, and their tokens are filtered out of the word timeline so
// beat slicing by word count stays exact.
const TOM_OK = new Set(['excited', 'serious', 'curious', 'whispers', 'emphatic', 'dramatic']);
const NARRATION = script.beats.map((b) => b.texto).join(' ');
const TAGGED = script.beats
  .map((b) => (TOM_OK.has(b.tom) ? `[${b.tom}] ` : '') + b.texto)
  .join(' ') + ' [serious] Isso foi o agêntico. Siga pra acompanhar.';
let clip;
try {
  if (dry) throw new Error('dry run: sem TTS');
  clip = await narrateContinuous(id, TAGGED, envValue('ELEVENLABS_API_KEY'));
  clip.words = clip.words.filter((w) => !/^\[.+\]$/.test(w.text));
  log('narração: ElevenLabs v3 dirigida (timing por palavra)');
} catch (err) {
  log(`tts indisponível (${String(err).slice(0, 60)}) — timing sintético, sem áudio`);
  const tokens = NARRATION.split(/\s+/).filter(Boolean);
  const WPS = 2.8;
  const words = tokens.map((text, i) => ({text, start: i / WPS + 0.4, end: (i + 1) / WPS + 0.3}));
  clip = {src: 'none', words, durationInFrames: Math.ceil((words.at(-1).end + 0.8) * FPS)};
}

// music bed picked by the script's dominant voice direction
const toms = script.beats.map((b) => b.tom);
const musicSrc = script.registro === 'sinistro' || toms.filter((t) => ['dramatic', 'serious', 'whispers'].includes(t)).length >= toms.length / 2
  ? 'trilhas/tensa.mp3'
  : toms.includes('excited') ? 'trilhas/curiosa.mp3' : 'trilhas/leve.mp3';
log(`registro: ${script.registro ?? '?'}`);
log(`trilha: ${musicSrc}`);

const props = {
  brand: 'o agêntico',
  handle: '@oagentico',
  audioSrc: clip.src,
  musicSrc,
  durationInFrames: clip.durationInFrames + 45,
  words: clip.words,
  segments,
};
mkdirSync(join(root, 'out'), {recursive: true});
const suffix = collage ? '-collage' : '';
const propsPath = join(root, 'out', `vox-${id}${suffix}.props.json`);
writeFileSync(propsPath, JSON.stringify(props, null, 2));
writeFileSync(join(root, 'out', `vox-${id}.caption.txt`), script.caption);

// hero moment for the reel cover (thumb_offset): the big-number word if
// there is one, else the ransom beat, else the photo beat, else 40% in
const heroMs = (() => {
  const segStarts = (pred) => {
    const i = segments.findIndex(pred);
    if (i < 0) return null;
    const count = segments.slice(0, i + 1).map((sg) => sg.text.split(/\s+/).filter(Boolean).length).reduce((a, b) => a + b, 0);
    return clip.words[Math.min(count - 1, clip.words.length - 1)]?.end ?? null;
  };
  const bigSeg = segStarts((sg) => sg.big);
  if (bigSeg != null) return Math.round(bigSeg * 1000);
  const ransomSeg = segStarts((sg) => sg.ransom);
  if (ransomSeg != null) return Math.round(ransomSeg * 1000);
  const photoSeg = segStarts((sg) => sg.image);
  if (photoSeg != null) return Math.round(photoSeg * 1000);
  return Math.round((clip.durationInFrames / FPS) * 0.4 * 1000);
})();
writeFileSync(join(root, 'out', `vox-${id}.thumb.txt`), String(heroMs));
log(`capa (thumb_offset): ${heroMs}ms`);

if (dry) {
  log(`--dry: props em ${propsPath}`);
  process.exit(0);
}
log('renderizando...');
execFileSync('npx', [
  'remotion', 'render', 'VoxExplainer', join(root, 'out', `vox-${id}${suffix}.mp4`),
  `--props=${propsPath}`, '--codec=h264', '--timeout=120000',
], {cwd: root, stdio: 'inherit'});
log(`pronto: out/vox-${id}${suffix}.mp4 (caption em out/vox-${id}.caption.txt)`);
