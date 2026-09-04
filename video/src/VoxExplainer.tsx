// Vox-style explainer: kinetic typography synced to narration word
// timestamps, brand-yellow marker highlights, cutout photo moments on a
// cream paper ground. Prototype for the editorial reel redesign.
import {loadFont} from '@remotion/fonts';
import React, {useMemo} from 'react';
import rough from 'roughjs';
import {
  AbsoluteFill, Audio, Img, interpolate, random, spring, staticFile,
  useCurrentFrame, useVideoConfig,
} from 'remotion';
import {z} from 'zod';

loadFont({family: 'Inter', url: staticFile('fonts/Inter-wght-800.ttf'), weight: '800'});
loadFont({family: 'Gofar Serif', url: staticFile('fonts/GofarSerif.otf')});
loadFont({family: 'Lora', url: staticFile('fonts/Lora-ital-wght-0-400.ttf'), weight: '400'});

const CREAM = '#f6f1e0';
const INK = '#141412';
const ACCENT = '#ffe234';

export const voxExplainerSchema = z.object({
  brand: z.string(),
  handle: z.string(),
  audioSrc: z.string(),
  durationInFrames: z.number(),
  words: z.array(z.object({text: z.string(), start: z.number(), end: z.number()})),
  segments: z.array(
    z.object({
      text: z.string(),
      highlights: z.array(z.string()).default([]),
      big: z.string().nullable().default(null),
      circle: z.string().nullable().default(null),
      arrow: z.boolean().default(false),
      entity: z.object({nome: z.string(), logo: z.string().nullable(), logoW: z.number().optional(), logoH: z.number().optional()}).nullable().default(null),
      prop: z.object({src: z.string(), x: z.number(), y: z.number(), w: z.number(), rot: z.number().default(-4)}).nullable().default(null),
      ransom: z.string().nullable().default(null),
      image: z.string().nullable().default(null),
      credit: z.string().nullable().default(null),
    }),
  ),
});
export type VoxExplainerProps = z.infer<typeof voxExplainerSchema>;

export const calculateVoxMetadata = ({props}: {props: VoxExplainerProps}) => ({
  durationInFrames: props.durationInFrames,
});

type Seg = VoxExplainerProps['segments'][number] & {
  words: {text: string; start: number; end: number}[];
  startSec: number;
  endSec: number;
};

/** Splits the flat word-timing list back into per-segment slices. */
const sliceSegments = (props: VoxExplainerProps): Seg[] => {
  const out: Seg[] = [];
  let idx = 0;
  for (const seg of props.segments) {
    const count = seg.text.split(/\s+/).filter(Boolean).length;
    const words = props.words.slice(idx, idx + count);
    idx += count;
    out.push({
      ...seg,
      words,
      startSec: words[0]?.start ?? 0,
      endSec: words[words.length - 1]?.end ?? 0,
    });
  }
  return out;
};

/** Draw-on progress for a hand-drawn stroke starting at startSec. */
const useDrawOn = (startSec: number, durationFrames = 12) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return interpolate(frame - startSec * fps, [0, durationFrames], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
};

/** Vox jitter: posterized wiggle — a deterministic ±amp px offset that
 *  only changes every `every` frames (the AE posterizeTime+wiggle trick). */
const useJitter = (key: string, amp = 2.4, every = 5) => {
  const frame = useCurrentFrame();
  const step = Math.floor(frame / every);
  return {
    x: (random(`${key}-x-${step}`) - 0.5) * 2 * amp,
    y: (random(`${key}-y-${step}`) - 0.5) * 2 * amp,
  };
};

/** Boiling line: hand-drawn strokes redraw with a new seed every 8 frames. */
const useBoil = (every = 8) => {
  const frame = useCurrentFrame();
  return Math.floor(frame / every) * 131;
};

const roughPaths = (draw: (g: ReturnType<typeof rough.generator>) => unknown) => {
  const g = rough.generator();
  return g.toPaths(draw(g) as never);
};

/** Sketchy ellipse hugging its parent box (SVG stretches to the word). */
const ScribbleCircle: React.FC<{startSec: number; seed: number}> = ({startSec, seed}) => {
  const progress = useDrawOn(startSec, 14);
  const boil = useBoil();
  const paths = useMemo(
    () => roughPaths((g) => g.ellipse(60, 24, 116, 46, {seed: seed + boil, roughness: 2.2, bowing: 2, stroke: INK, strokeWidth: 3.2, fill: 'none'})),
    [seed, boil],
  );
  if (progress <= 0) return null;
  return (
    <svg viewBox="0 0 120 48" preserveAspectRatio="none" style={{position: 'absolute', left: '-10%', top: '-18%', width: '120%', height: '136%', overflow: 'visible', pointerEvents: 'none'}}>
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round"
          pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.min(1, progress * (i === 0 ? 1.15 : 0.95))} />
      ))}
    </svg>
  );
};

/** Hand-drawn curved arrow from the text zone up to the photo. */
const ScribbleArrow: React.FC<{startSec: number; seed: number}> = ({startSec, seed}) => {
  const progress = useDrawOn(startSec + 0.5, 16);
  const boil = useBoil();
  const paths = useMemo(
    () =>
      roughPaths((g) =>
        g.curve([[905, 480], [968, 350], [925, 210], [830, 120]], {seed: seed + boil, roughness: 1.6, bowing: 1.5, stroke: INK, strokeWidth: 5, fill: 'none'}),
      ),
    [seed, boil],
  );
  const headP = interpolate(progress, [0.85, 1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  if (progress <= 0) return null;
  return (
    <svg viewBox="0 0 1080 1920" style={{position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none'}}>
      <g transform="translate(0, 900)">
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill="none" stroke={INK} strokeWidth={4.6} strokeLinecap="round"
            pathLength={1} strokeDasharray={1} strokeDashoffset={1 - progress} />
        ))}
        <g opacity={headP}>
          <path d="M 866 158 L 828 116 L 886 106" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
    </svg>
  );
};

/** Emphasis dashes bursting around the big number. */
const Burst: React.FC<{startSec: number; seed: number}> = ({startSec, seed: baseSeed}) => {
  const progress = useDrawOn(startSec + 0.25, 10);
  const boil = useBoil();
  const seed = baseSeed + boil;
  const rays = useMemo(() => {
    const g = rough.generator();
    const out: {d: string}[] = [];
    const angles = [-155, -120, -85, -45, -15];
    angles.forEach((deg, i) => {
      const a = (deg * Math.PI) / 180;
      const r1 = 78, r2 = 128;
      const line = g.line(160 + Math.cos(a) * r1, 120 + Math.sin(a) * r1, 160 + Math.cos(a) * r2, 120 + Math.sin(a) * r2,
        {seed: seed + i, roughness: 1.8, stroke: INK, strokeWidth: 6, fill: 'none'});
      g.toPaths(line).forEach((p) => out.push({d: p.d}));
    });
    return out;
  }, [seed]);
  if (progress <= 0) return null;
  return (
    <svg viewBox="0 0 320 240" style={{position: 'absolute', left: -55, top: -60, width: 320, height: 240, overflow: 'visible', pointerEvents: 'none'}}>
      {rays.map((p, i) => (
        <path key={i} d={p.d} fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round"
          pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.min(1, progress * (1 + (i % 3) * 0.12))} />
      ))}
    </svg>
  );
};

/** Sketch-pad ground: sparse faint pencil lines, gently boiling. */
const SketchGround: React.FC = () => {
  const boil = useBoil(12);
  const paths = useMemo(() => {
    const g = rough.generator();
    const out: {d: string; w: number}[] = [];
    for (let i = 0; i < 12; i++) {
      const horiz = random(`sk-o-${i}`) > 0.35;
      const x = random(`sk-x-${i}`) * 1080;
      const y = random(`sk-y-${i}`) * 1920;
      const len = 140 + random(`sk-l-${i}`) * 420;
      const x2 = horiz ? x + len : x + (random(`sk-dx-${i}`) - 0.5) * 90;
      const y2 = horiz ? y + (random(`sk-dy-${i}`) - 0.5) * 60 : y + len;
      const line = g.line(x, y, x2, y2, {seed: 900 + i + boil, roughness: 2.6, bowing: 3, stroke: INK, strokeWidth: 2, fill: 'none'});
      g.toPaths(line).forEach((p) => out.push({d: p.d, w: 1.4 + random(`sk-w-${i}`) * 1.4}));
    }
    return out;
  }, [boil]);
  return (
    <svg viewBox="0 0 1080 1920" style={{position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.075, pointerEvents: 'none'}}>
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill="none" stroke={INK} strokeWidth={p.w} strokeLinecap="round" />
      ))}
    </svg>
  );
};

/** Film grain: turbulence re-seeded every few frames, overlay-blended. */
const Grain: React.FC = () => {
  const boil = useBoil(4);
  return (
    <svg viewBox="0 0 1080 1920" style={{position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.055, mixBlendMode: 'overlay' as const, pointerEvents: 'none'}}>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={boil} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="1080" height="1920" filter="url(#grain)" />
    </svg>
  );
};

/** Global luminance flicker, posterized and very subtle. */
const Flicker: React.FC = () => {
  const frame = useCurrentFrame();
  const step = Math.floor(frame / 5);
  const lum = (random(`flick-${step}`) - 0.5) * 0.05;
  return (
    <AbsoluteFill style={{backgroundColor: lum > 0 ? 'white' : 'black', opacity: Math.abs(lum), pointerEvents: 'none'}} />
  );
};

/** Entity sticker: pill with logo + name, slaps in with a spring.
 *  onPhoto mode lands it on the polaroid's corner, like a real sticker. */
const EntitySticker: React.FC<{
  entity: {nome: string; logo: string | null; logoW?: number; logoH?: number};
  startSec: number;
  onPhoto?: boolean;
}> = ({entity, startSec, onPhoto = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const jit = useJitter(`sticker-${entity.nome}`, 2);
  const delay = onPhoto ? 0.9 : 0.35;
  const enter = spring({frame: frame - (startSec + delay) * fps, fps, config: {damping: 11, stiffness: 190}});
  if (frame < (startSec + delay) * fps) return null;
  const w = entity.logoW ?? 58;
  const hgt = entity.logoH ?? 58;
  return (
    <div
      style={{
        position: 'absolute',
        top: onPhoto ? 296 : 250,
        left: onPhoto ? 96 : 84,
        display: 'flex', alignItems: 'center', gap: 18,
        background: 'white', borderRadius: 60, padding: '16px 34px 16px 22px',
        boxShadow: '0 14px 34px rgba(20,20,18,0.3)',
        transform: `translate(${jit.x}px, ${jit.y}px) scale(${0.4 + enter * 0.6}) rotate(${onPhoto ? -7 + enter * 2 : -10 + enter * 6}deg)`,
        transformOrigin: 'left center',
        opacity: Math.min(1, enter * 1.4),
      }}
    >
      {entity.logo ? <Img src={staticFile(entity.logo)} style={{width: w, height: hgt, objectFit: 'contain'}} /> : null}
      <div style={{fontSize: 34, fontWeight: 800, letterSpacing: 5, color: INK}}>{entity.nome.toUpperCase()}</div>
    </div>
  );
};

/** Ransom-note word: each letter on its own torn-paper tile, generated —
 *  no asset, no license, brand palette. Tiles boil and land one by one. */
const tornPoints = (key: string) => {
  // 3 jittered points per edge of the tile
  const j = (k: string, base: number) => base + (random(k) - 0.5) * 7;
  const pts: string[] = [];
  for (let i = 0; i <= 3; i++) pts.push(`${j(`${key}-t${i}x`, i * 33.3)}% ${j(`${key}-t${i}y`, 0)}%`);
  for (let i = 1; i <= 3; i++) pts.push(`${j(`${key}-r${i}x`, 100)}% ${j(`${key}-r${i}y`, i * 33.3)}%`);
  for (let i = 1; i <= 3; i++) pts.push(`${j(`${key}-b${i}x`, 100 - i * 33.3)}% ${j(`${key}-b${i}y`, 100)}%`);
  for (let i = 1; i < 3; i++) pts.push(`${j(`${key}-l${i}x`, 0)}% ${j(`${key}-l${i}y`, 100 - i * 33.3)}%`);
  return pts.join(', ');
};

const RANSOM_PALETTE: Array<[string, string]> = [[INK, CREAM], [CREAM, INK], [ACCENT, INK], [INK, ACCENT]];

const RansomWord: React.FC<{word: string; startSec: number}> = ({word, startSec}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const boil = useBoil(8);
  const letters = [...word];
  // tiles shrink so the whole word fits one line (usable width ~960px)
  const n = letters.filter((c) => c !== ' ').length;
  const tileW = Math.min(128, Math.floor((960 - 6 * (n - 1)) / n));
  const tileH = Math.round(tileW * 1.31);
  const fontSize = Math.round(tileW * 0.84);
  return (
    <div style={{position: 'absolute', left: 60, right: 60, top: 330, height: 560, display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 6, pointerEvents: 'none'}}>
      {letters.map((ch, i) => {
        if (ch === ' ') return <div key={i} style={{width: 46}} />;
        const enter = spring({frame: frame - (startSec + 0.35 + i * 0.1) * fps, fps, config: {damping: 12, stiffness: 220}});
        if (frame < (startSec + 0.35 + i * 0.1) * fps) return <div key={i} style={{width: 10}} />;
        const [bg, fg] = RANSOM_PALETTE[Math.floor(random(`rp-${word}-${i}`) * RANSOM_PALETTE.length)];
        const rot = (random(`rr-${word}-${i}`) - 0.5) * 11;
        const serif = random(`rf-${word}-${i}`) > 0.45;
        return (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: bg, color: fg,
              width: tileW, height: tileH,
              clipPath: `polygon(${tornPoints(`${word}-${i}-${boil}`)})`,
              transform: `rotate(${rot + (1 - enter) * 14}deg) scale(${0.5 + enter * 0.5})`,
              opacity: Math.min(1, enter * 1.5),
              fontFamily: serif ? 'Lora' : 'Inter',
              fontWeight: serif ? (400 as const) : (800 as const),
              fontSize,
              filter: 'drop-shadow(0 8px 16px rgba(20,20,18,0.3))',
            }}
          >
            {ch}
          </div>
        );
      })}
    </div>
  );
};

/** Halftone prop from the collage library: slaps in like a cutout. */
const PropSticker: React.FC<{
  prop: {src: string; x: number; y: number; w: number; rot: number};
  startSec: number;
}> = ({prop, startSec}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const jit = useJitter(`prop-${prop.src}`, 2.2);
  const enter = spring({frame: frame - (startSec + 0.55) * fps, fps, config: {damping: 12, stiffness: 160}});
  if (frame < (startSec + 0.55) * fps) return null;
  return (
    <Img
      src={staticFile(prop.src)}
      style={{
        position: 'absolute', left: prop.x, top: prop.y, width: prop.w,
        transform: `translate(${jit.x}px, ${jit.y}px) scale(${0.5 + enter * 0.5}) rotate(${prop.rot + (1 - enter) * 9}deg)`,
        transformOrigin: 'center',
        opacity: Math.min(1, enter * 1.5),
        filter: 'drop-shadow(0 12px 26px rgba(20,20,18,0.25))',
      }}
    />
  );
};

const Masthead: React.FC<{brand: string}> = ({brand}) => (
  <div style={{position: 'absolute', top: 84, left: 0, right: 0, display: 'flex', justifyContent: 'center', fontFamily: 'Gofar Serif', fontSize: 64, color: INK}}>
    {brand.replace(/\s+/g, '')}
  </div>
);

/** One kinetic-type word: pops on its narration timestamp. */
const KineticWord: React.FC<{
  word: {text: string; start: number};
  accent: boolean;
  big: boolean;
  circled: boolean;
  seed: number;
}> = ({word, accent, big, circled, seed}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const startFrame = word.start * fps;
  const pop = spring({frame: frame - startFrame, fps, config: {damping: 200, stiffness: 240}});
  const visible = frame >= startFrame;
  // the marker sweeps across the word right after it lands
  const sweep = interpolate(frame - startFrame, [2, 9], [0, 100], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return (
    <span
      style={{
        display: 'inline-block',
        opacity: visible ? pop : 0,
        transform: `translateY(${(1 - pop) * 26}px)`,
        marginRight: '0.28em',
        fontSize: big ? 230 : undefined,
        lineHeight: big ? 1 : undefined,
        letterSpacing: big ? -8 : undefined,
        backgroundImage: accent
          ? `linear-gradient(${ACCENT}, ${ACCENT})`
          : undefined,
        backgroundRepeat: 'no-repeat',
        backgroundSize: accent ? `${sweep}% 78%` : undefined,
        backgroundPosition: '0 62%',
        padding: accent ? '0 6px' : undefined,
        marginLeft: accent ? -6 : undefined,
        position: 'relative',
      }}
    >
      {word.text}
      {circled ? <ScribbleCircle startSec={word.start + 0.15} seed={seed} /> : null}
      {big ? <Burst startSec={word.start} seed={seed + 7} /> : null}
    </span>
  );
};

/** Cutout photo card: slides in with a spring, slightly rotated. */
const PhotoMoment: React.FC<{seg: Seg}> = ({seg}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const jit = useJitter('photo', 1.8);
  const enter = spring({frame: frame - seg.startSec * fps, fps, config: {damping: 16, stiffness: 90}});
  if (!seg.image) return null;
  return (
    <div
      style={{
        position: 'absolute', top: 250, left: 70, right: 70, height: 780,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: enter,
        transform: `translate(${jit.x}px, ${(1 - enter) * 140 + jit.y}px) rotate(${-2.2 + enter * 0.7}deg)`,
      }}
    >
      <div style={{background: 'white', padding: 18, paddingBottom: 46, boxShadow: '0 30px 60px rgba(20,20,18,0.28)', borderRadius: 6, position: 'relative'}}>
        <Img src={staticFile(seg.image)} style={{width: 860, height: 620, objectFit: 'cover', display: 'block'}} />
        {seg.credit ? (
          <div style={{position: 'absolute', bottom: 14, left: 20, fontFamily: 'Inter', fontWeight: 800, fontSize: 20, color: 'rgba(20,20,18,0.45)'}}>
            * {seg.credit}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const VoxExplainer: React.FC<VoxExplainerProps> = (props) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const textJit = useJitter('text-zone', 1.6);
  const t = frame / fps;
  const segs = sliceSegments(props);
  const active = segs.find((s, i) => t < (segs[i + 1]?.startSec ?? Infinity)) ?? segs[segs.length - 1];
  const endCard = frame > durationInFrames - fps * 1.4;

  const highlightSet = new Set(
    (active?.highlights ?? []).flatMap((h) => h.toLowerCase().split(/\s+/)),
  );
  const norm = (w: string) => w.toLowerCase().replace(/[.,!?;:"""]/g, '');

  return (
    <AbsoluteFill style={{backgroundColor: CREAM, fontFamily: 'Inter', fontWeight: 800 as const}}>
      {props.audioSrc !== 'none' ? <Audio src={staticFile(props.audioSrc)} /> : null}
      <SketchGround />
      <Masthead brand={props.brand} />

      {active?.image ? <PhotoMoment seg={active} /> : null}
      {active?.image && active.arrow ? <ScribbleArrow startSec={active.startSec} seed={41} /> : null}
      {active?.entity && !endCard ? <EntitySticker entity={active.entity} startSec={active.startSec} onPhoto={Boolean(active.image)} /> : null}
      {active?.prop && !endCard ? <PropSticker prop={active.prop} startSec={active.startSec} /> : null}
      {active?.ransom && !endCard ? <RansomWord word={active.ransom} startSec={active.startSec} /> : null}

      {/* kinetic type zone: lower half when a photo is up, centered otherwise */}
      {active && !endCard ? (
        <div
          style={{
            position: 'absolute', left: 84, right: 84,
            top: active.image ? 1080 : active.ransom ? 980 : 0, bottom: 170,
            display: 'flex', flexDirection: 'column', justifyContent: active.image || active.ransom ? 'flex-start' : 'center',
            transform: `translate(${textJit.x}px, ${textJit.y}px)`,
          }}
        >
          <div style={{display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', fontSize: active.big ? 84 : active.image ? 72 : 96, lineHeight: 1.14, letterSpacing: -2, color: INK}}>
            {active.words.map((w, i) => (
              <KineticWord
                key={`${active.text}-${i}`}
                word={w}
                accent={highlightSet.has(norm(w.text))}
                big={active.big !== null && norm(w.text) === norm(active.big)}
                circled={active.circle !== null && norm(w.text) === norm(active.circle ?? '')}
                seed={i + 1}
              />
            ))}
          </div>
        </div>
      ) : null}

      {endCard ? (
        <AbsoluteFill style={{backgroundColor: INK, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
          <div style={{fontFamily: 'Gofar Serif', fontSize: 110, color: CREAM}}>{props.brand.replace(/\s+/g, '')}</div>
          <div style={{fontSize: 40, color: ACCENT, marginTop: 18}}>{props.handle}</div>
        </AbsoluteFill>
      ) : null}

      <Grain />
      <Flicker />

      {/* narration progress */}
      <div style={{position: 'absolute', left: 84, right: 84, bottom: 110, height: 8, background: 'rgba(20,20,18,0.12)', borderRadius: 4}}>
        <div style={{width: `${(frame / durationInFrames) * 100}%`, height: '100%', background: ACCENT, borderRadius: 4}} />
      </div>
    </AbsoluteFill>
  );
};
