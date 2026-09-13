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
import {BRAND} from './profile.mjs';

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
const captionOverride = flag('caption', '');
if (!url || !headline) {
  console.error('Uso: node scripts/tweet-clip.mjs --url=<video> --headline="..." [--credit=@fonte]');
  process.exit(1);
}

// network label from the source URL; credit never carries "@" — on
// Instagram that would mention an unrelated IG profile
const network = /x\.com|twitter\.com/.test(url) ? 'X'
  : /youtube\.com|youtu\.be/.test(url) ? 'YouTube'
  : /tiktok\.com/.test(url) ? 'TikTok'
  : /reddit\.com/.test(url) ? 'Reddit' : '';
const creditText = credit
  ? `via ${credit.replace(/^via\s+/i, '').replace(/^@/, '')}${network ? ` · ${network}` : ''}`
  : '';

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

const probe = (args) =>
  execFileSync('npx', ['remotion', 'ffprobe', '-v', 'error', ...args,
    '-of', 'default=noprint_wrappers=1:nokey=1', abs], {cwd: root, encoding: 'utf8'}).trim();
// duration comes from the VIDEO STREAM, not the container: X/Twitter files
// often carry a video track slightly shorter than the audio/container, and
// asking OffthreadVideo for frames past the track's end hangs the render.
const streamDur = parseFloat(probe(['-select_streams', 'v:0', '-show_entries', 'stream=duration']));
const containerDur = parseFloat(probe(['-show_entries', 'format=duration']));
let duration = Math.min(streamDur || Infinity, containerDur || Infinity);
const [w, h] = probe(['-select_streams', 'v:0', '-show_entries', 'stream=width,height']).split('\n').map(Number);

if (duration > maxSeconds) {
  console.log(`vídeo tem ${duration.toFixed(0)}s — cortando em ${maxSeconds}s`);
  const cut = `${abs}.cut.mp4`;
  execFileSync('npx', ['remotion', 'ffmpeg', '-i', abs, '-t', String(maxSeconds), '-c', 'copy', cut, '-y'],
    {cwd: root, stdio: 'ignore'});
  execFileSync('mv', [cut, abs]);
  duration = maxSeconds;
}

const props = {
  brand: BRAND.replace(/\s+/g, ''),
  headline,
  credit: credit ? `via ${credit}` : '',
  videoSrc: rel,
  videoDurationInFrames: Math.floor(duration * FPS) - 3, // safety margin off the tail
  videoAspect: w / h,
  position,
};

const output = join('out', `tweetclip-${slug}.mp4`);
console.log(`renderizando ${output} (${duration.toFixed(0)}s, ${w}x${h})`);
execFileSync('npx',
  ['remotion', 'render', 'TweetClip', output, '--timeout=900000', '--concurrency=1', '--offthreadvideo-cache-size-in-bytes=536870912', `--props=${JSON.stringify(props)}`],
  {cwd: root, stdio: 'inherit'});

const caption = `${headline}${credit ? `\n\n🎥 ${credit}` : ''}\n\nSiga @oagentico — o futuro da IA, todo dia, num clique.\n\n#inteligenciaartificial #ia #tecnologia #noticias`;
writeFileSync(join(root, 'out', `tweetclip-${slug}.caption.txt`), caption);
console.log(`\nPronto: packages/video/${output}`);
console.log(`Publicar: opensocial post --to instagram --text "$(cat out/tweetclip-${slug}.caption.txt)" --media packages/video/${output}`);
