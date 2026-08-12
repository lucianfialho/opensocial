import React from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export const BLUR_DURATION_IN_FRAMES = 30; // 1s at 30fps
export const HIGHLIGHT_DURATION_IN_FRAMES = 30;

// The article is designed at this fixed width and scaled to fit whatever
// canvas the composition uses (16:9, 4:5, 1:1, 9:16).
export const DESIGN_WIDTH = 1280;

/**
 * Left-to-right reveal progress (0..1) for the nth highlight. Highlights run
 * one after the other, starting right after the initial blur resolves.
 */
export const useHighlightProgress = (index: number): number => {
  const frame = useCurrentFrame();
  const start = BLUR_DURATION_IN_FRAMES + 4 + index * HIGHLIGHT_DURATION_IN_FRAMES;
  return interpolate(frame, [start, start + HIGHLIGHT_DURATION_IN_FRAMES], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
};

/**
 * Shared stage: white full-HD background, initial blur resolving over 1s,
 * subtle zoom and a ~15deg-per-axis 3D sweep from left to right across the
 * whole composition.
 */
export const ArticleMotion: React.FC<{
  children: React.ReactNode;
}> = ({children}) => {
  const frame = useCurrentFrame();
  const {durationInFrames, width: compositionWidth} = useVideoConfig();

  // Fill up to 90% of the canvas width, but never upscale past the design
  // size (keeps the 16:9 look identical to the original).
  const fit = Math.min(compositionWidth * 0.9, DESIGN_WIDTH) / DESIGN_WIDTH;

  const blur = interpolate(frame, [0, BLUR_DURATION_IN_FRAMES], [14, 0], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad),
  });
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.08]);
  const rotateY = interpolate(frame, [0, durationInFrames], [-7.5, 7.5]);
  const rotateX = interpolate(frame, [0, durationInFrames], [7.5, -7.5]);

  return (
    <AbsoluteFill style={{backgroundColor: 'white', filter: `blur(${blur}px)`}}>
      <AbsoluteFill
        style={{justifyContent: 'center', alignItems: 'center', perspective: 1600}}
      >
        <div
          style={{
            width: DESIGN_WIDTH,
            flexShrink: 0,
            transform: `scale(${fit * scale}) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
            transformStyle: 'preserve-3d',
          }}
        >
          {children}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
