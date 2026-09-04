// Sticker factory: any photo of an object on a light background becomes a
// halftone B&W cutout sticker with a white die-cut border (transparent PNG)
// — the collage-journalism look, license-clean when fed public-domain
// sources. Usage as a library: makeSticker(buffer, outPath, opts).
import sharp from 'sharp';

/** Luminance-driven dot grid: the classic halftone screen. Where a subject
 *  mask is known, every subject cell prints at least a faint dot — bright
 *  pastel highlights otherwise vanish into the white ground and the shape
 *  comes out shredded. */
async function halftoneSvg(buf, {cells, cellPx, angleDeg, subjectMaskBuf = null}) {
  const {data, info} = await sharp(buf)
    .grayscale()
    .normalise()
    .resize(cells, cells, {fit: 'inside'})
    .raw()
    .toBuffer({resolveWithObject: true});
  // deepen shadows: sticker look needs dense blacks, not washed grays
  const contrasted = data.map((v) => Math.max(0, Math.min(255, Math.round((v - 128) * 1.45 + 118))));
  data.set ? contrasted.forEach((v, i) => (data[i] = v)) : null;
  let maskCells = null;
  if (subjectMaskBuf) {
    maskCells = await sharp(subjectMaskBuf)
      .resize(info.width, info.height, {fit: 'fill'})
      .toColourspace('b-w')
      .raw()
      .toBuffer();
  }
  const W = info.width * cellPx;
  const H = info.height * cellPx;
  const dots = [];
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = y * info.width + x;
      let lum = data[idx];
      if (maskCells) {
        if (maskCells[idx] <= 128) continue; // outside the subject: no ink
        lum = Math.min(lum, 205); // inside: always print at least faintly
      }
      const r = ((255 - lum) / 255) * cellPx * 0.62;
      if (r < 0.4) continue;
      dots.push(`<circle cx="${x * cellPx + cellPx / 2}" cy="${y * cellPx + cellPx / 2}" r="${r.toFixed(2)}"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <g fill="black" transform="rotate(${angleDeg} ${W / 2} ${H / 2})">${dots.join('')}</g>
  </svg>`;
  return {svg: Buffer.from(svg)};
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
  const corners = [corner(0, 0), corner(56, 0), corner(0, 56), corner(56, 56)];
  const bg = corners.reduce((a, b) => a + b, 0) / 4;
  if (bg < 128) {
    // dark ground: the subject is whatever is brighter than it
    const cut = Math.min(200, Math.round(bg + 26));
    return sharp(buf).grayscale().resize(W, H, {fit: 'inside'}).threshold(cut).blur(2).threshold(96).toBuffer();
  }
  const cut = Math.max(60, Math.round(Math.min(...corners) - 22));
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
  const {cells = 110, cellPx = 8, angleDeg = 4, border = 30} = opts;
  const meta = await sharp(inputBuf).metadata();
  // transparent sources (icon packs, renders): flatten to white for the
  // halftone read, and use the existing alpha as the subject mask directly
  const hasAlpha = Boolean(meta.hasAlpha);
  const toneSource = hasAlpha
    ? await sharp(inputBuf).flatten({background: '#ffffff'}).png().toBuffer()
    : inputBuf;
  // fitted grid dims are pure aspect math — compute before anything
  const tmeta = await sharp(toneSource).metadata();
  const scale = cells / Math.max(tmeta.width, tmeta.height);
  const W = Math.round(tmeta.width * scale) * cellPx;
  const H = Math.round(tmeta.height * scale) * cellPx;

  let mask = null;
  if (hasAlpha) {
    // gentle threshold: glassy/soft parts of renders carry low alpha and
    // must survive the cut
    mask = await sharp(inputBuf).ensureAlpha().extractChannel('alpha').threshold(12).blur(1).threshold(40).toBuffer();
    // some exports carry a fully-opaque alpha over a white ground — that is
    // no mask at all; fall back to content-based cutting
    const mstats = await sharp(mask).stats();
    if (mstats.channels[0].mean > 235) mask = null;
  }
  if (!mask) mask = await subjectMask(toneSource, W, H);
  const {svg} = await halftoneSvg(toneSource, {cells, cellPx, angleDeg, subjectMaskBuf: mask});
  const halftone = await sharp(svg).png().toBuffer();

  // everything below works on VERIFIED single-channel raw buffers — sharp's
  // dest-in reads the input's alpha, so the mask must BE an alpha channel
  const rawOpts = {raw: {width: W, height: H, channels: 1}};
  let maskRaw = await sharp(mask).resize(W, H, {fit: 'fill'}).toColourspace('b-w').raw().toBuffer();
  if (maskRaw.length !== W * H) throw new Error(`mask raw ${maskRaw.length} != ${W * H}`);

  // photo cut off at the bottom edge (busts on socles, cropped shots): shave
  // the flat-cut pedestal — walk up while rows stay wide, cap at 16% height
  const rowCover = (y) => {
    let n = 0;
    for (let x = 0; x < W; x++) if (maskRaw[y * W + x] > 128) n++;
    return n;
  };
  if (rowCover(H - 2) > W * 0.06) {
    let maxCover = 0;
    for (let y = 0; y < H; y += 4) maxCover = Math.max(maxCover, rowCover(y));
    const cap = Math.floor(H * 0.84);
    let cutY = H;
    for (let y = H - 1; y >= cap; y--) {
      if (rowCover(y) < maxCover * 0.55) { cutY = y; break; }
      cutY = y;
    }
    if (cutY < H) {
      const shaved = Buffer.from(maskRaw);
      shaved.fill(0, cutY * W);
      // re-soften the cut so the torn border wraps it organically
      maskRaw = await sharp(shaved, rawOpts).blur(3).threshold(110).toColourspace('b-w').raw().toBuffer();
    }
  }
  const dilatedRaw = border > 0
    ? await sharp(maskRaw, rawOpts).blur(border).threshold(24).toColourspace('b-w').raw().toBuffer()
    : maskRaw;
  if (dilatedRaw.length !== W * H) throw new Error(`dilated raw ${dilatedRaw.length} != ${W * H}`);

  // torn-paper border: solid inner band + chunky wave noise in the outer
  // ring, smoothed into a ragged paper contour (not speckle)
  const tornEdge = async (fullRaw, solidRaw, blockSize, seed0) => {
    let seedState = seed0;
    const rand = () => ((seedState = (seedState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const bw2 = Math.ceil(W / blockSize);
    const blockNoise = new Uint8Array(bw2 * Math.ceil(H / blockSize));
    for (let i = 0; i < blockNoise.length; i++) blockNoise[i] = rand() > 0.4 ? 255 : 0;
    const torn = Buffer.alloc(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (solidRaw[i] > 128) torn[i] = 255;
        else if (fullRaw[i] > 128) torn[i] = blockNoise[Math.floor(y / blockSize) * bw2 + Math.floor(x / blockSize)];
      }
    }
    return sharp(torn, rawOpts).blur(3.2).threshold(128).toColourspace('b-w').raw().toBuffer();
  };
  const midRaw = border > 0
    ? await sharp(maskRaw, rawOpts).blur(Math.max(2, border * 0.65)).threshold(24).toColourspace('b-w').raw().toBuffer()
    : maskRaw;
  const tornRaw = border > 0 ? await tornEdge(dilatedRaw, midRaw, 11, 987654321) : maskRaw;
  // the black backing layer between white paper and halftone — the punch
  const inkFullRaw = border > 0
    ? await sharp(maskRaw, rawOpts).blur(Math.max(2, border * 0.22)).threshold(24).toColourspace('b-w').raw().toBuffer()
    : maskRaw;
  const inkTornRaw = border > 0 ? await tornEdge(inkFullRaw, maskRaw, 7, 246813579) : null;

  const maskAsAlpha = await sharp({create: {width: W, height: H, channels: 3, background: '#ffffff'}})
    .joinChannel(maskRaw, rawOpts)
    .png()
    .toBuffer();
  const inked = await sharp(halftone)
    .composite([{input: maskAsAlpha, blend: 'dest-in'}])
    .png()
    .toBuffer();

  // die-cut white base: white pixels whose alpha is the TORN mask
  const whiteBase = await sharp({create: {width: W, height: H, channels: 3, background: '#ffffff'}})
    .joinChannel(tornRaw, rawOpts)
    .png()
    .toBuffer();

  const blackBase = inkTornRaw
    ? await sharp({create: {width: W, height: H, channels: 3, background: '#141412'}})
        .joinChannel(inkTornRaw, rawOpts)
        .png()
        .toBuffer()
    : null;
  // the subject itself is white paper — the halftone dots print ON it
  const subjectPaper = await sharp({create: {width: W, height: H, channels: 3, background: '#fdfbf6'}})
    .joinChannel(maskRaw, rawOpts)
    .png()
    .toBuffer();
  const layers = border > 0
    ? [{input: whiteBase}, {input: blackBase}, {input: subjectPaper}, {input: inked}]
    : [{input: subjectPaper}, {input: inked}];
  // palette quantization (the TinyPNG trick, built into sharp): B&W
  // halftones collapse to a handful of colors — 5-10x smaller files
  await sharp({create: {width: W, height: H, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}})
    .composite(layers)
    .trim({threshold: 10})
    .png({palette: true, quality: 80, compressionLevel: 9})
    .toFile(outPath);
  return outPath;
}
