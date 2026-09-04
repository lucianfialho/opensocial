// ML background removal via rembg (bria-rmbg model, runs offline after the
// one-time ~1GB model download). Input: any image buffer. Output: PNG with
// clean alpha, ready for the sticker factory.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export function cutout(inputBuf) {
  const dir = mkdtempSync(join(tmpdir(), 'cutout-'));
  const inPath = join(dir, 'in.png');
  const outPath = join(dir, 'out.png');
  writeFileSync(inPath, inputBuf);
  try {
    execFileSync('uvx', ['--from', 'rembg[cpu,cli]', 'rembg', 'i', inPath, outPath], {
      stdio: 'ignore',
      timeout: 300_000,
    });
    return readFileSync(outPath);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
}
