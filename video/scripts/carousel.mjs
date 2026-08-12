// Renders every slide in slides.json as a 1080x1350 PNG card (Instagram
// carousel format) into out/carousel/.
// Usage: node scripts/carousel.mjs [path/to/slides.json]
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const slidesFile = process.argv[2] ?? join(root, 'slides.json');
const slides = JSON.parse(readFileSync(slidesFile, 'utf8'));

// Frame 120: highlights fully drawn, gentle 3D tilt for a dynamic still.
const FRAME = 120;

mkdirSync(join(root, 'out', 'carousel'), {recursive: true});

slides.forEach((slide, i) => {
  const output = join('out', 'carousel', `slide-${i + 1}.png`);
  console.log(`rendering ${output} — "${slide.headline}"`);
  execFileSync(
    'npx',
    [
      'remotion',
      'still',
      'ArticleTextPortrait',
      output,
      `--frame=${FRAME}`,
      `--props=${JSON.stringify(slide)}`,
    ],
    {cwd: root, stdio: 'inherit'},
  );
});

console.log(`\n${slides.length} cards in out/carousel/ — post as a carousel with:`);
console.log(
  `opensocial post --to instagram --text "..." --media ${slides
    .map((_, i) => `out/carousel/slide-${i + 1}.png`)
    .join(' ')}`,
);
