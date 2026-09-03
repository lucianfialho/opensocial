// Vox-style explainer prototype: narration via ElevenLabs (word timestamps)
// + kinetic-type Remotion composition. Usage: node scripts/vox-proto.mjs
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {envValue, narrateContinuous} from './tts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVENT_ID = 28012; // Dropbox: bastava seu e-mail

// Narration beats: `text` must match the narration word-for-word; the
// composition re-slices ElevenLabs word timings by whitespace count.
const SEGMENTS = [
  {text: 'Bastava saber o seu e-mail. Nada mais.', highlights: ['seu e-mail'], big: null, circle: null, arrow: false, image: null, credit: null},
  {text: '5 mil contas do Dropbox foram invadidas sem que ninguém digitasse uma senha.', highlights: [], big: '5', circle: 'senha', arrow: false, entity: {nome: 'Dropbox', logo: 'vox/logo-dropbox.png'}, image: null, credit: null},
  {text: 'A brecha veio de um recurso da Lenovo, que confirmava o login sozinho.', highlights: ['confirmava o login sozinho'], big: null, circle: null, arrow: true, entity: {nome: 'Lenovo', logo: 'vox/logo-lenovo.png', logoW: 140, logoH: 30}, image: 'vox/hero-28012.jpg', credit: 'g1.globo.com'},
  {text: 'O Dropbox diz que já bloqueou as contas afetadas.', highlights: [], big: null, circle: 'bloqueou', arrow: false, image: null, credit: null},
  {text: 'Mas fica a pergunta: quantos serviços confiam demais no seu e-mail?', highlights: ['confiam demais'], big: null, circle: null, arrow: false, image: null, credit: null},
];
const NARRATION = SEGMENTS.map((s) => s.text).join(' ');

const apiKey = envValue('ELEVENLABS_API_KEY');
if (!apiKey) throw new Error('ELEVENLABS_API_KEY ausente');

// hero image → public/vox/ (Remotion staticFile precisa de arquivo local)
const token = envValue('OAGENTICO_TOKEN');
const detail = (await (await fetch(`https://oagentico.com.br/api/v1/eventos/${EVENT_ID}`, {
  headers: {Authorization: `Bearer ${token}`},
})).json()).dados;
const heroUrl = detail.imagem?.url ?? detail.artigos?.find((a) => a.imageUrl)?.imageUrl;
mkdirSync(join(root, 'public', 'vox'), {recursive: true});
const heroBuf = Buffer.from(await (await fetch(heroUrl)).arrayBuffer());
await sharp(heroBuf).resize(1200, 900, {fit: 'cover'}).jpeg({quality: 88}).toFile(join(root, 'public', 'vox', `hero-${EVENT_ID}.jpg`));
console.log('hero salvo');

let clip;
try {
  clip = await narrateContinuous(EVENT_ID, NARRATION, apiKey);
} catch (err) {
  // sem quota de TTS: timing sintético (~2.8 palavras/s) só pra provar o visual
  console.log(`tts indisponível (${err.message.slice(0, 80)}) — timing sintético, sem áudio`);
  const tokens = NARRATION.split(/\s+/).filter(Boolean);
  const WPS = 2.8;
  const words = tokens.map((text, i) => ({text, start: i / WPS + 0.4, end: (i + 1) / WPS + 0.3}));
  clip = {src: 'none', words, durationInFrames: Math.ceil((words.at(-1).end + 0.8) * 30)};
}
console.log(`narração: ${clip.durationInFrames} frames, ${clip.words.length} palavras`);

const props = {
  brand: 'o agêntico',
  handle: '@oagentico',
  audioSrc: clip.src,
  durationInFrames: clip.durationInFrames + 45, // fôlego + end card
  words: clip.words,
  segments: SEGMENTS,
};
const propsPath = join(root, 'out', `vox-${EVENT_ID}.props.json`);
mkdirSync(join(root, 'out'), {recursive: true});
writeFileSync(propsPath, JSON.stringify(props));

console.log('renderizando...');
execFileSync('npx', [
  'remotion', 'render', 'VoxExplainer', join(root, 'out', `vox-${EVENT_ID}.mp4`),
  `--props=${propsPath}`, '--codec=h264',
], {cwd: root, stdio: 'inherit'});
console.log(`pronto: out/vox-${EVENT_ID}.mp4`);
