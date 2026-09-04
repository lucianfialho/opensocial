// One-off: user-curated reference folder → cutout → sticker factory.
// Usage: node scripts/batch-acervo.mjs <srcDir> <outDir>
import {mkdirSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {cutout} from './cutout.mjs';
import {makeSticker} from './sticker-factory.mjs';

const [srcDir, outDir] = process.argv.slice(2);
mkdirSync(outDir, {recursive: true});
const files = readdirSync(srcDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
let n = 0;
for (const [i, f] of files.entries()) {
  const tag = String(i + 1).padStart(2, '0');
  try {
    const cut = cutout(readFileSync(join(srcDir, f)));
    await makeSticker(cut, join(outDir, `prop-${tag}.png`));
    n++;
    console.log(`ok ${tag} (${f.slice(0, 30)})`);
  } catch (err) {
    console.log(`-- ${tag} falhou: ${String(err).slice(0, 80)}`);
  }
}
console.log(`${n}/${files.length} processados`);
