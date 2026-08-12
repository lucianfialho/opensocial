import React, {useMemo} from 'react';
import rough from 'roughjs';

export interface HighlightBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Marker overshoot beyond the OCR box, in image pixels.
const PAD_X = 8;
const PAD_Y = 0;

/**
 * A rough.js highlighter stroke over a word box, revealed left to right by
 * `progress` (0..1). Rendered with a fixed seed so every frame draws the
 * exact same shape (Remotion requires deterministic rendering).
 */
export const RoughHighlight: React.FC<{
  box: HighlightBox;
  progress: number;
  seed: number;
  color?: string;
}> = ({box, progress, seed, color = '#ffe234'}) => {
  const x = box.x - PAD_X;
  const y = box.y - PAD_Y;
  const width = box.width + PAD_X * 2;
  const height = box.height + PAD_Y * 2;

  const paths = useMemo(() => {
    const generator = rough.generator();
    const drawable = generator.rectangle(x, y, width, height, {
      seed,
      roughness: 1.8,
      bowing: 1,
      stroke: 'none',
      fill: color,
      fillStyle: 'zigzag',
      fillWeight: height * 0.24,
      hachureGap: height * 0.38,
      hachureAngle: -3,
    });
    return generator.toPaths(drawable);
  }, [x, y, width, height, seed, color]);

  if (progress <= 0) {
    return null;
  }

  const clipId = `clip-${seed}`;
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={x - 10} y={y - 10} width={(width + 20) * progress} height={height + 20} />
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
    </g>
  );
};
