// Split-screen reel: editorial card on top, the o agêntico reporter
// lip-syncing the narration below. Usage:
//   node scripts/news-split.mjs [--id=1709 | --index=0]
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildReelProps} from './build-props.mjs';
import {pickHighlights} from './pick-highlights.mjs';
import {personaClip} from './magnific.mjs';

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

const args = process.argv.slice(2);
const flag = (name, fallback) =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;

const get = async (path) => {
  const res = await fetch(`${API}${path}`, {headers: {Authorization: `Bearer ${token}`}});
  if (!res.ok) {
    console.error(`API respondeu ${res.status} em ${path}: ${await res.text()}`);
    process.exit(1);
  }
  return res.json();
};

const wantedId = flag('id', null);
let story;
if (wantedId) {
  const {dados: recent} = await get('/eventos?limite=100');
  story = recent.find((e) => String(e.id) === wantedId);
} else {
  const {dados: week} = await get('/eventos/semana');
  story = week[Number(flag('index', '0'))];
}
if (!story) {
  console.error('Notícia não encontrada.');
  process.exit(1);
}

const {dados: detail} = await get(`/eventos/${story.id}`);
const highlights = pickHighlights(story.title, detail.claims ?? []);
const reelProps = buildReelProps({story, detail, highlights, mode: 'resumo'});

const {narrateContinuous, sentenceCuts, envValue, reporterFor} = await import('./tts.mjs');
const elevenKey = envValue('ELEVENLABS_API_KEY');
if (!elevenKey) {
  console.error('NewsSplit precisa de narração: configure ELEVENLABS_API_KEY.');
  process.exit(1);
}
const hookText = story.title.endsWith('.') ? story.title : `${story.title}.`;
const sceneTexts = reelProps.claims.map((c) => c.texto);
const ctaText = 'Siga o agêntico. O futuro da IA, todo dia, num clique.';
const allTexts = [hookText, ...sceneTexts, ctaText];
const clip = await narrateContinuous(story.id, allTexts.join(' '), elevenKey);
const cuts = sentenceCuts(clip, allTexts);
const ctaFrames = cuts[cuts.length - 1] + 10;
const sourcesFrames = Math.min(55, Math.round(ctaFrames * 0.45));

const reporter = reporterFor(story.id);
console.log(`repórter desta notícia: ${reporter.name}`);
const personaSrc = await personaClip(story.id, join(root, 'public', clip.src), reporter.pose);

const props = {
  kicker: reelProps.kicker,
  headline: reelProps.headline,
  highlights: reelProps.highlights,
  dateline: reelProps.dateline,
  independentSources: reelProps.independentSources,
  image: reelProps.image,
  claims: reelProps.claims.map((c) => ({label: c.label, texto: c.texto, image: c.image})),
  sources: reelProps.sources,
  brand: reelProps.brand,
  tagline: reelProps.tagline,
  personaSrc,
  narration: {
    clip,
    cuts: {
      hook: cuts[0],
      claims: cuts.slice(1, -1),
      sources: sourcesFrames,
      closing: ctaFrames - sourcesFrames,
    },
  },
};

const output = join('out', `split-${story.id}.mp4`);
console.log(`Notícia #${story.id}: "${story.title}" -> ${output}`);
execFileSync(
  'npx',
  ['remotion', 'render', 'NewsSplit', output, '--timeout=120000', `--props=${JSON.stringify(props)}`],
  {cwd: root, stdio: 'inherit'},
);

const caption = `${story.title}. Apuracao: ${story.independentSources} veiculos independentes. Siga o agentico para mais noticias de IA.`;
writeFileSync(join(root, 'out', `split-${story.id}.caption.txt`), caption);
console.log(`\nPronto: packages/video/${output}\n${caption}`);
