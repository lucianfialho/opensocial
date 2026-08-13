// Builds an Instagram carousel (1080x1350 PhotoCard stills) from the top
// story of the week: cover with the headline, one card per summary
// sentence, and a CTA card.
//
// Usage: node scripts/news-carousel.mjs [--index=0]
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {splitSentences} from './build-props.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://oagentico.com.br/api/v1';

let token = process.env.OAGENTICO_TOKEN;
if (!token && existsSync(join(root, '.env'))) {
  token = readFileSync(join(root, '.env'), 'utf8').match(/OAGENTICO_TOKEN=(.+)/)?.[1]?.trim();
}
if (!token) {
  console.error('Set OAGENTICO_TOKEN or put it in packages/video/.env');
  process.exit(1);
}

const index = Number(
  process.argv.find((a) => a.startsWith('--index='))?.split('=')[1] ?? '0',
);

const get = async (path) => {
  const res = await fetch(`${API}${path}`, {headers: {Authorization: `Bearer ${token}`}});
  if (!res.ok) {
    console.error(`API respondeu ${res.status} em ${path}`);
    process.exit(1);
  }
  return res.json();
};

const {dados: week} = await get('/eventos/semana');
const story = week[index];
const {dados: detail} = await get(`/eventos/${story.id}`);

const hero = story.imagem?.url
  ? {url: story.imagem.url, credit: `Foto: ${story.imagem.fonte}`}
  : null;
const articleImages = (detail.artigos ?? [])
  .filter((a) => a.imageUrl && a.imageUrl !== hero?.url)
  .map((a) => ({url: a.imageUrl, credit: `Foto: ${a.sourceName}`}));

const base = {brand: 'o agêntico', handle: '@oagentico'};
const sentences = splitSentences(detail.summary ?? '').slice(0, 3);

mkdirSync(join(root, 'out', 'carousel'), {recursive: true});

const drafts = [
  {...base, kicker: 'IA & Tech', headline: story.title, image: hero, variant: 'title'},
  ...sentences.map((sentence, i) => ({
    ...base,
    kicker: `Em resumo · ${i + 1}/${sentences.length}`,
    headline: sentence,
    image: articleImages[i % Math.max(articleImages.length, 1)] ?? null,
    variant: 'body',
  })),
  {...base, kicker: 'o futuro da IA, todo dia, num clique', headline: '@oagentico', image: hero, variant: 'cta'},
];
// Full-bleed cover everywhere (the editorial look); 'contain' stays available
// in the PhotoCard schema for manual use on text-heavy banner art.
const cards = drafts.map((draft) => ({...draft, fit: 'cover'}));

const files = [];
cards.forEach((card, i) => {
  // JPEG: the Instagram API only officially ingests JPEG images.
  const output = join('out', 'carousel', `news-${story.id}-slide-${i + 1}.jpg`);
  console.log(`rendering ${output}`);
  execFileSync(
    'npx',
    ['remotion', 'still', 'PhotoCard', output, '--image-format=jpeg', `--props=${JSON.stringify(card)}`],
    {cwd: root, stdio: 'inherit'},
  );
  files.push(`packages/video/${output}`);
});

console.log(`\n${cards.length} cards prontos.`);
console.log(`Publicar: opensocial post --to instagram --text "${story.title}" --media ${files.join(' ')}`);
