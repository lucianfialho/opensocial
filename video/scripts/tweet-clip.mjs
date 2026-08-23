// Trending-clip reel builder: downloads a video that is already hot on
// another network (X/YouTube/TikTok — anything yt-dlp speaks), wraps it in
// the tweet-style TweetClip card and renders a 9:16 reel. Review-first: it
// renders to out/, it does NOT publish.
//
// Usage:
//   node scripts/tweet-clip.mjs --url=<video url> --headline="..." \
//     [--credit=@fonte] [--max=90]
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 30;

const args = process.argv.slice(2);
const flag = (name, fallback) =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const url = flag('url', null);
const headline = flag('headline', null);
const credit = flag('credit', '');
const maxSeconds = Number(flag('max', '90'));
const position = flag('pos', 'bottom'); // bottom (padrão) | top
if (!url || !headline) {
  console.error('Uso: node scripts/tweet-clip.mjs --url=<video> --headline="..." [--credit=@fonte]');
  process.exit(1);
}

const slug = createHash('md5').update(url).digest('hex').slice(0, 8);
mkdirSync(join(root, 'public', 'clips'), {recursive: true});
const rel = `clips/${slug}.mp4`;
const abs = join(root, 'public', rel);

if (!existsSync(abs)) {
  console.log('baixando vídeo (yt-dlp)...');
  execFileSync('yt-dlp', [
    '-f', 'mp4[height<=1080]/bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b',
    '--merge-output-format', 'mp4',
    '-o', abs,
    url,
  ], {stdio: 'inherit'});
}

const probe = (entry) =>
  execFileSync('npx', ['remotion', 'ffprobe', '-v', 'error', '-show_entries', entry,
    '-of', 'default=noprint_wrappers=1:nokey=1', abs], {cwd: root, encoding: 'utf8'}).trim();
let duration = parseFloat(probe('format=duration'));
const [w, h] = probe('stream=width,height').split('\n').map(Number);

if (duration > maxSeconds) {
  console.log(`vídeo tem ${duration.toFixed(0)}s — cortando em ${maxSeconds}s`);
  const cut = `${abs}.cut.mp4`;
  execFileSync('npx', ['remotion', 'ffmpeg', '-i', abs, '-t', String(maxSeconds), '-c', 'copy', cut, '-y'],
    {cwd: root, stdio: 'ignore'});
  execFileSync('mv', [cut, abs]);
  duration = maxSeconds;
}

const props = {
  headline,
  credit: credit ? `via ${credit}` : '',
  videoSrc: rel,
  videoDurationInFrames: Math.floor(duration * FPS),
  videoAspect: w / h,
  position,
};

const output = join('out', `tweetclip-${slug}.mp4`);
console.log(`renderizando ${output} (${duration.toFixed(0)}s, ${w}x${h})`);
execFileSync('npx',
  ['remotion', 'render', 'TweetClip', output, '--timeout=120000', `--props=${JSON.stringify(props)}`],
  {cwd: root, stdio: 'inherit'});

const caption = `${headline}${credit ? `\n\n🎥 ${credit}` : ''}\n\nSiga @oagentico — o futuro da IA, todo dia, num clique.\n\n#inteligenciaartificial #ia #tecnologia #noticias`;
writeFileSync(join(root, 'out', `tweetclip-${slug}.caption.txt`), caption);
console.log(`\nPronto: packages/video/${output}`);
console.log(`Publicar: node ../cli/dist/index.js post --to instagram --text "$(cat out/tweetclip-${slug}.caption.txt)" --media packages/video/${output}`);
