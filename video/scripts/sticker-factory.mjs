// Sticker factory: any photo of an object on a light background becomes a
// halftone B&W cutout sticker with a white die-cut border (transparent PNG)
// — the collage-journalism look, license-clean when fed public-domain
// sources. Usage as a library: makeSticker(buffer, outPath, opts).
import sharp from 'sharp';

/** Luminance-driven dot grid: the classic halftone screen. */
async function halftoneSvg(buf, {cells, cellPx, angleDeg}) {
  const {data, info} = await sharp(buf)
    .grayscale()
    .normalise()
    .resize(cells, cells, {fit: 'inside'})
    .raw()
    .toBuffer({resolveWithObject: true});
  const W = info.width * cellPx;
  const H = info.height * cellPx;
  const dots = [];
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const lum = data[y * info.width + x];
      const r = ((255 - lum) / 255) * cellPx * 0.62;
      if (r < 0.4) continue;
      dots.push(`<circle cx="${x * cellPx + cellPx / 2}" cy="${y * cellPx + cellPx / 2}" r="${r.toFixed(2)}"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <g fill="black" transform="rotate(${angleDeg} ${W / 2} ${H / 2})">${dots.join('')}</g>
  </svg>`;
  return {svg: Buffer.from(svg), W, H};
}

/** Subject mask: adaptive — samples the background level from the four
 *  corners (museum shots sit on smooth light-gray grounds, not pure white)
 *  and keeps whatever is meaningfully darker than it. */
async function subjectMask(buf, W, H) {
  const {data, info} = await sharp(buf).grayscale().resize(64, 64, {fit: 'fill'}).raw().toBuffer({resolveWithObject: true});
  const corner = (x0, y0) => {
    let sum = 0, n = 0;
    for (let y = y0; y < y0 + 8; y++) for (let x = x0; x < x0 + 8; x++) { sum += data[y * info.width + x]; n++; }
    return sum / n;
  };
  const bg = Math.min(corner(0, 0), corner(56, 0), corner(0, 56), corner(56, 56));
  const cut = Math.max(60, Math.round(bg - 22));
  return sharp(buf)
    .grayscale()
    .normalise()
    .resize(W, H, {fit: 'inside'})
    .threshold(cut)
    .negate()
    .blur(2)
    .threshold(96)
    .toBuffer();
}

export async function makeSticker(inputBuf, outPath, opts = {}) {
  const {cells = 96, cellPx = 9, angleDeg = 4, border = 14} = opts;
  const {svg, W, H} = await halftoneSvg(inputBuf, {cells, cellPx, angleDeg});
  const halftone = await sharp(svg).png().toBuffer();
  const mask = await subjectMask(inputBuf, W, H);
  const maskResized = await sharp(mask).resize(W, H, {fit: 'fill'}).toBuffer();

  // subject-only halftone: mask becomes the alpha channel
  const inked = await sharp(halftone)
    .composite([{input: maskResized, blend: 'dest-in'}])
    .png()
    .toBuffer();

  // die-cut white base: the mask dilated outward
  const dilated = await sharp(maskResized).blur(border).threshold(24).png().toBuffer();
  const whiteBase = await sharp({create: {width: W, height: H, channels: 4, background: '#ffffff'}})
    .composite([{input: dilated, blend: 'dest-in'}])
    .png()
    .toBuffer();

  await sharp({create: {width: W, height: H, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}})
    .composite([{input: whiteBase}, {input: inked}])
    .trim({threshold: 10})
    .png()
    .toFile(outPath);
  return outPath;
}
