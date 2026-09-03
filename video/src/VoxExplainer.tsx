// Vox-style explainer: kinetic typography synced to narration word
// timestamps, brand-yellow marker highlights, cutout photo moments on a
// cream paper ground. Prototype for the editorial reel redesign.
import {loadFont} from '@remotion/fonts';
import React, {useMemo} from 'react';
import rough from 'roughjs';
import {
  AbsoluteFill, Audio, Img, interpolate, spring, staticFile,
  useCurrentFrame, useVideoConfig,
} from 'remotion';
import {z} from 'zod';

loadFont({family: 'Inter', url: staticFile('fonts/Inter-wght-800.ttf'), weight: '800'});
loadFont({family: 'Gofar Serif', url: staticFile('fonts/GofarSerif.otf')});

const CREAM = '#f5f0e7';
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

const roughPaths = (draw: (g: ReturnType<typeof rough.generator>) => unknown) => {
  const g = rough.generator();
  return g.toPaths(draw(g) as never);
};

/** Sketchy ellipse hugging its parent box (SVG stretches to the word). */
const ScribbleCircle: React.FC<{startSec: number; seed: number}> = ({startSec, seed}) => {
  const progress = useDrawOn(startSec, 14);
  const paths = useMemo(
    () => roughPaths((g) => g.ellipse(60, 24, 116, 46, {seed, roughness: 2.2, bowing: 2, stroke: INK, strokeWidth: 3.2, fill: 'none'})),
    [seed],
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
  const paths = useMemo(
    () =>
      roughPaths((g) =>
        g.curve([[905, 480], [968, 350], [925, 210], [830, 120]], {seed, roughness: 1.6, bowing: 1.5, stroke: INK, strokeWidth: 5, fill: 'none'}),
      ),
    [seed],
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
const Burst: React.FC<{startSec: number; seed: number}> = ({startSec, seed}) => {
  const progress = useDrawOn(startSec + 0.25, 10);
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
  const enter = spring({frame: frame - seg.startSec * fps, fps, config: {damping: 16, stiffness: 90}});
  if (!seg.image) return null;
  return (
    <div
      style={{
        position: 'absolute', top: 250, left: 70, right: 70, height: 780,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: enter,
        transform: `translateY(${(1 - enter) * 140}px) rotate(${-2.2 + enter * 0.7}deg)`,
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
      <Masthead brand={props.brand} />

      {active?.image ? <PhotoMoment seg={active} /> : null}
      {active?.image && active.arrow ? <ScribbleArrow startSec={active.startSec} seed={41} /> : null}

      {/* kinetic type zone: lower half when a photo is up, centered otherwise */}
      {active && !endCard ? (
        <div
          style={{
            position: 'absolute', left: 84, right: 84,
            top: active.image ? 1080 : 0, bottom: 170,
            display: 'flex', flexDirection: 'column', justifyContent: active.image ? 'flex-start' : 'center',
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

      {/* narration progress */}
      <div style={{position: 'absolute', left: 84, right: 84, bottom: 110, height: 8, background: 'rgba(20,20,18,0.12)', borderRadius: 4}}>
        <div style={{width: `${(frame / durationInFrames) * 100}%`, height: '100%', background: ACCENT, borderRadius: 4}} />
      </div>
    </AbsoluteFill>
  );
};
