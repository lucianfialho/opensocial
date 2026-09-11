// Instagram carousel builder (1080x1350 PhotoCard stills, JPEG).
// Modes:
//   resumo (default): cover + one card per summary sentence + CTA
//   claims: cover + 4 claim cards (chunk N of the event's claims) + CTA
//
// Usage: node scripts/news-carousel.mjs [--id=N | --index=0] [--mode=resumo|claims] [--chunk=0]
// Writes slides + caption + manifest to out/carousel/.
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {splitSentences} from './build-props.mjs';
import {envValue} from './tts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://oagentico.com.br/api/v1';
const CLAIMS_PER_CAROUSEL = 4;

const token = envValue('OAGENTICO_TOKEN');
if (!token) throw new Error('OAGENTICO_TOKEN missing');

const args = process.argv.slice(2);
const flag = (name, fallback) =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const mode = flag('mode', 'resumo');
const chunk = Number(flag('chunk', '0'));
const wantedId = flag('id', null);
const index = Number(flag('index', '0'));

const get = async (path) => {
  const res = await fetch(`${API}${path}`, {headers: {Authorization: `Bearer ${token}`}});
  if (!res.ok) throw new Error(`API ${res.status} em ${path}`);
  return res.json();
};

let story;
if (wantedId) {
  const {dados} = await get('/eventos?limite=100');
  story = dados.find((e) => String(e.id) === wantedId);
  if (!story) throw new Error(`Evento ${wantedId} não encontrado`);
} else {
  story = (await get('/eventos/semana')).dados[index];
}
const {dados: detail} = await get(`/eventos/${story.id}`);

const hero = story.imagem?.url
  ? {url: story.imagem.url, credit: `Foto: ${story.imagem.fonte}`}
  : null;
const articleById = new Map((detail.artigos ?? []).map((a) => [a.id, a]));
// Distinct images only, consumed at most once each: a 2-article event
// yields clean no-photo cards instead of the same photo three times.
const seenUrls = new Set(hero?.url ? [hero.url] : []);
const articleImages = (detail.artigos ?? [])
  .filter((a) => a.imageUrl && !seenUrls.has(a.imageUrl) && seenUrls.add(a.imageUrl))
  .map((a) => ({url: a.imageUrl, credit: `Foto: ${a.sourceName}`}));

const base = {brand: 'o agêntico', handle: '@oagentico'};
// brand card: no news photo — avoids guaranteed hero repetition
const cta = {...base, kicker: 'o futuro da IA, todo dia, num clique', headline: '@oagentico', image: null, variant: 'cta'};
const CTA_LINE = 'Siga @oagentico — o futuro da IA, todo dia, num clique.';
const TAGS = '#inteligenciaartificial #ia #tecnologia #noticias';

let middleCards;
let caption;
let coverOverride = null;
if (mode === 'claims') {
  const claims = (detail.claims ?? [])
    .slice()
    .sort((a, b) => (b.articleIds?.length ?? 0) - (a.articleIds?.length ?? 0))
    .slice(chunk * CLAIMS_PER_CAROUSEL, (chunk + 1) * CLAIMS_PER_CAROUSEL);
  if (claims.length === 0) throw new Error(`Sem claims no chunk ${chunk}`);
  const usedByClaims = new Set(hero?.url ? [hero.url] : []);
  middleCards = claims.map((c, i) => {
    // first article image not shown yet in this carousel; none → clean card
    const article = (c.articleIds ?? [])
      .map((id) => articleById.get(id))
      .find((a) => a?.imageUrl && !usedByClaims.has(a.imageUrl));
    if (article) usedByClaims.add(article.imageUrl);
    return {
      ...base,
      kicker: `O fato · ${chunk * CLAIMS_PER_CAROUSEL + i + 1}`,
      headline: c.texto,
      image: article ? {url: article.imageUrl, credit: `Foto: ${article.sourceName}`} : null,
      variant: 'body',
    };
  });
  caption = [
    `${story.title} — os fatos, um a um.`,
    '',
    ...claims.map((c) => `• ${c.texto}`),
    '',
    `Apuração: ${story.independentSources} veículos independentes.`,
    '',
    CTA_LINE,
    '',
    TAGS,
  ].join('\n');
} else {
  // LLM scriptwriter, and ONLY the scriptwriter: the mechanical fallback
  // published walls of overflowing text during gateway outages — an ugly
  // post costs more than a missing one, so no script means no carousel
  const {writeCarouselScript} = await import('./carousel-writer.mjs');
  const script = await writeCarouselScript(story, detail, articleImages);
  if (!script) {
    throw new Error('sem roteiro LLM (gateway fora?) — carrossel não sai no modo mecânico');
  }
  // collage posters: cover always, photo cards when the writer asked for one
  const {generatePoster} = await import('./collage-posters.mjs');
  const posterFor = new Map();
  const posterImage = async (key, spec) => {
    const rel = await generatePoster(`carousel-${story.id}`, key, {scene: spec.cena, headline: null, bg: spec.bg});
    return {url: `local:${join(root, 'public', rel)}`, credit: 'Foto: ilustração o agêntico'};
  };
  let coverPoster = null;
  if (script.cover?.poster?.cena) {
    try { coverPoster = await posterImage('cover', script.cover.poster); console.log('pôster: capa'); }
    catch (err) { console.error(`pôster capa falhou: ${String(err).slice(0, 60)}`); }
  }
  for (const [i, c] of script.cards.entries()) {
    if (c.style !== 'photo' || !c.poster?.cena) continue;
    if (Number.isInteger(c.imageIndex) && articleImages[c.imageIndex]) continue; // real photo wins
    try { posterFor.set(c, await posterImage(`card${i}`, c.poster)); console.log(`pôster: card ${i + 1}`); }
    catch (err) { console.error(`pôster card ${i + 1} falhou: ${String(err).slice(0, 60)}`); }
  }
  if (script) {
    const usedImages = new Set();
    let essayCount = 0;
    const clean = (t) => (t ?? '').replaceAll('**', '');
    middleCards = script.cards.map((c) => {
      const common = {...base, kicker: clean(c.kicker), headline: clean(c.headline), highlights: c.accent ? [clean(c.accent)] : []};
      if (c.style === 'essay') {
        essayCount += 1;
        return {
          ...common,
          variant: 'essay',
          paragraphs: (c.paragraphs ?? []).map(clean),
          closer: clean(c.closer) || undefined,
          numeral: String(essayCount + 1),
          image: null,
        };
      }
      // photo cards carry the writer's image pick (vision-screened); a card
      // without a valid, unused pick degrades to a clean text card
      if (c.style === 'photo' && Number.isInteger(c.imageIndex) && articleImages[c.imageIndex] && !usedImages.has(c.imageIndex)) {
        usedImages.add(c.imageIndex);
        return {...common, variant: 'body', image: articleImages[c.imageIndex]};
      }
      if (c.style === 'photo' && c.poster?.cena && posterFor.has(c)) {
        return {...common, variant: 'body', image: posterFor.get(c)};
      }
      // cream: any body text the writer produced becomes the context intro
      const intro = clean(c.intro) || (c.paragraphs ?? []).map(clean).join(' ');
      return {...common, variant: 'body', intro: intro || undefined, image: null};
    });
    caption = script.caption;
    coverOverride = {
      headline: script.cover.headline,
      highlights: script.cover.accent ? [script.cover.accent] : [],
      subtitle: script.cover.subtitle,
      ...(coverPoster ? {image: coverPoster} : {}),
    };
  } else {
    const sentences = splitSentences(detail.summary ?? '').slice(0, 3);
    const leftovers = splitSentences(detail.summary ?? '').slice(3).join(' ');
    let introUsed = false;
    middleCards = sentences.map((sentence, i) => {
      const image = articleImages[i] ?? null;
      const intro = !image && !introUsed && leftovers ? ((introUsed = true), leftovers) : undefined;
      return {
        ...base,
        kicker: `Em resumo · ${i + 1}/${sentences.length}`,
        headline: sentence,
        image,
        intro,
        variant: 'body',
      };
    });
    caption = [
      story.title,
      '',
      detail.summary ?? '',
      '',
      `Apuração: ${story.independentSources} veículos independentes.`,
      '',
      CTA_LINE,
      '',
      TAGS,
    ].join('\n');
  }
}

const cover = {
  ...base,
  kicker: mode === 'claims' ? `Os fatos · parte ${chunk + 1}` : 'IA & Tech',
  headline: story.title,
  image: hero,
  variant: 'title',
  ...(coverOverride ?? {}),
};
const cards = [cover, ...middleCards, cta].map((c, i, arr) => ({...c, fit: 'cover', page: `${i + 1}/${arr.length}`}));

mkdirSync(join(root, 'out', 'carousel'), {recursive: true});
const slug = `news-${story.id}-${mode}${mode === 'claims' ? chunk : ''}`;
// satori engine: JSON -> SVG -> sRGB baseline JPEG. No Chrome involved.
const {renderCard} = await import('./card-engine.mjs');
const files = [];
for (const [i, card] of cards.entries()) {
  const output = join(root, 'out', 'carousel', `${slug}-slide-${i + 1}.jpg`);
  console.log(`rendering slide ${i + 1}/${cards.length}`);
  await renderCard(card, output);
  files.push(output);
}

const captionFile = join(root, 'out', 'carousel', `${slug}.caption.txt`);
writeFileSync(captionFile, caption);
const manifest = {files, captionFile, eventId: story.id, mode, chunk};
writeFileSync(join(root, 'out', 'carousel', `${slug}.manifest.json`), JSON.stringify(manifest, null, 2));
console.log(`\n${cards.length} cards prontos — manifest: out/carousel/${slug}.manifest.json`);
