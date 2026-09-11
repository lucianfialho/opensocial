// Collage mode: one AI-generated paper-collage poster per beat, via the
// OpenRouter image model. Prompt structure follows the vox-director guide
// (MIT, Alisa Qian): fixed style block + scene as cut-out pieces + one flat
// bg color + baked-in short headline. ~US$ 0.07 per poster.
import {mkdirSync, writeFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {envValue} from './tts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE_MODEL = envValue('OPENSOCIAL_IMAGE_MODEL') ?? 'google/gemini-3.1-flash-image';

// house style: our palette baked into the vox-director structure. Verbatim
// on every beat — this is what makes 5 posters read as one film.
const STYLE_BLOCK = `Mixed-media hand-cut PAPER COLLAGE poster, editorial zine style, vertical 9:16. Torn and scissor-cut paper edges, tape corners, halftone print dots, newspaper clippings, paper-stencil shapes, real paper drop shadows. Figures are PRINTED-texture black-and-white halftone cut-outs of real imagery (photo / woodblock), NOT CGI, NOT a 3D render — keep print grain and paper imperfections. High contrast. Hand-drawn black pen scribbles, circles and arrows as annotations. Accent color strictly limited to warm yellow (#ffe234) stickers, tape and highlights. No watermark, no logos of real companies.`;

const BG = {
  cream: 'cream paper (#f6f1e0) with faint pencil sketch lines',
  ink: 'near-black paper (#141412)',
  yellow: 'bold flat warm yellow paper (#ffe234)',
};

export function posterPrompt({scene, headline, bg = 'cream'}) {
  return [
    STYLE_BLOCK,
    `SCENE as layered paper cut-outs: ${scene}; elements have clear edges, distinct layers, each with its own drop shadow.`,
    `On a bold flat ${BG[bg] ?? BG.cream} background.`,
    headline ? `A torn-paper banner with a big bold headline "${headline}" in black cut-out letters, some letters as ransom-note newspaper cutouts.` : 'No headline text.',
  ].join(' ');
}

/** Generates (or returns cached) poster for a beat → public/vox/ relative path. */
export async function generatePoster(id, beatIdx, spec) {
  mkdirSync(join(root, 'public', 'vox'), {recursive: true});
  const prompt = posterPrompt(spec);
  const hash = createHash('md5').update(IMAGE_MODEL + prompt).digest('hex').slice(0, 8);
  const rel = `vox/poster-${id}-${beatIdx}-${hash}.png`;
  const abs = join(root, 'public', rel);
  if (existsSync(abs)) return rel;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {authorization: `Bearer ${envValue('OPENROUTER_API_KEY')}`, 'content-type': 'application/json'},
    body: JSON.stringify({model: IMAGE_MODEL, modalities: ['image', 'text'], messages: [{role: 'user', content: prompt}]}),
  });
  if (!res.ok) throw new Error(`image gen ${res.status}`);
  const data = await res.json();
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error('image gen: sem imagem na resposta');
  writeFileSync(abs, Buffer.from(url.split(',')[1], 'base64'));
  return rel;
}
