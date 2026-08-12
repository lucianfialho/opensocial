// Regenerates src/highlights.json from public/article.png using the tesseract CLI.
// Usage: node scripts/ocr.mjs
import {execFileSync} from 'node:child_process';
import {existsSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = join(root, 'public', 'article.png');
const OUT = join(root, 'src', 'highlights.json');
const PHRASES = ['government shutdown', 'funding lapses'];

const tesseract = ['tesseract', '/opt/homebrew/bin/tesseract', '/usr/local/bin/tesseract'].find(
  (bin) => {
    try {
      execFileSync(bin, ['--version'], {stdio: 'ignore'});
      return true;
    } catch {
      return false;
    }
  },
);
if (!tesseract) throw new Error('tesseract CLI not found');

const tsv = execFileSync(tesseract, [IMAGE, 'stdout', 'tsv'], {encoding: 'utf8'});
const words = tsv
  .split('\n')
  .map((line) => line.split('\t'))
  .filter((cols) => cols.length === 12 && cols[0] === '5' && cols[11].trim() !== '')
  .map((cols) => ({
    left: Number(cols[6]),
    top: Number(cols[7]),
    width: Number(cols[8]),
    height: Number(cols[9]),
    text: cols[11].trim().toLowerCase().replace(/[^a-z0-9]/g, ''),
  }));

const dims = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', IMAGE], {
  encoding: 'utf8',
});
const imageWidth = Number(dims.match(/pixelWidth: (\d+)/)[1]);
const imageHeight = Number(dims.match(/pixelHeight: (\d+)/)[1]);

const phrases = PHRASES.map((phrase) => {
  const parts = phrase.split(' ');
  for (let i = 0; i <= words.length - parts.length; i++) {
    const window = words.slice(i, i + parts.length);
    if (window.every((w, j) => w.text === parts[j])) {
      const x1 = Math.min(...window.map((w) => w.left));
      const y1 = Math.min(...window.map((w) => w.top));
      const x2 = Math.max(...window.map((w) => w.left + w.width));
      const y2 = Math.max(...window.map((w) => w.top + w.height));
      return {text: phrase, x: x1, y: y1, width: x2 - x1, height: y2 - y1};
    }
  }
  throw new Error(`Phrase not found in OCR output: "${phrase}"`);
});

writeFileSync(OUT, JSON.stringify({image: {width: imageWidth, height: imageHeight}, phrases}, null, 2) + '\n');
console.log(`wrote ${OUT}`);
if (!existsSync(OUT)) process.exit(1);
