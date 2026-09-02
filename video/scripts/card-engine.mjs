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
 *  everything is transcoded to JPEG (resvg cannot decode webp/avif). */
async function toDataUri(url) {
  if (imageCache.has(url)) return imageCache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`imagem ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata();
  const ratio = (meta.width ?? 1) / (meta.height ?? 1);
  let jpeg;
  if (ratio >= 1.2) {
    // landscape source on the 1080×1350 portrait canvas: a blind cover-crop
    // beheads wordmarks and screenshots — compose contain-over-blurred-fill
    const fg = await sharp(buf).resize(1080, 1350, {fit: 'inside'}).toBuffer();
    const fgMeta = await sharp(fg).metadata();
    const bg = await sharp(buf)
      .resize(1080, 1350, {fit: 'cover'})
      .blur(45)
      .modulate({brightness: 0.55})
      .toBuffer();
    jpeg = await sharp(bg)
      .composite([{
        input: fg,
        // sit the whole image a touch above center — the bottom third
        // belongs to the scrim and the headline
        top: Math.round((1350 - (fgMeta.height ?? 0)) * 0.42),
        left: Math.round((1080 - (fgMeta.width ?? 0)) / 2),
      }])
      .jpeg({quality: 88})
      .toBuffer();
  } else {
    jpeg = await sharp(buf)
      .resize(1080, 1350, {fit: 'outside', withoutEnlargement: true})
      .jpeg({quality: 88})
      .toBuffer();
  }
  const uri = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  imageCache.set(url, uri);
  return uri;
}

/** Renders one card object (news-carousel shape) to a JPEG file. */
export async function renderCard(card, outPath) {
  const resolved = {...card};
  if (card.image?.url) {
    resolved.image = {...card.image, dataUri: await toDataUri(card.image.url)};
  }
  const variant = card.variant === 'body' && !card.image ? 'cream' : card.variant;
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
