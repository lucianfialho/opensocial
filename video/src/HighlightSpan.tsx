import React, {useLayoutEffect, useMemo, useRef, useState} from 'react';
import rough from 'roughjs';

const PAD_X = 10;
const PAD_Y = 2;

/** Inline rough.js marker behind a span of text, revealed by `progress`. */
export const HighlightSpan: React.FC<{
  progress: number;
  seed: number;
  children: string;
}> = ({progress, seed, children}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [dims, setDims] = useState<{w: number; h: number} | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    // offsetWidth/Height ignore CSS transforms, so the measurement is stable
    // across the zoom/rotation animation.
    if (el) setDims({w: el.offsetWidth, h: el.offsetHeight});
  }, [children]);

  const width = (dims?.w ?? 0) + PAD_X * 2;
  const height = (dims?.h ?? 0) + PAD_Y * 2;

  const paths = useMemo(() => {
    if (!dims) return [];
    const generator = rough.generator();
    const drawable = generator.rectangle(0, 0, width, height, {
      seed,
      roughness: 1.8,
      bowing: 1,
      stroke: 'none',
      fill: '#ffe234',
      fillStyle: 'zigzag',
      fillWeight: height * 0.24,
      hachureGap: height * 0.38,
      hachureAngle: -3,
    });
    return generator.toPaths(drawable);
  }, [dims, width, height, seed]);

  const clipId = `hl-${seed}`;
  return (
    <span ref={ref} style={{position: 'relative', whiteSpace: 'nowrap'}}>
      {children}
      {dims && progress > 0 ? (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{
            position: 'absolute',
            left: -PAD_X,
            top: -PAD_Y,
            mixBlendMode: 'multiply',
            pointerEvents: 'none',
          }}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={width * progress} height={height} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            {paths.map((p, i) => (
              <path
                key={i}
                d={p.d}
                fill={p.fill === 'none' ? 'none' : p.fill}
                stroke={p.stroke === 'none' ? 'none' : p.stroke}
                strokeWidth={p.strokeWidth}
              />
            ))}
          </g>
        </svg>
      ) : null}
    </span>
  );
};
