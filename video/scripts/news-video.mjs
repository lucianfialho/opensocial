// Fetches the top story of the week from the o agêntico API and renders it
// as a video. Prop mapping lives in build-props.mjs; highlight picking in
// pick-highlights.mjs.
//
// Usage:
//   node scripts/news-video.mjs
//     [--format=NewsReel|NewsReelPortrait|ArticleText*]
//     [--mode=resumo|claims]  scene source for the reel (default: resumo)
//     [--index=0]             which story from /eventos/semana
//     [--highlight="frase"]   repeatable; overrides the hook's automatic picks
//
// Token: OAGENTICO_TOKEN env var, or packages/video/.env (gitignored).
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildReelProps, buildSingleSceneProps} from './build-props.mjs';
import {pickHighlights} from './pick-highlights.mjs';

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
const format = flag('format', 'NewsReel');
const mode = flag('mode', 'resumo');
const index = Number(flag('index', '0'));
const manualHighlights = args
  .filter((a) => a.startsWith('--highlight='))
  .map((a) => a.split('=').slice(1).join('='));

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
  if (!story) {
    console.error(`Evento ${wantedId} não está nos últimos 100.`);
    process.exit(1);
  }
} else {
  const {dados: week} = await get('/eventos/semana');
  story = week[index];
  if (!story) {
    console.error(`Sem notícia no índice ${index} (a semana tem ${week.length}).`);
    process.exit(1);
  }
}

const {dados: detail} = await get(`/eventos/${story.id}`);
const highlights =
  manualHighlights.length > 0
    ? manualHighlights
    : pickHighlights(story.title, detail.claims ?? []);

const props = format.startsWith('ArticleText')
  ? buildSingleSceneProps({story, highlights})
  : buildReelProps({story, detail, highlights, mode});

if (!format.startsWith('ArticleText')) {
  const {narrateContinuous, sentenceCuts, envValue} = await import('./tts.mjs');
  const elevenKey = envValue('ELEVENLABS_API_KEY');
  if (elevenKey && !args.includes('--no-tts')) {
    // One continuous anchor read: title + summary + CTA. No pauses.
    const hookText = story.title.endsWith('.') ? story.title : `${story.title}.`;
    const sceneTexts = props.claims.map((c) => c.texto);
    const ctaText = 'Siga o agêntico. O futuro da IA, todo dia, num clique.';
    const allTexts = [hookText, ...sceneTexts, ctaText];
    const clip = await narrateContinuous(story.id, allTexts.join(' '), elevenKey);
    const cuts = sentenceCuts(clip, allTexts);
    // the sources beat plays under the start of the CTA speech
    const ctaFrames = cuts[cuts.length - 1] + 10; // small visual tail
    const sourcesFrames = Math.min(55, Math.round(ctaFrames * 0.45));
    props.narration = {
      clip,
      cuts: {
        hook: cuts[0],
        claims: cuts.slice(1, -1),
        sources: sourcesFrames,
        closing: ctaFrames - sourcesFrames,
      },
    };
  } else {
    props.narration = null;
  }
}

const output = join('out', `news-${story.id}.mp4`);
console.log(`Notícia #${story.id}: "${story.title}"`);
console.log(`Highlights do hook: ${highlights.join(' | ') || '(nenhum)'}`);
console.log(`Modo: ${mode} · Renderizando ${format} -> ${output}\n`);

execFileSync(
  'npx',
  ['remotion', 'render', format, output, `--props=${JSON.stringify(props)}`],
  {cwd: root, stdio: 'inherit'},
);

const caption = [
  story.title,
  '',
  detail.summary ?? '',
  '',
  `Apuração: ${story.independentSources} veículos independentes.`,
  '',
  'Siga @oagentico — o futuro da IA, todo dia, num clique.',
  '',
  '#inteligenciaartificial #ia #tecnologia #noticias',
].join('\n');
const captionFile = join('out', `news-${story.id}.caption.txt`);
writeFileSync(join(root, captionFile), caption);

console.log(`\nPronto: packages/video/${output}`);
console.log(`Legenda: packages/video/${captionFile}\n\n${caption}\n`);
console.log(`Publicar: opensocial post --to tiktok,instagram --text "${story.title}" --media packages/video/${output}`);
