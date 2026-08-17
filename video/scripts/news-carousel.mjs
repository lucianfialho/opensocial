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
const articleImages = (detail.artigos ?? [])
  .filter((a) => a.imageUrl && a.imageUrl !== hero?.url)
  .map((a) => ({url: a.imageUrl, credit: `Foto: ${a.sourceName}`}));

const base = {brand: 'o agêntico', handle: '@oagentico'};
const cta = {...base, kicker: 'o futuro da IA, todo dia, num clique', headline: '@oagentico', image: hero, variant: 'cta'};
const CTA_LINE = 'Siga @oagentico — o futuro da IA, todo dia, num clique.';
const TAGS = '#inteligenciaartificial #ia #tecnologia #noticias';

let middleCards;
let caption;
if (mode === 'claims') {
  const claims = (detail.claims ?? [])
    .slice()
    .sort((a, b) => (b.articleIds?.length ?? 0) - (a.articleIds?.length ?? 0))
    .slice(chunk * CLAIMS_PER_CAROUSEL, (chunk + 1) * CLAIMS_PER_CAROUSEL);
  if (claims.length === 0) throw new Error(`Sem claims no chunk ${chunk}`);
  middleCards = claims.map((c, i) => {
    const article = (c.articleIds ?? []).map((id) => articleById.get(id)).find((a) => a?.imageUrl);
    return {
      ...base,
      kicker: `O fato · ${chunk * CLAIMS_PER_CAROUSEL + i + 1}`,
      headline: c.texto,
      image: article ? {url: article.imageUrl, credit: `Foto: ${article.sourceName}`} : hero,
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
  const sentences = splitSentences(detail.summary ?? '').slice(0, 3);
  middleCards = sentences.map((sentence, i) => ({
    ...base,
    kicker: `Em resumo · ${i + 1}/${sentences.length}`,
    headline: sentence,
    image: articleImages[i % Math.max(articleImages.length, 1)] ?? null,
    variant: 'body',
  }));
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

const cover = {...base, kicker: mode === 'claims' ? `Os fatos · parte ${chunk + 1}` : 'IA & Tech', headline: story.title, image: hero, variant: 'title'};
const cards = [cover, ...middleCards, cta].map((c) => ({...c, fit: 'cover'}));

mkdirSync(join(root, 'out', 'carousel'), {recursive: true});
const slug = `news-${story.id}-${mode}${mode === 'claims' ? chunk : ''}`;
const files = [];
cards.forEach((card, i) => {
  const output = join('out', 'carousel', `${slug}-slide-${i + 1}.jpg`);
  console.log(`rendering ${output}`);
  // REMOTION_BROWSER_EXECUTABLE: reuse a pre-installed chrome-headless-shell
  // instead of letting Remotion download its own (saves 193MB on servers).
  const browserArgs = process.env.REMOTION_BROWSER_EXECUTABLE
    ? [`--browser-executable=${process.env.REMOTION_BROWSER_EXECUTABLE}`]
    : [];
  execFileSync('npx', ['remotion', 'still', 'PhotoCard', output, '--image-format=jpeg', '--timeout=120000', ...browserArgs, `--props=${JSON.stringify(card)}`], {cwd: root, stdio: 'inherit'});
  files.push(join(root, output));
});

// Normalize every card to a bog-standard sRGB baseline JPEG — Chrome's
// screenshot JPEGs (bt470bg, no ICC) are suspected of tripping Instagram's
// image ingestion (2207032 at publish).
for (const file of files) {
  const normalized = await sharp(file).withMetadata().jpeg({quality: 90, mozjpeg: true}).toBuffer();
  writeFileSync(file, normalized);
}
console.log('cards normalizados (sRGB baseline JPEG via sharp)');

const captionFile = join(root, 'out', 'carousel', `${slug}.caption.txt`);
writeFileSync(captionFile, caption);
const manifest = {files, captionFile, eventId: story.id, mode, chunk};
writeFileSync(join(root, 'out', 'carousel', `${slug}.manifest.json`), JSON.stringify(manifest, null, 2));
console.log(`\n${cards.length} cards prontos — manifest: out/carousel/${slug}.manifest.json`);
