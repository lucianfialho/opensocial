import {loadFont} from '@remotion/fonts';
import React from 'react';
import {AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {REEL_SAFE_ZONE} from './safeArea';

loadFont({family: 'Gofar Serif', url: staticFile('fonts/GofarSerif.otf')});
loadFont({
  family: 'Parkinsans',
  url: staticFile('fonts/Parkinsans-ExtraBold.ttf'),
  weight: '800',
});

const CELL_X = 260;
const CELL_Y = 240;

/**
 * Brand layer over every scene: a faint diagonal grid of the Gofar "o"
 * plus the @handle pinned at the top of the reel-safe band. Sits above
 * the scenes and below the captions.
 */
export const Watermark: React.FC<{
  handle: string;
  whiteFromFrame: number;
  /** Handle vertical position (px at 1920 height); default: top safe band. */
  handleTop?: number;
}> = ({handle, whiteFromFrame, handleTop}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const scale = height / 1920;
  const white = frame >= whiteFromFrame;

  // Oversized rotated grid so the pattern reaches every corner.
  const cols = Math.ceil((width * 2) / CELL_X);
  const rows = Math.ceil((height * 2) / CELL_Y);
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          left: -width / 2,
          top: -height / 2,
          width: width * 2,
          height: height * 2,
          transform: 'rotate(-14deg)',
          opacity: 0.05,
        }}
      >
        {Array.from({length: rows}, (_, r) => (
          <div
            key={r}
            style={{
              position: 'absolute',
              top: r * CELL_Y,
              left: r % 2 === 0 ? 0 : CELL_X / 2,
              display: 'flex',
              gap: CELL_X - 120,
              fontFamily: '"Gofar Serif", Georgia, serif',
              fontSize: 120,
              lineHeight: 1,
              color: white ? '#fff' : '#000',
            }}
          >
            {Array.from({length: cols}, (_, c) => (
              <span key={c}>o</span>
            ))}
          </div>
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          top: (handleTop ?? REEL_SAFE_ZONE.top + 24) * scale,
          width: '100%',
          textAlign: 'center',
          fontFamily: '"Gofar Serif", Georgia, serif',
          fontSize: 46 * scale,
          letterSpacing: 1,
          color: white ? '#fff' : '#000',
        }}
      >
        {/* Gofar has no @ glyph — it would render as a blank box that
            shoves the visible ink off-center, so the wordmark drops it */}
        {handle.replace(/@/g, '')}
      </div>
    </AbsoluteFill>
  );
};
