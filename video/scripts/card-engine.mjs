// Satori-based card renderer: JSON card -> SVG -> JPEG. No Chrome, no
// bundler — ~100ms per card. Templates live in card-templates.mjs.
import satori from 'satori';
import {Resvg} from '@resvg/resvg-js';
import sharp from 'sharp';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {templates} from './card-templates.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const font = (file) => readFileSync(join(root, 'public', 'fonts', file));

const FONTS = [
  {name: 'Inter', data: font('Inter-wght-400.ttf'), weight: 400, style: 'normal'},
  {name: 'Inter', data: font('Inter-wght-700.ttf'), weight: 700, style: 'normal'},
  {name: 'Inter', data: font('Inter-wght-800.ttf'), weight: 800, style: 'normal'},
  {name: 'Lora', data: font('Lora-ital-wght-0-400.ttf'), weight: 400, style: 'normal'},
  {name: 'Gofar', data: font('GofarSerif.otf'), weight: 400, style: 'normal'},
];

const imageCache = new Map();
/** satori does not fetch — remote images become data URIs up front, and
 *  everything is transcoded to JPEG (resvg cannot decode webp/avif).
 *  Returns {uri, ratio} — the ratio decides fullbleed vs band layout. */
async function toDataUri(url) {
  if (imageCache.has(url)) return imageCache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`imagem ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata();
  const jpeg = await sharp(buf)
    .resize(1080, 1350, {fit: 'outside', withoutEnlargement: true})
    .jpeg({quality: 88})
    .toBuffer();
  const entry = {
    uri: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
    ratio: (meta.width ?? 1) / (meta.height ?? 1),
  };
  imageCache.set(url, entry);
  return entry;
}

// a landscape photo cover-cropped to the portrait canvas loses ~half its
// width (wordmarks and screenshots get beheaded) — band layout instead
const BAND_RATIO = 1.2;

/** Renders one card object (news-carousel shape) to a JPEG file. */
export async function renderCard(card, outPath) {
  const resolved = {...card};
  if (card.image?.url) {
    const {uri, ratio} = await toDataUri(card.image.url);
    resolved.image = {...card.image, dataUri: uri, ratio};
    if (ratio >= BAND_RATIO && (card.variant === 'title' || card.variant === 'body')) {
      resolved.variant = card.variant === 'title' ? 'titleBand' : 'bodyBand';
    }
  }
  const variant = resolved.variant === 'body' && !resolved.image ? 'cream' : resolved.variant;
  const template = templates[variant] ?? templates.body;
  const svg = await satori(template(resolved), {
    width: 1080,
    height: 1350,
    fonts: FONTS,
  });
  const png = new Resvg(svg, {fitTo: {mode: 'width', value: 1080}}).render().asPng();
  // sRGB baseline JPEG — the encoding Instagram's image pipeline accepts
  await sharp(png).flatten({background: '#101013'}).withMetadata().jpeg({quality: 90, mozjpeg: true}).toFile(outPath);
}
